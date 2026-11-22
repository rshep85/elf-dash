'use strict';

/* ==========================================================================
   ELF DASH: a Christmas lane-runner for kids.
   Plain JavaScript + <canvas>. No build step, no libraries.
   ========================================================================== */

// ----- Settings you might want to tweak ------------------------------------
const W = 960, H = 540;          // logical canvas size (scaled to fit the screen)
const HORIZON = 200;             // y of the horizon line
const PLAYER_Y = 470;            // y of the elf's feet
const FOCAL = 6;                 // perspective strength
const SPAWN_Z = 110;             // how far ahead new things appear
const LANE_W = 200;              // lane spacing at the elf's depth
const ROAD_HALF = 310;           // half the road width at the elf's depth

const START_LIVES = 5;
const MAX_LIVES = 9;
const INVULN_TIME = 1.6;         // seconds of flashing safety after a hit
const BOOST_TIME = 3;            // seconds a sleigh boost lasts
const BOOST_MUL = 1.55;          // how much faster the boost is
const JUMP_V = 820;              // jump strength
const GRAVITY = 2600;
const JUMP_CLEAR = 40;           // feet must be this high to clear low hazards
const LANE_SPEED = 9;            // lanes per second when switching
const STREAK_FOR_BONUS = 5;      // good things in a row to get x2
const LEVEL_BONUS = 25;          // points x level number when a level is cleared

const DIFFICULTY = {
  easy:   { label: 'Easy',   speed: 20, gap: 15, hazardChance: 0.55, doubleChance: 0,
            candyChance: 0.016, weights: { present: 0.45, snowball: 0.4, grumple: 0.15 } },
  medium: { label: 'Medium', speed: 26, gap: 12, hazardChance: 0.7,  doubleChance: 0.3,
            candyChance: 0.011, weights: { present: 0.38, snowball: 0.37, grumple: 0.25 } },
  hard:   { label: 'Hard',   speed: 32, gap: 10, hazardChance: 0.82, doubleChance: 0.45,
            candyChance: 0.008, weights: { present: 0.34, snowball: 0.33, grumple: 0.33 } },
};

const LEVELS = [
  { name: 'Candy Cane Lane', length: 1400, speedMul: 1.0,  gapMul: 1.0,  theme: 'village',  song: 'jingle' },
  { name: 'Frosty Forest',   length: 1700, speedMul: 1.12, gapMul: 0.93, theme: 'forest',   song: 'deck' },
  { name: 'Rooftop Run',     length: 2000, speedMul: 1.24, gapMul: 0.86, theme: 'rooftops', song: 'wish' },
];

const THEMES = {
  village: {
    skyTop: '#6fc3ef', skyBottom: '#d9f1ff', ground: '#f3f9ff', road: '#bcd3e6',
    stripe: '#ffffff', curbA: '#e23b3b', curbB: '#ffffff', fog: '235,246,255',
    scenery: ['pine', 'pine', 'lamp', 'cottage', 'snowman'], pine: '#1f7a4d', lights: true,
  },
  forest: {
    skyTop: '#41307e', skyBottom: '#f7a76c', ground: '#eaf2f8', road: '#a9bdd6',
    stripe: '#ffffff', curbA: '#2fa84f', curbB: '#ffffff', fog: '240,214,200',
    scenery: ['pine', 'pine', 'pine', 'pine', 'snowman'], pine: '#17603d', lights: false,
  },
  rooftops: {
    skyTop: '#081238', skyBottom: '#28408a', ground: '#a9b8d8', road: '#8f3d35',
    stripe: '#ffd34d', curbA: '#ffd34d', curbB: '#e23b3b', fog: '70,90,160',
    scenery: ['chimney', 'chimney', 'pine', 'lamp'], pine: '#1f7a4d', lights: true, tiles: true,
  },
};

const OUT = '#1b2a1f';           // outline colour for the vector look
const BAUBLE_COLORS = ['#e23b3b', '#f5b400', '#2f7de1', '#c13fd6', '#2fa84f'];
const HAZARDS = new Set(['present', 'snowball', 'grumple']);

// ----- Small helpers -------------------------------------------------------
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function weightedPick(weights) {
  let r = Math.random() * Object.values(weights).reduce((s, v) => s + v, 0);
  for (const [k, v] of Object.entries(weights)) { r -= v; if (r <= 0) return k; }
  return Object.keys(weights)[0];
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch (e) { /* private mode etc. */ }
  return null;
}

// ----- Player names (same rules as netlify/functions/scores.mjs) -----------
const BLOCK_PARTS = ['fuck', 'shit', 'cunt', 'bitch', 'nigg', 'fagg', 'slut', 'whore', 'wank',
  'twat', 'porn', 'cock', 'penis', 'nazi', 'hitler', 'dildo'];
const BLOCK_WORDS = ['ass', 'arse', 'dick', 'fag', 'sex', 'butt', 'poo', 'poop', 'pee', 'willy',
  'boob', 'boobs', 'tits', 'hell', 'damn', 'crap'];
function cleanName(raw) {
  return String(raw || '').replace(/[^A-Za-z0-9 _-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12);
}
function nameIsRude(name) {
  const low = name.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e')
    .replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't');
  const squashed = low.replace(/[^a-z]/g, '');
  if (BLOCK_PARTS.some((p) => squashed.includes(p))) return true;
  return low.split(/[^a-z]+/).filter(Boolean).some((w) => BLOCK_WORDS.includes(w));
}
function validateName(raw) {
  const name = cleanName(raw);
  if (!name) return { ok: false, message: 'Please type a name (letters and numbers).' };
  if (nameIsRude(name)) return { ok: false, message: "Hmm, let's pick a different name!" };
  return { ok: true, name };
}

// ==========================================================================
//  MUSIC + SOUND (all generated live with the Web Audio API)
// ==========================================================================
const NOTE_INDEX = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
function noteNum(name) {
  const m = /^([A-G]#?)(\d)$/.exec(name);
  return 12 * (parseInt(m[2], 10) + 1) + NOTE_INDEX[m[1]];
}
function seq(str) {
  return str.trim().split(/\s+/).map((tok) => {
    const [n, b] = tok.split(':');
    return [n === 'R' ? null : noteNum(n), parseFloat(b)];
  });
}
function bassLine(roots, beatsPerBar) {
  const pattern = beatsPerBar === 3 ? [0, 7, 12] : [0, 7, 12, 7];
  const out = [];
  for (const r of roots) { const m = noteNum(r); for (const p of pattern) out.push([m + p, 1]); }
  return out;
}

// Traditional carols (public domain), arranged chiptune-style.
const JINGLE = seq(`
  E5:1 E5:1 E5:2  E5:1 E5:1 E5:2  E5:1 G5:1 C5:1.5 D5:0.5  E5:4
  F5:1 F5:1 F5:1.5 F5:0.5  F5:1 E5:1 E5:1 E5:0.5 E5:0.5  E5:1 D5:1 D5:1 E5:1  D5:2 G5:2
  E5:1 E5:1 E5:2  E5:1 E5:1 E5:2  E5:1 G5:1 C5:1.5 D5:0.5  E5:4
  F5:1 F5:1 F5:1.5 F5:0.5  F5:1 E5:1 E5:1 E5:0.5 E5:0.5  G5:1 G5:1 F5:1 D5:1  C5:4`);
const JINGLE_CHORDS = ['C3', 'C3', 'C3', 'C3', 'F3', 'C3', 'D3', 'G2', 'C3', 'C3', 'C3', 'C3', 'F3', 'C3', 'G2', 'C3'];

const DECK_LINE = `G5:1.5 F5:0.5 E5:1 D5:1  C5:1 D5:1 E5:1 C5:1
  D5:0.5 E5:0.5 F5:0.5 D5:0.5 E5:1.5 D5:0.5  C5:1 B4:1 C5:2`;
const DECK = seq(`${DECK_LINE} ${DECK_LINE}
  D5:1.5 E5:0.5 F5:1 D5:1  E5:1.5 F5:0.5 G5:1 D5:1
  E5:0.5 F#5:0.5 G5:1 A5:0.5 B5:0.5 C6:1  B5:1 A5:1 G5:2
  G5:1.5 F5:0.5 E5:1 D5:1  C5:1 D5:1 E5:1 C5:1
  A5:0.5 A5:0.5 A5:0.5 A5:0.5 G5:1.5 F5:0.5  E5:1 D5:1 C5:2`);
const DECK_CHORDS = ['C3', 'C3', 'G2', 'C3', 'C3', 'C3', 'G2', 'C3', 'G2', 'C3', 'D3', 'G2', 'C3', 'C3', 'F3', 'C3'];

const WISH = seq(`
  G5:1 G5:0.5 A5:0.5 G5:0.5 F#5:0.5  E5:1 E5:1 E5:1
  A5:1 A5:0.5 B5:0.5 A5:0.5 G5:0.5  F#5:1 D5:1 D5:1
  B5:1 B5:0.5 C6:0.5 B5:0.5 A5:0.5  G5:1 E5:1 D5:0.5 D5:0.5
  E5:1 A5:1 F#5:1  G5:2 D5:1`);
const WISH_CHORDS = ['G2', 'C3', 'A2', 'D3', 'B2', 'E3', 'D3', 'G2'];

const SONGS = {
  title:  { bpm: 128, melody: JINGLE, bass: bassLine(JINGLE_CHORDS, 4) },
  jingle: { bpm: 168, melody: JINGLE, bass: bassLine(JINGLE_CHORDS, 4) },
  deck:   { bpm: 156, melody: DECK,   bass: bassLine(DECK_CHORDS, 4) },
  wish:   { bpm: 176, melody: WISH,   bass: bassLine(WISH_CHORDS, 3) },
};

const Sound = (() => {
  let ac = null, master, musicBus, sfxBus, noiseBuf;
  let muted = store('elfdash-muted') === '1';
  let song = null, timer = null, mIdx = 0, bIdx = 0, mT = 0, bT = 0, hT = 0;
  const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);

  function ensure() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = muted ? 0 : 0.6;
      master.connect(ac.destination);
      musicBus = ac.createGain(); musicBus.gain.value = 0.3; musicBus.connect(master);
      sfxBus = ac.createGain(); sfxBus.gain.value = 0.55; sfxBus.connect(master);
      noiseBuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.5), ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended' && state !== 'paused') ac.resume();
    return true;
  }

  function tone(dest, type, freq, t, dur, vol, slideTo) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.03);
  }

  function noise(dest, t, dur, vol, highpass) {
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = noiseBuf;
    f.type = 'highpass'; f.frequency.value = highpass;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t); src.stop(t + dur + 0.03);
  }

  function schedule() {
    if (!song || !ac) return;
    const ahead = ac.currentTime + 0.2, spb = 60 / song.bpm;
    while (mT < ahead) {
      const [n, b] = song.melody[mIdx];
      if (n !== null) tone(musicBus, 'square', hz(n), mT, Math.max(0.06, b * spb * 0.85), 0.16);
      mT += b * spb; mIdx = (mIdx + 1) % song.melody.length;
    }
    while (bT < ahead) {
      const [n, b] = song.bass[bIdx];
      if (n !== null) tone(musicBus, 'triangle', hz(n), bT, b * spb * 0.9, 0.4);
      bT += b * spb; bIdx = (bIdx + 1) % song.bass.length;
    }
    while (hT < ahead) {
      noise(musicBus, hT, 0.035, 0.07, 7000);
      hT += spb / 2;
    }
  }

  function playSong(name) {
    if (!ensure()) return;
    if (song === SONGS[name] && timer) return;
    stopSong();
    song = SONGS[name];
    mIdx = bIdx = 0;
    mT = bT = hT = ac.currentTime + 0.08;
    timer = setInterval(schedule, 30);
    schedule();
  }

  function stopSong() {
    clearInterval(timer);
    timer = null;
    song = null;
  }

  function sfx(name) {
    if (!ensure()) return;
    const t = ac.currentTime + 0.01, S = sfxBus;
    const run = (notes, type, step, dur, vol) =>
      notes.forEach((n, i) => tone(S, type, hz(n), t + i * step, dur, vol));
    switch (name) {
      case 'bauble': run([84, 91], 'square', 0.06, 0.09, 0.11); break;
      case 'santa': run([84, 88, 91, 96], 'square', 0.05, 0.1, 0.11); break;
      case 'candy': run([84, 88, 91, 96, 100, 103], 'triangle', 0.05, 0.16, 0.25); break;
      case 'streak': run([79, 84, 88, 91, 96], 'square', 0.07, 0.12, 0.12); break;
      case 'jump': tone(S, 'square', 300, t, 0.16, 0.08, 760); break;
      case 'lane': tone(S, 'triangle', 520, t, 0.06, 0.08, 720); break;
      case 'boost': tone(S, 'sawtooth', 180, t, 0.45, 0.1, 1100); noise(S, t, 0.4, 0.08, 2000); break;
      case 'hit': tone(S, 'sawtooth', 260, t, 0.35, 0.16, 55); noise(S, t, 0.25, 0.2, 800); break;
      case 'level': run([72, 76, 79, 84], 'square', 0.13, 0.2, 0.13); tone(S, 'square', hz(84), t + 0.52, 0.6, 0.12); break;
      case 'victory': run([72, 76, 79, 84, 79, 84, 88, 91, 96], 'square', 0.11, 0.18, 0.13); break;
      case 'gameover': run([67, 64, 60, 55], 'square', 0.22, 0.26, 0.12); break;
      case 'click': tone(S, 'square', hz(84), t, 0.05, 0.06); break;
    }
  }

  return {
    ensure, playSong, stopSong, sfx,
    pause() { if (ac) ac.suspend(); },
    resume() { if (ac) ac.resume(); },
    isMuted: () => muted,
    toggleMute() {
      muted = !muted;
      store('elfdash-muted', muted ? '1' : '0');
      if (master) master.gain.value = muted ? 0 : 0.6;
      return muted;
    },
  };
})();

