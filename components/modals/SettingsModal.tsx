import React, { useState } from 'react';
import { Icons } from '../Icon';
import { getApiKey, setApiKey, testApiKey } from '../../services/geminiService';
import {
  IMAGE_PROVIDERS,
  ImageProvider,
  getImageProvider,
  getOpenAiKey,
  setImageProvider,
  setOpenAiKey,
} from '../../services/imageGen';
import { toast } from '../ui/Toast';

interface Props {
  onClose: () => void;
}

export const SettingsModal: React.FC<Props> = ({ onClose }) => {
  const [geminiKey, setGeminiKey] = useState(getApiKey());
  const [openAiKey, setOpenAiKeyState] = useState(getOpenAiKey());
  const [provider, setProvider] = useState<ImageProvider>(getImageProvider());
  const [testing, setTesting] = useState(false);

  const handleSave = async () => {
    setApiKey(geminiKey.trim());
    setOpenAiKey(openAiKey.trim());
    setImageProvider(provider);

    if (geminiKey.trim()) {
      setTesting(true);
      try {
        await testApiKey(geminiKey.trim());
        toast('Settings saved — Gemini key works.', 'success');
        onClose();
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Gemini key test failed.', 'error');
      } finally {
        setTesting(false);
      }
    } else {
      toast('Settings saved.', 'success');
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto custom-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Icons.Settings size={18} className="text-lime-500" /> Settings
          </h2>
          <button className="text-zinc-500 hover:text-white" onClick={onClose}>
            <Icons.X size={18} />
          </button>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Default Image Generator
          </label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as ImageProvider)}
            className="w-full bg-black border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-lime-500"
          >
            {IMAGE_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
                {p.needsKey ? ' — needs API key' : ' — no key needed'}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            The Free option (Pollinations.ai) works with no account or key. You can also switch
            providers right in the Image Generator Studio.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Gemini API Key
          </label>
          <input
            type="password"
            value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value)}
            placeholder="AIza..."
            className="w-full bg-black border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-lime-500 font-mono"
          />
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            Powers Veo video generation, background removal, AI image edits, and captions. Free
            key at{' '}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
              className="text-lime-500 hover:underline"
            >
              aistudio.google.com/apikey
            </a>
            . Veo needs a key from a paid project.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            OpenAI API Key <span className="text-zinc-600 normal-case">(optional)</span>
          </label>
          <input
            type="password"
            value={openAiKey}
            onChange={(e) => setOpenAiKeyState(e.target.value)}
            placeholder="sk-..."
            className="w-full bg-black border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-lime-500 font-mono"
          />
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            Enables OpenAI image generation (gpt-image-1, DALL·E 3 fallback). Keys are stored
            only in this browser.
          </p>
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <button
            className="px-4 py-2 text-sm text-zinc-400 hover:text-white rounded-lg"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="px-5 py-2 bg-white text-black text-sm font-bold rounded-lg hover:bg-zinc-200 disabled:opacity-50 flex items-center gap-2"
            onClick={handleSave}
            disabled={testing}
          >
            {testing && <Icons.Spinner size={14} className="animate-spin" />}
            {testing ? 'Testing…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};
