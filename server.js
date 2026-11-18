const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const cors = require('cors');
const QRCode = require('qrcode');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 1e8 // 100MB for frame or chunk buffers if needed
});

const PORT = process.env.PORT || 3000;
const VIDEOS_DIR = path.join(__dirname, 'videos');

// Ensure videos directory exists
if (!fs.existsSync(VIDEOS_DIR)) {
  fs.mkdirSync(VIDEOS_DIR, { recursive: true });
}

// Also check root folder for videos and move or link if any
const rootFiles = fs.readdirSync(__dirname);
rootFiles.forEach(file => {
  if (file.endsWith('.mp4') || file.endsWith('.webm') || file.endsWith('.mkv')) {
    const dest = path.join(VIDEOS_DIR, file);
    if (!fs.existsSync(dest)) {
      try {
        fs.copyFileSync(path.join(__dirname, file), dest);
        console.log(`Synced existing root video to videos folder: ${file}`);
      } catch (err) {
        console.error(`Error copying video: ${file}`, err);
      }
    }
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configure Multer for video uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, VIDEOS_DIR);
  },
  filename: function (req, file, cb) {
    // Sanitize filename and retain extension
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${cleanName}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 2000 * 1024 * 1024 }, // 2GB max limit
  fileFilter: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.mp4', '.webm', '.mkv', '.mov', '.ogg'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only video files (.mp4, .webm, .mkv, .mov) are allowed!'));
    }
  }
});

// Helper: Format bytes to human readable string
function formatBytes(bytes, decimals = 1) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Helper: Get local network IP addresses
function getNetworkIps() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      // IPv4 and non-internal (i.e. not 127.0.0.1)
      // Supports both Node 18+ (string 'IPv4') and older Node 12-16 (number 4 or string)
      if ((net.family === 'IPv4' || net.family === 4) && !net.internal) {
        ips.push({ name, address: net.address });
      }
    }
  }
  return ips;
}

// Helper: Get video list
function getVideoList() {
  if (!fs.existsSync(VIDEOS_DIR)) return [];
  const files = fs.readdirSync(VIDEOS_DIR);
  const videoFiles = files.filter(f => {
    const ext = path.extname(f).toLowerCase();
    return ['.mp4', '.webm', '.mkv', '.mov', '.ogg'].includes(ext);
  });

  return videoFiles.map(filename => {
    const filePath = path.join(VIDEOS_DIR, filename);
    let size = 0;
    let mtime = new Date();
    try {
      const stat = fs.statSync(filePath);
      size = stat.size;
      mtime = stat.mtime;
    } catch (e) {}

    // Generate a readable title by stripping timestamps and weird characters
    let readableTitle = filename
      .replace(/^\d+_/, '')
      .replace(/\.[^/.]+$/, '')
      .replace(/[_.-]+/g, ' ')
      .trim();

    return {
      filename,
      title: readableTitle || filename,
      sizeBytes: size,
      sizeFormatted: formatBytes(size),
      updatedAt: mtime,
      streamUrl: `/api/stream/${encodeURIComponent(filename)}`
    };
  });
}

// Global state
let state = {
  currentVideo: null,
  playback: {
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    playbackRate: 1.0,
    volume: 1.0
  },
  activeInterruption: null
};

// Auto-select first video if available
const initialVideos = getVideoList();
if (initialVideos.length > 0) {
  state.currentVideo = initialVideos[0].filename;
}

// API: Network info and QR code
app.get('/api/network-info', async (req, res) => {
  const ips = getNetworkIps();
  const rawHostname = os.hostname().replace(/\.local$/i, '');
  const bonjourHost = `${rawHostname}.local`;
  
  // If running on macOS or Linux, add mDNS/Bonjour hostname option
  if (process.platform === 'darwin' || process.platform === 'linux') {
    ips.push({ name: 'Bonjour (Apple / mDNS)', address: bonjourHost });
  }

  const primaryIp = ips.length > 0 ? ips[0].address : 'localhost';
  const parentUrl = `http://${primaryIp}:${PORT}/parent`;
  const kidUrl = `http://${primaryIp}:${PORT}/kid`;
  
  let parentQr = null;
  try {
    parentQr = await QRCode.toDataURL(parentUrl, {
      width: 260,
      margin: 2,
      color: {
        dark: '#1e1b4b',
        light: '#ffffff'
      }
    });
  } catch (e) {
    console.error('QR code generation error:', e);
  }

  res.json({
    port: PORT,
    ips: ips,
    primaryIp: primaryIp,
    hostname: rawHostname,
    bonjourHost: bonjourHost,
    parentUrl: parentUrl,
    kidUrl: kidUrl,
    parentQr: parentQr,
    localUrl: `http://localhost:${PORT}`,
    parentPath: '/parent',
    kidPath: '/kid'
  });
});

