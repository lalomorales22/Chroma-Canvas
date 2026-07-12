/**
 * Video filmstrip thumbnails for timeline clips. One strip of frames is
 * generated per source URL (sequential seeks on a hidden <video>), cached, and
 * reused by every clip that references the source.
 */

export interface Filmstrip {
  frames: string[]; // data URLs, evenly spaced across the source
  sourceDuration: number;
}

const cache = new Map<string, Promise<Filmstrip | null>>();

const FRAME_COUNT = 10;
const THUMB_W = 160;
const THUMB_H = 90;

const seekTo = (video: HTMLVideoElement, time: number): Promise<void> =>
  new Promise((resolve) => {
    const done = () => {
      video.removeEventListener('seeked', done);
      resolve();
    };
    video.addEventListener('seeked', done);
    video.currentTime = time;
    // Safety timeout — some codecs never fire seeked for out-of-range times.
    window.setTimeout(done, 900);
  });

export const getFilmstrip = (src: string): Promise<Filmstrip | null> => {
  const cached = cache.get(src);
  if (cached) return cached;

  const promise = (async (): Promise<Filmstrip | null> => {
    try {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.preload = 'auto';
      video.src = src;

      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error('video load failed'));
        window.setTimeout(() => reject(new Error('video load timeout')), 8000);
      });

      const duration = video.duration;
      if (!Number.isFinite(duration) || duration <= 0) return null;

      const canvas = document.createElement('canvas');
      canvas.width = THUMB_W;
      canvas.height = THUMB_H;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      const frames: string[] = [];
      for (let i = 0; i < FRAME_COUNT; i++) {
        const t = (duration * (i + 0.5)) / FRAME_COUNT;
        await seekTo(video, Math.min(duration - 0.05, t));
        const vw = video.videoWidth || THUMB_W;
        const vh = video.videoHeight || THUMB_H;
        const scale = Math.max(THUMB_W / vw, THUMB_H / vh);
        const w = vw * scale;
        const h = vh * scale;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, THUMB_W, THUMB_H);
        ctx.drawImage(video, (THUMB_W - w) / 2, (THUMB_H - h) / 2, w, h);
        // Throws on cross-origin taint — caught below, strip disabled for this src.
        frames.push(canvas.toDataURL('image/jpeg', 0.55));
      }
      video.removeAttribute('src');
      return { frames, sourceDuration: duration };
    } catch {
      return null;
    }
  })();

  cache.set(src, promise);
  return promise;
};
