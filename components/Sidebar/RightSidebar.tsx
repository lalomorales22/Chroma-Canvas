
import React, { useState, useRef, useEffect } from 'react';
import { EditorState, CanvasElement, ElementType, LibraryItem } from '../../types';
import { Icons } from '../Icon';
import { generateImage } from '../../services/geminiService';
import { DEFAULT_IMAGE_DURATION, DEFAULT_EMOJIS, DEFAULT_FONT_SIZE } from '../../constants';

interface RightSidebarProps {
  state: EditorState;
  dispatch: any;
  width: number;
  setWidth: (w: number) => void;
}

const TRANSITIONS = [
    { name: "Fade Black", src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", color: "bg-black" },
    { name: "Fade White", src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=", color: "bg-white" },
    { name: "Glitch", src: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3AyNXh6Y2F4Y3E4Y3E4Y3E4Y3E4Y3E4Y3E4Y3E4Y3E4YyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/L2r5pZc4X9lQ/giphy.gif", color: "bg-purple-900" } 
];

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

// Media Layer Component for smooth playback sync
const MediaLayer: React.FC<{ 
    element: CanvasElement, 
    currentTime: number, 
    isPlaying: boolean, 
    canvasMode: string,
    onRef?: (el: HTMLMediaElement | null) => void 
}> = ({ element, currentTime, isPlaying, canvasMode, onRef }) => {
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

        // Set speed first
        const rate = element.playbackRate || 1;
        if (media.playbackRate !== rate) {
            media.playbackRate = rate;
        }

        // Timeline Logic
        const timeOnTrack = currentTime - element.startTime;
        const isWithinTimelineBounds = timeOnTrack >= 0 && timeOnTrack <= element.duration;

        // Calculate Target Media Time
        // target = trimStart + (elapsed_timeline_time * speed)
        const targetMediaTime = element.trimStart + (timeOnTrack * rate);

        if (!isWithinTimelineBounds) {
            if (!media.paused) media.pause();
            return;
        }

        if (isPlaying) {
             // If we are supposed to be playing but aren't
             if (media.paused && media.readyState >= 2) {
                 media.play().catch(e => { /* Auto-play block */ });
             }
             
             // Sync Logic
             const diff = Math.abs(media.currentTime - targetMediaTime);
             const isJump = Math.abs(currentTime - lastSyncTime.current) > 1.0;

             // When playing, we allow small drift (0.4s) to avoid robotic stuttering,
             // unless user manually jumped (seeked).
             if (diff > 0.4 || isJump) {
                 media.currentTime = targetMediaTime;
             }
        } else {
             if (!media.paused) media.pause();
             // When paused, we want strict sync for scrubbing
             if (Math.abs(media.currentTime - targetMediaTime) > 0.1) {
                 media.currentTime = targetMediaTime;
             }
        }
        
        lastSyncTime.current = currentTime;
        
        // --- Volume & Fade Logic ---
        const clipTime = timeOnTrack; // Time relative to start of clip on timeline
        let fadeMultiplier = 1;
        
        // Fade In
        if (element.fadeIn > 0 && clipTime < element.fadeIn) {
            fadeMultiplier = Math.max(0, clipTime / element.fadeIn);
        }
        // Fade Out
        else if (element.fadeOut > 0 && clipTime > element.duration - element.fadeOut) {
            fadeMultiplier = Math.max(0, (element.duration - clipTime) / element.fadeOut);
        }

        media.volume = element.volume * fadeMultiplier;

    }, [currentTime, isPlaying, element.startTime, element.trimStart, element.duration, element.volume, element.fadeIn, element.fadeOut, element.playbackRate]);

    // Visibility Check
    const timeOnTrack = currentTime - element.startTime;
    const isVisible = timeOnTrack >= 0 && timeOnTrack <= element.duration;
    
    if (element.type === ElementType.AUDIO) {
        return <audio ref={mediaRef as React.RefObject<HTMLAudioElement>} src={element.src} crossOrigin="anonymous" preload="auto" />;
    }

    if (element.type === ElementType.VIDEO) {
        return (
            <div 
                className="absolute inset-0 flex items-center justify-center transition-all"
                style={{
                    opacity: isVisible ? element.opacity : 0,
                    pointerEvents: isVisible ? 'auto' : 'none',
                    transform: `translate(${element.x || 0}px, ${element.y || 0}px) scale(${element.scale}) rotate(${element.rotation}deg)`
                }}
            >
                <video 
                    ref={mediaRef as React.RefObject<HTMLVideoElement>} 
                    src={element.src} 
                    className="w-full h-full object-cover" 
                    muted={element.volume === 0} // visual mute helper
                    crossOrigin="anonymous"
                    preload="auto"
                />
            </div>
        );
    }
    return null;
};

export const RightSidebar: React.FC<RightSidebarProps> = ({ state, dispatch, width, setWidth }) => {
  const [activeTab, setActiveTab] = useState<'gallery' | 'overlays' | 'properties'>('gallery');
  const [aiPrompt, setAiPrompt] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const resizeStartRef = useRef<number | null>(null);
  const resizeStartWidthRef = useRef<number | null>(null);
  const [galleryContextMenu, setGalleryContextMenu] = useState<{ x: number, y: number, id: string | null }>({ x: 0, y: 0, id: null });
  
  // Gallery Toggles
  const [isVideosOpen, setIsVideosOpen] = useState(true);
  const [isImagesOpen, setIsImagesOpen] = useState(true);
  const [isAudioOpen, setIsAudioOpen] = useState(true);
  
  // Overlay Toggles
  const [isEmojisOpen, setIsEmojisOpen] = useState(true);
  const [isGifsOpen, setIsGifsOpen] = useState(true);
  const [isTransitionsOpen, setIsTransitionsOpen] = useState(true);

  // File Inputs
  const overlayInputRef = useRef<HTMLInputElement>(null);
  const gifInputRef = useRef<HTMLInputElement>(null);

  // Export State
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  
  // Refs for export rendering
  const exportCanvasRef = useRef<HTMLCanvasElement>(null);
  const mediaElementsRef = useRef<Map<string, HTMLMediaElement>>(new Map());
  // Persistent Audio Context for exports to avoid "already connected" errors
  const exportAudioCtxRef = useRef<AudioContext | null>(null);
  const audioSourceNodeCache = useRef<WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>>(new WeakMap());

  // Helper: Get primary selected element (last selected usually, or first)
  const selectedElementId = state.selectedIds[0];
  const selectedElement = state.elements.find(e => e.id === selectedElementId);
  const isMultiSelect = state.selectedIds.length > 1;

  // --- Interactive Preview Dragging ---
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [previewDrag, setPreviewDrag] = useState<{ id: string, startX: number, startY: number, initialElX: number, initialElY: number } | null>(null);

  const handlePreviewMouseDown = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      e.preventDefault();
      
      // Select if not selected
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
          
          // Calculate scale factor between DOM preview and Canvas Resolution (1280 or 720)
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


  // Playback Control
  const togglePlay = () => dispatch({ type: 'TOGGLE_PLAY' });

  // Paste Handler for Overlays
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


  // Resize Handlers
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

  // Property Handlers
  const updateProperty = (key: keyof CanvasElement, value: any) => {
    if (state.selectedIds.length === 0) return;
    dispatch({
      type: 'UPDATE_ELEMENTS',
      payload: { ids: state.selectedIds, changes: { [key]: value } }
    });
  };

  const handleSpeedChange = (newRate: number) => {
      if (!selectedElement) return;
      
      // Update all selected
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

  // AI Generation Handler
  const handleAiGenerate = async (type: 'image' | 'text') => {
      if (!aiPrompt) return;
      setIsGenerating(true);

      const promptStr = aiPrompt;
      let finalPrompt: string = promptStr;
      let finalName: string = promptStr;
      
      if (type === 'text') {
          finalPrompt = `Typography design of the word "${promptStr}" in a colorful, fun, creative graffiti style, isolated on a white background. Vector art sticker.`;
          finalName = `Art: ${promptStr}`;
      }

      const imageUrl = await generateImage(finalPrompt);
      
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
      } else {
          console.error("Failed to generate image");
      }
      setIsGenerating(false);
  };

  // File Upload Handler
  const handleFileUpload = async (e: React.DragEvent<HTMLDivElement> | React.ChangeEvent<HTMLInputElement>, targetCategory: 'VIDEO' | 'IMAGE' | 'AUDIO' | 'OVERLAY' | 'GIF' = 'IMAGE') => {
      if (e.type === 'drop') {
          e.preventDefault();
          e.stopPropagation();
      }
      
      let files: File[] = [];
      if ('dataTransfer' in e && e.dataTransfer) {
          files = Array.from(e.dataTransfer.files);
      } else if ('target' in e && e.target) {
          // Explicitly check and cast target to avoid unknown type issues with files property
          const target = e.target as HTMLInputElement;
          if (target.files) {
              files = Array.from(target.files);
          }
      }
      
      for (const file of files) {
          const url = URL.createObjectURL(file);
          let type: ElementType = ElementType.IMAGE;
          let category = targetCategory;

          // If GIF, force category
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
      
      // Reset input if used
      if ('target' in e && e.target) {
          (e.target as HTMLInputElement).value = '';
      }
  };

  // Export Logic
  const handleExport = async () => {
      if (isExporting) return;
      
      const canvas = exportCanvasRef.current;
      if (!canvas) {
          alert("Export failed: Canvas not initialized.");
          return;
      }
      
      const mimeTypes = [
        "video/mp4",
        "video/webm;codecs=vp9", 
        "video/webm;codecs=vp8", 
        "video/webm"
      ];
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

      // 1. Calculate Actual Content Duration (Fix for trailing black footage)
      // We ignore state.duration (which is canvas size) and find the last element's end time.
      const contentEnd = state.elements.reduce((max, el) => Math.max(max, el.startTime + el.duration), 0);
      const exportDuration = Math.max(1, contentEnd); // Minimum 1 second

      try {
        const imageUrls = new Set(state.elements.filter(e => e.type === ElementType.IMAGE).map(e => e.src));
        const imageCache = new Map<string, HTMLImageElement>();
        
        await Promise.all(Array.from(imageUrls).map(url => new Promise<void>((resolve) => {
            if (!url) { resolve(); return; }
            const img = new Image();
            img.crossOrigin = "anonymous"; 
            img.src = url;
            img.onload = () => { imageCache.set(url, img); resolve(); };
            img.onerror = () => { console.warn("Failed to load image for export:", url); resolve(); };
        })));

        // 2. Initialize or Resume Persistent Audio Context
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
                            // Clean up previous connections to avoid double-gain or mixing issues
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
        const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8000000 });
        
        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
        };
        
        recorder.onstop = () => {
            originalMediaStates.forEach((val, id) => {
                const m = mediaElementsRef.current.get(id);
                if(m) {
                    m.muted = val.muted;
                    m.volume = val.volume;
                }
            });

            // Disconnect sources to clean up graph for next run
            gainNodes.forEach(g => g.disconnect());
            state.elements.forEach(el => {
                 const m = mediaElementsRef.current.get(el.id);
                 if (m && audioSourceNodeCache.current.has(m)) {
                     const s = audioSourceNodeCache.current.get(m);
                     try { s?.disconnect(); } catch(e) {}
                 }
            });

            const blob = new Blob(chunks, { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
            a.download = `chromacanvas_export_${Date.now()}.${ext}`;
            a.click();
            URL.revokeObjectURL(url);
            
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
                
                // 3. Stop exactly at calculated exportDuration
                if (elapsed > exportDuration) {
                    recorder.stop();
                    return;
                }

                setExportProgress(Math.min(100, Math.round((elapsed / exportDuration) * 100)));
                
                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                const activeElements = state.elements
                  .filter(el => elapsed >= el.startTime && elapsed < el.startTime + el.duration)
                  .sort((a, b) => a.trackId - b.trackId);

                for (const el of activeElements) {
                     let fadeMultiplier = 1;
                     const clipTime = elapsed - el.startTime;
                     if (el.fadeIn > 0 && clipTime < el.fadeIn) {
                         fadeMultiplier = Math.max(0, clipTime / el.fadeIn);
                     } else if (el.fadeOut > 0 && clipTime > el.duration - el.fadeOut) {
                         fadeMultiplier = Math.max(0, (el.duration - clipTime) / el.fadeOut);
                     }
                     
                     const gainNode = gainNodes.get(el.id);
                     if (gainNode) {
                         gainNode.gain.value = el.volume * fadeMultiplier;
                     }

                     ctx.save();
                     const cx = canvas.width / 2 + (el.x || 0);
                     const cy = canvas.height / 2 + (el.y || 0);
                     ctx.translate(cx, cy);
                     ctx.rotate((el.rotation * Math.PI) / 180);
                     ctx.scale(el.scale, el.scale);
                     ctx.globalAlpha = el.opacity * fadeMultiplier;

                     if (el.type === ElementType.VIDEO) {
                         const videoEl = mediaElementsRef.current.get(el.id) as HTMLVideoElement;
                         if (videoEl) {
                             const rate = el.playbackRate || 1;
                             const targetVideoTime = el.trimStart + (clipTime * rate);
                             
                             videoEl.playbackRate = rate;
                             if (Math.abs(videoEl.currentTime - targetVideoTime) > 0.3) {
                                  videoEl.currentTime = targetVideoTime;
                             }
                             if (videoEl.paused) videoEl.play().catch(()=>{});
                             
                             if (videoEl.videoWidth) {
                                const scale = Math.max(canvas.width / videoEl.videoWidth, canvas.height / videoEl.videoHeight);
                                const w = videoEl.videoWidth * scale;
                                const h = videoEl.videoHeight * scale;
                                ctx.drawImage(videoEl, -w/2, -h/2, w, h);
                             }
                         }
                     } else if (el.type === ElementType.IMAGE) {
                         if (el.src) {
                             const img = imageCache.get(el.src);
                             if (img) { 
                                  const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
                                  const w = img.width * scale;
                                  const h = img.height * scale;
                                  ctx.drawImage(img, -w/2, -h/2, w, h);
                             }
                         }
                     } else if (el.type === ElementType.TEXT) {
                          ctx.font = `bold ${el.fontSize || 40}px Inter`;
                          ctx.fillStyle = 'white';
                          ctx.textAlign = 'center';
                          ctx.textBaseline = 'middle';
                          ctx.fillText(el.text || '', 0, 0);
                     }
                     ctx.restore();
                     
                     if (el.type === ElementType.AUDIO) {
                        const audioEl = mediaElementsRef.current.get(el.id);
                        if (audioEl) {
                             const rate = el.playbackRate || 1;
                             const targetTime = el.trimStart + (clipTime * rate);
                             audioEl.playbackRate = rate;
                             if (Math.abs(audioEl.currentTime - targetTime) > 0.3) {
                                  audioEl.currentTime = targetTime;
                             }
                             if (audioEl.paused) audioEl.play().catch(()=>{});
                        }
                     }
                }
                
                requestAnimationFrame(tick);
            } catch (err) {
                console.error("Export Frame Error:", err);
                requestAnimationFrame(tick);
            }
        };
        
        tick();

      } catch (error) {
          console.error("Fatal Export Error:", error);
          alert("Export failed due to an unexpected error.");
          setIsExporting(false);
          originalMediaStates.forEach((val, id) => {
                const m = mediaElementsRef.current.get(id);
                if(m) { m.muted = val.muted; m.volume = val.volume; }
          });
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
                .map(el => (
                    <React.Fragment key={el.id}>
                        {(el.type === ElementType.VIDEO || el.type === ElementType.AUDIO) ? (
                            <MediaLayer 
                                element={el} 
                                currentTime={state.currentTime} 
                                isPlaying={state.isPlaying}
                                canvasMode={state.canvasMode}
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
                                        opacity: el.opacity,
                                        transform: `translate(${el.x || 0}px, ${el.y || 0}px) scale(${el.scale}) rotate(${el.rotation}deg)`
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
                ))
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

      <div className="flex border-b border-zinc-800 shrink-0">
        <button 
            className={`flex-1 py-3 text-sm font-medium ${activeTab === 'gallery' ? 'text-white border-b-2 border-lime-500' : 'text-gray-400 hover:text-white'}`}
            onClick={() => setActiveTab('gallery')}
        >
            Gallery
        </button>
         <button 
            className={`flex-1 py-3 text-sm font-medium ${activeTab === 'overlays' ? 'text-white border-b-2 border-lime-500' : 'text-gray-400 hover:text-white'}`}
            onClick={() => setActiveTab('overlays')}
        >
            Overlays
        </button>
        <button 
            className={`flex-1 py-3 text-sm font-medium ${activeTab === 'properties' ? 'text-white border-b-2 border-lime-500' : 'text-gray-400 hover:text-white'}`}
            onClick={() => setActiveTab('properties')}
        >
            Adjust
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar relative bg-black">
        {activeTab === 'gallery' && (
             <div className="space-y-6">
                 <div className="bg-gradient-to-br from-green-900 to-lime-950 p-4 rounded-xl border border-lime-900">
                    <div className="flex items-center gap-2 mb-3 text-lime-400">
                        <Icons.Magic className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-wider">Gemini Studio</span>
                    </div>
                    <textarea 
                        className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-lime-500 resize-none h-16 mb-3"
                        placeholder="Describe an image or text art..."
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                    />
                    <div className="flex gap-2">
                        <button 
                            disabled={isGenerating || !aiPrompt}
                            onClick={() => handleAiGenerate('image')}
                            className="flex-1 py-2 bg-lime-800 hover:bg-lime-700 disabled:opacity-50 rounded-lg text-xs font-medium text-white transition-colors flex items-center justify-center gap-2"
                        >
                            <Icons.Image size={12} />
                            {isGenerating ? 'Gen...' : 'Gen Image'}
                        </button>
                        <button 
                            disabled={isGenerating || !aiPrompt}
                            onClick={() => handleAiGenerate('text')}
                            className="flex-1 py-2 bg-green-800 hover:bg-green-700 disabled:opacity-50 rounded-lg text-xs font-medium text-white transition-colors flex items-center justify-center gap-2"
                        >
                             <Icons.Type size={12} />
                             {isGenerating ? 'Gen...' : 'Gen Text Art'}
                        </button>
                    </div>
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
                        {/* Images */}
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
                         {/* Audio */}
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
                 {/* 1. Emojis & PNGs */}
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

                 {/* 2. Animated GIFs */}
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

                 {/* 3. Transitions */}
                 <div>
                     <button className="w-full flex items-center justify-between text-xs font-bold text-gray-500 uppercase tracking-wider mb-3" onClick={() => setIsTransitionsOpen(!isTransitionsOpen)}>
                         <span>Transitions</span>
                         <span className="text-gray-600">{isTransitionsOpen ? '▼' : '▶'}</span>
                    </button>
                    {isTransitionsOpen && (
                        <div className="grid grid-cols-2 gap-2">
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
                                    className={`h-16 ${t.color} rounded border border-zinc-700 hover:border-white cursor-grab flex items-center justify-center relative overflow-hidden`}
                                >
                                    {t.name === 'Glitch' && <img src={t.src} className="absolute inset-0 w-full h-full object-cover opacity-50" />}
                                    <span className="text-[10px] font-bold text-white z-10 drop-shadow-md mix-blend-difference">{t.name}</span>
                                </div>
                            ))}
                        </div>
                    )}
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

                            {/* Position Controls */}
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
