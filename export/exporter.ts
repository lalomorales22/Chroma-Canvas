import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { CanvasElement, DEFAULT_TRACK_META, ElementType, ProjectDoc } from '../types';
import { fadeMultiplierAt, filtersToCss } from '../utils/elements';
import { getProceduralTransform } from '../utils/transforms';

/**
 * Two export pipelines:
 *
 * 1. WebCodecs (default, Chrome/Edge): steps the timeline frame-by-frame,
 *    seeking each video precisely, so the output is frame-accurate and renders
 *    faster than realtime. Audio is mixed offline (OfflineAudioContext) and
 *    encoded to AAC (Opus fallback) — sample-accurate sync.
 *
 * 2. Realtime MediaRecorder (fallback): plays the project once at wall-clock
 *    speed while capturing the canvas + a WebAudio mix.
 */

export interface ExportSettings {
  resolution: '720p' | '1080p';
  fps: number;
  canvasMode: 'landscape' | 'portrait';
}

export interface ExportSignal {
  cancelled: boolean;
}

export type ProgressFn = (percent: number, stage: string) => void;

export interface ExportResult {
  blob: Blob;
  extension: string;
}

export const isWebCodecsSupported = (): boolean =>
  typeof window !== 'undefined' && 'VideoEncoder' in window;

const dims = (settings: ExportSettings): { width: number; height: number } => {
  const long = settings.resolution === '1080p' ? 1920 : 1280;
  const short = settings.resolution === '1080p' ? 1080 : 720;
  return settings.canvasMode === 'portrait'
    ? { width: short, height: long }
    : { width: long, height: short };
};

const contentEnd = (doc: ProjectDoc): number =>
  Math.max(
    1,
    doc.elements.reduce((max, el) => Math.max(max, el.startTime + el.duration), 0),
  );

const isTrackHidden = (doc: ProjectDoc, trackId: number): boolean =>
  (doc.tracks[trackId] ?? DEFAULT_TRACK_META).hidden;
const isTrackMuted = (doc: ProjectDoc, trackId: number): boolean =>
  (doc.tracks[trackId] ?? DEFAULT_TRACK_META).muted;

// ---------------------------------------------------------------------------
// Shared resources + painting
// ---------------------------------------------------------------------------

interface RenderResources {
  videoEls: Map<string, HTMLVideoElement>; // element id -> hidden video
  images: Map<string, HTMLImageElement>; // src -> image
}

const prepareResources = async (doc: ProjectDoc): Promise<RenderResources> => {
  const videoEls = new Map<string, HTMLVideoElement>();
  const images = new Map<string, HTMLImageElement>();

  const videoClips = doc.elements.filter(
    (el) => el.type === ElementType.VIDEO && el.src && !isTrackHidden(doc, el.trackId),
  );
  await Promise.all(
    videoClips.map(
      (el) =>
        new Promise<void>((resolve) => {
          const v = document.createElement('video');
          v.crossOrigin = 'anonymous';
          v.muted = true;
          v.preload = 'auto';
          v.src = el.src as string;
          v.onloadeddata = () => resolve();
          v.onerror = () => resolve();
          window.setTimeout(resolve, 8000);
          videoEls.set(el.id, v);
        }),
    ),
  );

  const imageSrcs = new Set(
    doc.elements
      .filter((el) => el.type === ElementType.IMAGE && el.src)
      .map((el) => el.src as string),
  );
  await Promise.all(
    Array.from(imageSrcs).map(
      (src) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = src;
          img.onload = () => {
            images.set(src, img);
            resolve();
          };
          img.onerror = () => resolve();
        }),
    ),
  );

  return { videoEls, images };
};

const disposeResources = (res: RenderResources): void => {
  res.videoEls.forEach((v) => {
    v.pause();
    v.removeAttribute('src');
  });
  res.videoEls.clear();
  res.images.clear();
};

