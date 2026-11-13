// Copyright (c) 2024 FBLabs (ported & extended for Web from fbelavenuto/tk2000, GPL-2.0-or-later)
// Máquina completa Microdigital TK 2000 (CPU 6502 + RAM 64K + ROM 16K + Vídeo + K7 + Áudio + Joystick)

import { Cpu6502, CPU_CLOCK } from './cpu6502.js';
import { TK2000_ROM } from './rom.js';
import { KeyboardDevice } from './keyboard.js';
import { TapeDevice } from './tape.js';
import { Speaker1Bit } from './audio1bit.js';
import { Disk2Controller } from './disk2.js';

export const VIDEO_WIDTH = 280;
export const VIDEO_HEIGHT = 192;

export class Tk2000Machine {
  constructor() {
    this.ram = new Uint8Array(65536);
    this.keyboard = new KeyboardDevice();
    this.tape = new TapeDevice();
    this.disk2 = new Disk2Controller();
    this.speaker = new Speaker1Bit();

    this.videoMono = false;
    this.secondPage = false;
    this.ramBank = false;  // $C05A = ROM ($C100-$FFFF), $C05B = RAM ($C100-$FFFF)
    this.slot1Rom = false; // $C058 = Slot 1 ROM ($C100-$C1FF), $C059 = Internal ROM

    // Paddles / Joystick ($C061, $C062, $C064, $C065, $C070)
    this.paddleX = 128;
    this.paddleY = 128;
    this.btn0 = false;
    this.btn1 = false;
    this.paddleTriggerCycle = 0;

    // Buffers pré-alocados para renderização de vídeo 280x192
    this.pixels = new Uint8Array(VIDEO_WIDTH * VIDEO_HEIGHT);
    this.colorMod = new Uint8Array((VIDEO_WIDTH / 7) * VIDEO_HEIGHT);
    this.crtMode = 'color'; // 'color' | 'green' | 'amber'

    this.cpu = new Cpu6502(this);
    this.hardReset();
  }

  hardReset() {
    this.ram.fill(0);
    // Simula memória de vídeo inicial
    this.ram.fill(0xff, 0x2000, 0x3000);
    this.ram.fill(0xff, 0xa000, 0xb000);
    this.softReset();
  }

  softReset() {
    this.videoMono = false;
    this.secondPage = false;
    this.ramBank = false;
    this.slot1Rom = this.disk2.hasDisk();
    this.keyboard.reset();
    this.tape.reset();
    this.disk2.reset();
    this.cpu.reset();
    this.speaker.reset(this.cpu.cycles);
  }

  bootDiskImage(uint8, name = 'TK2000.DSK', bootRomBytes = null) {
    if (bootRomBytes && bootRomBytes.length === 256) {
      this.disk2.bootRom = bootRomBytes;
    }
    this.disk2.insertDsk(uint8, name);
    this.hardReset();
  }

  readByte(addr, cycles) {
    if (addr < 0xc000) {
      return this.ram[addr];
    }

    if (addr >= 0xc100) {
      if (addr <= 0xc1ff && this.slot1Rom && this.disk2.hasDisk()) {
        return this.disk2.readBootRom(addr - 0xc100);
      }
      if (this.ramBank) {
        return this.ram[addr];
      }
      return TK2000_ROM[addr & 0x3fff];
    }

    // Região de I/O $C000-$C0FF
    const lo = addr & 0xff;

    if (lo <= 0x1f) {
      let val = this.keyboard.read();
      if (lo >= 0x10) {
        val |= this.tape.read(addr, cycles);
      }
      return val;
    }

    if (lo >= 0x20 && lo <= 0x2f) {
      this.tape.onCasWriteToggle(cycles);
      return 0xff;
    }

    if (lo >= 0x30 && lo <= 0x3f) {
      this.speaker.toggle(cycles, this.cpu.fullSpeed);
      return 0xff;
    }

    if (lo === 0x50) { this.videoMono = false; return 0xff; }
    if (lo === 0x51) { this.videoMono = true; return 0xff; }
    if (lo === 0x54) { this.secondPage = false; return 0xff; }
    if (lo === 0x55) { this.secondPage = true; return 0xff; }
    if (lo === 0x58) { this.slot1Rom = true; return 0xff; }
    if (lo === 0x59) { this.slot1Rom = false; return 0xff; }
    if (lo === 0x5a) { this.ramBank = false; return 0xff; }
    if (lo === 0x5b) { this.ramBank = true; return 0xff; }

    if (lo === 0x61) return this.btn0 ? 0x80 : 0x00;
    if (lo === 0x62) return this.btn1 ? 0x80 : 0x00;
    if (lo === 0x64) return (cycles - this.paddleTriggerCycle) < this.paddleX * 11 ? 0x80 : 0x00;
    if (lo === 0x65) return (cycles - this.paddleTriggerCycle) < this.paddleY * 11 ? 0x80 : 0x00;
    if (lo === 0x70) { this.paddleTriggerCycle = cycles; return 0xff; }

    if (((lo >= 0x90 && lo <= 0x9f) || (lo >= 0xe0 && lo <= 0xef)) && this.disk2.hasDisk()) {
      return this.disk2.accessIo(lo & 0x0f, false, 0);
    }

    return 0xff;
  }

