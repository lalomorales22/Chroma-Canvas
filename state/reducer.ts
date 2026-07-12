import {
  CanvasElement,
  DEFAULT_TRACK_META,
  EditorAction,
  EditorState,
  ElementType,
} from '../types';
import { DEFAULT_ZOOM, MAX_ZOOM, MIN_ZOOM } from '../constants';
import { uid } from '../utils/id';
import { maxClipDuration } from '../utils/elements';

export const initialState: EditorState = {
  elements: [],
  library: [],
  currentTime: 0,
  isPlaying: false,
  zoom: DEFAULT_ZOOM,
  selectedIds: [],
  duration: 60,
  canvasMode: 'landscape',
  seekVersion: 0,
  clipboard: null,
  view: 'EDITOR',
  isAutoFit: false,
  fitVersion: 0,
  tracks: {},
  snapping: true,
};

const grownDuration = (state: EditorState, elements: CanvasElement[]): number => {
  const contentEnd = elements.reduce((max, el) => Math.max(max, el.startTime + el.duration), 0);
  return Math.max(state.duration, contentEnd + 10);
};

const cloneForPaste = (el: CanvasElement, timeOffset: number): CanvasElement => ({
  ...el,
  id: uid(),
  startTime: Math.max(0, el.startTime + timeOffset),
});

