/* ===========================================================
   Tippy Tiles — Piano Tiles for Toddlers
   - 4 columns of big, bright tiles drift down gently.
   - Tap a tile: it pops, plays a happy piano note, sparkles,
     and the star count goes up.
   - Forgiving by design: no timing windows, no "game over".
     Missed tiles just float away with no penalty.
   =========================================================== */

(() => {
  "use strict";

  const COLS = 4;
  const COLORS = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--c6)"];
  const FACES = ["🐶", "🐱", "🐰", "🐸", "🐥", "🦄", "🐧", "🐼", "🦊", "🐮", "🐵", "🐠", "⭐", "🌈", "🍓", "🎈"];
  const PRAISE = ["Yay!", "Wow!", "Nice!", "Woohoo!", "Great!", "Cool!", "Yippee!", "Bravo!"];

  // A friendly C-major pentatonic scale (no "wrong"-sounding notes) — toddler-proof.
  const NOTES = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];

  // Speed in pixels/second and spawn gap (ms) per mode.
  const MODES = {
    relaxed: { speed: 95,  gap: 1150 },
    normal:  { speed: 165, gap: 820  },
  };

  // ---- DOM ----
  const $ = (id) => document.getElementById(id);
  const startScreen = $("start");
  const gameScreen  = $("game");
  const board       = $("board");
  const scoreEl     = $("score");
  const scoreNum    = $("scoreNum");
  const praiseEl    = $("praise");
  const soundBtn    = $("soundBtn");

  // ---- State ----
  let mode = "relaxed";
  let score = 0;
  let running = false;
  let soundOn = true;
  let tiles = [];          // active tile objects
  let lastTime = 0;
  let sinceSpawn = 0;
  let rafId = 0;
  let colWidth = 0, tileH = 0, boardH = 0;

  // ---------------------------------------------------------
  // Audio (Web Audio API — no asset files needed)
  // ---------------------------------------------------------
  let actx = null;
  function audio() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) actx = new AC();
    }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }
  function playNote(freq) {
    if (!soundOn) return;
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime;

    // Two oscillators for a soft, bell-like "piano-ish" tone.
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    gain.connect(ac.destination);

    [[freq, "triangle", 0.6], [freq * 2, "sine", 0.25]].forEach(([f, type, vol]) => {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = type;
      osc.frequency.value = f;
      g.gain.value = vol;
      osc.connect(g);
      g.connect(gain);
      osc.start(t);
      osc.stop(t + 0.95);
    });
  }
  function playWhoosh() {
    // gentle, non-scary sound when a tile floats away untapped
    if (!soundOn) return;
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(330, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.3);
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    osc.connect(g); g.connect(ac.destination);
    osc.start(t); osc.stop(t + 0.34);
  }

  // ---------------------------------------------------------
  // Layout
  // ---------------------------------------------------------
  function measure() {
    const r = board.getBoundingClientRect();
    boardH = r.height;
    colWidth = r.width / COLS;
    tileH = Math.min(colWidth * 1.15, boardH * 0.26);
  }
  window.addEventListener("resize", () => { if (running) measure(); });

  // ---------------------------------------------------------
  // Tiles
  // ---------------------------------------------------------
  let nextId = 1;
  let lastCol = -1;

  function spawnTile() {
    // pick a column that differs from the previous spawn so tiles spread out
    let col = Math.floor(Math.random() * COLS);
    if (col === lastCol) col = (col + 1 + Math.floor(Math.random() * (COLS - 1))) % COLS;
    lastCol = col;

    const idx = (nextId - 1) % COLORS.length;
    const el = document.createElement("div");
    el.className = "tile";
    el.style.width = (colWidth - 14) + "px";
    el.style.height = tileH + "px";
    el.style.left = (col * colWidth + 7) + "px";
    el.style.background = COLORS[idx];
    el.style.transform = `translateY(${-tileH}px)`;

    const face = document.createElement("span");
    face.className = "face";
    face.textContent = FACES[Math.floor(Math.random() * FACES.length)];
    el.appendChild(face);

    const tile = { id: nextId++, el, y: -tileH, col, note: NOTES[col % NOTES.length], dead: false };
    el.addEventListener("pointerdown", (e) => { e.preventDefault(); hitTile(tile); }, { passive: false });

    board.appendChild(el);
    tiles.push(tile);
  }

  function hitTile(tile) {
    if (tile.dead) return;
    tile.dead = true;
    tile.el.classList.add("tapped");
    playNote(tile.note);
    burst(tile);
    addScore();
    setTimeout(() => tile.el.remove(), 340);
  }

  function burst(tile) {
    const r = tile.el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const bits = ["✨", "⭐", "🌟", "💫", "🎉"];
    const n = 6;
    for (let i = 0; i < n; i++) {
      const s = document.createElement("div");
      s.className = "spark";
      s.textContent = bits[Math.floor(Math.random() * bits.length)];
      const ang = (Math.PI * 2 * i) / n + Math.random();
      const dist = 70 + Math.random() * 50;
      s.style.left = cx + "px";
      s.style.top = cy + "px";
      s.style.setProperty("--dx", Math.cos(ang) * dist + "px");
      s.style.setProperty("--dy", Math.sin(ang) * dist + "px");
      s.style.setProperty("--rot", (Math.random() * 360 - 180) + "deg");
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 720);
    }
  }

  function addScore() {
    score++;
    scoreNum.textContent = score;
    scoreEl.classList.remove("pop");
    void scoreEl.offsetWidth; // restart animation
    scoreEl.classList.add("pop");
    if (score % 10 === 0) showPraise();
  }

  function showPraise() {
    praiseEl.textContent = PRAISE[Math.floor(Math.random() * PRAISE.length)];
    praiseEl.classList.remove("show");
    void praiseEl.offsetWidth;
    praiseEl.classList.add("show");
  }

  // ---------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------
  function loop(now) {
    if (!running) return;
    if (!lastTime) lastTime = now;
    const dt = Math.min((now - lastTime) / 1000, 0.05); // clamp big gaps
    lastTime = now;

    const cfg = MODES[mode];
    const dy = cfg.speed * dt;

    for (const tile of tiles) {
      if (tile.dead) continue;
      tile.y += dy;
      tile.el.style.transform = `translateY(${tile.y}px)`;
      if (tile.y > boardH) {
        // floated past the bottom untapped — no penalty, just drift away
        tile.dead = true;
        tile.el.remove();
        playWhoosh();
      }
    }
    tiles = tiles.filter((t) => !t.dead);

    sinceSpawn += dt * 1000;
    if (sinceSpawn >= cfg.gap) {
      sinceSpawn = 0;
      spawnTile();
    }

    rafId = requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------
  // Screen control
  // ---------------------------------------------------------
  function startGame() {
    audio(); // unlock audio on the user gesture
    score = 0;
    scoreNum.textContent = "0";
    tiles.forEach((t) => t.el.remove());
    tiles = [];
    nextId = 1;
    lastCol = -1;
    lastTime = 0;
    sinceSpawn = 9999; // spawn first tile right away
    running = true;

    startScreen.classList.add("hidden");
    gameScreen.classList.remove("hidden");
    measure();
    rafId = requestAnimationFrame(loop);
  }

  function goHome() {
    running = false;
    cancelAnimationFrame(rafId);
    tiles.forEach((t) => t.el.remove());
    tiles = [];
    gameScreen.classList.add("hidden");
    startScreen.classList.remove("hidden");
  }

  // ---------------------------------------------------------
  // Wire up controls
  // ---------------------------------------------------------
  $("playBtn").addEventListener("click", startGame);
  $("homeBtn").addEventListener("click", goHome);

  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      mode = btn.dataset.mode;
    });
  });

  soundBtn.addEventListener("click", () => {
    soundOn = !soundOn;
    soundBtn.textContent = soundOn ? "🔊" : "🔇";
    if (soundOn) audio();
  });

  // Keep little fingers from accidentally scrolling / zooming the page.
  document.addEventListener("gesturestart", (e) => e.preventDefault());
  document.addEventListener("dblclick", (e) => e.preventDefault(), { passive: false });
})();