  writeByte(addr, data, cycles) {
    if (addr < 0xc000) {
      this.ram[addr] = data;
      return;
    }

    if (addr >= 0xc100) {
      if (this.ramBank) {
        this.ram[addr] = data;
      }
      return;
    }

    const lo = addr & 0xff;
    if (lo <= 0x0f || lo === 0x5e || lo === 0x5f) {
      this.keyboard.write(addr, data);
      return;
    }
    if (lo >= 0x20 && lo <= 0x2f) {
      this.tape.onCasWriteToggle(cycles);
      return;
    }
    if (lo >= 0x30 && lo <= 0x3f) {
      this.speaker.toggle(cycles, this.cpu.fullSpeed);
      return;
    }
    if (lo === 0x50) { this.videoMono = false; return; }
    if (lo === 0x51) { this.videoMono = true; return; }
    if (lo === 0x54) { this.secondPage = false; return; }
    if (lo === 0x55) { this.secondPage = true; return; }
    if (lo === 0x58) { this.slot1Rom = true; return; }
    if (lo === 0x59) { this.slot1Rom = false; return; }
    if (lo === 0x5a) { this.ramBank = false; return; }
    if (lo === 0x5b) { this.ramBank = true; return; }
    if (lo === 0x70) { this.paddleTriggerCycle = cycles; return; }

    if (((lo >= 0x90 && lo <= 0x9f) || (lo >= 0xe0 && lo <= 0xef)) && this.disk2.hasDisk()) {
      this.disk2.accessIo(lo & 0x0f, true, data);
    }
  }

  runFrame(dtSec, turboTape = true) {
    const isDiskFast = this.disk2.hasDisk() && this.disk2.motorOn && turboTape;
    const isTapeFast = (this.tape.playing && turboTape) || isDiskFast;
    this.cpu.fullSpeed = isTapeFast;
    const multiplier = isTapeFast ? 14 : 1;
    const targetCycles = Math.floor(CPU_CLOCK * Math.min(0.05, dtSec) * multiplier);
    const endCycle = this.cpu.cycles + targetCycles;

    while (this.cpu.cycles < endCycle) {
      this.cpu.executeOpcode();
      if (isTapeFast && !this.tape.playing && !(this.disk2.hasDisk() && this.disk2.motorOn)) {
        this.cpu.fullSpeed = false;
        break;
      }
    }

    this.speaker.endFrame(this.cpu.cycles, this.cpu.fullSpeed);
  }

  renderToImageData(imageData) {
    const out = imageData.data;
    const memAddr = this.secondPage ? 0xa000 : 0x2000;

    if (this.videoMono) {
      for (let y = 0; y < VIDEO_HEIGHT; y++) {
        const rowOff = memAddr + ((y & 7) << 10) + ((y & 0x38) << 4) + (y >> 6) * 40;
        let pxIdx = y * VIDEO_WIDTH;
        for (let col = 0; col < 40; col++) {
          const v = this.ram[rowOff + col];
          for (let b = 0; b < 7; b++) {
            const on = (v >> b) & 1;
            const o = pxIdx * 4;
            if (on) {
              this.writePixelColor(out, o, 255, 255, 255);
            } else {
              this.writePixelColor(out, o, 0, 0, 0);
            }
            pxIdx++;
          }
        }
      }
      return;
    }

    // Modo colorido autêntico do TK 2000 (algoritmo Video.cpp)
    for (let y = 0; y < VIDEO_HEIGHT; y++) {
      const rowOff = memAddr + ((y & 7) << 10) + ((y & 0x38) << 4) + (y >> 6) * 40;
      const cmRow = y * 40;
      const pxRow = y * VIDEO_WIDTH;
      for (let col = 0; col < 40; col++) {
        const v = this.ram[rowOff + col];
        this.colorMod[cmRow + col] = (v & 0x80) ? 1 : 0;
        const baseX = pxRow + col * 7;
        for (let b = 0; b < 7; b++) {
          this.pixels[baseX + b] = (v >> b) & 1;
        }
      }
    }

    for (let y = 0; y < VIDEO_HEIGHT; y++) {
      const pxRow = y * VIDEO_WIDTH;
      const cmRow = y * 40;
      for (let x = 0; x < VIDEO_WIDTH; x += 2) {
        const cm = this.colorMod[cmRow + ((x / 7) | 0)];
        const actual = (this.pixels[pxRow + x] << 1) | this.pixels[pxRow + x + 1];
        let r = 0, g = 0, b = 0;
        if (actual === 1) {
          if (cm) { r = 250; g = 24; b = 0; }      // Laranja/Vermelho
          else    { r = 0;   g = 128; b = 255; }   // Azul
        } else if (actual === 2) {
          if (cm) { r = 180; g = 40; b = 235; }    // Violeta/Ciano NTSC
          else    { r = 32;  g = 205; b = 40; }    // Verde
        } else if (actual === 3) {
          r = 255; g = 255; b = 255;
        }
        const o0 = (pxRow + x) * 4;
        const o1 = o0 + 4;
        this.writePixelColor(out, o0, r, g, b);
        this.writePixelColor(out, o1, r, g, b);
      }
    }
  }

  writePixelColor(out, offset, r, g, b) {
    if (this.crtMode === 'color') {
      out[offset] = r;
      out[offset + 1] = g;
      out[offset + 2] = b;
    } else {
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (this.crtMode === 'green') {
        out[offset] = Math.round(lum * 50);
        out[offset + 1] = Math.round(12 + lum * 243);
        out[offset + 2] = Math.round(lum * 80);
      } else {
        out[offset] = Math.round(14 + lum * 241);
        out[offset + 1] = Math.round(6 + lum * 174);
        out[offset + 2] = Math.round(lum * 25);
      }
    }
    out[offset + 3] = 255;
  }
}
