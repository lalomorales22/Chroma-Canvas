import { EditorAction, EditorState, ProjectDoc } from '../types';
import { initialState, reducer } from './reducer';

const HISTORY_LIMIT = 100;
const COALESCE_MS = 800;

/** Action types that mutate the undoable document. */
const DOC_ACTIONS = new Set<EditorAction['type']>([
  'ADD_ELEMENT',
  'UPDATE_ELEMENT',
  'UPDATE_ELEMENTS',
  'MOVE_ELEMENTS',
  'DELETE_SELECTED',
  'DELETE_ELEMENT',
  'CUT_SELECTED',
  'PASTE_CLIPBOARD',
  'DUPLICATE_SELECTED',
  'EXTRACT_AUDIO',
  'SPLIT_CLIP',
  'NUDGE_SELECTED',
  'CROSSFADE_WITH_NEXT',
  'ADD_LIBRARY_ITEM',
  'ADD_LIBRARY_ITEMS',
  'DELETE_LIBRARY_ITEM',
  'SET_TRACK_META',
  'SET_CANVAS_MODE',
]);

export interface UndoableState {
  present: EditorState;
  past: ProjectDoc[];
  future: ProjectDoc[];
  /** Doc snapshot from before an in-flight transient gesture (drag/slider). */
  pendingBase: ProjectDoc | null;
  lastKey: string | null;
  lastTime: number;
}

export const initialUndoable: UndoableState = {
  present: initialState,
  past: [],
  future: [],
  pendingBase: null,
  lastKey: null,
  lastTime: 0,
};

export const docOf = (s: EditorState): ProjectDoc => ({
  elements: s.elements,
  library: s.library,
  duration: s.duration,
  tracks: s.tracks,
  canvasMode: s.canvasMode,
});

const applyDoc = (s: EditorState, doc: ProjectDoc): EditorState => {
  const ids = new Set(doc.elements.map((e) => e.id));
  return {
    ...s,
    ...doc,
    selectedIds: s.selectedIds.filter((id) => ids.has(id)),
  };
};

const pushPast = (past: ProjectDoc[], doc: ProjectDoc): ProjectDoc[] => {
  const next = [...past, doc];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
};

const actionKey = (action: EditorAction): string => {
  switch (action.type) {
    case 'UPDATE_ELEMENT':
      return `UPDATE_ELEMENT:${action.payload.id}:${Object.keys(action.payload.changes).join(',')}`;
    case 'UPDATE_ELEMENTS':
      return `UPDATE_ELEMENTS:${action.payload.ids.join(',')}:${Object.keys(
        action.payload.changes,
      ).join(',')}`;
    case 'NUDGE_SELECTED':
      return 'NUDGE_SELECTED';
    default:
      return action.type;
  }
};

export const historyReducer = (state: UndoableState, action: EditorAction): UndoableState => {
  switch (action.type) {
    case 'UNDO': {
      // A pending gesture counts as the change being undone.
      const past = state.pendingBase !== null ? pushPast(state.past, state.pendingBase) : state.past;
      if (!past.length) return { ...state, pendingBase: null };
      const previous = past[past.length - 1];
      return {
        present: applyDoc(state.present, previous),
        past: past.slice(0, -1),
        future: [docOf(state.present), ...state.future],
        pendingBase: null,
        lastKey: null,
        lastTime: 0,
      };
    }

    case 'REDO': {
      if (!state.future.length) return state;
      const next = state.future[0];
      return {
        present: applyDoc(state.present, next),
        past: pushPast(state.past, docOf(state.present)),
        future: state.future.slice(1),
        pendingBase: null,
        lastKey: null,
        lastTime: 0,
      };
    }

    case 'COMMIT_HISTORY': {
      if (state.pendingBase === null) return state;
      return {
        ...state,
        past: pushPast(state.past, state.pendingBase),
        future: [],
        pendingBase: null,
        lastKey: null,
        lastTime: 0,
      };
    }

    case 'LOAD_PROJECT': {
      const present = reducer(state.present, action);
      return { present, past: [], future: [], pendingBase: null, lastKey: null, lastTime: 0 };
    }

    default: {
      const present = reducer(state.present, action);
      if (present === state.present) return state;

      if (!DOC_ACTIONS.has(action.type)) {
        return { ...state, present };
      }

      const transient = 'transient' in action && action.transient === true;
      if (transient) {
        return {
          ...state,
          present,
          pendingBase: state.pendingBase ?? docOf(state.present),
        };
      }

      // Coalesce rapid repeats of the same edit (slider drags, key-repeat nudges).
      const key = actionKey(action);
      const now = Date.now();
      if (state.lastKey === key && now - state.lastTime < COALESCE_MS) {
        return { ...state, present, lastTime: now, future: [] };
      }

      return {
        ...state,
        present,
        past: pushPast(state.past, docOf(state.present)),
        future: [],
        pendingBase: null,
        lastKey: key,
        lastTime: now,
      };
    }
  }
};

export const canUndo = (s: UndoableState): boolean => s.past.length > 0 || s.pendingBase !== null;
export const canRedo = (s: UndoableState): boolean => s.future.length > 0;