// ==========================================================================
//  LEADERBOARD (shared via a Netlify Function, falls back to this device)
// ==========================================================================
const Leaderboard = (() => {
  const key = (d) => 'elfdash-board-' + d;
  function localLoad(d) {
    try { const v = JSON.parse(store(key(d)) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function localSubmit(d, entry) {
    const entries = localLoad(d);
    const e = { ...entry, date: new Date().toISOString().slice(0, 10) };
    entries.push(e);
    entries.sort((a, b) => b.score - a.score);
    const top = entries.slice(0, 10);
    store(key(d), JSON.stringify(top));
    return { entries: top, rank: top.indexOf(e) };
  }
  async function load(d) {
    try {
      const r = await fetch('/api/scores?difficulty=' + d, { cache: 'no-store' });
      if (!r.ok) throw new Error('bad status');
      const j = await r.json();
      if (!Array.isArray(j.entries)) throw new Error('bad body');
      return { entries: j.entries, online: true };
    } catch (e) {
      return { entries: localLoad(d), online: false };
    }
  }
  async function submit(d, entry) {
    try {
      const r = await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ difficulty: d, ...entry }),
      });
      if (r.status === 400) {
        const j = await r.json().catch(() => ({}));
        return { error: j.error || 'Please try a different name.' };
      }
      if (!r.ok) throw new Error('bad status');
      const j = await r.json();
      if (!Array.isArray(j.entries)) throw new Error('bad body');
      return { entries: j.entries, rank: j.rank, online: true };
    } catch (e) {
      return { ...localSubmit(d, entry), online: false };
    }
  }
  return { load, submit };
})();

// ==========================================================================
//  CANVAS + GAME STATE
// ==========================================================================
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let pxScale = 1;
function resize() {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(r.width * dpr));
  canvas.height = Math.max(1, Math.round(r.height * dpr));
  pxScale = canvas.width / W;
}

// title | playing | paused | dying | levelDone | end | board
let state = 'title';
let diffKey = 'medium', levelIdx = 0, themeKey = 'village';
let score = 0, lives = START_LIVES, streak = 0, mult = 1, won = false;
let distance = 0, speed = 0, boost = 0, invuln = 0;
let lanePos = 1, targetLane = 1, jumpH = 0, jumpV = 0, runPhase = 0;
let objects = [], scenery = [], particles = [], popups = [];
let nextRowAt = 0, nextSceneryAt = 0, finishSpawned = false, prevFree = [0, 1, 2];
let shakeT = 0, flashT = 0, bannerT = 0, dyingT = 0, time = 0;

// Fixed background details (seeded so they don't jump around).
const BG = (() => {
  const r = mulberry32(2024);
  const stars = Array.from({ length: 90 }, () => ({ x: r() * W, y: r() * (HORIZON - 20), s: 0.6 + r() * 1.6, p: r() * 6 }));
  const clouds = Array.from({ length: 5 }, () => ({ x: r() * (W + 200), y: 30 + r() * 90, w: 60 + r() * 60, v: 4 + r() * 6 }));
  const trees = Array.from({ length: 80 }, () => ({ x: r() * W, h: 12 + r() * 26 }));
  const buildings = [];
  for (let x = -10; x < W + 10;) {
    const w = 34 + r() * 60, h = 20 + r() * 70;
    const windows = [];
    for (let wy = HORIZON - h + 8; wy < HORIZON - 10; wy += 14)
      for (let wx = x + 6; wx < x + w - 10; wx += 13) if (r() < 0.45) windows.push([wx, wy]);
    buildings.push({ x, w, h, windows });
    x += w + 2;
  }
  return { stars, clouds, trees, buildings };
})();

const snow = Array.from({ length: 70 }, () => ({
  x: Math.random() * W, y: Math.random() * H, r: 1.2 + Math.random() * 2.6,
  vy: 25 + Math.random() * 45, d: Math.random() * 6,
}));

// ==========================================================================
//  WORLD: spawning, movement, collisions
// ==========================================================================
function scaleAt(z) { return FOCAL / (FOCAL + z); }
function project(xw, z) {
  const s = scaleAt(z);
  return { x: W / 2 + xw * s, y: HORIZON + (PLAYER_Y - HORIZON) * s, s };
}

function makeObj(type, lane, z) {
  return {
    type, lane, z, prevZ: z,
    tall: type === 'grumple',
    variant: Math.floor(Math.random() * BAUBLE_COLORS.length),
    seed: Math.random() * 10,
  };
}

function spawnRow(z) {
  const d = DIFFICULTY[diffKey];
  // Keep at least one lane open that the elf can already reach, so there is always a way through.
  const safe = pick(prevFree);
  let count = 0;
  if (Math.random() < d.hazardChance) count = Math.random() < d.doubleChance ? 2 : 1;
  const hazardLanes = shuffle([0, 1, 2].filter((l) => l !== safe)).slice(0, count);
  for (const lane of hazardLanes) objects.push(makeObj(weightedPick(d.weights), lane, z));

  const free = [0, 1, 2].filter((l) => !hazardLanes.includes(l));
  prevFree = free;
  let candyPlaced = false;
  for (const lane of free) {
    const r = Math.random();
    if (!candyPlaced && r < d.candyChance) { objects.push(makeObj('candy', lane, z)); candyPlaced = true; }
    else if (r < d.candyChance + 0.022 && boost <= 0) objects.push(makeObj('sleigh', lane, z));
    else if (r < 0.14) objects.push(makeObj('santa', lane, z));
    else if (r < 0.5) objects.push(makeObj('bauble', lane, z));
  }
}

function spawnScenery(z) {
  const th = THEMES[themeKey];
  for (const side of [-1, 1]) {
    if (Math.random() < 0.3) continue;
    scenery.push({
      isScenery: true, type: 'scenery', kind: pick(th.scenery), z,
      x: side * (ROAD_HALF + rand(90, 330)), size: rand(0.85, 1.3),
      variant: Math.floor(Math.random() * 4), seed: Math.random() * 10,
    });
  }
}

function moveWorld(dz) {
  distance += dz;
  for (const o of objects) { o.prevZ = o.z; o.z -= dz; }
  for (const s of scenery) s.z -= dz;
  while (nextSceneryAt - distance < SPAWN_Z) { spawnScenery(nextSceneryAt - distance); nextSceneryAt += 8; }
  scenery = scenery.filter((s) => s.z > -4);
}

function updatePlayer(dt) {
  const diff = targetLane - lanePos, step = LANE_SPEED * dt;
  lanePos = Math.abs(diff) <= step ? targetLane : lanePos + Math.sign(diff) * step;
  if (jumpH > 0 || jumpV > 0) {
    jumpV -= GRAVITY * dt;
    jumpH += jumpV * dt;
    if (jumpH <= 0) { jumpH = 0; jumpV = 0; }
  }
  runPhase += dt * (6 + speed * 0.25);
}

