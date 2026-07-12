import React, { useEffect, useRef, useState } from 'react';
import { CanvasElement, ElementType } from '../../types';
import { TRACK_HEIGHT } from '../../constants';
import { Waveform } from './Waveform';
import { getFilmstrip, Filmstrip } from './filmstrip';
import { Icons } from '../Icon';

interface ElementBlockProps {
  element: CanvasElement;
  zoom: number;
  offsetX: number; // track rail width — px offset applied to all time positions
  isSelected: boolean;
  isLocked: boolean;
  onMouseDown: (e: React.MouseEvent, type: 'move' | 'resize-start' | 'resize-end') => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onUpdate: (changes: Partial<CanvasElement>) => void;
}

const FilmstripPreview: React.FC<{ element: CanvasElement; width: number }> = ({
  element,
  width,
}) => {
  const [strip, setStrip] = useState<Filmstrip | null>(null);

  useEffect(() => {
    if (!element.src) return;
    let alive = true;
    getFilmstrip(element.src).then((s) => {
      if (alive) setStrip(s);
    });
    return () => {
      alive = false;
    };
  }, [element.src]);

  if (!strip || strip.frames.length === 0) {
    return (
      <video
        src={element.src}
        className="w-full h-full object-cover pointer-events-none opacity-50"
        muted
        preload="metadata"
        onLoadedMetadata={(e) => {
          e.currentTarget.currentTime = element.trimStart;
        }}
      />
    );
  }

  // Show the slice of the source that this clip actually covers.
  const rate = element.playbackRate || 1;
  const srcDur = strip.sourceDuration || element.duration;
  const startFrac = Math.max(0, Math.min(1, element.trimStart / srcDur));
  const endFrac = Math.max(
    startFrac,
    Math.min(1, (element.trimStart + element.duration * rate) / srcDur),
  );
  const tileWidth = 64;
  const count = Math.max(1, Math.ceil(width / tileWidth));
  const tiles: string[] = [];
  for (let i = 0; i < count; i++) {
    const frac = startFrac + ((endFrac - startFrac) * (i + 0.5)) / count;
    const idx = Math.min(strip.frames.length - 1, Math.floor(frac * strip.frames.length));
    tiles.push(strip.frames[idx]);
  }

  return (
    <div className="w-full h-full flex overflow-hidden opacity-70">
      {tiles.map((frame, i) => (
        <img
          key={i}
          src={frame}
          className="h-full object-cover pointer-events-none shrink-0"
          style={{ width: tileWidth }}
          alt=""
          draggable={false}
        />
      ))}
    </div>
  );
};

