/**
 * Smart Zoom — a live "director punch-in" for any video source.
 *
 * Wraps a MediaStream in a canvas pipeline (same pattern as the chroma key
 * processor): double-click a spot and the view smoothly eases into a zoom
 * centered on it, with a click-ripple baked into the output. Because the
 * processed stream replaces the source, the zoom appears in recordings AND
 * live streams.
 *
 * (Fully automatic zoom-on-click for OS-level screen recordings needs global
 * input hooks the browser doesn't have — that arrives with the desktop build.)
 */

export interface SmartZoomController {
  stream: MediaStream;
  /** Aim at a normalized point (0..1) and ease to the given zoom level. */
  setTarget: (nx: number, ny: number, level: number) => void;
  /** Ease back out to 1x. */
  reset: () => void;
  isZoomed: () => boolean;
  stop: () => void;
}

const EASE = 0.14; // per-frame interpolation factor
const RIPPLE_MS = 600;

export const createSmartZoomStream = (sourceStream: MediaStream): SmartZoomController => {
  const video = document.createElement('video');
  video.srcObject = sourceStream;
  video.muted = true;
  video.play().catch(() => {});

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // Current view state (eased) and target
  let cx = 0.5;
  let cy = 0.5;
  let zoom = 1;
  let tx = 0.5;
  let ty = 0.5;
  let tzoom = 1;
  let ripple: { nx: number; ny: number; at: number } | null = null;

  let animationId = 0;
  let isActive = true;

  const draw = () => {
    if (!isActive) return;
    if (video.readyState >= video.HAVE_CURRENT_DATA && ctx) {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (vw && vh) {
        if (canvas.width !== vw || canvas.height !== vh) {
          canvas.width = vw;
          canvas.height = vh;
        }

        // Ease toward the target
        cx += (tx - cx) * EASE;
        cy += (ty - cy) * EASE;
        zoom += (tzoom - zoom) * EASE;

        // Source window for the current zoom, clamped inside the frame
        const sw = vw / zoom;
        const sh = vh / zoom;
        const sx = Math.max(0, Math.min(vw - sw, cx * vw - sw / 2));
        const sy = Math.max(0, Math.min(vh - sh, cy * vh - sh / 2));

        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, vw, vh);

        // Click ripple, drawn in output space at the focal point
        if (ripple) {
          const age = performance.now() - ripple.at;
          if (age > RIPPLE_MS) {
            ripple = null;
          } else {
            const progress = age / RIPPLE_MS;
            const px = ((ripple.nx * vw - sx) / sw) * vw;
            const py = ((ripple.ny * vh - sy) / sh) * vh;
            const radius = 12 + progress * 70;
            ctx.beginPath();
            ctx.arc(px, py, radius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(163, 230, 53, ${0.85 * (1 - progress)})`;
            ctx.lineWidth = 4 * (1 - progress) + 1;
            ctx.stroke();
          }
        }
      }
    }
    animationId = requestAnimationFrame(draw);
  };
  draw();

  const stream = canvas.captureStream(30);
  sourceStream.getAudioTracks().forEach((track) => stream.addTrack(track));

  return {
    stream,
    setTarget: (nx, ny, level) => {
      tx = Math.max(0, Math.min(1, nx));
      ty = Math.max(0, Math.min(1, ny));
      tzoom = Math.max(1, Math.min(6, level));
      ripple = { nx: tx, ny: ty, at: performance.now() };
    },
    reset: () => {
      tx = 0.5;
      ty = 0.5;
      tzoom = 1;
    },
    isZoomed: () => tzoom > 1.05,
    stop: () => {
      isActive = false;
      cancelAnimationFrame(animationId);
      stream.getVideoTracks().forEach((t) => t.stop());
      video.pause();
      video.srcObject = null;
    },
  };
};