export const reducer = (state: EditorState, action: EditorAction): EditorState => {
  switch (action.type) {
    case 'SET_VIEW':
      return { ...state, view: action.payload, isPlaying: false };

    case 'ADD_ELEMENT': {
      const elements = [...state.elements, action.payload];
      return {
        ...state,
        elements,
        selectedIds: [action.payload.id],
        duration: grownDuration(state, elements),
      };
    }

    case 'UPDATE_ELEMENT':
      return {
        ...state,
        elements: state.elements.map((el) =>
          el.id === action.payload.id ? { ...el, ...action.payload.changes } : el,
        ),
      };

    case 'UPDATE_ELEMENTS':
      return {
        ...state,
        elements: state.elements.map((el) =>
          action.payload.ids.includes(el.id) ? { ...el, ...action.payload.changes } : el,
        ),
      };

    case 'MOVE_ELEMENTS': {
      const elements = state.elements.map((el) => {
        const update = action.payload.updates.find((u) => u.id === el.id);
        return update ? { ...el, ...update.changes } : el;
      });
      return { ...state, elements, duration: grownDuration(state, elements) };
    }

    case 'SELECT_ELEMENT':
      return { ...state, selectedIds: action.payload ? [action.payload] : [] };
    case 'SET_SELECTION':
      return { ...state, selectedIds: action.payload };
    case 'DESELECT_ALL':
      return { ...state, selectedIds: [] };
    case 'SELECT_ALL':
      return { ...state, selectedIds: state.elements.map((e) => e.id) };

    case 'SET_TIME':
      return { ...state, currentTime: Math.max(0, action.payload) };
    case 'SEEK':
      return {
        ...state,
        currentTime: Math.max(0, action.payload),
        seekVersion: state.seekVersion + 1,
      };
    case 'TOGGLE_PLAY':
      return { ...state, isPlaying: !state.isPlaying };
    case 'SET_PLAYING':
      return { ...state, isPlaying: action.payload };

    case 'SET_ZOOM':
      return { ...state, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, action.payload)) };
    case 'TOGGLE_AUTO_FIT':
      return { ...state, isAutoFit: !state.isAutoFit };
    case 'TRIGGER_FIT_VIEW':
      return { ...state, fitVersion: state.fitVersion + 1, isAutoFit: false };
    case 'TOGGLE_SNAPPING':
      return { ...state, snapping: !state.snapping };

    case 'DELETE_SELECTED':
      return {
        ...state,
        elements: state.elements.filter((e) => !state.selectedIds.includes(e.id)),
        selectedIds: [],
      };
    case 'DELETE_ELEMENT':
      return {
        ...state,
        elements: state.elements.filter((e) => e.id !== action.payload),
        selectedIds: state.selectedIds.filter((id) => id !== action.payload),
      };

    case 'SET_CANVAS_MODE':
      return { ...state, canvasMode: action.payload };

    case 'COPY_SELECTED': {
      const ids = action.payload ? [action.payload] : state.selectedIds;
      const els = state.elements.filter((e) => ids.includes(e.id));
      return els.length ? { ...state, clipboard: els } : state;
    }

    case 'CUT_SELECTED': {
      const ids = action.payload ? [action.payload] : state.selectedIds;
      const els = state.elements.filter((e) => ids.includes(e.id));
      if (!els.length) return state;
      return {
        ...state,
        clipboard: els,
        elements: state.elements.filter((e) => !ids.includes(e.id)),
        selectedIds: [],
      };
    }

    case 'PASTE_CLIPBOARD': {
      if (!state.clipboard?.length) return state;
      const anchor = Math.min(...state.clipboard.map((e) => e.startTime));
      const offset = state.currentTime - anchor;
      const pasted = state.clipboard.map((el) => cloneForPaste(el, offset));
      const elements = [...state.elements, ...pasted];
      return {
        ...state,
        elements,
        selectedIds: pasted.map((e) => e.id),
        duration: grownDuration(state, elements),
      };
    }

    case 'DUPLICATE_SELECTED': {
      const els = state.elements.filter((e) => state.selectedIds.includes(e.id));
      if (!els.length) return state;
      const dupes = els.map((el) => ({ ...el, id: uid(), startTime: el.startTime + el.duration }));
      const elements = [...state.elements, ...dupes];
      return {
        ...state,
        elements,
        selectedIds: dupes.map((e) => e.id),
        duration: grownDuration(state, elements),
      };
    }

    case 'EXTRACT_AUDIO': {
      const idsToProcess = action.payload ? [action.payload] : state.selectedIds;
      let newElements = [...state.elements];
      idsToProcess.forEach((id) => {
        const vid = newElements.find((e) => e.id === id);
        if (vid && vid.type === ElementType.VIDEO) {
          const audioEl: CanvasElement = {
            ...vid,
            id: uid(),
            type: ElementType.AUDIO,
            trackId: vid.trackId + 1,
            name: `${vid.name} (Audio)`,
            opacity: 1,
            fadeIn: 0,
            fadeOut: 0,
          };
          newElements = newElements
            .map((e) => (e.id === vid.id ? { ...e, volume: 0 } : e))
            .concat(audioEl);
        }
      });
      return { ...state, elements: newElements };
    }

    case 'SPLIT_CLIP': {
      const idToSplit = action.payload || state.selectedIds[0];
      const el = state.elements.find((e) => e.id === idToSplit);
      if (!el) return state;
      const splitTime = state.currentTime;
      if (splitTime <= el.startTime || splitTime >= el.startTime + el.duration) return state;
      const firstDuration = splitTime - el.startTime;
      const secondDuration = el.duration - firstDuration;
      const mediaTimePassed = firstDuration * (el.playbackRate || 1);
      const part1 = { ...el, duration: firstDuration };
      const part2 = {
        ...el,
        id: uid(),
        startTime: splitTime,
        duration: secondDuration,
        trimStart: el.trimStart + mediaTimePassed,
      };
      const newElements = state.elements.map((e) => (e.id === el.id ? part1 : e)).concat(part2);
      return { ...state, elements: newElements, selectedIds: [part2.id] };
    }

    case 'NUDGE_SELECTED': {
      if (!state.selectedIds.length) return state;
      const elements = state.elements.map((el) =>
        state.selectedIds.includes(el.id)
          ? { ...el, startTime: Math.max(0, el.startTime + action.payload.deltaTime) }
          : el,
      );
      return { ...state, elements, duration: grownDuration(state, elements) };
    }

    case 'CROSSFADE_WITH_NEXT': {
      const el = state.elements.find((e) => e.id === action.payload);
      if (!el) return state;
      const next = state.elements
        .filter((e) => e.trackId === el.trackId && e.id !== el.id && e.startTime >= el.startTime)
        .sort((a, b) => a.startTime - b.startTime)[0];
      if (!next) return state;
      const fade = 1; // seconds of overlap
      const elEnd = el.startTime + el.duration;
      const shift = next.startTime - (elEnd - fade);
      const elements = state.elements.map((e) => {
        if (e.id === el.id) return { ...e, fadeOut: Math.max(e.fadeOut, fade) };
        if (e.id === next.id) {
          // Move the next clip up to overlap, onto an adjacent track so both render.
          const moved = {
            ...e,
            startTime: Math.max(0, e.startTime - Math.max(0, shift)),
            trackId: e.trackId === el.trackId ? e.trackId + 1 : e.trackId,
            fadeIn: Math.max(e.fadeIn, fade),
          };
          return moved;
        }
        return e;
      });
      return { ...state, elements };
    }

    case 'ADD_LIBRARY_ITEM':
      return { ...state, library: [...state.library, action.payload] };
    case 'ADD_LIBRARY_ITEMS':
      return { ...state, library: [...state.library, ...action.payload] };
    case 'DELETE_LIBRARY_ITEM':
      return { ...state, library: state.library.filter((item) => item.id !== action.payload) };

    case 'SET_TRACK_META': {
      const existing = state.tracks[action.payload.trackId] ?? DEFAULT_TRACK_META;
      return {
        ...state,
        tracks: {
          ...state.tracks,
          [action.payload.trackId]: { ...existing, ...action.payload.changes },
        },
      };
    }

    case 'LOAD_PROJECT':
      return {
        ...state,
        ...action.payload,
        selectedIds: [],
        currentTime: 0,
        isPlaying: false,
        seekVersion: state.seekVersion + 1,
      };

    // Handled by the history wrapper:
    case 'COMMIT_HISTORY':
    case 'UNDO':
    case 'REDO':
      return state;

    default:
      return state;
  }
};

/** Clamp a resize-end drag so a media clip can't outrun its source. */
export const clampDuration = (el: CanvasElement, wanted: number): number =>
  Math.max(0.1, Math.min(wanted, maxClipDuration(el)));

export { DEFAULT_ZOOM };