/** Paint every visible layer at time `t`, bottom track first. */
const paintFrame = (
  ctx: CanvasRenderingContext2D,
  doc: ProjectDoc,
  res: RenderResources,
  t: number,
  width: number,
  height: number,
): void => {
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);

  const baseWidth = doc.canvasMode === 'portrait' ? 720 : 1280;
  const coordScale = width / baseWidth;

  const active = doc.elements
    .filter((el) => el.type !== ElementType.AUDIO)
    .filter((el) => t >= el.startTime && el.startTime + el.duration > t)
    .filter((el) => !isTrackHidden(doc, el.trackId))
    .sort((a, b) => a.trackId - b.trackId);

  for (const el of active) {
    const clipTime = t - el.startTime;
    const fade = fadeMultiplierAt(el, clipTime);
    const transform = getProceduralTransform(el, t, doc.canvasMode, true);

    ctx.save();
    ctx.translate(width / 2 + transform.x * coordScale, height / 2 + transform.y * coordScale);
    ctx.rotate((transform.rotation * Math.PI) / 180);
    ctx.scale(transform.scale, transform.scale);
    ctx.globalAlpha = Math.max(0, Math.min(1, el.opacity * fade * transform.opacityMultiplier));
    ctx.filter = filtersToCss(el.filters);

    if (el.type === ElementType.VIDEO) {
      const v = res.videoEls.get(el.id);
      if (v && v.videoWidth) {
        const scale = Math.max(width / v.videoWidth, height / v.videoHeight);
        const w = v.videoWidth * scale;
        const h = v.videoHeight * scale;
        ctx.drawImage(v, -w / 2, -h / 2, w, h);
      }
    } else if (el.type === ElementType.IMAGE && el.src) {
      const img = res.images.get(el.src);
      if (img && img.width) {
        const scale = Math.min(width / img.width, height / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
      }
    } else if (el.type === ElementType.TEXT) {
      const fontFamily = el.fontFamily || "'Inter Variable', 'Inter', sans-serif";
      ctx.font = `bold ${(el.fontSize || 40) * coordScale}px ${fontFamily}`;
      ctx.fillStyle = el.color || '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(el.text || '', 0, 0);
    }
    ctx.restore();
  }
};

const audibleElements = (doc: ProjectDoc): CanvasElement[] =>
  doc.elements.filter(
    (el) =>
      (el.type === ElementType.AUDIO || el.type === ElementType.VIDEO) &&
      el.src &&
      el.volume > 0 &&
      !isTrackMuted(doc, el.trackId),
  );

// ---------------------------------------------------------------------------
// Offline audio mixdown (WebCodecs path)
// ---------------------------------------------------------------------------

const SAMPLE_RATE = 48000;

const renderAudioMix = async (
  doc: ProjectDoc,
  duration: number,
  onProgress: ProgressFn,
): Promise<AudioBuffer | null> => {
  const audible = audibleElements(doc);
  if (!audible.length) return null;

  onProgress(0, 'Decoding audio…');
  const offCtx = new OfflineAudioContext(2, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE);

  const decoded = new Map<string, AudioBuffer>();
  for (const el of audible) {
    const src = el.src as string;
    if (decoded.has(src)) continue;
    try {
      const buf = await fetch(src).then((r) => r.arrayBuffer());
      decoded.set(src, await offCtx.decodeAudioData(buf));
    } catch {
      // Sources without decodable audio (e.g. silent video) are skipped.
    }
  }

  let scheduled = 0;
  for (const el of audible) {
    const buffer = decoded.get(el.src as string);
    if (!buffer) continue;
    const rate = el.playbackRate || 1;
    const source = offCtx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;

    const gain = offCtx.createGain();
    const start = Math.max(0, el.startTime);
    const end = Math.min(duration, el.startTime + el.duration);
    if (end <= start) continue;

    gain.gain.setValueAtTime(el.fadeIn > 0 ? 0 : el.volume, start);
    if (el.fadeIn > 0) {
      gain.gain.linearRampToValueAtTime(el.volume, Math.min(end, start + el.fadeIn));
    }
    if (el.fadeOut > 0 && end - el.fadeOut > start) {
      gain.gain.setValueAtTime(el.volume, end - el.fadeOut);
      gain.gain.linearRampToValueAtTime(0, end);
    }

    source.connect(gain);
    gain.connect(offCtx.destination);
    source.start(start, el.trimStart);
    source.stop(end);
    scheduled += 1;
  }
  if (!scheduled) return null;

  onProgress(0, 'Mixing audio…');
  return offCtx.startRendering();
};