const ElementBlockInner: React.FC<ElementBlockProps> = ({
  element,
  zoom,
  offsetX,
  isSelected,
  isLocked,
  onMouseDown,
  onContextMenu,
  onUpdate,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const width = element.duration * zoom;
  const left = offsetX + element.startTime * zoom;
  const top = element.trackId * (TRACK_HEIGHT + 10) + 10;

  const isAudio = element.type === ElementType.AUDIO;

  const baseColor = isAudio
    ? 'bg-emerald-950/90 border-emerald-500'
    : element.type === ElementType.TEXT
      ? 'bg-violet-900/80 border-violet-500'
      : 'bg-blue-950/90 border-blue-500';

  const selectedClass = isSelected ? 'ring-2 ring-white z-10' : 'opacity-90 hover:opacity-100';

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (element.type === ElementType.TEXT && !isLocked) {
      e.stopPropagation();
      setIsEditing(true);
    }
  };

  const handleBlur = () => {
    setIsEditing(false);
    if (inputRef.current) {
      onUpdate({ text: inputRef.current.value, name: inputRef.current.value });
    }
  };

  return (
    <div
      className={`absolute rounded-md overflow-hidden border select-none ${baseColor} ${selectedClass} ${
        isLocked ? 'cursor-not-allowed' : 'cursor-pointer'
      }`}
      style={{
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${TRACK_HEIGHT}px`,
      }}
      onMouseDown={(e) => {
        if (isEditing) {
          e.stopPropagation();
          return;
        }
        if ((e.target as HTMLElement).dataset.handle) return;
        onMouseDown(e, 'move');
      }}
      onContextMenu={onContextMenu}
      onDoubleClick={handleDoubleClick}
      data-clip="true"
    >
      <div className="w-full h-full relative overflow-hidden flex items-center justify-center group">
        {element.type === ElementType.VIDEO && (
          <div className="w-full h-full relative overflow-hidden bg-black">
            <FilmstripPreview element={element} width={width} />
            <div className="absolute bottom-1 left-1.5 flex items-center gap-1 bg-black/60 px-1.5 py-0.5 rounded text-[10px] text-white/90 truncate max-w-[90%] pointer-events-none">
              <Icons.Film size={9} className="shrink-0" />
              <span className="truncate">{element.name}</span>
              {(element.playbackRate || 1) !== 1 && (
                <span className="text-lime-400 font-bold">{element.playbackRate}x</span>
              )}
            </div>
          </div>
        )}
        {element.type === ElementType.IMAGE && (
          <img
            src={element.src}
            alt="clip"
            draggable={false}
            className="w-full h-full object-cover opacity-60 pointer-events-none"
          />
        )}
        {element.type === ElementType.AUDIO && element.src && (
          <Waveform
            src={element.src}
            width={width}
            height={TRACK_HEIGHT - 4}
            trimStart={element.trimStart}
            clipDuration={element.duration}
            playbackRate={element.playbackRate || 1}
            sourceDuration={element.sourceDuration}
          />
        )}
        {element.type === ElementType.TEXT &&
          (isEditing ? (
            <input
              ref={inputRef}
              defaultValue={element.text}
              onBlur={handleBlur}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleBlur();
              }}
              className="bg-transparent text-white text-xs font-bold text-center w-full focus:outline-none"
            />
          ) : (
            <span className="text-xs font-bold text-white truncate px-2 pointer-events-none">
              {element.text}
            </span>
          ))}

        {/* Fade indicators */}
        {element.fadeIn > 0 && (
          <div
            className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-black/60 to-transparent pointer-events-none"
            style={{ width: Math.min(width, element.fadeIn * zoom) }}
          />
        )}
        {element.fadeOut > 0 && (
          <div
            className="absolute right-0 top-0 bottom-0 bg-gradient-to-l from-black/60 to-transparent pointer-events-none"
            style={{ width: Math.min(width, element.fadeOut * zoom) }}
          />
        )}

        {/* Resize handles */}
        {!isEditing && !isLocked && (
          <>
            <div
              data-handle="start"
              className={`absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-white/30 z-20 flex items-center justify-center ${
                isSelected ? 'bg-white/10' : 'opacity-0 group-hover:opacity-100'
              }`}
              onMouseDown={(e) => {
                e.stopPropagation();
                onMouseDown(e, 'resize-start');
              }}
            >
              <div className="w-[1px] h-4 bg-white/50" />
            </div>
            <div
              data-handle="end"
              className={`absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-white/30 z-20 flex items-center justify-center ${
                isSelected ? 'bg-white/10' : 'opacity-0 group-hover:opacity-100'
              }`}
              onMouseDown={(e) => {
                e.stopPropagation();
                onMouseDown(e, 'resize-end');
              }}
            >
              <div className="w-[1px] h-4 bg-white/50" />
            </div>
          </>
        )}

        {isLocked && (
          <div className="absolute top-1 right-1.5 text-white/50 pointer-events-none">
            <Icons.Lock size={10} />
          </div>
        )}
      </div>

      {element.type !== ElementType.VIDEO && (
        <div className="absolute top-1 left-4 text-[10px] bg-black/40 px-1 rounded text-white/90 pointer-events-none max-w-[80%] truncate">
          {element.name}
        </div>
      )}
    </div>
  );
};

export const ElementBlock = React.memo(ElementBlockInner);
