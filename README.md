# ChromaCanvas 🎨🎬

> A next-generation, AI-powered infinite canvas video editor.

ChromaCanvas is a modern web-based video editing application that breaks away from traditional linear timelines. It offers a spatial "infinite canvas" approach where time flows left-to-right, but creativity knows no bounds. Built with React, Tailwind CSS, and Google Gemini AI.

## ✨ Features

- **Infinite Canvas Timeline**: Drag, drop, and arrange clips on a spatial timeline.
- **Multi-Track Editing**: Layer videos, images, audio, and text freely.
- **AI-Powered Generation**:
  - Generate images and backgrounds using Google Gemini 2.5 Flash Image.
  - Create unique text art and typography stickers.
- **Advanced Editing Tools**:
  - **Split Clips**: Precise cutting of video and audio segments.
  - **Extract Audio**: Separate audio tracks from video files.
  - **Speed Control**: Adjust playback rate (0.25x - 4x) for slow-mo or timelapse effects.
  - **Fades**: Smooth audio/video fade-in and fade-out controls.
  - **Transform**: Scale, rotate, and adjust opacity of any element.
- **Media Support**:
  - Drag & Drop import for Videos (MP4, WebM), Audio (MP3, WAV), and Images.
  - Built-in Gallery and Overlay/Sticker library.
- **Flexible Export**:
  - Render projects to MP4 (or WebM fallback).
  - Support for **Landscape (16:9)** and **Portrait (9:16)** aspect ratios.

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn
- A Google Gemini API Key (for AI features)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/lalomorales22/chroma-canvas-video-editor.git
   ```

2. **Navigate to the project directory**
   ```bash
   cd chroma-canvas-video-editor
   ```

3. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   ```

4. **Set up Environment Variables**
   Create a `.env` file in the root directory and add your Google Gemini API key:
   ```env
   API_KEY=your_google_gemini_api_key_here
   ```

5. **Run the development server**
   ```bash
   npm start
   # or
   yarn start
   ```

   Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

## 🎮 How to Use

1.  **Import Media**: Drag files from your computer directly onto the canvas or into the "Gallery" drop zone in the sidebar.
2.  **Arrange**: Move clips around the timeline. Vertical position determines the layer order (bottom is background, top is foreground).
3.  **Edit**:
    - **Trim**: Hover over the edges of a clip to drag and trim the start or end.
    - **Split**: Right-click a clip and select "Split Clip" to cut it at the playhead.
    - **Properties**: Click a clip to open the "Adjust" panel in the sidebar to change volume, speed, opacity, etc.
4.  **AI Gen**: Go to the Gallery tab, type a prompt, and click "Gen Image" or "Gen Text Art" to create assets on the fly.
5.  **Export**: Click the "Export MP4" button in the sidebar to render your masterpiece.

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript
- **Styling**: Tailwind CSS
- **AI**: Google GenAI SDK (Gemini 2.5 Flash)
- **Icons**: Lucide React

---

Built with ❤️ by Lalo Morales.