function playerScreenX() { return W / 2 + (lanePos - 1) * LANE_W; }

function addPopup(text, color, size = 30, yOff = 0) {
  popups.push({ text, color, size, x: playerScreenX(), y: PLAYER_Y - 170 - jumpH + yOff, life: 1.1, max: 1.1 });
}
function burst(x, y, colors, n = 12, power = 260) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = power * (0.4 + Math.random() * 0.6);
    particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, g: 600,
      r: 3 + Math.random() * 4, color: pick(colors), life: 0.7, max: 0.7 });
  }
}

function collectGood(points, o, color) {
  streak++;
  if (streak === STREAK_FOR_BONUS) {
    mult = 2;
    addPopup('DOUBLE POINTS!', '#ffd34d', 36, -40);
    Sound.sfx('streak');
  }
  if (points > 0) {
    const gained = points * mult;
    score += gained;
    addPopup('+' + gained, color, points >= 5 ? 38 : 30);
  }
  burst(playerScreenX(), PLAYER_Y - 80 - jumpH, [color, '#ffffff', '#ffd34d'], 14);
}

function handleCross(o) {
  if (state !== 'playing' || o.type === 'finish') return;
  const dist = Math.abs(lanePos - o.lane);
  if (HAZARDS.has(o.type)) {
    if (dist >= 0.55 || invuln > 0) return;
    if (!o.tall && jumpH > JUMP_CLEAR) {
      if (Math.random() < 0.35) addPopup(pick(['Nice jump!', 'Woohoo!', 'Up and over!']), '#ffffff', 26);
      return;
    }
    hit(o);
    return;
  }
  if (dist >= 0.6) return;
  o.dead = true;
  switch (o.type) {
    case 'bauble':
      Sound.sfx('bauble');
      collectGood(1, o, BAUBLE_COLORS[o.variant]);
      break;
    case 'santa':
      Sound.sfx('santa');
      collectGood(5, o, '#e23b3b');
      break;
    case 'candy':
      Sound.sfx('candy');
      if (lives < MAX_LIVES) { lives++; addPopup('+1 LIFE!', '#ff5fa2', 38); collectGood(0, o, '#ff5fa2'); }
      else collectGood(10, o, '#ff5fa2');
      break;
    case 'sleigh':
      Sound.sfx('boost');
      boost = BOOST_TIME;
      addPopup('WHOOSH! Super speed!', '#7fd8ff', 30);
      break;
  }
}

function hit(o) {
  o.dead = true;
  lives--;
  streak = 0;
  mult = 1;
  boost = 0;
  invuln = INVULN_TIME;
  shakeT = 0.35;
  flashT = 0.3;
  Sound.sfx('hit');
  const colors = o.type === 'present' ? ['#5b2a86', '#8fd14f'] : o.type === 'snowball' ? ['#ffffff', '#cfe2f3'] : ['#6dbb3c', '#a6d96a'];
  burst(playerScreenX(), PLAYER_Y - 60, colors, 18, 320);
  if (lives <= 0) {
    lives = 0;
    setState('dying');
    dyingT = 1.6;
    Sound.stopSong();
    Sound.sfx('gameover');
  } else {
    addPopup('Ouch!', '#ff6b6b', 32);
  }
}

// ==========================================================================
//  UPDATE
// ==========================================================================
function update(dt) {
  time += dt;
  updateSnow(dt);
  if (state === 'playing') updatePlaying(dt);
  else if (state === 'dying') {
    dyingT -= dt;
    if (dyingT <= 0) showEnd(false);
  } else if (state !== 'paused') updateAmbient(dt);
  if (state !== 'paused') updateFx(dt);
}

function updatePlaying(dt) {
  const lvl = LEVELS[levelIdx], d = DIFFICULTY[diffKey];
  if (bannerT > 0) bannerT -= dt;
  if (boost > 0) boost = Math.max(0, boost - dt);
  if (invuln > 0) invuln = Math.max(0, invuln - dt);
  speed = d.speed * lvl.speedMul * (boost > 0 ? BOOST_MUL : 1);
  moveWorld(speed * dt);
  updatePlayer(dt);

  const gap = d.gap * lvl.gapMul;
  while (nextRowAt - distance < SPAWN_Z && nextRowAt < lvl.length - 20) {
    spawnRow(nextRowAt - distance);
    nextRowAt += gap * rand(0.85, 1.2);
  }
  if (!finishSpawned && lvl.length - distance < SPAWN_Z) {
    const z = lvl.length - distance;
    objects.push({ type: 'finish', lane: 1, z, prevZ: z });
    finishSpawned = true;
  }
  for (const o of objects) if (!o.dead && o.prevZ > 0 && o.z <= 0) handleCross(o);
  objects = objects.filter((o) => !o.dead && o.z > -4);
  if (state === 'playing' && distance >= lvl.length) levelComplete();
}

// Gentle running in the background of menus.
function updateAmbient(dt) {
  speed = 10;
  moveWorld(speed * dt);
  objects = objects.filter((o) => o.z > -4);
  targetLane = 1;
  updatePlayer(dt);
}

function updateFx(dt) {
  if (shakeT > 0) shakeT -= dt;
  if (flashT > 0) flashT -= dt;
  for (const p of popups) { p.y -= 45 * dt; p.life -= dt; }
  popups = popups.filter((p) => p.life > 0);
  for (const p of particles) { p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
  particles = particles.filter((p) => p.life > 0);
}

function updateSnow(dt) {
  for (const f of snow) {
    f.y += f.vy * dt;
    f.x += Math.sin(time * 1.3 + f.d) * 14 * dt - (state === 'playing' ? speed * 0.4 * dt : 0) * Math.sign(f.x - W / 2) * -1;
    if (f.y > H + 5) { f.y = -5; f.x = Math.random() * W; }
    if (f.x < -10) f.x = W + 10;
    if (f.x > W + 10) f.x = -10;
  }
}

// ==========================================================================
//  DRAWING HELPERS
// ==========================================================================
function rrect(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function circle(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); }
function line(c, x1, y1, x2, y2) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
function shadow(c, x, y, rx, ry, a = 0.18) {
  c.fillStyle = `rgba(20,40,80,${a})`;
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill();
}
function font(size, weight = 700) { return `${weight} ${size}px Fredoka, "Trebuchet MS", sans-serif`; }
function outlinedText(c, text, x, y, size, fill, stroke = OUT, align = 'center') {
  c.font = font(size);
  c.textAlign = align;
  c.textBaseline = 'middle';
  c.lineJoin = 'round';
  c.lineWidth = Math.max(3, size / 6);
  c.strokeStyle = stroke;
  c.strokeText(text, x, y);
  c.fillStyle = fill;
  c.fillText(text, x, y);
}
function drawStar(c, x, y, r, fill) {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
  c.fillStyle = fill;
  c.fill();
}
function drawHeart(c, x, y, r, fill) {
  c.beginPath();
  c.moveTo(x, y + r * 0.9);
  c.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.9, y - r * 1.4, x, y - r * 0.5);
  c.bezierCurveTo(x + r * 0.9, y - r * 1.4, x + r * 1.6, y - r * 0.2, x, y + r * 0.9);
  c.closePath();
  c.fillStyle = fill; c.fill();
  c.lineWidth = 2.5; c.strokeStyle = '#7a1220'; c.stroke();
}

// ==========================================================================
//  CHARACTERS + THINGS (all drawn as vector shapes)
//  Each draw function: origin = point on the ground, s = perspective scale.
// ==========================================================================
function drawElf(c, x, y, s, phase, airborne) {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  const sw = airborne ? 0.6 : Math.sin(phase);

  // legs: candy-striped tights + curly shoes
  for (const side of [-1, 1]) {
    const lift = airborne ? 10 : Math.max(0, side * sw) * 16;
    const fx = side * 11, fy = -lift;
    c.strokeStyle = OUT; c.lineWidth = 15; line(c, side * 10, -44, fx, fy - 6);
    c.strokeStyle = '#ffffff'; c.lineWidth = 10; line(c, side * 10, -44, fx, fy - 6);
    c.setLineDash([5, 5]); c.strokeStyle = '#e23b3b'; line(c, side * 10, -44, fx, fy - 6); c.setLineDash([]);
    c.fillStyle = '#7b4a2a'; c.strokeStyle = OUT; c.lineWidth = 3;
    c.beginPath(); c.ellipse(fx, fy - 4, 10, 7, 0, 0, Math.PI * 2); c.fill(); c.stroke();
  }
  // arms
  for (const side of [-1, 1]) {
    const swing = airborne ? -16 : -side * sw * 10;
    c.strokeStyle = OUT; c.lineWidth = 13; line(c, side * 17, -78, side * 30, -54 + swing);
    c.strokeStyle = '#2fa84f'; c.lineWidth = 8; line(c, side * 17, -78, side * 30, -54 + swing);
    c.fillStyle = '#f6c9a4'; circle(c, side * 30, -52 + swing, 5.5); c.fill();
    c.lineWidth = 2.5; c.strokeStyle = OUT; c.stroke();
  }
  // tunic with a zig-zag hem
  c.fillStyle = '#2fa84f'; c.strokeStyle = OUT; c.lineWidth = 3;
  c.beginPath();
  c.moveTo(-17, -86); c.lineTo(17, -86); c.lineTo(25, -44);
  for (let i = 0; i <= 10; i++) c.lineTo(25 - i * 5, i % 2 ? -35 : -44);
  c.closePath(); c.fill(); c.stroke();
  // belt
  c.fillStyle = '#3a2416'; c.fillRect(-21, -64, 42, 8);
  // collar
  c.fillStyle = '#e23b3b';
  c.beginPath(); c.moveTo(-18, -86);
  for (let i = 0; i <= 6; i++) c.lineTo(-18 + i * 6, i % 2 ? -79 : -88);
  c.closePath(); c.fill(); c.stroke();
  // back of the head
  c.fillStyle = '#8a5a2b'; circle(c, 0, -98, 16); c.fill(); c.stroke();
  // pointy ears
  c.fillStyle = '#f6c9a4';
  for (const side of [-1, 1]) {
    c.beginPath(); c.moveTo(side * 14, -101); c.lineTo(side * 31, -110); c.lineTo(side * 14, -92);
    c.closePath(); c.fill(); c.stroke();
  }
  // floppy hat
  const flop = Math.sin(phase * 0.5) * 4;
  c.fillStyle = '#e23b3b';
  c.beginPath();
  c.moveTo(-17, -106);
  c.quadraticCurveTo(-8, -140, 18 + flop, -148);
  c.quadraticCurveTo(8, -128, 17, -106);
  c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#ffffff'; rrect(c, -19, -112, 38, 11, 5); c.fill(); c.stroke();
  c.fillStyle = '#ffd34d'; circle(c, 18 + flop, -148, 6.5); c.fill(); c.stroke();
  c.restore();
}

