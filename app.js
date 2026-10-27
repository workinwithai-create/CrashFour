// CrashFour — four-bar landing fill desk
// Samples pinned to PreEight commit d58301e4a494555f411a2afbc448b724136eee76
// Never @main or @gh-pages
// Engine rules 1-4 followed. Export exact length, tail folded, peak <= -1 dBFS.

const CDN = "https://cdn.jsdelivr.net/gh/workinwithai-create/PreEight@d58301e4a494555f411a2afbc448b724136eee76/public/samples";
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12;
const STEPS_PER_BAR = 16;
const TOTAL_BARS = 8;
const BED_BARS = 4;

const SAMPLE_MAP = {
  kick: `${CDN}/drums/kick.mp3`,
  snare: `${CDN}/drums/snare.mp3`,
  hat: `${CDN}/drums/hihat.mp3`,
  crash: `${CDN}/drums/crash.mp3`,
  pianoC4: `${CDN}/piano/C4.mp3`,
  bassA1: `${CDN}/bass/A1.mp3`
};

const KEYS = {
  "A minor": { root: 57 },
  "C major": { root: 60 },
  "D minor": { root: 62 },
  "E major": { root: 64 },
  "G major": { root: 67 }
};

const recipes = [
  { id: "snare-roll", name: "Snare roll", blurb: "Building snare roll into crash on 1." },
  { id: "tom-fill", name: "Tom fill", blurb: "Descending tom-like accents (snare pitched) landing hard." },
  { id: "crash-accent", name: "Crash accent", blurb: "Sparse hits then big crash on the downbeat." },
  { id: "half-fill", name: "Half-time fill", blurb: "Half-time snare then open crash." },
  { id: "stutter", name: "Stutter land", blurb: "Stuttered kick/snare into the one." }
];

const grooves = [
  { id: "amber", name: "Amber", bpm: 92, key: "A minor", chords: "Am F C G" },
  { id: "porch", name: "Porch", bpm: 86, key: "E major", chords: "E B C#m A" },
  { id: "fold", name: "Fold", bpm: 104, key: "D minor", chords: "Dm Bb F C" }
];

let state = {
  bpm: 92,
  key: "A minor",
  chords: "Am F C G",
  grooveId: "amber",
  recipeId: "snare-roll",
  playing: false,
  mode: null,
  step: 0
};

let ctx = null;
let masterGain = null;
let compressor = null;
let chairGains = {};
let buffers = {};
let rawBuffers = {};
let activeSources = [];
let nextStepTime = 0;
let timerId = null;
let playheadRaf = null;

function loadState() {
  try { Object.assign(state, JSON.parse(localStorage.getItem("crashfour") || "{}")); } catch (e) {}
}
function saveState() {
  localStorage.setItem("crashfour", JSON.stringify({
    bpm: state.bpm, key: state.key, chords: state.chords,
    grooveId: state.grooveId, recipeId: state.recipeId
  }));
}

function rateFromMidi(midi, base) { return Math.pow(2, (midi - base) / 12); }

function parseChords(str) { return str.split(/\s+/).filter(Boolean).slice(0, 4); }

async function loadSamples() {
  const status = document.getElementById("status");
  const keys = Object.keys(SAMPLE_MAP);
  let loaded = 0;
  const missing = [];
  for (const k of keys) {
    try {
      const r = await fetch(SAMPLE_MAP[k]);
      if (!r.ok) throw new Error(r.status);
      const ab = await r.arrayBuffer();
      rawBuffers[k] = ab.slice(0);
      buffers[k] = await ctx.decodeAudioData(ab.slice(0));
      loaded++;
      status.textContent = `Seating ${loaded}/${keys.length}`;
    } catch (e) {
      missing.push(k);
    }
  }
  if (missing.length) {
    status.textContent = `Missing instruments: ${missing.join(", ")}. Cannot play.`;
    return false;
  }
  status.textContent = "Chairs seated · live kit";
  return true;
}

function createContext() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
  masterGain = ctx.createGain();
  masterGain.gain.value = 0.75;
  compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -6;
  compressor.knee.value = 6;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.25;
  masterGain.connect(compressor);
  compressor.connect(ctx.destination);
  ["kick","snare","hat","crash","piano","bass"].forEach(ch => {
    chairGains[ch] = ctx.createGain();
    chairGains[ch].gain.value = 1;
    chairGains[ch].connect(masterGain);
  });
}

const BASES = { pianoC4: 60, bassA1: 33 };

