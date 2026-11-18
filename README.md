# 🎈 KidStream - Smart Kids Video Player & Parental Remote Control

**KidStream** is a dual-screen web application designed specifically for parents to give their children an entertaining video watching experience while retaining **100% remote control** over playback, speed, learning interruptions, live camera monitoring, and direct voice prompts.

---

## 🌟 Key Features

### 📺 1. Kid's Fullscreen Video Screen (`/kid`)
- **Distraction-Free**: Plays videos smoothly without native player controls, preventing accidental pausing or skipping by the child.
- **📷 Live Camera Streamer**: Captures the child's front camera and streams it live to the parent's dashboard so you can monitor them in real time.
- **🧠 Playful Math Interruption Challenges**:
  - Colorful, animated childish graphics with adorable mascots (🦖 Dino, 🐱 Kitty, 🐶 Puppy, 🚀 Rocket).
  - Visual count items (Apples 🍎, Stars ⭐, Candies 🍬, Cute Animals 🐶) that young kids can count along with.
  - Large, bouncy, candy-colored answer buttons.
  - Procedural sound effects (synthesized with Web Audio API) & celebratory confetti bursts upon correct answers!
  - Auto-resumes video after solving.
- **📢 Voice Prompts (Text-to-Speech)**:
  - When parents send a voice reminder, the video audio automatically ducks, a friendly animated mascot banner pops up, and your message is spoken aloud through the device's speakers (e.g., *"Finish the food!"*).

---

### 🎛️ 2. Parent Control Center (`/parent`)
- **📷 Live Kid Cam Monitor**:
  - Live webcam feed of your child watching the screen in real-time.
  - Snapshot button to take quick photos of your kid.
  - Fullscreen view.
- **🎛️ Master Playback Remote**:
  - Play ▶️ / Pause ⏸️ / Stop ⏹️.
  - Timeline scrub bar with synchronized current time and duration.
  - Quick seek (⏪ Rewind 10s / ⏩ Forward 10s).
  - **⚡ Playback Speed Control**: Quick presets (`0.25x`, `0.5x`, `0.75x`, `1.0x`, `1.25x`, `1.5x`, `2.0x`) and fine-tuning slider.
  - Remote volume slider.
- **🧠 Math Interruption Station**:
  - Quick presets: Addition (1-5, 1-10), Subtraction (1-5, 1-10), Multiplication (x2, x3), or Random mix.
  - Custom question creator: Type any custom question with correct and distractor answers.
  - Theme selector: Sweet Fruits 🍎, Shiny Stars ⭐, Cute Animals 🐱, Candies 🍬.
  - Auto-Interrupt Timer: Automatically pause and challenge the kid every 2, 5, 10, or 15 minutes!
  - Live feedback: See whether your child answered correctly or is still trying, with an instant "Resume Video" button.
- **📢 Text-to-Speech (TTS) Intercom**:
  - Quick 1-click prompts:
    - 🥦 *"Finish your food!"*
    - 🥪 *"Take another bite!"*
    - 🥛 *"Drink your water or milk!"*
    - 📏 *"Sit back from the screen!"*
    - 🪑 *"Sit up straight!"*
    - ⏰ *"5 more minutes, then bedtime!"*
    - ⭐ *"You are doing great!"*
    - 🧼 *"Pause and wash hands!"*
  - Custom text input box with choice of friendly mascot voices and pitch control.
- **🎬 Video Library & Uploader**:
  - Lists all videos in the `videos/` folder (including your existing video `vidssave.com YTB_1786229931183 360P.mp4`).
  - One-click **"Play on Kid's Screen"** button to instantly change what's playing.
  - Drag-and-drop video uploader with live upload progress bar (supports MP4, WebM, MKV, MOV up to 2GB).

---

## 🚀 How to Run

1. Open a terminal in `D:\kusha\kidstream`.
2. Start the server:
   ```bash
   node server.js
   ```
3. Open the URLs in your browser:
   - **Portal / Home Page**: `http://localhost:3000/`
   - **Kid's Screen**: `http://localhost:3000/kid`
   - **Parent Dashboard**: `http://localhost:3000/parent`

### 📱 Instant Phone Connection via QR Code
Simply open `http://localhost:3000/` on your computer. A prominent **QR Code** is displayed right in the center of the main page!
1. Point your phone camera at the QR code.
2. Tap the link popup.
3. Your mobile phone immediately connects as the Parent Remote Control!
