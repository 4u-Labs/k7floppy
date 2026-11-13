import { CPU_CLOCK } from './cpu6502.js';

export class Speaker1Bit {
  constructor() {
    this.ctx = null;
    this.node = null;
    this.gain = null;
    this.muted = false;
    this.sampleRate = 44100;
    this.cyclesPerSample = CPU_CLOCK / this.sampleRate;

    this.ringSize = 16384;
    this.ring = new Float32Array(this.ringSize);
    this.writePos = 0;
    this.readPos = 0;

    this.speakerLevel = -0.25;
    this.lastCycle = 0;
    this.lastToggleCycle = 0;
    this.active = false;
  }

  ensureStarted() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }

    const AudioCtx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.sampleRate = this.ctx.sampleRate || 44100;
    this.cyclesPerSample = CPU_CLOCK / this.sampleRate;

    this.gain = this.ctx.createGain();
    this.gain.gain.value = this.muted ? 0 : 0.7;
    this.gain.connect(this.ctx.destination);

    this.node = this.ctx.createScriptProcessor(1024, 0, 1);
    this.node.onaudioprocess = (ev) => {
      const out = ev.outputBuffer.getChannelData(0);
      for (let i = 0; i < out.length; i++) {
        if (this.readPos !== this.writePos) {
          out[i] = this.ring[this.readPos];
          this.readPos = (this.readPos + 1) & (this.ringSize - 1);
        } else {
          out[i] = 0;
        }
      }
    };
    this.node.connect(this.gain);
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.gain && this.ctx) {
      this.gain.gain.setTargetAtTime(muted ? 0 : 0.7, this.ctx.currentTime, 0.01);
    }
  }

  reset(cycle = 0) {
    this.lastCycle = cycle;
    this.lastToggleCycle = cycle;
    this.active = false;
    this.writePos = 0;
    this.readPos = 0;
  }

  pushSamplesUpTo(cycle) {
    if (!this.ctx || this.muted) {
      this.lastCycle = cycle;
      return;
    }
    const diff = cycle - this.lastCycle;
    if (diff < this.cyclesPerSample) return;

    const count = Math.min(2048, Math.floor(diff / this.cyclesPerSample));
    this.lastCycle += count * this.cyclesPerSample;

    // Silencia DC offset se o alto-falante ficar parado por >80ms
    const idle = cycle - this.lastToggleCycle > CPU_CLOCK * 0.08;
    const val = idle || !this.active ? 0 : this.speakerLevel;

    for (let i = 0; i < count; i++) {
      const next = (this.writePos + 1) & (this.ringSize - 1);
      if (next !== this.readPos) {
        this.ring[this.writePos] = val;
        this.writePos = next;
      }
    }
  }

  toggle(cycle, isFullSpeed) {
    if (isFullSpeed) {
      this.lastCycle = cycle;
      return;
    }
    this.active = true;
    this.pushSamplesUpTo(cycle);
    this.speakerLevel = -this.speakerLevel;
    this.lastToggleCycle = cycle;
  }

  endFrame(cycle, isFullSpeed) {
    if (isFullSpeed) {
      this.lastCycle = cycle;
      return;
    }
    this.pushSamplesUpTo(cycle);
  }
}
