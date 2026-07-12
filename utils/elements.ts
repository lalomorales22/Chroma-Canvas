import { CanvasElement, ElementFilters, ElementType, LibraryCategory, LibraryItem } from '../types';
import { DEFAULT_FONT_SIZE, DEFAULT_IMAGE_DURATION } from '../constants';
import { uid } from './id';

/** Create a timeline element with all defaults filled in. */
export const createElement = (
  partial: Partial<CanvasElement> & { type: ElementType; name: string },
): CanvasElement => ({
  id: uid(),
  startTime: 0,
  duration: DEFAULT_IMAGE_DURATION,
  trackId: 0,
  volume: partial.type === ElementType.TEXT ? 0 : 1,
  opacity: 1,
  rotation: 0,
  scale: 1,
  playbackRate: 1,
  trimStart: 0,
  fadeIn: 0,
  fadeOut: 0,
  fontSize: DEFAULT_FONT_SIZE,
  ...partial,
});

export const createLibraryItem = (
  partial: Partial<LibraryItem> & { type: ElementType; src: string; name: string },
): LibraryItem => ({
  id: uid(),
  category: (partial.type === ElementType.VIDEO
    ? 'VIDEO'
    : partial.type === ElementType.AUDIO
      ? 'AUDIO'
      : 'IMAGE') as LibraryCategory,
  ...partial,
});

export const filtersToCss = (filters?: ElementFilters): string => {
  if (!filters) return 'none';
  const parts: string[] = [];
  if (filters.brightness !== 1) parts.push(`brightness(${filters.brightness})`);
  if (filters.contrast !== 1) parts.push(`contrast(${filters.contrast})`);
  if (filters.saturate !== 1) parts.push(`saturate(${filters.saturate})`);
  if (filters.blur > 0) parts.push(`blur(${filters.blur}px)`);
  return parts.length ? parts.join(' ') : 'none';
};

/** Fade multiplier (0..1) for a clip at a given time within the clip. */
export const fadeMultiplierAt = (el: CanvasElement, clipTime: number): number => {
  if (el.fadeIn > 0 && clipTime < el.fadeIn) {
    return Math.max(0, clipTime / el.fadeIn);
  }
  if (el.fadeOut > 0 && clipTime > el.duration - el.fadeOut) {
    return Math.max(0, (el.duration - clipTime) / el.fadeOut);
  }
  return 1;
};

/** Max timeline duration a media clip can stretch to without running out of source. */
export const maxClipDuration = (el: CanvasElement): number => {
  if (
    (el.type === ElementType.VIDEO || el.type === ElementType.AUDIO) &&
    el.sourceDuration !== undefined
  ) {
    return Math.max(0.1, (el.sourceDuration - el.trimStart) / (el.playbackRate || 1));
  }
  return Infinity;
};