// API: Dynamic QR Code for any selected IP
app.get('/api/qr/parent', async (req, res) => {
  const ip = req.query.ip || (getNetworkIps()[0] ? getNetworkIps()[0].address : 'localhost');
  const parentUrl = `http://${ip}:${PORT}/parent`;
  try {
    const parentQr = await QRCode.toDataURL(parentUrl, {
      width: 260,
      margin: 2,
      color: {
        dark: '#1e1b4b',
        light: '#ffffff'
      }
    });
    res.json({ url: parentUrl, parentQr });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// API: Get list of videos
app.get('/api/videos', (req, res) => {
  res.json({
    videos: getVideoList(),
    currentVideo: state.currentVideo
  });
});

// API: Video streaming with HTTP 206 Partial Content (crucial for video scrub/seek)
app.get('/api/stream/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(VIDEOS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Video file not found' });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  const ext = path.extname(filename).toLowerCase();
  let contentType = 'video/mp4';
  if (ext === '.webm') contentType = 'video/webm';
  else if (ext === '.mkv') contentType = 'video/x-matroska';
  else if (ext === '.mov') contentType = 'video/quicktime';
  else if (ext === '.ogg') contentType = 'video/ogg';

  if (range) {
    // Parse range
    // Example: "bytes=32324-" or "bytes=32324-45345"
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize) {
      res.status(416).send(`Requested range not satisfiable\n${start} >= ${fileSize}`);
      return;
    }

    const chunksize = (end - start) + 1;
    const fileStream = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': contentType,
    };

    res.writeHead(206, head);
    fileStream.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes'
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

// API: Upload new video
app.post('/api/upload', upload.single('video'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file provided' });
  }

  const updatedVideos = getVideoList();
  // Notify parents of updated video list
  io.emit('videos:updated', {
    videos: updatedVideos,
    newVideo: req.file.filename
  });

  res.json({
    success: true,
    message: 'Video uploaded successfully',
    filename: req.file.filename,
    videos: updatedVideos
  });
});

// API: Delete video
app.delete('/api/videos/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(VIDEOS_DIR, filename);

  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      const updatedVideos = getVideoList();
      if (state.currentVideo === filename) {
        state.currentVideo = updatedVideos.length > 0 ? updatedVideos[0].filename : null;
      }
      io.emit('videos:updated', {
        videos: updatedVideos,
        currentVideo: state.currentVideo
      });
      return res.json({ success: true, videos: updatedVideos });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to delete video' });
    }
  } else {
    return res.status(404).json({ error: 'Video not found' });
  }
});

// Page Routes
app.get('/kid', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'kid.html'));
});

app.get('/parent', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'parent.html'));
});

// Socket.IO Real-time Synchronization
let kidSockets = new Set();
let parentSockets = new Set();