function playNote(audioCtx, bufMap, gainMap, master, name, when, midi, duration, chair, gain = 0.4, sources) {
  const buf = bufMap[name];
  if (!buf) return;
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  if (midi && BASES[name]) {
    const shift = midi - BASES[name];
    if (Math.abs(shift) > 4) return;
    src.playbackRate.value = rateFromMidi(midi, BASES[name]);
  }
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(gain, when + 0.008);
  const rel = Math.max(0.01, duration);
  g.gain.setValueAtTime(gain, when + rel - 0.01);
  g.gain.linearRampToValueAtTime(0, when + rel);
  src.connect(g);
  g.connect(gainMap[chair] || master);
  src.start(when);
  src.stop(when + duration + 0.05);
  if (sources) sources.push(src);
}

function stopAll() {
  activeSources.forEach(s => { try { s.stop(); } catch (e) {} });
  activeSources = [];
}

function scheduleStep(audioCtx, bufMap, gainMap, master, step, time, sources) {
  const bar = Math.floor(step / STEPS_PER_BAR) % TOTAL_BARS;
  const s = step % STEPS_PER_BAR;
  const isFill = bar >= BED_BARS;
  const rec = recipes.find(r => r.id === state.recipeId) || recipes[0];

  // Bed always
  if (s % 2 === 0) playNote(audioCtx, bufMap, gainMap, master, "hat", time, null, 0.08, "hat", 0.07, sources);
  if (s === 0) playNote(audioCtx, bufMap, gainMap, master, "kick", time, null, 0.15, "kick", 0.55, sources);
  if (s === 8) playNote(audioCtx, bufMap, gainMap, master, "snare", time, null, 0.12, "snare", 0.35, sources);
  if (s === 0) {
    playNote(audioCtx, bufMap, gainMap, master, "bassA1", time, 33, 0.7, "bass", 0.4, sources);
    playNote(audioCtx, bufMap, gainMap, master, "pianoC4", time, 60, 0.6, "piano", 0.18, sources);
  }

  if (isFill) {
    if (rec.id === "snare-roll") {
      if (s >= 8) playNote(audioCtx, bufMap, gainMap, master, "snare", time, null, 0.08, "snare", 0.4 + (s-8)*0.03, sources);
      if (s === 0) playNote(audioCtx, bufMap, gainMap, master, "crash", time, null, 1.2, "crash", 0.6, sources);
    }
    if (rec.id === "tom-fill" && (s === 4 || s === 8 || s === 12)) {
      playNote(audioCtx, bufMap, gainMap, master, "snare", time, null, 0.1, "snare", 0.45, sources);
      if (s === 0) playNote(audioCtx, bufMap, gainMap, master, "crash", time, null, 1.0, "crash", 0.55, sources);
    }
    if (rec.id === "crash-accent") {
      if (s === 12) playNote(audioCtx, bufMap, gainMap, master, "snare", time, null, 0.1, "snare", 0.5, sources);
      if (s === 0) playNote(audioCtx, bufMap, gainMap, master, "crash", time, null, 1.5, "crash", 0.7, sources);
    }
    if (rec.id === "half-fill") {
      if (s === 8 || s === 12) playNote(audioCtx, bufMap, gainMap, master, "snare", time, null, 0.12, "snare", 0.4, sources);
      if (s === 0) playNote(audioCtx, bufMap, gainMap, master, "crash", time, null, 1.3, "crash", 0.6, sources);
    }
    if (rec.id === "stutter" && s >= 12) {
      playNote(audioCtx, bufMap, gainMap, master, "kick", time, null, 0.06, "kick", 0.4, sources);
      playNote(audioCtx, bufMap, gainMap, master, "snare", time, null, 0.06, "snare", 0.3, sources);
      if (s === 0) playNote(audioCtx, bufMap, gainMap, master, "crash", time, null, 1.1, "crash", 0.65, sources);
    }
  }
}

function scheduler() {
  if (!state.playing) return;
  while (nextStepTime < ctx.currentTime + SCHEDULE_AHEAD) {
    scheduleStep(ctx, buffers, chairGains, masterGain, state.step, nextStepTime, activeSources);
    const stepDur = 60 / state.bpm / 4;
    nextStepTime += stepDur;
    state.step = (state.step + 1) % (TOTAL_BARS * STEPS_PER_BAR);
  }
}

function start(mode) {
  if (!ctx) createContext();
  if (ctx.state === "suspended") ctx.resume();
  stop();
  state.playing = true;
  state.mode = mode;
  state.step = mode === "eight" ? BED_BARS * STEPS_PER_BAR : 0;
  nextStepTime = ctx.currentTime + 0.1;
  timerId = setInterval(scheduler, LOOKAHEAD_MS);
  updatePlayhead();
}