// ---------------------------------------------------------------------------
// WebCodecs export
// ---------------------------------------------------------------------------

const pickVideoCodec = async (
  width: number,
  height: number,
  fps: number,
  bitrate: number,
): Promise<string | null> => {
  const candidates = ['avc1.640028', 'avc1.4d4028', 'avc1.42e01f'];
  for (const codec of candidates) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        bitrate,
        framerate: fps,
      });
      if (support.supported) return codec;
    } catch {
      /* try next */
    }
  }
  return null;
};

const seekVideo = (v: HTMLVideoElement, time: number): Promise<void> =>
  new Promise((resolve) => {
    if (Math.abs(v.currentTime - time) < 0.001 && v.readyState >= 2) {
      resolve();
      return;
    }
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      v.removeEventListener('seeked', done);
      resolve();
    };
    v.addEventListener('seeked', done);
    v.currentTime = Math.max(0, time);
    window.setTimeout(done, 350);
  });

const exportWithWebCodecs = async (
  doc: ProjectDoc,
  settings: ExportSettings,
  onProgress: ProgressFn,
  signal: ExportSignal,
): Promise<ExportResult | null> => {
  const { width, height } = dims(settings);
  const fps = settings.fps;
  const duration = contentEnd(doc);
  const totalFrames = Math.ceil(duration * fps);
  const bitrate = settings.resolution === '1080p' ? 14_000_000 : 9_000_000;

  const videoCodec = await pickVideoCodec(width, height, fps, bitrate);
  if (!videoCodec) throw new Error('No supported H.264 encoder found.');

  onProgress(0, 'Preparing media…');
  const res = await prepareResources(doc);

  try {
    // ---- audio: mix offline, then decide the codec
    const audioMix = await renderAudioMix(doc, duration, onProgress);
    let audioCodec: 'aac' | 'opus' | null = null;
    if (audioMix && typeof AudioEncoder !== 'undefined') {
      for (const [name, codec] of [
        ['aac', 'mp4a.40.2'],
        ['opus', 'opus'],
      ] as const) {
        try {
          const support = await AudioEncoder.isConfigSupported({
            codec,
            sampleRate: SAMPLE_RATE,
            numberOfChannels: 2,
            bitrate: 128_000,
          });
          if (support.supported) {
            audioCodec = name;
            break;
          }
        } catch {
          /* try next */
        }
      }
    }

    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: 'avc', width, height, frameRate: fps },
      ...(audioMix && audioCodec
        ? { audio: { codec: audioCodec, sampleRate: SAMPLE_RATE, numberOfChannels: 2 } }
        : {}),
      fastStart: 'in-memory',
    });

    let encoderError: Error | null = null;
    const videoEncoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => {
        encoderError = e instanceof Error ? e : new Error(String(e));
      },
    });
    videoEncoder.configure({
      codec: videoCodec,
      width,
      height,
      bitrate,
      framerate: fps,
    });

    // ---- encode audio first (fast)
    if (audioMix && audioCodec) {
      onProgress(2, 'Encoding audio…');
      const audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (e) => {
          encoderError = e instanceof Error ? e : new Error(String(e));
        },
      });
      audioEncoder.configure({
        codec: audioCodec === 'aac' ? 'mp4a.40.2' : 'opus',
        sampleRate: SAMPLE_RATE,
        numberOfChannels: 2,
        bitrate: 128_000,
      });

      const chunkFrames = 4800; // 100ms
      const ch0 = audioMix.getChannelData(0);
      const ch1 = audioMix.numberOfChannels > 1 ? audioMix.getChannelData(1) : ch0;
      for (let offset = 0; offset < audioMix.length; offset += chunkFrames) {
        if (signal.cancelled) break;
        const frames = Math.min(chunkFrames, audioMix.length - offset);
        const data = new Float32Array(frames * 2);
        data.set(ch0.subarray(offset, offset + frames), 0);
        data.set(ch1.subarray(offset, offset + frames), frames);
        const audioData = new AudioData({
          format: 'f32-planar',
          sampleRate: SAMPLE_RATE,
          numberOfFrames: frames,
          numberOfChannels: 2,
          timestamp: Math.round((offset / SAMPLE_RATE) * 1e6),
          data,
        });
        audioEncoder.encode(audioData);
        audioData.close();
      }
      await audioEncoder.flush();
      audioEncoder.close();
    }

    // ---- video: step frame by frame
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Could not create render context.');

    for (let frame = 0; frame < totalFrames; frame++) {
      if (signal.cancelled) break;
      if (encoderError) throw encoderError;
      const t = frame / fps;

      // Seek every active video to its exact source time for this frame.
      const seeks: Promise<void>[] = [];
      for (const el of doc.elements) {
        if (el.type !== ElementType.VIDEO) continue;
        const v = res.videoEls.get(el.id);
        if (!v) continue;
        if (t >= el.startTime && t < el.startTime + el.duration) {
          const target = el.trimStart + (t - el.startTime) * (el.playbackRate || 1);
          seeks.push(seekVideo(v, target));
        }
      }
      await Promise.all(seeks);

      paintFrame(ctx, doc, res, t, width, height);

      const videoFrame = new VideoFrame(canvas, {
        timestamp: Math.round(t * 1e6),
        duration: Math.round(1e6 / fps),
      });
      videoEncoder.encode(videoFrame, { keyFrame: frame % (fps * 2) === 0 });
      videoFrame.close();

      // Backpressure: don't let the encode queue balloon.
      while (videoEncoder.encodeQueueSize > 4) {
        await new Promise((r) => setTimeout(r, 4));
      }

      if (frame % 3 === 0) {
        onProgress(5 + Math.round((frame / totalFrames) * 90), 'Rendering frames…');
      }
    }

    if (signal.cancelled) {
      videoEncoder.close();
      return null;
    }

    onProgress(96, 'Finalizing MP4…');
    await videoEncoder.flush();
    videoEncoder.close();
    muxer.finalize();

    const { buffer } = muxer.target as ArrayBufferTarget;
    onProgress(100, 'Done');
    return { blob: new Blob([buffer], { type: 'video/mp4' }), extension: 'mp4' };
  } finally {
    disposeResources(res);
  }
};

