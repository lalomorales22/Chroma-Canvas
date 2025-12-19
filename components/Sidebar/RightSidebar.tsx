
import React, { useState, useRef, useEffect } from 'react';
import { EditorState, CanvasElement, ElementType, LibraryItem } from '../../types';
import { Icons } from '../Icon';
import { generateImage, generateVideo } from '../../services/geminiService';
import { DEFAULT_IMAGE_DURATION, DEFAULT_EMOJIS, DEFAULT_FONT_SIZE } from '../../constants';

interface RightSidebarProps {
  state: EditorState;
  dispatch: any;
  width: number;
  setWidth: (w: number) => void;
}

const TRANSITIONS = [
    { 
        name: "Fade Black", 
        src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", 
        color: "bg-black",
        icon: <div className="w-4 h-4 bg-black border border-white/20" />
    },
    { 
        name: "Fade White", 
        src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=", 
        color: "bg-white",
        icon: <div className="w-4 h-4 bg-white" />
    },
    { 
        name: "Glitch", 
        src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", 
        color: "bg-purple-950",
        icon: <Icons.Signal size={14} className="text-purple-400" />
    },
    { 
        name: "Spin", 
        src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", 
        color: "bg-blue-950",
        icon: <Icons.Maximize size={14} className="text-blue-400" />
    },
    { 
        name: "Swipe Left", 
        src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", 
        color: "bg-zinc-900",
        icon: <Icons.Back size={14} className="text-gray-400" />
    },
    { 
        name: "Swipe Right", 
        src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", 
        color: "bg-zinc-900",
        icon: <Icons.Back size={14} className="text-gray-400 rotate-180" />
    }
];

const getProceduralTransform = (el: CanvasElement, currentTime: number, canvasMode: 'landscape' | 'portrait', isPlaying: boolean) => {
    const progress = (currentTime - el.startTime) / el.duration;
    const clampedProgress = Math.max(0, Math.min(1, progress));
    
    let x = el.x || 0;
    let y = el.y || 0;
    let rotation = el.rotation;
    let scale = el.scale;
    let opacityMultiplier = 1;

    const canvasWidth = canvasMode === 'portrait' ? 720 : 1280;

    if (el.name === 'Spin') {
        rotation += clampedProgress * 360 * 2; 
        scale *= (1 - Math.abs(clampedProgress - 0.5) * 0.5); 
    } else if (el.name === 'Swipe Left') {
        x += canvasWidth - (clampedProgress * canvasWidth * 2);
    } else if (el.name === 'Swipe Right') {
        x += -canvasWidth + (clampedProgress * canvasWidth * 2);
    } else if (el.name === 'Glitch') {
        if (isPlaying) {
          x += (Math.random() - 0.5) * 60;
          y += (Math.random() - 0.5) * 30;
          scale *= (1 + (Math.random() - 0.5) * 0.1);
          rotation += (Math.random() - 0.5) * 5;
        }
    } else if (el.name === 'Fade Black' || el.name === 'Fade White') {
        // Triangular Dip: 0 -> 1 (at midpoint) -> 0
        opacityMultiplier = 1 - Math.abs(clampedProgress - 0.5) * 2;
    }
    
    return { x, y, rotation, scale, opacityMultiplier };
};

const getMediaDuration = (src: string, type: ElementType): Promise<number> => {
    return new Promise((resolve) => {
      if (type === ElementType.IMAGE || type === ElementType.TEXT) {
          resolve(DEFAULT_IMAGE_DURATION); 
          return;
      }
      const el = type === ElementType.VIDEO ? document.createElement('video') : document.createElement('audio');
      el.src = src;
      el.preload = 'metadata';
      el.onloadedmetadata = () => {
          const d = el.duration;
          resolve(Number.isFinite(d) ? d : DEFAULT_IMAGE_DURATION);
      };
      el.onerror = () => {
          resolve(DEFAULT_IMAGE_DURATION);
      };
    });
};

