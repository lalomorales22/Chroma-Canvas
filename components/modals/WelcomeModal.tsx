import React from 'react';
import { Icons } from '../Icon';

interface Props {
  onStartRecording: () => void;
  onStartEditing: () => void;
  onLoadDemo: () => void;
}

export const WelcomeModal: React.FC<Props> = ({ onStartRecording, onStartEditing, onLoadDemo }) => (
  <div className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
    <div className="w-full max-w-xl bg-zinc-950 border border-zinc-800 rounded-2xl p-8 space-y-6 text-center">
      <div className="flex items-center justify-center gap-3">
        <div className="w-12 h-12 bg-lime-800 rounded-xl flex items-center justify-center">
          <Icons.Layers size={26} className="text-white" />
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Chroma<span className="text-lime-500">Canvas</span>
        </h1>
      </div>
      <p className="text-sm text-zinc-400 leading-relaxed">
        Record your screen, camera, and mics in the <span className="text-white">Recorder
        Studio</span>, cut it all together in the <span className="text-white">Media
        Editor</span>, and browse everything in the <span className="text-white">Gallery</span>.
        Everything autosaves to this browser.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          className="group p-5 bg-lime-950/60 hover:bg-lime-900/60 border border-lime-700/50 hover:border-lime-500 rounded-xl text-left transition-colors"
          onClick={onStartRecording}
        >
          <Icons.Circle size={20} className="text-red-500 fill-red-500 mb-2" />
          <div className="text-sm font-bold text-white">Start Recording</div>
          <div className="text-[11px] text-zinc-400 mt-1">
            Capture screen, webcam & mic in the Recorder Studio.
          </div>
        </button>
        <button
          className="group p-5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-lime-500/50 rounded-xl text-left transition-colors"
          onClick={onStartEditing}
        >
          <Icons.Scissors size={20} className="text-lime-500 mb-2" />
          <div className="text-sm font-bold text-white">Media Editor</div>
          <div className="text-[11px] text-zinc-500 mt-1">
            Jump straight to editing with your own media.
          </div>
        </button>
        <button
          className="group p-5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-lime-500/50 rounded-xl text-left transition-colors"
          onClick={onLoadDemo}
        >
          <Icons.Film size={20} className="text-lime-500 mb-2" />
          <div className="text-sm font-bold text-white">Load Demo</div>
          <div className="text-[11px] text-zinc-500 mt-1">
            Sample clips + music, ready to play with.
          </div>
        </button>
      </div>
      <p className="text-[11px] text-zinc-600">
        Tip: press <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-300">?</kbd> anytime
        for keyboard shortcuts,{' '}
        <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-300">⌘K</kbd> for the command
        palette.
      </p>
    </div>
  </div>
);
