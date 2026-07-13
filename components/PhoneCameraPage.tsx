import React, { useEffect, useRef, useState } from 'react';

/**
 * The page a phone lands on after scanning the QR code: grabs the camera and
 * streams it to the desktop over WebRTC (signaling via the dev server).
 * Deliberately dependency-light — it runs on whatever browser the phone has.
 */

interface Props {
  session: string;
}

type Status = 'starting' | 'camera-denied' | 'connecting' | 'live' | 'error';

export const PhoneCameraPage: React.FC<Props> = ({ session }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>('starting');
  const [detail, setDetail] = useState('');
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let cancelled = false;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;

        setStatus('connecting');
        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        ws = new WebSocket(`${proto}://${location.host}/phone-signal?session=${session}&role=phone`);

        const pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        });
        pcRef.current = pc;
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        pc.onicecandidate = (e) => {
          if (e.candidate) ws?.send(JSON.stringify({ type: 'ice', candidate: e.candidate }));
        };
        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'connected') setStatus('live');
          if (pc.connectionState === 'failed') {
            setStatus('error');
            setDetail('Connection failed — are both devices on the same Wi-Fi?');
          }
        };

        ws.onopen = async () => {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          ws?.send(JSON.stringify({ type: 'offer', sdp: pc.localDescription }));
        };
        ws.onmessage = async (event) => {
          try {
            const msg = JSON.parse(String(event.data));
            if (msg.type === 'answer') await pc.setRemoteDescription(msg.sdp);
            else if (msg.type === 'ice') await pc.addIceCandidate(msg.candidate).catch(() => {});
          } catch {
            /* ignore */
          }
        };
        ws.onerror = () => {
          setStatus('error');
          setDetail('Could not reach the desktop — keep the ChromaCanvas dev server running.');
        };
      } catch (e) {
        setStatus('camera-denied');
        setDetail(
          e instanceof Error && /NotAllowed/i.test(e.name)
            ? 'Camera permission was denied — allow it and reload.'
            : `Camera unavailable: ${e instanceof Error ? e.message : e}`,
        );
      }
    };

    void start();
    return () => {
      cancelled = true;
      ws?.close();
      pcRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [session, facing]);

  const STATUS_TEXT: Record<Status, string> = {
    starting: 'Starting camera…',
    'camera-denied': detail,
    connecting: 'Connecting to your desktop…',
    live: '🔴 LIVE — streaming to ChromaCanvas',
    error: detail,
  };

  return (
    <div className="h-screen w-screen bg-black flex flex-col text-white overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="flex-1 w-full object-cover bg-zinc-950"
      />
      <div className="shrink-0 p-4 pb-8 space-y-3 bg-black">
        <p
          className={`text-center text-sm font-bold ${
            status === 'live' ? 'text-lime-400' : status === 'error' || status === 'camera-denied' ? 'text-red-400' : 'text-zinc-300'
          }`}
        >
          {STATUS_TEXT[status]}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
            className="px-5 py-3 bg-zinc-900 border border-zinc-700 rounded-full text-sm font-bold"
          >
            🔄 Flip Camera
          </button>
          {(status === 'error' || status === 'camera-denied') && (
            <button
              onClick={() => location.reload()}
              className="px-5 py-3 bg-lime-700 rounded-full text-sm font-bold"
            >
              Retry
            </button>
          )}
        </div>
        <p className="text-center text-[10px] text-zinc-600">
          Keep this page open and the screen awake while streaming.
        </p>
      </div>
    </div>
  );
};
