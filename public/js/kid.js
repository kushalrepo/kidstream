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

  // =================== Initial Setup & Audio Unlock ===================

  btnStart.addEventListener('click', () => {
    // Unlock Web Audio context
    if (window.kidSounds) {
      window.kidSounds.ensureContext();
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
    try {
      const constraints = {
        video: {
          width: { ideal: 320 },
          height: { ideal: 240 },
          frameRate: { ideal: 15 }
        },
        audio: false
      };

      camStream = await navigator.mediaDevices.getUserMedia(constraints);
      camVideo.srcObject = camStream;
      camIndicator.innerText = '📷 Cam Live';
      camIndicator.style.color = '#00e676';

      // Start streaming frames to parents via Socket (5 frames per sec - fast, smooth, universal)
      if (camInterval) clearInterval(camInterval);
      camInterval = setInterval(() => {
        if (camVideo.readyState >= 2) {
          camCtx.drawImage(camVideo, 0, 0, camCanvas.width, camCanvas.height);
          const frameData = camCanvas.toDataURL('image/jpeg', 0.6);
          socket.emit('kid:camera_frame', frameData);
        }
      }, 200);

    } catch (err) {
      console.warn('Camera access denied or unavailable:', err);
      camIndicator.innerText = '📷 Cam Off';
      camIndicator.style.color = '#ff8a80';
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

  socket.on('tts:prompt', (ttsData) => {
    speakPrompt(ttsData);
  });

  function speakPrompt(data) {
    const text = data.text || 'Finish your food!';
    const avatar = data.avatar || '🤖';

    // Dip video volume
    savedVolume = video.volume;
    video.volume = Math.max(0.05, savedVolume * 0.15);

    // Play prompt alert sound
    if (window.kidSounds) window.kidSounds.playPromptAlert();

    // Display Toast Banner
    ttsAvatar.innerText = avatar;
    ttsText.innerText = text;
    ttsToast.classList.remove('hidden');

    // Use Web Speech Synthesis API
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // clear previous
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.pitch = data.pitch || 1.15; // slightly cheerful & child-friendly
      utterance.rate = data.rate || 0.95;

      // Select female or natural voice if available
      const voices = window.speechSynthesis.getVoices();
      const preferredVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Zira')));
      if (preferredVoice) utterance.voice = preferredVoice;

      utterance.onend = () => {
        setTimeout(dismissTtsToast, 1200);
      };

      utterance.onerror = () => {
        setTimeout(dismissTtsToast, 2500);
      };

      window.speechSynthesis.speak(utterance);
    } else {
      setTimeout(dismissTtsToast, 3500);
    }
  }

  function dismissTtsToast() {
    ttsToast.classList.add('hidden');
    video.volume = savedVolume;
  }

})();
