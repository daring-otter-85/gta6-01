// All sound is synthesized with WebAudio: no audio files, no network. An engine hum
// that follows the car's speed, a two-tone police siren, gunshots, a pickup blip, a
// mission jingle and a crash thud. The context is created on the first user gesture,
// so headless screenshot runs stay silent and never throw.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let muted = false;
  let noiseBuffer = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      ctx = null;
      return false;
    }
    return true;
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure() || !ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, vol, filterFreq) {
    if (!ensure() || !ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq || 1200;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  return {
    /** Call from any user gesture so the context is allowed to start. */
    unlock() {
      if (ensure() && ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.05);
      return muted;
    },
    /** Continuous engine hum; speed01 is 0..1, 0 silences it. */
    engine(speed01) {
      if (!ensure() || !ctx) return;
      if (speed01 <= 0.02) {
        if (engineGain) engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        return;
      }
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineGain = ctx.createGain();
        engineGain.gain.value = 0;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 700;
        engineOsc.connect(filter);
        filter.connect(engineGain);
        engineGain.connect(master);
        engineOsc.start();
      }
      engineOsc.frequency.setTargetAtTime(55 + speed01 * 165, ctx.currentTime, 0.08);
      engineGain.gain.setTargetAtTime(0.05 + speed01 * 0.06, ctx.currentTime, 0.1);
    },
    siren(on, dt) {
      if (!ensure() || !ctx) return;
      if (!on) {
        if (sirenGain) sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        return;
      }
      if (!sirenOsc) {
        sirenOsc = ctx.createOscillator();
        sirenOsc.type = 'triangle';
        sirenGain = ctx.createGain();
        sirenGain.gain.value = 0;
        sirenOsc.connect(sirenGain);
        sirenGain.connect(master);
        sirenOsc.start();
      }
      sirenTimer += dt || 0.016;
      const high = Math.floor(sirenTimer / 0.45) % 2 === 0;
      sirenOsc.frequency.setTargetAtTime(high ? 880 : 660, ctx.currentTime, 0.05);
      sirenGain.gain.setTargetAtTime(0.045, ctx.currentTime, 0.1);
    },
    shot() {
      noise(0.12, 0.5, 2400);
      tone(180, 0.08, 'square', 0.18, 60);
    },
    enemyShot() {
      noise(0.1, 0.25, 1800);
    },
    blip() {
      tone(880, 0.09, 'sine', 0.25, 1320);
    },
    crash() {
      noise(0.25, 0.6, 500);
      tone(90, 0.25, 'sine', 0.5, 40);
    },
    jingle() {
      tone(523, 0.14, 'triangle', 0.3);
      setTimeout(() => tone(659, 0.14, 'triangle', 0.3), 130);
      setTimeout(() => tone(784, 0.22, 'triangle', 0.3), 260);
      setTimeout(() => tone(1047, 0.3, 'triangle', 0.3), 390);
    },
    fail() {
      tone(220, 0.3, 'sawtooth', 0.25, 110);
      setTimeout(() => tone(165, 0.4, 'sawtooth', 0.25, 90), 220);
    },
    arrest() {
      tone(440, 0.18, 'square', 0.2, 330);
      setTimeout(() => tone(330, 0.3, 'square', 0.2, 220), 180);
    },
  };
}
