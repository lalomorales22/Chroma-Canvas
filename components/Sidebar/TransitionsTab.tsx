import React from 'react';
import { ElementType } from '../../types';
import { Icons } from '../Icon';

const PIXEL_BLACK =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const PIXEL_WHITE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';

const TRANSITIONS = [
  {
    name: 'Fade Black',
    src: PIXEL_BLACK,
    color: 'bg-black',
    icon: <div className="w-4 h-4 bg-black border border-white/20" />,
  },
  {
    name: 'Fade White',
    src: PIXEL_WHITE,
    color: 'bg-white',
    icon: <div className="w-4 h-4 bg-white" />,
  },
  {
    name: 'Glitch',
    src: PIXEL_BLACK,
    color: 'bg-purple-950',
    icon: <Icons.Signal size={14} className="text-purple-400" />,
  },
  {
    name: 'Spin',
    src: PIXEL_BLACK,
    color: 'bg-blue-950',
    icon: <Icons.Maximize size={14} className="text-blue-400" />,
  },
  {
    name: 'Swipe Left',
    src: PIXEL_BLACK,
    color: 'bg-zinc-900',
    icon: <Icons.Back size={14} className="text-gray-400" />,
  },
  {
    name: 'Swipe Right',
    src: PIXEL_BLACK,
    color: 'bg-zinc-900',
    icon: <Icons.Back size={14} className="text-gray-400 rotate-180" />,
  },
];

export const TransitionsTab: React.FC = () => (
  <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3">
      {TRANSITIONS.map((t, i) => (
        <div
          key={i}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('type', ElementType.IMAGE);
            e.dataTransfer.setData('src', t.src);
            e.dataTransfer.setData('name', t.name);
            e.dataTransfer.setData('duration', '1');
          }}
          className={`group relative h-20 ${t.color} rounded-xl border border-zinc-800 hover:border-lime-500 cursor-grab flex flex-col items-center justify-center gap-2 overflow-hidden transition-all shadow-lg hover:shadow-lime-500/10`}
        >
          <div className="z-10 bg-black/40 p-2 rounded-full backdrop-blur-sm group-hover:scale-110 transition-transform">
            {t.icon}
          </div>
          <span className="text-[10px] font-bold text-white z-10 tracking-tight uppercase group-hover:text-lime-400 transition-colors drop-shadow-md">
            {t.name}
          </span>
        </div>
      ))}
    </div>

    <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl mt-4 space-y-2">
      <div className="flex items-center gap-2 text-zinc-400">
        <Icons.Magic size={12} />
        <span className="text-[10px] font-bold uppercase">Two ways to transition</span>
      </div>
      <p className="text-[10px] text-zinc-500 leading-relaxed">
        1. Drag a stinger above your clips for wipes, spins, and dips.
        <br />
        2. Right-click a clip → <span className="text-zinc-300">Crossfade with next</span> to
        overlap it with the following clip automatically.
      </p>
    </div>
  </div>
);
