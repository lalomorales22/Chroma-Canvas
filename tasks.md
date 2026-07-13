# ChromaCanvas — Upgrade Plan (tasks.md)

A 4-phase plan to take ChromaCanvas from an AI Studio prototype to a polished,
installable OBS + CapCut hybrid.

> **Status (July 2026): the big upgrade session landed.** Phases 1–2 are complete,
> Phase 3 is mostly complete, Phase 4 is partially complete. Every remaining item is
> marked below. Quality gates: strict TypeScript ✅ · 16 unit tests ✅ · ESLint 0 errors ✅
> · CI workflow ✅ · production build ✅.

## How the app works (post-upgrade)

- **Stack**: React 19 + Vite 6 + strict TypeScript, Tailwind CSS 4 (compiled, no CDN),
  self-hosted Inter, three.js (lazy-loaded), `@google/genai`, mp4-muxer.
- **State**: typed `EditorAction` union → `state/reducer.ts`, wrapped by
  `state/history.ts` (undo/redo with transient-gesture commits + coalescing).
- **Persistence**: `services/storage.ts` — media blobs + project doc in IndexedDB,
  autosave every 1.5s, object URLs rebuilt on load, orphaned blobs GC'd at boot.
- **Editor**: `Timeline` (track rail with mute/lock/hide, waveforms, filmstrips,
  scrubbing, snap+Alt, source-clamped trims) + `Preview` (transform box: move/scale/
  rotate) + modular sidebar tabs (Gallery/Overlays/Transitions/Adjust).
- **Export**: `export/exporter.ts` — WebCodecs frame-stepped H.264 + offline-mixed AAC
  (Opus fallback), muxed to MP4; realtime MediaRecorder fallback for other browsers.
- **AI**: `services/geminiService.ts` — key from Settings (localStorage) or `.env.local`,
  central model config, friendly error surfacing; image gen, Veo video, remove-BG,
  AI image edit, experimental auto-captions.

---

## Phase 1 — Stabilize the Foundation ✅ COMPLETE

- [x] Fix black screen: add `/index.tsx` entry script, delete CDN importmap
- [x] Add `.env.example` documenting `GEMINI_API_KEY`
- [x] Remove `window.aistudio` dependency (crashed AI video gen outside AI Studio)
- [x] In-app API key Settings modal (localStorage + env fallback, Save & Test)
- [x] Install Tailwind CSS 4 via `@tailwindcss/vite`; self-host Inter (fontsource)
- [x] Fix `streaming-server.js` ESM crash; add `ws` dep, `npm run relay`, FFmpeg check
- [x] Fix export bugs (stale closure, broken cancel, state restoration) — superseded by
      the new exporter, whose cancel actually aborts encoding
- [x] Typed state layer (`EditorAction` union), `strict: true`, `npm run typecheck`
- [x] `crypto.randomUUID()` ids (utils/id.ts)
- [x] Deduplicate `getMediaDuration` into `utils/media.ts`
- [x] React ErrorBoundary + toast system replacing `alert()`
- [x] Blob lifecycle: media lives in IndexedDB; orphaned blobs garbage-collected at boot
- [x] README rewritten (accurate setup, key flow, troubleshooting, allow-scripts note)
- [x] ESLint (flat config + react-hooks) + Prettier + `npm run lint`

## Phase 2 — Core Editor UX ✅ COMPLETE

- [x] Undo/Redo (⌘Z/⇧⌘Z) — history wrapper, drag gestures coalesce to one entry
- [x] Project persistence — IndexedDB media store + 1.5s autosave + restore on launch
- [x] Keyboard shortcuts: ⌘C/X/V/D, ⌘A, S split, ←→ nudge (⇧ = 1s), Home/End, +/-,
      `?` cheat sheet, ⌘K palette
- [x] Track rail: mute / lock / hide per track (respected by preview + export)
- [x] Real audio waveforms (decoded peaks, cached, trim/speed-aware)
- [x] Video filmstrip thumbnails (frame strip cached per source)
- [x] Ruler scrubbing (drag to seek)
- [x] Snapping toggle + `Alt` bypass
- [x] Trim clamps: clips can't outrun their source; resize-start consumes `trimStart`
- [x] Preview transform box: drag move, corner scale, rotate knob (⇧ snaps 15°),
      center guides; videos draggable too
- [x] Performance: memoized `ElementBlock`, deterministic waveforms, filmstrip caching
- [x] Text tool v2: font family, color, size
- [x] Clip context menu: split, duplicate, extract audio (single clip), crossfade
- [ ] Remaining: ripple delete; virtualized tracks for 100+ clip projects; ref-based
      playback clock (dispatch-per-frame still re-renders the tree — fine up to ~30 clips)

## Phase 3 — Pro Features 🟡 MOSTLY COMPLETE

