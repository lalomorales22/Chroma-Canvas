# ChromaCanvas 🎨🎬

<div align="center">
  <img width="800" alt="ChromaCanvas Editor Interface" src="https://github.com/user-attachments/assets/224d9993-1500-4f38-b5d6-3f45e8965b7d" />
  <p><em>Record. Edit. Publish. An OBS + CapCut hybrid that lives in your browser.</em></p>
</div>

> **ChromaCanvas** is an AI-powered video production suite organized as three pages that
> share one header: capture footage in the **🔴 Recorder Studio** (OBS-style multi-source
> capture & multistreaming), cut it together in the **✂️ Media Editor** (CapCut-style
> spatial timeline with frame-accurate MP4 export), and manage everything in the
> **🖼️ Gallery** — with free AI image generation built in.

## 🚀 Quick Start

```bash
git clone https://github.com/lalomorales22/Chroma-Canvas.git
cd Chroma-Canvas
npm install
npm run dev          # → http://localhost:3000
```

That's it. **No API key or account is required** to record, edit, export, or even
generate AI images (the free engine needs nothing). Projects autosave to your browser —
media files included — so refreshing never loses work.

> Seeing `npm warn allow-scripts` messages during install? They're harmless — an npm
> security feature listing packages with install scripts. Run `npm approve-scripts`
> once to review and silence them.

## ✨ The Three Pages

### 🔴 Recorder Studio
- Record **screen, webcam (with chroma key green screen), and mics** simultaneously
- **📱 Phone as Camera** — scan a QR code and your phone becomes a wireless camera
  source over WebRTC (run `npm run dev:phone` for the HTTPS mode phones require)
- **💬 Unified Live Chat** — Twitch, Kick, and YouTube chats merged into one dock
  (Twitch needs zero setup; Kick/YouTube use the relay), plus a **chat overlay**
  you can drop into the scene so chat shows up on the stream itself
- **🎯 Smart Zoom** — right-click a screen/camera source to enable, then double-click
  anywhere to smoothly punch in 2x with a click ripple (baked into recordings & streams)
- Live **whiteboard**, **synthesizer soundboard**, and **3D GLB model showcase** windows
- Scene profiles and per-source recording — every take lands in the Gallery automatically
- **Multistream live to Twitch, YouTube, Kick, X, and custom RTMP servers at once**:
  platform presets prefill the ingest URLs, you paste each stream key, and toggle
  destinations per broadcast. One encode fans out to all of them (FFmpeg tee muxer),
  so one platform failing never drops the others.

### ✂️ Media Editor
- **Infinite spatial timeline** — drag, drop, overlap, and stack clips on unlimited tracks
- **Track rail** — mute 🔇, lock 🔒, or hide 👁️ any track
- **Real audio waveforms** and **video filmstrip thumbnails** on clips
- **Undo/redo everything** (⌘Z / ⇧⌘Z), full copy/cut/paste/duplicate
- Magnetic snapping (hold `Alt` to bypass), ruler scrubbing, marquee select
- Split, speed ramp (0.25×–8×), fades, extract audio, crossfade-with-next
- **Transform box in the preview** — drag to move, corner handles to scale, knob to rotate
- **Color filters** per clip: brightness, contrast, saturation, blur
- Text styling (fonts, colors, size), emoji stickers, PNG overlays, GIFs
- **Frame-accurate MP4 export via WebCodecs** — renders faster than realtime with
  sample-accurate AAC audio; 720p/1080p, landscape or portrait (automatic
  realtime-capture fallback on browsers without WebCodecs)

### 🖼️ Gallery
- Every recording, import, and AI generation in one searchable, filterable grid
- Hover a video card to preview it; click any file for a full lightbox player
- Right-click any file: **Add to Editor as Track**, Play/View, Download, or Remove

## 🤖 AI Toolkit

**Image Generator Studio** (in the editor sidebar) with three switchable engines:

| Engine | Cost | Setup |
| :--- | :--- | :--- |
| **Free (Pollinations.ai)** — default | Free | None. Zero. Works immediately. |
| **Google Gemini** | Your key | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → Settings |
| **OpenAI** (gpt-image-1 → DALL·E 3 fallback) | Your key | platform.openai.com → Settings |

With a Gemini key you also unlock:
- **Veo video generation** (16:9 or 9:16 clips — needs a key from a paid Google project)
- **Magic: Remove BG** — right-click any image on the timeline
- **AI Edit** — natural-language image edits ("make the sky purple")
- **Auto-captions** — transcribe a clip's audio into a timed caption track (experimental)

