import React from 'react';
import { Icons } from '../Icon';

interface Props {
  onClose: () => void;
}

const SHORTCUTS: { keys: string; action: string }[][] = [
  [
    { keys: 'Space', action: 'Play / Pause' },
    { keys: 'Home / End', action: 'Jump to start / end' },
    { keys: '← / →', action: 'Nudge selected clips 0.1s' },
    { keys: 'Shift + ← / →', action: 'Nudge selected clips 1s' },
    { keys: 'S', action: 'Split clip at playhead' },
    { keys: '⌫ / Delete', action: 'Delete selected' },
  ],
  [
    { keys: '⌘/Ctrl + Z', action: 'Undo' },
    { keys: '⌘/Ctrl + Shift + Z', action: 'Redo' },
    { keys: '⌘/Ctrl + C / X / V', action: 'Copy / Cut / Paste clips' },
    { keys: '⌘/Ctrl + D', action: 'Duplicate selected' },
    { keys: '⌘/Ctrl + A', action: 'Select all' },
    { keys: '⌘/Ctrl + K', action: 'Command palette' },
  ],
  [
    { keys: '+ / -', action: 'Zoom timeline in / out' },
    { keys: '⌘/Ctrl + Scroll', action: 'Zoom timeline' },
    { keys: 'Alt while dragging', action: 'Disable snapping' },
    { keys: 'Double-click text', action: 'Edit text inline' },
    { keys: 'Right-click', action: 'Context actions' },
    { keys: '?', action: 'This cheat sheet' },
  ],
];

export const ShortcutsModal: React.FC<Props> = ({ onClose }) => (
  <div
    className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
    onClick={onClose}
  >
    <div
      className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-2xl p-6 space-y-4"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Icons.Keyboard size={18} className="text-lime-500" /> Keyboard Shortcuts
        </h2>
        <button className="text-zinc-500 hover:text-white" onClick={onClose}>
          <Icons.X size={18} />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-1">
        {SHORTCUTS.map((column, i) => (
          <div key={i} className="space-y-1">
            {column.map((s) => (
              <div
                key={s.keys}
                className="flex items-center justify-between gap-3 py-1.5 border-b border-zinc-900"
              >
                <span className="text-[11px] text-zinc-400">{s.action}</span>
                <kbd className="text-[10px] font-mono px-1.5 py-0.5 bg-zinc-900 border border-zinc-800 rounded text-zinc-200 whitespace-nowrap">
                  {s.keys}
                </kbd>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  </div>
);
