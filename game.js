/* ===========================================================
   Tippy Tiles — Piano Tiles for Toddlers
   - 4 columns of big, bright tiles drift down gently.
   - Tap a tile: it pops, plays a happy piano note, sparkles,
     and the star count goes up.
   - HOLD a tile: the note keeps ringing until the finger lifts.
   - Song mode: each tap plays the next note of a nursery tune,
     and the lowest tile glows to show what to tap next.
   - Forgiving by design: no timing windows, no "game over".
     Missed tiles just float away with no penalty.
   =========================================================== */

(() => {
  "use strict";

  const COLS = 4;
  const COLORS = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--c6)"];
  const FACES = ["🐶", "🐱", "🐰", "🐸", "🐥", "🦄", "🐧", "🐼", "🦊", "🐮", "🐵", "🐠", "⭐", "🌈", "🍓", "🎈"];
  const PRAISE = ["Yay!", "Wow!", "Nice!", "Woohoo!", "Great!", "Cool!", "Yippee!", "Bravo!"];

  // Note-name -> frequency (Hz), one gentle octave-and-a-bit.
  const NOTE = {
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
    C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0, C6: 1046.5,
  };

  // Free-play: each column always sounds a friendly C-major pentatonic note
  // (no "wrong"-sounding notes), so any order sounds nice together.
  const COLUMN_NOTES = [NOTE.C5, NOTE.D5, NOTE.E5, NOTE.G5];

  // Nursery melodies — each tap plays the next note, looping.
  const SONGS = {
    free:    { label: "🎲 Free play", notes: null },
    twinkle: { label: "⭐ Twinkle", notes: [
      "C4","C4","G4","G4","A4","A4","G4","F4","F4","E4","E4","D4","D4","C4",
      "G4","G4","F4","F4","E4","E4","D4","G4","G4","F4","F4","E4","E4","D4",
      "C4","C4","G4","G4","A4","A4","G4","F4","F4","E4","E4","D4","D4","C4"] },
    mary:    { label: "🐑 Mary's Lamb", notes: [
      "E4","D4","C4","D4","E4","E4","E4","D4","D4","D4","E4","G4","G4",
      "E4","D4","C4","D4","E4","E4","E4","E4","D4","D4","E4","D4","C4"] },
    row:     { label: "🚣 Row Your Boat", notes: [
      "C4","C4","C4","D4","E4","E4","D4","E4","F4","G4",
      "C5","C5","C5","G4","G4","G4","E4","E4","E4","C4","C4","C4",
      "G4","F4","E4","D4","C4"] },
    macdonald: { label: "🐄 Old MacDonald", notes: [
      "G4","G4","G4","D4","E4","E4","D4","B4","B4","A4","A4","G4",
      "D4","G4","G4","G4","D4","E4","E4","D4","B4","B4","A4","A4","G4"] },
  };

  // Speed in pixels/second and spawn gap (ms) per mode.
  const MODES = {
    relaxed: { speed: 95,  gap: 1150 },
    normal:  { speed: 165, gap: 820  },
  };

  // How long (seconds) a long tile must be held for its fill to complete.
  const HOLD_TIME = 1.2;

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
  let songKey = "free";
  let songIndex = 0;
  let score = 0;
  let running = false;
  let soundOn = true;
  let tiles = [];          // active tile objects
  let lastTime = 0;
  let sinceSpawn = 0;
  let rafId = 0;
  let colWidth = 0, tileH = 0, boardH = 0;
  let glowTile = null;

  // ---------------------------------------------------------
  // Audio (Web Audio API — no asset files needed)
  // ---------------------------------------------------------
  let actx = null;
  const voices = new Map();     // pointerId -> sustained voice
  const heldTiles = new Map();  // pointerId -> long tile currently being held
  const MAX_SUSTAIN = 8;        // safety: auto-release after 8s if a lift is missed

  function audio() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) actx = new AC();
    }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }

  // Start a sustained, bell-like "piano-ish" tone that holds until released.
  function startVoice(pointerId, freq) {
    if (!soundOn) return;
    const ac = audio();
    if (!ac) return;
    if (voices.has(pointerId)) stopVoice(pointerId);
    const t = ac.currentTime;

    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.45, t + 0.02); // quick attack
    gain.gain.setTargetAtTime(0.3, t + 0.02, 0.8);          // settle to a gentle sustain
    gain.connect(ac.destination);

    const oscs = [[freq, "triangle", 0.6], [freq * 2, "sine", 0.25]].map(([f, type, vol]) => {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = type;
      osc.frequency.value = f;
      g.gain.value = vol;
      osc.connect(g);
      g.connect(gain);
      osc.start(t);
      return osc;
    });

    const safety = setTimeout(() => stopVoice(pointerId), MAX_SUSTAIN * 1000);
    voices.set(pointerId, { ac, gain, oscs, safety });
  }

  // Release a held note with a short, soft fade.
  function stopVoice(pointerId) {
    const v = voices.get(pointerId);
    if (!v) return;
    voices.delete(pointerId);
    clearTimeout(v.safety);
    const t = v.ac.currentTime;
    v.gain.gain.cancelScheduledValues(t);
    const cur = Math.max(v.gain.gain.value, 0.0001);
    v.gain.gain.setValueAtTime(cur, t);
    v.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28); // release
    v.oscs.forEach((o) => o.stop(t + 0.32));
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

  // Release every held note (used when leaving the game).
  function stopAllVoices() {
    for (const id of Array.from(voices.keys())) stopVoice(id);
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

    // Every so often spawn a LONG tile: taller, meant to be pressed and held
    // as it slides by (like the hold notes in classic Piano Tiles).
    const long = Math.random() < 0.32;
    const h = long ? tileH * 2.1 : tileH;

    const idx = (nextId - 1) % COLORS.length;
    const el = document.createElement("div");
    el.className = long ? "tile long" : "tile";
    el.style.width = (colWidth - 14) + "px";
    el.style.height = h + "px";
    el.style.left = (col * colWidth + 7) + "px";
    el.style.background = COLORS[idx];
    el.style.transform = `translateY(${-h}px)`;

    const face = document.createElement("span");
    face.className = "face";
    face.textContent = songKey === "free"
      ? FACES[Math.floor(Math.random() * FACES.length)]
      : "🎵";
    el.appendChild(face);

    let fill = null;
    if (long) {
      // a rising "fill" that shows how much of the hold is done
      fill = document.createElement("div");
      fill.className = "fill";
      el.appendChild(fill);
      // a little "hold me" grip hint running down the tile
      const grip = document.createElement("span");
      grip.className = "grip";
      grip.textContent = "⋮";
      el.appendChild(grip);
    }

    const tile = { id: nextId++, el, y: -h, h, col, long, fill, progress: 0, dead: false, heldBy: null };
    el.addEventListener("pointerdown", (e) => { e.preventDefault(); onPress(tile, e.pointerId); }, { passive: false });

    board.appendChild(el);
    tiles.push(tile);
  }

  // Decide which note a tapped tile should sound.
  function noteFor(tile) {
    if (songKey === "free") return COLUMN_NOTES[tile.col % COLUMN_NOTES.length];
    const seq = SONGS[songKey].notes;
    const name = seq[songIndex % seq.length];
    songIndex++;
    return NOTE[name];
  }

  function onPress(tile, pointerId) {
    if (tile.dead) return;
    startVoice(pointerId, noteFor(tile));
    addScore();

    if (tile.long) {
      // Don't pop yet — keep it on screen and sounding while the finger holds.
      // A fill rises until it's full; completing it is the little "win".
      tile.heldBy = pointerId;
      heldTiles.set(pointerId, tile);
      tile.el.classList.remove("glow");
      tile.el.classList.add("held");
      return;
    }

    // Short tile: instant pop. The note still rings until the finger lifts.
    tile.dead = true;
    if (tile === glowTile) glowTile = null;
    tile.el.classList.remove("glow");
    tile.el.classList.add("tapped");
    burst(tile);
    setTimeout(() => tile.el.remove(), 340);
  }

  // Finger/mouse lifted: release the note and pop any long tile it was holding.
  function onRelease(pointerId) {
    stopVoice(pointerId);
    const tile = heldTiles.get(pointerId);
    if (tile) {
      heldTiles.delete(pointerId);
      releaseLong(tile);
    }
  }

  // Let go before the fill was full — no penalty, just a gentle pop.
  function releaseLong(tile) {
    if (tile.dead) return;
    tile.dead = true;
    tile.heldBy = null;
    if (tile === glowTile) glowTile = null;
    tile.el.classList.remove("held", "glow");
    tile.el.classList.add("tapped");
    burst(tile);
    setTimeout(() => tile.el.remove(), 340);
  }

  // The fill reached the top — the hold is complete! Celebrate.
  function completeLong(tile) {
    if (tile.dead) return;
    tile.dead = true;
    const pid = tile.heldBy;
    tile.heldBy = null;
    if (pid !== null) { heldTiles.delete(pid); stopVoice(pid); }
    if (tile === glowTile) glowTile = null;
    if (tile.fill) tile.fill.style.height = "100%";
    tile.el.classList.remove("held", "glow");
    tile.el.classList.add("done");
    addScore(); addScore();      // a couple of bonus stars for finishing
    chime();
    // a bigger sparkle shower for completing the whole tile
    const r = tile.el.getBoundingClientRect();
    sparkleAt(r.left + r.width / 2, r.top + r.height / 2, 10, 80);
    setTimeout(() => tile.el.remove(), 380);
  }

  // a bright little "ding" when a long tile is completed
  function chime() {
    if (!soundOn) return;
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime;
    [NOTE.C6, NOTE.E5].forEach((f, i) => {
      const osc = ac.createOscillator(), g = ac.createGain();
      osc.type = "sine"; osc.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.05);
      g.gain.exponentialRampToValueAtTime(0.35, t + i * 0.05 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.05 + 0.5);
      osc.connect(g); g.connect(ac.destination);
      osc.start(t + i * 0.05); osc.stop(t + i * 0.05 + 0.55);
    });
  }

  const SPARK_BITS = ["✨", "⭐", "🌟", "💫", "🎉"];
  function sparkleAt(cx, cy, n, spread) {
    for (let i = 0; i < n; i++) {
      const s = document.createElement("div");
      s.className = "spark";
      s.textContent = SPARK_BITS[Math.floor(Math.random() * SPARK_BITS.length)];
      const ang = (Math.PI * 2 * i) / n + Math.random();
      const dist = spread + Math.random() * 50;
      s.style.left = cx + "px";
      s.style.top = cy + "px";
      s.style.setProperty("--dx", Math.cos(ang) * dist + "px");
      s.style.setProperty("--dy", Math.sin(ang) * dist + "px");
      s.style.setProperty("--rot", (Math.random() * 360 - 180) + "deg");
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 720);
    }
  }

  function burst(tile) {
    const r = tile.el.getBoundingClientRect();
    sparkleAt(r.left + r.width / 2, r.top + r.height / 2, 6, 70);
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

  // In song mode, glow the lowest tile so toddlers know what to tap next.
  function updateGlow() {
    if (songKey === "free") return;
    let lowest = null;
    for (const t of tiles) {
      if (t.dead) continue;
      if (!lowest || t.y > lowest.y) lowest = t;
    }
    if (lowest === glowTile) return;
    if (glowTile) glowTile.el.classList.remove("glow");
    glowTile = lowest;
    if (glowTile) glowTile.el.classList.add("glow");
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

      // A long tile being held fills up; when full, it's complete.
      if (tile.heldBy !== null) {
        tile.progress = Math.min(1, tile.progress + dt / HOLD_TIME);
        if (tile.fill) tile.fill.style.height = (tile.progress * 100) + "%";
        if (tile.progress >= 1) { completeLong(tile); continue; }
      }

      tile.y += dy;
      tile.el.style.transform = `translateY(${tile.y}px)`;
      if (tile.y > boardH) {
        // reached the bottom
        if (tile.heldBy !== null) {
          // held all the way down — count it as complete and celebrate
          completeLong(tile);
        } else {
          // untapped — no penalty, just drift away
          tile.dead = true;
          if (tile === glowTile) glowTile = null;
          tile.el.remove();
          playWhoosh();
        }
      }
    }
    tiles = tiles.filter((t) => !t.dead);
    updateGlow();

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
    songIndex = 0;
    glowTile = null;
    tiles.forEach((t) => t.el.remove());
    heldTiles.clear();
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
    stopAllVoices();
    tiles.forEach((t) => t.el.remove());
    heldTiles.clear();
    tiles = [];
    glowTile = null;
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

  document.querySelectorAll(".song-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".song-btn").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      songKey = btn.dataset.song;
    });
  });

  soundBtn.addEventListener("click", () => {
    soundOn = !soundOn;
    soundBtn.textContent = soundOn ? "🔊" : "🔇";
    if (!soundOn) stopAllVoices();
    else audio();
  });

  // Release a held note (and pop any held long tile) as soon as the
  // finger/mouse lifts — anywhere on screen.
  window.addEventListener("pointerup", (e) => onRelease(e.pointerId));
  window.addEventListener("pointercancel", (e) => onRelease(e.pointerId));

  // Keep little fingers from accidentally scrolling / zooming the page.
  document.addEventListener("gesturestart", (e) => e.preventDefault());
  document.addEventListener("dblclick", (e) => e.preventDefault(), { passive: false });
})();