function bob(o, amount = 5) { return Math.sin(time * 4 + o.seed) * amount; }

function drawBauble(c, x, y, s, o) {
  shadow(c, x, y, 20 * s, 6 * s, 0.12);
  c.save();
  c.translate(x, y - 42 * s + bob(o) * s);
  c.scale(s, s);
  const col = BAUBLE_COLORS[o.variant];
  c.fillStyle = col; c.strokeStyle = OUT; c.lineWidth = 3;
  circle(c, 0, 0, 22); c.fill(); c.stroke();
  // sparkly band
  c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 3;
  c.beginPath();
  for (let i = 0; i <= 8; i++) c.lineTo(-20 + i * 5, i % 2 ? 3 : -3);
  c.stroke();
  // cap + loop
  c.fillStyle = '#f5b400'; c.strokeStyle = OUT; c.lineWidth = 2.5;
  c.fillRect(-7, -30, 14, 9); c.strokeRect(-7, -30, 14, 9);
  circle(c, 0, -34, 4); c.stroke();
  // shine
  c.fillStyle = 'rgba(255,255,255,0.8)';
  c.beginPath(); c.ellipse(-8, -8, 6, 4, -0.6, 0, Math.PI * 2); c.fill();
  c.restore();
}

function drawSanta(c, x, y, s, o) {
  shadow(c, x, y, 22 * s, 6 * s, 0.12);
  c.save();
  c.translate(x, y - 52 * s + bob(o) * s);
  c.scale(s, s);
  // golden glow so it reads as "worth a lot"
  const g = c.createRadialGradient(0, 0, 8, 0, 0, 40);
  g.addColorStop(0, 'rgba(255,220,90,0.75)'); g.addColorStop(1, 'rgba(255,220,90,0)');
  c.fillStyle = g; circle(c, 0, 0, 40); c.fill();
  c.lineJoin = 'round';
  // face
  c.fillStyle = '#f6c9a4'; c.strokeStyle = OUT; c.lineWidth = 2.5;
  circle(c, 0, -2, 16); c.fill(); c.stroke();
  // beard
  c.fillStyle = '#ffffff';
  for (const [bx, by, br] of [[-12, 6, 9], [12, 6, 9], [0, 13, 11], [-6, 16, 8], [6, 16, 8]]) { circle(c, bx, by, br); c.fill(); }
  c.beginPath(); c.ellipse(-6, 4, 7, 4, 0.3, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(6, 4, 7, 4, -0.3, 0, Math.PI * 2); c.fill();
  // eyes, cheeks, nose
  c.fillStyle = OUT; circle(c, -6, -6, 2.3); c.fill(); circle(c, 6, -6, 2.3); c.fill();
  c.fillStyle = 'rgba(240,110,110,0.55)'; circle(c, -10, -1, 3.5); c.fill(); circle(c, 10, -1, 3.5); c.fill();
  c.fillStyle = '#e88e7a'; circle(c, 0, 0, 3.2); c.fill();
  // hat
  c.fillStyle = '#e23b3b'; c.strokeStyle = OUT; c.lineWidth = 2.5;
  c.beginPath(); c.moveTo(-17, -12); c.quadraticCurveTo(-4, -44, 24, -32); c.quadraticCurveTo(10, -28, 17, -12);
  c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#ffffff'; rrect(c, -19, -17, 38, 9, 4); c.fill(); c.stroke();
  circle(c, 25, -32, 5); c.fill(); c.stroke();
  c.restore();
}

function drawCandy(c, x, y, s, o) {
  shadow(c, x, y, 18 * s, 5 * s, 0.12);
  c.save();
  c.translate(x, y - 50 * s + bob(o, 6) * s);
  c.scale(s, s);
  const pulse = 0.55 + 0.25 * Math.sin(time * 6);
  const g = c.createRadialGradient(0, 0, 6, 0, 0, 46);
  g.addColorStop(0, `rgba(255,120,190,${pulse})`); g.addColorStop(1, 'rgba(255,120,190,0)');
  c.fillStyle = g; circle(c, 0, 0, 46); c.fill();
  c.rotate(0.25);
  const path = () => {
    c.beginPath(); c.moveTo(6, 30); c.lineTo(6, -12); c.arc(-6, -12, 12, 0, Math.PI, true); c.lineTo(-18, -2);
  };
  c.lineCap = 'round'; c.lineJoin = 'round';
  path(); c.strokeStyle = OUT; c.lineWidth = 14; c.stroke();
  path(); c.strokeStyle = '#ffffff'; c.lineWidth = 9; c.stroke();
  path(); c.setLineDash([6, 6]); c.strokeStyle = '#e23b3b'; c.stroke(); c.setLineDash([]);
  c.restore();
  // little sparkles
  for (let i = 0; i < 3; i++) {
    const a = time * 2 + i * 2.1 + o.seed;
    drawStar(c, x + Math.cos(a) * 34 * s, y - 50 * s + Math.sin(a) * 28 * s, 5 * s, '#ffffff');
  }
}

function drawSleigh(c, x, y, s, o) {
  shadow(c, x, y, 40 * s, 8 * s, 0.14);
  c.save();
  c.translate(x, y - 22 * s + bob(o, 3) * s);
  c.scale(s, s);
  c.lineJoin = 'round'; c.lineCap = 'round';
  // speed lines
  c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 4;
  for (let i = 0; i < 3; i++) { const off = (time * 120 + i * 18) % 30; line(c, -50 - off, -20 + i * 10, -66 - off, -20 + i * 10); }
  // runner
  const runner = () => { c.beginPath(); c.moveTo(-38, 12); c.lineTo(30, 12); c.quadraticCurveTo(46, 12, 42, -4); };
  runner(); c.strokeStyle = OUT; c.lineWidth = 8; c.stroke();
  runner(); c.strokeStyle = '#f5b400'; c.lineWidth = 4; c.stroke();
  c.strokeStyle = OUT; c.lineWidth = 4; line(c, -22, 12, -22, 2); line(c, 16, 12, 16, 2);
  // body
  c.fillStyle = '#e23b3b'; c.strokeStyle = OUT; c.lineWidth = 3;
  c.beginPath();
  c.moveTo(-36, 3); c.lineTo(24, 3); c.quadraticCurveTo(38, 3, 36, -18); c.quadraticCurveTo(32, -27, 25, -22);
  c.lineTo(20, -12); c.lineTo(-22, -12); c.lineTo(-30, -32); c.quadraticCurveTo(-42, -32, -40, -18);
  c.closePath(); c.fill(); c.stroke();
  c.strokeStyle = '#f5b400'; c.lineWidth = 3; line(c, -30, -4, 22, -4);
  // little lightning bolt to say "speed"
  c.fillStyle = '#ffd34d'; c.strokeStyle = OUT; c.lineWidth = 2;
  c.beginPath(); c.moveTo(2, -44); c.lineTo(-8, -26); c.lineTo(0, -26); c.lineTo(-4, -12); c.lineTo(10, -32); c.lineTo(2, -32);
  c.closePath(); c.fill(); c.stroke();
  c.restore();
}

function drawPresent(c, x, y, s, o) {
  shadow(c, x, y, 36 * s, 8 * s);
  c.save();
  c.translate(x, y);
  c.rotate(Math.sin(time * 18 + o.seed) * 0.04);
  c.scale(s, s);
  c.lineJoin = 'round';
  c.strokeStyle = OUT; c.lineWidth = 3;
  c.fillStyle = '#5b2a86'; rrect(c, -32, -58, 64, 58, 4); c.fill(); c.stroke();
  c.fillStyle = '#8fd14f'; c.fillRect(-6, -58, 12, 58);
  c.fillStyle = '#6e36a3'; rrect(c, -36, -70, 72, 15, 4); c.fill(); c.stroke();
  c.fillStyle = '#8fd14f'; c.fillRect(-6, -69, 12, 13);
  c.beginPath(); c.ellipse(-11, -77, 11, 6, -0.4, 0, Math.PI * 2); c.fill(); c.stroke();
  c.beginPath(); c.ellipse(11, -77, 11, 6, 0.4, 0, Math.PI * 2); c.fill(); c.stroke();
  // grumpy face
  c.fillStyle = '#ffffff';
  c.beginPath(); c.ellipse(-17, -38, 8, 7, 0, 0, Math.PI * 2); c.fill(); c.stroke();
  c.beginPath(); c.ellipse(17, -38, 8, 7, 0, 0, Math.PI * 2); c.fill(); c.stroke();
  c.fillStyle = OUT; circle(c, -15, -36, 3.5); c.fill(); circle(c, 15, -36, 3.5); c.fill();
  c.lineWidth = 4; c.lineCap = 'round';
  line(c, -27, -51, -10, -45); line(c, 27, -51, 10, -45);
  c.fillStyle = OUT; rrect(c, -22, -24, 44, 12, 3); c.fill();
  c.fillStyle = '#ffffff';
  for (let i = 0; i < 5; i++) {
    c.beginPath(); c.moveTo(-20 + i * 8, -24); c.lineTo(-16 + i * 8, -17); c.lineTo(-12 + i * 8, -24); c.closePath(); c.fill();
  }
  c.restore();
}

function drawSnowball(c, x, y, s, o) {
  shadow(c, x, y, 32 * s, 8 * s);
  c.save();
  c.translate(x, y - 32 * s);
  c.scale(s, s);
  const r = 32;
  const g = c.createRadialGradient(-10, -12, 4, 0, 0, r);
  g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#cfe2f3');
  c.fillStyle = g; c.strokeStyle = '#7d9fc2'; c.lineWidth = 3;
  circle(c, 0, 0, r); c.fill(); c.stroke();
  // rolling lines
  c.save(); circle(c, 0, 0, r - 1.5); c.clip();
  c.strokeStyle = 'rgba(125,159,194,0.55)'; c.lineWidth = 3;
  for (let k = 0; k < 3; k++) {
    const yy = ((time * 70 + k * 22 + o.seed * 10) % 66) - 33;
    const hw = Math.sqrt(Math.max(0, r * r - yy * yy));
    c.beginPath(); c.moveTo(-hw, yy); c.quadraticCurveTo(0, yy + 6, hw, yy); c.stroke();
  }
  c.restore();
  c.fillStyle = 'rgba(255,255,255,0.9)';
  c.beginPath(); c.ellipse(-12, -14, 7, 4, -0.6, 0, Math.PI * 2); c.fill();
  c.restore();
}

function drawGrumple(c, x, y, s, o) {
  shadow(c, x, y, 40 * s, 9 * s);
  c.save();
  c.translate(x, y - Math.abs(Math.sin(time * 6 + o.seed)) * 6 * s);
  c.scale(s, s);
  c.lineJoin = 'round'; c.lineCap = 'round';
  // feet
  c.fillStyle = '#3f7d1f'; c.strokeStyle = OUT; c.lineWidth = 3;
  c.beginPath(); c.ellipse(-14, -5, 13, 7, 0, 0, Math.PI * 2); c.fill(); c.stroke();
  c.beginPath(); c.ellipse(14, -5, 13, 7, 0, 0, Math.PI * 2); c.fill(); c.stroke();
  // raised arms
  const wave = Math.sin(time * 8 + o.seed) * 5;
  for (const side of [-1, 1]) {
    c.strokeStyle = OUT; c.lineWidth = 14; line(c, side * 28, -82, side * 50, -118 + wave * side);
    c.strokeStyle = '#6dbb3c'; c.lineWidth = 9; line(c, side * 28, -82, side * 50, -118 + wave * side);
    c.strokeStyle = OUT; c.lineWidth = 3;
    for (let k = -1; k <= 1; k++) line(c, side * 50, -118 + wave * side, side * (54 + k * 3), -128 + wave * side + Math.abs(k) * 2);
  }
  // furry body
  c.fillStyle = '#6dbb3c'; c.strokeStyle = OUT; c.lineWidth = 3;
  c.beginPath();
  const N = 30;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2, k = i % 2 ? 1.08 : 1;
    c.lineTo(Math.cos(a) * 34 * k, -68 + Math.sin(a) * 60 * k);
  }
  c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#a6d96a'; c.beginPath(); c.ellipse(0, -46, 20, 28, 0, 0, Math.PI * 2); c.fill();
  // scarf
  c.fillStyle = '#7b3fb0'; rrect(c, -30, -80, 60, 11, 5); c.fill(); c.stroke();
  rrect(c, 10, -74, 11, 24, 4); c.fill(); c.stroke();
  // face
  c.fillStyle = '#fff36b';
  c.beginPath(); c.ellipse(-13, -108, 9, 7, 0, 0, Math.PI * 2); c.fill(); c.stroke();
  c.beginPath(); c.ellipse(13, -108, 9, 7, 0, 0, Math.PI * 2); c.fill(); c.stroke();
  c.fillStyle = '#c0392b'; circle(c, -11, -106, 3.5); c.fill(); circle(c, 11, -106, 3.5); c.fill();
  c.strokeStyle = OUT; c.lineWidth = 4.5;
  line(c, -24, -122, -6, -114); line(c, 24, -122, 6, -114);
  c.lineWidth = 3.5;
  c.beginPath(); c.arc(0, -84, 10, Math.PI * 1.2, Math.PI * 1.8); c.stroke();
  c.restore();
}

