import React, { useEffect, useRef, useState } from 'react';

/**
 * Real audio waveforms. Peaks are decoded once per source URL and cached, then
 * drawn to a canvas sized to the clip. The visible window respects trim + speed.
 */

const PEAK_BUCKETS = 400;
const peaksCache = new Map<string, Promise<Float32Array | null>>();

let sharedCtx: AudioContext | null = null;
const getAudioContext = (): AudioContext => {
  if (!sharedCtx) {
    sharedCtx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  return sharedCtx;
};

const computePeaks = (src: string): Promise<Float32Array | null> => {
  const cached = peaksCache.get(src);
  if (cached) return cached;
  const promise = (async () => {
    try {
      const res = await fetch(src);
      const buf = await res.arrayBuffer();
      const audio = await getAudioContext().decodeAudioData(buf);
      const data = audio.getChannelData(0);
      const peaks = new Float32Array(PEAK_BUCKETS);
      const samplesPerBucket = Math.max(1, Math.floor(data.length / PEAK_BUCKETS));
      for (let i = 0; i < PEAK_BUCKETS; i++) {
        let max = 0;
        const start = i * samplesPerBucket;
        const end = Math.min(data.length, start + samplesPerBucket);
        // Sample sparsely inside the bucket — plenty for display.
        const step = Math.max(1, Math.floor((end - start) / 64));
        for (let j = start; j < end; j += step) {
          const v = Math.abs(data[j]);
          if (v > max) max = v;
        }
        peaks[i] = max;
      }
      return peaks;
    } catch {
      return null;
    }
  })();
  peaksCache.set(src, promise);
  return promise;
};

interface WaveformProps {
  src: string;
  width: number; // px
  height: number; // px
  trimStart: number; // source seconds skipped
  clipDuration: number; // timeline seconds
  playbackRate: number;
  sourceDuration?: number; // full source seconds
  color?: string;
}

export const Waveform: React.FC<WaveformProps> = ({
  src,
  width,
  height,
  trimStart,
  clipDuration,
  playbackRate,
  sourceDuration,
  color = 'rgba(110, 231, 183, 0.9)',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);

  useEffect(() => {
    let alive = true;
    computePeaks(src).then((p) => {
      if (alive) setPeaks(p);
    });
    return () => {
      alive = false;
    };
  }, [src]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks || width <= 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const srcDur = sourceDuration && sourceDuration > 0 ? sourceDuration : clipDuration;
    const windowStart = Math.max(0, Math.min(1, trimStart / srcDur));
    const windowEnd = Math.max(
      windowStart,
      Math.min(1, (trimStart + clipDuration * (playbackRate || 1)) / srcDur),
    );

    const bars = Math.max(4, Math.floor(width / 3));
    const mid = height / 2;
    ctx.fillStyle = color;
    for (let i = 0; i < bars; i++) {
      const frac = windowStart + ((windowEnd - windowStart) * i) / bars;
      const peak = peaks[Math.min(PEAK_BUCKETS - 1, Math.floor(frac * PEAK_BUCKETS))] ?? 0;
      const h = Math.max(1.5, peak * (height - 8));
      ctx.fillRect(i * 3, mid - h / 2, 2, h);
    }
  }, [peaks, width, height, trimStart, clipDuration, playbackRate, sourceDuration, color]);

  if (!peaks) {
    return (
      <div className="w-full h-full flex items-center px-2">
        <div className="w-full h-[2px] bg-emerald-300/40 rounded animate-pulse" />
      </div>
    );
  }

  return <canvas ref={canvasRef} style={{ width, height }} className="pointer-events-none" />;
};
