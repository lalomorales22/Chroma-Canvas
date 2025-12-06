
const { WebSocketServer } = require('ws');
const { spawn } = require('child_process');

// Configuration
const PORT = 4000;

const wss = new WebSocketServer({ port: PORT });

console.log(`🎥 Streaming Relay Server running on ws://localhost:${PORT}`);
console.log('👉 Ensure FFmpeg is installed and accessible in your system PATH.');

wss.on('connection', (ws) => {
    console.log('Client connected');
    
    let ffmpeg = null;

    ws.on('message', (message, isBinary) => {
        if (!isBinary) {
            try {
                // Expecting JSON config: { url, key }
                const config = JSON.parse(message.toString());
                const rtmpUrl = config.url.endsWith('/') 
                    ? `${config.url}${config.key}` 
                    : `${config.url}/${config.key}`;

                console.log(`Starting Stream to: ${config.url}...`);

                // Spawn FFmpeg Transcoder
                // Input: WebM (VP9/Opus) from Browser via Stdin
                // Output: FLV (H.264/AAC) to RTMP
                const args = [
                    '-i', '-',                     // Input from stdin
                    '-c:v', 'libx264',             // Video Codec: H.264 (Required by Twitch)
                    '-preset', 'ultrafast',        // Preset: Fast encoding for low latency
                    '-tune', 'zerolatency',        // Tune for latency
                    '-maxrate', '4000k',           // Bitrate limit
                    '-bufsize', '8000k',           // Buffer
                    '-g', '60',                    // Keyframe interval (2s at 30fps)
                    '-c:a', 'aac',                 // Audio Codec: AAC (Required by Twitch)
                    '-b:a', '128k',                // Audio Bitrate
                    '-ar', '44100',                // Sample Rate
                    '-f', 'flv',                   // Output Format: FLV for RTMP
                    rtmpUrl                        // Destination
                ];

                ffmpeg = spawn('ffmpeg', args);

                ffmpeg.stderr.on('data', (data) => {
                    // console.log(`FFmpeg: ${data}`); // Uncomment for debug logs
                });

                ffmpeg.on('close', (code) => {
                    console.log(`FFmpeg exited with code ${code}`);
                });

                ffmpeg.stdin.on('error', (e) => {
                    console.log('FFmpeg stdin error (stream likely stopped)', e.message);
                });

            } catch (e) {
                console.error('Error parsing config:', e);
            }
        } else {
            // Binary Video Data
            if (ffmpeg && ffmpeg.stdin.writable) {
                ffmpeg.stdin.write(message);
            }
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
