# ChromaCanvas 🎨🎬

> A next-generation, AI-powered infinite canvas video editor & recording studio.

ChromaCanvas is a modern web-based video production suite. It combines a non-linear, spatial "infinite canvas" editor with a full-featured multi-source recording studio. Built with React 19, Tailwind CSS, and Google Gemini AI.

## ✨ Key Features

### 🎬 Chroma Canvas (The Editor)
*   **Infinite Spatial Timeline**: Drag, drop, and overlap clips freely. Time flows left-to-right, but layers are limitless.
*   **Magnetic Snapping**: Clips automatically snap to the start/end of other elements for precise alignment.
*   **Multi-Track Mixing**: Layer Videos, Images, Audio, and Text.
*   **AI Asset Generation** (Powered by Gemini 2.5):
    *   **Gen Image**: Create custom assets/backgrounds from text prompts.
    *   **Gen Text Art**: Generate unique typography stickers.
*   **Advanced Editing**:
    *   **Split Clip**: Precision cutting at the playhead.
    *   **Extract Audio**: Separate audio tracks from video files.
    *   **Speed Control**: 0.25x to 4x playback rates.
    *   **Fades & Volume**: Smooth fade-in/out and opacity controls.
    *   **Transform**: Rotate, Scale, and Position any element.
    *   **Multi-Select**: Drag to highlight multiple clips for bulk moving or deleting.
*   **Video Previews**: Real-time video thumbnails directly on the timeline blocks.
*   **Export**: Client-side rendering to MP4 (or WebM) with full audio mixing.

### 🔴 Recorder Studio
A powerful environment to capture raw footage before editing.
*   **Multi-Source Recording**: Record **Screen Share**, **Webcams**, **Microphones**, and **Whiteboards** simultaneously.
*   **Interactive Whiteboard**:
    *   Draw live while recording.
    *   Tools: Brush, Eraser, Color Picker, Undo/Redo.
    *   **Context Menu Toggle**: Right-click to switch between "Moving Window" and "Drawing Mode".
*   **Green Screen (Chroma Key)**: Real-time background removal filter for webcams.
*   **Device Switching**: Hot-swap cameras and microphones on the fly via right-click.
*   **Fit-to-Source**: Auto-resize windows to match the aspect ratio of the input device (e.g., vertical phone camera).
*   **Auto-Save**: All recordings are automatically saved to the Editor Gallery.

## 🚀 Getting Started

### Prerequisites
*   Node.js (v18+)
*   Google Gemini API Key (for AI features)

### Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/lalomorales22/chroma-canvas-video-editor.git
    cd chroma-canvas-video-editor
    ```

2.  **Install dependencies**
    ```bash
    npm install
    # or
    yarn install
    ```

3.  **Set up Environment Variables**
    Create a `.env` file in the root directory:
    ```env
    API_KEY=your_google_gemini_api_key_here
    ```

4.  **Run the app**
    ```bash
    npm start
    ```
    Open [http://localhost:3000](http://localhost:3000).

## 🎮 Controls & Shortcuts

| Action | Shortcut / Control |
| :--- | :--- |
| **Play / Pause** | `Spacebar` |
| **Delete Item** | `Backspace` or `Delete` |
| **Zoom In/Out** | `Ctrl` + `Scroll` / `Cmd` + `Scroll` |
| **Pan Timeline** | `Scroll` (Vertical & Horizontal) |
| **Multi-Select** | Click & Drag on empty canvas space |
| **Context Menu** | `Right-Click` on any item or canvas |

## 🛠️ Tech Stack

*   **Framework**: React 19 (RC)
*   **Language**: TypeScript
*   **Styling**: Tailwind CSS
*   **AI**: Google GenAI SDK (`@google/genai`)
*   **Media**: Native `MediaStream`, `MediaRecorder`, and `Web Audio API`
*   **Icons**: Lucide React

---

### 🟢 Theme
The app features a modern **Emerald & Dark Mode** aesthetic, designed for focus and creativity.

Built with ❤️ by Lalo Morales.
