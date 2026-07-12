import { CanvasElement } from '../types';

export interface ProceduralTransform {
  x: number;
  y: number;
  rotation: number;
  scale: number;
  opacityMultiplier: number;
}

/** Deterministic pseudo-random in [-0.5, 0.5) from a time value — keeps glitch
 *  identical between preview playback and frame-stepped export. */
const jitter = (t: number, salt: number): number => {
  const v = Math.sin(t * 137.31 + salt * 91.7) * 43758.5453;
  return v - Math.floor(v) - 0.5;
};

export const getProceduralTransform = (
  el: CanvasElement,
  currentTime: number,
  canvasMode: 'landscape' | 'portrait',
  animate: boolean,
): ProceduralTransform => {
  const progress = (currentTime - el.startTime) / el.duration;
  const clampedProgress = Math.max(0, Math.min(1, progress));

  let x = el.x || 0;
  let y = el.y || 0;
  let rotation = el.rotation;
  let scale = el.scale;
  let opacityMultiplier = 1;

  const canvasWidth = canvasMode === 'portrait' ? 720 : 1280;

  if (el.name === 'Spin') {
    rotation += clampedProgress * 360 * 2;
    scale *= 1 - Math.abs(clampedProgress - 0.5) * 0.5;
  } else if (el.name === 'Swipe Left') {
    x += canvasWidth - clampedProgress * canvasWidth * 2;
  } else if (el.name === 'Swipe Right') {
    x += -canvasWidth + clampedProgress * canvasWidth * 2;
  } else if (el.name === 'Glitch') {
    if (animate) {
      const t = currentTime * 30; // step at ~30Hz for a choppy feel
      const step = Math.floor(t);
      x += jitter(step, 1) * 60;
      y += jitter(step, 2) * 30;
      scale *= 1 + jitter(step, 3) * 0.1;
      rotation += jitter(step, 4) * 5;
    }
  } else if (el.name === 'Fade Black' || el.name === 'Fade White') {
    // Triangular dip: 0 -> 1 (at midpoint) -> 0
    opacityMultiplier = 1 - Math.abs(clampedProgress - 0.5) * 2;
  }

  return { x, y, rotation, scale, opacityMultiplier };
};
