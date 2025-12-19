
# ChromaCanvas 🎨🎬

<div align="center">
  <img width="800" alt="ChromaCanvas Editor Interface" src="https://github.com/user-attachments/assets/224d9993-1500-4f38-b5d6-3f45e8965b7d" />
  <p><em>The Infinite Spatial Canvas Video Editor</em></p>
</div>

<br/>

> **ChromaCanvas** is a world-class, AI-powered infinite canvas video production suite. It redefines the editing experience by combining a spatial "open canvas" timeline with cutting-edge Google Gemini AI features.

## ✨ New in this Version

*   **🎬 Fixed MP4 Export**: High-fidelity audio synchronization. Added MP3 songs now export perfectly with the final video.
*   **🪄 Magic: Remove BG**: Right-click any image on the canvas to intelligently isolate the subject using Gemini 2.5 Flash Image.
*   **🎥 AI Video Generation**: Craft stunning B-roll and clips directly in the Gemini Studio using **Veo 3.1**.
*   **📐 Aspect Ratio Selectors**: Choose between **Landscape (16:9)** or **Portrait (9:16)** before generating AI images, text art, or videos.
*   **🎯 Refined UI**: "Auto Fit" and "Fit View" controls moved to the main header for a cleaner, more intuitive workspace.

---

## 🚀 Key Features

### 🎨 The Open Canvas Editor
*   **Infinite Spatial Timeline**: A CapCut-inspired but more intuitive UI. Drag, drop, and overlap clips anywhere. 
*   **Magnetic Snapping**: Precise alignment tools that snap clips to boundaries and the playhead.
*   **Header Controls**: Integrated Zoom and Fit-to-Screen controls for a seamless navigation experience.
*   **Advanced Tools**: Split clips, extract audio from video, speed control (0.25x - 8x), and procedural transitions (Glitch, Spin, Swipe).

### 🤖 Gemini Studio (AI-Powered)
*   **Veos 3.1 Video Gen**: Generate high-quality cinematic videos from text prompts.
*   **Multi-Aspect Image Gen**: Create backgrounds or assets in 16:9 or 9:16.
*   **Text-to-Art**: Generate graffiti-style typography and creative stickers.
*   **Smart Background Removal**: One-click subject isolation for complex overlays.

### 🔴 Recorder Studio
*   **Multi-Source Capture**: Record Screen, Webcam (with Green Screen/Chroma Key), and Microphones simultaneously.
*   **Interactive Tools**: A live Whiteboard for sketching and a Synthesizer for adding musical stings during recording.
*   **3D Showcase**: Import and rotate GLB/GLTF models in a 3D gallery window while recording.

---

## 🛠️ Setup & Requirements

### Installation
1.  **Clone & Install**:
    ```bash
    git clone https://github.com/your-repo/chroma-canvas.git
    cd chroma-canvas
    npm install
    ```
2.  **API Key**: Ensure your environment has a valid Google Gemini API Key.
    *   *Note: AI Video Generation requires a Paid Project API key. The app will prompt you to select one via the Google AI Studio dialog.*

### Local Streaming Relay (Optional)
To stream live to Twitch/YouTube from the Recorder Studio:
1.  Install WebSocket dependencies: `npm install ws`
2.  Start the relay: `node streaming-server.js`
3.  Ensure **FFmpeg** is installed on your system.

---

## ⌨️ Shortcuts & Navigation

| Action | Control |
| :--- | :--- |
| **Play / Pause** | `Spacebar` |
| **Delete Selected** | `Backspace` / `Delete` |
| **Zoom Canvas** | `Ctrl` + `Scroll` |
| **Context Menu** | `Right-Click` on item or canvas |
| **Edit Text** | `Double-Click` text block |
| **Copy / Paste** | `Right-Click` -> Copy / Paste |

---

### 🟢 Built With
*   **React 19**
*   **Tailwind CSS**
*   **Google Gemini API** (Gemini 3 Pro, Gemini 2.5 Flash, Veo 3.1)
*   **Three.js** (3D Rendering)
*   **Web Audio API** (Spatial Mixing)

Built with ❤️ for creators who want more intuition and power in their editor.
