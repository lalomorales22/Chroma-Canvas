import React, { useEffect, useRef, useState } from 'react';
import {
  CanvasElement,
  DEFAULT_TRACK_META,
  EditorDispatch,
  EditorState,
  ElementType,
} from '../../types';
import { Icons } from '../Icon';
import { getProceduralTransform, ProceduralTransform } from '../../utils/transforms';
import { fadeMultiplierAt, filtersToCss } from '../../utils/elements';
import { formatTimecode } from '../../utils/media';

/**
 * The program monitor: renders every active layer at the playhead, keeps
 * video/audio elements in sync with the clock, and gives the selected layer a
 * transform box (drag = move, corners = scale, top knob = rotate).
 */

interface MediaLayerProps {
  element: CanvasElement;
  currentTime: number;
  isPlaying: boolean;
  trackMuted: boolean;
  trackHidden: boolean;
  transform: ProceduralTransform;
  selected: boolean;
  onSelectDown: (e: React.MouseEvent, id: string) => void;
}

const MediaLayer: React.FC<MediaLayerProps> = ({
  element,
  currentTime,
  isPlaying,
  trackMuted,
  trackHidden,
  transform,
  selected,
  onSelectDown,
}) => {
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const lastSyncTime = useRef<number>(-1);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;

    const rate = element.playbackRate || 1;
    if (media.playbackRate !== rate) media.playbackRate = rate;

    const timeOnTrack = currentTime - element.startTime;
    const isWithinTimelineBounds = timeOnTrack >= 0 && timeOnTrack <= element.duration;
    const targetMediaTime = element.trimStart + timeOnTrack * rate;

    if (!isWithinTimelineBounds) {
      if (!media.paused) media.pause();
      return;
    }

    if (isPlaying) {
      if (media.paused && media.readyState >= 2) {
        media.play().catch(() => {});
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
    media.volume = trackMuted
      ? 0
      : Math.max(0, Math.min(1, element.volume * fadeMultiplierAt(element, timeOnTrack)));
  }, [currentTime, isPlaying, element, trackMuted]);

  const timeOnTrack = currentTime - element.startTime;
  const isVisible = timeOnTrack >= 0 && timeOnTrack <= element.duration && !trackHidden;

  if (element.type === ElementType.AUDIO) {
    return (
      <audio
        ref={(el) => {
          mediaRef.current = el;
        }}
        src={element.src}
        crossOrigin="anonymous"
        preload="auto"
      />
    );
  }

  const fade = fadeMultiplierAt(element, timeOnTrack);

  return (
    <div
      className={`absolute inset-0 flex items-center justify-center ${
        selected ? '' : 'hover:ring-1 hover:ring-lime-500/40'
      } cursor-move`}
      onMouseDown={(e) => onSelectDown(e, element.id)}
      style={{
        opacity: isVisible ? element.opacity * transform.opacityMultiplier * fade : 0,
        pointerEvents: isVisible ? 'auto' : 'none',
        transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale}) rotate(${transform.rotation}deg)`,
      }}
    >
      <video
        ref={(el) => {
          mediaRef.current = el;
        }}
        src={element.src}
        className="w-full h-full object-cover pointer-events-none"
        style={{ filter: filtersToCss(element.filters) }}
        muted={element.volume === 0 || trackMuted}
        crossOrigin="anonymous"
        preload="auto"
      />
    </div>
  );
};

interface PreviewProps {
  state: EditorState;
  dispatch: EditorDispatch;
}

type GestureKind = 'move' | 'scale' | 'rotate';

interface Gesture {
  kind: GestureKind;
  id: string;
  startX: number;
  startY: number;
  initial: { x: number; y: number; scale: number; rotation: number };
  centerX: number; // viewport coords of preview center
  centerY: number;
  startDist: number;
  startAngle: number;
}

export const Preview: React.FC<PreviewProps> = ({ state, dispatch }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);

  const canvasBaseWidth = state.canvasMode === 'landscape' ? 1280 : 720;

  const selectedId = state.selectedIds[0];
  const selectedElement =
    state.selectedIds.length === 1 ? state.elements.find((e) => e.id === selectedId) : undefined;

  const beginGesture = (e: React.MouseEvent, id: string, kind: GestureKind) => {
    e.stopPropagation();
    e.preventDefault();
    if (!state.selectedIds.includes(id)) {
      dispatch({ type: 'SELECT_ELEMENT', payload: id });
    }
    const el = state.elements.find((x) => x.id === id);
    const rect = containerRef.current?.getBoundingClientRect();
    if (!el || !rect) return;
    const scaleFactor = canvasBaseWidth / rect.width;
    const centerX = rect.left + rect.width / 2 + (el.x || 0) / scaleFactor;
    const centerY = rect.top + rect.height / 2 + (el.y || 0) / scaleFactor;
    setGesture({
      kind,
      id,
      startX: e.clientX,
      startY: e.clientY,
      initial: { x: el.x || 0, y: el.y || 0, scale: el.scale, rotation: el.rotation },
      centerX,
      centerY,
      startDist: Math.max(8, Math.hypot(e.clientX - centerX, e.clientY - centerY)),
      startAngle: Math.atan2(e.clientY - centerY, e.clientX - centerX),
    });
  };

  useEffect(() => {
    if (!gesture) return;
    const handleMove = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const scaleFactor = canvasBaseWidth / rect.width;

      if (gesture.kind === 'move') {
        dispatch({
          type: 'UPDATE_ELEMENT',
          payload: {
            id: gesture.id,
            changes: {
              x: gesture.initial.x + (e.clientX - gesture.startX) * scaleFactor,
              y: gesture.initial.y + (e.clientY - gesture.startY) * scaleFactor,
            },
          },
          transient: true,
        });
      } else if (gesture.kind === 'scale') {
        const dist = Math.hypot(e.clientX - gesture.centerX, e.clientY - gesture.centerY);
        const factor = dist / gesture.startDist;
        dispatch({
          type: 'UPDATE_ELEMENT',
          payload: {
            id: gesture.id,
            changes: { scale: Math.max(0.05, Math.min(8, gesture.initial.scale * factor)) },
          },
          transient: true,
        });
      } else {
        const angle = Math.atan2(e.clientY - gesture.centerY, e.clientX - gesture.centerX);
        const deltaDeg = ((angle - gesture.startAngle) * 180) / Math.PI;
        let rotation = gesture.initial.rotation + deltaDeg;
        if (e.shiftKey) rotation = Math.round(rotation / 15) * 15;
        dispatch({
          type: 'UPDATE_ELEMENT',
          payload: { id: gesture.id, changes: { rotation } },
          transient: true,
        });
      }
    };
    const handleUp = () => {
      setGesture(null);
      dispatch({ type: 'COMMIT_HISTORY' });
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [gesture, canvasBaseWidth, dispatch]);

  const togglePlay = () => dispatch({ type: 'TOGGLE_PLAY' });

  const selectedVisible =
    selectedElement &&
    selectedElement.type !== ElementType.AUDIO &&
    state.currentTime >= selectedElement.startTime &&
    state.currentTime < selectedElement.startTime + selectedElement.duration;

  const selectedTransform = selectedVisible
    ? getProceduralTransform(selectedElement, state.currentTime, state.canvasMode, false)
    : null;

  return (
    <div className="aspect-video bg-[#0f0f11] relative flex items-center justify-center overflow-hidden border-b border-zinc-800 shrink-0 group/preview">
      <div
        ref={containerRef}
        className="relative overflow-hidden bg-black"
        style={{
          width: state.canvasMode === 'portrait' ? 'auto' : '100%',
          height: state.canvasMode === 'portrait' ? '100%' : 'auto',
          aspectRatio: state.canvasMode === 'portrait' ? '9/16' : '16/9',
        }}
        onMouseDown={() => dispatch({ type: 'DESELECT_ALL' })}
      >
        {[...state.elements]
          .sort((a, b) => a.trackId - b.trackId)
          .map((el) => {
            const meta = state.tracks[el.trackId] ?? DEFAULT_TRACK_META;
            const transform = getProceduralTransform(
              el,
              state.currentTime,
              state.canvasMode,
              state.isPlaying,
            );
            if (el.type === ElementType.VIDEO || el.type === ElementType.AUDIO) {
              return (
                <MediaLayer
                  key={el.id}
                  element={el}
                  currentTime={state.currentTime}
                  isPlaying={state.isPlaying}
                  trackMuted={meta.muted}
                  trackHidden={meta.hidden}
                  transform={transform}
                  selected={state.selectedIds.includes(el.id)}
                  onSelectDown={(e, id) => beginGesture(e, id, 'move')}
                />
              );
            }
            const active =
              state.currentTime >= el.startTime &&
              state.currentTime < el.startTime + el.duration &&
              !meta.hidden;
            if (!active) return null;
            const fade = fadeMultiplierAt(el, state.currentTime - el.startTime);
            return (
              <div
                key={el.id}
                className="absolute inset-0 flex items-center justify-center cursor-move hover:ring-1 hover:ring-lime-500/40"
                onMouseDown={(e) => beginGesture(e, el.id, 'move')}
                style={{
                  opacity: el.opacity * transform.opacityMultiplier * fade,
                  transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale}) rotate(${transform.rotation}deg)`,
                }}
              >
                {el.type === ElementType.IMAGE && (
                  <img
                    src={el.src}
                    className="w-full h-full object-contain pointer-events-none"
                    style={{ filter: filtersToCss(el.filters) }}
                    alt=""
                    draggable={false}
                  />
                )}
                {el.type === ElementType.TEXT && (
                  <h1
                    className="font-bold drop-shadow-lg text-center leading-tight whitespace-pre-wrap px-4 pointer-events-none"
                    style={{
                      fontFamily: el.fontFamily || "'Inter Variable', 'Inter', sans-serif",
                      fontSize: `${el.fontSize || 40}px`,
                      color: el.color || '#ffffff',
                    }}
                  >
                    {el.text}
                  </h1>
                )}
              </div>
            );
          })}

        {/* Transform box for the selected layer */}
        {selectedElement && selectedVisible && selectedTransform && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              transform: `translate(${selectedTransform.x}px, ${selectedTransform.y}px) rotate(${selectedTransform.rotation}deg)`,
            }}
          >
            <div
              className="absolute border border-lime-500/80"
              style={{
                left: '50%',
                top: '50%',
                width: `${Math.min(96, 60 * selectedTransform.scale + 20)}%`,
                height: `${Math.min(96, 60 * selectedTransform.scale + 20)}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              {(['-left-1.5 -top-1.5', '-right-1.5 -top-1.5', '-left-1.5 -bottom-1.5', '-right-1.5 -bottom-1.5'] as const).map(
                (pos) => (
                  <div
                    key={pos}
                    className={`absolute ${pos} w-3 h-3 bg-white border border-lime-600 rounded-sm pointer-events-auto cursor-nwse-resize`}
                    onMouseDown={(e) => beginGesture(e, selectedElement.id, 'scale')}
                  />
                ),
              )}
              <div
                className="absolute left-1/2 -top-7 -translate-x-1/2 w-4 h-4 bg-white border border-lime-600 rounded-full pointer-events-auto cursor-grab flex items-center justify-center"
                onMouseDown={(e) => beginGesture(e, selectedElement.id, 'rotate')}
                title="Drag to rotate (Shift snaps to 15°)"
              >
                <Icons.Rotate size={9} className="text-black" />
              </div>
            </div>
          </div>
        )}

        {/* Center guides while transforming */}
        {gesture?.kind === 'move' && (
          <>
            <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-lime-500/30 pointer-events-none" />
            <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-lime-500/30 pointer-events-none" />
          </>
        )}
      </div>

      {/* Transport controls */}
      <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-3 z-20 pointer-events-none">
        <button
          onClick={() => dispatch({ type: 'SEEK', payload: 0 })}
          className="pointer-events-auto p-2 rounded-full bg-black/50 hover:bg-white/20 text-white backdrop-blur"
          title="Back to start"
        >
          <Icons.Back size={14} />
        </button>
        <button
          onClick={togglePlay}
          className="pointer-events-auto p-3 rounded-full bg-white text-black hover:bg-gray-200 shadow-lg"
        >
          {state.isPlaying ? (
            <Icons.Pause size={18} fill="black" />
          ) : (
            <Icons.Play size={18} fill="black" />
          )}
        </button>
        <div className="pointer-events-auto px-2.5 py-1.5 rounded-full bg-black/50 backdrop-blur text-[10px] font-mono text-white/90">
          {formatTimecode(state.currentTime)}
        </div>
      </div>
    </div>
  );
};
