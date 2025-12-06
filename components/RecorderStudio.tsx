
import React, { useState, useEffect, useRef } from 'react';
import { Icons } from './Icon';
import { ElementType, LibraryItem } from '../types';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

interface RecorderStudioProps {
  onBack: () => void;
  onSave: (items: LibraryItem[]) => void;
}

interface ActiveStream {
    id: string;
    type: 'SCREEN' | 'CAMERA' | 'AUDIO' | 'WHITEBOARD' | 'KEYBOARD' | 'GLB_GALLERY';
    stream: MediaStream;
    originalStream?: MediaStream; // Store original for chroma key toggle
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    deviceId?: string;
    chromaKey?: boolean;
    isDraggable?: boolean; // New: For whiteboard/piano mode
    muted?: boolean;
}

interface ThreeDConfig {
    models: { url: string, name: string }[];
    rotationSpeed: number; // 0.01 default
    slideDuration: number; // 10s default
}

// Green Screen Processing Helper
const createChromaKeyStream = (sourceStream: MediaStream): { stream: MediaStream, stop: () => void } => {
    const video = document.createElement('video');
    video.srcObject = sourceStream;
    video.muted = true;
    video.play();

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    let animationId: number;
    let isActive = true;

    const process = () => {
        if (!isActive) return;
        if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
            if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
            }
            ctx.drawImage(video, 0, 0);
            const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const l = frame.data.length / 4;

            for (let i = 0; i < l; i++) {
                const r = frame.data[i * 4 + 0];
                const g = frame.data[i * 4 + 1];
                const b = frame.data[i * 4 + 2];
                
                // Simple Green Screen Logic: Green dominates Red and Blue heavily
                if (g > 100 && g > r * 1.5 && g > b * 1.5) {
                    frame.data[i * 4 + 3] = 0; // Alpha 0
                }
            }
            ctx.putImageData(frame, 0, 0);
        }
        animationId = requestAnimationFrame(process);
    };
    
    process();
    
    const stream = canvas.captureStream(30);
    // Add audio tracks back from source
    sourceStream.getAudioTracks().forEach(track => stream.addTrack(track));

    return { 
        stream, 
        stop: () => { 
            isActive = false; 
            cancelAnimationFrame(animationId); 
            video.pause();
            video.srcObject = null;
        } 
    };
};