function drawFinish(c, z) {
  const L = project(-(ROAD_HALF + 18), z), R = project(ROAD_HALF + 18, z), s = L.s;
  const top = L.y - 230 * s;
  c.save();
  c.lineCap = 'butt';
  for (const p of [L, R]) {
    c.strokeStyle = OUT; c.lineWidth = 20 * s; line(c, p.x, p.y, p.x, top - 6 * s);
    c.strokeStyle = '#ffffff'; c.lineWidth = 14 * s; line(c, p.x, p.y, p.x, top - 6 * s);
    c.setLineDash([14 * s, 14 * s]); c.strokeStyle = '#e23b3b'; line(c, p.x, p.y, p.x, top - 6 * s); c.setLineDash([]);
    drawStar(c, p.x, top - 16 * s, 18 * s, '#ffd34d');
  }
  const bh = 50 * s;
  c.fillStyle = '#e23b3b'; c.strokeStyle = OUT; c.lineWidth = 3 * s;
  c.fillRect(L.x, top, R.x - L.x, bh); c.strokeRect(L.x, top, R.x - L.x, bh);
  const sq = 10 * s;
  for (let i = 0, xx = L.x; xx < R.x - 0.5; i++, xx += sq) {
    c.fillStyle = i % 2 ? '#ffffff' : OUT;
    c.fillRect(xx, top + bh - sq, Math.min(sq, R.x - xx), sq);
  }
  if (s > 0.08) outlinedText(c, 'FINISH', (L.x + R.x) / 2, top + (bh - sq) / 2, 30 * s, '#ffffff');
  c.restore();
}

// ----- Scenery ---------------------------------------------------------------
function drawPine(c, x, y, s, o, color, lights) {
  c.save();
  c.translate(x, y);
  c.scale(s * o.size, s * o.size);
  c.lineJoin = 'round';
  shadow(c, 0, 0, 60, 12, 0.12);
  c.fillStyle = '#6b4226'; c.fillRect(-7, -26, 14, 26);
  const tiers = [[-22, 66, 64], [-62, 52, 56], [-98, 38, 50]];
  for (const [by, hw, h] of tiers) {
    c.fillStyle = color; c.strokeStyle = '#0d3b24'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(-hw, by); c.lineTo(0, by - h); c.lineTo(hw, by); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = '#ffffff'; c.lineWidth = 6; c.lineCap = 'round';
    line(c, -hw + 6, by - 2, hw - 6, by - 2);
  }
  c.fillStyle = '#ffffff';
  c.beginPath(); c.moveTo(-10, -132); c.lineTo(0, -148); c.lineTo(10, -132); c.closePath(); c.fill();
  if (lights) {
    const spots = [[-34, -32], [18, -38], [44, -28], [-16, -74], [26, -70], [-8, -110], [12, -118]];
    const cols = ['#ff4d4d', '#ffd34d', '#4dabff', '#ff7ae0'];
    spots.forEach(([lx, ly], i) => {
      c.globalAlpha = 0.55 + 0.45 * Math.sin(time * 4 + i * 1.7 + o.seed);
      c.fillStyle = cols[i % cols.length]; circle(c, lx, ly, 4.5); c.fill();
    });
    c.globalAlpha = 1;
    drawStar(c, 0, -152, 12, '#ffd34d');
  }
  c.restore();
}

