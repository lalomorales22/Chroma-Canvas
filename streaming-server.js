/**
 * ChromaCanvas multistream relay: receives WebM from the browser over WebSocket
 * and pipes it through FFmpeg to one or more RTMP endpoints simultaneously
 * (Twitch / YouTube / Kick / X / custom) using the tee muxer — a single encode
 * fanned out to every destination, where one platform failing doesn't drop the
 * others (onfail=ignore).
 *
 * Usage:  npm run relay   (requires FFmpeg on your PATH)
 */
import { WebSocketServer } from 'ws';
import { spawn, spawnSync } from 'node:child_process';

const PORT = 4000;

// Fail fast with a clear message if FFmpeg isn't installed.
const ffmpegCheck = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
if (ffmpegCheck.error) {
  console.error('❌ FFmpeg was not found on your PATH.');
  console.error('   Install it first:  macOS: brew install ffmpeg   |   Windows: winget install ffmpeg');
  process.exit(1);
}

const wss = new WebSocketServer({ port: PORT });

console.log(`🎥 Multistream Relay Server running on ws://localhost:${PORT}`);
console.log('👉 Start a stream from the ChromaCanvas Recorder Studio.');

const buildRtmpUrl = ({ url, key }) => (url.endsWith('/') ? `${url}${key}` : `${url}/${key}`);

/** Accepts { destinations: [{url, key, name}] } or the legacy { url, key }. */
const parseDestinations = (config) => {
  if (Array.isArray(config.destinations)) {
    return config.destinations
      .filter((d) => d && d.url && d.key)
      .map((d) => ({ rtmp: buildRtmpUrl(d), name: d.name || 'Custom' }));
  }
  if (config.url && config.key) {
    return [{ rtmp: buildRtmpUrl(config), name: 'Stream' }];
  }
  return [];
};

wss.on('connection', (ws) => {
  console.log('Client connected');

  let ffmpeg = null;

  const send = (payload) => {
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      /* socket may be closed */
    }
  };

  ws.on('message', (message, isBinary) => {
    if (!isBinary) {
      try {
        const config = JSON.parse(message.toString());
        const destinations = parseDestinations(config);
        if (!destinations.length) {
          send({ type: 'status', state: 'error', message: 'No valid destinations provided.' });
          return;
        }

        console.log(`Starting stream to ${destinations.length} destination(s):`);
        destinations.forEach((d) => console.log(`  • ${d.name}`));

        // One encode, fanned out. With a single destination plain FLV output is
        // used; with several, the tee muxer + onfail=ignore keeps the stream up
        // even if one platform rejects its key.
        const encodeArgs = [
          '-i', '-',                // WebM from stdin
          '-c:v', 'libx264',        // H.264 (required by all major platforms)
          '-preset', 'ultrafast',
          '-tune', 'zerolatency',
          '-maxrate', '4000k',
          '-bufsize', '8000k',
          '-g', '60',               // keyframe every 2s @ 30fps
          '-c:a', 'aac',
          '-b:a', '128k',
          '-ar', '44100',
        ];

        const outputArgs =
          destinations.length === 1
            ? ['-f', 'flv', destinations[0].rtmp]
            : [
                '-map', '0:v?',
                '-map', '0:a?',
                '-f', 'tee',
                destinations.map((d) => `[f=flv:onfail=ignore]${d.rtmp}`).join('|'),
              ];

        ffmpeg = spawn('ffmpeg', [...encodeArgs, ...outputArgs]);

        ffmpeg.stderr.on('data', (data) => {
          const text = data.toString();
          // Surface hard connection failures without spamming encode stats.
          if (/Connection refused|Failed to connect|I\/O error|403|404/i.test(text)) {
            console.error(`FFmpeg: ${text.trim().split('\n').pop()}`);
          }
        });

        ffmpeg.on('close', (code) => {
          console.log(`FFmpeg exited with code ${code}`);
          send({ type: 'status', state: 'stopped', code });
        });

        ffmpeg.stdin.on('error', (e) => {
          console.log('FFmpeg stdin error (stream likely stopped):', e.message);
        });

        send({
          type: 'status',
          state: 'live',
          destinations: destinations.map((d) => d.name),
        });
      } catch (e) {
        console.error('Error parsing config:', e);
        send({ type: 'status', state: 'error', message: String(e) });
      }
    } else if (ffmpeg && ffmpeg.stdin.writable) {
      ffmpeg.stdin.write(message);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    if (ffmpeg) {
      ffmpeg.stdin.end();
      ffmpeg.kill();
    }
  });
});
