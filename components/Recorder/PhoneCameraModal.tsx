import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Icons } from '../Icon';
import { uid } from '../../utils/id';

/**
 * Desktop side of "Phone as Camera": shows a QR code, answers the phone's
 * WebRTC offer (signaling relayed through the Vite dev server, same origin),
 * and hands the incoming stream to the Recorder Studio as a camera source.
 */

interface Props {
  onClose: () => void;
  onAddStream: (stream: MediaStream, cleanup: () => void) => void;
}

const wsUrl = (session: string) =>
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/phone-signal?session=${session}&role=desktop`;

export const PhoneCameraModal: React.FC<Props> = ({ onClose, onAddStream }) => {
  const [qr, setQr] = useState<string>('');
  const [phoneUrl, setPhoneUrl] = useState<string>('');
  const [status, setStatus] = useState<'waiting' | 'connecting' | 'connected' | 'error'>('waiting');
  const [error, setError] = useState('');
  const sessionRef = useRef(uid().slice(0, 8));
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const addedRef = useRef(false);

  const isSecure = location.protocol === 'https:';

  useEffect(() => {
    const session = sessionRef.current;
    let ws: WebSocket | null = null;
    let closed = false;

    (async () => {
      // Ask the dev server for the LAN IP so the QR works across devices.
      let host = location.hostname;
      try {
        const res = await fetch('/phone-lan-ip');
        const json = await res.json();
        if (json.ip) host = json.ip;
      } catch {
        /* fall back to current hostname */
      }
      const url = `${location.protocol}//${host}${location.port ? `:${location.port}` : ''}/#phone=${session}`;
      setPhoneUrl(url);
      setQr(await QRCode.toDataURL(url, { width: 240, margin: 1, color: { dark: '#0f0f11', light: '#ffffff' } }));

      ws = new WebSocket(wsUrl(session));
      ws.onerror = () => {
        if (!closed) {
          setStatus('error');
          setError('Signaling unavailable — restart the dev server to load the phone-camera plugin.');
        }
      };
      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(String(event.data));
          if (msg.type === 'offer') {
            setStatus('connecting');
            const pc = new RTCPeerConnection({
              iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
            });
            pcRef.current = pc;
            pc.onicecandidate = (e) => {
              if (e.candidate) ws?.send(JSON.stringify({ type: 'ice', candidate: e.candidate }));
            };
            pc.ontrack = (e) => {
              const stream = e.streams[0];
              if (stream && !addedRef.current && stream.getVideoTracks().length) {
                addedRef.current = true;
                setStatus('connected');
                onAddStream(stream, () => pc.close());
                window.setTimeout(onClose, 900);
              }
            };
            pc.onconnectionstatechange = () => {
              if (pc.connectionState === 'failed') {
                setStatus('error');
                setError('WebRTC connection failed — make sure both devices are on the same Wi-Fi.');
              }
            };
            await pc.setRemoteDescription(msg.sdp);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            ws?.send(JSON.stringify({ type: 'answer', sdp: pc.localDescription }));
          } else if (msg.type === 'ice' && pcRef.current) {
            await pcRef.current.addIceCandidate(msg.candidate).catch(() => {});
          }
        } catch {
          /* ignore malformed frames */
        }
      };
    })();

    return () => {
      closed = true;
      ws?.close();
      // Don't close the pc here — once the source is added it must stay alive.
      if (!addedRef.current) pcRef.current?.close();
    };
  }, [onClose, onAddStream]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
      <div className="bg-black border border-zinc-800 rounded-xl p-6 w-full max-w-md shadow-2xl text-center space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Icons.Portrait size={18} className="text-lime-500" /> Phone as Camera
          </h2>
          <button onClick={onClose}>
            <Icons.X size={18} className="text-gray-400 hover:text-white" />
          </button>
        </div>

        {!isSecure ? (
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 text-left space-y-3">
            <p className="text-sm text-amber-300 font-bold">
              🔒 One-time setup needed — phones only allow camera access over HTTPS.
            </p>
            <div className="space-y-2 text-xs text-zinc-300 leading-relaxed">
              <p>
                <span className="font-bold text-lime-400">1.</span> Stop the dev server
                (Ctrl+C) and start the secure one:
              </p>
              <code className="block bg-black border border-zinc-800 rounded px-3 py-2 text-lime-300">
                npm run dev:phone
              </code>
              <p>
                <span className="font-bold text-lime-400">2.</span> Open the{' '}
                <code className="text-zinc-100">https://</code> <strong>Network</strong> URL it
                prints (not localhost) and accept the certificate warning.
              </p>
              <p>
                <span className="font-bold text-lime-400">3.</span> Come back here — the QR
                will appear and your phone can connect.
              </p>
            </div>
          </div>
        ) : qr ? (
          <div className="flex flex-col items-center gap-3">
            <div className="bg-white p-3 rounded-xl">
              <img src={qr} alt="Scan with your phone" width={200} height={200} />
            </div>
            <p className="text-[11px] text-zinc-500 break-all font-mono px-4">{phoneUrl}</p>
          </div>
        ) : (
          <div className="py-16 flex justify-center">
            <Icons.Spinner size={24} className="animate-spin text-zinc-500" />
          </div>
        )}

        <div className="text-xs font-bold flex items-center justify-center gap-2">
          {status === 'waiting' && isSecure && (
            <span className="text-zinc-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              Scan with your phone (same Wi-Fi)…
            </span>
          )}
          {status === 'connecting' && (
            <span className="text-lime-400 flex items-center gap-2">
              <Icons.Spinner size={12} className="animate-spin" /> Phone found — connecting…
            </span>
          )}
          {status === 'connected' && (
            <span className="text-lime-400 flex items-center gap-2">
              <Icons.Check size={14} /> Connected! Adding to scene…
            </span>
          )}
          {status === 'error' && <span className="text-red-400">{error}</span>}
        </div>
      </div>
    </div>
  );
};
