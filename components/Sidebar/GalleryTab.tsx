import React, { useState } from 'react';
import { EditorDispatch, EditorState, ElementType } from '../../types';
import { Icons } from '../Icon';
import { toast } from '../ui/Toast';
import { generateVideo, hasApiKey } from '../../services/geminiService';
import {
  IMAGE_PROVIDERS,
  ImageProvider,
  generateImageBlob,
  getImageProvider,
  providerIsReady,
  setImageProvider,
} from '../../services/imageGen';
import { importBlob } from '../../services/storage';
import { getMediaDuration } from '../../utils/media';
import { createLibraryItem } from '../../utils/elements';
import { importFiles, setDragData } from '../../utils/importFiles';
import { DEFAULT_IMAGE_DURATION } from '../../constants';

interface Props {
  state: EditorState;
  dispatch: EditorDispatch;
  onOpenSettings: () => void;
  onItemContextMenu: (e: React.MouseEvent, id: string) => void;
}

const Section: React.FC<{
  title: string;
  icon: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ title, icon, open, onToggle, children }) => (
  <div>
    <button
      className="w-full flex items-center justify-between text-xs font-bold text-gray-500 uppercase tracking-wider mb-2"
      onClick={onToggle}
    >
      <span className="flex items-center gap-2">
        {icon} {title}
      </span>
      <span className="text-gray-600">{open ? '▼' : '▶'}</span>
    </button>
    {open && children}
  </div>
);

