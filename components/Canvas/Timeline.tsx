import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  CanvasElement,
  DEFAULT_TRACK_META,
  EditorDispatch,
  EditorState,
  ElementType,
} from '../../types';
import { TRACK_HEIGHT, TRACK_RAIL_WIDTH } from '../../constants';
import { ElementBlock } from './ElementBlock';
import { Icons } from '../Icon';
import { formatTime } from '../../utils/media';
import { maxClipDuration } from '../../utils/elements';

interface TimelineProps {
  state: EditorState;
  dispatch: EditorDispatch;
  onContextMenu: (e: React.MouseEvent, id: string | null) => void;
}

interface DragState {
  isDragging: boolean;
  type: 'move' | 'resize-start' | 'resize-end';
  elementId: string;
  startX: number;
  initialElements: {
    id: string;
    startTime: number;
    trackId: number;
    duration: number;
    trimStart: number;
  }[];
}

const RULER_HEIGHT = 40;

export const Timeline: React.FC<TimelineProps> = ({ state, dispatch, onContextMenu }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const didDragRef = useRef(false);

  const [dragState, setDragState] = useState<DragState | null>(null);
  const [scroll, setScroll] = useState({ left: 0, top: 0 });
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [selectionBox, setSelectionBox] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    isSelecting: boolean;
  } | null>(null);

  const maxTrackId = state.elements.reduce((max, el) => Math.max(max, el.trackId), 0);
  const numTracks = Math.max(3, maxTrackId + 2);

  const timeToX = (t: number) => TRACK_RAIL_WIDTH + t * state.zoom;
  const xToTime = (x: number) => Math.max(0, (x - TRACK_RAIL_WIDTH) / state.zoom);

  const calculateFitZoom = useCallback(() => {
    if (!containerRef.current) return;
    const width = containerRef.current.clientWidth;
    const targetDuration = Math.max(state.duration, 10);
    const newZoom = (width - TRACK_RAIL_WIDTH - 40) / targetDuration;
    dispatch({ type: 'SET_ZOOM', payload: newZoom });
  }, [state.duration, dispatch]);

  useEffect(() => {
    if (state.fitVersion > 0) calculateFitZoom();
  }, [state.fitVersion, calculateFitZoom]);

  // Continuous Auto-Fit
  useEffect(() => {
    if (state.isAutoFit && containerRef.current) {
      const width = containerRef.current.clientWidth;
      const targetDuration = Math.max(state.duration, 10);
      const newZoom = (width - TRACK_RAIL_WIDTH - 40) / targetDuration;
      if (Math.abs(state.zoom - newZoom) > 0.5) {
        dispatch({ type: 'SET_ZOOM', payload: newZoom });
      }
    }
  }, [state.isAutoFit, state.duration, state.elements.length, state.zoom, dispatch]);

  const renderRuler = () => {
    const ticks = [];
    const totalSeconds = Math.max(state.duration + 60, 300);
    const step = state.zoom > 60 ? 1 : state.zoom > 30 ? 5 : 10;
    for (let i = 0; i < totalSeconds; i += step) {
      ticks.push(
        <div
          key={i}
          className="absolute top-0 h-6 border-l border-white/20 text-[10px] pl-1 text-white/40 select-none pointer-events-none"
          style={{ left: timeToX(i) }}
        >
          {formatTime(i)}
        </div>,
      );
    }
    return ticks;
  };

  // Ctrl/Cmd + wheel zooming
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        if (state.isAutoFit) dispatch({ type: 'TOGGLE_AUTO_FIT' });
        dispatch({ type: 'SET_ZOOM', payload: state.zoom - e.deltaY * 0.1 });
      }
    };
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [state.zoom, state.isAutoFit, dispatch]);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const currentX = e.clientX - rect.left + containerRef.current.scrollLeft;
      const currentY = e.clientY - rect.top + containerRef.current.scrollTop;

      if (isScrubbing) {
        dispatch({ type: 'SEEK', payload: xToTime(currentX) });
        return;
      }

      if (dragState?.isDragging) {
        didDragRef.current = true;
        const deltaX = currentX - dragState.startX;
        const deltaSeconds = deltaX / state.zoom;
        const snapEnabled = state.snapping && !e.altKey;

        if (dragState.type === 'move') {
          const snapThresholdSec = 15 / state.zoom;
          const snapPoints: number[] = [0, state.currentTime];
          state.elements.forEach((el) => {
            if (dragState.initialElements.some((moved) => moved.id === el.id)) return;
            snapPoints.push(el.startTime, el.startTime + el.duration);
          });

          const primary = dragState.initialElements.find((i) => i.id === dragState.elementId);
          const relativeY = currentY - 40;
          const targetTrackId = Math.max(0, Math.floor(relativeY / (TRACK_HEIGHT + 10)));
          const trackDelta = primary ? targetTrackId - primary.trackId : 0;

          const updates = dragState.initialElements.map((el) => {
            let newStartTime = Math.max(0, el.startTime + deltaSeconds);
            if (snapEnabled) {
              const newEndTime = newStartTime + el.duration;
              for (const point of snapPoints) {
                if (Math.abs(newStartTime - point) < snapThresholdSec) {
                  newStartTime = point;
                  break;
                }
                if (Math.abs(newEndTime - point) < snapThresholdSec) {
                  newStartTime = point - el.duration;
                  break;
                }
              }
            }
            return {
              id: el.id,
              changes: {
                startTime: newStartTime,
                trackId: Math.max(0, el.trackId + trackDelta),
              },
            };
          });
          dispatch({ type: 'MOVE_ELEMENTS', payload: { updates }, transient: true });
        } else if (dragState.type === 'resize-end') {
          const init = dragState.initialElements[0];
          const el = state.elements.find((x) => x.id === init.id);
          if (!el) return;
          const wanted = Math.max(0.1, init.duration + deltaSeconds);
          const clamped = Math.min(wanted, maxClipDuration({ ...el, trimStart: init.trimStart }));
          dispatch({
            type: 'UPDATE_ELEMENT',
            payload: { id: init.id, changes: { duration: clamped } },
            transient: true,
          });
        } else if (dragState.type === 'resize-start') {
          const init = dragState.initialElements[0];
          const el = state.elements.find((x) => x.id === init.id);
          if (!el) return;
          const rate = el.playbackRate || 1;
          const isMedia = el.type === ElementType.VIDEO || el.type === ElementType.AUDIO;
          // Can't trim earlier than the source start.
          const minDelta = isMedia ? -init.trimStart / rate : -init.startTime;
          const maxDelta = init.duration - 0.1;
          const delta = Math.max(minDelta, Math.min(maxDelta, deltaSeconds));
          const newStartTime = Math.max(0, init.startTime + delta);
          const applied = newStartTime - init.startTime;
          const changes: Partial<CanvasElement> = {
            startTime: newStartTime,
            duration: init.duration - applied,
          };
          if (isMedia) {
            // Trimming the head consumes source media.
            changes.trimStart = Math.max(0, init.trimStart + applied * rate);
          }
          dispatch({
            type: 'UPDATE_ELEMENT',
            payload: { id: init.id, changes },
            transient: true,
          });
        }
        return;
      }

      if (selectionBox?.isSelecting) {
        setSelectionBox((prev) => (prev ? { ...prev, currentX, currentY } : null));
      }
    },
    [dragState, selectionBox, isScrubbing, state.zoom, state.elements, state.currentTime, state.snapping, dispatch],
  );

  const handleMouseUp = useCallback(() => {
    if (isScrubbing) setIsScrubbing(false);
    if (dragState?.isDragging) {
      setDragState(null);
      if (didDragRef.current) dispatch({ type: 'COMMIT_HISTORY' });
      didDragRef.current = false;
    }
    if (selectionBox?.isSelecting) {
      const x = Math.min(selectionBox.startX, selectionBox.currentX);
      const y = Math.min(selectionBox.startY, selectionBox.currentY);
      const w = Math.abs(selectionBox.currentX - selectionBox.startX);
      const h = Math.abs(selectionBox.currentY - selectionBox.startY);
      const selectedIds: string[] = [];
      state.elements.forEach((el) => {
        const elLeft = timeToX(el.startTime);
        const elRight = timeToX(el.startTime + el.duration);
        const elTop = RULER_HEIGHT + el.trackId * (TRACK_HEIGHT + 10) + 10;
        const elBottom = elTop + TRACK_HEIGHT;
        if (x < elRight && x + w > elLeft && y < elBottom && y + h > elTop) {
          selectedIds.push(el.id);
        }
      });
      if (selectedIds.length > 0) dispatch({ type: 'SET_SELECTION', payload: selectedIds });
      else if (w < 5 && h < 5) dispatch({ type: 'DESELECT_ALL' });
      setSelectionBox(null);
    }
  }, [dragState, selectionBox, isScrubbing, state.elements, state.zoom, dispatch]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const isTrackLocked = (trackId: number) => state.tracks[trackId]?.locked ?? false;

  const handleElementMouseDown = (
    e: React.MouseEvent,
    element: CanvasElement,
    type: 'move' | 'resize-start' | 'resize-end',
  ) => {
    e.stopPropagation();
    if (!containerRef.current) return;

    let idsToMove = state.selectedIds;
    if (!state.selectedIds.includes(element.id)) {
      idsToMove = [element.id];
      dispatch({ type: 'SELECT_ELEMENT', payload: element.id });
    }
    if (isTrackLocked(element.trackId)) return; // selectable, not movable

    const rect = containerRef.current.getBoundingClientRect();
    const initialElements = state.elements
      .filter((el) => idsToMove.includes(el.id) && !isTrackLocked(el.trackId))
      .map((el) => ({
        id: el.id,
        startTime: el.startTime,
        trackId: el.trackId,
        duration: el.duration,
        trimStart: el.trimStart,
      }));
    if (!initialElements.length) return;

    didDragRef.current = false;
    setDragState({
      isDragging: true,
      type,
      elementId: element.id,
      startX: e.clientX - rect.left + containerRef.current.scrollLeft,
      initialElements,
    });
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).id === 'timeline-tracks') {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left + containerRef.current.scrollLeft;
      const y = e.clientY - rect.top + containerRef.current.scrollTop;
      setSelectionBox({ startX: x, startY: y, currentX: x, currentY: y, isSelecting: true });
    }
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (selectionBox) return;
    if (e.target === e.currentTarget || (e.target as HTMLElement).id === 'timeline-tracks') {
      dispatch({ type: 'DESELECT_ALL' });
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left + containerRef.current.scrollLeft;
        dispatch({ type: 'SEEK', payload: xToTime(x) });
      }
    }
  };

  const handleRulerMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + containerRef.current.scrollLeft;
    dispatch({ type: 'SEEK', payload: xToTime(x) });
    setIsScrubbing(true);
  };

  const setTrackMeta = (trackId: number, key: 'muted' | 'locked' | 'hidden') => {
    const meta = state.tracks[trackId] ?? DEFAULT_TRACK_META;
    dispatch({
      type: 'SET_TRACK_META',
      payload: { trackId, changes: { [key]: !meta[key] } },
    });
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
      onScroll={(e) =>
        setScroll({ left: e.currentTarget.scrollLeft, top: e.currentTarget.scrollTop })
      }
      style={{
        backgroundImage: 'radial-gradient(circle, #27272a 1px, transparent 1px)',
        backgroundSize: '20px 20px',
      }}
    >
      <div className="min-w-full min-h-full relative">
        {/* Ruler (scrubbable) */}
        <div
          className="sticky top-0 h-10 bg-[#18181b] border-b border-white/10 z-30 overflow-hidden flex items-center cursor-col-resize"
          onMouseDown={handleRulerMouseDown}
        >
          {renderRuler()}
        </div>

        {/* Track rail (scroll-synced so it stays put horizontally) */}
        <div
          className="absolute z-20"
          style={{
            width: TRACK_RAIL_WIDTH,
            left: scroll.left,
            top: RULER_HEIGHT,
            bottom: 0,
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-[#141416]/95 backdrop-blur-sm border-r border-white/10 pt-2 h-full">
            {Array.from({ length: numTracks }).map((_, trackId) => {
              const meta = state.tracks[trackId] ?? DEFAULT_TRACK_META;
              const hasClips = state.elements.some((el) => el.trackId === trackId);
              return (
                <div
                  key={trackId}
                  className={`flex flex-col items-center justify-center gap-1 border-b border-white/5 ${
                    hasClips ? '' : 'opacity-40'
                  }`}
                  style={{ height: TRACK_HEIGHT, marginBottom: 10 }}
                >
                  <span className="text-[9px] font-mono text-zinc-600">{trackId + 1}</span>
                  <div className="flex flex-col gap-0.5">
                    <button
                      title={meta.hidden ? 'Show track' : 'Hide track'}
                      className={meta.hidden ? 'text-red-400' : 'text-zinc-500 hover:text-white'}
                      onClick={() => setTrackMeta(trackId, 'hidden')}
                    >
                      {meta.hidden ? <Icons.EyeOff size={11} /> : <Icons.Eye size={11} />}
                    </button>
                    <button
                      title={meta.muted ? 'Unmute track' : 'Mute track'}
                      className={meta.muted ? 'text-red-400' : 'text-zinc-500 hover:text-white'}
                      onClick={() => setTrackMeta(trackId, 'muted')}
                    >
                      {meta.muted ? <Icons.VolumeMuted size={11} /> : <Icons.Volume size={11} />}
                    </button>
                    <button
                      title={meta.locked ? 'Unlock track' : 'Lock track'}
                      className={meta.locked ? 'text-amber-400' : 'text-zinc-500 hover:text-white'}
                      onClick={() => setTrackMeta(trackId, 'locked')}
                    >
                      {meta.locked ? <Icons.Lock size={11} /> : <Icons.Unlock size={11} />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div id="timeline-tracks" className="relative pt-2 min-h-[calc(100vh-150px)]">
          {state.elements.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center text-zinc-600">
                <Icons.Film size={28} className="mx-auto mb-2 opacity-50" />
                <p className="text-xs">
                  Drop media here, or grab clips from the Gallery on the right.
                </p>
              </div>
            </div>
          )}

          {state.elements.map((el) => {
            const meta = state.tracks[el.trackId] ?? DEFAULT_TRACK_META;
            return (
              <div key={el.id} style={{ opacity: meta.hidden ? 0.35 : 1 }}>
                <ElementBlock
                  element={el}
                  zoom={state.zoom}
                  offsetX={TRACK_RAIL_WIDTH}
                  isSelected={state.selectedIds.includes(el.id)}
                  isLocked={meta.locked}
                  onMouseDown={(e, type) => handleElementMouseDown(e, el, type)}
                  onContextMenu={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (!state.selectedIds.includes(el.id)) {
                      dispatch({ type: 'SELECT_ELEMENT', payload: el.id });
                    }
                    onContextMenu(e, el.id);
                  }}
                  onUpdate={(changes) =>
                    dispatch({ type: 'UPDATE_ELEMENT', payload: { id: el.id, changes } })
                  }
                />
              </div>
            );
          })}

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-[1px] bg-red-500 z-40 pointer-events-none"
            style={{ left: timeToX(state.currentTime) }}
          >
            <div className="absolute top-0 -left-1.5 w-3 h-3 bg-red-500 transform rotate-45 -mt-1.5 shadow-md" />
          </div>

          {selectionBox?.isSelecting && (
            <div
              className="absolute bg-blue-500/20 border border-blue-500 z-50 pointer-events-none"
              style={{
                left: Math.min(selectionBox.startX, selectionBox.currentX),
                top: Math.min(selectionBox.startY, selectionBox.currentY) - 40,
                width: Math.abs(selectionBox.currentX - selectionBox.startX),
                height: Math.abs(selectionBox.currentY - selectionBox.startY),
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};
