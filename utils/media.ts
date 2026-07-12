import { ElementType } from '../types';
import { DEFAULT_IMAGE_DURATION } from '../constants';

/** Probe the duration of a media URL. Images/text resolve to the default still duration. */
export const getMediaDuration = (src: string, type: ElementType): Promise<number> => {
  return new Promise((resolve) => {
    if (type === ElementType.IMAGE || type === ElementType.TEXT) {
      resolve(DEFAULT_IMAGE_DURATION);
      return;
    }
    const el =
      type === ElementType.VIDEO ? document.createElement('video') : document.createElement('audio');
    el.src = src;
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      const d = el.duration;
      el.removeAttribute('src');
      resolve(Number.isFinite(d) ? d : DEFAULT_IMAGE_DURATION);
    };
    el.onerror = () => resolve(DEFAULT_IMAGE_DURATION);
  });
};

export const blobToDataURL = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

export const dataURLToBlob = async (dataUrl: string): Promise<Blob> => {
  const res = await fetch(dataUrl);
  return res.blob();
};

export const fileTypeToElementType = (mime: string): ElementType => {
  if (mime.startsWith('video/')) return ElementType.VIDEO;
  if (mime.startsWith('audio/')) return ElementType.AUDIO;
  return ElementType.IMAGE;
};

export const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const formatTimecode = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const frames = Math.floor((seconds % 1) * 30);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${frames
    .toString()
    .padStart(2, '0')}`;
};
