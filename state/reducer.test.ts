import { describe, expect, it } from 'vitest';
import { initialState, reducer } from './reducer';
import { CanvasElement, EditorState, ElementType } from '../types';
import { createElement } from '../utils/elements';

const makeClip = (overrides: Partial<CanvasElement> = {}): CanvasElement =>
  createElement({
    type: ElementType.VIDEO,
    name: 'clip',
    startTime: 0,
    duration: 10,
    sourceDuration: 30,
    ...overrides,
  });

const withElements = (...elements: CanvasElement[]): EditorState => ({
  ...initialState,
  elements,
});

describe('reducer', () => {
  it('ADD_ELEMENT selects the new element and grows the project duration', () => {
    const el = makeClip({ startTime: 100, duration: 20 });
    const next = reducer(initialState, { type: 'ADD_ELEMENT', payload: el });
    expect(next.selectedIds).toEqual([el.id]);
    expect(next.duration).toBeGreaterThanOrEqual(120);
  });

  it('SPLIT_CLIP accounts for playbackRate in the second part trim', () => {
    const el = makeClip({ startTime: 0, duration: 10, playbackRate: 2, trimStart: 5 });
    const state = { ...withElements(el), currentTime: 4 };
    const next = reducer(state, { type: 'SPLIT_CLIP', payload: el.id });
    expect(next.elements).toHaveLength(2);
    const [part1, part2] = next.elements;
    expect(part1.duration).toBe(4);
    expect(part2.startTime).toBe(4);
    expect(part2.duration).toBe(6);
    // 4 timeline seconds at 2x consumed 8 source seconds.
    expect(part2.trimStart).toBe(13);
  });

  it('SPLIT_CLIP ignores a playhead outside the clip', () => {
    const el = makeClip({ startTime: 5, duration: 10 });
    const state = { ...withElements(el), currentTime: 2 };
    const next = reducer(state, { type: 'SPLIT_CLIP', payload: el.id });
    expect(next.elements).toHaveLength(1);
  });

  it('EXTRACT_AUDIO mutes the video and adds an audio clip above it', () => {
    const el = makeClip({ volume: 0.8, trackId: 1 });
    const state = withElements(el);
    const next = reducer(state, { type: 'EXTRACT_AUDIO', payload: el.id });
    expect(next.elements).toHaveLength(2);
    const video = next.elements.find((e) => e.type === ElementType.VIDEO);
    const audio = next.elements.find((e) => e.type === ElementType.AUDIO);
    expect(video?.volume).toBe(0);
    expect(audio?.volume).toBe(0.8);
    expect(audio?.trackId).toBe(2);
  });

  it('PASTE_CLIPBOARD pastes relative to the playhead and keeps offsets', () => {
    const a = makeClip({ startTime: 2, duration: 3 });
    const b = makeClip({ startTime: 4, duration: 3 });
    const state: EditorState = {
      ...withElements(),
      clipboard: [a, b],
      currentTime: 10,
    };
    const next = reducer(state, { type: 'PASTE_CLIPBOARD' });
    expect(next.elements).toHaveLength(2);
    const starts = next.elements.map((e) => e.startTime).sort((x, y) => x - y);
    expect(starts).toEqual([10, 12]);
    expect(next.selectedIds).toHaveLength(2);
  });

  it('DUPLICATE_SELECTED places copies right after the originals', () => {
    const el = makeClip({ startTime: 5, duration: 4 });
    const state = { ...withElements(el), selectedIds: [el.id] };
    const next = reducer(state, { type: 'DUPLICATE_SELECTED' });
    expect(next.elements).toHaveLength(2);
    const dupe = next.elements.find((e) => e.id !== el.id);
    expect(dupe?.startTime).toBe(9);
  });

  it('NUDGE_SELECTED clamps to zero', () => {
    const el = makeClip({ startTime: 0.05 });
    const state = { ...withElements(el), selectedIds: [el.id] };
    const next = reducer(state, { type: 'NUDGE_SELECTED', payload: { deltaTime: -1 } });
    expect(next.elements[0].startTime).toBe(0);
  });

  it('SET_TRACK_META merges changes with defaults', () => {
    const next = reducer(initialState, {
      type: 'SET_TRACK_META',
      payload: { trackId: 2, changes: { muted: true } },
    });
    expect(next.tracks[2]).toEqual({ muted: true, locked: false, hidden: false });
  });

  it('CUT_SELECTED removes elements and fills the clipboard', () => {
    const el = makeClip();
    const state = { ...withElements(el), selectedIds: [el.id] };
    const next = reducer(state, { type: 'CUT_SELECTED' });
    expect(next.elements).toHaveLength(0);
    expect(next.clipboard).toHaveLength(1);
  });
});