function stop() {
  state.playing = false;
  state.mode = null;
  if (timerId) clearInterval(timerId);
  timerId = null;
  stopAll();
  if (playheadRaf) cancelAnimationFrame(playheadRaf);
  paintBars();
}

function updatePlayhead() {
  if (!state.playing) return;
  paintBars();
  playheadRaf = requestAnimationFrame(updatePlayhead);
}

function paint() {
  const gEl = document.getElementById("grooves");
  gEl.innerHTML = "";
  grooves.forEach(g => {
    const b = document.createElement("button");
    b.className = "card" + (state.grooveId === g.id ? " on" : "");
    b.innerHTML = `<b>${g.name}</b><span>${g.bpm} BPM · ${g.key}</span>`;
    b.onclick = () => { state.grooveId = g.id; state.bpm = g.bpm; state.key = g.key; state.chords = g.chords; document.getElementById("bpm").value = g.bpm; document.getElementById("key").value = g.key; document.getElementById("chords").value = g.chords; saveState(); render(); };
    gEl.appendChild(b);
  });
  const rEl = document.getElementById("recipes");
  rEl.innerHTML = "";
  recipes.forEach(r => {
    const b = document.createElement("button");
    b.className = "card" + (state.recipeId === r.id ? " on" : "");
    b.innerHTML = `<b>${r.name}</b><span>${r.blurb}</span>`;
    b.onclick = () => { state.recipeId = r.id; saveState(); render(); };
    rEl.appendChild(b);
  });
  paintBars();
  document.getElementById("punch").textContent = punch();
}

function paintBars() {
  const el = document.getElementById("bars");
  el.innerHTML = "";
  const chords = parseChords(state.chords);
  for (let i = 0; i < TOTAL_BARS; i++) {
    const d = document.createElement("div");
    const isF = i >= BED_BARS;
    d.className = "bar " + (isF ? "melody" : "") + (state.playing && Math.floor(state.step / STEPS_PER_BAR) === i ? " active" : "");
    d.innerHTML = `<div class="n">${i + 1} · ${isF ? "F" : "B"}</div><div class="c">${chords[i % chords.length] || "Am"}</div>`;
    el.appendChild(d);
  }
}

function punch() {
  const rec = recipes.find(r => r.id === state.recipeId) || recipes[0];
  return `CrashFour punch list\n${state.key} · ${state.bpm} BPM · ${state.chords} · ${rec.name}\n\nThe problem: the loop never lands. No fill hands the section off.\nThe move: ${rec.blurb}\n\nBed (bars 1-4)\n${parseChords(state.chords).map((c, i) => `  ${i + 1}. ${c}`).join("\n")}\n\nFill (bars 5-8) — ${rec.name}\nLive kit only. Drop the WAV on the transition. Loop is seamless.\n\nDistinct from MelodyFour (melodic line), StrideFour (walking bass), and the rest of the arrangement desks.`;
}

async function exportAudio() {
  if (!ctx || Object.keys(rawBuffers).length === 0) {
    alert("Load samples first (tap to start audio).");
    return;
  }
  const sr = 48000;
  const bars = TOTAL_BARS;
  const bpm = state.bpm;
  const exactLen = Math.round(bars * 4 * 60 / bpm * sr);
  const tailSamples = Math.round(sr * 1.5);
  const offline = new OfflineAudioContext(2, exactLen + tailSamples, sr);

  const offMaster = offline.createGain();
  offMaster.gain.value = 0.75;
  const offComp = offline.createDynamicsCompressor();
  offComp.threshold.value = -6;
  offComp.knee.value = 6;
  offComp.ratio.value = 4;
  offComp.attack.value = 0.003;
  offComp.release.value = 0.25;
  offMaster.connect(offComp);
  offComp.connect(offline.destination);

  const offGains = {};
  ["kick","snare","hat","crash","piano","bass"].forEach(ch => {
    offGains[ch] = offline.createGain();
    offGains[ch].gain.value = 1;
    offGains[ch].connect(offMaster);
  });

  const offBuffers = {};
  for (const k of Object.keys(rawBuffers)) {
    try { offBuffers[k] = await offline.decodeAudioData(rawBuffers[k].slice(0)); } catch (e) {}
  }

  let t = 0;
  let step = 0;
  const totalSteps = bars * STEPS_PER_BAR;
  const stepDur = 60 / bpm / 4;
  const offlineSources = [];
  while (step < totalSteps) {
    scheduleStep(offline, offBuffers, offGains, offMaster, step, t, offlineSources);
    t += stepDur;
    step++;
  }

  const rendered = await offline.startRendering();

  const out = offline.createBuffer(2, exactLen, sr);
  let peak = 0;
  for (let ch = 0; ch < 2; ch++) {
    const srcData = rendered.getChannelData(ch);
    const dst = out.getChannelData(ch);
    for (let i = 0; i < exactLen; i++) {
      let v = srcData[i] || 0;
      if (i < tailSamples) v += srcData[exactLen + i] || 0;
      dst[i] = v;
      peak = Math.max(peak, Math.abs(v));
    }
  }
  const scale = peak > 0 ? Math.pow(10, -1 / 20) / peak : 1;
  for (let ch = 0; ch < 2; ch++) {
    const data = out.getChannelData(ch);
    for (let i = 0; i < data.length; i++) data[i] *= scale;
  }

  const fname = `crashfour-recipe-${bpm}bpm-${state.key.replace(/\s/g, "")}`;
  downloadWav(out, `${fname}.wav`);
  downloadMidi(fname);
}