- [x] **Frame-accurate WebCodecs export**: frame-stepped H.264 encode, offline audio
      mixdown → AAC (Opus fallback), mp4-muxer, 720p/1080p presets, live progress,
      working cancel; realtime MediaRecorder fallback for non-Chromium browsers
- [x] **Unified Live Chat** (THE_FUTURE #5): merged Twitch + Kick + YouTube feed in a
      Recorder Studio dock (`services/liveChat.ts`, `components/Recorder/ChatDock.tsx`);
      Twitch is browser-direct anonymous IRC (verified live), Kick rides Pusher with a
      relay-based chatroom lookup (Cloudflare may 403 → paste chatroom id fallback),
      YouTube polls via the relay (experimental); canvas chat overlay addable as a
      scene source so chat appears on stream
- [x] **Phone as Camera** (THE_FUTURE #4): QR + WebRTC via same-origin Vite signaling
      plugin (`/phone-signal` rooms + `/phone-lan-ip`, verified end-to-end);
      `components/PhoneCameraPage.tsx` (phone) + `PhoneCameraModal` (desktop);
      `npm run dev:phone` enables the HTTPS mode phones require for camera access
- [x] **Smart Zoom** (THE_FUTURE #3, live-director version): per-source canvas
      processor (`components/Recorder/smartZoom.ts`) — enable via right-click, then
      double-click to ease into a 2x punch-in with click ripple, double-click to ease
      out; baked into recordings and streams. (Fully automatic zoom-on-click needs
      OS-level input hooks → Tauri wave.)
- [x] **Multistreaming**: destination manager in the Recorder Studio (Twitch/YouTube/
      Kick/X presets + custom RTMP, per-destination keys & toggles, persisted locally);
      relay fans one encode out to all destinations via FFmpeg tee with onfail=ignore
      (`services/streamDestinations.ts`, `streaming-server.js`)
- [x] Crossfade-with-next action (auto overlap + fades) + procedural stinger overlays
- [x] Per-clip color filters (brightness/contrast/saturation/blur) in preview AND export
- [x] AI provider layer: central model config, friendly errors, toasts
- [x] AI image edit (natural-language inpaint/restyle) on any image clip
- [x] Auto-captions (experimental): Gemini transcription → timed caption track
- [ ] Remaining: keyframe animation (x/y/scale/rotation/opacity curves)
- [ ] Remaining: dedicated transition objects (wipe/slide rendered *between* two clips)
- [ ] Remaining: audio ducking, master mixer panel, chroma key on timeline clips
- [ ] Remaining: RecorderStudio modular rewrite (still a 2k-line monolith; lint rules
      are advisory there — see eslint.config.js)

## Phase 4 — Polish, Packaging & Distribution 🟡 PARTIAL

- [x] Three-page app shell with a shared header (`components/AppHeader.tsx`):
      ChromaCanvas brand + Recorder Studio / Media Editor / Gallery tabs on every page;
      navigation locks while recording/streaming
- [x] Gallery page (`components/Gallery/GalleryPage.tsx`): searchable/filterable media
      grid with hover video preview, lightbox player, and right-click actions
      (Add to Editor as Track / Play / Download / Remove)
- [x] Record-first flow: welcome screen leads with Start Recording
- [x] "Image Generator Studio" (was "Gemini Studio") with 3 engines: Free
      (Pollinations.ai, no key), Gemini, OpenAI (gpt-image-1 → DALL·E 3 fallback);
      provider + OpenAI key managed in Settings (`services/imageGen.ts`)
- [x] Welcome screen (Start Recording / Video Editor / Load Demo) with sample media
- [x] Empty states (timeline hint, per-section gallery hints)
- [x] Command palette (⌘K) covering every major action
- [x] Keyboard shortcut cheat sheet (`?`)
- [x] Code-splitting: RecorderStudio + three.js lazy-loaded (main bundle 1.19MB → 643KB)
- [x] Vitest suite for reducer + history (16 tests)
- [x] GitHub Actions CI (typecheck + test + build)
- [x] PWA manifest + app icon (installable shell)
- [x] README v2
- [ ] Remaining: Tauri desktop packaging with bundled FFmpeg sidecar (one-click
      installers; native-speed export + zero-setup streaming). Suggested route:
      `npm create tauri-app`, point it at this Vite app, ship ffmpeg as a sidecar
      binary, swap the relay to a Tauri command.
- [ ] Remaining: service worker for full offline PWA
- [ ] Remaining: Playwright end-to-end smoke test (boot → add clip → export)
- [ ] Remaining: docs site with GIF walkthroughs

---

## Suggested next session

1. **Tauri packaging** — the biggest remaining "easier install" win.
2. **Keyframes** — the biggest remaining creative win.
3. **RecorderStudio refactor** — split into `recorder/` modules, then clear the
      advisory lint rules.
