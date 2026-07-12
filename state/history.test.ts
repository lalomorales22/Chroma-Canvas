import { describe, expect, it } from 'vitest';
import { canRedo, canUndo, historyReducer, initialUndoable, UndoableState } from './history';
import { ElementType } from '../types';
import { createElement } from '../utils/elements';

const addClip = (state: UndoableState, name: string): UndoableState =>
  historyReducer(state, {
    type: 'ADD_ELEMENT',
    payload: createElement({ type: ElementType.TEXT, name, text: name, duration: 3 }),
  });

describe('historyReducer', () => {
  it('undo/redo roundtrips a document change', () => {
    let s = addClip(initialUndoable, 'one');
    expect(s.present.elements).toHaveLength(1);
    expect(canUndo(s)).toBe(true);

    s = historyReducer(s, { type: 'UNDO' });
    expect(s.present.elements).toHaveLength(0);
    expect(canRedo(s)).toBe(true);

    s = historyReducer(s, { type: 'REDO' });
    expect(s.present.elements).toHaveLength(1);
  });

  it('session-only actions do not create history entries', () => {
    let s = historyReducer(initialUndoable, { type: 'SET_TIME', payload: 5 });
    s = historyReducer(s, { type: 'SET_ZOOM', payload: 80 });
    expect(canUndo(s)).toBe(false);
  });

  it('a transient gesture plus commit is a single undo step', () => {
    let s = addClip(initialUndoable, 'clip');
    const id = s.present.elements[0].id;

    // Simulate a drag: many transient moves, one commit.
    for (let i = 1; i <= 20; i++) {
      s = historyReducer(s, {
        type: 'UPDATE_ELEMENT',
        payload: { id, changes: { startTime: i } },
        transient: true,
      });
    }
    s = historyReducer(s, { type: 'COMMIT_HISTORY' });
    expect(s.present.elements[0].startTime).toBe(20);

    s = historyReducer(s, { type: 'UNDO' });
    expect(s.present.elements[0].startTime).toBe(0); // back to before the drag
    s = historyReducer(s, { type: 'UNDO' });
    expect(s.present.elements).toHaveLength(0); // back to before the add
  });

  it('undo during an uncommitted gesture still undoes the gesture', () => {
    let s = addClip(initialUndoable, 'clip');
    const id = s.present.elements[0].id;
    s = historyReducer(s, {
      type: 'UPDATE_ELEMENT',
      payload: { id, changes: { startTime: 42 } },
      transient: true,
    });
    s = historyReducer(s, { type: 'UNDO' });
    expect(s.present.elements[0].startTime).toBe(0);
  });

  it('rapid identical edits coalesce into one undo step', () => {
    let s = addClip(initialUndoable, 'clip');
    const id = s.present.elements[0].id;
    // Slider-style burst (same action key, same tick)
    for (const v of [0.9, 0.8, 0.7, 0.6]) {
      s = historyReducer(s, {
        type: 'UPDATE_ELEMENT',
        payload: { id, changes: { opacity: v } },
      });
    }
    expect(s.present.elements[0].opacity).toBe(0.6);
    s = historyReducer(s, { type: 'UNDO' });
    expect(s.present.elements[0].opacity).toBe(1); // one step back to pre-burst
  });

  it('selection is pruned when undo removes selected elements', () => {
    let s = addClip(initialUndoable, 'clip');
    const id = s.present.elements[0].id;
    s = historyReducer(s, { type: 'SELECT_ELEMENT', payload: id });
    s = historyReducer(s, { type: 'UNDO' });
    expect(s.present.selectedIds).toEqual([]);
  });

  it('LOAD_PROJECT clears history', () => {
    let s = addClip(initialUndoable, 'clip');
    s = historyReducer(s, {
      type: 'LOAD_PROJECT',
      payload: {
        elements: [],
        library: [],
        duration: 60,
        tracks: {},
        canvasMode: 'landscape',
      },
    });
    expect(canUndo(s)).toBe(false);
    expect(canRedo(s)).toBe(false);
  });
});
