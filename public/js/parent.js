// KidStream - Parent Dashboard Controller
(function () {
  const socket = io();

  // Header & Status elements
  const kidStatusDot = document.getElementById('kid-status-dot');
  const kidStatusText = document.getElementById('kid-status-text');
  const parentIpUrl = document.getElementById('parent-ip-url');
  const kidIpUrl = document.getElementById('kid-ip-url');

  // Camera elements
  const kidCamImg = document.getElementById('kid-cam-img');
  const camOfflinePlaceholder = document.getElementById('cam-offline-placeholder');
  const camStatusLabel = document.getElementById('cam-status-label');
  const btnCamSnap = document.getElementById('btn-cam-snap');
  const btnCamFullscreen = document.getElementById('btn-cam-fullscreen');
  const camWrapper = document.getElementById('cam-wrapper');

  // Playback elements
  const nowPlayingTitle = document.getElementById('now-playing-title');
  const parentVideoWrapper = document.getElementById('parent-video-wrapper');
  const parentVideo = document.getElementById('parent-video');
  const btnParentFullscreen = document.getElementById('btn-parent-fullscreen');
  const btnPlaybackFullscreen = document.getElementById('btn-playback-fullscreen');
  const btnRemoteKidFs = document.getElementById('btn-remote-kid-fs');
  const btnParentPip = document.getElementById('btn-parent-pip');
  const btnParentSoundToggle = document.getElementById('btn-parent-sound-toggle');
  const parentSoundIcon = document.getElementById('parent-sound-icon');
  const parentSoundText = document.getElementById('parent-sound-text');
  const btnFsPlayPause = document.getElementById('btn-fs-play-pause');
  const fsScrubSlider = document.getElementById('fs-scrub-slider');
  const fsTimeText = document.getElementById('fs-time-text');
  const fsSpeedSelect = document.getElementById('fs-speed-select');
  const btnFsExit = document.getElementById('btn-fs-exit');

  const timelineSlider = document.getElementById('timeline-slider');
  const timeCurrent = document.getElementById('time-current');
  const timeDuration = document.getElementById('time-duration');
  const btnPlayPause = document.getElementById('btn-play-pause');
  const btnStop = document.getElementById('btn-stop');
  const btnRewind = document.getElementById('btn-rewind');
  const btnForward = document.getElementById('btn-forward');
  const speedBadge = document.getElementById('speed-badge');
  const speedSlider = document.getElementById('speed-slider');
  const speedButtons = document.querySelectorAll('.btn-speed');
  const volumeSlider = document.getElementById('volume-slider');
  const volPercent = document.getElementById('vol-percent');

  // Math Interruption elements
  const intStatusBox = document.getElementById('int-status-box');
  const intStatusBadge = document.getElementById('int-status-badge');
  const intStatusText = document.getElementById('int-status-text');
  const btnDismissInt = document.getElementById('btn-dismiss-int');
  const mathPresets = document.querySelectorAll('.btn-math-preset');
  const mathThemeSelect = document.getElementById('math-theme');
  const customQuestion = document.getElementById('custom-question');
  const customAnswer = document.getElementById('custom-answer');
  const customWrongs = document.getElementById('custom-wrongs');
  const btnTriggerMath = document.getElementById('btn-trigger-math');
  const autoTimerSelect = document.getElementById('auto-timer-select');
  const mathModeSelect = document.getElementById('math-mode-select');
  const mathCooldownSelect = document.getElementById('math-cooldown-select');
  const mathLockoutSelect = document.getElementById('math-lockout-select');
  const mathLockoutAlert = document.getElementById('math-lockout-alert');
  const lockoutAlertDesc = document.getElementById('lockout-alert-desc');
  const btnLockoutUnlock = document.getElementById('btn-lockout-unlock');
  const btnLockoutRetry = document.getElementById('btn-lockout-retry');

  // TTS elements
  const ttsQuickButtons = document.querySelectorAll('.btn-tts-quick');
  const customTtsText = document.getElementById('custom-tts-text');
  const btnSendTts = document.getElementById('btn-send-tts');
  const ttsAvatarSelect = document.getElementById('tts-avatar-select');
  const ttsPitchSelect = document.getElementById('tts-pitch-select');

  // Video Library elements
  const videoList = document.getElementById('video-list');
  const videoCount = document.getElementById('video-count');
  const uploadDropzone = document.getElementById('upload-dropzone');
  const videoFileInput = document.getElementById('video-file-input');
  const uploadProgressContainer = document.getElementById('upload-progress-container');
  const uploadProgressFill = document.getElementById('upload-progress-fill');
  const uploadProgressLabel = document.getElementById('upload-progress-label');

  // Local state
  let currentVideo = null;
  let isPlaying = false;
  let duration = 0;
  let currentTime = 0;
  let playbackRate = 1.0;
  let selectedMathPreset = 'add-easy';
  let isDraggingScrub = false;
  let autoTimerInterval = null;
  let lastFrameTime = 0;

  // =================== Socket & Network Setup ===================

  socket.on('connect', () => {
    socket.emit('register', { role: 'parent' });
  });

  socket.on('state:init', (data) => {
    currentVideo = data.currentVideo;
    updateKidStatus(data.kidOnline, data.kidCount);
    if (data.playback) {
      updatePlaybackUI(data.playback);
    }
    if (data.activeInterruption) {
      showInterruptionActive(data.activeInterruption);
    }
    loadVideoList();
  });

  socket.on('kid:connected', (data) => {
    updateKidStatus(true, data.count);
  });

  socket.on('kid:disconnected', (data) => {
    updateKidStatus(data.kidOnline, data.count);
    if (!data.kidOnline) {
      kidCamImg.style.display = 'none';
      camOfflinePlaceholder.style.display = 'flex';
      camStatusLabel.innerText = 'Kid device offline';
    }
  });

  function updateKidStatus(online, count = 0) {
    if (online) {
      kidStatusDot.classList.add('online');
      kidStatusText.innerText = `Kid Online (${count})`;
    } else {
      kidStatusDot.classList.remove('online');
      kidStatusText.innerText = 'Kid Waiting...';
    }
  }

  // Fetch LAN IP info
  fetch('/api/network-info')
    .then(r => r.json())
    .then(data => {
      if (data.ips && data.ips.length > 0) {
        const primaryIp = data.ips[0].address;
        parentIpUrl.innerText = `http://${primaryIp}:${data.port}/parent`;
        kidIpUrl.innerText = `http://${primaryIp}:${data.port}/kid`;
      }
    })
    .catch(e => console.log('Network info fetch error:', e));

  // =================== Live Kid Camera Monitor ===================

  socket.on('kid:live_frame', (frameData) => {
    kidCamImg.src = frameData;
    if (kidCamImg.style.display === 'none') {
      kidCamImg.style.display = 'block';
      camOfflinePlaceholder.style.display = 'none';
      camStatusLabel.innerText = 'Receiving live video stream';
    }
    lastFrameTime = Date.now();
  });

  // Watchdog: If no frame received for 4 seconds, mark camera idle
  setInterval(() => {
    if (lastFrameTime > 0 && Date.now() - lastFrameTime > 4000) {
      kidCamImg.style.display = 'none';
      camOfflinePlaceholder.style.display = 'flex';
      camStatusLabel.innerText = 'Camera paused or idle';
    }
  }, 2000);

  // Snapshot photo download
  btnCamSnap.addEventListener('click', () => {
    if (kidCamImg.src && kidCamImg.style.display !== 'none') {
      const a = document.createElement('a');
      a.href = kidCamImg.src;
      a.download = `kid_watching_${Date.now()}.jpg`;
      a.click();
    } else {
      alert('Camera feed is not active yet.');
    }
  });

  // Fullscreen toggle for camera
  btnCamFullscreen.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      camWrapper.requestFullscreen().catch(err => console.log(err));
    } else {
      document.exitFullscreen();
    }
  });

  // =================== Playback Remote Control ===================

  socket.on('kid:playback_status', (pb) => {
    updatePlaybackUI(pb);
  });

  socket.on('playback:sync', (pb) => {
    updatePlaybackUI(pb);
  });

  socket.on('video:selected', (data) => {
    currentVideo = data.currentVideo;
    updateNowPlayingTitle(currentVideo);
    updatePlaybackUI(data.playback);
    highlightActiveVideoItem();
  });

  function updatePlaybackUI(pb) {
    isPlaying = pb.isPlaying;
    duration = pb.duration || 0;
    playbackRate = pb.playbackRate || 1.0;

    btnPlayPause.innerText = isPlaying ? '⏸' : '▶';
    btnFsPlayPause.innerText = isPlaying ? '⏸' : '▶';

    if (!isDraggingScrub && duration > 0) {
      currentTime = pb.currentTime || 0;
      timelineSlider.max = duration;
      timelineSlider.value = currentTime;
      timeCurrent.innerText = formatTime(currentTime);
      timeDuration.innerText = formatTime(duration);

      // Also sync fullscreen floating bar
      fsScrubSlider.max = duration;
      fsScrubSlider.value = currentTime;
      fsTimeText.innerText = `${formatTime(currentTime)} / ${formatTime(duration)}`;
    }

    // Sync parent video element
    syncParentVideo(currentVideo, pb.currentTime, isPlaying, playbackRate);

    // Update speed UI
    updateSpeedBadge(playbackRate);
    if (fsSpeedSelect) fsSpeedSelect.value = String(playbackRate);
  }

  function syncParentVideo(filename, targetTime, isPlayingTarget, rate) {
    if (!parentVideo) return;
    if (filename) {
      const streamUrl = `/api/stream/${encodeURIComponent(filename)}`;
      if (parentVideo.src !== window.location.origin + streamUrl) {
        parentVideo.src = streamUrl;
        parentVideo.load();
      }
    }

    if (rate && parentVideo.playbackRate !== rate) {
      parentVideo.playbackRate = rate;
    }

    if (targetTime !== undefined && Math.abs(parentVideo.currentTime - targetTime) > 1.5) {
      parentVideo.currentTime = targetTime;
    }

    if (isPlayingTarget) {
      if (parentVideo.paused) {
        parentVideo.play().catch(e => {
          // Autoplay policy: if unmuted playback blocked, mute and retry
          if (!parentVideo.muted) {
            parentVideo.muted = true;
            parentVideo.play().catch(err => console.log('Parent autoplay deferred:', err));
          }
        });
      }
    } else {
      if (!parentVideo.paused) {
        parentVideo.pause();
      }
    }
  }

  // Fullscreen Handlers for Parent
  function toggleParentFullscreen() {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      if (parentVideoWrapper.requestFullscreen) {
        parentVideoWrapper.requestFullscreen().catch(err => {
          if (parentVideo.webkitEnterFullscreen) parentVideo.webkitEnterFullscreen();
        });
      } else if (parentVideoWrapper.webkitRequestFullscreen) {
        parentVideoWrapper.webkitRequestFullscreen();
      } else if (parentVideo.webkitEnterFullscreen) {
        parentVideo.webkitEnterFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
  }

  btnParentFullscreen.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleParentFullscreen();
  });

  btnPlaybackFullscreen.addEventListener('click', () => {
    toggleParentFullscreen();
  });

  // Double click parent video to fullscreen
  parentVideoWrapper.addEventListener('dblclick', () => {
    toggleParentFullscreen();
  });

  // Single click parent video to play/pause
  parentVideo.addEventListener('click', () => {
    if (isPlaying) {
      socket.emit('parent:pause');
    } else {
      socket.emit('parent:play');
    }
  });

  // Exit Fullscreen button
  btnFsExit.addEventListener('click', (e) => {
    e.stopPropagation();
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
  });

  // Play/Pause inside Fullscreen floating bar
  btnFsPlayPause.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isPlaying) {
      socket.emit('parent:pause');
    } else {
      socket.emit('parent:play');
    }
  });

  // Scrub inside Fullscreen floating bar
  fsScrubSlider.addEventListener('input', () => {
    fsTimeText.innerText = `${formatTime(fsScrubSlider.value)} / ${formatTime(duration)}`;
  });

  fsScrubSlider.addEventListener('change', () => {
    socket.emit('parent:seek', { time: parseFloat(fsScrubSlider.value) });
  });

  // Speed selector inside Fullscreen floating bar
  fsSpeedSelect.addEventListener('change', () => {
    const rate = parseFloat(fsSpeedSelect.value);
    setPlaybackRate(rate);
  });

  // PiP (Picture in Picture) for Parent
  btnParentPip.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled && parentVideo.readyState >= 2) {
        await parentVideo.requestPictureInPicture();
      }
    } catch (err) {
      console.warn('PiP not available:', err);
    }
  });

  // Sound toggle for Parent
  btnParentSoundToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    parentVideo.muted = !parentVideo.muted;
    if (parentVideo.muted) {
      parentSoundIcon.innerText = '🔇';
      parentSoundText.innerText = 'Muted';
    } else {
      parentSoundIcon.innerText = '🔊';
      parentSoundText.innerText = 'Sound On';
      parentVideo.volume = 1.0;
    }
  });

  // Remote Kid Fullscreen toggle
  btnRemoteKidFs.addEventListener('click', () => {
    socket.emit('parent:toggle_kid_fullscreen');
    btnRemoteKidFs.style.transform = 'scale(0.9)';
    setTimeout(() => { btnRemoteKidFs.style.transform = ''; }, 200);
  });

  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  // Play / Pause Toggle
  btnPlayPause.addEventListener('click', () => {
    if (isPlaying) {
      socket.emit('parent:pause');
    } else {
      socket.emit('parent:play');
    }
  });

  // Stop Button
  btnStop.addEventListener('click', () => {
    socket.emit('parent:stop');
  });

  // Rewind 10s
  btnRewind.addEventListener('click', () => {
    const target = Math.max(0, currentTime - 10);
    socket.emit('parent:seek', { time: target });
  });

  // Forward 10s
  btnForward.addEventListener('click', () => {
    const target = Math.min(duration, currentTime + 10);
    socket.emit('parent:seek', { time: target });
  });

  // Timeline scrub
  timelineSlider.addEventListener('mousedown', () => { isDraggingScrub = true; });
  timelineSlider.addEventListener('touchstart', () => { isDraggingScrub = true; });
  
  timelineSlider.addEventListener('input', () => {
    timeCurrent.innerText = formatTime(timelineSlider.value);
  });

  timelineSlider.addEventListener('change', () => {
    isDraggingScrub = false;
    socket.emit('parent:seek', { time: parseFloat(timelineSlider.value) });
  });

  // Playback Speed Controls
  speedButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const rate = parseFloat(btn.dataset.rate);
      setPlaybackRate(rate);
    });
  });

  speedSlider.addEventListener('input', () => {
    const rate = parseFloat(speedSlider.value);
    setPlaybackRate(rate);
  });

  function setPlaybackRate(rate) {
    playbackRate = rate;
    socket.emit('parent:set_rate', { rate });
    updateSpeedBadge(rate);
  }

  function updateSpeedBadge(rate) {
    speedBadge.innerText = `${rate}x ${rate === 1.0 ? '(Normal)' : ''}`;
    speedSlider.value = rate;
    speedButtons.forEach(b => {
      b.classList.toggle('active', parseFloat(b.dataset.rate) === rate);
    });
  }

  // Volume Control
  volumeSlider.addEventListener('input', () => {
    const vol = parseFloat(volumeSlider.value);
    volPercent.innerText = `${Math.round(vol * 100)}%`;
    socket.emit('parent:set_volume', { volume: vol });
  });

  // =================== Math Interruption Station ===================

  mathPresets.forEach(btn => {
    btn.addEventListener('click', () => {
      mathPresets.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedMathPreset = btn.dataset.type;
    });
  });

  btnTriggerMath.addEventListener('click', () => {
    const problem = generateMathProblem();
    socket.emit('parent:trigger_math', problem);
    showInterruptionActive(problem);
  });

  btnDismissInt.addEventListener('click', () => {
    socket.emit('parent:dismiss_math');
    clearInterruptionUI();
  });

  socket.on('interruption:active', (problem) => {
    showInterruptionActive(problem);
  });

  socket.on('interruption:cleared', () => {
    clearInterruptionUI();
  });

  // Handle 3-strike lockout alert from kid screen
  socket.on('parent:kid_math_locked', (data) => {
    if (mathLockoutAlert) {
      mathLockoutAlert.classList.remove('hidden');
      if (lockoutAlertDesc) {
        lockoutAlertDesc.innerText = `Kid made ${data.mistakes || 3} wrong attempts. Screen locked to prevent guessing!`;
      }
    }
    intStatusBadge.innerText = 'STATUS: LOCKED OUT 🛑';
    intStatusBadge.style.color = 'var(--danger)';
    intStatusText.innerText = 'Kid screen paused and locked. Waiting for your action.';
  });

  if (btnLockoutUnlock) {
    btnLockoutUnlock.addEventListener('click', () => {
      socket.emit('parent:unlock_math');
      if (mathLockoutAlert) mathLockoutAlert.classList.add('hidden');
      clearInterruptionUI();
    });
  }

  if (btnLockoutRetry) {
    btnLockoutRetry.addEventListener('click', () => {
      selectedMathPreset = 'add-easy';
      mathPresets.forEach(b => {
        b.classList.toggle('active', b.dataset.type === 'add-easy');
      });
      if (mathLockoutAlert) mathLockoutAlert.classList.add('hidden');
      const problem = generateMathProblem();
      socket.emit('parent:trigger_math', problem);
      showInterruptionActive(problem);
    });
  }

  socket.on('kid:math_result', (data) => {
    if (data.isCorrect) {
      if (mathLockoutAlert) mathLockoutAlert.classList.add('hidden');
      intStatusBadge.innerText = 'STATUS: SOLVED! 🎉';
      intStatusBadge.style.color = 'var(--success)';
      intStatusText.innerText = `Kid answered "${data.answerChosen}" correctly! Video resuming...`;
      setTimeout(clearInterruptionUI, 3000);
    } else {
      intStatusBadge.innerText = 'STATUS: TRYING AGAIN ⭐';
      intStatusBadge.style.color = 'var(--warning)';
      intStatusText.innerText = `Kid picked "${data.answerChosen}" (Keep trying!)`;
    }
  });

  function showInterruptionActive(problem) {
    intStatusBadge.innerText = 'STATUS: CHALLENGE ACTIVE 🧠';
    intStatusBadge.style.color = 'var(--warning)';
    intStatusText.innerText = `Kid screen paused on: ${problem.question}`;
    btnDismissInt.classList.remove('hidden');
  }

  function clearInterruptionUI() {
    intStatusBadge.innerText = 'STATUS: IDLE';
    intStatusBadge.style.color = 'var(--text-muted)';
    intStatusText.innerText = 'Video is playing uninterrupted';
    btnDismissInt.classList.add('hidden');
    if (mathLockoutAlert) mathLockoutAlert.classList.add('hidden');
  }

  function generateMathProblem() {
    const mode = mathModeSelect ? mathModeSelect.value : 'choice';
    const cooldownSec = mathCooldownSelect ? parseInt(mathCooldownSelect.value, 10) : 3;
    const maxAttempts = mathLockoutSelect ? parseInt(mathLockoutSelect.value, 10) : 3;

    // Check if custom is provided
    const customQ = customQuestion.value.trim();
    const customA = customAnswer.value.trim();
    const customW = customWrongs.value.trim();

    if (customQ && customA) {
      const wrongs = customW ? customW.split(',').map(s => s.trim()).filter(Boolean) : [];
      while (wrongs.length < 3) {
        wrongs.push(String(parseInt(customA, 10) + wrongs.length + 1 || Math.floor(Math.random() * 20)));
      }
      const options = shuffleArray([customA, ...wrongs.slice(0, 3)]);
      return {
        id: 'math_' + Date.now(),
        question: customQ,
        promptText: 'Can you solve this challenge?',
        answer: customA,
        options: options,
        visualTheme: mathThemeSelect.value,
        mode: mode,
        cooldownSec: cooldownSec,
        maxAttempts: maxAttempts
      };
    }

    let num1, num2, op = '+', answer;
    const theme = mathThemeSelect.value;

    switch (selectedMathPreset) {
      case 'add-easy':
        num1 = Math.floor(Math.random() * 4) + 1;
        num2 = Math.floor(Math.random() * 4) + 1;
        op = '+';
        answer = num1 + num2;
        break;
      case 'add-med':
        num1 = Math.floor(Math.random() * 6) + 3;
        num2 = Math.floor(Math.random() * 5) + 2;
        op = '+';
        answer = num1 + num2;
        break;
      case 'sub-easy':
        num1 = Math.floor(Math.random() * 4) + 3;
        num2 = Math.floor(Math.random() * (num1 - 1)) + 1;
        op = '-';
        answer = num1 - num2;
        break;
      case 'sub-med':
        num1 = Math.floor(Math.random() * 7) + 5;
        num2 = Math.floor(Math.random() * 5) + 1;
        op = '-';
        answer = num1 - num2;
        break;
      case 'mul-easy':
        num1 = Math.floor(Math.random() * 3) + 2;
        num2 = Math.floor(Math.random() * 4) + 1;
        op = '×';
        answer = num1 * num2;
        break;
      case 'random':
      default:
        num1 = Math.floor(Math.random() * 5) + 1;
        num2 = Math.floor(Math.random() * 5) + 1;
        op = '+';
        answer = num1 + num2;
        break;
    }

    // Generate 3 plausible distractors
    const distractors = new Set();
    while (distractors.size < 3) {
      const offset = (Math.random() > 0.5 ? 1 : -1) * (Math.floor(Math.random() * 3) + 1);
      const wrong = Math.max(1, answer + offset);
      if (wrong !== answer) distractors.add(wrong);
    }

    const options = shuffleArray([answer, ...Array.from(distractors)]);

    return {
      id: 'math_' + Date.now(),
      num1,
      num2,
      operator: op,
      question: `What is ${num1} ${op} ${num2}?`,
      promptText: 'Count the fun items to solve!',
      answer: String(answer),
      options: options.map(String),
      visualTheme: theme,
      mode: mode,
      cooldownSec: cooldownSec,
      maxAttempts: maxAttempts
    };
  }

  function shuffleArray(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  // Auto-interruption timer setup
  autoTimerSelect.addEventListener('change', () => {
    if (autoTimerInterval) {
      clearInterval(autoTimerInterval);
      autoTimerInterval = null;
    }

    const mins = parseInt(autoTimerSelect.value, 10);
    if (mins > 0) {
      console.log(`Auto-interrupt enabled every ${mins} minute(s)`);
      autoTimerInterval = setInterval(() => {
        if (isPlaying) {
          const problem = generateMathProblem();
          socket.emit('parent:trigger_math', problem);
          showInterruptionActive(problem);
        }
      }, mins * 60 * 1000);
    }
  });

  // =================== Text-To-Speech (TTS) Voice Prompts ===================

  ttsQuickButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const text = btn.dataset.text;
      const avatar = btn.dataset.avatar || '🤖';
      sendTtsPrompt(text, avatar);
    });
  });

  btnSendTts.addEventListener('click', () => {
    const text = customTtsText.value.trim();
    if (!text) return;
    const avatar = ttsAvatarSelect.value;
    sendTtsPrompt(text, avatar);
    customTtsText.value = '';
  });

  customTtsText.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnSendTts.click();
  });

  function sendTtsPrompt(text, avatar) {
    const pitch = parseFloat(ttsPitchSelect.value);
    socket.emit('parent:send_tts', {
      text,
      avatar,
      pitch,
      rate: 0.95
    });

    // Brief UI feedback
    const originalText = btnSendTts.innerHTML;
    btnSendTts.innerHTML = '<span>✅</span> Sent!';
    setTimeout(() => { btnSendTts.innerHTML = originalText; }, 1500);
  }

  // =================== Video Library & Uploads ===================

  socket.on('videos:updated', (data) => {
    if (data.videos) {
      renderVideos(data.videos);
    } else {
      loadVideoList();
    }
  });

  function loadVideoList() {
    fetch('/api/videos')
      .then(r => r.json())
      .then(data => {
        currentVideo = data.currentVideo;
        renderVideos(data.videos);
        updateNowPlayingTitle(currentVideo);
      })
      .catch(e => console.error('Failed to load videos:', e));
  }

  function renderVideos(videos) {
    videoCount.innerText = videos.length;
    videoList.innerHTML = '';

    if (videos.length === 0) {
      videoList.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 20px;">No videos found. Upload one below!</div>`;
      return;
    }

    videos.forEach(v => {
      const item = document.createElement('div');
      item.className = `video-item ${v.filename === currentVideo ? 'active' : ''}`;
      item.dataset.filename = v.filename;

      item.innerHTML = `
        <div class="video-info">
          <span class="video-icon">🎬</span>
          <div>
            <div class="video-name" title="${v.filename}">${v.title}</div>
            <div class="video-meta">${v.sizeFormatted} • ${v.filename}</div>
          </div>
        </div>
        <div class="video-actions">
          <button class="btn-play-video" data-file="${v.filename}">
            <span>▶</span> Play on Kid's Screen
          </button>
          <button class="btn-del-video" data-file="${v.filename}" title="Delete video">🗑️</button>
        </div>
      `;

      item.querySelector('.btn-play-video').addEventListener('click', () => {
        playSelectedVideo(v.filename);
      });

      item.querySelector('.btn-del-video').addEventListener('click', () => {
        deleteVideo(v.filename);
      });

      videoList.appendChild(item);
    });
  }

  function playSelectedVideo(filename) {
    socket.emit('parent:select_video', { filename });
  }

  function deleteVideo(filename) {
    if (!confirm(`Are you sure you want to delete "${filename}"?`)) return;
    fetch(`/api/videos/${encodeURIComponent(filename)}`, { method: 'DELETE' })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          loadVideoList();
        } else {
          alert('Failed to delete video');
        }
      });
  }

  function updateNowPlayingTitle(filename) {
    if (!filename) {
      nowPlayingTitle.innerText = 'No video selected';
      return;
    }
    const cleanTitle = filename.replace(/^\d+_/, '').replace(/\.[^/.]+$/, '').replace(/[_.-]+/g, ' ').trim();
    nowPlayingTitle.innerText = cleanTitle;
  }

  function highlightActiveVideoItem() {
    const items = videoList.querySelectorAll('.video-item');
    items.forEach(it => {
      it.classList.toggle('active', it.dataset.filename === currentVideo);
    });
  }

  // Upload handler
  uploadDropzone.addEventListener('click', () => {
    videoFileInput.click();
  });

  uploadDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadDropzone.classList.add('dragover');
  });

  uploadDropzone.addEventListener('dragleave', () => {
    uploadDropzone.classList.remove('dragover');
  });

  uploadDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadDropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadFile(e.dataTransfer.files[0]);
    }
  });

  videoFileInput.addEventListener('change', () => {
    if (videoFileInput.files && videoFileInput.files.length > 0) {
      uploadFile(videoFileInput.files[0]);
    }
  });

  function uploadFile(file) {
    const formData = new FormData();
    formData.append('video', file);

    uploadProgressContainer.classList.remove('hidden');
    uploadProgressFill.style.width = '0%';
    uploadProgressLabel.innerText = 'Uploading: 0%';

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload', true);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        uploadProgressFill.style.width = `${percent}%`;
        uploadProgressLabel.innerText = `Uploading: ${percent}%`;
      }
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        uploadProgressLabel.innerText = 'Upload Complete! 🎉';
        uploadProgressFill.style.background = 'var(--success)';
        setTimeout(() => {
          uploadProgressContainer.classList.add('hidden');
          videoFileInput.value = '';
          loadVideoList();
        }, 1500);
      } else {
        uploadProgressLabel.innerText = 'Upload failed!';
        uploadProgressFill.style.background = 'var(--danger)';
      }
    };

    xhr.onerror = () => {
      uploadProgressLabel.innerText = 'Upload error!';
      uploadProgressFill.style.background = 'var(--danger)';
    };

    xhr.send(formData);
  }

  // =================== System Updater & GitHub Sync ===================
  const btnUpgrade = document.getElementById('btn-upgrade');
  const upgradeIcon = document.getElementById('upgrade-icon');
  const upgradeText = document.getElementById('upgrade-text');
  const upgradeBadge = document.getElementById('upgrade-badge');

  const upgradeModal = document.getElementById('upgrade-modal');
  const btnCloseUpgradeModal = document.getElementById('btn-close-upgrade-modal');
  const installedVersionVal = document.getElementById('installed-version-val');
  const latestVersionVal = document.getElementById('latest-version-val');
  const upgradeStatusBox = document.getElementById('upgrade-status-box');
  const upgradeStatusIcon = document.getElementById('upgrade-status-icon');
  const upgradeStatusMsg = document.getElementById('upgrade-status-msg');
  const pendingCommitsBox = document.getElementById('pending-commits-box');
  const pendingCommitsList = document.getElementById('pending-commits-list');
  const upgradeTerminalLog = document.getElementById('upgrade-terminal-log');
  const btnRefreshUpdate = document.getElementById('btn-refresh-update');
  const btnDoUpgrade = document.getElementById('btn-do-upgrade');

  let isCheckingUpdate = false;
  let isUpgrading = false;

  async function checkSystemUpdates(showModalOnComplete = false) {
    if (isCheckingUpdate) return;
    isCheckingUpdate = true;
    if (upgradeIcon) upgradeIcon.style.animation = 'spin 1s linear infinite';
    if (upgradeStatusMsg) upgradeStatusMsg.innerText = 'Connecting to GitHub...';

    try {
      const res = await fetch('/api/system/check-update');
      const data = await res.json();

      if (data.success) {
        if (installedVersionVal) installedVersionVal.innerText = data.currentCommit || 'unknown';
        if (latestVersionVal) latestVersionVal.innerText = data.remoteCommit || 'unknown';

        if (data.updateAvailable) {
          // Update available!
          if (btnUpgrade) btnUpgrade.classList.add('update-available');
          if (upgradeBadge) upgradeBadge.classList.remove('hidden');
          if (upgradeText) upgradeText.innerText = 'Upgrade Available!';

          if (upgradeStatusBox) {
            upgradeStatusBox.className = 'upgrade-status-box has-update';
          }
          if (upgradeStatusIcon) upgradeStatusIcon.innerText = '⚡';
          if (upgradeStatusMsg) {
            upgradeStatusMsg.innerText = `New version (${data.remoteCommit}) available on GitHub!`;
          }

          if (btnDoUpgrade) {
            btnDoUpgrade.disabled = false;
            btnDoUpgrade.innerHTML = '<span>⚡</span> Upgrade Now (Pull & Sync)';
          }

          // Show pending commits
          if (data.pendingCommits && data.pendingCommits.length > 0) {
            pendingCommitsList.innerHTML = '';
            data.pendingCommits.forEach(msg => {
              const li = document.createElement('li');
              li.innerText = '• ' + msg;
              pendingCommitsList.appendChild(li);
            });
            pendingCommitsBox.classList.remove('hidden');
          } else {
            pendingCommitsBox.classList.add('hidden');
          }

          if (showModalOnComplete && upgradeModal) {
            upgradeModal.classList.remove('hidden');
          }
        } else {
          // Up to date!
          if (btnUpgrade) btnUpgrade.classList.remove('update-available');
          if (upgradeBadge) upgradeBadge.classList.add('hidden');
          if (upgradeText) upgradeText.innerText = 'Up to Date (v' + (data.currentCommit || '') + ')';

          if (upgradeStatusBox) {
            upgradeStatusBox.className = 'upgrade-status-box success';
          }
          if (upgradeStatusIcon) upgradeStatusIcon.innerText = '✅';
          if (upgradeStatusMsg) {
            upgradeStatusMsg.innerText = `You are on the latest version (${data.currentCommit})!`;
          }

          if (btnDoUpgrade) {
            btnDoUpgrade.disabled = true;
            btnDoUpgrade.innerHTML = '<span>✅</span> Already Up to Date';
          }

          if (pendingCommitsBox) pendingCommitsBox.classList.add('hidden');
        }
      } else {
        if (upgradeStatusMsg) upgradeStatusMsg.innerText = `Check failed: ${data.error || 'Unknown error'}`;
      }
    } catch (err) {
      if (upgradeStatusMsg) upgradeStatusMsg.innerText = `Network error checking updates: ${err.message}`;
    } finally {
      isCheckingUpdate = false;
      if (upgradeIcon) upgradeIcon.style.animation = '';
    }
  }

  async function performUpgrade() {
    if (isUpgrading) return;
    isUpgrading = true;

    btnDoUpgrade.disabled = true;
    btnDoUpgrade.innerHTML = '<span>⏳</span> Pulling from GitHub...';
    btnRefreshUpdate.disabled = true;

    upgradeTerminalLog.classList.remove('hidden');
    upgradeTerminalLog.innerText = '$ git pull origin main\nContacting remote GitHub repository...\n';

    if (upgradeStatusBox) upgradeStatusBox.className = 'upgrade-status-box';
    if (upgradeStatusIcon) upgradeStatusIcon.innerText = '⏳';
    if (upgradeStatusMsg) upgradeStatusMsg.innerText = 'Syncing repository and restarting server...';

    try {
      const res = await fetch('/api/system/upgrade', { method: 'POST' });
      const data = await res.json();

      if (data.success) {
        upgradeTerminalLog.innerText += `${data.output || 'Already up to date.'}\n\n`;
        upgradeTerminalLog.innerText += `✔ Successfully synced commit ${data.newCommit || ''}\n`;
        upgradeTerminalLog.innerText += `✔ Server process is restarting...\n`;

        if (upgradeStatusBox) upgradeStatusBox.className = 'upgrade-status-box success';
        if (upgradeStatusIcon) upgradeStatusIcon.innerText = '🎉';
        
        let countdown = 5;
        const countInterval = setInterval(() => {
          if (upgradeStatusMsg) {
            upgradeStatusMsg.innerText = `Upgrade Complete! Reloading dashboard in ${countdown}s...`;
          }
          countdown--;
          if (countdown <= 0) {
            clearInterval(countInterval);
            window.location.reload();
          }
        }, 1000);
      } else {
        upgradeTerminalLog.innerText += `\n❌ Error: ${data.error || 'Failed to upgrade'}\n`;
        if (data.stdout) upgradeTerminalLog.innerText += `${data.stdout}\n`;
        if (upgradeStatusMsg) upgradeStatusMsg.innerText = 'Upgrade failed. Check terminal output above.';
        btnDoUpgrade.disabled = false;
        btnDoUpgrade.innerHTML = '<span>🔄</span> Try Again';
        btnRefreshUpdate.disabled = false;
        isUpgrading = false;
      }
    } catch (err) {
      upgradeTerminalLog.innerText += `\n❌ Connection error: ${err.message}\n`;
      if (upgradeStatusMsg) upgradeStatusMsg.innerText = 'Connection lost. Server may be restarting...';
      setTimeout(() => window.location.reload(), 4000);
    }
  }

  if (btnUpgrade) {
    btnUpgrade.addEventListener('click', () => {
      upgradeModal.classList.remove('hidden');
      checkSystemUpdates(false);
    });
  }

  if (btnCloseUpgradeModal) {
    btnCloseUpgradeModal.addEventListener('click', () => {
      upgradeModal.classList.add('hidden');
    });
  }

  if (upgradeModal) {
    upgradeModal.addEventListener('click', (e) => {
      if (e.target === upgradeModal && !isUpgrading) {
        upgradeModal.classList.add('hidden');
      }
    });
  }

  if (btnRefreshUpdate) {
    btnRefreshUpdate.addEventListener('click', () => checkSystemUpdates(false));
  }

  if (btnDoUpgrade) {
    btnDoUpgrade.addEventListener('click', performUpgrade);
  }

  // Check for updates shortly after dashboard load
  setTimeout(() => checkSystemUpdates(false), 2500);

})();
