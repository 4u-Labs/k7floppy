// Motor de áudio procedural 8-bit & foley mecânico via Web Audio API

class RetroAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.masterGain = null;
    this.activeTapeNodes = [];
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.45;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.45, this.ctx.currentTime, 0.01);
    }
  }

  // Beeper interno de 1 canal do TK 2000 (onda quadrada)
  beep(freq = 880, duration = 0.08, volume = 0.28, type = 'square', delay = 0) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(40, freq), now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.005);
    gain.gain.setValueAtTime(volume, Math.max(now + 0.006, now + duration - 0.012));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  // Sweep de frequência (explosões, lasers, pulos)
  sweep(startFreq, endFreq, duration = 0.15, type = 'square', volume = 0.24) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(30, startFreq), now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), now + duration);

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  // Ruído branco filtrado (explosões 8-bit, clique mecânico, chiado)
  noise(duration = 0.12, filterFreq = 900, volume = 0.25, delay = 0) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const sampleCount = Math.max(256, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const now = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, now);
    filter.Q.setValueAtTime(1.2, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    src.start(now);
    src.stop(now + duration + 0.01);
  }

  // Clique mecânico de tecla do TK 2000
  playKeyClick() {
    if (this.muted) return;
    this.noise(0.022, 2200, 0.14);
    this.beep(190, 0.018, 0.09, 'triangle');
  }

  // Ligando / desligando o monitor CRT + TK 2000
  playPowerOn() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    // Zumbido breve de desmagnetização + bip clássico do boot
    this.sweep(120, 48, 0.22, 'sawtooth', 0.16);
    this.beep(1046.5, 0.09, 0.28, 'square', 0.28);
  }

  playPowerOff() {
    if (this.muted) return;
    this.sweep(900, 55, 0.18, 'sine', 0.18);
  }

  // Foley do drive de disquete 5¼"
  playFloppyLatch(closing = true) {
    if (this.muted) return;
    this.noise(0.045, closing ? 850 : 1200, 0.3);
    this.beep(closing ? 130 : 190, 0.04, 0.16, 'triangle');
  }

  playFloppySeek(durationMs = 1100) {
    if (this.muted) return;
    const steps = Math.max(4, Math.floor(durationMs / 110));
    for (let i = 0; i < steps; i++) {
      const delay = i * 0.1 + (Math.random() * 0.02);
      const pitch = 95 + (i % 3) * 28 + Math.random() * 15;
      this.beep(pitch, 0.055, 0.16, 'sawtooth', delay);
      this.noise(0.04, 600, 0.12, delay);
    }
  }

  // Foley do gravador K7
  playTapeClick() {
    if (this.muted) return;
    this.noise(0.05, 1100, 0.28);
    this.beep(150, 0.035, 0.15, 'triangle');
  }

  stopTapeAudio() {
    this.activeTapeNodes.forEach((n) => {
      try {
        n.stop();
      } catch (_) {}
    });
    this.activeTapeNodes = [];
  }

  // Simula o tom piloto + modulação FSK clássica de fita K7 (1500 baud)
  playTapeLoad(durationMs = 2400) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    this.stopTapeAudio();

    const now = ctx.currentTime;
    const totalSec = durationMs / 1000;
    const pilotSec = Math.min(0.45, totalSec * 0.25);

    // Oscilador principal de dados
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';

    // Tom piloto constante
    osc.frequency.setValueAtTime(1000, now);

    // Modulação FSK simulando bits
    const step = 0.028;
    for (let t = pilotSec; t < totalSec - 0.05; t += step) {
      const bitFreq = Math.random() > 0.45 ? 2000 : 1200;
      osc.frequency.setValueAtTime(bitFreq, now + t);
    }

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.11, now + 0.04);
    gain.gain.setValueAtTime(0.11, now + totalSec - 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + totalSec);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + totalSec + 0.02);
    this.activeTapeNodes.push(osc);
  }

  // Melodias curtas para jogos
  playJingle(type) {
    if (this.muted) return;
    if (type === 'start') {
      [523, 659, 784, 1046].forEach((f, i) => this.beep(f, 0.07, 0.22, 'square', i * 0.075));
    } else if (type === 'win') {
      [523, 659, 784, 1046, 784, 1046].forEach((f, i) =>
        this.beep(f, i === 5 ? 0.22 : 0.08, 0.24, 'square', i * 0.085)
      );
    } else if (type === 'gameover') {
      [440, 392, 349, 293, 220].forEach((f, i) =>
        this.beep(f, i === 4 ? 0.35 : 0.11, 0.24, 'square', i * 0.12)
      );
    } else if (type === 'pickup') {
      this.beep(880, 0.045, 0.2, 'square', 0);
      this.beep(1318, 0.065, 0.2, 'square', 0.05);
    }
  }
}

export const audio = new RetroAudio();
