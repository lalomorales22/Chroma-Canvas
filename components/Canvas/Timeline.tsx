import React, { useRef, useState, useCallback, useEffect } from 'react';
import { EditorState, CanvasElement, ContextMenuState, ElementType } from '../../types';
import { TRACK_HEIGHT, DEFAULT_ZOOM } from '../../constants';
import { ElementBlock } from './ElementBlock';

interface TimelineProps {
  state: EditorState;
  dispatch: any; 
  onContextMenu: (e: React.MouseEvent, id: string | null) => void;
}

export const Timeline: React.FC<TimelineProps> = ({ state, dispatch, onContextMenu }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Dragging State (Element)
  const [dragState, setDragState] = useState<{
    isDragging: boolean;
    type: 'move' | 'resize-start' | 'resize-end' | null;
    elementId: string | null;
    startX: number;
    initialElements: { id: string, startTime: number, trackId: number, duration: number }[];
  } | null>(null);

  // Marquee Selection State
  const [selectionBox, setSelectionBox] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    isSelecting: boolean;
  } | null>(null);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const renderRuler = () => {
    const ticks = [];
    const totalSeconds = Math.max(state.duration + 60, 300);
    const step = state.zoom > 60 ? 1 : state.zoom > 30 ? 5 : 10;
    
    for (let i = 0; i < totalSeconds; i += step) {
      const left = i * state.zoom;
      ticks.push(
        <div key={i} className="absolute top-0 h-6 border-l border-white/20 text-[10px] pl-1 text-white/40 select-none" style={{ left }}>
          {formatTime(i)}
        </div>
      );
    }
    return ticks;
  };

  // --- Zooming ---
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      // Check for Command (Mac) or Ctrl (Windows) key for zooming
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        
        // Dampening factor for smooth scroll
        const zoomDelta = -e.deltaY * 0.1;
        const newZoom = state.zoom + zoomDelta;
        
        dispatch({ type: 'SET_ZOOM', payload: newZoom });
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [state.zoom, dispatch]);

  // --- Element Movement & Resizing ---
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const currentX = e.clientX - rect.left + containerRef.current.scrollLeft;
    const currentY = e.clientY - rect.top; 

    // Handle Element Dragging
    if (dragState && dragState.isDragging) {
      const deltaX = currentX - dragState.startX;
      const deltaSeconds = deltaX / state.zoom;

      if (dragState.type === 'move') {
        // Collect snap points from other elements (Start and End times)
        const snapThresholdPx = 15;
        const snapThresholdSec = snapThresholdPx / state.zoom;
        const snapPoints: number[] = [];
        state.elements.forEach(el => {
             // Don't snap to self or other elements being currently dragged
             if (dragState.initialElements.some(moved => moved.id === el.id)) return;
             snapPoints.push(el.startTime);
             snapPoints.push(el.startTime + el.duration);
        });
        snapPoints.push(state.currentTime); // Snap to playhead
        snapPoints.push(0); // Snap to start

        const updates = dragState.initialElements.map(el => {
           let newStartTime = Math.max(0, el.startTime + deltaSeconds);
           const newEndTime = newStartTime + el.duration;

           // Magnetic Snapping Logic
           // We check if newStartTime is close to a snapPoint OR newEndTime is close to a snapPoint
           
           for (const point of snapPoints) {
                // Snap Start
                if (Math.abs(newStartTime - point) < snapThresholdSec) {
                    newStartTime = point;
                    break;
                }
                // Snap End
                if (Math.abs(newEndTime - point) < snapThresholdSec) {
                    newStartTime = point - el.duration;
                    break;
                }
           }
           
           // Calculate Y Delta based on mouse movement relative to start of drag
           const relativeY = currentY - 40; 
           const targetTrackId = Math.max(0, Math.floor(relativeY / (TRACK_HEIGHT + 10)));
           
           // Find the 'primary' element that triggered the drag to calculate track delta
           const primary = dragState.initialElements.find(i => i.id === dragState.elementId);
           const trackDelta = primary ? targetTrackId - primary.trackId : 0;
           
           return {
               id: el.id,
               changes: { 
                   startTime: newStartTime,
                   trackId: Math.max(0, el.trackId + trackDelta) 
               }
           };
        });

        dispatch({ type: 'MOVE_ELEMENTS', payload: { updates } });
      } 
      else if (dragState.type === 'resize-end') {
        const el = dragState.initialElements[0]; // Only resize one at a time for safety
        const newDuration = Math.max(0.5, el.duration + deltaSeconds);
        dispatch({ type: 'UPDATE_ELEMENT', payload: { id: el.id, changes: { duration: newDuration } } });
      } 
      else if (dragState.type === 'resize-start') {
        const el = dragState.initialElements[0];
        const newStartTime = Math.min(el.startTime + el.duration - 0.5, Math.max(0, el.startTime + deltaSeconds));
        const durationDiff = el.startTime - newStartTime;
        const newDuration = Math.max(0.5, el.duration + durationDiff);
        dispatch({ type: 'UPDATE_ELEMENT', payload: { id: el.id, changes: { startTime: newStartTime, duration: newDuration } } });
      }
      return;
    }

    // Handle Marquee Selection
    if (selectionBox?.isSelecting) {
        setSelectionBox(prev => prev ? { ...prev, currentX, currentY } : null);
    }
  }, [dragState, selectionBox, state.zoom, state.elements, state.currentTime, dispatch]);

  const handleMouseUp = useCallback(() => {
    // End Element Drag
    if (dragState?.isDragging) {
      setDragState(null);
    }

    // End Marquee Selection
    if (selectionBox?.isSelecting) {
        // Calculate intersection
        const x = Math.min(selectionBox.startX, selectionBox.currentX);
        const y = Math.min(selectionBox.startY, selectionBox.currentY);
        const w = Math.abs(selectionBox.currentX - selectionBox.startX);
        const h = Math.abs(selectionBox.currentY - selectionBox.startY);
        
        // Convert screen coordinates to Timeline Logic coordinates
        // X is time * zoom
        // Y is Track ID * (Height + Gap) + Header Offset
        
        const selectedIds: string[] = [];

        state.elements.forEach(el => {
            const elLeft = el.startTime * state.zoom;
            const elRight = (el.startTime + el.duration) * state.zoom;
            const elTop = el.trackId * (TRACK_HEIGHT + 10) + 10;
            const elBottom = elTop + TRACK_HEIGHT;

            // AABB Collision
            if (
                x < elRight &&
                x + w > elLeft &&
                y < elBottom &&
                y + h > elTop
            ) {
                selectedIds.push(el.id);
            }
        });

        if (selectedIds.length > 0) {
            dispatch({ type: 'SET_SELECTION', payload: selectedIds });
        } else {
             // If box is tiny (just a click), deselect
            if (w < 5 && h < 5) dispatch({ type: 'DESELECT_ALL' });
        }
        
        setSelectionBox(null);
    }
  }, [dragState, selectionBox, state.elements, state.zoom, dispatch]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const handleElementMouseDown = (e: React.MouseEvent, element: CanvasElement, type: 'move' | 'resize-start' | 'resize-end') => {
    e.stopPropagation(); // Prevent timeline marquee start
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    
    // Logic: If clicking an unselected element, select it (and deselect others unless shift held - implementing simple behavior first).
    // If dragging a SELECTED element, keep selection to allow bulk move.
    
    let idsToMove = state.selectedIds;
    
    if (!state.selectedIds.includes(element.id)) {
        // Clicked new element
        idsToMove = [element.id];
        dispatch({ type: 'SELECT_ELEMENT', payload: element.id });
    }

    // Prepare initial state for all moving elements to calculate delta later
    const initialElements = state.elements
        .filter(el => idsToMove.includes(el.id))
        .map(el => ({ 
            id: el.id, 
            startTime: el.startTime, 
            trackId: el.trackId, 
            duration: el.duration 
        }));

    setDragState({
      isDragging: true,
      type,
      elementId: element.id,
      startX: e.clientX - rect.left + containerRef.current.scrollLeft,
      initialElements
    });
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    // Start Marquee Selection if hitting background
    if (e.target === e.currentTarget || (e.target as HTMLElement).id === 'timeline-tracks') {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left + containerRef.current.scrollLeft;
        const y = e.clientY - rect.top;

        setSelectionBox({
            startX: x,
            startY: y,
            currentX: x,
            currentY: y,
            isSelecting: true
        });
    }
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
      // If we dragged a selection box, this click might fire, so check if we were selecting
      if (selectionBox) return;

      if (e.target === e.currentTarget || (e.target as HTMLElement).id === 'timeline-tracks') {
       dispatch({ type: 'DESELECT_ALL' });
       
       if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const x = e.clientX - rect.left + containerRef.current.scrollLeft;
          const time = Math.max(0, x / state.zoom);
          dispatch({ type: 'SEEK', payload: time });
       }
    }
  };

  return (
    <div 
      ref={containerRef}
      className="flex-1 overflow-x-auto overflow-y-auto relative bg-[#121214] custom-scrollbar"
      onContextMenu={(e) => {
        if (e.target === e.currentTarget || (e.target as HTMLElement).id === 'timeline-tracks') {
            onContextMenu(e, null);
        }
      }}
      onMouseDown={handleCanvasMouseDown}
      onClick={handleCanvasClick}
      style={{
        backgroundImage: 'radial-gradient(circle, #27272a 1px, transparent 1px)',
        backgroundSize: '20px 20px'
      }}
    >
      <div className="min-w-full min-h-full relative">
        {/* Ruler */}
        <div className="sticky top-0 left-0 right-0 h-10 bg-[#18181b] border-b border-white/10 z-30 overflow-hidden">
          {renderRuler()}
        </div>

        {/* Tracks Area */}
        <div id="timeline-tracks" className="relative pt-2 min-h-[calc(100vh-150px)]">
          {state.elements.map(el => (
            <ElementBlock 
              key={el.id}
              element={el}
              zoom={state.zoom}
              isSelected={state.selectedIds.includes(el.id)}
              onMouseDown={(e, type) => handleElementMouseDown(e, el, type)}
              onContextMenu={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  // Ensure right-clicked item is in selection
                  if (!state.selectedIds.includes(el.id)) {
                       dispatch({ type: 'SELECT_ELEMENT', payload: el.id }); 
                  }
                  onContextMenu(e, el.id);
              }}
              onUpdate={(changes) => dispatch({ type: 'UPDATE_ELEMENT', payload: { id: el.id, changes } })}
            />
          ))}

          {/* Playhead */}
          <div 
            className="absolute top-0 bottom-0 w-[1px] bg-red-500 z-40 pointer-events-none"
            style={{ left: state.currentTime * state.zoom }}
          >
            <div className="absolute top-0 -left-1.5 w-3 h-3 bg-red-500 transform rotate-45 -mt-1.5 shadow-md" />
          </div>

          {/* Selection Box */}
          {selectionBox && selectionBox.isSelecting && (
              <div 
                className="absolute bg-blue-500/20 border border-blue-500 z-50 pointer-events-none"
                style={{
                    left: Math.min(selectionBox.startX, selectionBox.currentX),
                    top: Math.min(selectionBox.startY, selectionBox.currentY),
                    width: Math.abs(selectionBox.currentX - selectionBox.startX),
                    height: Math.abs(selectionBox.currentY - selectionBox.startY)
                }}
              />
          )}
        </div>
      </div>
    </div>
  );
};