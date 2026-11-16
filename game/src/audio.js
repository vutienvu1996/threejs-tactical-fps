// Synthesised sound: every effect is built from oscillators and filtered noise,
// so the game ships no audio files and makes no network request. The context is
// created lazily on the first user gesture (browsers block audio before that).
export function createAudio() {
  let context = null;
  let master = null;
  let noiseBuffer = null;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') void context.resume();
      return context;
    }
    const AudioContext = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContext) return null;
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = 0.42;
    master.connect(context.destination);
    noiseBuffer = context.createBuffer(1, context.sampleRate * 0.5, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return context;
  }

  function noise(duration, filterType, frequency, gainValue, when = 0) {
    const ctx = ensure();
    if (!ctx) return;
    const start = ctx.currentTime + when;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(start);
    source.stop(start + duration + 0.05);
  }

  function tone(type, from, to, duration, gainValue, when = 0) {
    const ctx = ensure();
    if (!ctx) return;
    const start = ctx.currentTime + when;
    const oscillator = ctx.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(gain).connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.05);
  }

  return {
    unlock() {
      ensure();
    },
    shot(kind) {
      if (kind === 'shotgun') {
        noise(0.22, 'lowpass', 900, 0.9);
        tone('sine', 160, 55, 0.18, 0.5);
      } else if (kind === 'marksman') {
        noise(0.3, 'bandpass', 2400, 0.8);
        tone('sine', 220, 60, 0.22, 0.55);
      } else if (kind === 'smg') {
        noise(0.09, 'bandpass', 1800, 0.55);
        tone('square', 190, 90, 0.07, 0.22);
      } else if (kind === 'pistol') {
        noise(0.11, 'bandpass', 1500, 0.6);
        tone('sine', 200, 80, 0.09, 0.35);
      } else {
        noise(0.13, 'bandpass', 2000, 0.7);
        tone('sine', 210, 70, 0.11, 0.4);
      }
    },
    distantShot() {
      noise(0.16, 'lowpass', 500, 0.28);
    },
    dryFire() {
      tone('square', 1200, 900, 0.03, 0.12);
    },
    reload() {
      tone('square', 500, 320, 0.05, 0.14);
      tone('square', 380, 520, 0.05, 0.14, 0.16);
    },
    hit() {
      tone('sine', 1250, 1250, 0.05, 0.3);
    },
    kill() {
      tone('sine', 880, 880, 0.07, 0.3);
      tone('sine', 1320, 1320, 0.1, 0.3, 0.07);
    },
    hurt() {
      tone('sine', 140, 70, 0.16, 0.5);
      noise(0.1, 'lowpass', 300, 0.3);
    },
    plantBeep(final) {
      tone('sine', final ? 1500 : 1000, final ? 1500 : 1000, 0.09, 0.25);
    },
    defuseBeep() {
      tone('sine', 700, 700, 0.08, 0.22);
    },
    explosion() {
      noise(0.9, 'lowpass', 420, 1.0);
      tone('sine', 120, 28, 0.8, 0.9);
    },
    grenadePin() {
      tone('square', 900, 600, 0.04, 0.15);
    },
    buy() {
      tone('sine', 660, 990, 0.08, 0.22);
    },
    roundWin() {
      tone('sine', 523, 523, 0.14, 0.3);
      tone('sine', 659, 659, 0.14, 0.3, 0.13);
      tone('sine', 784, 784, 0.22, 0.3, 0.26);
    },
    roundLose() {
      tone('sine', 392, 392, 0.16, 0.28);
      tone('sine', 311, 311, 0.24, 0.28, 0.15);
    },
    step() {
      noise(0.05, 'lowpass', 700, 0.07);
    },
  };
}
