import React from 'react';
import { AppView } from '../types';
import { Icons } from './Icon';

/**
 * The shared top bar on every page: ChromaCanvas brand on the left, the three
 * page tabs next to it, and contextual controls (passed as children) plus the
 * always-available palette/help/settings buttons on the right.
 */

const PAGES: { id: AppView; label: string; icon: React.ReactNode; hint: string }[] = [
  {
    id: 'RECORDER',
    label: 'Recorder Studio',
    icon: <Icons.Circle size={11} className="text-red-500 fill-red-500" />,
    hint: 'Record screen, webcam & mics — and multistream live',
  },
  {
    id: 'EDITOR',
    label: 'Media Editor',
    icon: <Icons.Scissors size={11} className="text-lime-400" />,
    hint: 'Cut your footage together on the timeline and export',
  },
  {
    id: 'GALLERY',
    label: 'Gallery',
    icon: <Icons.Image size={11} className="text-sky-400" />,
    hint: 'Browse everything you have recorded, imported, and generated',
  },
];

interface Props {
  view: AppView;
  onNavigate: (view: AppView) => void;
  busy?: boolean; // recording/streaming in progress — navigation locked
  onOpenPalette: () => void;
  onOpenShortcuts: () => void;
  onOpenSettings: () => void;
  children?: React.ReactNode; // page-specific controls (right side)
}

export const IconButton: React.FC<{
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ title, active, disabled, onClick, children }) => (
  <button
    title={title}
    disabled={disabled}
    onClick={onClick}
    className={`p-2 rounded-lg border text-[10px] font-bold transition-all disabled:opacity-30 ${
      active
        ? 'bg-lime-600 border-lime-500 text-white'
        : 'bg-zinc-900 border-zinc-800 text-gray-400 hover:text-white hover:bg-zinc-800'
    }`}
  >
    {children}
  </button>
);

export const AppHeader: React.FC<Props> = ({
  view,
  onNavigate,
  busy,
  onOpenPalette,
  onOpenShortcuts,
  onOpenSettings,
  children,
}) => (
  <div className="h-14 bg-black border-b border-zinc-800 flex items-center px-4 justify-between z-20 shrink-0 gap-2">
    <div className="flex items-center gap-3 min-w-0">
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-8 h-8 bg-lime-800 rounded-lg flex items-center justify-center">
          <Icons.Layers size={18} className="text-white" />
        </div>
        <h1 className="font-bold text-lg tracking-tight text-white hidden md:block">
          Chroma<span className="text-lime-500">Canvas</span>
        </h1>
      </div>
      <div className="h-6 w-[1px] bg-zinc-800 shrink-0" />
      <div className="flex items-center gap-1 bg-zinc-900/70 border border-zinc-800 rounded-lg p-1 shrink-0">
        {PAGES.map((page) => {
          const isActive = view === page.id;
          const locked = busy && !isActive;
          return (
            <button
              key={page.id}
              onClick={() => !locked && onNavigate(page.id)}
              disabled={locked}
              title={locked ? 'Stop recording/streaming to switch pages' : page.hint}
              className={`flex items-center gap-2 px-3 py-1 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                isActive
                  ? 'bg-lime-900/60 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              {page.icon}
              <span className="font-bold text-xs tracking-tight whitespace-nowrap">
                {page.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>

    <div className="flex items-center gap-1.5">
      {children}
      <IconButton title="Command palette (⌘K)" onClick={onOpenPalette}>
        <Icons.Command size={14} />
      </IconButton>
      <IconButton title="Keyboard shortcuts (?)" onClick={onOpenShortcuts}>
        <Icons.Help size={14} />
      </IconButton>
      <IconButton title="Settings" onClick={onOpenSettings}>
        <Icons.Settings size={14} />
      </IconButton>
    </div>
  </div>
);