export const GalleryTab: React.FC<Props> = ({
  state,
  dispatch,
  onOpenSettings,
  onItemContextMenu,
}) => {
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [genStage, setGenStage] = useState('');
  const [targetAspectRatio, setTargetAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [provider, setProvider] = useState<ImageProvider>(getImageProvider());

  const changeProvider = (p: ImageProvider) => {
    setProvider(p);
    setImageProvider(p);
  };

  const [isVideosOpen, setIsVideosOpen] = useState(true);
  const [isImagesOpen, setIsImagesOpen] = useState(true);
  const [isAudioOpen, setIsAudioOpen] = useState(true);

  const handleAiGenerate = async (kind: 'image' | 'text' | 'video') => {
    if (!aiPrompt) return;
    if (kind === 'video' && !hasApiKey()) {
      toast('Video generation uses Veo — add a Gemini API key in Settings.', 'error');
      onOpenSettings();
      return;
    }
    if (kind !== 'video' && !providerIsReady(provider)) {
      const label = IMAGE_PROVIDERS.find((p) => p.id === provider)?.label ?? provider;
      toast(`${label} needs an API key — add one in Settings, or switch to Free.`, 'error');
      onOpenSettings();
      return;
    }

    setIsGenerating(true);
    setGenStage(kind === 'video' ? 'Starting Veo…' : 'Generating…');
    const promptStr = aiPrompt;

    try {
      if (kind === 'video') {
        const videoUrl = await generateVideo(promptStr, targetAspectRatio, setGenStage);
        // Persist the generated clip so it survives refresh.
        const blob = await fetch(videoUrl).then((r) => r.blob());
        const { mediaId, url } = await importBlob(blob);
        URL.revokeObjectURL(videoUrl);
        const duration = await getMediaDuration(url, ElementType.VIDEO);
        dispatch({
          type: 'ADD_LIBRARY_ITEM',
          payload: createLibraryItem({
            type: ElementType.VIDEO,
            src: url,
            mediaId,
            name: `AI: ${promptStr}`,
            category: 'VIDEO',
            duration,
          }),
        });
        toast('Video generated and added to Gallery.', 'success');
      } else {
        const finalPrompt =
          kind === 'text'
            ? `Typography design of the word "${promptStr}" in a colorful, fun, creative graffiti style, isolated on a white background. Vector art sticker.`
            : promptStr;
        const blob = await generateImageBlob(provider, finalPrompt, targetAspectRatio);
        const { mediaId, url } = await importBlob(blob);
        dispatch({
          type: 'ADD_LIBRARY_ITEM',
          payload: createLibraryItem({
            type: ElementType.IMAGE,
            src: url,
            mediaId,
            name: kind === 'text' ? `Art: ${promptStr}` : promptStr,
            category: 'IMAGE',
            duration: DEFAULT_IMAGE_DURATION,
          }),
        });
        toast('Image added to Gallery.', 'success');
      }
      setAiPrompt('');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'AI generation failed.', 'error');
    } finally {
      setIsGenerating(false);
      setGenStage('');
    }
  };

  const handleUpload = async (files: File[]) => {
    if (!files.length) return;
    try {
      const items = await importFiles(files, 'IMAGE');
      dispatch({ type: 'ADD_LIBRARY_ITEMS', payload: items });
    } catch {
      toast('Import failed for one or more files.', 'error');
    }
  };

  const getFiltered = (category: string) => state.library.filter((i) => i.category === category);

  return (
    <div className="space-y-6">
      {/* Image Generator Studio */}
      <div className="bg-gradient-to-br from-zinc-900 to-black p-4 rounded-xl border border-zinc-800">
        <div className="flex items-center justify-between mb-3 gap-2">
          <div className="flex items-center gap-2 text-lime-400 min-w-0">
            <Icons.Magic className="w-4 h-4 shrink-0" />
            <span className="text-xs font-bold uppercase tracking-wider truncate">
              Image Generator Studio
            </span>
          </div>
          <div className="flex gap-1 bg-black/40 p-1 rounded-lg border border-white/5 shrink-0">
            {(['16:9', '9:16'] as const).map((ratio) => (
              <button
                key={ratio}
                onClick={() => setTargetAspectRatio(ratio)}
                className={`p-1 rounded text-[10px] font-bold transition-all ${
                  targetAspectRatio === ratio
                    ? 'bg-lime-800 text-white'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {ratio}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 mb-3">
          <label className="text-[10px] text-zinc-500 uppercase font-bold shrink-0">Engine</label>
          <select
            value={provider}
            onChange={(e) => changeProvider(e.target.value as ImageProvider)}
            className="flex-1 bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-lime-500"
          >
            {IMAGE_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <textarea
          className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-lime-500 resize-none h-16 mb-3"
          placeholder="Describe an asset to generate…"
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <button
            disabled={isGenerating || !aiPrompt}
            onClick={() => handleAiGenerate('image')}
            className="flex-1 min-w-[80px] py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 rounded-lg text-xs font-medium text-white transition-colors flex items-center justify-center gap-2 border border-white/5"
          >
            <Icons.Image size={12} /> Image
          </button>
          <button
            disabled={isGenerating || !aiPrompt}
            onClick={() => handleAiGenerate('video')}
            className="flex-1 min-w-[80px] py-2 bg-lime-900 hover:bg-lime-800 disabled:opacity-50 rounded-lg text-xs font-medium text-lime-200 transition-colors flex items-center justify-center gap-2 border border-lime-700/50"
          >
            <Icons.Video size={12} /> Video
          </button>
          <button
            disabled={isGenerating || !aiPrompt}
            onClick={() => handleAiGenerate('text')}
            className="flex-1 min-w-[80px] py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 rounded-lg text-xs font-medium text-white transition-colors flex items-center justify-center gap-2 border border-white/5"
          >
            <Icons.Type size={12} /> Text Art
          </button>
        </div>
        {isGenerating && (
          <div className="mt-3 flex items-center gap-2 text-[10px] text-lime-500 font-bold">
            <Icons.Spinner className="w-3 h-3 animate-spin" />
            {genStage || 'Crafting your masterpiece…'}
          </div>
        )}
        {!isGenerating && !providerIsReady(provider) && (
          <button
            className="mt-3 text-[10px] text-zinc-500 hover:text-lime-400 flex items-center gap-1.5"
            onClick={onOpenSettings}
          >
            <Icons.Settings size={10} /> This engine needs an API key — click to add one, or
            switch to Free
          </button>
        )}
        {!isGenerating && provider === 'pollinations' && (
          <p className="mt-3 text-[10px] text-zinc-600">
            Free engine — no key needed. Video generation always uses Gemini Veo.
          </p>
        )}
      </div>

      {/* Upload dropzone */}
      <label
        className="block border-2 border-dashed border-zinc-800 rounded-xl p-6 text-center hover:border-lime-500/50 hover:bg-white/5 transition-colors cursor-pointer"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleUpload(Array.from(e.dataTransfer.files));
        }}
      >
        <input
          type="file"
          multiple
          accept="video/*,audio/*,image/*"
          className="hidden"
          onChange={(e) => {
            handleUpload(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
        <Icons.Upload className="w-8 h-8 text-gray-500 mx-auto mb-2" />
        <p className="text-xs text-gray-400">
          Drop videos, images, or audio here
          <br />
          (or click to browse)
        </p>
      </label>

      <div className="space-y-4">
        <Section
          title="Videos"
          icon={<Icons.Play size={10} />}
          open={isVideosOpen}
          onToggle={() => setIsVideosOpen(!isVideosOpen)}
        >
          <div className="grid grid-cols-2 gap-2">
            {getFiltered('VIDEO').map((item) => (
              <div
                key={item.id}
                draggable
                onDragStart={(e) => setDragData(e, item)}
                onContextMenu={(e) => onItemContextMenu(e, item.id)}
                className="bg-black border border-zinc-800 p-2 rounded cursor-grab hover:border-lime-500 transition-colors group relative"
              >
                <div className="aspect-video bg-[#0f0f11] mb-1 rounded overflow-hidden relative">
                  <video
                    src={item.src}
                    preload="metadata"
                    className="w-full h-full object-cover opacity-60 group-hover:opacity-100"
                  />
                </div>
                <p className="text-[10px] text-gray-300 truncate">{item.name}</p>
              </div>
            ))}
            {getFiltered('VIDEO').length === 0 && (
              <p className="col-span-2 text-[10px] text-zinc-600 text-center py-2">
                No videos yet — upload or record some.
              </p>
            )}
          </div>
        </Section>

        <Section
          title="Images"
          icon={<Icons.Image size={10} />}
          open={isImagesOpen}
          onToggle={() => setIsImagesOpen(!isImagesOpen)}
        >
          <div className="grid grid-cols-2 gap-2">
            {[...getFiltered('IMAGE'), ...getFiltered('OVERLAY')].map((item) => (
              <div
                key={item.id}
                draggable
                onDragStart={(e) => setDragData(e, item)}
                onContextMenu={(e) => onItemContextMenu(e, item.id)}
                className="bg-black border border-zinc-800 p-2 rounded cursor-grab hover:border-lime-500 transition-colors group relative"
              >
                <div className="aspect-video bg-[#0f0f11] mb-1 rounded overflow-hidden relative">
                  <img
                    src={item.src}
                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100"
                    alt=""
                  />
                </div>
                <p className="text-[10px] text-gray-300 truncate">{item.name}</p>
              </div>
            ))}
            {getFiltered('IMAGE').length + getFiltered('OVERLAY').length === 0 && (
              <p className="col-span-2 text-[10px] text-zinc-600 text-center py-2">
                No images yet — try the Image Generator Studio above.
              </p>
            )}
          </div>
        </Section>

        <Section
          title="Audio"
          icon={<Icons.Music size={10} />}
          open={isAudioOpen}
          onToggle={() => setIsAudioOpen(!isAudioOpen)}
        >
          <div className="space-y-2">
            {getFiltered('AUDIO').map((item) => (
              <div
                key={item.id}
                draggable
                onDragStart={(e) => setDragData(e, item)}
                onContextMenu={(e) => onItemContextMenu(e, item.id)}
                className="bg-black border border-zinc-800 p-2 rounded cursor-grab hover:border-lime-500 transition-colors flex items-center gap-3 relative"
              >
                <div className="w-8 h-8 bg-lime-900/20 rounded flex items-center justify-center shrink-0">
                  <Icons.Music size={14} className="text-lime-500" />
                </div>
                <p className="text-xs text-gray-300 truncate flex-1">{item.name}</p>
              </div>
            ))}
            {getFiltered('AUDIO').length === 0 && (
              <p className="text-[10px] text-zinc-600 text-center py-2">
                No audio yet — drop in an MP3.
              </p>
            )}
          </div>
        </Section>
      </div>
    </div>
  );
};