io.on('connection', (socket) => {
  let role = null;

  // Identify role
  socket.on('register', (data) => {
    role = data.role;
    if (role === 'kid') {
      kidSockets.add(socket.id);
      socket.join('kids');
      console.log(`[Socket] Kid connected: ${socket.id} (Total: ${kidSockets.size})`);
      
      // Send initial state to the kid
      socket.emit('state:init', {
        currentVideo: state.currentVideo,
        playback: state.playback,
        activeInterruption: state.activeInterruption
      });

      // Broadcast kid status to parents
      io.to('parents').emit('kid:connected', { id: socket.id, count: kidSockets.size });
    } else if (role === 'parent') {
      parentSockets.add(socket.id);
      socket.join('parents');
      console.log(`[Socket] Parent connected: ${socket.id} (Total: ${parentSockets.size})`);

      // Send initial state to parent
      socket.emit('state:init', {
        currentVideo: state.currentVideo,
        playback: state.playback,
        activeInterruption: state.activeInterruption,
        kidOnline: kidSockets.size > 0,
        kidCount: kidSockets.size
      });
    }
  });

  // =================== Playback Control Events ===================

  socket.on('parent:play', () => {
    state.playback.isPlaying = true;
    io.to('kids').emit('control:play');
    io.to('parents').emit('playback:sync', state.playback);
  });

  socket.on('parent:pause', () => {
    state.playback.isPlaying = false;
    io.to('kids').emit('control:pause');
    io.to('parents').emit('playback:sync', state.playback);
  });

  socket.on('parent:stop', () => {
    state.playback.isPlaying = false;
    state.playback.currentTime = 0;
    io.to('kids').emit('control:stop');
    io.to('parents').emit('playback:sync', state.playback);
  });

  socket.on('parent:seek', (data) => {
    state.playback.currentTime = data.time;
    io.to('kids').emit('control:seek', { time: data.time });
    io.to('parents').emit('playback:sync', state.playback);
  });

  socket.on('parent:set_rate', (data) => {
    state.playback.playbackRate = data.rate;
    io.to('kids').emit('control:set_rate', { rate: data.rate });
    io.to('parents').emit('playback:sync', state.playback);
  });

  socket.on('parent:set_volume', (data) => {
    state.playback.volume = data.volume;
    io.to('kids').emit('control:set_volume', { volume: data.volume });
    io.to('parents').emit('playback:sync', state.playback);
  });

  socket.on('parent:select_video', (data) => {
    state.currentVideo = data.filename;
    state.playback.currentTime = 0;
    state.playback.isPlaying = true; // Auto-play when parent selects a video
    state.activeInterruption = null; // Clear any old interruption
    io.to('kids').emit('control:load_video', {
      filename: data.filename,
      streamUrl: `/api/stream/${encodeURIComponent(data.filename)}`,
      autoPlay: true
    });
    io.to('parents').emit('video:selected', {
      currentVideo: data.filename,
      playback: state.playback
    });
  });

  // Kid reports status back
  socket.on('kid:report_status', (data) => {
    state.playback.currentTime = data.currentTime || 0;
    state.playback.duration = data.duration || 0;
    state.playback.isPlaying = !!data.isPlaying;
    state.playback.playbackRate = data.playbackRate || 1.0;

    // Relay to parents
    io.to('parents').emit('kid:playback_status', state.playback);
  });

  // =================== Math Interruption Events ===================

  socket.on('parent:trigger_math', (problemData) => {
    state.activeInterruption = problemData;
    state.playback.isPlaying = false; // Video pauses during interruption
    io.to('kids').emit('interruption:start', problemData);
    io.to('parents').emit('interruption:active', problemData);
  });

  socket.on('parent:dismiss_math', () => {
    state.activeInterruption = null;
    io.to('kids').emit('interruption:dismiss');
    io.to('parents').emit('interruption:cleared');
  });

  // Kid submits answer
  socket.on('kid:submit_math', (data) => {
    // Relay to parent dashboard
    io.to('parents').emit('kid:math_result', {
      problemId: data.problemId,
      answerChosen: data.answerChosen,
      isCorrect: data.isCorrect,
      correctAnswer: data.correctAnswer
    });

    if (data.isCorrect) {
      // Auto-clear active interruption after correct
      state.activeInterruption = null;
    }
  });

  // =================== Text-to-Speech (TTS) Prompts ===================

  socket.on('parent:send_tts', (ttsData) => {
    console.log(`[TTS] Prompt sent to kid: "${ttsData.text}"`);
    io.to('kids').emit('tts:prompt', {
      text: ttsData.text,
      preset: ttsData.preset || 'custom',
      avatar: ttsData.avatar || '🤖',
      pitch: ttsData.pitch || 1.1,
      rate: ttsData.rate || 0.95
    });
    // Acknowledge back to parent
    socket.emit('tts:sent', { text: ttsData.text, timestamp: Date.now() });
  });

  // =================== Camera Feed / WebRTC Streaming ===================

  // Dual streaming approach:
  // 1. Direct canvas/JPEG frame transmission (100% dependable on any network/device)
  socket.on('kid:camera_frame', (frameData) => {
    // Broadcast frame to all parents
    io.to('parents').emit('kid:live_frame', frameData);
  });

  // 2. WebRTC P2P signaling (for high-fps direct video when possible)
  socket.on('webrtc:signal', (data) => {
    // Forward signaling payload between kid and parent
    if (role === 'kid') {
      io.to('parents').emit('webrtc:signal', { from: socket.id, data: data.data });
    } else if (role === 'parent') {
      io.to('kids').emit('webrtc:signal', { from: socket.id, data: data.data });
    }
  });

  // =================== Disconnect ===================

  socket.on('disconnect', () => {
    if (role === 'kid') {
      kidSockets.delete(socket.id);
      console.log(`[Socket] Kid disconnected: ${socket.id} (Remaining: ${kidSockets.size})`);
      io.to('parents').emit('kid:disconnected', {
        id: socket.id,
        count: kidSockets.size,
        kidOnline: kidSockets.size > 0
      });
    } else if (role === 'parent') {
      parentSockets.delete(socket.id);
      console.log(`[Socket] Parent disconnected: ${socket.id} (Remaining: ${parentSockets.size})`);
    }
  });
});

// Start Server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`🚀 KidStream Server is RUNNING on port ${PORT}`);
  console.log(`📺 Kid Player URL:   http://localhost:${PORT}/kid`);
  console.log(`🎛️ Parent Dash URL:  http://localhost:${PORT}/parent`);
  
  const networkIps = getNetworkIps();
  if (networkIps.length > 0) {
    console.log(`\n📱 Local Network Access (Phones, Tablets, Laptops):`);
    networkIps.forEach(net => {
      console.log(`   - Kid:    http://${net.address}:${PORT}/kid`);
      console.log(`   - Parent: http://${net.address}:${PORT}/parent`);
    });
  }
  console.log(`====================================================`);
});