// ---------------------------------------------------------------------------
// Realtime fallback (MediaRecorder)
// ---------------------------------------------------------------------------

const exportRealtime = async (
  doc: ProjectDoc,
  settings: ExportSettings,
  onProgress: ProgressFn,
  signal: ExportSignal,
): Promise<ExportResult | null> => {
  const mimeTypes = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const mimeType = mimeTypes.find((t) => MediaRecorder.isTypeSupported(t));
  if (!mimeType) throw new Error('This browser supports neither WebCodecs nor MediaRecorder.');

  const { width, height } = dims(settings);
  const duration = contentEnd(doc);

  onProgress(0, 'Preparing media…');
  const res = await prepareResources(doc);

  // Audio elements for the realtime mix (videos double as their own audio).
  const audioEls = new Map<string, HTMLMediaElement>();
  const audible = audibleElements(doc);
  await Promise.all(
    audible.map(
      (el) =>
        new Promise<void>((resolve) => {
          const existing = res.videoEls.get(el.id);
          if (existing) {
            existing.muted = false;
            audioEls.set(el.id, existing);
            resolve();
            return;
          }
          const a = document.createElement('audio');
          a.crossOrigin = 'anonymous';
          a.preload = 'auto';
          a.src = el.src as string;
          a.onloadeddata = () => resolve();
          a.onerror = () => resolve();
          window.setTimeout(resolve, 8000);
          audioEls.set(el.id, a);
        }),
    ),
  );

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Could not create render context.');

  const audioCtx = new AudioContext();
  await audioCtx.resume();
  const dest = audioCtx.createMediaStreamDestination();
  const gains = new Map<string, GainNode>();
  audioEls.forEach((mediaEl, id) => {
    try {
      const src = audioCtx.createMediaElementSource(mediaEl);
      const gain = audioCtx.createGain();
      gain.gain.value = 0;
      src.connect(gain);
      gain.connect(dest);
      gains.set(id, gain);
    } catch {
      /* already connected elsewhere */
    }
  });

  const stream = canvas.captureStream(settings.fps);
  if (dest.stream.getAudioTracks().length > 0) {
    stream.addTrack(dest.stream.getAudioTracks()[0]);
  }

  return new Promise<ExportResult | null>((resolve, reject) => {
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 12_000_000,
    });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    let rafId = 0;
    const cleanup = () => {
      cancelAnimationFrame(rafId);
      audioEls.forEach((el) => el.pause());
      disposeResources(res);
      void audioCtx.close();
    };

    recorder.onstop = () => {
      cleanup();
      if (signal.cancelled) {
        resolve(null);
        return;
      }
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
      resolve({ blob: new Blob(chunks, { type: mimeType }), extension: ext });
    };
    recorder.onerror = () => {
      cleanup();
      reject(new Error('Recording failed.'));
    };

    recorder.start();
    const startTime = performance.now();

    const tick = () => {
      const elapsed = (performance.now() - startTime) / 1000;
      if (signal.cancelled || elapsed > duration) {
        recorder.stop();
        return;
      }
      onProgress(Math.min(99, Math.round((elapsed / duration) * 100)), 'Recording in realtime…');

      // Keep media elements playing in sync + apply fades to gains.
      for (const el of doc.elements) {
        if (el.type !== ElementType.VIDEO && el.type !== ElementType.AUDIO) continue;
        const mediaEl = audioEls.get(el.id) ?? res.videoEls.get(el.id);
        if (!mediaEl) continue;
        const isActive = elapsed >= el.startTime && elapsed < el.startTime + el.duration;
        const gain = gains.get(el.id);
        if (isActive) {
          const clipTime = elapsed - el.startTime;
          const rate = el.playbackRate || 1;
          const target = el.trimStart + clipTime * rate;
          mediaEl.playbackRate = rate;
          if (Math.abs(mediaEl.currentTime - target) > 0.25) mediaEl.currentTime = target;
          if (mediaEl.paused) mediaEl.play().catch(() => {});
          if (gain) gain.gain.value = el.volume * fadeMultiplierAt(el, clipTime);
        } else {
          if (!mediaEl.paused) mediaEl.pause();
          if (gain) gain.gain.value = 0;
        }
      }

      paintFrame(ctx, doc, res, elapsed, width, height);
      rafId = requestAnimationFrame(tick);
    };
    tick();
  });
};

// ---------------------------------------------------------------------------

export const exportVideo = async (
  doc: ProjectDoc,
  settings: ExportSettings,
  onProgress: ProgressFn,
  signal: ExportSignal,
): Promise<ExportResult | null> => {
  if (doc.elements.length === 0) throw new Error('Nothing to export — the timeline is empty.');
  if (isWebCodecsSupported()) {
    try {
      return await exportWithWebCodecs(doc, settings, onProgress, signal);
    } catch (e) {
      console.warn('WebCodecs export failed, falling back to realtime:', e);
      if (signal.cancelled) return null;
      onProgress(0, 'Falling back to realtime capture…');
    }
  }
  return exportRealtime(doc, settings, onProgress, signal);
};