function drawLamp(c, x, y, s, o) {
  c.save();
  c.translate(x, y);
  c.scale(s * o.size, s * o.size);
  c.lineCap = 'butt';
  c.strokeStyle = OUT; c.lineWidth = 11; line(c, 0, 0, 0, -132);
  c.strokeStyle = '#ffffff'; c.lineWidth = 7; line(c, 0, 0, 0, -132);
  c.setLineDash([8, 9]); c.strokeStyle = '#e23b3b'; line(c, 0, 0, 0, -132); c.setLineDash([]);
  const g = c.createRadialGradient(0, -144, 4, 0, -144, 46);
  g.addColorStop(0, 'rgba(255,230,140,0.6)'); g.addColorStop(1, 'rgba(255,230,140,0)');
  c.fillStyle = g; circle(c, 0, -144, 46); c.fill();
  c.fillStyle = '#ffe9a8'; c.strokeStyle = OUT; c.lineWidth = 3;
  rrect(c, -11, -158, 22, 26, 4); c.fill(); c.stroke();
  c.fillStyle = OUT;
  c.beginPath(); c.moveTo(-15, -158); c.lineTo(0, -170); c.lineTo(15, -158); c.closePath(); c.fill();
  c.fillStyle = '#2fa84f';
  c.beginPath(); c.ellipse(-7, -118, 8, 5, 0.4, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(7, -118, 8, 5, -0.4, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#e23b3b'; circle(c, 0, -118, 3.5); c.fill();
  c.restore();
}

function drawCottage(c, x, y, s, o) {
  c.save();
  c.translate(x, y);
  c.scale(s * o.size, s * o.size);
  c.lineJoin = 'round';
  shadow(c, 0, 0, 90, 14, 0.12);
  c.strokeStyle = OUT; c.lineWidth = 3;
  c.fillStyle = ['#d9534f', '#f0a830', '#5bc0de', '#8e6bbf'][o.variant];
  c.fillRect(-70, -82, 140, 82); c.strokeRect(-70, -82, 140, 82);
  c.fillStyle = '#a8483a'; c.fillRect(38, -142, 20, 40); c.strokeRect(38, -142, 20, 40);
  c.fillStyle = '#7a3b2e';
  c.beginPath(); c.moveTo(-86, -80); c.lineTo(0, -140); c.lineTo(86, -80); c.closePath(); c.fill(); c.stroke();
  c.strokeStyle = '#ffffff'; c.lineWidth = 12; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-84, -84); c.lineTo(0, -142); c.lineTo(84, -84); c.stroke();
  c.strokeStyle = OUT; c.lineWidth = 3;
  c.fillStyle = '#6b4226'; rrect(c, -13, -46, 26, 46, 4); c.fill(); c.stroke();
  c.fillStyle = '#2fa84f'; circle(c, 0, -30, 7); c.fill();
  c.fillStyle = '#e23b3b'; circle(c, 0, -24, 2.5); c.fill();
  for (const wx of [-56, 30]) {
    c.fillStyle = '#ffe27a'; c.fillRect(wx, -66, 26, 22); c.strokeRect(wx, -66, 26, 22);
    line(c, wx + 13, -66, wx + 13, -44); line(c, wx, -55, wx + 26, -55);
  }
  c.restore();
}

function drawSnowman(c, x, y, s, o) {
  c.save();
  c.translate(x, y);
  c.scale(s * o.size, s * o.size);
  shadow(c, 0, 0, 34, 9, 0.14);
  c.fillStyle = '#ffffff'; c.strokeStyle = '#8fb0cf'; c.lineWidth = 3;
  for (const [cy, r] of [[-26, 26], [-66, 19], [-96, 14]]) { circle(c, 0, cy, r); c.fill(); c.stroke(); }
  c.fillStyle = OUT; circle(c, -5, -99, 2.5); c.fill(); circle(c, 5, -99, 2.5); c.fill();
  for (const by of [-58, -70, -30]) { circle(c, 0, by, 2.8); c.fill(); }
  c.fillStyle = '#f39c12';
  c.beginPath(); c.moveTo(0, -95); c.lineTo(14, -92); c.lineTo(0, -90); c.closePath(); c.fill();
  c.fillStyle = '#e23b3b'; rrect(c, -18, -86, 36, 8, 4); c.fill(); c.fillRect(8, -82, 8, 16);
  c.fillStyle = OUT; c.fillRect(-16, -112, 32, 5); c.fillRect(-10, -132, 20, 21);
  c.restore();
}

function drawChimney(c, x, y, s, o) {
  c.save();
  c.translate(x, y);
  c.scale(s * o.size, s * o.size);
  shadow(c, 0, 0, 40, 10, 0.15);
  c.strokeStyle = OUT; c.lineWidth = 3;
  c.fillStyle = '#a8483a'; c.fillRect(-26, -84, 52, 84); c.strokeRect(-26, -84, 52, 84);
  c.strokeStyle = 'rgba(255,220,200,0.45)'; c.lineWidth = 2;
  for (let r = 1; r < 6; r++) {
    line(c, -26, -r * 14, 26, -r * 14);
    const off = r % 2 ? 0 : 13;
    for (let bx = -26 + off; bx < 26; bx += 26) line(c, bx, -r * 14, bx, -r * 14 + 14);
  }
  c.fillStyle = '#ffffff'; c.strokeStyle = '#8fb0cf'; c.lineWidth = 3;
  rrect(c, -31, -94, 62, 14, 7); c.fill(); c.stroke();
  for (let i = 0; i < 3; i++) {
    const t = (time * 0.5 + i / 3 + o.seed) % 1;
    c.fillStyle = `rgba(230,235,245,${0.7 * (1 - t)})`;
    circle(c, Math.sin(t * 6 + o.seed) * 10, -104 - t * 70, 9 + t * 14); c.fill();
  }
  c.restore();
}

// ==========================================================================
//  SCENE RENDERING
// ==========================================================================
function drawSky(th) {
  const c = ctx;
  const g = c.createLinearGradient(0, 0, 0, HORIZON);
  g.addColorStop(0, th.skyTop); g.addColorStop(1, th.skyBottom);
  c.fillStyle = g; c.fillRect(0, 0, W, HORIZON + 2);

  if (themeKey === 'village') {
    const sg = c.createRadialGradient(810, 70, 10, 810, 70, 90);
    sg.addColorStop(0, 'rgba(255,245,180,0.9)'); sg.addColorStop(1, 'rgba(255,245,180,0)');
    c.fillStyle = sg; circle(c, 810, 70, 90); c.fill();
    c.fillStyle = '#fff3b0'; circle(c, 810, 70, 32); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.92)';
    for (const cl of BG.clouds) {
      const cx = ((cl.x + time * cl.v) % (W + 200)) - 100;
      c.beginPath(); c.ellipse(cx, cl.y, cl.w, cl.w * 0.3, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(cx - cl.w * 0.4, cl.y + 4, cl.w * 0.5, cl.w * 0.25, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(cx + cl.w * 0.2, cl.y - cl.w * 0.18, cl.w * 0.45, cl.w * 0.3, 0, 0, Math.PI * 2); c.fill();
    }
    hills('#dbe9f5', 46, 22, 0.011, 0.7);
    hills('#f3f9ff', 24, 12, 0.019, 2.1);
  } else if (themeKey === 'forest') {
    c.fillStyle = 'rgba(255,214,140,0.9)'; circle(c, 480, HORIZON - 30, 70); c.fill();
    const peaks = [[60, 95], [210, 60], [380, 105], [560, 50], [730, 90], [900, 65]];
    for (const [px, ph] of peaks) {
      c.fillStyle = '#5e4f93';
      c.beginPath(); c.moveTo(px - 150, HORIZON); c.lineTo(px, HORIZON - ph - 40); c.lineTo(px + 150, HORIZON); c.closePath(); c.fill();
      c.fillStyle = '#f4f1ff';
      c.beginPath(); c.moveTo(px - 33, HORIZON - ph - 31 + 22); c.lineTo(px, HORIZON - ph - 40); c.lineTo(px + 33, HORIZON - ph - 31 + 22);
      c.lineTo(px + 12, HORIZON - ph - 14); c.lineTo(px, HORIZON - ph - 20); c.lineTo(px - 12, HORIZON - ph - 14); c.closePath(); c.fill();
    }
    c.fillStyle = '#24344f';
    for (const t of BG.trees) {
      c.beginPath(); c.moveTo(t.x - t.h * 0.3, HORIZON + 1); c.lineTo(t.x, HORIZON - t.h); c.lineTo(t.x + t.h * 0.3, HORIZON + 1); c.closePath(); c.fill();
    }
  } else {
    for (const st of BG.stars) {
      c.globalAlpha = 0.45 + 0.55 * Math.abs(Math.sin(time * 1.5 + st.p));
      c.fillStyle = '#ffffff'; circle(c, st.x, st.y, st.s); c.fill();
    }
    c.globalAlpha = 1;
    const mg = c.createRadialGradient(800, 80, 20, 800, 80, 90);
    mg.addColorStop(0, 'rgba(255,246,213,0.5)'); mg.addColorStop(1, 'rgba(255,246,213,0)');
    c.fillStyle = mg; circle(c, 800, 80, 90); c.fill();
    c.fillStyle = '#fff6d5'; circle(c, 800, 80, 34); c.fill();
    c.fillStyle = 'rgba(220,210,170,0.6)'; circle(c, 790, 70, 7); c.fill(); circle(c, 812, 92, 5); c.fill();
    // a sleigh silhouette crosses the moon now and then
    const sx = ((time * 60) % 2400) - 200;
    if (sx < W + 100) {
      c.fillStyle = 'rgba(8,18,56,0.9)';
      const sy = 60 + Math.sin(sx * 0.01) * 12;
      for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(sx - i * 22, sy + 4, 8, 4, 0, 0, Math.PI * 2); c.fill(); }
      c.fillRect(sx + 10, sy, 26, 8);
    }
    for (const b of BG.buildings) {
      c.fillStyle = '#1a2558'; c.fillRect(b.x, HORIZON - b.h, b.w, b.h + 2);
      c.fillStyle = '#ffd86b';
      for (const [wx, wy] of b.windows) c.fillRect(wx, wy, 6, 7);
    }
  }

  function hills(color, base, amp, freq, phase) {
    c.fillStyle = color;
    c.beginPath(); c.moveTo(0, HORIZON + 2);
    for (let x = 0; x <= W; x += 16) c.lineTo(x, HORIZON - base - amp * Math.sin(x * freq + phase) - amp * 0.5 * Math.sin(x * freq * 2.7 + phase * 3));
    c.lineTo(W, HORIZON + 2); c.closePath(); c.fill();
  }
}

function drawRoad(th) {
  const c = ctx;
  c.fillStyle = th.ground; c.fillRect(0, HORIZON, W, H - HORIZON);
  const zFar = SPAWN_Z + 80, zNear = -1.8;
  const quad = (x0, x1, z0, z1, color) => {
    const a = project(x0, z0), b = project(x1, z0), cc = project(x1, z1), d = project(x0, z1);
    c.fillStyle = color;
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(cc.x, cc.y); c.lineTo(d.x, d.y); c.closePath(); c.fill();
  };
  quad(-ROAD_HALF, ROAD_HALF, zNear, zFar, th.road);
  const SEG = 4;
  const k0 = Math.floor((distance + zNear) / SEG), k1 = Math.ceil((distance + zFar) / SEG);
  for (let k = k0; k <= k1; k++) {
    const z0 = Math.max(zNear, k * SEG - distance), z1 = Math.min(zFar, (k + 1) * SEG - distance);
    if (z1 <= z0) continue;
    const curb = k % 2 === 0 ? th.curbA : th.curbB;
    quad(-ROAD_HALF - 26, -ROAD_HALF, z0, z1, curb);
    quad(ROAD_HALF, ROAD_HALF + 26, z0, z1, curb);
    if (th.tiles) quad(-ROAD_HALF, ROAD_HALF, z0, Math.min(z1, z0 + 0.35), 'rgba(0,0,0,0.18)');
    if (k % 2 === 0) {
      const zd = Math.min(z1, z0 + SEG * 0.6);
      quad(-LANE_W / 2 - 4, -LANE_W / 2 + 4, z0, zd, th.stripe);
      quad(LANE_W / 2 - 4, LANE_W / 2 + 4, z0, zd, th.stripe);
    }
  }
  const g = c.createLinearGradient(0, HORIZON - 2, 0, HORIZON + 70);
  g.addColorStop(0, `rgba(${th.fog},1)`); g.addColorStop(1, `rgba(${th.fog},0)`);
  c.fillStyle = g; c.fillRect(0, HORIZON - 2, W, 72);
}

function drawThing(o) {
  const xw = o.isScenery ? o.x : o.type === 'finish' ? 0 : (o.lane - 1) * LANE_W;
  const p = project(xw, o.z);
  if (p.s < 0.035) return;
  const c = ctx, th = THEMES[themeKey];
  c.save();
  c.globalAlpha = clamp((SPAWN_Z + 10 - o.z) / 18, 0, 1);
  switch (o.type) {
    case 'scenery':
      if (o.kind === 'pine') drawPine(c, p.x, p.y, p.s, o, th.pine, th.lights);
      else if (o.kind === 'lamp') drawLamp(c, p.x, p.y, p.s, o);
      else if (o.kind === 'cottage') drawCottage(c, p.x, p.y, p.s, o);
      else if (o.kind === 'snowman') drawSnowman(c, p.x, p.y, p.s, o);
      else if (o.kind === 'chimney') drawChimney(c, p.x, p.y, p.s, o);
      break;
    case 'bauble': drawBauble(c, p.x, p.y, p.s, o); break;
    case 'santa': drawSanta(c, p.x, p.y, p.s, o); break;
    case 'candy': drawCandy(c, p.x, p.y, p.s, o); break;
    case 'sleigh': drawSleigh(c, p.x, p.y, p.s, o); break;
    case 'present': drawPresent(c, p.x, p.y, p.s, o); break;
    case 'snowball': drawSnowball(c, p.x, p.y, p.s, o); break;
    case 'grumple': drawGrumple(c, p.x, p.y, p.s, o); break;
    case 'finish': drawFinish(c, o.z); break;
  }
  c.restore();
}

function drawPlayer() {
  const c = ctx, x = playerScreenX(), y = PLAYER_Y;
  const sh = 1 - Math.min(0.6, jumpH / 250);
  shadow(c, x, y + 2, 34 * sh, 9 * sh, 0.22);
  c.save();
  if (invuln > 0 && Math.floor(time * 14) % 2 === 0) c.globalAlpha = 0.35;
  const cx = x, cy = y - jumpH - 60;
  if (state === 'dying') {
    c.translate(cx, cy); c.rotate((1 - dyingT / 1.6) * Math.PI * 0.5); c.translate(-cx, -cy);
  } else {
    c.translate(cx, cy); c.rotate((targetLane - lanePos) * 0.18); c.translate(-cx, -cy);
  }
  const bounce = jumpH > 0 ? 0 : -Math.abs(Math.sin(runPhase)) * 4;
  drawElf(c, x, y - jumpH + bounce, 1, runPhase, jumpH > 0);
  c.restore();
  if (state === 'dying') {
    for (let i = 0; i < 3; i++) {
      const a = time * 5 + (i * Math.PI * 2) / 3;
      drawStar(c, x + Math.cos(a) * 34, y - 170 + Math.sin(a) * 10, 9, '#ffd34d');
    }
  }
}

function render() {
  const c = ctx, th = THEMES[themeKey];
  c.setTransform(pxScale, 0, 0, pxScale, 0, 0);
  c.save();
  if (shakeT > 0) c.translate(rand(-8, 8) * shakeT * 2, rand(-6, 6) * shakeT * 2);
  drawSky(th);
  drawRoad(th);
  const list = scenery.concat(objects).sort((a, b) => b.z - a.z);
  for (const o of list) if (o.z >= 0) drawThing(o);
  drawPlayer();
  for (const o of list) if (o.z < 0) drawThing(o);

  for (const p of particles) {
    c.globalAlpha = clamp(p.life / p.max, 0, 1);
    c.fillStyle = p.color; circle(c, p.x, p.y, p.r); c.fill();
  }
  c.globalAlpha = 1;
  for (const p of popups) {
    c.globalAlpha = clamp(p.life / 0.4, 0, 1);
    outlinedText(c, p.text, p.x, p.y, p.size, p.color);
  }
  c.globalAlpha = 1;

  c.fillStyle = 'rgba(255,255,255,0.85)';
  for (const f of snow) { circle(c, f.x, f.y, f.r); c.fill(); }

  if (boost > 0 && state === 'playing') {
    c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 3;
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2, r1 = rand(200, 320), r2 = r1 + rand(60, 160);
      line(c, W / 2 + Math.cos(a) * r1, 300 + Math.sin(a) * r1 * 0.6, W / 2 + Math.cos(a) * r2, 300 + Math.sin(a) * r2 * 0.6);
    }
  }
  c.restore();

  if (['playing', 'paused', 'dying', 'levelDone'].includes(state)) drawHUD();
  if (state === 'playing' && bannerT > 0) drawBanner();
  if (flashT > 0) { c.fillStyle = `rgba(255,60,60,${flashT})`; c.fillRect(0, 0, W, H); }
}