const MediaLayer: React.FC<{ 
    element: CanvasElement, 
    currentTime: number, 
    isPlaying: boolean, 
    canvasMode: 'landscape' | 'portrait',
    transform: { x: number, y: number, rotation: number, scale: number, opacityMultiplier: number },
    onRef?: (el: HTMLMediaElement | null) => void 
}> = ({ element, currentTime, isPlaying, canvasMode, transform, onRef }) => {
    const mediaRef = useRef<HTMLMediaElement>(null);
    const lastSyncTime = useRef<number>(-1);

    useEffect(() => {
        if (onRef && mediaRef.current) {
            onRef(mediaRef.current);
        }
    }, [onRef]);
    
    useEffect(() => {
        const media = mediaRef.current;
        if (!media) return;

        const rate = element.playbackRate || 1;
        if (media.playbackRate !== rate) {
            media.playbackRate = rate;
        }

        const timeOnTrack = currentTime - element.startTime;
        const isWithinTimelineBounds = timeOnTrack >= 0 && timeOnTrack <= element.duration;

        const targetMediaTime = element.trimStart + (timeOnTrack * rate);

        if (!isWithinTimelineBounds) {
            if (!media.paused) media.pause();
            return;
        }

        if (isPlaying) {
             if (media.paused && media.readyState >= 2) {
                 media.play().catch(e => { });
             }
             
             const diff = Math.abs(media.currentTime - targetMediaTime);
             const isJump = Math.abs(currentTime - lastSyncTime.current) > 1.0;

             if (diff > 0.4 || isJump) {
                 media.currentTime = targetMediaTime;
             }
        } else {
             if (!media.paused) media.pause();
             if (Math.abs(media.currentTime - targetMediaTime) > 0.1) {
                 media.currentTime = targetMediaTime;
             }
        }
        
        lastSyncTime.current = currentTime;
        
        const clipTime = timeOnTrack;
        let fadeMultiplier = 1;
        
        if (element.fadeIn > 0 && clipTime < element.fadeIn) {
            fadeMultiplier = Math.max(0, clipTime / element.fadeIn);
        }
        else if (element.fadeOut > 0 && clipTime > element.duration - element.fadeOut) {
            fadeMultiplier = Math.max(0, (element.duration - clipTime) / element.fadeOut);
        }

        media.volume = element.volume * fadeMultiplier;

    }, [currentTime, isPlaying, element.startTime, element.trimStart, element.duration, element.volume, element.fadeIn, element.fadeOut, element.playbackRate]);

    const timeOnTrack = currentTime - element.startTime;
    const isVisible = timeOnTrack >= 0 && timeOnTrack <= element.duration;
    
    if (element.type === ElementType.AUDIO) {
        return (
            <audio 
                ref={(el) => {
                    (mediaRef as any).current = el;
                    if (onRef) onRef(el);
                }}
                src={element.src} 
                crossOrigin="anonymous" 
                preload="auto" 
            />
        );
    }

    if (element.type === ElementType.VIDEO) {
        return (
            <div 
                className="absolute inset-0 flex items-center justify-center transition-all"
                style={{
                    opacity: isVisible ? element.opacity * transform.opacityMultiplier : 0,
                    pointerEvents: isVisible ? 'auto' : 'none',
                    transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale}) rotate(${transform.rotation}deg)`
                }}
            >
                <video 
                    ref={(el) => {
                        (mediaRef as any).current = el;
                        if (onRef) onRef(el);
                    }}
                    src={element.src} 
                    className="w-full h-full object-cover" 
                    muted={element.volume === 0}
                    crossOrigin="anonymous"
                    preload="auto"
                />
            </div>
        );
    }
    return null;
};

export const RightSidebar: React.FC<RightSidebarProps> = ({ state, dispatch, width, setWidth }) => {
  const [activeTab, setActiveTab] = useState<'gallery' | 'overlays' | 'transitions' | 'properties'>('gallery');
  const [aiPrompt, setAiPrompt] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [targetAspectRatio, setTargetAspectRatio] = useState<"16:9" | "9:16">("16:9");
  const resizeStartRef = useRef<number | null>(null);
  const resizeStartWidthRef = useRef<number | null>(null);
  const [galleryContextMenu, setGalleryContextMenu] = useState<{ x: number, y: number, id: string | null }>({ x: 0, y: 0, id: null });
  
  const [isVideosOpen, setIsVideosOpen] = useState(true);
  const [isImagesOpen, setIsImagesOpen] = useState(true);
  const [isAudioOpen, setIsAudioOpen] = useState(true);
  
  const [isEmojisOpen, setIsEmojisOpen] = useState(true);
  const [isGifsOpen, setIsGifsOpen] = useState(true);

  const overlayInputRef = useRef<HTMLInputElement>(null);
  const gifInputRef = useRef<HTMLInputElement>(null);

  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  
  const exportCanvasRef = useRef<HTMLCanvasElement>(null);
  const mediaElementsRef = useRef<Map<string, HTMLMediaElement>>(new Map());
  const exportAudioCtxRef = useRef<AudioContext | null>(null);
  const audioSourceNodeCache = useRef<WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>>(new WeakMap());

  const selectedElementId = state.selectedIds[0];
  const selectedElement = state.elements.find(e => e.id === selectedElementId);
  const isMultiSelect = state.selectedIds.length > 1;

  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [previewDrag, setPreviewDrag] = useState<{ id: string, startX: number, startY: number, initialElX: number, initialElY: number } | null>(null);

  const handlePreviewMouseDown = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      e.preventDefault();
      
      if (!state.selectedIds.includes(id)) {
          dispatch({ type: 'SELECT_ELEMENT', payload: id });
      }
      
      const el = state.elements.find(e => e.id === id);
      if (!el) return;

      setPreviewDrag({
          id,
          startX: e.clientX,
          startY: e.clientY,
          initialElX: el.x || 0,
          initialElY: el.y || 0
      });
  };

  useEffect(() => {
      const handleMouseMove = (e: MouseEvent) => {
          if (!previewDrag || !previewContainerRef.current) return;
          const rect = previewContainerRef.current.getBoundingClientRect();
          const canvasBaseWidth = state.canvasMode === 'landscape' ? 1280 : 720;
          const scaleFactor = canvasBaseWidth / rect.width;

          const deltaX = (e.clientX - previewDrag.startX) * scaleFactor;
          const deltaY = (e.clientY - previewDrag.startY) * scaleFactor;

          dispatch({
              type: 'UPDATE_ELEMENT',
              payload: {
                  id: previewDrag.id,
                  changes: {
                      x: previewDrag.initialElX + deltaX,
                      y: previewDrag.initialElY + deltaY
                  }
              }
          });
      };

      const handleMouseUp = () => {
          setPreviewDrag(null);
      };

      if (previewDrag) {
          window.addEventListener('mousemove', handleMouseMove);
          window.addEventListener('mouseup', handleMouseUp);
      }
      return () => {
          window.removeEventListener('mousemove', handleMouseMove);
          window.removeEventListener('mouseup', handleMouseUp);
      };
  }, [previewDrag, state.canvasMode, dispatch]);

  const togglePlay = () => dispatch({ type: 'TOGGLE_PLAY' });

  useEffect(() => {
      const handlePaste = async (e: ClipboardEvent) => {
          if (activeTab !== 'overlays') return;
          const items = e.clipboardData?.items;
          if (!items) return;

          for (let i = 0; i < items.length; i++) {
              if (items[i].type.indexOf("image") !== -1) {
                  const blob = items[i].getAsFile();
                  if (blob) {
                      const url = URL.createObjectURL(blob);
                      const newItem = {
                        id: Math.random().toString(36),
                        type: ElementType.IMAGE,
                        src: url,
                        name: "Pasted Image",
                        category: 'OVERLAY',
                        duration: DEFAULT_IMAGE_DURATION
                    };
                    dispatch({ type: 'ADD_LIBRARY_ITEM', payload: newItem });
                  }
              }
          }
      };

      window.addEventListener('paste', handlePaste);
      return () => window.removeEventListener('paste', handlePaste);
  }, [activeTab, dispatch]);

  const startResizing = (e: React.MouseEvent) => {
      e.preventDefault();
      resizeStartRef.current = e.clientX;
      resizeStartWidthRef.current = width;
      document.addEventListener('mousemove', handleResizing);
      document.addEventListener('mouseup', stopResizing);
  };

  const handleResizing = (e: MouseEvent) => {
      if (resizeStartRef.current === null || resizeStartWidthRef.current === null) return;
      const delta = resizeStartRef.current - e.clientX;
      const newWidth = Math.max(250, Math.min(600, resizeStartWidthRef.current + delta));
      setWidth(newWidth);
  };

  const stopResizing = () => {
      resizeStartRef.current = null;
      resizeStartWidthRef.current = null;
      document.removeEventListener('mousemove', handleResizing);
      document.removeEventListener('mouseup', stopResizing);
  };

  const updateProperty = (key: keyof CanvasElement, value: any) => {
    if (state.selectedIds.length === 0) return;
    dispatch({
      type: 'UPDATE_ELEMENTS',
      payload: { ids: state.selectedIds, changes: { [key]: value } }
    });
  };

  const handleSpeedChange = (newRate: number) => {
      if (!selectedElement) return;
      state.selectedIds.forEach(id => {
          const el = state.elements.find(e => e.id === id);
          if (el) {
             const currentRate = el.playbackRate || 1;
             const contentLength = el.duration * currentRate;
             const newDuration = contentLength / newRate;
             
             dispatch({
                type: 'UPDATE_ELEMENT',
                payload: { 
                    id: id, 
                    changes: { 
                        playbackRate: newRate,
                        duration: newDuration
                    } 
                }
             });
          }
      });
  };

  const handleAiGenerate = async (type: 'image' | 'text' | 'video') => {
      if (!aiPrompt) return;
      
      // Veo safety check
      if (type === 'video') {
        const hasKey = await (window as any).aistudio.hasSelectedApiKey();
        if (!hasKey) {
            await (window as any).aistudio.openSelectKey();
        }
      }

      setIsGenerating(true);

      const promptStr = aiPrompt;
      let finalPrompt: string = promptStr;
      let finalName: string = promptStr;
      
      if (type === 'text') {
          finalPrompt = `Typography design of the word "${promptStr}" in a colorful, fun, creative graffiti style, isolated on a white background. Vector art sticker.`;
          finalName = `Art: ${promptStr}`;
      }

      try {
          if (type === 'video') {
              const videoUrl = await generateVideo(promptStr, targetAspectRatio);
              if (videoUrl) {
                  const newItem: LibraryItem = {
                      id: Math.random().toString(36),
                      type: ElementType.VIDEO,
                      src: videoUrl,
                      name: `AI: ${promptStr}`,
                      category: 'VIDEO',
                      duration: 5 // Default for fast-preview
                  };
                  dispatch({ type: 'ADD_LIBRARY_ITEM', payload: newItem });
                  setAiPrompt('');
              }
          } else {
              const imageUrl = await generateImage(finalPrompt, targetAspectRatio);
              if (imageUrl) {
                  const newItem: LibraryItem = {
                      id: Math.random().toString(36),
                      type: ElementType.IMAGE,
                      src: imageUrl,
                      name: finalName,
                      category: 'IMAGE',
                      duration: DEFAULT_IMAGE_DURATION
                  };
                  dispatch({ type: 'ADD_LIBRARY_ITEM', payload: newItem });
                  setAiPrompt('');
              }
          }
      } catch (err) {
          console.error("AI Generation Error", err);
      }
      
      setIsGenerating(false);
  };

  const handleFileUpload = async (e: React.DragEvent<HTMLDivElement> | React.ChangeEvent<HTMLInputElement>, targetCategory: 'VIDEO' | 'IMAGE' | 'AUDIO' | 'OVERLAY' | 'GIF' = 'IMAGE') => {
      if (e.type === 'drop') {
          e.preventDefault();
          e.stopPropagation();
      }
      
      let files: File[] = [];
      if ('dataTransfer' in e && e.dataTransfer) {
          files = Array.from(e.dataTransfer.files);
      } else if ('target' in e && e.target) {
          const target = e.target as HTMLInputElement;
          if (target.files) {
              files = Array.from(target.files);
          }
      }
      
      for (const file of files) {
          const url = URL.createObjectURL(file);
          let type: ElementType = ElementType.IMAGE;
          let category = targetCategory;

          if (file.type === 'image/gif') {
              type = ElementType.IMAGE;
              category = 'GIF';
          }
          else if (targetCategory === 'OVERLAY' || targetCategory === 'GIF') {
               type = ElementType.IMAGE;
          } else {
              if (file.type.startsWith('video/')) {
                  type = ElementType.VIDEO;
                  category = 'VIDEO';
              } else if (file.type.startsWith('audio/')) {
                  type = ElementType.AUDIO;
                  category = 'AUDIO';
              }
          }

          const duration = await getMediaDuration(url, type);

          const newItem = {
              id: Math.random().toString(36),
              type,
              src: url,
              name: file.name,
              category,
              duration
          };
          dispatch({ type: 'ADD_LIBRARY_ITEM', payload: newItem });
      }
      
      if ('target' in e && e.target) {
          (e.target as HTMLInputElement).value = '';
      }
  };

  const handleExport = async () => {
      if (isExporting) return;
      const canvas = exportCanvasRef.current;
      if (!canvas) {
          alert("Export failed: Canvas not initialized.");
          return;
      }
      const mimeTypes = ["video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
      const mimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));
      if (!mimeType) {
          alert("Your browser does not support MediaRecorder export.");
          return;
      }

      setIsExporting(true);
      setExportProgress(0);
      if (state.isPlaying) dispatch({ type: 'TOGGLE_PLAY' });
      await new Promise(r => setTimeout(r, 200));

      const originalMediaStates = new Map<string, { muted: boolean, volume: number }>();
      const gainNodes = new Map<string, GainNode>();
      const contentEnd = state.elements.reduce((max, el) => Math.max(max, el.startTime + el.duration), 0);
      const exportDuration = Math.max(1, contentEnd);

      try {
        const imageUrls = new Set<string>(state.elements.filter(e => e.type === ElementType.IMAGE && e.src).map(e => e.src as string));
        const imageCache = new Map<string, HTMLImageElement>();
        
        await Promise.all(Array.from(imageUrls).map(url => new Promise<void>((resolve) => {
            if (!url) { resolve(); return; }
            const img = new Image();
            img.crossOrigin = "anonymous"; 
            img.src = url;
            img.onload = () => { imageCache.set(url, img); resolve(); };
            img.onerror = () => { console.warn("Failed to load image for export:", url); resolve(); };
        })));

        if (!exportAudioCtxRef.current) {
             exportAudioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        const audioCtx = exportAudioCtxRef.current;
        if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
        }

        const dest = audioCtx.createMediaStreamDestination();
        
        state.elements.forEach(el => {
            if (el.type === ElementType.AUDIO || el.type === ElementType.VIDEO) {
                const mediaEl = mediaElementsRef.current.get(el.id);
                if (mediaEl) {
                    try {
                        originalMediaStates.set(el.id, { muted: mediaEl.muted, volume: mediaEl.volume });
                        mediaEl.muted = false; 
                        mediaEl.volume = 1;
                        let source: MediaElementAudioSourceNode;
                        if (audioSourceNodeCache.current.has(mediaEl)) {
                            source = audioSourceNodeCache.current.get(mediaEl)!;
                            try { source.disconnect(); } catch(e) {} 
                        } else {
                            source = audioCtx.createMediaElementSource(mediaEl);
                            audioSourceNodeCache.current.set(mediaEl, source);
                        }
                        const gain = audioCtx.createGain();
                        gain.gain.value = el.volume; 
                        source.connect(gain);
                        gain.connect(dest);
                        gainNodes.set(el.id, gain);
                    } catch (e) {
                        console.warn("Audio mix warning:", e);
                    }
                }
            }
        });

        const stream = canvas.captureStream(30); 
        if (dest.stream.getAudioTracks().length > 0) {
            stream.addTrack(dest.stream.getAudioTracks()[0]);
        }

        const chunks: Blob[] = [];
        const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12000000 });
        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
        recorder.onstop = () => {
            originalMediaStates.forEach((val, id) => {
                const m = mediaElementsRef.current.get(id);
                if(m) { m.muted = val.muted; m.volume = val.volume; }
            });
            gainNodes.forEach(g => g.disconnect());
            const blob = new Blob(chunks, { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
            a.download = `chromacanvas_export_${Date.now()}.${ext}`;
            a.click();
            setIsExporting(false);
        };

        recorder.start();
        const ctx = canvas.getContext('2d', { alpha: false }); 
        if (!ctx) throw new Error("Could not get 2D context");
        const startTime = performance.now();
        
        const tick = () => {
            if (!isExporting && recorder.state !== 'recording') return;
            try {
                const now = performance.now();
                const elapsed = (now - startTime) / 1000;
                if (elapsed > exportDuration) { recorder.stop(); return; }
                setExportProgress(Math.min(100, Math.round((elapsed / exportDuration) * 100)));
                
                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                // Process ALL media elements for sync
                state.elements.forEach(el => {
                    if (el.type === ElementType.VIDEO || el.type === ElementType.AUDIO) {
                        const mediaEl = mediaElementsRef.current.get(el.id);
                        if (!mediaEl) return;

                        const isActive = elapsed >= el.startTime && elapsed < el.startTime + el.duration;
                        const gainNode = gainNodes.get(el.id);

                        if (isActive) {
                            const clipTime = elapsed - el.startTime;
                            const rate = el.playbackRate || 1;
                            const targetTime = el.trimStart + (clipTime * rate);
                            
                            mediaEl.playbackRate = rate;
                            if (Math.abs(mediaEl.currentTime - targetTime) > 0.2) {
                                mediaEl.currentTime = targetTime;
                            }
                            if (mediaEl.paused) {
                                mediaEl.play().catch(() => {});
                            }

                            // Calculate Fade Multiplier
                            let fadeMultiplier = 1;
                            if (el.fadeIn > 0 && clipTime < el.fadeIn) {
                                fadeMultiplier = Math.max(0, clipTime / el.fadeIn);
                            } else if (el.fadeOut > 0 && clipTime > el.duration - el.fadeOut) {
                                fadeMultiplier = Math.max(0, (el.duration - clipTime) / el.fadeOut);
                            }
                            if (gainNode) { gainNode.gain.value = el.volume * fadeMultiplier; }

                            // Render Video to Canvas
                            if (el.type === ElementType.VIDEO) {
                                const transform = getProceduralTransform(el, elapsed, state.canvasMode, true);
                                ctx.save();
                                const cx = canvas.width / 2 + transform.x;
                                const cy = canvas.height / 2 + transform.y;
                                ctx.translate(cx, cy);
                                ctx.rotate((transform.rotation * Math.PI) / 180);
                                ctx.scale(transform.scale, transform.scale);
                                ctx.globalAlpha = el.opacity * fadeMultiplier * transform.opacityMultiplier;

                                const vEl = mediaEl as HTMLVideoElement;
                                if (vEl.videoWidth) {
                                    const scale = Math.max(canvas.width / vEl.videoWidth, canvas.height / vEl.videoHeight);
                                    const w = vEl.videoWidth * scale; const h = vEl.videoHeight * scale;
                                    ctx.drawImage(vEl, -w/2, -h/2, w, h);
                                }
                                ctx.restore();
                            }
                        } else {
                            if (!mediaEl.paused) mediaEl.pause();
                        }
                    }
                });

                // Render Non-Media Elements
                const activeOverlays = state.elements
                  .filter(el => el.type !== ElementType.VIDEO && el.type !== ElementType.AUDIO)
                  .filter(el => elapsed >= el.startTime && elapsed < el.startTime + el.duration);

                for (const el of activeOverlays) {
                     const clipTime = elapsed - el.startTime;
                     let fadeMultiplier = 1;
                     if (el.fadeIn > 0 && clipTime < el.fadeIn) {
                         fadeMultiplier = Math.max(0, clipTime / el.fadeIn);
                     } else if (el.fadeOut > 0 && clipTime > el.duration - el.fadeOut) {
                         fadeMultiplier = Math.max(0, (el.duration - clipTime) / el.fadeOut);
                     }
                     
                     const transform = getProceduralTransform(el, elapsed, state.canvasMode, true);

                     ctx.save();
                     const cx = canvas.width / 2 + transform.x;
                     const cy = canvas.height / 2 + transform.y;
                     ctx.translate(cx, cy);
                     ctx.rotate((transform.rotation * Math.PI) / 180);
                     ctx.scale(transform.scale, transform.scale);
                     ctx.globalAlpha = el.opacity * fadeMultiplier * transform.opacityMultiplier;

                     if (el.type === ElementType.IMAGE) {
                         const imageSrc = el.src as string | undefined;
                         if (imageSrc) {
                             const img = imageCache.get(imageSrc);
                             if (img) { 
                                  const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
                                  const w = img.width * scale; const h = img.height * scale;
                                  ctx.drawImage(img, -w/2, -h/2, w, h);
                             }
                         }
                     } else if (el.type === ElementType.TEXT) {
                          ctx.font = `bold ${el.fontSize || 40}px Inter`;
                          ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                          ctx.fillText(el.text || '', 0, 0);
                     }
                     ctx.restore();
                }

                requestAnimationFrame(tick);
            } catch (err) { 
                console.error("Render loop error", err);
                requestAnimationFrame(tick); 
            }
        };
        tick();
      } catch (error) { 
          console.error("Export failure", error);
          setIsExporting(false); 
      }
  };

  const getFilteredLibrary = (category: string) => {
      return state.library.filter(item => item.category === category);
  };

  const handleGalleryContextMenu = (e: React.MouseEvent, id: string) => {
      e.preventDefault();
      setGalleryContextMenu({ x: e.clientX, y: e.clientY, id });
  };

  useEffect(() => {
      const closeMenu = () => setGalleryContextMenu({ x: 0, y: 0, id: null });
      if (galleryContextMenu.id) window.addEventListener('click', closeMenu);
      return () => window.removeEventListener('click', closeMenu);
  }, [galleryContextMenu.id]);

  return (
    <div 
        className="bg-black border-l border-zinc-800 flex flex-col h-full z-50 shadow-xl relative"
        style={{ width: width }}
    >
      <div 
        className="absolute left-0 top-0 bottom-0 w-1 bg-transparent hover:bg-lime-500 cursor-ew-resize z-[60]"
        onMouseDown={startResizing}
      />
      
      <div className="aspect-video bg-[#0f0f11] relative flex items-center justify-center overflow-hidden border-b border-zinc-800 shrink-0">
         <div 
            ref={previewContainerRef}
            className="w-full h-full relative"
            style={{ 
                width: state.canvasMode === 'portrait' ? 'auto' : '100%',
                height: state.canvasMode === 'portrait' ? '100%' : 'auto',
                aspectRatio: state.canvasMode === 'portrait' ? '9/16' : '16/9'
            }}
         >
             {state.elements
                .sort((a, b) => a.trackId - b.trackId)
                .map(el => {
                    const transform = getProceduralTransform(el, state.currentTime, state.canvasMode, state.isPlaying);
                    return (
                        <React.Fragment key={el.id}>
                            {(el.type === ElementType.VIDEO || el.type === ElementType.AUDIO) ? (
                                <MediaLayer 
                                    element={el} 
                                    currentTime={state.currentTime} 
                                    isPlaying={state.isPlaying}
                                    canvasMode={state.canvasMode}
                                    transform={transform}
                                    onRef={(ref) => {
                                        if (ref) mediaElementsRef.current.set(el.id, ref);
                                        else mediaElementsRef.current.delete(el.id);
                                    }}
                                />
                            ) : (
                                (state.currentTime >= el.startTime && state.currentTime < el.startTime + el.duration) && (
                                    <div 
                                        className="absolute inset-0 flex items-center justify-center transition-all cursor-move hover:ring-1 hover:ring-lime-500/50"
                                        onMouseDown={(e) => handlePreviewMouseDown(e, el.id)}
                                        style={{
                                            opacity: el.opacity * transform.opacityMultiplier,
                                            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale}) rotate(${transform.rotation}deg)`
                                        }}
                                    >
                                        {el.type === ElementType.IMAGE && (
                                            <img src={el.src} className="w-full h-full object-contain pointer-events-none" alt="" />
                                        )}
                                        {el.type === ElementType.TEXT && (
                                            <h1 
                                                className="font-bold text-white drop-shadow-lg text-center leading-tight whitespace-pre-wrap px-4 pointer-events-none" 
                                                style={{ 
                                                    fontFamily: 'Inter',
                                                    fontSize: `${el.fontSize || 40}px`
                                                }}
                                            >
                                                {el.text}
                                            </h1>
                                        )}
                                    </div>
                                )
                            )}
                        </React.Fragment>
                    );
                })
             }
         </div>
         
         <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4 z-20 pointer-events-none">
             <button onClick={() => dispatch({type: 'SET_TIME', payload: 0})} className="pointer-events-auto p-2 rounded-full bg-black/50 hover:bg-white/20 text-white backdrop-blur">
                 <div className="w-3 h-3 border-l-2 border-t-2 border-white transform -rotate-45 ml-1"></div>
             </button>
             <button onClick={togglePlay} className="pointer-events-auto p-3 rounded-full bg-white text-black hover:bg-gray-200 shadow-lg">
                 {state.isPlaying ? <Icons.Pause size={20} fill="black" /> : <Icons.Play size={20} fill="black" />}
             </button>
         </div>
      </div>

      <div className="flex border-b border-zinc-800 shrink-0 overflow-x-auto custom-scrollbar">
        <button 
            className={`flex-1 min-w-[70px] py-3 text-[10px] font-bold uppercase tracking-wider ${activeTab === 'gallery' ? 'text-white border-b-2 border-lime-500 bg-white/5' : 'text-gray-400 hover:text-white'}`}
            onClick={() => setActiveTab('gallery')}
        >
            Gallery
        </button>
         <button 
            className={`flex-1 min-w-[75px] py-3 text-[10px] font-bold uppercase tracking-wider ${activeTab === 'overlays' ? 'text-white border-b-2 border-lime-500 bg-white/5' : 'text-gray-400 hover:text-white'}`}
            onClick={() => setActiveTab('overlays')}
        >
            Overlays
        </button>
        <button 
            className={`flex-1 min-w-[85px] py-3 text-[10px] font-bold uppercase tracking-wider ${activeTab === 'transitions' ? 'text-white border-b-2 border-lime-500 bg-white/5' : 'text-gray-400 hover:text-white'}`}
            onClick={() => setActiveTab('transitions')}
        >
            Transitions
        </button>
        <button 
            className={`flex-1 min-w-[70px] py-3 text-[10px] font-bold uppercase tracking-wider ${activeTab === 'properties' ? 'text-white border-b-2 border-lime-500 bg-white/5' : 'text-gray-400 hover:text-white'}`}
            onClick={() => setActiveTab('properties')}
        >
            Adjust
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar relative bg-black">
        {activeTab === 'gallery' && (
             <div className="space-y-6">
                 <div className="bg-gradient-to-br from-zinc-900 to-black p-4 rounded-xl border border-zinc-800">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 text-lime-400">
                            <Icons.Magic className="w-4 h-4" />
                            <span className="text-xs font-bold uppercase tracking-wider">Gemini Studio</span>
                        </div>
                        {/* Aspect Ratio Toggle */}
                        <div className="flex gap-1 bg-black/40 p-1 rounded-lg border border-white/5">
                            <button 
                                onClick={() => setTargetAspectRatio("16:9")}
                                className={`p-1 rounded text-[10px] font-bold transition-all ${targetAspectRatio === '16:9' ? 'bg-lime-800 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                16:9
                            </button>
                            <button 
                                onClick={() => setTargetAspectRatio("9:16")}
                                className={`p-1 rounded text-[10px] font-bold transition-all ${targetAspectRatio === '9:16' ? 'bg-lime-800 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                9:16
                            </button>
                        </div>
                    </div>
                    <textarea 
                        className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-lime-500 resize-none h-16 mb-3"
                        placeholder="Describe an asset to generate..."
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                    />
                    <div className="flex flex-wrap gap-2">
                        <button 
                            disabled={isGenerating || !aiPrompt}
                            onClick={() => handleAiGenerate('image')}
                            className="flex-1 min-w-[80px] py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 rounded-lg text-xs font-medium text-white transition-colors flex items-center justify-center gap-2 border border-white/5"
                        >
                            <Icons.Image size={12} />
                            {isGenerating ? '...' : 'Img'}
                        </button>
                        <button 
                            disabled={isGenerating || !aiPrompt}
                            onClick={() => handleAiGenerate('video')}
                            className="flex-1 min-w-[80px] py-2 bg-lime-900 hover:bg-lime-800 disabled:opacity-50 rounded-lg text-xs font-medium text-lime-200 transition-colors flex items-center justify-center gap-2 border border-lime-700/50"
                        >
                            <Icons.Video size={12} />
                            {isGenerating ? '...' : 'Video'}
                        </button>
                        <button 
                            disabled={isGenerating || !aiPrompt}
                            onClick={() => handleAiGenerate('text')}
                            className="flex-1 min-w-[80px] py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 rounded-lg text-xs font-medium text-white transition-colors flex items-center justify-center gap-2 border border-white/5"
                        >
                             <Icons.Type size={12} />
                             {isGenerating ? '...' : 'Text Art'}
                        </button>
                    </div>
                    {isGenerating && (
                        <div className="mt-3 flex items-center gap-2 text-[10px] text-lime-500 font-bold animate-pulse">
                            <Icons.Magic className="w-3 h-3" />
                            Crafting your masterpiece...
                        </div>
                    )}
                </div>

                <div 
                    className="border-2 border-dashed border-zinc-800 rounded-xl p-6 text-center hover:border-lime-500/50 hover:bg-white/5 transition-colors cursor-pointer"
                    onDragOver={(e) => { e.preventDefault(); }}
                    onDrop={(e) => handleFileUpload(e, 'IMAGE')}
                >
                    <Icons.Download className="w-8 h-8 text-gray-500 mx-auto mb-2" />
                    <p className="text-xs text-gray-400">Drag & Drop media here<br/>to add to Gallery</p>
                </div>
                  <div className="space-y-4">
                        <div>
                        <button className="w-full flex items-center justify-between text-xs font-bold text-gray-500 uppercase tracking-wider mb-2" onClick={() => setIsVideosOpen(!isVideosOpen)}>
                            <span className="flex items-center gap-2"><Icons.Play size={10} /> Videos</span>
                            <span className="text-gray-600">{isVideosOpen ? '▼' : '▶'}</span>
                        </button>
                        {isVideosOpen && (
                            <div className="grid grid-cols-2 gap-2">
                                {getFilteredLibrary('VIDEO').map(item => (
                                    <div key={item.id} draggable onDragStart={(e) => { e.dataTransfer.setData('type', item.type); e.dataTransfer.setData('src', item.src); e.dataTransfer.setData('name', item.name); if(item.duration) e.dataTransfer.setData('duration', item.duration.toString())}} className="bg-black border border-zinc-800 p-2 rounded cursor-grab hover:border-lime-500 transition-colors group relative">
                                        <div className="aspect-video bg-[#0f0f11] mb-1 rounded overflow-hidden relative">
                                            <video src={item.src} className="w-full h-full object-cover opacity-60 group-hover:opacity-100" />
                                        </div>
                                        <p className="text-[10px] text-gray-300 truncate">{item.name}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                        </div>
                        <div>
                        <button className="w-full flex items-center justify-between text-xs font-bold text-gray-500 uppercase tracking-wider mb-2" onClick={() => setIsImagesOpen(!isImagesOpen)}>
                            <span className="flex items-center gap-2"><Icons.Image size={10} /> Images</span>
                            <span className="text-gray-600">{isImagesOpen ? '▼' : '▶'}</span>
                        </button>
                        {isImagesOpen && (
                            <div className="grid grid-cols-2 gap-2">
                                {getFilteredLibrary('IMAGE').map(item => (
                                    <div key={item.id} draggable onDragStart={(e) => { e.dataTransfer.setData('type', item.type); e.dataTransfer.setData('src', item.src); e.dataTransfer.setData('name', item.name); if(item.duration) e.dataTransfer.setData('duration', item.duration.toString())}} className="bg-black border border-zinc-800 p-2 rounded cursor-grab hover:border-lime-500 transition-colors group relative">
                                        <div className="aspect-video bg-[#0f0f11] mb-1 rounded overflow-hidden relative">
                                            <img src={item.src} className="w-full h-full object-cover opacity-80 group-hover:opacity-100" />
                                        </div>
                                        <p className="text-[10px] text-gray-300 truncate">{item.name}</p>
                                    </div>
                                ))}
                                {getFilteredLibrary('OVERLAY').map(item => (
                                    <div key={item.id} draggable onDragStart={(e) => { e.dataTransfer.setData('type', item.type); e.dataTransfer.setData('src', item.src); e.dataTransfer.setData('name', item.name); if(item.duration) e.dataTransfer.setData('duration', item.duration.toString())}} className="bg-black border border-zinc-800 p-2 rounded cursor-grab hover:border-lime-500 transition-colors group relative">
                                        <div className="aspect-video bg-[#0f0f11] mb-1 rounded overflow-hidden relative bg-white/5">
                                            <img src={item.src} className="w-full h-full object-contain p-1 opacity-100" />
                                        </div>
                                        <p className="text-[10px] text-gray-300 truncate">{item.name}</p>
                                        <button 
                                            onClick={(e) => handleGalleryContextMenu(e, item.id)}
                                            className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-400 bg-black/50 rounded-full p-0.5"
                                        >
                                            <Icons.X size={10} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        </div>
                          <div>
                        <button className="w-full flex items-center justify-between text-xs font-bold text-gray-500 uppercase tracking-wider mb-2" onClick={() => setIsAudioOpen(!isAudioOpen)}>
                            <span className="flex items-center gap-2"><Icons.Music size={10} /> Audio</span>
                            <span className="text-gray-600">{isAudioOpen ? '▼' : '▶'}</span>
                        </button>
                        {isAudioOpen && (
                             <div className="space-y-2">
                                {getFilteredLibrary('AUDIO').map(item => (
                                    <div key={item.id} draggable onDragStart={(e) => { e.dataTransfer.setData('type', item.type); e.dataTransfer.setData('src', item.src); e.dataTransfer.setData('name', item.name); if(item.duration) e.dataTransfer.setData('duration', item.duration.toString())}} className="bg-black border border-zinc-800 p-2 rounded cursor-grab hover:border-lime-500 transition-colors flex items-center gap-3 relative">
                                        <div className="w-8 h-8 bg-lime-900/20 rounded flex items-center justify-center shrink-0"><Icons.Music size={14} className="text-lime-500" /></div>
                                        <p className="text-xs text-gray-300 truncate flex-1">{item.name}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                        </div>
                  </div>
             </div>
        )}
        
        {activeTab === 'overlays' && (
             <div className="space-y-6">
                 <div>
                    <button className="w-full flex items-center justify-between text-xs font-bold text-gray-500 uppercase tracking-wider mb-3" onClick={() => setIsEmojisOpen(!isEmojisOpen)}>
                         <span>Emojis & PNGs</span>
                         <span className="text-gray-600">{isEmojisOpen ? '▼' : '▶'}</span>
                    </button>
                    {isEmojisOpen && (
                        <div className="space-y-3">
                            <input 
                                type="file" 
                                ref={overlayInputRef} 
                                className="hidden" 
                                accept="image/*"
                                multiple
                                onChange={(e) => handleFileUpload(e, 'OVERLAY')}
                            />
                            <div 
                                className="border-2 border-dashed border-lime-500/30 bg-lime-900/10 rounded-xl p-3 text-center hover:border-lime-500/80 hover:bg-lime-500/10 transition-colors cursor-pointer"
                                onClick={() => overlayInputRef.current?.click()}
                                onDragOver={(e) => { e.preventDefault(); }}
                                onDrop={(e) => handleFileUpload(e, 'OVERLAY')}
                            >
                                <Icons.Plus className="w-5 h-5 text-lime-400 mx-auto mb-1" />
                                <p className="text-[10px] text-lime-200">Drag or Click to Add PNGs</p>
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                                {getFilteredLibrary('OVERLAY').map(item => (
                                    <div key={item.id} draggable onDragStart={(e) => { e.dataTransfer.setData('type', item.type); e.dataTransfer.setData('src', item.src); e.dataTransfer.setData('name', item.name); if(item.duration) e.dataTransfer.setData('duration', item.duration.toString())}} className="aspect-square bg-zinc-900 border border-zinc-800 rounded p-1 cursor-grab hover:border-lime-500 relative group">
                                        <img src={item.src} className="w-full h-full object-contain" />
                                        <button 
                                            onClick={(e) => handleGalleryContextMenu(e, item.id)}
                                            className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-400 bg-black/50 rounded-full p-0.5"
                                        >
                                            <Icons.X size={10} />
                                        </button>
                                    </div>
                                ))}
                            </div>

                             <div className="grid grid-cols-4 gap-2">
                                 {DEFAULT_EMOJIS.map((emoji, idx) => (
                                     <button 
                                        key={idx}
                                        className="aspect-square bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded flex items-center justify-center text-xl transition-colors"
                                        onClick={() => {
                                            const newEl = {
                                                id: Math.random().toString(),
                                                type: ElementType.TEXT,
                                                name: `Emoji ${emoji}`,
                                                text: emoji,
                                                startTime: state.currentTime, 
                                                duration: 3,
                                                trackId: 0,
                                                volume: 0, opacity: 1, rotation: 0, scale: 1, trimStart: 0,
                                                fontSize: 100,
                                                fadeIn: 0, fadeOut: 0,
                                                playbackRate: 1,
                                                x: 0, y: 0
                                            };
                                            dispatch({ type: 'ADD_ELEMENT', payload: newEl });
                                        }}
                                     >
                                         {emoji}
                                     </button>
                                 ))}
                             </div>
                        </div>
                    )}
                 </div>

                 <div>
                     <button className="w-full flex items-center justify-between text-xs font-bold text-gray-500 uppercase tracking-wider mb-3" onClick={() => setIsGifsOpen(!isGifsOpen)}>
                         <span>Animated GIFs</span>
                         <span className="text-gray-600">{isGifsOpen ? '▼' : '▶'}</span>
                    </button>
                    {isGifsOpen && (
                        <div className="space-y-3">
                            <input 
                                type="file" 
                                ref={gifInputRef} 
                                className="hidden" 
                                accept="image/gif"
                                multiple
                                onChange={(e) => handleFileUpload(e, 'GIF')}
                            />
                            <div 
                                className="border-2 border-dashed border-purple-500/30 bg-purple-900/10 rounded-xl p-3 text-center hover:border-purple-500/80 hover:bg-purple-500/10 transition-colors cursor-pointer"
                                onClick={() => gifInputRef.current?.click()}
                                onDragOver={(e) => { e.preventDefault(); }}
                                onDrop={(e) => handleFileUpload(e, 'GIF')}
                            >
                                <Icons.Image className="w-5 h-5 text-purple-400 mx-auto mb-1" />
                                <p className="text-[10px] text-purple-200">Drag GIFs Here</p>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2">
                                {getFilteredLibrary('GIF').map(item => (
                                    <div key={item.id} draggable onDragStart={(e) => { e.dataTransfer.setData('type', item.type); e.dataTransfer.setData('src', item.src); e.dataTransfer.setData('name', item.name); if(item.duration) e.dataTransfer.setData('duration', item.duration.toString())}} className="aspect-square bg-zinc-900 border border-zinc-800 rounded overflow-hidden cursor-grab hover:border-purple-500 relative group">
                                        <img src={item.src} className="w-full h-full object-cover" />
                                         <button 
                                            onClick={(e) => handleGalleryContextMenu(e, item.id)}
                                            className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-400 bg-black/50 rounded-full p-0.5"
                                        >
                                            <Icons.X size={10} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                 </div>
            </div>
        )}

        {activeTab === 'transitions' && (
             <div className="space-y-4">
                 <div className="grid grid-cols-2 gap-3">
                    {TRANSITIONS.map((t, i) => (
                        <div 
                            key={i} 
                            draggable 
                            onDragStart={(e) => { 
                                e.dataTransfer.setData('type', ElementType.IMAGE); 
                                e.dataTransfer.setData('src', t.src); 
                                e.dataTransfer.setData('name', t.name); 
                                e.dataTransfer.setData('duration', '1');
                            }}
                            className={`group relative h-20 ${t.color} rounded-xl border border-zinc-800 hover:border-lime-500 cursor-grab flex flex-col items-center justify-center gap-2 overflow-hidden transition-all shadow-lg hover:shadow-lime-500/10`}
                        >
                            <div className="z-10 bg-black/40 p-2 rounded-full backdrop-blur-sm group-hover:scale-110 transition-transform">
                                {t.icon}
                            </div>
                            <span className="text-[10px] font-bold text-white z-10 tracking-tight uppercase group-hover:text-lime-400 transition-colors drop-shadow-md">{t.name}</span>
                            
                            {/* Visual Hint of Motion */}
                            <div className="absolute inset-0 opacity-0 group-hover:opacity-10 pointer-events-none transition-opacity bg-gradient-to-r from-white/0 via-white to-white/0 animate-[shimmer_2s_infinite]" />
                        </div>
                    ))}
                 </div>
                 
                 <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl mt-4">
                     <div className="flex items-center gap-2 mb-2 text-zinc-400">
                         <Icons.Magic size={12} />
                         <span className="text-[10px] font-bold uppercase">Pro Tip</span>
                     </div>
                     <p className="text-[10px] text-zinc-500 leading-relaxed">
                         Drag transitions onto the timeline. Place them on a track above your clips to create cinematic wipes and fades.
                     </p>
                 </div>
             </div>
        )}

        {activeTab === 'properties' && (
            <div className="space-y-6">
                {!selectedElement ? (
                    <div className="text-center py-10 text-gray-500 text-sm">
                        Select an element on the canvas to adjust its properties.
                    </div>
                ) : (
                    <>
                        {isMultiSelect && (
                            <div className="bg-lime-900/20 border border-lime-500/50 p-2 rounded text-xs text-lime-200 text-center mb-4">
                                Adjusting properties for {state.selectedIds.length} items
                            </div>
                        )}
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-white border-b border-zinc-800 pb-2 truncate">
                                {isMultiSelect ? 'Multiple Selection' : selectedElement.name}
                            </h3>

                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                    <label className="text-[10px] text-gray-400 uppercase">Pos X</label>
                                    <input 
                                        type="number" step="10"
                                        value={selectedElement.x || 0} 
                                        onChange={(e) => updateProperty('x', parseFloat(e.target.value))}
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-white"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-gray-400 uppercase">Pos Y</label>
                                    <input 
                                        type="number" step="10"
                                        value={selectedElement.y || 0} 
                                        onChange={(e) => updateProperty('y', parseFloat(e.target.value))}
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-white"
                                    />
                                </div>
                            </div>
                            
                            <div className="space-y-1">
                                <label className="text-[10px] text-gray-400 uppercase">Opacity</label>
                                <input 
                                    type="range" min="0" max="1" step="0.1" 
                                    value={selectedElement.opacity} 
                                    onChange={(e) => updateProperty('opacity', parseFloat(e.target.value))}
                                    className="w-full accent-lime-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] text-gray-400 uppercase">Scale</label>
                                <input 
                                    type="range" min="0.1" max="3" step="0.1" 
                                    value={selectedElement.scale} 
                                    onChange={(e) => updateProperty('scale', parseFloat(e.target.value))}
                                    className="w-full accent-lime-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] text-gray-400 uppercase">Rotation</label>
                                <input 
                                    type="range" min="-180" max="180" step="1" 
                                    value={selectedElement.rotation} 
                                    onChange={(e) => updateProperty('rotation', parseFloat(e.target.value))}
                                    className="w-full accent-lime-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>

                            {selectedElement.type === ElementType.TEXT && (
                                <div className="space-y-1 pt-2 border-t border-zinc-800">
                                    <label className="text-[10px] text-gray-400 uppercase flex items-center gap-2">
                                        <Icons.Type size={12} /> Font Size
                                    </label>
                                    <input 
                                        type="range" min="10" max="200" step="1" 
                                        value={selectedElement.fontSize || 40} 
                                        onChange={(e) => updateProperty('fontSize', parseFloat(e.target.value))}
                                        className="w-full accent-lime-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                                    />
                                    <div className="text-right text-[10px] text-gray-400">{selectedElement.fontSize || 40}px</div>
                                </div>
                            )}

                            {(selectedElement.type === ElementType.VIDEO || selectedElement.type === ElementType.AUDIO) && (
                                <div className="space-y-3 pt-2 border-t border-zinc-800">
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-gray-400 uppercase flex items-center gap-2">
                                            <Icons.Volume size={12} /> Volume
                                        </label>
                                        <input 
                                            type="range" min="0" max="1" step="0.1" 
                                            value={selectedElement.volume} 
                                            onChange={(e) => updateProperty('volume', parseFloat(e.target.value))}
                                            className="w-full accent-lime-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[10px] text-gray-400 uppercase flex items-center gap-2">
                                            <Icons.Move size={12} /> Speed (Playback Rate)
                                        </label>
                                        <div className="flex gap-2 items-center">
                                            <input 
                                                type="range" min="0.25" max="8" step="0.25" 
                                                value={selectedElement.playbackRate || 1} 
                                                onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
                                                className="flex-1 accent-lime-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                                            />
                                            <span className="text-[10px] text-white w-8">{selectedElement.playbackRate || 1}x</span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                            <label className="text-[10px] text-gray-400 uppercase">Fade In (s)</label>
                                            <input 
                                                type="number" min="0" max="10" step="0.5" 
                                                value={selectedElement.fadeIn || 0} 
                                                onChange={(e) => updateProperty('fadeIn', parseFloat(e.target.value))}
                                                className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-white"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] text-gray-400 uppercase">Fade Out (s)</label>
                                            <input 
                                                type="number" min="0" max="10" step="0.5" 
                                                value={selectedElement.fadeOut || 0} 
                                                onChange={(e) => updateProperty('fadeOut', parseFloat(e.target.value))}
                                                className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-white"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                             {selectedElement.type === ElementType.VIDEO && (
                                <div className="pt-4">
                                    <button 
                                        className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 text-xs text-white rounded border border-zinc-800 flex items-center justify-center gap-2"
                                        onClick={() => {
                                            dispatch({ type: 'EXTRACT_AUDIO', payload: null });
                                        }}
                                    >
                                        <Icons.Music size={12} /> Extract Audio (Mutes Video)
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        )}

      </div>

      <div className="p-4 border-t border-zinc-800 bg-black space-y-2 shrink-0">
          <div className="flex gap-2 mb-2">
            <button 
                onClick={() => dispatch({ type: 'SET_CANVAS_MODE', payload: 'landscape'})}
                className={`flex-1 flex items-center justify-center p-2 rounded ${state.canvasMode === 'landscape' ? 'bg-lime-900 text-lime-400' : 'bg-zinc-900 text-gray-400'}`}
            >
                <Icons.Landscape size={14} />
            </button>
            <button 
                onClick={() => dispatch({ type: 'SET_CANVAS_MODE', payload: 'portrait'})}
                className={`flex-1 flex items-center justify-center p-2 rounded ${state.canvasMode === 'portrait' ? 'bg-lime-900 text-lime-400' : 'bg-zinc-900 text-gray-400'}`}
            >
                <Icons.Portrait size={14} />
            </button>
          </div>
          <button 
            onClick={handleExport}
            disabled={isExporting}
            className="w-full py-3 bg-white hover:bg-gray-200 disabled:opacity-50 text-black font-bold rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
              <Icons.Download size={16} /> {isExporting ? 'Exporting...' : 'Export MP4'}
          </button>
      </div>

      {galleryContextMenu.id && (
          <div 
             className="fixed z-[100] bg-black border border-zinc-800 shadow-xl rounded py-1 w-32"
             style={{ top: galleryContextMenu.y, left: galleryContextMenu.x }}
          >
              <button 
                  className="w-full text-left px-4 py-2 text-xs text-red-400 hover:bg-red-900/20 flex items-center gap-2"
                  onClick={() => dispatch({ type: 'DELETE_LIBRARY_ITEM', payload: galleryContextMenu.id })}
              >
                  <Icons.Trash size={12} /> Delete Item
              </button>
          </div>
      )}

      <canvas 
          ref={exportCanvasRef} 
          width={state.canvasMode === 'portrait' ? 720 : 1280} 
          height={state.canvasMode === 'portrait' ? 1280 : 720}
          className="fixed top-0 left-0 -z-50 opacity-0 pointer-events-none" 
      />

      {isExporting && (
          <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center">
              <div className="bg-zinc-900 p-6 rounded-xl border border-zinc-800 w-80 text-center">
                  <h3 className="text-white font-bold mb-2">Rendering Video...</h3>
                  <div className="w-full h-2 bg-black rounded-full overflow-hidden mb-2">
                      <div className="h-full bg-lime-500 transition-all duration-300" style={{ width: `${exportProgress}%` }}></div>
                  </div>
                  <p className="text-xs text-gray-400">{exportProgress}% Complete</p>
                  <p className="text-[10px] text-gray-500 mt-2">Please do not close this window</p>
                  <button 
                    onClick={() => setIsExporting(false)}
                    className="mt-4 text-xs text-red-400 hover:underline"
                  >
                    Cancel
                  </button>
              </div>
          </div>
      )}

    </div>
  );
};
