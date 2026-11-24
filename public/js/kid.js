// Kid Player Controller
(function () {
  const socket = io();

  const video = document.getElementById('kid-video');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const camIndicator = document.getElementById('cam-indicator');
  const welcomeOverlay = document.getElementById('welcome-overlay');
  const btnStart = document.getElementById('btn-start');

  // Hidden camera elements
  const camVideo = document.getElementById('kid-cam-video');
  const camCanvas = document.getElementById('kid-cam-canvas');
  const camCtx = camCanvas.getContext('2d');

  // Math Modal Elements
  const mathOverlay = document.getElementById('math-overlay');
  const mathBadge = document.getElementById('math-badge');
  const mathMascot = document.getElementById('math-mascot');
  const mathQuestion = document.getElementById('math-question');
  const mathPrompt = document.getElementById('math-prompt');
  const mathVisualBox = document.getElementById('math-visual-box');
  const mathOptionsGrid = document.getElementById('math-options-grid');
  const mathResultMsg = document.getElementById('math-result-msg');

  // TTS Toast Elements
  const ttsToast = document.getElementById('tts-toast');
  const ttsAvatar = document.getElementById('tts-avatar');
  const ttsText = document.getElementById('tts-text');
  const ttsAudio = document.getElementById('tts-audio-player');

  let currentProblem = null;
  let camStream = null;
  let camInterval = null;
  let peerConnection = null;
  let savedVolume = 1.0;

  // Mascot list for math challenges
  const mascots = ['🦖', '🐱', '🐶', '🚀', '🐰', '🦁', '🌟', '🐼'];

  // Theme icons for visual counting
  const themeIcons = {
    fruits: ['🍎', '🍏', '🍌', '🍓', '🍊'],
    stars: ['⭐', '🌟', '✨', '🪐', '🌙'],
    animals: ['🐱', '🐶', '🐰', '🐼', '🦊'],
    candy: ['🍬', '🍭', '🧁', '🍩', '🍫']
  };

  // Voice management for iOS / modern browsers
  let availableVoices = [];
  function populateVoices() {
    if ('speechSynthesis' in window) {
      availableVoices = window.speechSynthesis.getVoices();
    }
  }
  populateVoices();
  if ('speechSynthesis' in window && window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = populateVoices;
  }

  // Audio & Speech unlocker for iOS / iPadOS
  let hasPrimedAudio = false;
  function primeAudioAndSpeech() {
    if (hasPrimedAudio) return;
    hasPrimedAudio = true;

    if (window.kidSounds) {
      window.kidSounds.ensureContext();
    }

    // Unlock HTML5 Audio element on iOS Safari
    if (ttsAudio) {
      try {
        ttsAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
        ttsAudio.play().then(() => ttsAudio.pause()).catch(() => {});
      } catch (e) {}
    }

    // Critical for iOS Safari: SpeechSynthesis MUST be triggered inside a user gesture
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        window.speechSynthesis.resume();
        const dummy = new SpeechSynthesisUtterance(' ');
        dummy.volume = 0.01;
        dummy.rate = 2.0;
        window._activeTtsUtterance = dummy;
        window.speechSynthesis.speak(dummy);
      } catch (e) {
        console.warn('SpeechSynthesis prime error:', e);
      }
    }
  }

  // Listen for any initial touch to unlock audio session immediately
  document.addEventListener('touchstart', primeAudioAndSpeech, { once: true, passive: true });
  document.addEventListener('pointerdown', primeAudioAndSpeech, { once: true, passive: true });

  // =================== Initial Setup & Audio Unlock ===================

  btnStart.addEventListener('click', () => {
    primeAudioAndSpeech();

    if (window.kidSounds) {
      window.kidSounds.playPop();
    }

    // Try starting camera
    startKidCamera();

    // Hide welcome overlay
    welcomeOverlay.classList.add('hidden');

    // Register with socket
    socket.emit('register', { role: 'kid' });

    // Try playing video if already loaded
    if (video.src) {
      video.play().catch(e => console.log('Autoplay deferred:', e));
    }
  });

  // Socket Connection Status
  socket.on('connect', () => {
    statusDot.classList.add('online');
    statusText.innerText = 'Connected';
    // If user already tapped start, register
    if (welcomeOverlay.classList.contains('hidden')) {
      socket.emit('register', { role: 'kid' });
    }
  });

  socket.on('disconnect', () => {
    statusDot.classList.remove('online');
    statusText.innerText = 'Disconnected';
  });

  // =================== Camera Access & Streaming ===================

  async function startKidCamera() {
    camIndicator.innerText = '📷 Starting...';
    camIndicator.style.color = '#ffd166';

    // Check for Secure Context on iOS Safari (iOS blocks camera on insecure HTTP)
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        const httpsUrl = `https://${window.location.hostname}:3443${window.location.pathname}`;
        camIndicator.innerText = '📷 Tap for Cam (HTTPS)';
        camIndicator.style.color = '#f59e0b';
        camIndicator.onclick = () => {
          if (confirm(`On iPad/iPhone, Apple requires HTTPS for camera access.\n\nTap OK to switch to HTTPS mode:\n${httpsUrl}`)) {
            window.location.href = httpsUrl;
          }
        };
        return;
      }
    }

    try {
      let stream = null;
      const constraintCandidates = [
        // Candidate 1: front-facing user camera (optimal for iPad)
        { video: { facingMode: 'user' }, audio: false },
        // Candidate 2: relaxed width/height
        { video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 360 } }, audio: false },
        // Candidate 3: simple generic video constraint
        { video: true, audio: false }
      ];

      for (const candidate of constraintCandidates) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(candidate);
          if (stream) break;
        } catch (candidateErr) {
          console.warn('Constraint attempt failed:', candidate, candidateErr);
        }
      }

      if (!stream) {
        throw new Error('Unable to acquire camera stream with any constraint');
      }

      camStream = stream;
      camVideo.srcObject = camStream;
      camVideo.setAttribute('playsinline', 'true');
      camVideo.setAttribute('webkit-playsinline', 'true');
      camVideo.muted = true;

      try {
        await camVideo.play();
      } catch (playErr) {
        console.log('camVideo play deferred:', playErr);
      }

      camIndicator.innerText = '📷 Cam Live';
      camIndicator.style.color = '#00e676';
      camIndicator.onclick = () => {
        // Tap to re-verify or refresh camera
        startKidCamera();
      };

      // Watchdog if video track is ended (e.g. app switched on iPad)
      const track = camStream.getVideoTracks()[0];
      if (track) {
        track.onended = () => {
          camIndicator.innerText = '📷 Tap to restart cam';
          camIndicator.style.color = '#ff8a80';
        };
      }

      // Stream frames to parents via Socket (4 frames per sec, 0.55 quality - rock solid on mobile)
      if (camInterval) clearInterval(camInterval);
      camInterval = setInterval(() => {
        if (camVideo.readyState >= 2 && camVideo.videoWidth > 0) {
          camCtx.drawImage(camVideo, 0, 0, camCanvas.width, camCanvas.height);
          const frameData = camCanvas.toDataURL('image/jpeg', 0.55);
          socket.emit('kid:camera_frame', frameData);
        }
      }, 250);

    } catch (err) {
      console.warn('Camera access denied or unavailable:', err);
      camIndicator.innerText = '📷 Cam Blocked (Tap)';
      camIndicator.style.color = '#ff8a80';
      camIndicator.onclick = () => {
        alert('Camera was blocked or denied.\n\nOn iPad:\n1. Check Safari Settings -> Camera -> Allow\n2. If using HTTP, switch to HTTPS at port 3443');
        startKidCamera();
      };
    }
  }

  // =================== Video Playback Controls ===================

  socket.on('state:init', (data) => {
    if (data.currentVideo) {
      loadVideo(data.currentVideo, data.playback.currentTime, data.playback.isPlaying);
    }
    if (data.playback) {
      video.playbackRate = data.playback.playbackRate || 1.0;
      video.volume = data.playback.volume !== undefined ? data.playback.volume : 1.0;
    }
    if (data.activeInterruption) {
      showMathInterruption(data.activeInterruption);
    }
  });

  socket.on('control:load_video', (data) => {
    loadVideo(data.filename, 0, true);
  });

  socket.on('control:play', () => {
    video.play().catch(e => console.log('Play blocked:', e));
  });

  socket.on('control:pause', () => {
    video.pause();
  });

  socket.on('control:stop', () => {
    video.pause();
    video.currentTime = 0;
  });

  socket.on('control:seek', (data) => {
    if (Math.abs(video.currentTime - data.time) > 1) {
      video.currentTime = data.time;
    }
  });

  socket.on('control:set_rate', (data) => {
    video.playbackRate = data.rate;
  });

  socket.on('control:set_volume', (data) => {
    video.volume = data.volume;
  });

  socket.on('control:toggle_fullscreen', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(e => console.log('Fullscreen request failed:', e));
    } else {
      document.exitFullscreen().catch(e => console.log('Exit fullscreen error:', e));
    }
  });

  function loadVideo(filename, startTime = 0, autoPlay = false) {
    const streamUrl = `/api/stream/${encodeURIComponent(filename)}`;
    if (video.src !== window.location.origin + streamUrl) {
      video.src = streamUrl;
      video.load();
      video.currentTime = startTime;
      if (autoPlay) {
        video.play().catch(e => console.log('Autoplay blocked:', e));
      }
    }
  }

  // Regularly report playback status to server
  setInterval(() => {
    if (video.src) {
      socket.emit('kid:report_status', {
        currentTime: video.currentTime,
        duration: video.duration || 0,
        isPlaying: !video.paused && !video.ended,
        playbackRate: video.playbackRate
      });
    }
  }, 500);

  // =================== Math Interruption System ===================

  socket.on('interruption:start', (problemData) => {
    showMathInterruption(problemData);
  });

  socket.on('interruption:dismiss', () => {
    hideMathInterruption(false);
  });

  function showMathInterruption(problem) {
    currentProblem = problem;
    // Pause video
    video.pause();

    // Play chime sound
    if (window.kidSounds) window.kidSounds.playChime();

    // Random Mascot
    mathMascot.innerText = mascots[Math.floor(Math.random() * mascots.length)];
    mathQuestion.innerText = problem.question || `${problem.num1} ${problem.operator} ${problem.num2} = ?`;
    mathPrompt.innerText = problem.promptText || 'Count the fun items to solve!';
    mathResultMsg.innerText = '';
    mathResultMsg.className = 'math-result-message';

    // Render visual items counter
    renderVisualCounter(problem);

    // Render answer options
    renderAnswerOptions(problem);

    mathOverlay.classList.remove('hidden');
  }

  function renderVisualCounter(problem) {
    mathVisualBox.innerHTML = '';
    const theme = problem.visualTheme || 'fruits';
    const icons = themeIcons[theme] || themeIcons.fruits;
    const icon1 = icons[0];
    const icon2 = icons[1] || icons[0];

    const num1 = parseInt(problem.num1, 10);
    const num2 = parseInt(problem.num2, 10);
    const op = problem.operator || '+';

    if (!isNaN(num1) && !isNaN(num2)) {
      // Group 1
      const group1 = document.createElement('div');
      group1.className = 'math-group';
      for (let i = 0; i < Math.min(num1, 12); i++) {
        const item = document.createElement('span');
        item.className = 'math-item-icon';
        item.innerText = icon1;
        group1.appendChild(item);
      }
      mathVisualBox.appendChild(group1);

      // Operator
      const opSpan = document.createElement('span');
      opSpan.className = 'math-operator-sign';
      opSpan.innerText = op;
      mathVisualBox.appendChild(opSpan);

      // Group 2
      const group2 = document.createElement('div');
      group2.className = 'math-group';
      for (let i = 0; i < Math.min(num2, 12); i++) {
        const item = document.createElement('span');
        item.className = 'math-item-icon';
        item.innerText = icon2;
        group2.appendChild(item);
      }
      mathVisualBox.appendChild(group2);
    } else {
      mathVisualBox.innerHTML = `<span style="font-size: 32px;">🌟 🤔 🌟</span>`;
    }
  }

  function renderAnswerOptions(problem) {
    mathOptionsGrid.innerHTML = '';
    const options = problem.options || [problem.answer];

    options.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.className = `btn-math-opt opt-color-${idx % 4}`;
      btn.innerText = opt;

      btn.addEventListener('click', () => {
        handleOptionClick(btn, opt, problem);
      });

      mathOptionsGrid.appendChild(btn);
    });
  }

  function handleOptionClick(btn, chosenAnswer, problem) {
    const isCorrect = String(chosenAnswer).trim() === String(problem.answer).trim();

    if (isCorrect) {
      if (window.kidSounds) {
        window.kidSounds.playSuccessFanfare();
      }
      if (window.kidConfetti) {
        const rect = btn.getBoundingClientRect();
        window.kidConfetti.burst(rect.left + rect.width / 2, rect.top + rect.height / 2, 80);
      }

      btn.classList.add('correct');
      mathResultMsg.innerText = '🎉 SUPERSTAR! You got it right! 🎉';
      mathResultMsg.className = 'math-result-message success';

      // Disable other buttons
      const allBtns = mathOptionsGrid.querySelectorAll('button');
      allBtns.forEach(b => {
        b.style.pointerEvents = 'none';
        if (b !== btn) b.style.opacity = '0.5';
      });

      // Send result to parent
      socket.emit('kid:submit_math', {
        problemId: problem.id,
        answerChosen: chosenAnswer,
        isCorrect: true,
        correctAnswer: problem.answer
      });

      // Resume video automatically after 2.2 seconds celebration!
      setTimeout(() => {
        hideMathInterruption(true);
      }, 2200);

    } else {
      if (window.kidSounds) window.kidSounds.playBoing();
      btn.classList.add('wrong');
      mathResultMsg.innerText = '⭐ Keep trying! You can do it! ⭐';
      mathResultMsg.className = 'math-result-message';

      socket.emit('kid:submit_math', {
        problemId: problem.id,
        answerChosen: chosenAnswer,
        isCorrect: false,
        correctAnswer: problem.answer
      });

      setTimeout(() => {
        btn.classList.remove('wrong');
      }, 600);
    }
  }

  function hideMathInterruption(resumeVideo = false) {
    mathOverlay.classList.add('hidden');
    currentProblem = null;
    if (resumeVideo) {
      video.play().catch(e => console.log('Resume blocked:', e));
    }
  }

  // =================== Text-To-Speech (TTS) Prompts ===================

  let lastTtsData = null;

  socket.on('tts:prompt', (ttsData) => {
    speakPrompt(ttsData);
  });

  function speakPrompt(data) {
    lastTtsData = data;
    const text = data.text || 'Finish your food!';
    const avatar = data.avatar || '🤖';

    // 1. Play prompt alert sound via Web Audio API
    if (window.kidSounds) {
      window.kidSounds.ensureContext();
      window.kidSounds.playPromptAlert();
    }

    // 2. Display Toast Banner with text and mascot
    ttsAvatar.innerText = avatar;
    ttsText.innerText = text;
    ttsToast.classList.remove('hidden');

    // 3. Audio Session management for iOS / iPad:
    // IMPORTANT: On iOS, video.volume is read-only and ignored!
    // A playing <video> element captures the audio session, causing iOS to silence SpeechSynthesis!
    // We must pause and mute the video while speaking so iOS gives priority to speech!
    const wasPlaying = !video.paused && !video.ended;
    const originalMuted = video.muted;
    savedVolume = video.volume;

    video.muted = true;
    if (wasPlaying) {
      video.pause();
    }

    // 4. Primary: High-fidelity natural voice audio via HTML5 Audio element
    // Works 100% reliably on iPad/iPhone/iOS Safari by streaming actual spoken MP3 audio!
    if (ttsAudio) {
      try {
        const audioUrl = `/api/tts-audio?text=${encodeURIComponent(text)}`;
        ttsAudio.src = audioUrl;
        ttsAudio.volume = 1.0;

        let hasFinished = false;
        const finishAudio = () => {
          if (hasFinished) return;
          hasFinished = true;
          dismissTtsToast(wasPlaying, originalMuted);
        };

        ttsAudio.onended = () => {
          setTimeout(finishAudio, 800);
        };

        ttsAudio.onerror = (e) => {
          console.warn('Audio stream error, falling back to Web Speech:', e);
          fallbackToSpeechSynthesis(text, data, wasPlaying, originalMuted);
        };

        // Watchdog timeout in case audio hangs
        setTimeout(finishAudio, Math.max(6000, text.length * 200));

        // Wait 300ms for the doorbell chime to finish before speech starts
        setTimeout(() => {
          ttsAudio.play().catch(playErr => {
            console.warn('Audio play blocked, trying Web Speech fallback:', playErr);
            fallbackToSpeechSynthesis(text, data, wasPlaying, originalMuted);
          });
        }, 350);

        return;
      } catch (e) {
        console.warn('Audio setup error:', e);
      }
    }

    // Secondary fallback: Web Speech API
    fallbackToSpeechSynthesis(text, data, wasPlaying, originalMuted);
  }

  function fallbackToSpeechSynthesis(text, data, wasPlaying, originalMuted) {
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        window.speechSynthesis.resume();

        const utterance = new SpeechSynthesisUtterance(text);
        window._activeTtsUtterance = utterance;
        utterance.lang = 'en-US';
        utterance.pitch = data.pitch || 1.15;
        utterance.rate = data.rate || 0.95;
        utterance.volume = 1.0;

        const voices = availableVoices.length > 0 ? availableVoices : window.speechSynthesis.getVoices();
        if (voices && voices.length > 0) {
          const preferredVoice = voices.find(v => (v.lang === 'en-US' || v.lang.startsWith('en')));
          if (preferredVoice) utterance.voice = preferredVoice;
        }

        let hasFinished = false;
        const finish = () => {
          if (hasFinished) return;
          hasFinished = true;
          window._activeTtsUtterance = null;
          dismissTtsToast(wasPlaying, originalMuted);
        };

        utterance.onend = () => setTimeout(finish, 800);
        utterance.onerror = () => setTimeout(finish, 1200);
        setTimeout(finish, Math.max(5000, text.length * 180));

        window.speechSynthesis.speak(utterance);
        window.speechSynthesis.resume();
      } catch (err) {
        setTimeout(() => dismissTtsToast(wasPlaying, originalMuted), 3500);
      }
    } else {
      setTimeout(() => dismissTtsToast(wasPlaying, originalMuted), 3500);
    }
  }

  function dismissTtsToast(resumeVideo = false, restoreMuted = false) {
    ttsToast.classList.add('hidden');
    video.muted = restoreMuted;
    video.volume = savedVolume;
    if (resumeVideo) {
      video.play().catch(e => console.log('Resume blocked:', e));
    }
  }

  // Tapping the toast or repeat button allows user to replay the voice on iPad with direct user interaction
  const btnTtsReplay = document.getElementById('btn-tts-replay');
  if (btnTtsReplay) {
    btnTtsReplay.addEventListener('click', (e) => {
      e.stopPropagation();
      if (lastTtsData) speakPrompt(lastTtsData);
    });
  }
  ttsToast.addEventListener('click', () => {
    if (lastTtsData) speakPrompt(lastTtsData);
  });

})();
