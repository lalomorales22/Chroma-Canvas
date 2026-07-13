import { uid } from '../utils/id';
import { relayHttpUrl, relayWsUrl } from '../utils/relay';

/**
 * Unified live chat — one merged feed from every platform you stream to.
 *
 * Providers:
 *  - Twitch: anonymous IRC over WebSocket, straight from the browser. No auth,
 *    no key, read-only. Rock solid.
 *  - Kick: public Pusher websocket, straight from the browser. The channel →
 *    chatroom-id lookup goes through the local relay (Kick's API blocks CORS);
 *    a numeric chatroom id can also be entered directly.
 *  - YouTube: no free public API, so the local relay polls YouTube's internal
 *    live-chat endpoint (experimental — may break if YouTube changes it).
 */

export type ChatPlatform = 'twitch' | 'kick' | 'youtube';

export interface ChatMessage {
  id: string;
  platform: ChatPlatform;
  author: string;
  color?: string;
  text: string;
  ts: number;
}

export interface ChatConnection {
  platform: ChatPlatform;
  channel: string;
  status: 'connecting' | 'live' | 'error';
  detail?: string;
  disconnect: () => void;
}

export const PLATFORM_COLORS: Record<ChatPlatform, string> = {
  twitch: '#a970ff',
  kick: '#53fc18',
  youtube: '#ff4e45',
};

export const PLATFORM_LABELS: Record<ChatPlatform, string> = {
  twitch: 'Twitch',
  kick: 'Kick',
  youtube: 'YouTube',
};

type MessageHandler = (msg: ChatMessage) => void;
type StatusHandler = (status: ChatConnection['status'], detail?: string) => void;

// ---------------------------------------------------------------------------
// Twitch — anonymous IRC (browser-direct)
// ---------------------------------------------------------------------------