export const RecorderStudio: React.FC<RecorderStudioProps> = ({ onBack, onSave }) => {
    const [streams, setStreams] = useState<ActiveStream[]>([]);
    const [isRecording, setIsRecording] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamStatus, setStreamStatus] = useState<'offline' | 'connecting' | 'live' | 'error'>('offline');
    const [showStreamSettings, setShowStreamSettings] = useState(false);
    const [streamConfig, setStreamConfig] = useState({ url: 'rtmp://live.twitch.tv/app/', key: '' });
    const [recordingTime, setRecordingTime] = useState(0);
    
    // Devices
    const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
    const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedAudioDevice, setSelectedAudioDevice] = useState<string>('');

    // State for Resizing
    const [resizeState, setResizeState] = useState<{
        active: boolean;
        streamId: string | null;
        startX: number;
        startY: number;
        startWidth: number;
        startHeight: number;
    } | null>(null);

    // Context Menus
    const [contextMenu, setContextMenu] = useState<{
        visible: boolean;
        x: number;
        y: number;
        streamId: string | null;
        type: 'ITEM' | 'CANVAS';
    } | null>(null);

    // Piano Settings
    const [showPianoSettings, setShowPianoSettings] = useState<string | null>(null); // Stream ID
    const [soundMap, setSoundMap] = useState<Record<string, { buffer: AudioBuffer, name: string }>>({});
    
    // 3D Settings
    const [showThreeDSettings, setShowThreeDSettings] = useState<string | null>(null); // Stream ID
    const [threeDState, setThreeDState] = useState<Record<string, ThreeDConfig>>({});

    // Chroma Key Processors ref
    const chromaProcessors = useRef<Map<string, { stop: () => void }>>(new Map());

    // Refs for recording logic
    const mediaRecordersRef = useRef<Map<string, MediaRecorder>>(new Map());
    const recordedChunksRef = useRef<Map<string, Blob[]>>(new Map());
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const streamRecorderRef = useRef<MediaRecorder | null>(null);
    const streamChunksRef = useRef<Blob[]>([]);
    const wsRef = useRef<WebSocket | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    
    // Profile State
    const [profiles, setProfiles] = useState<Record<string, ActiveStream[]>>({});
    const [profileName, setProfileName] = useState('');
    const [isProfilesOpen, setIsProfilesOpen] = useState(true);

    // Auto-Save/Load Current Layout
    useEffect(() => {
        const saved = localStorage.getItem('chroma_studio_layout');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // We need to re-instantiate streams that can be recovered (Camera/Mic IDs)
                // However, MediaStreams cannot be serialized. We restore the *config* and placeholder streams.
                // Real device re-acquisition would happen here if we wanted full restoration, 
                // but for now we restore the windows and metadata.
                // For Camera/Mic, we might need to prompt or auto-reconnect. 
                // To keep it simple and robust: We restore the windows blank and let user re-select source OR auto-reconnect if deviceId exists.
                
                const restored = parsed.map((s: any) => ({
                    ...s,
                    stream: new MediaStream(), // Placeholders until reconnected
                    originalStream: undefined
                }));
                
                setStreams(restored);
                
                // Trigger reconnection for devices
                restored.forEach((s: ActiveStream) => {
                    if (s.type === 'CAMERA' && s.deviceId) {
                        navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: s.deviceId } } })
                            .then(stream => {
                                setStreams(prev => prev.map(p => p.id === s.id ? { ...p, stream, originalStream: stream } : p));
                            })
                            .catch(e => console.warn("Could not restore camera", e));
                    }
                    else if (s.type === 'AUDIO' && s.deviceId) {
                         navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: s.deviceId } } })
                            .then(stream => {
                                setStreams(prev => prev.map(p => p.id === s.id ? { ...p, stream } : p));
                            })
                            .catch(e => console.warn("Could not restore mic", e));
                    }
                     else if (s.type === 'SCREEN') {
                         // Screen share cannot be auto-restored due to security
                         // It stays as a placeholder window user can re-activate or delete
                    }
                });

            } catch(e) { console.error("Layout restore failed", e); }
        }
        
        const savedProfiles = localStorage.getItem('chroma_studio_profiles');
        if (savedProfiles) {
            setProfiles(JSON.parse(savedProfiles));
        }
    }, []);

    // Save layout on change
    useEffect(() => {
        if (streams.length > 0) {
            // strip streams
            const serializable = streams.map(s => ({
                ...s,
                stream: undefined,
                originalStream: undefined
            }));
            localStorage.setItem('chroma_studio_layout', JSON.stringify(serializable));
        }
    }, [streams]);

    const saveProfile = () => {
        if (!profileName) return;
        const serializable = streams.map(s => ({
                ...s,
                stream: undefined,
                originalStream: undefined
        }));
        const newProfiles = { ...profiles, [profileName]: serializable };
        setProfiles(newProfiles);
        localStorage.setItem('chroma_studio_profiles', JSON.stringify(newProfiles));
        setProfileName('');
    };

    const loadProfile = (name: string) => {
        const p = profiles[name];
        if (p) {
             const restored = p.map((s: any) => ({
                    ...s,
                    stream: new MediaStream(),
                    originalStream: undefined
            }));
            setStreams(restored);
            // Reconnect logic similar to initial load...
             restored.forEach((s: ActiveStream) => {
                    if (s.type === 'CAMERA' && s.deviceId) {
                        navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: s.deviceId } } })
                            .then(stream => {
                                setStreams(prev => prev.map(p => p.id === s.id ? { ...p, stream, originalStream: stream } : p));
                            })
                            .catch(e => console.warn("Could not restore camera", e));
                    }
             });
        }
    };

    // Get Devices
    useEffect(() => {
        const getDevices = async () => {
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                setAudioDevices(devices.filter(d => d.kind === 'audioinput'));
                setVideoDevices(devices.filter(d => d.kind === 'videoinput'));
                
                const defaultAudio = devices.find(d => d.kind === 'audioinput');
                if (defaultAudio && !selectedAudioDevice) setSelectedAudioDevice(defaultAudio.deviceId);
            } catch (e) {
                console.error("Error fetching devices:", e);
            }
        };
        getDevices();
        navigator.mediaDevices.addEventListener('devicechange', getDevices);
        return () => navigator.mediaDevices.removeEventListener('devicechange', getDevices);
    }, [selectedAudioDevice]);

    // --- Global Resize Handlers ---
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!resizeState || !resizeState.active || !resizeState.streamId) return;
            
            const deltaX = e.clientX - resizeState.startX;
            const deltaY = e.clientY - resizeState.startY;

            setStreams(prev => prev.map(s => {
                if (s.id === resizeState.streamId) {
                    return {
                        ...s,
                        width: Math.max(100, resizeState.startWidth + deltaX),
                        height: Math.max(50, resizeState.startHeight + deltaY)
                    };
                }
                return s;
            }));
        };

        const handleMouseUp = () => {
            if (resizeState?.active) {
                setResizeState(null);
            }
        };

        if (resizeState?.active) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [resizeState]);

    const addScreenShare = async (x: number, y: number) => {
        try {
            // Check support
            if (!navigator.mediaDevices?.getDisplayMedia) {
                alert("Screen sharing is not supported in this browser.");
                return;
            }

            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            const id = Math.random().toString(36).substr(2, 9);
            const track = stream.getVideoTracks()[0];
            
            track.onended = () => removeStream(id);
            const settings = track.getSettings();
            
            setStreams(prev => [...prev, {
                id,
                type: 'SCREEN',
                stream,
                originalStream: stream,
                name: track.label || 'Screen Share',
                x, y,
                width: settings.width ? Math.min(settings.width / 2, 400) : 400,
                height: settings.height ? Math.min(settings.height / 2, 225) : 225,
                isDraggable: true
            }]);
        } catch (e: any) {
            // Handle specific errors gracefully
            if (e.name === 'NotAllowedError') {
                console.log("Screen share was cancelled by the user.");
                return;
            }
            if (e.name === 'SecurityError' || e.message?.includes('permissions policy')) {
                alert("Screen sharing is blocked by the environment's permission policy. Ensure 'display-capture' is enabled.");
                return;
            }
            
            console.error("Screen share failed", e);
            alert(`Could not start screen share: ${e.message || 'Unknown error'}`);
        }
    };

    const addCamera = async (x: number, y: number, deviceId?: string) => {
        try {
            const constraints = {
                video: deviceId ? { deviceId: { exact: deviceId } } : true,
                audio: false
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            const id = Math.random().toString(36).substr(2, 9);
            
            const track = stream.getVideoTracks()[0];
            const settings = track.getSettings();
            
            setStreams(prev => [...prev, {
                id,
                type: 'CAMERA',
                stream,
                originalStream: stream,
                name: track.label || 'Webcam',
                x, y,
                width: settings.width ? settings.width / 3 : 320,
                height: settings.height ? settings.height / 3 : 240,
                deviceId: settings.deviceId,
                chromaKey: false,
                isDraggable: true
            }]);
        } catch (e) {
            console.error("Camera access failed", e);
        }
    };

    const addMicrophone = async (x: number, y: number, deviceId?: string) => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: { deviceId: deviceId || (selectedAudioDevice ? { exact: selectedAudioDevice } : undefined) },
                video: false 
            });
            const id = Math.random().toString(36).substr(2, 9);
            const track = stream.getAudioTracks()[0];
            const settings = track.getSettings();

            setStreams(prev => [...prev, {
                id,
                type: 'AUDIO',
                stream,
                name: track.label || 'Microphone',
                x, y,
                width: 200,
                height: 100,
                deviceId: settings.deviceId,
                isDraggable: true,
                muted: false
            }]);
        } catch (e) {
            console.error("Mic access failed", e);
        }
    };

    const addWhiteboard = (x: number, y: number) => {
        const id = Math.random().toString(36).substr(2, 9);
        setStreams(prev => [...prev, {
            id,
            type: 'WHITEBOARD',
            stream: new MediaStream(), // Placeholder
            name: 'Whiteboard',
            x, y,
            width: 500,
            height: 400,
            isDraggable: true
        }]);
    };

    const addPiano = (x: number, y: number) => {
        const id = Math.random().toString(36).substr(2, 9);
        setStreams(prev => [...prev, {
            id,
            type: 'KEYBOARD',
            stream: new MediaStream(), // Placeholder
            name: 'Synthesizer',
            x, y,
            width: 500,
            height: 250,
            isDraggable: true
        }]);
    };

    const add3DViewer = (x: number, y: number) => {
        const id = Math.random().toString(36).substr(2, 9);
        setStreams(prev => [...prev, {
            id,
            type: 'GLB_GALLERY',
            stream: new MediaStream(), // Placeholder
            name: '3D Gallery',
            x, y,
            width: 400,
            height: 400,
            isDraggable: true
        }]);
        setThreeDState(prev => ({ ...prev, [id]: { models: [], rotationSpeed: 0.01, slideDuration: 10 } }));
    };

    const updateWhiteboardStream = (id: string, stream: MediaStream) => {
        setStreams(prev => prev.map(s => s.id === id ? { ...s, stream } : s));
    };
    
    const setStreamDraggable = (id: string, isDraggable: boolean) => {
        setStreams(prev => prev.map(s => s.id === id ? { ...s, isDraggable } : s));
    };

    const toggleChromaKey = (id: string) => {
        const s = streams.find(st => st.id === id);
        if (!s || !s.originalStream || s.type !== 'CAMERA') return;

        if (s.chromaKey) {
            // Disable
            if (chromaProcessors.current.has(id)) {
                chromaProcessors.current.get(id)?.stop();
                chromaProcessors.current.delete(id);
            }
            setStreams(prev => prev.map(st => st.id === id ? { ...st, stream: st.originalStream!, chromaKey: false } : st));
        } else {
            // Enable
            const { stream: processedStream, stop } = createChromaKeyStream(s.originalStream);
            chromaProcessors.current.set(id, { stop });
            setStreams(prev => prev.map(st => st.id === id ? { ...st, stream: processedStream, chromaKey: true } : st));
        }
        setContextMenu(null);
    };

    const toggleMute = (id: string) => {
        setStreams(prev => prev.map(s => {
            if (s.id === id && s.type === 'AUDIO' && s.stream.getAudioTracks().length > 0) {
                 const newState = !s.muted;
                 s.stream.getAudioTracks()[0].enabled = !newState; // if muted, enabled is false
                 return { ...s, muted: newState };
            }
            return s;
        }));
        setContextMenu(null);
    };

    const switchStreamSource = async (streamId: string, deviceId: string) => {
        if (isRecording || isStreaming) return; 

        const existingStream = streams.find(s => s.id === streamId);
        if (!existingStream) return;

        // Cleanup
        if (chromaProcessors.current.has(streamId)) {
            chromaProcessors.current.get(streamId)?.stop();
            chromaProcessors.current.delete(streamId);
        }
        existingStream.stream.getTracks().forEach(t => t.stop());
        if (existingStream.originalStream) existingStream.originalStream.getTracks().forEach(t => t.stop());

        try {
            let newStream: MediaStream;
            let newName = existingStream.name;

            if (existingStream.type === 'CAMERA') {
                 newStream = await navigator.mediaDevices.getUserMedia({ 
                     video: { deviceId: { exact: deviceId } }, 
                     audio: false 
                 });
                 newName = newStream.getVideoTracks()[0].label;
            } else if (existingStream.type === 'AUDIO') {
                 newStream = await navigator.mediaDevices.getUserMedia({ 
                     audio: { deviceId: { exact: deviceId } }, 
                     video: false 
                 });
                 newName = newStream.getAudioTracks()[0].label;
            } else {
                return; 
            }

            setStreams(prev => prev.map(s => s.id === streamId ? {
                ...s,
                stream: newStream,
                originalStream: newStream,
                name: newName,
                deviceId: deviceId,
                chromaKey: false,
                muted: false
            } : s));

        } catch (e) {
            console.error("Failed to switch source", e);
        }
    };

    const removeStream = (id: string) => {
        if (chromaProcessors.current.has(id)) {
            chromaProcessors.current.get(id)?.stop();
            chromaProcessors.current.delete(id);
        }
        setStreams(prev => {
            const streamToRemove = prev.find(s => s.id === id);
            if (streamToRemove) {
                streamToRemove.stream.getTracks().forEach(t => t.stop());
                if(streamToRemove.originalStream) streamToRemove.originalStream.getTracks().forEach(t => t.stop());
            }
            return prev.filter(s => s.id !== id);
        });
        setThreeDState(prev => {
            const newState = { ...prev };
            delete newState[id];
            return newState;
        });
        setContextMenu(null);
    };

    const fitToSource = (id: string) => {
        setStreams(prev => prev.map(s => {
            if (s.id !== id) return s;
            const videoTrack = s.originalStream?.getVideoTracks()[0] || s.stream.getVideoTracks()[0];
            if (videoTrack) {
                const settings = videoTrack.getSettings();
                if (settings.width && settings.height) {
                    const ratio = settings.width / settings.height;
                    const newHeight = Math.min(400, settings.height);
                    const newWidth = newHeight * ratio;
                    return { ...s, width: newWidth, height: newHeight };
                }
            }
            return s;
        }));
        setContextMenu(null);
    };

    // --- Recording Logic ---

    const startRecording = () => {
        if (streams.length === 0) return;

        mediaRecordersRef.current.clear();
        recordedChunksRef.current.clear();

        streams.forEach(s => {
            // Prefer video/webm;codecs=vp9 for video, audio/webm for audio only
            // For streams like Piano/Whiteboard that are generated canvas streams, we check support
            let mimeType = s.type === 'AUDIO' ? 'audio/webm' : 'video/webm;codecs=vp9';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                 mimeType = s.type === 'AUDIO' ? 'audio/webm' : 'video/webm';
            }
            
            try {
                const recorder = new MediaRecorder(s.stream, { mimeType });
                recordedChunksRef.current.set(s.id, []);

                recorder.ondataavailable = (e) => {
                    if (e.data.size > 0) {
                        const chunks = recordedChunksRef.current.get(s.id) || [];
                        chunks.push(e.data);
                        recordedChunksRef.current.set(s.id, chunks);
                    }
                };

                recorder.start(1000); 
                mediaRecordersRef.current.set(s.id, recorder);
            } catch (e) {
                console.error(`Failed to record stream ${s.id} (${s.name})`, e);
            }
        });

        setIsRecording(true);
        setRecordingTime(0);
        timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    };

    const stopRecording = async () => {
        if (timerRef.current) clearInterval(timerRef.current);
        setIsRecording(false);

        const newLibraryItems: LibraryItem[] = [];
        const promises = Array.from(mediaRecordersRef.current.entries()).map(([id, recorder]) => {
            return new Promise<void>(resolve => {
                recorder.onstop = () => {
                    const chunks = recordedChunksRef.current.get(id) || [];
                    const streamInfo = streams.find(s => s.id === id);
                    if (!streamInfo) { resolve(); return; }

                    const type = streamInfo.type === 'AUDIO' ? 'audio/webm' : 'video/webm';
                    const blob = new Blob(chunks, { type });
                    const url = URL.createObjectURL(blob);
                    
                    newLibraryItems.push({
                        id: Math.random().toString(36),
                        type: streamInfo.type === 'AUDIO' ? ElementType.AUDIO : ElementType.VIDEO,
                        src: url,
                        name: `Rec ${streamInfo.name}`,
                        category: streamInfo.type === 'AUDIO' ? 'AUDIO' : 'VIDEO',
                        duration: recordingTime
                    });
                    resolve();
                };
                recorder.stop();
            });
        });

        await Promise.all(promises);
        onSave(newLibraryItems);
    };

    // --- Streaming Logic (Compositor + WebSocket) ---

    const startStreaming = () => {
        if (!streamConfig.url || !streamConfig.key) {
            alert("Please enter Stream URL and Key.");
            return;
        }

        setShowStreamSettings(false);
        setStreamStatus('connecting');

        // Setup Compositor
        const canvas = document.createElement('canvas');
        const container = containerRef.current;
        if (!container) return;
        
        canvas.width = 1920; 
        canvas.height = 1080;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        // Composite Loop
        let active = true;
        const tick = () => {
            if (!active) return;
            
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const containerWidth = container.offsetWidth;
            const containerHeight = container.offsetHeight;
            const scaleX = canvas.width / containerWidth;
            const scaleY = canvas.height / containerHeight;

            streams.forEach(s => {
                if (s.type === 'AUDIO') return;
                const element = document.getElementById(`source-${s.id}`) as HTMLVideoElement | HTMLCanvasElement;
                if (element) {
                    ctx.drawImage(element, s.x * scaleX, s.y * scaleY, s.width * scaleX, s.height * scaleY);
                }
            });

            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);

        // Capture Master Stream
        const masterStream = canvas.captureStream(30);
        streams.forEach(s => {
             s.stream.getAudioTracks().forEach(track => masterStream.addTrack(track));
        });

        // Try Connecting to Relay Server
        const ws = new WebSocket('ws://localhost:4000');
        wsRef.current = ws;

        ws.onopen = () => {
            console.log("Connected to Relay Server");
            ws.send(JSON.stringify(streamConfig));
            setStreamStatus('live');
        };

        ws.onerror = () => {
            console.warn("Relay Server not found. Falling back to local archive only.");
            setStreamStatus('error');
            // We continue recording locally even if stream fails
        };

        // Start Recording the Master Stream
        const mimeType = 'video/webm;codecs=vp9'; 
        const options = MediaRecorder.isTypeSupported(mimeType) ? { mimeType } : undefined;
        
        try {
            const recorder = new MediaRecorder(masterStream, options);
            streamChunksRef.current = [];
            
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    // 1. Save to local archive
                    streamChunksRef.current.push(e.data);
                    
                    // 2. Send to WebSocket Relay
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(e.data);
                    }
                }
            };
            
            recorder.onstop = () => {
                // Save the "Stream Archive"
                const blob = new Blob(streamChunksRef.current, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                onSave([{
                    id: Math.random().toString(36),
                    type: ElementType.VIDEO,
                    src: url,
                    name: `Stream Archive (${new Date().toLocaleTimeString()})`,
                    category: 'VIDEO',
                    duration: recordingTime
                }]);
                
                // Cleanup
                active = false;
                masterStream.getTracks().forEach(t => t.stop());
                if (ws.readyState === WebSocket.OPEN) ws.close();
            };

            recorder.start(100); // 100ms chunks for lower latency streaming
            streamRecorderRef.current = recorder;
            setIsStreaming(true);
            setRecordingTime(0);
            timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);

        } catch(e) {
            console.error("Stream recorder failed", e);
            setIsStreaming(false);
            active = false;
        }
    };

    const stopStreaming = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        setIsStreaming(false);
        setStreamStatus('offline');
        if (streamRecorderRef.current && streamRecorderRef.current.state !== 'inactive') {
            streamRecorderRef.current.stop();
        }
    };


    // --- Events ---

    const handleItemContextMenu = (e: React.MouseEvent, streamId: string) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({
            visible: true,
            x: e.clientX,
            y: e.clientY,
            streamId,
            type: 'ITEM'
        });
    };

    const handleCanvasContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        setContextMenu({
            visible: true,
            x: e.clientX,
            y: e.clientY,
            streamId: null,
            type: 'CANVAS'
        });
    };

    useEffect(() => {
        const close = () => setContextMenu(null);
        if (contextMenu) window.addEventListener('click', close);
        return () => window.removeEventListener('click', close);
    }, [contextMenu]);

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const type = e.dataTransfer.getData('sourceType');
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (type === 'SCREEN') addScreenShare(x, y);
        if (type === 'CAMERA') addCamera(x, y);
        if (type === 'MIC') addMicrophone(x, y);
        if (type === 'WHITEBOARD') addWhiteboard(x, y);
        if (type === 'KEYBOARD') addPiano(x, y);
        if (type === 'GLB_GALLERY') add3DViewer(x, y);
    };

    const handleDragStart = (e: React.DragEvent, id: string) => {
        // Prevent Drag if not draggable (e.g. Drawing Mode)
        const s = streams.find(st => st.id === id);
        if (s && s.isDraggable === false) {
            e.preventDefault();
            return;
        }

        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;
        
        const dragData = {
            streamId: id,
            offsetX,
            offsetY
        };
        e.dataTransfer.setData('application/json', JSON.stringify(dragData));
    };
    
    const handleCanvasDragOver = (e: React.DragEvent) => e.preventDefault();
    
    const handleCanvasDrop = (e: React.DragEvent) => {
        e.preventDefault();
        try {
            const jsonData = e.dataTransfer.getData('application/json');
            if (jsonData) {
                const data = JSON.parse(jsonData);
                if (data.streamId) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const newX = e.clientX - rect.left - data.offsetX;
                    const newY = e.clientY - rect.top - data.offsetY;

                    setStreams(prev => prev.map(s => {
                        if (s.id === data.streamId) {
                            return { ...s, x: newX, y: newY };
                        }
                        return s;
                    }));
                    return;
                }
            }
        } catch (err) {}
        handleDrop(e);
    };

    const formatTime = (secs: number) => {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <div className="absolute inset-0 bg-black flex flex-col z-50 animate-in fade-in duration-300">
            {/* Header */}
            <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-black">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} disabled={isRecording || isStreaming} className="p-2 hover:bg-white/10 rounded-full disabled:opacity-50">
                        <Icons.Back className="text-white" />
                    </button>
                    <h1 className="text-xl font-bold flex items-center gap-2 text-white">
                        <Icons.Layout className="text-lime-500" />
                        Studio
                    </h1>
                </div>
                
                <div className="flex items-center gap-4">
                    {(isRecording || isStreaming) && (
                        <div className="flex items-center gap-2 font-mono text-xl animate-pulse">
                            <div className={`w-3 h-3 rounded-full ${isStreaming ? 'bg-lime-500' : 'bg-lime-600'}`} />
                            <span className={isStreaming ? 'text-lime-500' : 'text-lime-600'}>
                                {isStreaming ? 'LIVE' : 'REC'} {formatTime(recordingTime)}
                            </span>
                        </div>
                    )}
                    
                    {!isRecording && !isStreaming && (
                        <>
                            <button 
                                onClick={() => setShowStreamSettings(true)}
                                className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-lime-400 px-4 py-2 rounded-full font-bold transition-all border border-zinc-800"
                            >
                                <Icons.Signal size={16} />
                                Stream
                            </button>
                            <button 
                                onClick={startRecording}
                                disabled={streams.length === 0}
                                className="flex items-center gap-2 bg-lime-700 hover:bg-lime-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2 rounded-full font-bold transition-all"
                            >
                                <Icons.Circle size={16} fill="currentColor" />
                                Start Recording
                            </button>
                        </>
                    )}
                    
                    {(isRecording || isStreaming) && (
                        <button 
                            onClick={isStreaming ? stopStreaming : stopRecording}
                            className="flex items-center gap-2 bg-white hover:bg-gray-200 text-black px-6 py-2 rounded-full font-bold transition-all"
                        >
                            <Icons.Square size={16} fill="currentColor" />
                            Stop {isStreaming ? 'Streaming' : 'Recording'}
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Source Palette Sidebar */}
                <div className="w-64 bg-black border-r border-zinc-800 p-4 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
                    {/* Profiles */}
                     <div>
                        <button className="w-full flex items-center justify-between text-xs font-bold text-gray-500 uppercase tracking-wider mb-2" onClick={() => setIsProfilesOpen(!isProfilesOpen)}>
                            <span className="flex items-center gap-2"><Icons.Layout size={10} /> Layout Profiles</span>
                            <span className="text-gray-600">{isProfilesOpen ? '▼' : '▶'}</span>
                        </button>
                        {isProfilesOpen && (
                            <div className="space-y-2 mb-4">
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        value={profileName} 
                                        onChange={(e) => setProfileName(e.target.value)} 
                                        placeholder="Profile Name"
                                        className="w-full bg-black/40 border border-zinc-800 rounded px-2 py-1 text-xs text-white"
                                    />
                                    <button onClick={saveProfile} className="bg-lime-800 px-2 rounded text-white text-xs hover:bg-lime-700">Save</button>
                                </div>
                                <div className="space-y-1">
                                    {Object.keys(profiles).map(name => (
                                        <div key={name} className="flex items-center justify-between text-xs text-gray-300 bg-zinc-900/50 p-1 px-2 rounded hover:bg-zinc-800 cursor-pointer" onClick={() => loadProfile(name)}>
                                            {name}
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); const newP = {...profiles}; delete newP[name]; setProfiles(newP); localStorage.setItem('chroma_studio_profiles', JSON.stringify(newP)); }}
                                                className="text-red-500 hover:text-red-300"
                                            >
                                                <Icons.Trash size={10} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div>
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Add Sources</h3>
                        <div className="space-y-3">
                            <div 
                                draggable 
                                onDragStart={(e) => e.dataTransfer.setData('sourceType', 'SCREEN')}
                                className="bg-black p-4 rounded-xl cursor-grab hover:bg-zinc-900 border border-zinc-800 hover:border-lime-500 transition-all group"
                            >
                                <div className="flex items-center gap-3 mb-2 text-lime-400 group-hover:text-lime-300">
                                    <Icons.Monitor />
                                    <span className="font-bold text-sm">Screen Share</span>
                                </div>
                                <p className="text-[10px] text-gray-400">Windows, Chrome Tabs, or Full Screen.</p>
                            </div>

                            <div 
                                draggable 
                                onDragStart={(e) => e.dataTransfer.setData('sourceType', 'CAMERA')}
                                className="bg-black p-4 rounded-xl cursor-grab hover:bg-zinc-900 border border-zinc-800 hover:border-lime-500 transition-all group"
                            >
                                <div className="flex items-center gap-3 mb-2 text-lime-400 group-hover:text-lime-300">
                                    <Icons.Video />
                                    <span className="font-bold text-sm">Webcam</span>
                                </div>
                                <p className="text-[10px] text-gray-400">Add video feed from camera.</p>
                            </div>

                            <div 
                                draggable 
                                onDragStart={(e) => e.dataTransfer.setData('sourceType', 'MIC')}
                                className="bg-black p-4 rounded-xl cursor-grab hover:bg-zinc-900 border border-zinc-800 hover:border-lime-500 transition-all group"
                            >
                                <div className="flex items-center gap-3 mb-2 text-lime-400 group-hover:text-lime-300">
                                    <Icons.Mic />
                                    <span className="font-bold text-sm">Microphone</span>
                                </div>
                                <p className="text-[10px] text-gray-400">Add audio track from input.</p>
                            </div>

                            <div 
                                draggable 
                                onDragStart={(e) => e.dataTransfer.setData('sourceType', 'WHITEBOARD')}
                                className="bg-black p-4 rounded-xl cursor-grab hover:bg-zinc-900 border border-zinc-800 hover:border-lime-500 transition-all group"
                            >
                                <div className="flex items-center gap-3 mb-2 text-lime-400 group-hover:text-lime-300">
                                    <Icons.Brush />
                                    <span className="font-bold text-sm">Whiteboard</span>
                                </div>
                                <p className="text-[10px] text-gray-400">Draw and sketch ideas live.</p>
                            </div>

                            <div 
                                draggable 
                                onDragStart={(e) => e.dataTransfer.setData('sourceType', 'KEYBOARD')}
                                className="bg-black p-4 rounded-xl cursor-grab hover:bg-zinc-900 border border-zinc-800 hover:border-lime-500 transition-all group"
                            >
                                <div className="flex items-center gap-3 mb-2 text-lime-400 group-hover:text-lime-300">
                                    <Icons.Keyboard />
                                    <span className="font-bold text-sm">Synthesizer</span>
                                </div>
                                <p className="text-[10px] text-gray-400">Playable piano.</p>
                            </div>

                            <div 
                                draggable 
                                onDragStart={(e) => e.dataTransfer.setData('sourceType', 'GLB_GALLERY')}
                                className="bg-black p-4 rounded-xl cursor-grab hover:bg-zinc-900 border border-zinc-800 hover:border-lime-500 transition-all group"
                            >
                                <div className="flex items-center gap-3 mb-2 text-lime-400 group-hover:text-lime-300">
                                    <Icons.Box />
                                    <span className="font-bold text-sm">3D Objects</span>
                                </div>
                                <p className="text-[10px] text-gray-400">Import & Showcase GLB/GLTF Models.</p>
                            </div>
                        </div>
                    </div>

                    <div>
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Default Input</h3>
                        <select 
                            value={selectedAudioDevice} 
                            onChange={(e) => setSelectedAudioDevice(e.target.value)}
                            className="w-full bg-black/40 border border-zinc-800 rounded px-2 py-2 text-xs text-white focus:outline-none focus:border-lime-500"
                        >
                            {audioDevices.map(d => (
                                <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${d.deviceId.substr(0,4)}`}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Main Studio Canvas */}
                <div 
                    ref={containerRef}
                    className="flex-1 relative bg-[#0f0f11] overflow-hidden"
                    style={{ backgroundImage: 'radial-gradient(#27272a 1px, transparent 1px)', backgroundSize: '24px 24px' }}
                    onDragOver={handleCanvasDragOver}
                    onDrop={handleCanvasDrop}
                    onContextMenu={handleCanvasContextMenu}
                >
                    {streams.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
                            <div className="text-center">
                                <Icons.Plus className="w-24 h-24 mx-auto mb-4 text-lime-500" />
                                <h2 className="text-4xl font-bold text-lime-500">Right Click to Add Sources</h2>
                            </div>
                        </div>
                    )}

                    {streams.map(stream => (
                        <div
                            key={stream.id}
                            className={`absolute bg-black rounded-lg shadow-2xl border border-zinc-800 group hover:border-lime-500 transition-colors ${stream.isDraggable === false ? 'cursor-default' : 'cursor-grab'}`}
                            style={{ 
                                left: stream.x, 
                                top: stream.y, 
                                width: stream.width, 
                                height: stream.height 
                            }}
                            draggable={stream.isDraggable !== false}
                            onDragStart={(e) => handleDragStart(e, stream.id)}
                            onContextMenu={(e) => handleItemContextMenu(e, stream.id)}
                        >
                            {/* Window Header */}
                            <div className="absolute top-0 left-0 right-0 h-6 bg-black/80 flex items-center justify-between px-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab border-b border-zinc-800">
                                <span className="text-[10px] text-white truncate max-w-[150px]">{stream.name}</span>
                                <div className="flex items-center gap-1">
                                    {stream.type === 'KEYBOARD' && (
                                        <button onClick={() => setShowPianoSettings(stream.id)} className="hover:text-lime-500 text-white"><Icons.Settings size={12} /></button>
                                    )}
                                    {stream.type === 'GLB_GALLERY' && (
                                        <button onClick={() => setShowThreeDSettings(stream.id)} className="hover:text-lime-500 text-white"><Icons.Settings size={12} /></button>
                                    )}
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); removeStream(stream.id); }}
                                        className="hover:text-red-500 text-white"
                                    >
                                        <Icons.X size={12} />
                                    </button>
                                </div>
                            </div>
                            
                            {/* Content */}
                            <div className="w-full h-full overflow-hidden relative">
                                {stream.type === 'AUDIO' ? (
                                    <div className={`w-full h-full flex flex-col items-center justify-center bg-black ${stream.muted ? 'opacity-50' : ''}`}>
                                        <Icons.Mic className={`w-8 h-8 mb-2 ${stream.muted ? 'text-gray-500' : 'text-lime-500 animate-pulse'}`} />
                                        <div className="w-1/2 h-1 bg-gray-800 rounded overflow-hidden">
                                            <div className={`h-full w-2/3 ${stream.muted ? 'bg-gray-500' : 'bg-lime-500 animate-[pulse_1s_ease-in-out_infinite]'}`} />
                                        </div>
                                        {stream.muted && <span className="text-[10px] text-red-400 mt-2 font-bold uppercase">Muted</span>}
                                    </div>
                                ) : stream.type === 'WHITEBOARD' ? (
                                    <WhiteboardWindow 
                                        id={`source-${stream.id}`}
                                        width={stream.width} 
                                        height={stream.height} 
                                        onStreamReady={(s) => updateWhiteboardStream(stream.id, s)}
                                        isDraggable={stream.isDraggable !== false}
                                    />
                                ) : stream.type === 'KEYBOARD' ? (
                                    <PianoWindow 
                                        id={`source-${stream.id}`}
                                        onStreamReady={(s) => updateWhiteboardStream(stream.id, s)}
                                        isPlayable={stream.isDraggable === false}
                                        soundMap={soundMap}
                                    />
                                ) : stream.type === 'GLB_GALLERY' ? (
                                    <ThreeDWindow 
                                        id={`source-${stream.id}`}
                                        onStreamReady={(s) => updateWhiteboardStream(stream.id, s)}
                                        config={threeDState[stream.id]}
                                    />
                                ) : (
                                    <StreamVideoPreview id={`source-${stream.id}`} stream={stream.stream} />
                                )}
                            </div>
                            
                            {/* Resize Handle */}
                            <div 
                                className="absolute bottom-0 right-0 w-6 h-6 cursor-se-resize flex items-center justify-center z-20"
                                onMouseDown={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    setResizeState({
                                        active: true,
                                        streamId: stream.id,
                                        startX: e.clientX,
                                        startY: e.clientY,
                                        startWidth: stream.width,
                                        startHeight: stream.height
                                    });
                                }}
                            >
                                <div className="w-2 h-2 border-r-2 border-b-2 border-white opacity-50 group-hover:opacity-100" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Stream Settings Modal */}
            {showStreamSettings && (
                <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center">
                    <div className="bg-black border border-zinc-800 rounded-xl p-6 w-96 shadow-2xl">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2"><Icons.Signal size={18} className="text-lime-500" /> Stream Settings</h2>
                            <button onClick={() => setShowStreamSettings(false)}><Icons.X size={18} className="text-gray-400 hover:text-white" /></button>
                        </div>
                        
                        <div className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs text-gray-400 uppercase">Stream URL (RTMP)</label>
                                <input 
                                    type="text" 
                                    placeholder="rtmp://live.twitch.tv/app/"
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded p-2 text-sm text-white focus:border-lime-500 focus:outline-none"
                                    value={streamConfig.url}
                                    onChange={e => setStreamConfig({...streamConfig, url: e.target.value})}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-gray-400 uppercase">Stream Key</label>
                                <input 
                                    type="password" 
                                    placeholder="••••••••••••"
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded p-2 text-sm text-white focus:border-lime-500 focus:outline-none"
                                    value={streamConfig.key}
                                    onChange={e => setStreamConfig({...streamConfig, key: e.target.value})}
                                />
                            </div>
                            
                            <div className="bg-zinc-900 border border-zinc-800 p-3 rounded text-[10px] text-gray-400">
                                <strong>Important:</strong> Browser-based RTMP streaming requires a <b>Local Relay Server</b>.
                                <br/><br/>
                                1. Install dependencies: <code>npm install ws</code>
                                <br/>
                                2. Run: <code>node streaming-server.js</code>
                                <br/>
                                3. Ensure <b>ffmpeg</b> is installed on your system.
                                <br/><br/>
                                <button 
                                    onClick={() => {
                                        navigator.clipboard.writeText("node streaming-server.js");
                                        alert("Command copied to clipboard!");
                                    }}
                                    className="mt-2 w-full py-1.5 bg-zinc-800 hover:bg-zinc-700 text-lime-400 rounded flex items-center justify-center gap-2 transition-colors border border-zinc-700"
                                >
                                    <Icons.Terminal size={12} /> Copy Start Command
                                </button>
                            </div>

                            <button 
                                onClick={startStreaming}
                                className="w-full bg-lime-700 hover:bg-lime-600 text-white font-bold py-2 rounded-lg flex items-center justify-center gap-2"
                            >
                                <Icons.Signal size={16} /> Go Live
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Piano Soundboard Settings Modal */}
            {showPianoSettings && (
                 <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center">
                    <div className="bg-black border border-zinc-800 rounded-xl p-6 w-96 shadow-2xl h-[400px] flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2"><Icons.Music size={18} className="text-lime-500" /> Sound Settings</h2>
                            <button onClick={() => setShowPianoSettings(null)}><Icons.X size={18} className="text-gray-400 hover:text-white" /></button>
                        </div>
                        <p className="text-xs text-gray-400 mb-4">Map custom .mp3 or .wav files to piano keys. If no file is set, the default synthesizer is used.</p>
                        
                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
                             {KEY_MAP.map(k => (
                                 <div key={k.key} className="flex items-center gap-2 bg-zinc-900 p-2 rounded border border-zinc-800">
                                     <div className="w-8 h-8 flex items-center justify-center bg-black border border-zinc-800 rounded text-lime-500 font-bold uppercase">{k.key}</div>
                                     <div className="flex-1 truncate text-xs text-gray-300">
                                         {soundMap[k.key] ? soundMap[k.key].name : 'Default Synth'}
                                     </div>
                                     <label className="cursor-pointer bg-zinc-800 hover:bg-lime-900 text-white p-1.5 rounded">
                                         <Icons.Upload size={14} />
                                         <input type="file" accept="audio/*" className="hidden" onChange={async (e) => {
                                             if (e.target.files && e.target.files[0]) {
                                                 const file = e.target.files[0];
                                                 const arrayBuffer = await file.arrayBuffer();
                                                 const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
                                                 const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
                                                 setSoundMap(prev => ({...prev, [k.key]: { buffer: audioBuffer, name: file.name }}));
                                                 ctx.close();
                                             }
                                         }} />
                                     </label>
                                     {soundMap[k.key] && (
                                         <button onClick={() => {
                                             const newMap = {...soundMap};
                                             delete newMap[k.key];
                                             setSoundMap(newMap);
                                         }} className="text-red-400 hover:text-red-300"><Icons.Trash size={14} /></button>
                                     )}
                                 </div>
                             ))}
                        </div>
                    </div>
                 </div>
            )}

            {/* 3D Settings Modal */}
            {showThreeDSettings && (
                <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center">
                    <div className="bg-black border border-zinc-800 rounded-xl p-6 w-96 shadow-2xl h-[500px] flex flex-col">
                         <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2"><Icons.Box size={18} className="text-lime-500" /> 3D Viewer Settings</h2>
                            <button onClick={() => setShowThreeDSettings(null)}><Icons.X size={18} className="text-gray-400 hover:text-white" /></button>
                        </div>
                        
                        <div className="space-y-4 mb-4">
                             <div className="space-y-1">
                                 <label className="text-xs text-gray-400 uppercase">Rotation Speed</label>
                                 <input 
                                    type="range" min="0" max="0.1" step="0.001"
                                    value={threeDState[showThreeDSettings]?.rotationSpeed || 0.01}
                                    onChange={(e) => setThreeDState(prev => ({
                                        ...prev, [showThreeDSettings]: { ...prev[showThreeDSettings], rotationSpeed: parseFloat(e.target.value) }
                                    }))}
                                    className="w-full accent-lime-500"
                                 />
                             </div>
                             <div className="space-y-1">
                                 <label className="text-xs text-gray-400 uppercase">Slide Duration (s)</label>
                                 <input 
                                    type="range" min="2" max="60" step="1"
                                    value={threeDState[showThreeDSettings]?.slideDuration || 10}
                                    onChange={(e) => setThreeDState(prev => ({
                                        ...prev, [showThreeDSettings]: { ...prev[showThreeDSettings], slideDuration: parseFloat(e.target.value) }
                                    }))}
                                    className="w-full accent-lime-500"
                                 />
                                 <div className="text-right text-[10px] text-gray-400">{threeDState[showThreeDSettings]?.slideDuration}s</div>
                             </div>
                        </div>

                        <label className="w-full bg-lime-900 hover:bg-lime-800 text-white py-2 rounded border border-lime-700 flex items-center justify-center gap-2 cursor-pointer mb-4">
                            <Icons.Upload size={14} /> Upload GLB File
                            <input type="file" accept=".glb,.gltf" multiple className="hidden" onChange={(e) => {
                                if (e.target.files) {
                                    const newFiles = Array.from(e.target.files as FileList).map((f: File) => ({ url: URL.createObjectURL(f), name: f.name }));
                                    setThreeDState(prev => ({
                                        ...prev, [showThreeDSettings]: { 
                                            ...prev[showThreeDSettings], 
                                            models: [...(prev[showThreeDSettings]?.models || []), ...newFiles]
                                        }
                                    }));
                                }
                            }} />
                        </label>

                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 border-t border-zinc-800 pt-2">
                             <h3 className="text-xs font-bold text-gray-500 uppercase">Library</h3>
                             {threeDState[showThreeDSettings]?.models.length === 0 && <p className="text-xs text-gray-600 italic">No models uploaded.</p>}
                             {threeDState[showThreeDSettings]?.models.map((m, idx) => (
                                 <div key={idx} className="flex items-center justify-between bg-zinc-900 p-2 rounded border border-zinc-800">
                                     <span className="text-xs text-white truncate max-w-[200px]">{m.name}</span>
                                     <button 
                                        className="text-red-400 hover:text-red-300"
                                        onClick={() => setThreeDState(prev => ({
                                            ...prev, [showThreeDSettings]: {
                                                ...prev[showThreeDSettings],
                                                models: prev[showThreeDSettings].models.filter((_, i) => i !== idx)
                                            }
                                        }))}
                                     >
                                         <Icons.Trash size={14} />
                                     </button>
                                 </div>
                             ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Error Toast */}
            {streamStatus === 'error' && isStreaming && (
                <div className="fixed bottom-4 left-4 bg-red-900/80 border border-red-500 text-white px-4 py-2 rounded-lg text-xs z-[100] animate-bounce">
                    ⚠️ Relay Server Offline. Streaming is simulated (Archive Only).
                </div>
            )}

            {/* Context Menu */}
            {contextMenu && contextMenu.visible && (
                <div 
                    className="fixed z-[100] bg-black border border-zinc-800 rounded-lg shadow-xl py-1 w-56 text-sm"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {contextMenu.type === 'CANVAS' ? (
                        <>
                             <div className="px-4 py-1 text-[10px] text-gray-500 font-bold uppercase">Add Source</div>
                             <button className="w-full text-left px-4 py-2 hover:bg-zinc-900 flex items-center gap-2" onClick={() => { addScreenShare(contextMenu.x, contextMenu.y); setContextMenu(null); }}>
                                 <Icons.Monitor size={14} /> Screen Share
                             </button>
                             <button className="w-full text-left px-4 py-2 hover:bg-zinc-900 flex items-center gap-2" onClick={() => { addCamera(contextMenu.x, contextMenu.y); setContextMenu(null); }}>
                                 <Icons.Video size={14} /> Webcam
                             </button>
                             <button className="w-full text-left px-4 py-2 hover:bg-zinc-900 flex items-center gap-2" onClick={() => { addMicrophone(contextMenu.x, contextMenu.y); setContextMenu(null); }}>
                                 <Icons.Mic size={14} /> Microphone
                             </button>
                             <button className="w-full text-left px-4 py-2 hover:bg-zinc-900 flex items-center gap-2" onClick={() => { addWhiteboard(contextMenu.x, contextMenu.y); setContextMenu(null); }}>
                                 <Icons.Brush size={14} /> Whiteboard
                             </button>
                             <button className="w-full text-left px-4 py-2 hover:bg-zinc-900 flex items-center gap-2" onClick={() => { addPiano(contextMenu.x, contextMenu.y); setContextMenu(null); }}>
                                 <Icons.Keyboard size={14} /> Synthesizer
                             </button>
                             <button className="w-full text-left px-4 py-2 hover:bg-zinc-900 flex items-center gap-2" onClick={() => { add3DViewer(contextMenu.x, contextMenu.y); setContextMenu(null); }}>
                                 <Icons.Box size={14} /> 3D Objects
                             </button>
                        </>
                    ) : (
                        <>
                            <button 
                                className="w-full text-left px-4 py-2 hover:bg-zinc-900 flex items-center gap-2 text-red-400"
                                onClick={() => removeStream(contextMenu.streamId!)}
                            >
                                <Icons.Trash size={14} /> Delete
                            </button>
                            
                            <button 
                                className="w-full text-left px-4 py-2 hover:bg-zinc-900 flex items-center gap-2"
                                onClick={() => fitToSource(contextMenu.streamId!)}
                            >
                                <Icons.Maximize size={14} /> Fit to Source
                            </button>

                            {/* Whiteboard/Piano Toggle */}
                            {(streams.find(s => s.id === contextMenu.streamId)?.type === 'WHITEBOARD' || streams.find(s => s.id === contextMenu.streamId)?.type === 'KEYBOARD') && (
                                <button 
                                    className="w-full text-left px-4 py-2 hover:bg-zinc-900 flex items-center gap-2 text-lime-400"
                                    onClick={() => {
                                        const s = streams.find(st => st.id === contextMenu.streamId);
                                        if (s) setStreamDraggable(s.id, !s.isDraggable); 
                                        setContextMenu(null);
                                    }}
                                >
                                    {streams.find(s => s.id === contextMenu.streamId)?.type === 'WHITEBOARD' ? <Icons.Brush size={14} /> : <Icons.Music size={14} />}
                                    {streams.find(s => s.id === contextMenu.streamId)?.isDraggable !== false ? (streams.find(s => s.id === contextMenu.streamId)?.type === 'WHITEBOARD' ? 'Enable Drawing' : 'Enable Playing') : (streams.find(s => s.id === contextMenu.streamId)?.type === 'WHITEBOARD' ? 'Disable Drawing' : 'Disable Playing')}
                                </button>
                            )}

                            {/* Mic Toggle & Selection */}
                            {streams.find(s => s.id === contextMenu.streamId)?.type === 'AUDIO' && (
                                <>
                                    <button 
                                        className="w-full text-left px-4 py-2 hover:bg-zinc-900 flex items-center gap-2 text-lime-400"
                                        onClick={() => toggleMute(contextMenu.streamId!)}
                                    >
                                        {streams.find(s => s.id === contextMenu.streamId)?.muted ? <Icons.Mic size={14} /> : <Icons.X size={14} />}
                                        {streams.find(s => s.id === contextMenu.streamId)?.muted ? 'Turn On' : 'Turn Off'}
                                    </button>
                                    <div className="h-[1px] bg-zinc-800 my-1" />
                                    <div className="px-4 py-1 text-[10px] text-gray-500 font-bold uppercase">Select Input</div>
                                    {audioDevices.map(d => (
                                        <button
                                            key={d.deviceId}
                                            className={`w-full text-left px-4 py-2 hover:bg-zinc-900 truncate text-xs ${streams.find(s => s.id === contextMenu.streamId)?.deviceId === d.deviceId ? 'text-lime-400' : 'text-white'}`}
                                            onClick={() => {
                                                switchStreamSource(contextMenu.streamId!, d.deviceId);
                                                setContextMenu(null);
                                            }}
                                        >
                                            {d.label || `Mic ${d.deviceId.substr(0,4)}`}
                                        </button>
                                    ))}
                                </>
                            )}
                            
                            {/* Chroma Key Toggle */}
                            {streams.find(s => s.id === contextMenu.streamId)?.type === 'CAMERA' && (
                                <button 
                                    className="w-full text-left px-4 py-2 hover:bg-zinc-900 flex items-center gap-2 text-lime-400"
                                    onClick={() => toggleChromaKey(contextMenu.streamId!)}
                                >
                                    <Icons.Magic size={14} /> {streams.find(s => s.id === contextMenu.streamId)?.chromaKey ? 'Disable' : 'Enable'} Chroma Key
                                </button>
                            )}

                            {/* Camera Switching */}
                            {streams.find(s => s.id === contextMenu.streamId)?.type === 'CAMERA' && videoDevices.length > 1 && (
                                <>
                                    <div className="h-[1px] bg-zinc-800 my-1" />
                                    <div className="px-4 py-1 text-[10px] text-gray-500 font-bold uppercase">Switch Camera</div>
                                    {videoDevices.map(d => (
                                        <button
                                            key={d.deviceId}
                                            className={`w-full text-left px-4 py-2 hover:bg-zinc-900 truncate text-xs ${streams.find(s => s.id === contextMenu.streamId)?.deviceId === d.deviceId ? 'text-lime-400' : 'text-white'}`}
                                            onClick={() => {
                                                switchStreamSource(contextMenu.streamId!, d.deviceId);
                                                setContextMenu(null);
                                            }}
                                        >
                                            {d.label || `Camera ${d.deviceId.substr(0,4)}`}
                                        </button>
                                    ))}
                                </>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

const StreamVideoPreview: React.FC<{ stream: MediaStream, id: string }> = ({ stream, id }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);
    return <video id={id} ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover bg-black" />;
};

const ThreeDWindow: React.FC<{
    id: string,
    onStreamReady: (s: MediaStream) => void,
    config?: ThreeDConfig
}> = ({ id, onStreamReady, config }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const rendererRef = useRef<any>(null);
    const sceneRef = useRef<any>(null);
    const cameraRef = useRef<any>(null);
    const modelRef = useRef<any>(null);
    const timerRef = useRef<any>(null);
    
    // Init Three
    useEffect(() => {
        if (!containerRef.current || !canvasRef.current) return;
        
        const w = 400; 
        const h = 400;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x000000); 
        
        const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 1000);
        camera.position.z = 5;

        const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, preserveDrawingBuffer: true, alpha: true });
        renderer.setSize(w, h);
        
        const light = new THREE.DirectionalLight(0xffffff, 2);
        light.position.set(2, 2, 5);
        scene.add(light);
        const ambient = new THREE.AmbientLight(0x404040, 2);
        scene.add(ambient);

        rendererRef.current = renderer;
        sceneRef.current = scene;
        cameraRef.current = camera;
        
        // Start Loop
        const animate = () => {
            requestAnimationFrame(animate);
            if (modelRef.current && config) {
                modelRef.current.rotation.y += config.rotationSpeed || 0.01;
            }
            renderer.render(scene, camera);
        };
        animate();
        
        // Capture Stream
        const stream = canvasRef.current.captureStream(30);
        onStreamReady(stream);

    }, []);

    // Load Model Logic
    useEffect(() => {
        if (!config || config.models.length === 0 || !sceneRef.current) return;
        
        // Safety check index
        const safeIndex = currentIndex % config.models.length;
        const item = config.models[safeIndex];
        
        const loader = new GLTFLoader();
        
        if (modelRef.current) {
            sceneRef.current.remove(modelRef.current);
            modelRef.current = null;
        }

        loader.load(item.url, (gltf: any) => {
            const model = gltf.scene;
            
            // Auto-Scale Logic
            const box = new THREE.Box3().setFromObject(model);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            
            // Calculate scale to fit within a 3x3x3 unit box (visible by default camera at z=5)
            const maxDim = Math.max(size.x, size.y, size.z);
            const targetSize = 3; 
            const scale = targetSize / maxDim;
            
            model.position.sub(center); // Center at 0,0,0
            model.scale.set(scale, scale, scale);
            
            sceneRef.current.add(model);
            modelRef.current = model;
        });
        
        if (timerRef.current) clearTimeout(timerRef.current);
        
        timerRef.current = setTimeout(() => {
            setCurrentIndex((prev) => (prev + 1) % config.models.length);
        }, (config.slideDuration || 10) * 1000); 

        return () => clearTimeout(timerRef.current);
    }, [config?.models, currentIndex, config?.slideDuration]);

    return (
        <div 
            ref={containerRef}
            className="w-full h-full relative"
        >
            <canvas id={id} ref={canvasRef} className="w-full h-full" />
            
            {(!config || config.models.length === 0) && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                     <div className="text-center text-gray-500">
                         <Icons.Box size={40} className="mx-auto mb-2 text-lime-900" />
                         <p className="text-xs">Use <Icons.Settings size={10} className="inline"/> to upload GLB files</p>
                     </div>
                </div>
            )}
            
            <div className="absolute bottom-2 left-2 text-[10px] text-lime-500 bg-black/50 px-2 rounded">
                {config && config.models.length > 0 ? `${config.models[currentIndex % config.models.length]?.name} (${(currentIndex % config.models.length) + 1}/${config.models.length})` : 'No Models'}
            </div>
        </div>
    );
};

const WhiteboardWindow: React.FC<{ 
    id: string,
    width: number, 
    height: number, 
    onStreamReady: (s: MediaStream) => void,
    isDraggable: boolean
}> = ({ id, width, height, onStreamReady, isDraggable }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [color, setColor] = useState('#ffffff');
    const [size, setSize] = useState(4);
    const [isEraser, setIsEraser] = useState(false);
    const [undoStack, setUndoStack] = useState<ImageData[]>([]);
    
    const isDrawingMode = !isDraggable;

    // Initialize stream
    useEffect(() => {
        if (canvasRef.current) {
            // Fill black background initially
            const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
            if (ctx) {
                ctx.fillStyle = '#000000';
                ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                // Save initial state
                setUndoStack([ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height)]);
            }
            const stream = canvasRef.current.captureStream(30);
            onStreamReady(stream);
        }
    }, []);

    // Drawing Logic
    const isDrawing = useRef(false);
    const lastPos = useRef({ x: 0, y: 0 });

    const saveState = () => {
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx && canvasRef.current) {
             const data = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
             setUndoStack(prev => [...prev.slice(-10), data]); // Keep last 10 states
        }
    };

    const handleUndo = () => {
        if (undoStack.length <= 1) return;
        const newStack = [...undoStack];
        newStack.pop(); // Remove current state
        const prevState = newStack[newStack.length - 1];
        setUndoStack(newStack);

        const ctx = canvasRef.current?.getContext('2d');
        if (ctx && prevState) {
            ctx.putImageData(prevState, 0, 0);
        }
    };

    const startDraw = (e: React.MouseEvent) => {
        if (!isDrawingMode) return;
        isDrawing.current = true;
        const rect = e.currentTarget.getBoundingClientRect();
        lastPos.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const draw = (e: React.MouseEvent) => {
        if (!isDrawing.current || !canvasRef.current || !isDrawingMode) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Scale coordinates to internal canvas resolution
        const scaleX = canvasRef.current.width / rect.width;
        const scaleY = canvasRef.current.height / rect.height;

        ctx.strokeStyle = isEraser ? '#000000' : color;
        ctx.lineWidth = size;
        ctx.lineCap = 'round';
        ctx.globalCompositeOperation = 'source-over'; // Eraser is just drawing black in this simple implementation
        
        ctx.beginPath();
        ctx.moveTo(lastPos.current.x * scaleX, lastPos.current.y * scaleY);
        ctx.lineTo(x * scaleX, y * scaleY);
        ctx.stroke();

        lastPos.current = { x, y };
    };

    const stopDraw = () => {
        if (isDrawing.current) {
            isDrawing.current = false;
            saveState();
        }
    };

    return (
        <div className="w-full h-full bg-[#1e1e1e] flex flex-row">
            {isDrawingMode && (
                <div className="w-12 bg-black flex flex-col items-center py-2 gap-3 shrink-0 border-r border-zinc-800 animate-in slide-in-from-left-2 overflow-y-auto custom-scrollbar">
                    <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-6 h-6 rounded cursor-pointer bg-transparent border-none shrink-0" disabled={isEraser} />
                    
                    <div className="w-full px-1 flex flex-col items-center gap-1">
                        <span className="text-[8px] text-gray-400">Size</span>
                        <input type="range" min="1" max="20" value={size} onChange={e => setSize(Number(e.target.value))} className="h-20 w-1 accent-lime-500 appearance-slider-vertical" style={{ writingMode: 'vertical-lr' }} />
                    </div>
                    
                    <button 
                            onClick={() => setIsEraser(!isEraser)}
                            className={`p-1 rounded shrink-0 ${isEraser ? 'bg-white text-black' : 'text-gray-400 hover:text-white'}`}
                            title="Eraser"
                    >
                        <div className="w-4 h-4 bg-current rounded-sm border border-current" />
                    </button>
                    
                    <button 
                        className="text-[10px] w-8 py-1 bg-zinc-800 text-white rounded hover:bg-zinc-700 disabled:opacity-50 shrink-0"
                        onClick={handleUndo}
                        disabled={undoStack.length <= 1}
                    >
                        Undo
                    </button>

                    <button 
                        className="text-[10px] w-8 py-1 bg-red-900/50 text-white rounded mt-auto hover:bg-red-900 shrink-0"
                        onClick={() => {
                            const ctx = canvasRef.current?.getContext('2d');
                            if (ctx && canvasRef.current) {
                                ctx.fillStyle = '#000000';
                                ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                                saveState();
                            }
                        }}
                    >
                        Clr
                    </button>
                </div>
            )}
            <div className={`flex-1 relative ${isDrawingMode ? 'cursor-crosshair' : 'cursor-default'}`}>
                <canvas 
                    id={id}
                    ref={canvasRef}
                    width={1280}
                    height={720}
                    className="w-full h-full bg-black touch-none"
                    onMouseDown={startDraw}
                    onMouseMove={draw}
                    onMouseUp={stopDraw}
                    onMouseLeave={stopDraw}
                />
            </div>
        </div>
    );
};

// Piano Logic
const NOTES: Record<string, number> = {
    'a': 261.63, // C4
    'w': 277.18, // C#4
    's': 293.66, // D4
    'e': 311.13, // D#4
    'd': 329.63, // E4
    'f': 349.23, // F4
    't': 369.99, // F#4
    'g': 392.00, // G4
    'y': 415.30, // G#4
    'h': 440.00, // A4
    'u': 466.16, // A#4
    'j': 493.88, // B4
    'k': 523.25  // C5
};

const KEY_MAP = [
    { key: 'a', note: 'C', type: 'white', x: 0 },
    { key: 'w', note: 'C#', type: 'black', x: 10 },
    { key: 's', note: 'D', type: 'white', x: 14.28 },
    { key: 'e', note: 'D#', type: 'black', x: 28 },
    { key: 'd', note: 'E', type: 'white', x: 28.56 },
    { key: 'f', note: 'F', type: 'white', x: 42.84 },
    { key: 't', note: 'F#', type: 'black', x: 52 },
    { key: 'g', note: 'G', type: 'white', x: 57.12 },
    { key: 'y', note: 'G#', type: 'black', x: 68 },
    { key: 'h', note: 'A', type: 'white', x: 71.4 },
    { key: 'u', note: 'A#', type: 'black', x: 84 },
    { key: 'j', note: 'B', type: 'white', x: 85.68 }
];

const PianoWindow: React.FC<{
    id: string,
    onStreamReady: (s: MediaStream) => void,
    isPlayable: boolean,
    soundMap: Record<string, { buffer: AudioBuffer, name: string }>
}> = ({ id, onStreamReady, isPlayable, soundMap }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const oscillatorsRef = useRef<Map<string, OscillatorNode>>(new Map());
    const gainNodesRef = useRef<Map<string, GainNode>>(new Map());
    const activeSourcesRef = useRef<Map<string, AudioBufferSourceNode>>(new Map());
    const destRef = useRef<MediaStreamAudioDestinationNode | null>(null);
    const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());

    // Init Audio Context & Canvas Stream
    useEffect(() => {
        if (!audioCtxRef.current) {
            audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            destRef.current = audioCtxRef.current.createMediaStreamDestination();
        }

        if (canvasRef.current && destRef.current) {
            // Setup Visuals
            const stream = canvasRef.current.captureStream(30);
            // Add Audio Track from Synth
            stream.addTrack(destRef.current.stream.getAudioTracks()[0]);
            onStreamReady(stream);
        }
        
        // Initial Draw
        drawPiano();
    }, []);

    const playNote = (key: string) => {
        if (!audioCtxRef.current || !destRef.current) return;
        if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();

        // Check for Custom Sound
        if (soundMap[key]) {
             if (activeSourcesRef.current.has(key)) return; 
             const source = audioCtxRef.current.createBufferSource();
             source.buffer = soundMap[key].buffer;
             // CONNECT TO DESTINATION (RECORDING) AND SPEAKERS (HEARING)
             source.connect(destRef.current);
             source.connect(audioCtxRef.current.destination);
             
             source.start();
             source.onended = () => {
                 activeSourcesRef.current.delete(key);
                 setActiveKeys(prev => {
                    const next = new Set(prev);
                    next.delete(key);
                    return next;
                 });
                 drawPiano(); // re-draw on finish
             };
             activeSourcesRef.current.set(key, source);
             setActiveKeys(prev => new Set(prev).add(key));
             return;
        }

        // Default Synth
        if (!NOTES[key]) return;
        if (oscillatorsRef.current.has(key)) return; // Already playing

        const osc = audioCtxRef.current.createOscillator();
        const gain = audioCtxRef.current.createGain();
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(NOTES[key], audioCtxRef.current.currentTime);
        
        gain.gain.setValueAtTime(0.2, audioCtxRef.current.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtxRef.current.currentTime + 1.5);

        osc.connect(gain);
        
        // CONNECT TO DESTINATION (RECORDING) AND SPEAKERS (HEARING)
        gain.connect(destRef.current);
        gain.connect(audioCtxRef.current.destination);
        
        osc.start();
        oscillatorsRef.current.set(key, osc);
        gainNodesRef.current.set(key, gain);
        
        setActiveKeys(prev => new Set(prev).add(key));
    };

    const stopNote = (key: string) => {
        // Stop Synth
        if (oscillatorsRef.current.has(key)) {
            const osc = oscillatorsRef.current.get(key);
            const gain = gainNodesRef.current.get(key);
            
            if (osc && gain && audioCtxRef.current) {
                gain.gain.cancelScheduledValues(audioCtxRef.current.currentTime);
                gain.gain.setValueAtTime(gain.gain.value, audioCtxRef.current.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, audioCtxRef.current.currentTime + 0.1);
                osc.stop(audioCtxRef.current.currentTime + 0.1);
            }

            oscillatorsRef.current.delete(key);
            gainNodesRef.current.delete(key);
        }

        // Note: We don't stop custom samples abruptly, let them ring out.
        
        setActiveKeys(prev => {
            const next = new Set(prev);
            next.delete(key);
            return next;
        });
    };

    useEffect(() => {
        const handleDown = (e: KeyboardEvent) => {
            if (!isPlayable) return;
            if ((NOTES[e.key] || soundMap[e.key]) && !e.repeat) {
                playNote(e.key);
            }
        };

        const handleUp = (e: KeyboardEvent) => {
            if (!isPlayable) return;
            if ((NOTES[e.key] || soundMap[e.key])) stopNote(e.key);
        };

        window.addEventListener('keydown', handleDown);
        window.addEventListener('keyup', handleUp);
        return () => {
            window.removeEventListener('keydown', handleDown);
            window.removeEventListener('keyup', handleUp);
        };
    }, [isPlayable, soundMap]);

    // Render Logic
    const drawPiano = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const w = canvas.width;
        const h = canvas.height;
        
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, w, h);
        
        const whiteKeyWidth = w / 7;

        // Draw White Keys
        KEY_MAP.filter(k => k.type === 'white').forEach((k, i) => {
            ctx.fillStyle = activeKeys.has(k.key) ? '#84cc16' : '#ffffff'; // Lime for active
            ctx.fillRect(i * whiteKeyWidth + 2, 2, whiteKeyWidth - 4, h - 4);
            
            // Label
            ctx.fillStyle = activeKeys.has(k.key) ? '#000' : '#888';
            ctx.font = '20px sans-serif';
            ctx.fillText(k.key.toUpperCase(), i * whiteKeyWidth + whiteKeyWidth/2 - 8, h - 20);
            
            // File Indicator
            if (soundMap[k.key]) {
                ctx.fillStyle = '#65a30d';
                ctx.beginPath();
                ctx.arc(i * whiteKeyWidth + whiteKeyWidth/2, h - 50, 4, 0, Math.PI * 2);
                ctx.fill();
            }
        });

        // Draw Black Keys
        const blackKeyWidth = whiteKeyWidth * 0.6;
        const blackKeyHeight = h * 0.6;
        
        KEY_MAP.filter(k => k.type === 'black').forEach((k) => {
             // Calculate position based on percentage x
             const x = (k.x / 100) * w; 
             ctx.fillStyle = activeKeys.has(k.key) ? '#4d7c0f' : '#000000'; // Dark Lime for active
             ctx.fillRect(x, 0, blackKeyWidth, blackKeyHeight);
             
             ctx.fillStyle = '#fff';
             ctx.font = '14px sans-serif';
             ctx.fillText(k.key.toUpperCase(), x + blackKeyWidth/2 - 5, blackKeyHeight - 10);
             
             if (soundMap[k.key]) {
                ctx.fillStyle = '#84cc16';
                ctx.beginPath();
                ctx.arc(x + blackKeyWidth/2, blackKeyHeight - 30, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        });
    };

    useEffect(() => {
        drawPiano();
    }, [activeKeys, soundMap]);

    return (
        <div className="w-full h-full bg-zinc-900 flex flex-col items-center justify-center">
            <canvas 
                id={id}
                ref={canvasRef}
                width={600}
                height={300}
                className="w-full h-full"
            />
            {!isPlayable && (
                 <div className="absolute inset-0 bg-black/40 flex items-center justify-center pointer-events-none">
                     <span className="text-white text-xs bg-black/50 px-2 py-1 rounded">Right Click to Play</span>
                 </div>
            )}
        </div>
    );
};
