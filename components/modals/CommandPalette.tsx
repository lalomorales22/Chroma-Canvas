import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icons } from '../Icon';

export interface Command {
  id: string;
  label: string;
  hint?: string;
  keywords?: string;
  action: () => void;
}

interface Props {
  commands: Command[];
  onClose: () => void;
}

export const CommandPalette: React.FC<Props> = ({ commands, onClose }) => {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.keywords?.toLowerCase().includes(q),
    );
  }, [query, commands]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setIndex(0);
  };

  const run = (cmd: Command) => {
    onClose();
    cmd.action();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && filtered[index]) {
      e.preventDefault();
      run(filtered[index]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[15vh] p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 border-b border-zinc-800">
          <Icons.Command size={14} className="text-zinc-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command…"
            className="flex-1 bg-transparent py-3.5 text-sm text-white focus:outline-none placeholder:text-zinc-600"
          />
          <kbd className="text-[10px] text-zinc-600 font-mono">esc</kbd>
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-zinc-600">No matching commands</div>
          )}
          {filtered.map((cmd, i) => (
            <button
              key={cmd.id}
              className={`w-full flex items-center justify-between px-4 py-2.5 text-left text-sm ${
                i === index ? 'bg-lime-900/20 text-white' : 'text-zinc-300 hover:bg-zinc-900'
              }`}
              onMouseEnter={() => setIndex(i)}
              onClick={() => run(cmd)}
            >
              <span>{cmd.label}</span>
              {cmd.hint && <span className="text-[10px] font-mono text-zinc-600">{cmd.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