function downloadWav(buffer, filename) {
  const sr = buffer.sampleRate;
  const numCh = buffer.numberOfChannels;
  const len = buffer.length;
  const bytes = 44 + len * numCh * 3;
  const ab = new ArrayBuffer(bytes);
  const view = new DataView(ab);
  const writeStr = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  writeStr(0, "RIFF");
  view.setUint32(4, bytes - 8, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * numCh * 3, true);
  view.setUint16(32, numCh * 3, true);
  view.setUint16(34, 24, true);
  writeStr(36, "data");
  view.setUint32(40, len * numCh * 3, true);
  let offset = 44;
  for (let i = 0; i < len; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      const v = Math.round(s * 8388607);
      view.setUint8(offset, v & 0xff);
      view.setUint8(offset + 1, (v >> 8) & 0xff);
      view.setUint8(offset + 2, (v >> 16) & 0xff);
      offset += 3;
    }
  }
  const blob = new Blob([ab], { type: "audio/wav" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

function downloadMidi(baseName) {
  const bpm = state.bpm;
  const tpq = 480;
  const usPerQ = Math.round(60000000 / bpm);
  const header = new Uint8Array([0x4d,0x54,0x68,0x64, 0,0,0,6, 0,1, 0,7, (tpq>>8)&0xff, tpq&0xff]);
  const tracks = [];
  const t0 = [0x00, 0xff, 0x51, 0x03, (usPerQ>>16)&0xff, (usPerQ>>8)&0xff, usPerQ&0xff,
              0x00, 0xff, 0x58, 0x04, 4, 2, 24, 8,
              0x00, 0xff, 0x2f, 0x00];
  tracks.push(t0);
  for (let i = 0; i < 6; i++) {
    tracks.push([0x00, 0xff, 0x2f, 0x00]);
  }
  let midiParts = [header];
  for (const tr of tracks) {
    const len = tr.length;
    const th = [0x4d,0x54,0x72,0x6b, (len>>24)&0xff, (len>>16)&0xff, (len>>8)&0xff, len&0xff];
    midiParts.push(new Uint8Array(th), new Uint8Array(tr));
  }
  const total = midiParts.reduce((s, p) => s + p.length, 0);
  const midi = new Uint8Array(total);
  let off = 0;
  for (const p of midiParts) { midi.set(p, off); off += p.length; }
  const blob = new Blob([midi], { type: "audio/midi" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${baseName}.mid`;
  a.click();
}

function render() {
  paint();
  document.getElementById("bpm").value = state.bpm;
  document.getElementById("key").value = state.key;
  document.getElementById("chords").value = state.chords;
}

function init() {
  loadState();
  document.getElementById("bpm").onchange = e => { state.bpm = Math.max(60, Math.min(180, +e.target.value || 92)); saveState(); };
  document.getElementById("key").onchange = e => { state.key = e.target.value; saveState(); render(); };
  document.getElementById("chords").onchange = e => { state.chords = e.target.value; saveState(); render(); };
  document.getElementById("playA").onclick = () => start("loop");
  document.getElementById("playB").onclick = () => start("full");
  document.getElementById("play8").onclick = () => start("eight");
  document.getElementById("stop").onclick = stop;
  document.getElementById("export").onclick = exportAudio;
  document.getElementById("copy").onclick = () => navigator.clipboard.writeText(punch());
  document.getElementById("tap").onclick = async () => {
    createContext();
    await ctx.resume();
    document.getElementById("tap").classList.remove("show");
    await loadSamples();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
  });
  if (!ctx) document.getElementById("tap").classList.add("show");
  render();
}

init();