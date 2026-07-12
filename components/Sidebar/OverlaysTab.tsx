import React, { useEffect, useRef } from 'react';
import { EditorDispatch, EditorState, ElementType } from '../../types';
import { Icons } from '../Icon';
import { DEFAULT_EMOJIS } from '../../constants';
import { createElement } from '../../utils/elements';
import { importFiles, setDragData } from '../../utils/importFiles';
import { toast } from '../ui/Toast';

interface Props {
  state: EditorState;
  dispatch: EditorDispatch;
  onItemContextMenu: (e: React.MouseEvent, id: string) => void;
}

export const OverlaysTab: React.FC<Props> = ({ state, dispatch, onItemContextMenu }) => {
  const overlayInputRef = useRef<HTMLInputElement>(null);
  const gifInputRef = useRef<HTMLInputElement>(null);

  // Paste an image from the clipboard straight into overlays
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image')) {
          const blob = items[i].getAsFile();
          if (blob) {
            const imported = await importFiles([blob], 'OVERLAY');
            dispatch({ type: 'ADD_LIBRARY_ITEMS', payload: imported });
            toast('Pasted image added to Overlays.', 'success');
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [dispatch]);

  const handleUpload = async (files: File[], category: 'OVERLAY' | 'GIF') => {
    if (!files.length) return;
    const items = await importFiles(files, category);
    dispatch({ type: 'ADD_LIBRARY_ITEMS', payload: items });
  };

  const getFiltered = (category: string) => state.library.filter((i) => i.category === category);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
          Emojis & PNGs
        </div>
        <div className="space-y-3">
          <input
            type="file"
            ref={overlayInputRef}
            className="hidden"
            accept="image/*"
            multiple
            onChange={(e) => {
              handleUpload(Array.from(e.target.files ?? []), 'OVERLAY');
              e.target.value = '';
            }}
          />
          <div
            className="border-2 border-dashed border-lime-500/30 bg-lime-900/10 rounded-xl p-3 text-center hover:border-lime-500/80 hover:bg-lime-500/10 transition-colors cursor-pointer"
            onClick={() => overlayInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleUpload(Array.from(e.dataTransfer.files), 'OVERLAY');
            }}
          >
            <Icons.Plus className="w-5 h-5 text-lime-400 mx-auto mb-1" />
            <p className="text-[10px] text-lime-200">Drag or Click to Add PNGs (or paste!)</p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {getFiltered('OVERLAY').map((item) => (
              <div
                key={item.id}
                draggable
                onDragStart={(e) => setDragData(e, item)}
                onContextMenu={(e) => onItemContextMenu(e, item.id)}
                className="aspect-square bg-zinc-900 border border-zinc-800 rounded p-1 cursor-grab hover:border-lime-500 relative group"
              >
                <img src={item.src} className="w-full h-full object-contain" alt="" />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-4 gap-2">
            {DEFAULT_EMOJIS.map((emoji, idx) => (
              <button
                key={idx}
                className="aspect-square bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded flex items-center justify-center text-xl transition-colors"
                onClick={() => {
                  dispatch({
                    type: 'ADD_ELEMENT',
                    payload: createElement({
                      type: ElementType.TEXT,
                      name: `Emoji ${emoji}`,
                      text: emoji,
                      startTime: state.currentTime,
                      duration: 3,
                      fontSize: 100,
                      x: 0,
                      y: 0,
                    }),
                  });
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
          Animated GIFs
        </div>
        <div className="space-y-3">
          <input
            type="file"
            ref={gifInputRef}
            className="hidden"
            accept="image/gif"
            multiple
            onChange={(e) => {
              handleUpload(Array.from(e.target.files ?? []), 'GIF');
              e.target.value = '';
            }}
          />
          <div
            className="border-2 border-dashed border-purple-500/30 bg-purple-900/10 rounded-xl p-3 text-center hover:border-purple-500/80 hover:bg-purple-500/10 transition-colors cursor-pointer"
            onClick={() => gifInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleUpload(Array.from(e.dataTransfer.files), 'GIF');
            }}
          >
            <Icons.Image className="w-5 h-5 text-purple-400 mx-auto mb-1" />
            <p className="text-[10px] text-purple-200">Drag GIFs Here</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {getFiltered('GIF').map((item) => (
              <div
                key={item.id}
                draggable
                onDragStart={(e) => setDragData(e, item)}
                onContextMenu={(e) => onItemContextMenu(e, item.id)}
                className="aspect-square bg-zinc-900 border border-zinc-800 rounded overflow-hidden cursor-grab hover:border-purple-500 relative group"
              >
                <img src={item.src} className="w-full h-full object-cover" alt="" />
              </div>
            ))}
          </div>
          <p className="text-[10px] text-zinc-600 leading-relaxed">
            Note: GIFs animate in the preview; exports currently render their first frame.
          </p>
        </div>
      </div>
    </div>
  );
};
