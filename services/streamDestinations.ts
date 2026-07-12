import { uid } from '../utils/id';

/**
 * Multistream destinations: each has an RTMP(S) ingest URL + stream key and can
 * be toggled per-broadcast. Persisted in this browser. The relay server fans a
 * single encode out to every enabled destination (FFmpeg tee muxer).
 */

export type PlatformId = 'twitch' | 'youtube' | 'kick' | 'x' | 'custom';

export interface StreamDestination {
  id: string;
  platform: PlatformId;
  url: string;
  key: string;
  enabled: boolean;
}

export interface PlatformPreset {
  id: PlatformId;
  label: string;
  url: string;
  keyHint: string;
}

export const PLATFORM_PRESETS: PlatformPreset[] = [
  {
    id: 'twitch',
    label: 'Twitch',
    url: 'rtmp://live.twitch.tv/app',
    keyHint: 'Creator Dashboard → Settings → Stream',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    url: 'rtmp://a.rtmp.youtube.com/live2',
    keyHint: 'YouTube Studio → Go Live → Stream key',
  },
  {
    id: 'kick',
    label: 'Kick',
    url: 'rtmps://fa723fc1b171.global-contribute.live-video.net/app',
    keyHint: 'Creator Dashboard → Settings → Stream Key',
  },
  {
    id: 'x',
    label: 'X (Twitter)',
    url: 'rtmp://va.pscp.tv:80/x',
    keyHint: 'X Media Studio → Producer → Create broadcast',
  },
  {
    id: 'custom',
    label: 'Custom RTMP',
    url: '',
    keyHint: 'Any RTMP(S) ingest server',
  },
];

export const presetFor = (platform: PlatformId): PlatformPreset =>
  PLATFORM_PRESETS.find((p) => p.id === platform) ?? PLATFORM_PRESETS[PLATFORM_PRESETS.length - 1];

export const createDestination = (platform: PlatformId = 'twitch'): StreamDestination => ({
  id: uid(),
  platform,
  url: presetFor(platform).url,
  key: '',
  enabled: true,
});

const STORAGE_KEY = 'chromacanvas.stream-destinations';

export const loadDestinations = (): StreamDestination[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StreamDestination[];
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch {
    /* corrupted or unavailable storage */
  }
  return [createDestination('twitch')];
};

export const saveDestinations = (destinations: StreamDestination[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(destinations));
  } catch {
    /* storage unavailable */
  }
};

export const readyDestinations = (destinations: StreamDestination[]): StreamDestination[] =>
  destinations.filter((d) => d.enabled && d.url.trim() && d.key.trim());