Add keys via the **gear icon → Settings** in the app (stored only in your browser), or
copy `.env.example` to `.env.local` for a build-time Gemini key.

## 📡 Live Streaming Setup (optional)

Browsers can't speak RTMP, so streaming runs through the bundled local relay:

```bash
brew install ffmpeg   # macOS  (Windows: winget install ffmpeg)
npm run relay         # starts the relay on ws://localhost:4000
```

Then hit **Stream** in the Recorder Studio, add your destinations, and go live. The
relay also powers the Kick channel lookup and the experimental YouTube live chat in
the Unified Chat dock (Twitch chat needs no relay at all).

## 📱 Phone as Camera Setup (optional)

Phones only allow camera access on HTTPS pages, so use the secure dev mode:

```bash
npm run dev:phone     # HTTPS dev server with a self-signed certificate
```

Open the `https://` **Network URL** Vite prints (accept the certificate warning),
click **Phone Camera** in the Recorder Studio, and scan the QR with your phone on the
same Wi-Fi. Your phone's camera appears in the scene as a wireless source.

## ⌨️ Shortcuts

Press `?` in the app for the full cheat sheet, or `⌘K` for the command palette.

| Action | Keys |
| :--- | :--- |
| Play / Pause | `Space` |
| Undo / Redo | `⌘Z` / `⇧⌘Z` |
| Copy / Cut / Paste / Duplicate | `⌘C` `⌘X` `⌘V` `⌘D` |
| Split at playhead | `S` |
| Nudge clips 0.1s / 1s | `←→` / `⇧←→` |
| Zoom timeline | `+` `-` or `⌘Scroll` |
| Command palette | `⌘K` |

## 🛠️ Development

```bash
npm run dev          # vite dev server
npm run dev:phone    # HTTPS dev server (required for Phone as Camera)
npm run relay        # multistream + chat relay
npm run typecheck    # strict TypeScript
npm test             # vitest (state layer: reducer + undo history)
npm run lint         # eslint
npm run build        # production build
```

CI (GitHub Actions) runs typecheck + tests + build on every push and PR.

### Architecture

```
state/        typed reducer + undo/redo history (transient gestures, coalescing)
services/     IndexedDB persistence · Gemini provider · image engines ·
              stream destinations · unified live chat providers
export/       WebCodecs frame-stepped MP4 exporter + realtime fallback
components/   AppHeader · Canvas (timeline) · Preview · Gallery · Sidebar tabs ·
              Recorder (ChatDock, PhoneCameraModal, smartZoom) · modals · UI
utils/        media probing, imports, transforms, element factories
streaming-server.js   FFmpeg multistream relay + Kick lookup + YouTube chat poller
vite.config.ts        includes the same-origin WebRTC signaling plugin for Phone Camera
```

### Built with
React 19 · TypeScript (strict) · Vite 6 · Tailwind CSS 4 · WebCodecs · WebRTC ·
Web Audio · IndexedDB · Google Gemini (`@google/genai`) · Three.js · mp4-muxer

## 🧯 Troubleshooting

- **AI buttons show a key error** → switch the engine to Free, or add a key in Settings.
- **Free image engine is slow or errors** → Pollinations is a public service and can be
  busy; wait a few seconds and retry.
- **"Fast export unavailable"** → your browser lacks WebCodecs; the app records the
  export in realtime instead (Chrome/Edge recommended).
- **Streaming won't connect** → make sure `npm run relay` is running in a separate
  terminal and FFmpeg is on your PATH.
- **X/Kick won't accept the stream** → paste the exact regional ingest URL from that
  platform's dashboard over the preset.
- **Phone camera QR does nothing** → phones need HTTPS: restart with
  `npm run dev:phone`, open the `https://` Network URL on both devices, and accept the
  certificate warning. Both devices must be on the same Wi-Fi.
- **Kick chat says "lookup failed"** → Kick's API sometimes blocks server lookups;
  paste your numeric chatroom ID into the field instead.
- **YouTube chat errors** → it only works while the stream is actually live with chat
  enabled, needs `npm run relay`, and is experimental (it uses YouTube's internal
  endpoint, which can change without notice).

## 🗺️ Roadmap

See [tasks.md](tasks.md) for the full plan. Next up: Tauri desktop packaging with a
bundled FFmpeg (one-click installers), keyframe animation, and true between-clip
transition objects.

Built with ❤️ for creators who want more intuition and power in their editor.
