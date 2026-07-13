/**
 * ChromaCanvas relay server:
 *  1. Multistream: receives WebM over WebSocket, fans one FFmpeg encode out to
 *     every RTMP destination (Twitch/YouTube/Kick/X/custom) via the tee muxer.
 *  2. Kick chat helper: HTTP lookup of a channel's chatroom id (Kick blocks CORS).
 *  3. YouTube live chat: polls YouTube's internal live-chat endpoint and pushes
 *     messages to the browser (experimental — no official free API exists).
 *
 * Usage:  npm run relay   (requires FFmpeg on your PATH for streaming)
 */
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { spawn, spawnSync } from 'node:child_process';

const PORT = 4000;
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

const ffmpegAvailable = !spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).error;
if (!ffmpegAvailable) {
  console.warn('⚠️  FFmpeg not found on PATH — chat features will work, but streaming will not.');
  console.warn('   Install it:  macOS: brew install ffmpeg   |   Windows: winget install ffmpeg');
}

// ---------------------------------------------------------------------------
// HTTP: Kick chatroom lookup (browser can't call kick.com directly — CORS)
// ---------------------------------------------------------------------------

const httpServer = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const match = req.url?.match(/^\/kick\/chatroom\/([\w-]+)$/);
  if (req.method === 'GET' && match) {
    try {
      const slug = match[1];
      const kickRes = await fetch(`https://kick.com/api/v2/channels/${slug}`, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
      });
      if (!kickRes.ok) throw new Error(`Kick API returned ${kickRes.status}`);
      const json = await kickRes.json();
      const chatroomId = json?.chatroom?.id;
      if (!chatroomId) throw new Error('No chatroom found for that channel.');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ chatroomId }));
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(e.message || e) }));
    }
    return;
  }
  res.writeHead(404);
  res.end();
});

// ---------------------------------------------------------------------------
// YouTube live chat poller (innertube, experimental)
// ---------------------------------------------------------------------------

const startYouTubeChat = async (videoId, send, isAlive) => {
  const pageRes = await fetch(`https://www.youtube.com/live_chat?is_popout=1&v=${videoId}`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
  });
  const page = await pageRes.text();

  const apiKey = page.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1];
  let continuation = page.match(/"continuation":"([^"]+)"/)?.[1];
  if (!apiKey || !continuation) {
    throw new Error('Could not find a live chat for that video — is the stream live with chat enabled?');
  }

  send({ type: 'youtube-chat-status', state: 'live' });

  while (isAlive() && continuation) {
    let timeoutMs = 4000;
    try {
      const res = await fetch(
        `https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
          body: JSON.stringify({
            context: { client: { clientName: 'WEB', clientVersion: '2.20240401.00.00' } },
            continuation,
          }),
        },
      );
      const json = await res.json();
      const chat = json?.continuationContents?.liveChatContinuation;
      if (!chat) throw new Error('Chat ended.');

      const cont = chat.continuations?.[0];
      const contData =
        cont?.invalidationContinuationData ||
        cont?.timedContinuationData ||
        cont?.reloadContinuationData;
      continuation = contData?.continuation ?? null;
      timeoutMs = Math.max(2000, contData?.timeoutMs ?? 4000);

      const messages = [];
      for (const action of chat.actions ?? []) {
        const renderer = action?.addChatItemAction?.item?.liveChatTextMessageRenderer;
        if (!renderer) continue;
        const text = (renderer.message?.runs ?? [])
          .map((run) => run.text ?? run.emoji?.shortcuts?.[0] ?? '')
          .join('');
        if (text) {
          messages.push({ author: renderer.authorName?.simpleText ?? 'viewer', text });
        }
      }
      if (messages.length) send({ type: 'youtube-chat-messages', messages });
    } catch (e) {
      send({ type: 'youtube-chat-status', state: 'error', message: String(e.message || e) });
      return;
    }
    await new Promise((r) => setTimeout(r, timeoutMs));
  }
};

// ---------------------------------------------------------------------------
// WebSocket: multistream ingest + chat sessions
// ---------------------------------------------------------------------------

const buildRtmpUrl = ({ url, key }) => (url.endsWith('/') ? `${url}${key}` : `${url}/${key}`);

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

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws) => {
  console.log('Client connected');

  let ffmpeg = null;
  let alive = true;

  const send = (payload) => {
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      /* socket may be closed */
    }
  };

  ws.on('message', (message, isBinary) => {
    if (isBinary) {
      if (ffmpeg && ffmpeg.stdin.writable) ffmpeg.stdin.write(message);
      return;
    }

    let config;
    try {
      config = JSON.parse(message.toString());
    } catch (e) {
      console.error('Bad config message:', e);
      return;
    }

    // --- YouTube chat session
    if (config.type === 'youtube-chat') {
      console.log(`Starting YouTube chat poller for video ${config.videoId}`);
      startYouTubeChat(config.videoId, send, () => alive).catch((e) => {
        send({ type: 'youtube-chat-status', state: 'error', message: String(e.message || e) });
      });
      return;
    }

    // --- Multistream config
    const destinations = parseDestinations(config);
    if (!destinations.length) {
      send({ type: 'status', state: 'error', message: 'No valid destinations provided.' });
      return;
    }
    if (!ffmpegAvailable) {
      send({ type: 'status', state: 'error', message: 'FFmpeg is not installed on the relay machine.' });
      return;
    }

    console.log(`Starting stream to ${destinations.length} destination(s):`);
    destinations.forEach((d) => console.log(`  • ${d.name}`));

    const encodeArgs = [
      '-i', '-',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-maxrate', '4000k',
      '-bufsize', '8000k',
      '-g', '60',
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

    let confirmed = false;
    let lastErrorLine = '';
    ffmpeg.stderr.on('data', (data) => {
      const text = data.toString();
      // First "frame=" progress line = encoding is genuinely flowing.
      if (!confirmed && /frame=\s*\d+/.test(text)) {
        confirmed = true;
        console.log('✅ FFmpeg confirmed: frames are flowing to the destination(s).');
        send({ type: 'status', state: 'confirmed' });
      }
      if (/Connection refused|Failed to connect|I\/O error|403|404|Error|Invalid/i.test(text)) {
        const line = text.trim().split('\n').pop();
        lastErrorLine = line;
        console.error(`FFmpeg: ${line}`);
      }
    });
    ffmpeg.on('close', (code) => {
      console.log(`FFmpeg exited with code ${code}`);
      send({ type: 'status', state: 'stopped', code, message: lastErrorLine || undefined });
    });
    ffmpeg.stdin.on('error', (e) => {
      console.log('FFmpeg stdin error (stream likely stopped):', e.message);
    });

    send({ type: 'status', state: 'live', destinations: destinations.map((d) => d.name) });
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    alive = false;
    if (ffmpeg) {
      ffmpeg.stdin.end();
      ffmpeg.kill();
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`🎥 ChromaCanvas Relay running on ws://localhost:${PORT}`);
  console.log('   • Multistream ingest (FFmpeg tee fan-out)');
  console.log('   • Kick chatroom lookup:  GET /kick/chatroom/:slug');
  console.log('   • YouTube live chat poller (experimental)');
});
