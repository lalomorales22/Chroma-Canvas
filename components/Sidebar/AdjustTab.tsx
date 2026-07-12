import React, { useState } from 'react';
import {
  CanvasElement,
  EditorDispatch,
  EditorState,
  ElementType,
  NEUTRAL_FILTERS,
} from '../../types';
import { Icons } from '../Icon';
import { FONT_FAMILIES } from '../../constants';
import { toast } from '../ui/Toast';
import { editImage, hasApiKey, transcribeToCaptions } from '../../services/geminiService';
import { importBlob } from '../../services/storage';
import { blobToDataURL, dataURLToBlob } from '../../utils/media';
import { createElement } from '../../utils/elements';

interface Props {
  state: EditorState;
  dispatch: EditorDispatch;
}

const Slider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display?: string;
  onChange: (v: number) => void;
}> = ({ label, value, min, max, step, display, onChange }) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between">
      <label className="text-[10px] text-gray-400 uppercase">{label}</label>
      {display && <span className="text-[10px] text-gray-500 font-mono">{display}</span>}
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full accent-lime-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
    />
  </div>
);

export const AdjustTab: React.FC<Props> = ({ state, dispatch }) => {
  const [aiEditPrompt, setAiEditPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState<false | 'edit' | 'captions'>(false);

  const selectedElement = state.elements.find((e) => e.id === state.selectedIds[0]);
  const isMultiSelect = state.selectedIds.length > 1;

  if (!selectedElement) {
    return (
      <div className="text-center py-10 text-gray-500 text-sm">
        Select a clip on the timeline (or in the preview) to adjust it.
      </div>
    );
  }

  const updateProperty = (key: keyof CanvasElement, value: unknown) => {
    dispatch({
      type: 'UPDATE_ELEMENTS',
      payload: { ids: state.selectedIds, changes: { [key]: value } },
    });
  };

  const updateFilter = (key: keyof typeof NEUTRAL_FILTERS, value: number) => {
    const current = selectedElement.filters ?? NEUTRAL_FILTERS;
    updateProperty('filters', { ...current, [key]: value });
  };

  const handleSpeedChange = (newRate: number) => {
    state.selectedIds.forEach((id) => {
      const el = state.elements.find((e) => e.id === id);
      if (el) {
        const currentRate = el.playbackRate || 1;
        const contentLength = el.duration * currentRate;
        dispatch({
          type: 'UPDATE_ELEMENT',
          payload: {
            id,
            changes: { playbackRate: newRate, duration: contentLength / newRate },
          },
        });
      }
    });
  };

  const handleAiEdit = async () => {
    if (!selectedElement.src || !aiEditPrompt) return;
    if (!hasApiKey()) {
      toast('Add a Gemini API key in Settings to use AI editing.', 'error');
      return;
    }
    setAiBusy('edit');
    try {
      const blob = await fetch(selectedElement.src).then((r) => r.blob());
      const base64 = await blobToDataURL(blob);
      const resultDataUrl = await editImage(base64, blob.type, aiEditPrompt);
      const newBlob = await dataURLToBlob(resultDataUrl);
      const { mediaId, url } = await importBlob(newBlob);
      dispatch({
        type: 'UPDATE_ELEMENT',
        payload: {
          id: selectedElement.id,
          changes: { src: url, mediaId, name: `${selectedElement.name} (AI)` },
        },
      });
      setAiEditPrompt('');
      toast('Image updated with AI edit.', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'AI edit failed.', 'error');
    } finally {
      setAiBusy(false);
    }
  };

  const handleGenerateCaptions = async () => {
    if (!selectedElement.src) return;
    if (!hasApiKey()) {
      toast('Add a Gemini API key in Settings to generate captions.', 'error');
      return;
    }
    setAiBusy('captions');
    try {
      const blob = await fetch(selectedElement.src).then((r) => r.blob());
      if (blob.size > 18 * 1024 * 1024) {
        throw new Error('Clip is too large for captioning (max ~18MB). Try a shorter clip.');
      }
      const base64 = await blobToDataURL(blob);
      const mime = blob.type || 'audio/mp3';
      toast('Transcribing audio — this can take a moment…', 'info');
      const segments = await transcribeToCaptions(base64, mime);
      if (!segments.length) {
        toast('No speech detected in this clip.', 'info');
        return;
      }
      const el = selectedElement;
      const rate = el.playbackRate || 1;
      const captionTrack = el.trackId + 1;
      let added = 0;
      segments.forEach((seg) => {
        // Map source-audio time -> timeline time, respecting trim + speed.
        const start = el.startTime + (seg.start - el.trimStart) / rate;
        const end = el.startTime + (seg.end - el.trimStart) / rate;
        if (end < el.startTime || start > el.startTime + el.duration) return;
        dispatch({
          type: 'ADD_ELEMENT',
          payload: createElement({
            type: ElementType.TEXT,
            name: 'Caption',
            text: seg.text,
            startTime: Math.max(el.startTime, start),
            duration: Math.max(0.5, Math.min(end, el.startTime + el.duration) - Math.max(el.startTime, start)),
            trackId: captionTrack,
            fontSize: 32,
            y: 260,
          }),
        });
        added += 1;
      });
      toast(`Added ${added} caption${added === 1 ? '' : 's'} to track ${captionTrack + 1}.`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Caption generation failed.', 'error');
    } finally {
      setAiBusy(false);
    }
  };

  const isMedia =
    selectedElement.type === ElementType.VIDEO || selectedElement.type === ElementType.AUDIO;
  const isVisual =
    selectedElement.type === ElementType.VIDEO || selectedElement.type === ElementType.IMAGE;
  const filters = selectedElement.filters ?? NEUTRAL_FILTERS;

  return (
    <div className="space-y-6">
      {isMultiSelect && (
        <div className="bg-lime-900/20 border border-lime-500/50 p-2 rounded text-xs text-lime-200 text-center">
          Adjusting {state.selectedIds.length} items
        </div>
      )}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-white border-b border-zinc-800 pb-2 truncate">
          {isMultiSelect ? 'Multiple Selection' : selectedElement.name}
        </h3>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-[10px] text-gray-400 uppercase">Pos X</label>
            <input
              type="number"
              step="10"
              value={Math.round(selectedElement.x || 0)}
              onChange={(e) => updateProperty('x', parseFloat(e.target.value) || 0)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-white"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-gray-400 uppercase">Pos Y</label>
            <input
              type="number"
              step="10"
              value={Math.round(selectedElement.y || 0)}
              onChange={(e) => updateProperty('y', parseFloat(e.target.value) || 0)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-white"
            />
          </div>
        </div>

        <Slider
          label="Opacity"
          value={selectedElement.opacity}
          min={0}
          max={1}
          step={0.05}
          display={`${Math.round(selectedElement.opacity * 100)}%`}
          onChange={(v) => updateProperty('opacity', v)}
        />
        <Slider
          label="Scale"
          value={selectedElement.scale}
          min={0.1}
          max={3}
          step={0.05}
          display={`${Math.round(selectedElement.scale * 100)}%`}
          onChange={(v) => updateProperty('scale', v)}
        />
        <Slider
          label="Rotation"
          value={selectedElement.rotation}
          min={-180}
          max={180}
          step={1}
          display={`${Math.round(selectedElement.rotation)}°`}
          onChange={(v) => updateProperty('rotation', v)}
        />

        {/* Text styling */}
        {selectedElement.type === ElementType.TEXT && (
          <div className="space-y-3 pt-2 border-t border-zinc-800">
            <Slider
              label="Font Size"
              value={selectedElement.fontSize || 40}
              min={10}
              max={200}
              step={1}
              display={`${selectedElement.fontSize || 40}px`}
              onChange={(v) => updateProperty('fontSize', v)}
            />
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] text-gray-400 uppercase">Font</label>
                <select
                  value={selectedElement.fontFamily || FONT_FAMILIES[0].value}
                  onChange={(e) => updateProperty('fontFamily', e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-xs text-white"
                >
                  {FONT_FAMILIES.map((f) => (
                    <option key={f.label} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-gray-400 uppercase">Color</label>
                <input
                  type="color"
                  value={selectedElement.color || '#ffffff'}
                  onChange={(e) => updateProperty('color', e.target.value)}
                  className="w-full h-7 bg-zinc-900 border border-zinc-800 rounded cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}

        {/* Color filters */}
        {isVisual && (
          <div className="space-y-3 pt-2 border-t border-zinc-800">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-gray-400 uppercase flex items-center gap-2">
                <Icons.Sliders size={12} /> Filters
              </label>
              <button
                className="text-[10px] text-zinc-500 hover:text-white"
                onClick={() => updateProperty('filters', undefined)}
              >
                Reset
              </button>
            </div>
            <Slider
              label="Brightness"
              value={filters.brightness}
              min={0.2}
              max={2}
              step={0.05}
              onChange={(v) => updateFilter('brightness', v)}
            />
            <Slider
              label="Contrast"
              value={filters.contrast}
              min={0.2}
              max={2}
              step={0.05}
              onChange={(v) => updateFilter('contrast', v)}
            />
            <Slider
              label="Saturation"
              value={filters.saturate}
              min={0}
              max={2}
              step={0.05}
              onChange={(v) => updateFilter('saturate', v)}
            />
            <Slider
              label="Blur"
              value={filters.blur}
              min={0}
              max={20}
              step={0.5}
              display={`${filters.blur}px`}
              onChange={(v) => updateFilter('blur', v)}
            />
          </div>
        )}

        {/* Media controls */}
        {isMedia && (
          <div className="space-y-3 pt-2 border-t border-zinc-800">
            <Slider
              label="Volume"
              value={selectedElement.volume}
              min={0}
              max={1}
              step={0.05}
              display={`${Math.round(selectedElement.volume * 100)}%`}
              onChange={(v) => updateProperty('volume', v)}
            />
            <Slider
              label="Speed"
              value={selectedElement.playbackRate || 1}
              min={0.25}
              max={8}
              step={0.25}
              display={`${selectedElement.playbackRate || 1}x`}
              onChange={handleSpeedChange}
            />
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] text-gray-400 uppercase">Fade In (s)</label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="0.5"
                  value={selectedElement.fadeIn || 0}
                  onChange={(e) => updateProperty('fadeIn', parseFloat(e.target.value) || 0)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-gray-400 uppercase">Fade Out (s)</label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="0.5"
                  value={selectedElement.fadeOut || 0}
                  onChange={(e) => updateProperty('fadeOut', parseFloat(e.target.value) || 0)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-white"
                />
              </div>
            </div>
          </div>
        )}

        {/* AI tools */}
        {selectedElement.type === ElementType.IMAGE && (
          <div className="space-y-2 pt-2 border-t border-zinc-800">
            <label className="text-[10px] text-gray-400 uppercase flex items-center gap-2">
              <Icons.Sparkles size={12} /> AI Edit (Gemini)
            </label>
            <textarea
              value={aiEditPrompt}
              onChange={(e) => setAiEditPrompt(e.target.value)}
              placeholder='e.g. "make the sky purple", "add falling snow"'
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-lime-500 resize-none h-14"
            />
            <button
              disabled={aiBusy !== false || !aiEditPrompt}
              onClick={handleAiEdit}
              className="w-full py-2 bg-lime-900 hover:bg-lime-800 disabled:opacity-50 text-xs text-lime-200 rounded border border-lime-700/50 flex items-center justify-center gap-2"
            >
              {aiBusy === 'edit' ? (
                <Icons.Spinner size={12} className="animate-spin" />
              ) : (
                <Icons.Magic size={12} />
              )}
              Apply AI Edit
            </button>
          </div>
        )}

        {isMedia && (
          <div className="pt-2 border-t border-zinc-800 space-y-2">
            <button
              disabled={aiBusy !== false}
              onClick={handleGenerateCaptions}
              className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-xs text-white rounded border border-zinc-800 flex items-center justify-center gap-2"
            >
              {aiBusy === 'captions' ? (
                <Icons.Spinner size={12} className="animate-spin" />
              ) : (
                <Icons.Captions size={12} />
              )}
              Generate Captions (AI)
            </button>
            {selectedElement.type === ElementType.VIDEO && (
              <button
                className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 text-xs text-white rounded border border-zinc-800 flex items-center justify-center gap-2"
                onClick={() =>
                  dispatch({ type: 'EXTRACT_AUDIO', payload: selectedElement.id })
                }
              >
                <Icons.Music size={12} /> Extract Audio (mutes video)
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
