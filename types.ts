
export enum ElementType {
  VIDEO = 'VIDEO',
  IMAGE = 'IMAGE',
  AUDIO = 'AUDIO',
  TEXT = 'TEXT',
}

export interface CanvasElement {
  id: string;
  type: ElementType;
  src?: string; // URL for media
  text?: string; // Content for text elements
  name: string;
  
  // Timeline positioning
  startTime: number; // in seconds
  duration: number; // in seconds
  trackId: number; // Vertical layer index (0 is bottom)

  // Visual Properties
  x?: number; // Visual X offset (derived from startTime in render)
  y?: number; // Visual Y offset (derived from trackId in render)
  width?: number; // Visual width (derived from duration in render)
  
  // Media Properties
  volume: number; // 0-1
  opacity: number; // 0-1
  rotation: number; // degrees
  scale: number; // 1 = 100%
  playbackRate: number; // Speed multiplier (default 1)
  fontSize?: number; // px for text
  
  // Trimming (Video/Audio)
  trimStart: number; // Seconds to skip from start of source (Media Time)
  
  // Fades
  fadeIn: number; // Seconds
  fadeOut: number; // Seconds
}

export interface LibraryItem {
  id: string;
  type: ElementType;
  src: string;
  name: string;
  category: 'VIDEO' | 'IMAGE' | 'AUDIO' | 'OVERLAY';
  duration?: number;
}

export interface EditorState {
  elements: CanvasElement[];
  library: LibraryItem[];
  currentTime: number; // Current playhead position in seconds
  isPlaying: boolean;
  zoom: number; // Pixels per second
  selectedIds: string[]; // Changed from single ID to array
  duration: number; // Total project duration (max end time)
  canvasMode: 'landscape' | 'portrait';
  seekVersion: number; // Increments on manual seek to reset animation loop
  clipboard: CanvasElement | null;
  view: 'EDITOR' | 'RECORDER'; // New View State
}

export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  targetId: string | null; // Null means clicked on empty canvas
}