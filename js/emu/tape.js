// Copyright (c) 2024 FBLabs (ported & extended for Web from fbelavenuto/tk2000, GPL-2.0-or-later)
// Controlador de Fita K7 (.CT2, .WAV e Gravação real via $C020)

import { CPU_CLOCK } from './cpu6502.js';

export class TapeDevice {
  constructor() {
    this.queueCycles = [];
    this.queueIdx = 0;
    this.playing = false;
    this.recording = false;
    this.casOut = 0x00;
    this.startCycle = 0;
    this.cyclesNeeded = 0;
    this.tapeName = null;
    this.rawCt2Bytes = null;

    // Buffer de gravação ($C020)
    this.recordedDeltas = [];
    this.lastRecordCycle = 0;
  }

  reset() {
    this.playing = false;
    this.recording = false;
    this.startCycle = 0;
    this.cyclesNeeded = 0;
    this.casOut = 0x00;
  }

  hasTape() {
    return this.queueCycles.length > 0;
  }

  getProgress() {
    if (!this.queueCycles.length) return 0;
    return Math.min(1, this.queueIdx / this.queueCycles.length);
  }

  play() {
    if (this.recording) return false;
    if (this.queueIdx < this.queueCycles.length) {
      this.playing = true;
      this.startCycle = 0;
      return true;
    }
    return false;
  }

  stop() {
    this.playing = false;
    this.startCycle = 0;
    if (this.recording) {
      return this.stopRecording();
    }
    return null;
  }

  eject() {
    this.stop();
    this.queueCycles = [];
    this.queueIdx = 0;
    this.tapeName = null;
    this.rawCt2Bytes = null;
  }

  rewind() {
    this.playing = false;
    this.startCycle = 0;
    this.queueIdx = 0;
  }

  // Leitura em $C010-$C01F: bit 7 reflete o sinal atual da fita K7
  read(addr, cycles) {
    if ((addr & 0xf0) === 0x10) {
      if (!this.playing) return 0x00;

      if (this.startCycle === 0 && this.queueIdx < this.queueCycles.length) {
        this.startCycle = cycles;
        this.cyclesNeeded = this.queueCycles[this.queueIdx];
      }

      if (cycles - this.startCycle > this.cyclesNeeded) {
        this.startCycle = cycles;
        this.casOut ^= 0x80;
        if (this.queueIdx < this.queueCycles.length) {
          this.cyclesNeeded = this.queueCycles[this.queueIdx++];
        } else {
          this.startCycle = 0;
          this.playing = false;
        }
      }
      return this.casOut;
    }
    return 0x00;
  }

  // Acesso em $C020-$C02F (saída K7 para comando SAVE)
  onCasWriteToggle(cycles) {
    if (!this.recording) return;
    if (this.lastRecordCycle === 0) {
      this.lastRecordCycle = cycles;
      return;
    }
    const delta = Math.max(40, Math.min(10000, cycles - this.lastRecordCycle));
    this.lastRecordCycle = cycles;
    this.recordedDeltas.push(delta);
  }

  startRecording(name = 'MINHA_FITA') {
    this.playing = false;
    this.recording = true;
    this.tapeName = name;
    this.recordedDeltas = [];
    this.lastRecordCycle = 0;
  }

  stopRecording() {
    this.recording = false;
    if (this.recordedDeltas.length < 40) {
      this.recordedDeltas = [];
      return null;
    }
    // Converte os pulsos capturados em ciclos reproduzíveis e em pacote CT2-compatível
    this.queueCycles = this.recordedDeltas.slice();
    this.queueIdx = 0;
    const ct2 = encodeDeltasToCt2(this.recordedDeltas);
    this.rawCt2Bytes = ct2;
    this.recordedDeltas = [];
    return {
      name: this.tapeName || 'GRAVACAO',
      cycles: this.queueCycles,
      ct2Bytes: ct2,
    };
  }

  insertCycleArray(cyclesArr, name, ct2Bytes = null) {
    this.stop();
    this.queueCycles = Array.from(cyclesArr);
    this.queueIdx = 0;
    this.tapeName = name;
    this.rawCt2Bytes = ct2Bytes;
  }

  insertCt2(uint8, name = 'FITA.CT2') {
    if (uint8.length < 4) return false;
    const magic = String.fromCharCode(uint8[0], uint8[1], uint8[2], uint8[3]);
    if (magic !== 'CTK2') return false;

    const cycles = [];
    let pos = 4;
    while (pos + 4 <= uint8.length) {
      const id = String.fromCharCode(uint8[pos], uint8[pos + 1]);
      const size = uint8[pos + 2] | (uint8[pos + 3] << 8);
      pos += 4;

      if (id === 'CA') {
        for (let i = 0; i < 500; i++) {
          cycles.push(500, 500);
        }
      } else if (id === 'CB') {
        cycles.push(464, 679);
        for (let i = 0; i < 32; i++) {
          cycles.push(679, 679);
        }
        cycles.push(199, 250);
      } else if (id === 'DA') {
        const end = Math.min(uint8.length, pos + size);
        for (let i = pos; i < end; i++) {
          const b = uint8[i];
          for (let bit = 7; bit >= 0; bit--) {
            if ((b >> bit) & 1) {
              cycles.push(500, 500);
            } else {
              cycles.push(250, 250);
            }
          }
        }
        pos += size;
      } else {
        // Chunk desconhecido: pula se tiver tamanho
        if (size > 0 && pos + size <= uint8.length) {
          pos += size;
        } else {
          break;
        }
      }
    }

    if (cycles.length === 0) return false;
    this.insertCycleArray(cycles, name, uint8);
    return true;
  }

