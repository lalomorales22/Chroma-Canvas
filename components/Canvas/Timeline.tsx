
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
  const [dragState, setDragState] = useState<{
    isDragging: boolean;
    type: 'move' | 'resize-start' | 'resize-end' | null;
    elementId: string | null;
    startX: number;
    originalStartTime: number;
    originalDuration: number;
    originalTrackId: number;
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

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState || !dragState.isDragging || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const currentX = e.clientX - rect.left + containerRef.current.scrollLeft;
    const currentY = e.clientY - rect.top; 

    const deltaX = currentX - dragState.startX;
    const deltaSeconds = deltaX / state.zoom;

    if (dragState.type === 'move') {
      const newStartTime = Math.max(0, dragState.originalStartTime + deltaSeconds);
      const relativeY = currentY - 40; 
      const newTrackId = Math.max(0, Math.floor(relativeY / (TRACK_HEIGHT + 10)));

      dispatch({
        type: 'UPDATE_ELEMENT',
        payload: {
          id: dragState.elementId,
          changes: { startTime: newStartTime, trackId: newTrackId }
        }
      });
    } else if (dragState.type === 'resize-end') {
      const newDuration = Math.max(0.5, dragState.originalDuration + deltaSeconds);
      dispatch({
        type: 'UPDATE_ELEMENT',
        payload: {
          id: dragState.elementId,
          changes: { duration: newDuration }
        }
      });
    } else if (dragState.type === 'resize-start') {
      const newStartTime = Math.min(
        dragState.originalStartTime + dragState.originalDuration - 0.5,
        Math.max(0, dragState.originalStartTime + deltaSeconds)
      );
      const durationDiff = dragState.originalStartTime - newStartTime;
      const newDuration = Math.max(0.5, dragState.originalDuration + durationDiff);
      
      dispatch({
        type: 'UPDATE_ELEMENT',
        payload: {
          id: dragState.elementId,
          changes: { startTime: newStartTime, duration: newDuration }
        }
      });
    }
  }, [dragState, state.zoom, dispatch]);

  const handleMouseUp = useCallback(() => {
    if (dragState?.isDragging) {
      setDragState(null);
    }
  }, [dragState]);

  useEffect(() => {
    if (dragState?.isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, handleMouseMove, handleMouseUp]);

  const handleElementMouseDown = (e: React.MouseEvent, element: CanvasElement, type: 'move' | 'resize-start' | 'resize-end') => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    
    dispatch({ type: 'SELECT_ELEMENT', payload: element.id });

    setDragState({
      isDragging: true,
      type,
      elementId: element.id,
      startX: e.clientX - rect.left + containerRef.current.scrollLeft,
      originalStartTime: element.startTime,
      originalDuration: element.duration,
      originalTrackId: element.trackId
    });
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).id === 'timeline-tracks') {
       dispatch({ type: 'DESELECT_ALL' });
       
       if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const x = e.clientX - rect.left + containerRef.current.scrollLeft;
          const time = Math.max(0, x / state.zoom);
          // Use SEEK to ensure playback loop restarts if playing
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
      onClick={handleCanvasClick}
      style={{
        backgroundImage: 'radial-gradient(circle, #27272a 1px, transparent 1px)',
        backgroundSize: '20px 20px'
      }}
    >
      <div className="min-w-full h-[1000px] relative">
        {/* Ruler */}
        <div className="sticky top-0 left-0 right-0 h-10 bg-[#18181b] border-b border-white/10 z-30 overflow-hidden">
          {renderRuler()}
        </div>

        {/* Tracks Area */}
        <div id="timeline-tracks" className="relative pt-2 min-h-[800px]">
          {state.elements.map(el => (
            <ElementBlock 
              key={el.id}
              element={el}
              zoom={state.zoom}
              isSelected={state.selectedId === el.id}
              onMouseDown={(e, type) => handleElementMouseDown(e, el, type)}
              onContextMenu={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  dispatch({ type: 'SELECT_ELEMENT', payload: el.id }); 
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
        </div>
      </div>
    </div>
  );
};
