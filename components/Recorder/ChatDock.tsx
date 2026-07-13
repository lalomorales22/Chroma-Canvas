import React, { useEffect, useRef, useState } from 'react';
import { Icons } from '../Icon';
import { toast } from '../ui/Toast';
import {
  ChatMessage,
  ChatPlatform,
  PLATFORM_COLORS,
  PLATFORM_LABELS,
  connectChat,
} from '../../services/liveChat';

/**
 * The Unified Chat dock: one merged feed from Twitch + Kick + YouTube, plus a
 * canvas-rendered "chat overlay" that can be added to the scene so chat
 * appears ON the stream/recording itself.
 */

const MAX_MESSAGES = 200;
const OVERLAY_W = 480;
const OVERLAY_H = 640;

interface ConnectionState {
  status: 'off' | 'connecting' | 'live' | 'error';
  detail?: string;
  channel: string;
  disconnect?: () => void;
}

interface ChatDockProps {
  onAddOverlay: (stream: MediaStream, stop: () => void) => void;
  onClose: () => void;
}

const PLACEHOLDERS: Record<ChatPlatform, string> = {
  twitch: 'channel name',
  kick: 'channel name (or chatroom id)',
  youtube: 'live video URL or id',
};

export const ChatDock: React.FC<ChatDockProps> = ({ onAddOverlay, onClose }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  const [inputs, setInputs] = useState<Record<ChatPlatform, string>>({
    twitch: '',
    kick: '',
    youtube: '',
  });
  const [connections, setConnections] = useState<Record<ChatPlatform, ConnectionState>>({
    twitch: { status: 'off', channel: '' },
    kick: { status: 'off', channel: '' },
    youtube: { status: 'off', channel: '' },
  });
  const [overlayActive, setOverlayActive] = useState(false);
  const overlayStopRef = useRef<(() => void) | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const connectionsRef = useRef(connections);

  useEffect(() => {
    connectionsRef.current = connections;
  }, [connections]);

  useEffect(() => {
    messagesRef.current = messages;
    // Autoscroll the feed
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Disconnect everything on unmount
  useEffect(
    () => () => {
      Object.values(connectionsRef.current).forEach((c) => c.disconnect?.());
      overlayStopRef.current?.();
    },
    [],
  );

  const pushMessage = (msg: ChatMessage) => {
    setMessages((prev) => {
      const next = [...prev, msg];
      return next.length > MAX_MESSAGES ? next.slice(next.length - MAX_MESSAGES) : next;
    });
  };

  const toggleConnection = (platform: ChatPlatform) => {
    const existing = connections[platform];
    if (existing.status !== 'off') {
      existing.disconnect?.();
      setConnections((prev) => ({ ...prev, [platform]: { status: 'off', channel: '' } }));
      return;
    }
    const channel = inputs[platform].trim();
    if (!channel) {
      toast(`Enter a ${PLATFORM_LABELS[platform]} ${PLACEHOLDERS[platform]} first.`, 'error');
      return;
    }
    const disconnect = connectChat(platform, channel, pushMessage, (status, detail) => {
      setConnections((prev) => ({
        ...prev,
        [platform]: { ...prev[platform], status, detail },
      }));
      if (status === 'error' && detail) toast(`${PLATFORM_LABELS[platform]}: ${detail}`, 'error');
    });
    setConnections((prev) => ({
      ...prev,
      [platform]: { status: 'connecting', channel, disconnect },
    }));
  };

  const toggleOverlay = () => {
    if (overlayActive) {
      // The overlay source stays in the scene; this just re-arms the button.
      setOverlayActive(false);
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = OVERLAY_W;
    canvas.height = OVERLAY_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let active = true;
    const drawLoop = () => {
      if (!active) return;
      ctx.clearRect(0, 0, OVERLAY_W, OVERLAY_H);
      ctx.textBaseline = 'top';

      const msgs = messagesRef.current.slice(-14);
      let y = OVERLAY_H - 16;
      // Draw bottom-up so the newest message hugs the bottom edge
      for (let i = msgs.length - 1; i >= 0; i--) {
        const m = msgs[i];
        ctx.font = '600 20px Inter, sans-serif';
        const author = `${m.author}`;
        ctx.font = '400 20px Inter, sans-serif';

        // Word-wrap the text
        const words = `${m.text}`.split(' ');
        const lines: string[] = [];
        let line = '';
        const maxWidth = OVERLAY_W - 40;
        for (const word of words) {
          const test = line ? `${line} ${word}` : word;
          if (ctx.measureText(test).width > maxWidth && line) {
            lines.push(line);
            line = word;
          } else {
            line = test;
          }
        }
        if (line) lines.push(line);

        const blockHeight = 30 + lines.length * 26 + 10;
        y -= blockHeight;
        if (y < 0) break;

        // Author row: platform dot + name
        ctx.beginPath();
        ctx.arc(22, y + 12, 6, 0, Math.PI * 2);
        ctx.fillStyle = PLATFORM_COLORS[m.platform];
        ctx.fill();
        ctx.font = '700 19px Inter, sans-serif';
        ctx.fillStyle = m.color || PLATFORM_COLORS[m.platform];
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 6;
        ctx.fillText(author, 38, y + 2);

        // Message lines
        ctx.font = '400 20px Inter, sans-serif';
        ctx.fillStyle = '#ffffff';
        lines.forEach((l, idx) => {
          ctx.fillText(l, 22, y + 30 + idx * 26);
        });
        ctx.shadowBlur = 0;
      }
      window.setTimeout(drawLoop, 200);
    };
    drawLoop();

    const stream = canvas.captureStream(15);
    const stop = () => {
      active = false;
      stream.getTracks().forEach((t) => t.stop());
    };
    overlayStopRef.current = stop;
    onAddOverlay(stream, stop);
    setOverlayActive(true);
    toast('Chat overlay added to the scene — drag and resize it like any source.', 'success');
  };

  const STATUS_DOT: Record<ConnectionState['status'], string> = {
    off: 'bg-zinc-600',
    connecting: 'bg-amber-400 animate-pulse',
    live: 'bg-lime-500',
    error: 'bg-red-500',
  };

  return (
    <div className="absolute top-0 right-0 bottom-0 w-80 bg-black/95 backdrop-blur border-l border-zinc-800 z-30 flex flex-col">
      <div className="h-11 px-4 flex items-center justify-between border-b border-zinc-800 shrink-0">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <Icons.Signal size={13} className="text-lime-500" /> Unified Chat
        </h3>
        <button onClick={onClose} className="text-zinc-500 hover:text-white">
          <Icons.X size={15} />
        </button>
      </div>

      {/* Connections */}
      <div className="p-3 space-y-2 border-b border-zinc-800 shrink-0">
        {(['twitch', 'kick', 'youtube'] as ChatPlatform[]).map((platform) => {
          const conn = connections[platform];
          const isOn = conn.status !== 'off';
          return (
            <div key={platform} className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[conn.status]}`}
                title={conn.detail || conn.status}
              />
              <span
                className="text-[10px] font-bold w-14 shrink-0"
                style={{ color: PLATFORM_COLORS[platform] }}
              >
                {PLATFORM_LABELS[platform]}
              </span>
              <input
                value={isOn ? conn.channel : inputs[platform]}
                disabled={isOn}
                onChange={(e) => setInputs((prev) => ({ ...prev, [platform]: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && toggleConnection(platform)}
                placeholder={PLACEHOLDERS[platform]}
                className="flex-1 min-w-0 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-lime-500 disabled:opacity-60"
              />
              <button
                onClick={() => toggleConnection(platform)}
                className={`text-[10px] font-bold px-2 py-1 rounded shrink-0 ${
                  isOn
                    ? 'bg-zinc-800 text-red-400 hover:bg-zinc-700'
                    : 'bg-lime-900 text-lime-300 hover:bg-lime-800'
                }`}
              >
                {isOn ? 'Stop' : 'Join'}
              </button>
            </div>
          );
        })}
        <p className="text-[9px] text-zinc-600 leading-relaxed">
          Twitch works instantly. Kick + YouTube need the relay (<code>npm run relay</code>).
          YouTube chat is experimental.
        </p>
        <button
          onClick={toggleOverlay}
          className="w-full py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-lime-500/50 rounded text-[10px] font-bold text-lime-400 flex items-center justify-center gap-1.5"
        >
          <Icons.Plus size={11} /> Add Chat Overlay to Scene
        </button>
      </div>

      {/* Merged feed */}
      <div ref={feedRef} className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
        {messages.length === 0 && (
          <p className="text-[11px] text-zinc-600 text-center pt-8">
            Join a channel above — messages from every platform merge here.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="text-[12px] leading-snug break-words">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle"
              style={{ background: PLATFORM_COLORS[m.platform] }}
              title={PLATFORM_LABELS[m.platform]}
            />
            <span className="font-bold" style={{ color: m.color || PLATFORM_COLORS[m.platform] }}>
              {m.author}
            </span>
            <span className="text-zinc-500">: </span>
            <span className="text-zinc-200">{m.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
