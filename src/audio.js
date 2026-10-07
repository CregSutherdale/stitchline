// Synthesized SFX (WebAudio oscillators + filtered noise) and optional background music.
let ac = null, master = null, sfxBus = null, musicEl = null, musicGain = null;
let soundOn = true, musicOn = true;
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33, 36]; // major pentatonic, 3 octaves

function ctx() {
  if (ac) return ac;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(master);
    sfxBus = ac.createGain(); sfxBus.gain.value = 0.55; sfxBus.connect(comp);
  } catch (e) { ac = null; }
  return ac;
}

export function unlock() {
  const a = ctx();
  if (a && a.state === 'suspended') a.resume().catch(() => {});
  if (musicOn) startMusic();
}

function noiseBuf() {
  if (noiseBuf.b) return noiseBuf.b;
  const len = ac.sampleRate * 0.5, b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return (noiseBuf.b = b);
}

function tone(freq, t0, dur, { type = 'triangle', vol = 0.3, attack = 0.004, bend = 0, cutoff = 6000 } = {}) {
  const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (bend) o.frequency.exponentialRampToValueAtTime(freq * bend, t0 + dur);
  f.type = 'lowpass'; f.frequency.value = cutoff;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(f); f.connect(g); g.connect(sfxBus);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
function noise(t0, dur, { vol = 0.15, freq = 2500, q = 1.2, type = 'bandpass' } = {}) {
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f); f.connect(g); g.connect(sfxBus); s.start(t0, Math.random() * 0.3); s.stop(t0 + dur + 0.02);
}
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

function ok() { return soundOn && ctx() && ac.state === 'running'; }

export const sfx = {
  // Each new hole: a soft fabric "thup" + a plucked note that climbs with progress.
  stitch(progress) {
    if (!ok()) return; const t = ac.currentTime;
    const step = SCALE[Math.min(SCALE.length - 1, Math.floor(progress * (SCALE.length - 1)))];
    noise(t, 0.035, { vol: 0.12, freq: 1800, q: 0.8 });
    tone(midi(67 + step), t, 0.16, { type: 'triangle', vol: 0.22 });
    tone(midi(79 + step), t, 0.07, { type: 'sine', vol: 0.05 });
  },
  back() { if (!ok()) return; const t = ac.currentTime; tone(midi(62), t, 0.09, { type: 'sine', vol: 0.12, bend: 0.8 }); noise(t, 0.02, { vol: 0.05, freq: 900 }); },
  clueOk() { if (!ok()) return; const t = ac.currentTime; tone(midi(88), t, 0.35, { type: 'sine', vol: 0.06 }); tone(midi(95), t + 0.05, 0.4, { type: 'sine', vol: 0.04 }); },
  clueBad() { if (!ok()) return; const t = ac.currentTime; tone(midi(50), t, 0.16, { type: 'square', vol: 0.05, cutoff: 700, bend: 0.85 }); },
  tap() { if (!ok()) return; const t = ac.currentTime; tone(midi(84), t, 0.05, { type: 'sine', vol: 0.08 }); noise(t, 0.015, { vol: 0.04, freq: 4000 }); },
  hint() { if (!ok()) return; const t = ac.currentTime; [0, 4, 7, 12, 16].forEach((s, i) => tone(midi(76 + s), t + i * 0.05, 0.4, { type: 'sine', vol: 0.07 })); },
  undo() { if (!ok()) return; const t = ac.currentTime; tone(midi(69), t, 0.07, { type: 'triangle', vol: 0.1, bend: 0.75 }); },
  win() {
    if (!ok()) return; const t = ac.currentTime;
    const notes = [60, 64, 67, 72, 76, 79, 84];
    notes.forEach((m, i) => { tone(midi(m), t + i * 0.07, 0.9, { type: 'triangle', vol: 0.14 }); tone(midi(m + 12), t + i * 0.07, 0.6, { type: 'sine', vol: 0.05 }); });
    [72, 76, 79].forEach((m) => tone(midi(m), t + 0.6, 1.6, { type: 'sine', vol: 0.07, attack: 0.05 }));
    noise(t + 0.55, 0.9, { vol: 0.05, freq: 7000, q: 0.5, type: 'highpass' });
  },
  full() { if (!ok()) return; const t = ac.currentTime; tone(midi(57), t, 0.25, { type: 'triangle', vol: 0.12 }); tone(midi(55), t + 0.12, 0.3, { type: 'triangle', vol: 0.1 }); },
};

// Music: HydroGene "16-bit RPG Music" tracks (free, credit given in-app), lazily streamed.
const TRACKS = ['music/peaceful-village.m4a', 'music/wood-forest-town.m4a'];
let trackIdx = 0;
function startMusic() {
  if (!musicOn) return;
  try {
    if (!musicEl) {
      musicEl = new Audio(); musicEl.preload = 'none'; musicEl.volume = 0.28;
      musicEl.addEventListener('ended', () => { trackIdx = (trackIdx + 1) % TRACKS.length; musicEl.src = TRACKS[trackIdx]; musicEl.play().catch(() => {}); });
      musicEl.src = TRACKS[trackIdx];
    }
    if (musicEl.paused) musicEl.play().catch(() => {});
  } catch (e) { /* no audio element */ }
}
export function setSound(on) { soundOn = on; }
export function setMusic(on) {
  musicOn = on;
  if (!on && musicEl) musicEl.pause();
  if (on && ac) startMusic();
}
document.addEventListener('visibilitychange', () => {
  if (!musicEl) return;
  if (document.hidden) musicEl.pause(); else if (musicOn && ac) musicEl.play().catch(() => {});
});

export function buzz(ms) {
  try {
    const ua = navigator.userActivation;
    if (ua && !ua.hasBeenActive) return; // browsers block vibration before the first tap
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch (e) { /* unsupported */ }
}
void musicGain;
