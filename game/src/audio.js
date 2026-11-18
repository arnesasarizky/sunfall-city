// Sunfall City — sound: every note is synthesized with WebAudio, no assets.
// The context is born lazily inside start() (browsers want a user gesture
// first), and every effect is a safe no-op until then, so the world can
// call audio.shoot() on frame one without caring. A slow sunset pad loop
// (Am9 – Fmaj7 – Cmaj7 – G6) drifts under the action; a two-tone siren and
// a little sawtooth engine join in when the law or a stolen car does.

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let sirenOsc = null;
  let sirenLfo = null;
  let sirenGain = null;
  let engineOsc = null;
  let engineFilter = null;
  let engineGain = null;
  let musicTimer = null;
  let chordStep = 0;
  let muted = false;

  // Sunset progression, frequencies per chord (root, third, fifth, colour).
  const CHORDS = [
    [110.0, 164.81, 246.94, 261.63], // Am9
    [87.31, 130.81, 220.0, 329.63], // Fmaj7
    [130.81, 196.0, 246.94, 329.63], // Cmaj7
    [98.0, 146.83, 246.94, 293.66], // G6
  ];
  const CHORD_SEC = 4.2;

  function start() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.9;
      master.connect(ctx.destination);

      // Music bus: pads through a lazy lowpass so they stay behind the mix.
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      const musicFilter = ctx.createBiquadFilter();
      musicFilter.type = 'lowpass';
      musicFilter.frequency.value = 900;
      musicGain.connect(musicFilter);
      musicFilter.connect(master);

      // Siren: one oscillator whose pitch a slow LFO rocks up and down.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 780;
      sirenLfo = ctx.createOscillator();
      sirenLfo.type = 'sine';
      sirenLfo.frequency.value = 0.55;
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = 190;
      sirenLfo.connect(lfoDepth);
      lfoDepth.connect(sirenOsc.frequency);
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      sirenLfo.start();

      // Engine: a saw through a lowpass, pitch follows the speedo.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();

      playChord();
      musicTimer = setInterval(playChord, CHORD_SEC * 1000);
    } catch {
      ctx = null;
    }
  }

  function playChord() {
    if (!ctx || !musicGain) return;
    const t = ctx.currentTime;
    const notes = CHORDS[chordStep % CHORDS.length];
    chordStep += 1;
    for (const f of notes) {
      for (const detune of [-4, 3]) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = f;
        osc.detune.value = detune;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.05, t + 1.4);
        g.gain.setValueAtTime(0.05, t + CHORD_SEC - 1.2);
        g.gain.linearRampToValueAtTime(0, t + CHORD_SEC + 0.4);
        osc.connect(g);
        g.connect(musicGain);
        osc.start(t);
        osc.stop(t + CHORD_SEC + 0.5);
      }
    }
    // A soft root pulse under the pad.
    const bass = ctx.createOscillator();
    bass.type = 'sine';
    bass.frequency.value = notes[0] / 2;
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0, t);
    bg.gain.linearRampToValueAtTime(0.07, t + 0.3);
    bg.gain.exponentialRampToValueAtTime(0.001, t + CHORD_SEC);
    bass.connect(bg);
    bg.connect(musicGain);
    bass.start(t);
    bass.stop(t + CHORD_SEC);
  }

  /** One short envelope of filtered noise / tone for the little effects. */
  function blip({ type = 'square', from = 800, to = 200, dur = 0.08, vol = 0.12, noise = false }) {
    if (!ctx || !master) return;
    try {
      const t = ctx.currentTime;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      g.connect(master);
      if (noise) {
        const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const f = ctx.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.value = 900;
        src.connect(f);
        f.connect(g);
        src.start(t);
      } else {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(from, t);
        osc.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + dur);
        osc.connect(g);
        osc.start(t);
        osc.stop(t + dur + 0.02);
      }
    } catch { /* sound is decoration; never break the game for it */ }
  }

  function shoot() {
    blip({ noise: true, dur: 0.09, vol: 0.16 });
    blip({ type: 'square', from: 340, to: 90, dur: 0.07, vol: 0.1 });
  }

  function melee() {
    blip({ type: 'sine', from: 160, to: 55, dur: 0.12, vol: 0.2 });
  }

  function hit() {
    blip({ noise: true, dur: 0.05, vol: 0.1 });
    blip({ type: 'triangle', from: 220, to: 120, dur: 0.06, vol: 0.1 });
  }

  function pickup() {
    blip({ type: 'sine', from: 660, to: 660, dur: 0.07, vol: 0.1 });
    setTimeout(() => blip({ type: 'sine', from: 990, to: 990, dur: 0.1, vol: 0.1 }), 60);
  }

  function cash() {
    blip({ type: 'square', from: 1320, to: 1320, dur: 0.06, vol: 0.07 });
    setTimeout(() => blip({ type: 'square', from: 1760, to: 1760, dur: 0.12, vol: 0.07 }), 55);
  }

  /** Wanted level 0..5: the siren fades in and hurries up with the stars. */
  function setSiren(stars) {
    if (!ctx || !sirenGain) return;
    const t = ctx.currentTime;
    const level = Math.max(0, Math.min(5, stars || 0));
    sirenGain.gain.setTargetAtTime(level === 0 ? 0 : 0.028 + level * 0.008, t, 0.25);
    if (sirenLfo) sirenLfo.frequency.setTargetAtTime(0.4 + level * 0.16, t, 0.25);
  }

  /** speedRatio 0..1 while driving; on=false parks the engine note. */
  function setEngine(speedRatio, on = true) {
    if (!ctx || !engineGain) return;
    const t = ctx.currentTime;
    const r = Math.max(0, Math.min(1, speedRatio || 0));
    engineGain.gain.setTargetAtTime(on ? 0.05 + r * 0.035 : 0, t, 0.12);
    if (engineOsc) engineOsc.frequency.setTargetAtTime(52 + r * 130, t, 0.1);
    if (engineFilter) engineFilter.frequency.setTargetAtTime(280 + r * 700, t, 0.1);
  }

  function toggleMute() {
    muted = !muted;
    if (ctx && master) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.03);
    return muted;
  }

  return {
    start,
    shoot,
    melee,
    hit,
    pickup,
    cash,
    setSiren,
    setEngine,
    toggleMute,
    get muted() { return muted; },
  };
}