function panel(x, y, w, h) {
  const c = ctx;
  c.fillStyle = 'rgba(255,255,255,0.9)';
  rrect(c, x, y, w, h, 16); c.fill();
  c.strokeStyle = 'rgba(31,35,64,0.25)'; c.lineWidth = 2; c.stroke();
}

function drawHUD() {
  const c = ctx, lvl = LEVELS[levelIdx];
  // score + streak
  panel(14, 12, 250, 66);
  drawStar(c, 44, 45, 18, '#f5b400');
  c.font = font(34); c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = '#1f2340';
  c.fillText(String(score), 70, 46);
  for (let i = 0; i < STREAK_FOR_BONUS; i++) {
    c.fillStyle = i < Math.min(streak, STREAK_FOR_BONUS) ? '#f5b400' : '#d5dbe8';
    circle(c, 184 + i * 15, 32, 5.5); c.fill();
  }
  if (mult > 1) {
    const pul = 1 + 0.06 * Math.sin(time * 8);
    c.save(); c.translate(214, 58); c.scale(pul, pul);
    c.fillStyle = '#e23b3b'; rrect(c, -36, -11, 72, 22, 11); c.fill();
    outlinedText(c, 'x2 POINTS', 0, 1, 14, '#ffffff', '#9e1f1f');
    c.restore();
  } else {
    c.font = font(13, 600); c.textAlign = 'center'; c.fillStyle = '#7a7fa0';
    c.fillText('streak', 214, 56);
  }

  // lives
  const lw = 24 + lives * 30;
  panel(W - 14 - lw, 12, lw, 54);
  for (let i = 0; i < lives; i++) drawHeart(c, W - 14 - lw + 27 + i * 30, 38, 11, '#ff4d6d');

  // level progress
  const px = 330, pw = 300;
  panel(px, 12, pw, 58);
  c.font = font(17); c.textAlign = 'center'; c.fillStyle = '#1f2340';
  c.fillText(`Level ${levelIdx + 1}: ${lvl.name}`, px + pw / 2, 30);
  const prog = clamp(distance / lvl.length, 0, 1);
  const bx = px + 18, bw = pw - 50, by = 46;
  c.fillStyle = '#d5dbe8'; rrect(c, bx, by, bw, 12, 6); c.fill();
  c.fillStyle = '#2fa84f'; rrect(c, bx, by, Math.max(12, bw * prog), 12, 6); c.fill();
  c.fillStyle = '#e23b3b'; c.beginPath(); c.moveTo(bx + bw + 8, by - 8); c.lineTo(bx + bw + 24, by - 2); c.lineTo(bx + bw + 8, by + 4); c.closePath(); c.fill();
  c.strokeStyle = OUT; c.lineWidth = 2; line(c, bx + bw + 8, by - 8, bx + bw + 8, by + 14);
  c.fillStyle = '#e23b3b'; c.strokeStyle = OUT; circle(c, bx + bw * prog, by + 6, 9); c.fill(); c.stroke();

  // difficulty tag
  c.font = font(14, 600); c.textAlign = 'center'; c.fillStyle = 'rgba(255,255,255,0.95)';
  outlinedText(c, DIFFICULTY[diffKey].label, px + pw / 2, 84, 15, '#ffffff', 'rgba(20,30,60,0.8)');

  if (boost > 0) {
    outlinedText(c, 'SUPER SPEED!', W / 2, H - 46, 30, '#7fd8ff');
    c.fillStyle = 'rgba(255,255,255,0.8)'; rrect(c, W / 2 - 80, H - 26, 160, 10, 5); c.fill();
    c.fillStyle = '#4dabff'; rrect(c, W / 2 - 80, H - 26, 160 * (boost / BOOST_TIME), 10, 5); c.fill();
  }
}

function drawBanner() {
  const lvl = LEVELS[levelIdx];
  if (bannerT > 0.9) {
    const a = clamp((2.8 - bannerT) / 0.25, 0, 1);
    ctx.save(); ctx.globalAlpha = a;
    panel(W / 2 - 230, 150, 460, 120);
    outlinedText(ctx, `Level ${levelIdx + 1}`, W / 2, 184, 28, '#e23b3b', '#ffffff');
    outlinedText(ctx, lvl.name, W / 2, 230, 44, '#2fa84f', '#ffffff');
    ctx.restore();
  } else {
    const k = 1 - bannerT / 0.9;
    ctx.save(); ctx.globalAlpha = clamp(bannerT / 0.3, 0, 1);
    outlinedText(ctx, 'GO!', W / 2, 220, 70 + k * 40, '#ffd34d');
    ctx.restore();
  }
}

// Icons for the "how to play" legend on the title screen.
function drawIcons() {
  document.querySelectorAll('canvas[data-icon]').forEach((cv) => {
    cv.width = 128; cv.height = 128;
    const c = cv.getContext('2d'), o = { seed: 1.5, variant: 0, size: 1 };
    const type = cv.dataset.icon;
    const spec = { bauble: [118, 1.35], santa: [116, 1.2], candy: [122, 1.15], sleigh: [94, 1.15],
      present: [118, 1.25], snowball: [110, 1.45], grumple: [124, 0.8] }[type];
    c.clearRect(0, 0, 128, 128);
    const fn = { bauble: drawBauble, santa: drawSanta, candy: drawCandy, sleigh: drawSleigh,
      present: drawPresent, snowball: drawSnowball, grumple: drawGrumple }[type];
    if (fn) fn(c, 64, spec[0], spec[1], o);
  });
}

// ==========================================================================
//  GAME FLOW + SCREENS
// ==========================================================================
const $ = (id) => document.getElementById(id);
const SCREENS = ['screen-title', 'screen-level', 'screen-end', 'screen-board', 'screen-pause'];
let boardFromTitle = false, boardDiff = 'easy', boardHighlight = -1;

function showScreen(id) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
}
function setState(s) {
  state = s;
  $('btn-pause').classList.toggle('hidden', s !== 'playing');
}

function startGame(d) {
  Sound.sfx('click');
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  diffKey = d;
  score = 0; lives = START_LIVES; streak = 0; mult = 1; levelIdx = 0; won = false;
  startLevel();
}

function startLevel() {
  const lvl = LEVELS[levelIdx];
  themeKey = lvl.theme;
  objects = []; scenery = []; particles = []; popups = [];
  distance = 0; boost = 0; invuln = 0; speed = 0;
  lanePos = targetLane = 1; jumpH = jumpV = 0;
  nextRowAt = 70; nextSceneryAt = -4; finishSpawned = false; prevFree = [0, 1, 2];
  while (nextSceneryAt < SPAWN_Z) { spawnScenery(nextSceneryAt); nextSceneryAt += 8; }
  bannerT = 2.8;
  showScreen(null);
  setState('playing');
  Sound.playSong(lvl.song);
}