  insertWav(arrayBuffer, name = 'FITA.WAV') {
    const view = new DataView(arrayBuffer);
    if (view.byteLength < 44) return false;
    const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    if (riff !== 'RIFF') return false;

    let pos = 12;
    let sampleRate = 44100;
    let bitsPerSample = 8;
    let channels = 1;
    let dataStart = -1;
    let dataLen = 0;

    while (pos + 8 <= view.byteLength) {
      const chunkId = String.fromCharCode(
        view.getUint8(pos),
        view.getUint8(pos + 1),
        view.getUint8(pos + 2),
        view.getUint8(pos + 3)
      );
      const chunkSize = view.getUint32(pos + 4, true);
      pos += 8;
      if (chunkId === 'fmt ') {
        channels = view.getUint16(pos + 2, true);
        sampleRate = view.getUint32(pos + 4, true);
        bitsPerSample = view.getUint16(pos + 14, true);
      } else if (chunkId === 'data') {
        dataStart = pos;
        dataLen = Math.min(chunkSize, view.byteLength - pos);
        break;
      }
      pos += chunkSize + (chunkSize & 1);
    }

    if (dataStart < 0 || dataLen < 100) return false;

    const bytesPerSample = Math.max(1, bitsPerSample >> 3);
    const frameStride = bytesPerSample * channels;
    const totalFrames = Math.floor(dataLen / frameStride);
    const cyclesPerSample = CPU_CLOCK / sampleRate;

    const cycles = [];
    let prevSign = 0;
    let lastEdgeFrame = 0;

    for (let i = 0; i < totalFrames; i++) {
      const offset = dataStart + i * frameStride;
      let val = 0;
      if (bitsPerSample === 16) {
        val = view.getInt16(offset, true);
      } else {
        val = view.getUint8(offset) - 128;
      }
      const sign = val >= 0 ? 1 : -1;
      if (prevSign !== 0 && sign !== prevSign) {
        const deltaCycles = Math.round((i - lastEdgeFrame) * cyclesPerSample);
        if (deltaCycles >= 80 && deltaCycles <= 5000) {
          cycles.push(deltaCycles);
        }
        lastEdgeFrame = i;
      }
      prevSign = sign;
    }

    if (cycles.length < 50) return false;
    this.insertCycleArray(cycles, name, null);
    return true;
  }
}

// Decodifica pulsos FSK gravados pelo TK 2000 (CA/CB/DA) para um arquivo .CT2 válido
export function encodeDeltasToCt2(deltas) {
  const chunks = [];
  let i = 0;

  while (i < deltas.length) {
    // 1. Procura bloco piloto (~500) seguido de sync > 580 ('CB') ou sync curto (< 225)
    let pilotCount = 0;
    while (i < deltas.length && deltas[i] >= 420 && deltas[i] <= 560) {
      pilotCount++;
      i++;
    }
    if (pilotCount > 50) {
      chunks.push({ id: 'CA', data: null });
    }

    // Detecta bloco 'CB' (sequência de ~679 terminando em 199, 250)
    let cbSeen = false;
    while (i < deltas.length && deltas[i] > 580) {
      cbSeen = true;
      i++;
    }
    if (i + 1 < deltas.length && deltas[i] < 230 && deltas[i + 1] <= 280) {
      i += 2;
      if (cbSeen) {
        chunks.push({ id: 'CB', data: null });
      }
    } else if (i < deltas.length && deltas[i] < 230) {
      i++;
    }

    // Lê bits até encontrar um pulso fora do padrão FSK (> 580) ou fim
    const bits = [];
    while (i + 1 < deltas.length && deltas[i] <= 580 && deltas[i + 1] <= 580) {
      const avg = (deltas[i] + deltas[i + 1]) / 2;
      bits.push(avg > 370 ? 1 : 0);
      i += 2;
    }

    if (bits.length >= 8) {
      const byteCount = Math.floor(bits.length / 8);
      const bytes = new Uint8Array(byteCount);
      for (let b = 0; b < byteCount; b++) {
        let val = 0;
        for (let bit = 0; bit < 8; bit++) {
          val = (val << 1) | bits[b * 8 + bit];
        }
        bytes[b] = val;
      }
      chunks.push({ id: 'DA', data: bytes });
    } else if (i < deltas.length) {
      i++;
    }
  }

  let totalLen = 4; // 'CTK2'
  for (const c of chunks) {
    totalLen += 4 + (c.data ? c.data.length : 0);
  }
  const out = new Uint8Array(totalLen);
  out[0] = 0x43; out[1] = 0x54; out[2] = 0x4b; out[3] = 0x32;
  let pos = 4;
  for (const c of chunks) {
    out[pos++] = c.id.charCodeAt(0);
    out[pos++] = c.id.charCodeAt(1);
    const sz = c.data ? c.data.length : 0;
    out[pos++] = sz & 0xff;
    out[pos++] = (sz >> 8) & 0xff;
    if (c.data) {
      out.set(c.data, pos);
      pos += sz;
    }
  }
  return out;
}