const connectTwitch = (
  channel: string,
  onMessage: MessageHandler,
  onStatus: StatusHandler,
): (() => void) => {
  const clean = channel.trim().toLowerCase().replace(/^#/, '').replace(/^.*twitch\.tv\//, '');
  let ws: WebSocket | null = null;
  let closed = false;
  let pingInterval: number | undefined;

  const connect = () => {
    ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
    ws.onopen = () => {
      // Anonymous read-only login — any justinfan#### nick works.
      ws?.send('CAP REQ :twitch.tv/tags');
      ws?.send(`NICK justinfan${Math.floor(Math.random() * 80000) + 1000}`);
      ws?.send(`JOIN #${clean}`);
      onStatus('live');
      pingInterval = window.setInterval(() => ws?.send('PING'), 60_000);
    };
    ws.onmessage = (event) => {
      const lines = String(event.data).split('\r\n');
      for (const line of lines) {
        if (!line) continue;
        if (line.startsWith('PING')) {
          ws?.send('PONG :tmi.twitch.tv');
          continue;
        }
        const match = line.match(/^(@[^ ]+ )?:([^!]+)![^ ]+ PRIVMSG #[^ ]+ :(.*)$/);
        if (match) {
          const tags = match[1] ?? '';
          const colorMatch = tags.match(/color=(#[0-9A-Fa-f]{6})/);
          const nameMatch = tags.match(/display-name=([^;]+)/);
          onMessage({
            id: uid(),
            platform: 'twitch',
            author: nameMatch?.[1] || match[2],
            color: colorMatch?.[1],
            text: match[3].charCodeAt(0) === 1
              ? match[3].slice(1, -1).replace(/^ACTION /, '')
              : match[3],
            ts: Date.now(),
          });
        }
      }
    };
    ws.onclose = () => {
      if (pingInterval) window.clearInterval(pingInterval);
      if (!closed) {
        onStatus('connecting', 'Reconnecting…');
        window.setTimeout(connect, 3000);
      }
    };
    ws.onerror = () => onStatus('error', 'Twitch chat connection failed.');
  };

  onStatus('connecting');
  connect();
  return () => {
    closed = true;
    if (pingInterval) window.clearInterval(pingInterval);
    ws?.close();
  };
};

// ---------------------------------------------------------------------------
// Kick — public Pusher websocket (browser-direct; chatroom lookup via relay)
// ---------------------------------------------------------------------------

const KICK_PUSHER_URL =
  'wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0&flash=false';

const lookupKickChatroom = async (slug: string): Promise<number> => {
  // Numeric input = the user pasted a chatroom id directly.
  if (/^\d+$/.test(slug)) return parseInt(slug, 10);
  const res = await fetch(relayHttpUrl(`/kick/chatroom/${encodeURIComponent(slug)}`));
  if (!res.ok) {
    throw new Error(
      'Kick channel lookup needs the relay (npm run relay) — or paste your numeric chatroom ID instead.',
    );
  }
  const json = await res.json();
  if (!json.chatroomId) throw new Error(json.error || 'Kick channel not found.');
  return json.chatroomId;
};

const connectKick = (
  channel: string,
  onMessage: MessageHandler,
  onStatus: StatusHandler,
): (() => void) => {
  const clean = channel.trim().toLowerCase().replace(/^.*kick\.com\//, '');
  let ws: WebSocket | null = null;
  let closed = false;

  onStatus('connecting');
  lookupKickChatroom(clean)
    .then((chatroomId) => {
      if (closed) return;
      ws = new WebSocket(KICK_PUSHER_URL);
      ws.onopen = () => {
        ws?.send(
          JSON.stringify({
            event: 'pusher:subscribe',
            data: { auth: '', channel: `chatrooms.${chatroomId}.v2` },
          }),
        );
        onStatus('live');
      };
      ws.onmessage = (event) => {
        try {
          const frame = JSON.parse(String(event.data));
          if (frame.event === 'App\\Events\\ChatMessageEvent') {
            const data = JSON.parse(frame.data);
            onMessage({
              id: uid(),
              platform: 'kick',
              author: data.sender?.username ?? 'kick user',
              color: data.sender?.identity?.color,
              text: (data.content ?? '').replace(/\[emote:\d+:([^\]]+)\]/g, '$1'),
              ts: Date.now(),
            });
          }
        } catch {
          /* non-JSON frame */
        }
      };
      ws.onclose = () => {
        if (!closed) onStatus('error', 'Kick chat disconnected.');
      };
      ws.onerror = () => onStatus('error', 'Kick chat connection failed.');
    })
    .catch((e) => onStatus('error', e instanceof Error ? e.message : 'Kick lookup failed.'));

  return () => {
    closed = true;
    ws?.close();
  };
};

// ---------------------------------------------------------------------------
// YouTube — relay-polled internal endpoint (experimental)
// ---------------------------------------------------------------------------

const extractYouTubeVideoId = (input: string): string => {
  const trimmed = input.trim();
  const patterns = [/[?&]v=([\w-]{11})/, /youtu\.be\/([\w-]{11})/, /\/live\/([\w-]{11})/];
  for (const p of patterns) {
    const m = trimmed.match(p);
    if (m) return m[1];
  }
  return trimmed; // assume a bare video id
};

const connectYouTube = (
  channel: string,
  onMessage: MessageHandler,
  onStatus: StatusHandler,
): (() => void) => {
  const videoId = extractYouTubeVideoId(channel);
  let ws: WebSocket | null = null;
  let closed = false;

  onStatus('connecting');
  ws = new WebSocket(relayWsUrl());
  ws.onopen = () => {
    ws?.send(JSON.stringify({ type: 'youtube-chat', videoId }));
  };
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(String(event.data));
      if (data.type === 'youtube-chat-status') {
        onStatus(data.state, data.message);
      } else if (data.type === 'youtube-chat-messages') {
        for (const m of data.messages ?? []) {
          onMessage({
            id: uid(),
            platform: 'youtube',
            author: m.author ?? 'viewer',
            text: m.text ?? '',
            ts: Date.now(),
          });
        }
      }
    } catch {
      /* ignore */
    }
  };
  ws.onerror = () => {
    onStatus('error', 'YouTube chat needs the relay running (npm run relay).');
  };
  ws.onclose = () => {
    if (!closed) onStatus('error', 'YouTube chat relay disconnected.');
  };

  return () => {
    closed = true;
    ws?.close();
  };
};

// ---------------------------------------------------------------------------

export const connectChat = (
  platform: ChatPlatform,
  channel: string,
  onMessage: MessageHandler,
  onStatus: StatusHandler,
): (() => void) => {
  switch (platform) {
    case 'twitch':
      return connectTwitch(channel, onMessage, onStatus);
    case 'kick':
      return connectKick(channel, onMessage, onStatus);
    case 'youtube':
      return connectYouTube(channel, onMessage, onStatus);
  }
};