function levelComplete() {
  const bonus = LEVEL_BONUS * (levelIdx + 1);
  score += bonus;
  objects = objects.filter((o) => o.type === 'finish');
  boost = 0;
  Sound.stopSong();
  const confetti = ['#e23b3b', '#ffd34d', '#2fa84f', '#4dabff', '#ff7ae0', '#ffffff'];
  for (let i = 0; i < 4; i++) burst(rand(200, 760), rand(120, 260), confetti, 20, 380);
  if (levelIdx === LEVELS.length - 1) {
    Sound.sfx('victory');
    showEnd(true);
    return;
  }
  Sound.sfx('level');
  setState('levelDone');
  $('level-title').textContent = `Level ${levelIdx + 1} complete!`;
  $('level-detail').innerHTML = '';
  const lines = [`Level bonus: +${bonus}`, `Score so far: ${score}`, `Next up: ${LEVELS[levelIdx + 1].name}`];
  lines.forEach((t, i) => { if (i) $('level-detail').appendChild(document.createElement('br')); $('level-detail').appendChild(document.createTextNode(t)); });
  showScreen('screen-level');
  setTimeout(() => { if (state === 'levelDone') $('btn-next').focus(); }, 50);
}

function nextLevel() {
  Sound.sfx('click');
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  levelIdx++;
  startLevel();
}

function showEnd(didWin) {
  won = didWin;
  setState('end');
  Sound.playSong('title');
  $('end-title').textContent = didWin ? 'You saved Christmas! 🎄' : 'Game Over';
  $('end-score').textContent = score;
  $('end-detail').textContent = didWin
    ? `You finished all ${LEVELS.length} levels on ${DIFFICULTY[diffKey].label}!`
    : `${DIFFICULTY[diffKey].label} · you reached level ${levelIdx + 1}`;
  $('name-error').textContent = '';
  const canSave = score > 0;
  $('name-form').classList.toggle('hidden', !canSave);
  $('end-actions').classList.toggle('hidden', canSave);
  $('btn-save').disabled = false;
  $('btn-save').textContent = 'Save my score';
  $('name-input').value = store('elfdash-name') || '';
  showScreen('screen-end');
  if (canSave && !('ontouchstart' in window)) setTimeout(() => $('name-input').focus(), 60);
}

async function saveScore(e) {
  e.preventDefault();
  const v = validateName($('name-input').value);
  if (!v.ok) { $('name-error').textContent = v.message; return; }
  store('elfdash-name', v.name);
  $('btn-save').disabled = true;
  $('btn-save').textContent = 'Saving…';
  const res = await Leaderboard.submit(diffKey, { name: v.name, score, level: levelIdx + 1, won });
  if (res.error) {
    $('name-error').textContent = res.error;
    $('btn-save').disabled = false;
    $('btn-save').textContent = 'Save my score';
    return;
  }
  Sound.sfx('click');
  showBoard(diffKey, false, res);
}

async function showBoard(d, fromTitle, preloaded) {
  boardFromTitle = fromTitle;
  boardDiff = d;
  boardHighlight = preloaded && typeof preloaded.rank === 'number' ? preloaded.rank : -1;
  setState('board');
  if (state === 'board' && fromTitle) themeKey = 'village';
  $('btn-board-again').classList.toggle('hidden', fromTitle);
  $('btn-board-menu').textContent = fromTitle ? 'Back' : 'Main menu';
  $('btn-board-menu').toggleAttribute('data-primary', fromTitle);
  showScreen('screen-board');
  await loadBoard(d, preloaded);
}

async function loadBoard(d, preloaded) {
  boardDiff = d;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.diff === d));
  $('board-note').textContent = 'Loading…';
  const res = preloaded && preloaded.entries ? preloaded : await Leaderboard.load(d);
  if (boardDiff !== d) return; // user switched tab while loading
  const highlight = preloaded ? boardHighlight : -1;
  renderBoard(res.entries || [], highlight);
  const notes = [];
  if (!res.entries || res.entries.length === 0) notes.push('No scores yet. Be the first!');
  if (preloaded && boardHighlight === -1) notes.push('Not in the top 10 this time. Keep trying!');
  if (preloaded && boardHighlight === 0) notes.push('🎉 NEW TOP SCORE! 🎉');
  if (!res.online) notes.push('(Scores are saved on this device only.)');
  $('board-note').textContent = notes.join('  ');
}

function renderBoard(entries, highlight) {
  const podium = $('podium');
  podium.innerHTML = '';
  for (const i of [1, 0, 2]) {
    const e = entries[i];
    const div = document.createElement('div');
    div.className = `place p${i + 1}` + (i === highlight ? ' me' : '');
    const medal = document.createElement('div'); medal.className = 'medal'; medal.textContent = ['🥇', '🥈', '🥉'][i];
    const name = document.createElement('div'); name.className = 'pname'; name.textContent = e ? e.name : '—';
    const sc = document.createElement('div'); sc.className = 'pscore'; sc.textContent = e ? `${e.score} pts` : '';
    const block = document.createElement('div'); block.className = 'block'; block.textContent = String(i + 1);
    div.append(medal, name, sc, block);
    podium.appendChild(div);
  }
  const ol = $('board-rest');
  ol.innerHTML = '';
  for (let i = 3; i < 10; i++) {
    const e = entries[i];
    const li = document.createElement('li');
    if (!e) li.classList.add('empty');
    if (i === highlight) li.classList.add('me');
    const r = document.createElement('span'); r.className = 'rank'; r.textContent = `${i + 1}.`;
    const n = document.createElement('span'); n.className = 'rname'; n.textContent = e ? e.name : '—';
    const s = document.createElement('span'); s.className = 'rscore'; s.textContent = e ? e.score : '';
    li.append(r, n, s);
    ol.appendChild(li);
  }
}

function goTitle() {
  Sound.resume();
  objects = []; popups = [];
  themeKey = 'village';
  boost = 0; invuln = 0; jumpH = jumpV = 0;
  setState('title');
  showScreen('screen-title');
  Sound.playSong('title');
}

function togglePause() {
  if (state === 'playing') {
    setState('paused');
    Sound.pause();
    showScreen('screen-pause');
    setTimeout(() => $('btn-resume').focus(), 50);
  } else if (state === 'paused') {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    showScreen(null);
    setState('playing');
    Sound.resume();
  }
}

function refreshMuteButton() {
  $('btn-mute').textContent = Sound.isMuted() ? '🔇' : '🔊';
  $('btn-mute').setAttribute('aria-label', Sound.isMuted() ? 'Turn sound on' : 'Turn sound off');
}

// ==========================================================================
//  INPUT
// ==========================================================================
function moveLane(dir) {
  const t = clamp(targetLane + dir, 0, 2);
  if (t !== targetLane) { targetLane = t; Sound.sfx('lane'); }
}
function jump() {
  if (jumpH === 0 && jumpV === 0) { jumpV = JUMP_V; Sound.sfx('jump'); }
}

let audioUnlocked = false;
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  Sound.ensure();
  if (state === 'title' || state === 'board' || state === 'end') Sound.playSong('title');
}

window.addEventListener('keydown', (e) => {
  unlockAudio();
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT') return;
  const k = e.key;
  if (k === 'm' || k === 'M') { refreshMuteButton(Sound.toggleMute()); return; }

  if (state === 'playing') {
    if (e.repeat) { if ([' ', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault(); return; }
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') { moveLane(-1); e.preventDefault(); }
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') { moveLane(1); e.preventDefault(); }
    else if (k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W') { jump(); e.preventDefault(); }
    else if (k === 'p' || k === 'P' || k === 'Escape') togglePause();
    return;
  }
  if (state === 'paused' && (k === 'p' || k === 'P' || k === 'Escape')) { togglePause(); return; }
  if (state === 'title' && ['1', '2', '3'].includes(k)) { startGame(['easy', 'medium', 'hard'][+k - 1]); return; }
  if (k === 'Enter' && (!document.activeElement || document.activeElement.tagName !== 'BUTTON')) {
    const scr = SCREENS.map($).find((s) => !s.classList.contains('hidden'));
    const btn = scr && [...scr.querySelectorAll('[data-primary]')].find((b) => !b.classList.contains('hidden') && b.offsetParent !== null);
    if (btn) { e.preventDefault(); btn.click(); }
  }
});

// Touch / mouse on the play area: swipe to change lane, tap to jump.
let touch = null;
canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (state !== 'playing') return;
  touch = { x: e.clientX, y: e.clientY, used: false };
});
canvas.addEventListener('pointermove', (e) => {
  if (!touch || touch.used || state !== 'playing') return;
  const th = canvas.getBoundingClientRect().width * 0.035;
  const dx = e.clientX - touch.x, dy = e.clientY - touch.y;
  if (Math.abs(dx) > th && Math.abs(dx) > Math.abs(dy)) { moveLane(dx > 0 ? 1 : -1); touch.used = true; }
  else if (dy < -th && Math.abs(dy) > Math.abs(dx)) { jump(); touch.used = true; }
});
canvas.addEventListener('pointerup', () => {
  if (touch && !touch.used && state === 'playing') jump();
  touch = null;
});
canvas.addEventListener('pointercancel', () => { touch = null; });
document.addEventListener('pointerdown', unlockAudio);

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') togglePause();
});

// Buttons
document.querySelectorAll('.diff-buttons .btn').forEach((b) => b.addEventListener('click', () => startGame(b.dataset.diff)));
$('btn-title-board').addEventListener('click', () => { Sound.sfx('click'); showBoard(boardDiff, true); });
$('btn-next').addEventListener('click', nextLevel);
$('name-form').addEventListener('submit', saveScore);
$('btn-skip').addEventListener('click', () => { Sound.sfx('click'); showBoard(diffKey, false, null); });
$('btn-end-again').addEventListener('click', () => startGame(diffKey));
$('btn-end-menu').addEventListener('click', () => { Sound.sfx('click'); goTitle(); });
$('btn-board-again').addEventListener('click', () => startGame(diffKey));
$('btn-board-menu').addEventListener('click', () => { Sound.sfx('click'); goTitle(); });
$('btn-resume').addEventListener('click', togglePause);
$('btn-quit').addEventListener('click', () => { Sound.sfx('click'); goTitle(); });
$('btn-pause').addEventListener('click', (e) => { e.currentTarget.blur(); togglePause(); });
$('btn-mute').addEventListener('click', (e) => { unlockAudio(); Sound.toggleMute(); refreshMuteButton(); e.currentTarget.blur(); });
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
  Sound.sfx('click');
  boardHighlight = -1;
  loadBoard(t.dataset.diff, null);
}));

// ==========================================================================
//  BOOT
// ==========================================================================
resize();
window.addEventListener('resize', resize);
if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
refreshMuteButton();
drawIcons();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawIcons);
nextSceneryAt = -4;
while (nextSceneryAt < SPAWN_Z) { spawnScenery(nextSceneryAt); nextSceneryAt += 8; }

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
