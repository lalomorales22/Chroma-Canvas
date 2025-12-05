
import React, { useRef, useState, useEffect } from 'react';
import { CanvasElement, ElementType } from '../../types';
import { TRACK_HEIGHT } from '../../constants';
import { Icons } from '../Icon';

interface ElementBlockProps {
  element: CanvasElement;
  zoom: number;
  isSelected: boolean;
  onMouseDown: (e: React.MouseEvent, type: 'move' | 'resize-start' | 'resize-end') => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onUpdate: (changes: Partial<CanvasElement>) => void;
}

export const ElementBlock: React.FC<ElementBlockProps> = ({ 
  element, 
  zoom, 
  isSelected, 
  onMouseDown,
  onContextMenu,
  onUpdate
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const width = element.duration * zoom;
  const left = element.startTime * zoom;
  const top = element.trackId * (TRACK_HEIGHT + 10) + 10; // 10px gap
  
  const isAudio = element.type === ElementType.AUDIO;
  
  const baseColor = isAudio ? 'bg-emerald-900/80 border-emerald-500' :
                   element.type === ElementType.TEXT ? 'bg-violet-900/80 border-violet-500' :
                   'bg-blue-900/80 border-blue-500';

  const selectedClass = isSelected ? 'ring-2 ring-white z-10' : 'opacity-90 hover:opacity-100';

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (element.type === ElementType.TEXT) {
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
        handleBlur();
    }
  };

  return (
    <div
      className={`absolute rounded-md overflow-hidden border cursor-pointer group select-none transition-shadow ${baseColor} ${selectedClass}`}
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
        // Prevent triggering if clicking resize handles
        if ((e.target as HTMLElement).dataset.handle) return;
        onMouseDown(e, 'move');
      }}
      onContextMenu={onContextMenu}
      onDoubleClick={handleDoubleClick}
    >
      {/* Content Preview */}
      <div className="w-full h-full relative overflow-hidden flex items-center justify-center">
         {element.type === ElementType.VIDEO && (
            <div className="w-full h-full flex items-center justify-center bg-black/20">
               <Icons.Move className="w-4 h-4 text-white/50" />
               <span className="ml-2 text-xs truncate text-white/80">{element.name}</span>
            </div>
         )}
         {element.type === ElementType.IMAGE && (
             <img src={element.src} alt="clip" className="w-full h-full object-cover opacity-50 pointer-events-none" />
         )}
         {element.type === ElementType.AUDIO && (
             <div className="w-full h-full flex items-center justify-center">
                <div className="w-full h-8 flex items-end gap-1 px-2 opacity-50">
                    {/* Fake waveform */}
                    {Array.from({ length: 20 }).map((_, i) => (
                        <div key={i} className="flex-1 bg-emerald-300" style={{ height: `${Math.random() * 100}%`}}></div>
                    ))}
                </div>
             </div>
         )}
         {element.type === ElementType.TEXT && (
             isEditing ? (
                 <input 
                    ref={inputRef}
                    defaultValue={element.text}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    className="bg-transparent text-white text-xs font-bold text-center w-full focus:outline-none"
                 />
             ) : (
                 <span className="text-xs font-bold text-white truncate px-2 pointer-events-none">{element.text}</span>
             )
         )}
      </div>

      {/* Resize Handles - Only visible on hover or selection, and not when editing text */}
      {!isEditing && (
        <>
            <div 
                data-handle="start"
                className={`absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-white/30 z-20 flex items-center justify-center ${isSelected ? 'bg-white/10' : 'opacity-0 group-hover:opacity-100'}`}
                onMouseDown={(e) => { e.stopPropagation(); onMouseDown(e, 'resize-start'); }}
            >
                <div className="w-[1px] h-4 bg-white/50" />
            </div>

            <div 
                data-handle="end"
                className={`absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-white/30 z-20 flex items-center justify-center ${isSelected ? 'bg-white/10' : 'opacity-0 group-hover:opacity-100'}`}
                onMouseDown={(e) => { e.stopPropagation(); onMouseDown(e, 'resize-end'); }}
            >
                <div className="w-[1px] h-4 bg-white/50" />
            </div>
        </>
      )}

      {/* Label Overlay */}
      <div className="absolute top-1 left-4 text-[10px] bg-black/40 px-1 rounded text-white/90 pointer-events-none">
        {element.name}
      </div>
    </div>
  );
};
