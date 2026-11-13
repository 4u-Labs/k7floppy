// Emulador Apple II+ / Disk II para execução de imagens .DSK / .DO / .PO no drive DISK II
// Reutiliza Cpu6502, Speaker1Bit e Disk2Controller

import { Cpu6502, CPU_CLOCK } from './cpu6502.js';
import { Speaker1Bit } from './audio1bit.js';
import { Disk2Controller } from './disk2.js';
import { FONT_5X7 } from '../font.js';

export const A2_WIDTH = 280;
export const A2_HEIGHT = 192;

// Paleta Lo-Res 16 cores (Apple II NTSC aproximado)
const LORES_COLORS = [
  [0, 0, 0],       // 0 Preto
  [227, 30, 96],   // 1 Magenta
  [96, 78, 189],   // 2 Azul escuro
  [255, 68, 253],  // 3 Violeta
  [0, 163, 96],    // 4 Verde escuro
  [156, 156, 156], // 5 Cinza escuro
  [20, 207, 253],  // 6 Azul médio
  [208, 195, 255], // 7 Azul claro
  [96, 114, 3],    // 8 Marrom
  [255, 106, 60],  // 9 Laranja
  [156, 156, 156], // 10 Cinza claro
  [255, 160, 208], // 11 Rosa
  [20, 245, 60],   // 12 Verde claro
  [208, 221, 141], // 13 Amarelo
  [114, 255, 208], // 14 Água/Ciano
  [255, 255, 255], // 15 Branco
];

function textRowBaseAddr(row, page2) {
  const pageOff = page2 ? 0x0800 : 0x0400;
  return pageOff + ((row & 7) << 7) + (row >> 3) * 40;
}

// Firmware Monitor Clean-Room ($F800-$FFFF) com pontos de entrada padrão Apple II+
// ($FB2F INIT, $FC22 VTAB, $FC58 HOME, $FCA8 WAIT, $FD0C RDKEY, $FDED COUT, $FE84-$FE93, $FF3A BELL)
function buildCleanMonitorRom() {
  const rom = new Uint8Array(0x3000); // $D000-$FFFF (12 KB)
  rom.fill(0x60); // RTS seguro como preenchimento padrão em sub-rotinas não implementadas

  const setByte = (addr, b) => {
    rom[addr - 0xd000] = b & 0xff;
  };
  const emitAt = (startAddr, bytes) => {
    for (let i = 0; i < bytes.length; i++) {
      setByte(startAddr + i, bytes[i]);
    }
    return startAddr + bytes.length;
  };

  // $FB2F INIT: configura texto tela cheia página 1 e limpa janela
  emitAt(0xfb2f, [
    0xad, 0x51, 0xc0, // $FB2F: LDA $C051 (TEXT)
    0xad, 0x52, 0xc0, // $FB32: LDA $C052 (FULL)
    0xad, 0x54, 0xc0, // $FB35: LDA $C054 (PAGE1)
    0xad, 0x56, 0xc0, // $FB38: LDA $C056 (LORES)
    0xa9, 0x00,       // LDA #$00
    0x85, 0x20,       // STA WNDLFT ($20)
    0x85, 0x22,       // STA WNDTOP ($22)
    0xa9, 0x28,       // LDA #$28 (40)
    0x85, 0x21,       // STA WNDWDTH ($21)
    0xa9, 0x18,       // LDA #$18 (24)
    0x85, 0x23,       // STA WNDBTM ($23)
    0xa9, 0xff,       // LDA #$FF
    0x85, 0x32,       // STA INVFLG ($32 = normal)
    0x20, 0x58, 0xfc, // JSR HOME
    0x60,             // RTS
  ]);

  // Byte de identificação do modelo Apple II+: $FBB3 = $38 (padrão Apple II+)
  setByte(0xfbb3, 0x38);

  // $FC22 VTAB / $FC24 VTABZ: calcula endereço base da linha $25 (CV) em $28/$29
  for (let row = 0; row < 24; row++) {
    const base = textRowBaseAddr(row, false);
    setByte(0xf900 + row, base & 0xff);
    setByte(0xf920 + row, (base >> 8) & 0xff);
  }
  emitAt(0xfc22, [
    0xa5, 0x25,       // $FC22: LDA $25
    0xaa,             // $FC24: TAX (VTABZ entrada via $FC24 espera A = CV)
    0xbd, 0x00, 0xf9, // LDA $F900,X
    0x85, 0x28,       // STA $28
    0xbd, 0x20, 0xf9, // LDA $F920,X
    0x85, 0x29,       // STA $29
    0x60,             // RTS
  ]);

  // $FC58 HOME: limpa tela de texto $0400-$07FF com $A0 e zera cursor (0,0) -> vai até $FC76
  const afterHome = emitAt(0xfc58, [
    0x86, 0x3e,       // STX $3E
    0xa2, 0x00,       // LDX #$00
    0xa9, 0xa0,       // LDA #$A0
    // loop $FC5E:
    0x9d, 0x00, 0x04, // STA $0400,X
    0x9d, 0x00, 0x05, // STA $0500,X
    0x9d, 0x00, 0x06, // STA $0600,X
    0x9d, 0x00, 0x07, // STA $0700,X
    0xe8,             // INX
    0xd0, 0xf1,       // BNE $FC5E
    0xa9, 0x00,       // LDA #$00
    0x85, 0x24,       // STA CH ($24)
    0x85, 0x25,       // STA CV ($25)
    0x20, 0x22, 0xfc, // JSR VTAB
    0xa6, 0x3e,       // LDX $3E
    0x60,             // RTS
  ]);

  // SCROLL logo após HOME ($FC77..): rola linhas 1..23 para cima e limpa linha 23
  const scrollAddr = afterHome;
  const scrollLo = scrollAddr & 0xff;
  const scrollHi = (scrollAddr >> 8) & 0xff;
  emitAt(scrollAddr, [
    0x8a, 0x48,       // TXA; PHA
    0x98, 0x48,       // TYA; PHA
    0xa2, 0x00,       // LDX #$00 (row dst = 0..22)
    // row_loop (scrollAddr + 6):
    0xbd, 0x00, 0xf9, // LDA $F900,X
    0x85, 0x2a,       // STA dstLo
    0xbd, 0x20, 0xf9, // LDA $F920,X
    0x85, 0x2b,       // STA dstHi
    0xbd, 0x01, 0xf9, // LDA $F901,X
    0x85, 0x2c,       // STA srcLo
    0xbd, 0x21, 0xf9, // LDA $F921,X
    0x85, 0x2d,       // STA srcHi
    0xa0, 0x27,       // LDY #$27 (39..0)
    // col_loop:
    0xb1, 0x2c,       // LDA ($2C),Y
    0x91, 0x2a,       // STA ($2A),Y
    0x88,             // DEY
    0x10, 0xf9,       // BPL col_loop
    0xe8,             // INX
    0xe0, 0x17,       // CPX #23
    0xd0, 0xdf,       // BNE row_loop
    // limpa linha 23 ($07D0..$07F7)
    0xa0, 0x27,       // LDY #$27
    0xa9, 0xa0,       // LDA #$A0
    // clr23:
    0x99, 0xd0, 0x07, // STA $07D0,Y
    0x88,             // DEY
    0x10, 0xfa,       // BPL clr23
    0x68, 0xa8,       // PLA; TAY
    0x68, 0xaa,       // PLA; TAX
    0x60,             // RTS
  ]);

  // $FCA8 WAIT: atraso padrão Apple II ~(5*A^2 + 27*A + 26)/2 ciclos (zera A)
  emitAt(0xfca8, [
    0x38,             // SEC
    0x48,             // WAIT2: PHA
    0xe9, 0x01,       // WAIT3: SBC #$01
    0xd0, 0xfc,       // BNE WAIT3
    0x68,             // PLA
    0xe9, 0x01,       // SBC #$01
    0xd0, 0xf6,       // BNE WAIT2
    0x60,             // RTS
  ]);

  // $FD0C RDKEY / $FD1B KEYIN: aguarda tecla em $C000
  emitAt(0xfd0c, [
    0x6c, 0x38, 0x00, // JMP ($0038) KSW
  ]);
  emitAt(0xfd1b, [
    0xad, 0x00, 0xc0, // LDA $C000
    0x10, 0xfb,       // BPL $FD1B
    0x2c, 0x10, 0xc0, // BIT $C010 (limpa strobe)
    0x60,             // RTS
  ]);

  // $FD8E CROUT: imprime Carriage Return ($8D)
  emitAt(0xfd8e, [
    0xa9, 0x8d,       // LDA #$8D
    0x4c, 0xed, 0xfd, // JMP COUT
  ]);

  // $FDED COUT -> JMP ($0036)
  emitAt(0xfded, [
    0x6c, 0x36, 0x00, // JMP ($0036)
  ]);

  // $FDF0 COUT1: imprime caractere A na tela texto $0400
  const fBytes = [];
  const fLbl = {};
  const fFix = [];
  const fBase = 0xfdf0;
  const fe = (...xs) => xs.forEach((b) => fBytes.push(b & 0xff));
  const fl = (n) => { fLbl[n] = fBase + fBytes.length; };
  const fb = (op, n) => { fBytes.push(op); fFix.push({ at: fBytes.length, n }); fBytes.push(0); };

  fl('cout1');
  fe(0x48, 0x98, 0x48); // PHA; TYA; PHA
  fe(0x29, 0x7f);       // AND #$7F
  fe(0xc9, 0x0d);       // CMP #$0D
  fb(0xf0, 'newline');
  fe(0xc9, 0x07);       // CMP #$07
  fb(0xf0, 'bell');
  fe(0xc9, 0x08);       // CMP #$08
  fb(0xf0, 'bs');
  fe(0x68, 0xa8, 0x68); // PLA; TAY; PLA (restaura A e Y originais)
  fe(0x48, 0x85, 0x3e, 0x98, 0x48, 0xa5, 0x3e); // PHA; STA $3E; TYA; PHA; LDA $3E
  fe(0x09, 0x80);       // ORA #$80 (normal)
  fe(0x25, 0x32);       // AND $32 (INVFLG)
  fe(0xa4, 0x24);       // LDY $24
  fe(0x91, 0x28);       // STA ($28),Y
  fe(0xe6, 0x24);       // INC $24
  fe(0xa5, 0x24);       // LDA $24
  fe(0xc5, 0x21);       // CMP $21
  fb(0xb0, 'newline');
  fl('done');
  fe(0x68, 0xa8, 0x68, 0x60); // PLA; TAY; PLA; RTS

  fl('newline');
  fe(0xa9, 0x00, 0x85, 0x24); // CH = 0
  fe(0xe6, 0x25);             // INC CV
  fe(0xa5, 0x25, 0xc9, 0x18); // CMP #24
  fb(0x90, 'vtab');
  fe(0xa9, 0x17, 0x85, 0x25); // CV = 23
  fe(0x20, scrollLo, scrollHi); // JSR SCROLL
  fl('vtab');
  fe(0x20, 0x22, 0xfc);       // JSR VTAB
  fb(0x90, 'done');           // BCC? Não, usa JMP done:
  fBytes.pop(); fBytes.pop(); fFix.pop();
  fe(0x4c, fLbl.done & 0xff, (fLbl.done >> 8) & 0xff);

  fl('bell');
  fe(0x20, 0x3a, 0xff);       // JSR BELL
  fe(0x4c, fLbl.done & 0xff, (fLbl.done >> 8) & 0xff);

  fl('bs');
  fe(0xa5, 0x24);
  fb(0xf0, 'done');
  fe(0xc6, 0x24);
  fe(0x4c, fLbl.done & 0xff, (fLbl.done >> 8) & 0xff);

  for (const fx of fFix) {
    const from = fBase + fx.at + 1;
    fBytes[fx.at] = (fLbl[fx.n] - from) & 0xff;
  }
  emitAt(fBase, fBytes);

  // $FE84 SETNORM, $FE89 SETKBD, $FE93 SETVID
  emitAt(0xfe84, [0xa9, 0xff, 0x85, 0x32, 0x60]);
  emitAt(0xfe89, [0xa9, 0x1b, 0x85, 0x38, 0xa9, 0xfd, 0x85, 0x39, 0x60]);
  emitAt(0xfe93, [0xa9, 0xf0, 0x85, 0x36, 0xa9, 0xfd, 0x85, 0x37, 0x60]);

  // $FF3A BELL
  emitAt(0xff3a, [
    0x8a, 0x48,
    0xa2, 0x20,
    0x2c, 0x30, 0xc0, // BIT $C030
    0xa9, 0x0c,
    0x20, 0xa8, 0xfc, // JSR WAIT
    0xca,
    0xd0, 0xf5,
    0x68, 0xaa,
    0x60,
  ]);

  // $FA62 RESET: inicializa vetores ($36-$39, tela, $0400) e dá boot no Slot 6 ($C600)
  emitAt(0xfa62, [
    0x78,             // SEI
    0xd8,             // CLD
    0xa2, 0xff,
    0x9a,             // TXS
    0x20, 0x84, 0xfe, // JSR SETNORM
    0x20, 0x2f, 0xfb, // JSR INIT
    0x20, 0x93, 0xfe, // JSR SETVID
    0x20, 0x89, 0xfe, // JSR SETKBD
    0x4c, 0x00, 0xc6, // JMP $C600 (Boot Disk II Slot 6)
  ]);

  // Vetores 6502 ($FFFA-$FFFF)
  setByte(0xfffa, 0x62); setByte(0xfffb, 0xfa); // NMI
  setByte(0xfffc, 0x62); setByte(0xfffd, 0xfa); // RESET -> $FA62
  setByte(0xfffe, 0x62); setByte(0xffff, 0xfa); // IRQ

  return rom;
}

export class Apple2Machine {
  constructor() {
    this.ram = new Uint8Array(65536);
    this.lcBank1 = new Uint8Array(4096); // $D000-$DFFF banco alternativo da Language Card
    this.lcUpper = new Uint8Array(8192); // $E000-$FFFF da Language Card

    this.cleanRom = buildCleanMonitorRom(); // 12KB ($D000-$FFFF)
    this.userRom = null; // Uint8Array(12288) opcional fornecida pelo usuário

    this.disk2 = new Disk2Controller();
    this.speaker = new Speaker1Bit();

    // Softswitches de vídeo
    this.textMode = true;
    this.mixedMode = false;
    this.page2 = false;
    this.hiresMode = false;
    this.crtMode = 'color'; // 'color' | 'green' | 'amber'

    // Language Card
    this.lcReadRam = false;
    this.lcWriteRam = false;
    this.lcBank2 = true;
    this.lcPreWrite = false;

    // Teclado ($C000/$C010)
    this.keyLatch = 0x00;
    this.anyKeyDown = false;

    // Joystick / Paddle ($C061, $C062, $C064, $C065, $C070)
    this.paddleX = 128;
    this.paddleY = 128;
    this.btn0 = false;
    this.btn1 = false;
    this.paddleTriggerCycle = 0;

    // Buffers de vídeo pré-alocados
    this.pixels = new Uint8Array(A2_WIDTH * A2_HEIGHT);
    this.colorMod = new Uint8Array(40 * A2_HEIGHT);
    this.flashCounter = 0;

    this.cpu = new Cpu6502(this);
  }

  setUserRom(uint8) {
    if (!uint8) {
      this.userRom = null;
      return true;
    }
    if (uint8.length === 12288) {
      this.userRom = new Uint8Array(uint8);
      return true;
    }
    if (uint8.length === 16384) {
      // Alguns dumps de ROM Apple II+ vêm com 16KB ($C000-$FFFF); fatia $D000-$FFFF
      this.userRom = new Uint8Array(uint8.subarray(4096));
      return true;
    }
    if (uint8.length >= 20480 && uint8.length <= 32768) {
      // Dumps de 32KB (ex: Apple IIe) -> últimos 12KB
      this.userRom = new Uint8Array(uint8.subarray(uint8.length - 12288));
      return true;
    }
    return false;
  }

  hardReset() {
    this.ram.fill(0);
    this.lcBank1.fill(0);
    this.lcUpper.fill(0);
    this.softReset();
  }

  softReset() {
    this.textMode = true;
    this.mixedMode = false;
    this.page2 = false;
    this.hiresMode = false;
    this.lcReadRam = false;
    this.lcWriteRam = false;
    this.lcBank2 = true;
    this.lcPreWrite = false;
    this.keyLatch = 0x00;
    this.anyKeyDown = false;
    this.disk2.reset();
    this.cpu.reset();
    this.speaker.reset(this.cpu.cycles);
  }

  handleLanguageCard(addr, isWrite) {
    if (isWrite) {
      this.lcPreWrite = false;
      return;
    }
    this.lcBank2 = (addr & 0x08) === 0;
    const bit1 = (addr & 0x01) !== 0;
    const bit0 = (addr & 0x02) !== 0;
    this.lcReadRam = bit1 === bit0;
    if (bit1) {
      if (this.lcPreWrite) {
        this.lcWriteRam = true;
      }
      this.lcPreWrite = true;
    } else {
      this.lcWriteRam = false;
      this.lcPreWrite = false;
    }
  }

  readByte(addr, cycles) {
    if (addr < 0xc000) {
      return this.ram[addr];
    }

    if (addr >= 0xd000) {
      if (this.lcReadRam) {
        if (addr < 0xe000) {
          return this.lcBank2 ? this.ram[addr] : this.lcBank1[addr - 0xd000];
        }
        return this.lcUpper[addr - 0xe000];
      }
      const rom = this.userRom || this.cleanRom;
      return rom[addr - 0xd000];
    }

    // $C600-$C6FF: Firmware Disk II Slot 6
    if (addr >= 0xc600 && addr <= 0xc6ff) {
      return this.disk2.readBootRom(addr - 0xc600);
    }

    if (addr >= 0xc100) {
      return 0xff;
    }

    // Região I/O $C000-$C0FF
    const lo = addr & 0xff;

    if (lo <= 0x0f) {
      return this.keyLatch;
    }
    if (lo <= 0x1f) {
      this.keyLatch &= 0x7f;
      return this.anyKeyDown ? 0x80 : 0x00;
    }
    if (lo >= 0x30 && lo <= 0x3f) {
      this.speaker.toggle(cycles, this.cpu.fullSpeed);
      return 0xff;
    }

    if (lo === 0x50) { this.textMode = false; return 0xff; }
    if (lo === 0x51) { this.textMode = true; return 0xff; }
    if (lo === 0x52) { this.mixedMode = false; return 0xff; }
    if (lo === 0x53) { this.mixedMode = true; return 0xff; }
    if (lo === 0x54) { this.page2 = false; return 0xff; }
    if (lo === 0x55) { this.page2 = true; return 0xff; }
    if (lo === 0x56) { this.hiresMode = false; return 0xff; }
    if (lo === 0x57) { this.hiresMode = true; return 0xff; }

    if (lo === 0x61) return this.btn0 ? 0x80 : 0x00;
    if (lo === 0x62) return this.btn1 ? 0x80 : 0x00;
    if (lo === 0x64) return (cycles - this.paddleTriggerCycle) < this.paddleX * 11 ? 0x80 : 0x00;
    if (lo === 0x65) return (cycles - this.paddleTriggerCycle) < this.paddleY * 11 ? 0x80 : 0x00;
    if (lo === 0x70) { this.paddleTriggerCycle = cycles; return 0xff; }

    if (lo >= 0x80 && lo <= 0x8f) {
      this.handleLanguageCard(addr, false);
      return 0xff;
    }

    if (lo >= 0xe0 && lo <= 0xef) {
      return this.disk2.accessIo(addr, false, 0);
    }

    return 0xff;
  }

  writeByte(addr, data, cycles) {
    if (addr < 0xc000) {
      this.ram[addr] = data;
      return;
    }

    if (addr >= 0xd000) {
      if (this.lcWriteRam) {
        if (addr < 0xe000) {
          if (this.lcBank2) this.ram[addr] = data;
          else this.lcBank1[addr - 0xd000] = data;
        } else {
          this.lcUpper[addr - 0xe000] = data;
        }
      }
      return;
    }

    if (addr >= 0xc100) return;

    const lo = addr & 0xff;
    if (lo >= 0x10 && lo <= 0x1f) {
      this.keyLatch &= 0x7f;
      return;
    }
    if (lo >= 0x30 && lo <= 0x3f) {
      this.speaker.toggle(cycles, this.cpu.fullSpeed);
      return;
    }
    if (lo === 0x50) { this.textMode = false; return; }
    if (lo === 0x51) { this.textMode = true; return; }
    if (lo === 0x52) { this.mixedMode = false; return; }
    if (lo === 0x53) { this.mixedMode = true; return; }
    if (lo === 0x54) { this.page2 = false; return; }
    if (lo === 0x55) { this.page2 = true; return; }
    if (lo === 0x56) { this.hiresMode = false; return; }
    if (lo === 0x57) { this.hiresMode = true; return; }
    if (lo === 0x70) { this.paddleTriggerCycle = cycles; return; }
    if (lo >= 0x80 && lo <= 0x8f) { this.handleLanguageCard(addr, true); return; }
    if (lo >= 0xe0 && lo <= 0xef) { this.disk2.accessIo(addr, true, data); }
  }

  setKeyState(code, key, down, ctrlKey = false) {
    this.anyKeyDown = down;
    if (!down) return;

    let ascii = -1;
    if (code === 'Enter' || code === 'NumpadEnter') ascii = 0x0d;
    else if (code === 'Escape') ascii = 0x1b;
    else if (code === 'ArrowLeft' || code === 'Backspace') ascii = 0x08;
    else if (code === 'ArrowRight') ascii = 0x15;
    else if (code === 'ArrowUp') ascii = 0x0b;
    else if (code === 'ArrowDown') ascii = 0x0a;
    else if (code === 'Space') ascii = 0x20;
    else if (ctrlKey && key && key.length === 1) {
      const ch = key.toUpperCase().charCodeAt(0);
      if (ch >= 64 && ch <= 95) ascii = ch - 64;
    } else if (key && key.length === 1) {
      ascii = key.toUpperCase().charCodeAt(0) & 0x7f;
    }

    if (ascii >= 0) {
      this.keyLatch = 0x80 | ascii;
    }
  }

  runFrame(dtSec, turboDisk = true) {
    this.flashCounter = (this.flashCounter + 1) & 0x3f;
    const fast = this.disk2.motorOn && turboDisk;
    this.cpu.fullSpeed = fast;
    const multiplier = fast ? 8 : 1;
    const targetCycles = Math.floor(CPU_CLOCK * Math.min(0.05, dtSec) * multiplier);
    const endCycle = this.cpu.cycles + targetCycles;

    while (this.cpu.cycles < endCycle) {
      this.cpu.executeOpcode();
      if (fast && !this.disk2.motorOn) {
        this.cpu.fullSpeed = false;
        break;
      }
    }

    this.speaker.endFrame(this.cpu.cycles, this.cpu.fullSpeed);
  }

  writePixel(out, off, r, g, b) {
    if (this.crtMode === 'color') {
      out[off] = r;
      out[off + 1] = g;
      out[off + 2] = b;
    } else {
      const lum = (r * 0.3 + g * 0.59 + b * 0.11) / 255;
      if (this.crtMode === 'green') {
        out[off] = Math.round(lum * 38);
        out[off + 1] = Math.round(lum * 250);
        out[off + 2] = Math.round(lum * 96);
      } else {
        out[off] = Math.round(lum * 255);
        out[off + 1] = Math.round(lum * 176);
        out[off + 2] = Math.round(lum * 42);
      }
    }
    out[off + 3] = 255;
  }

  renderTextRows(out, startRow, endRow) {
    const flashOn = this.flashCounter < 32;
    for (let row = startRow; row < endRow; row++) {
      const base = textRowBaseAddr(row, this.page2);
      for (let col = 0; col < 40; col++) {
        const raw = this.ram[base + col];
        const code = raw & 0x3f;
        let chCode;
        if (code < 0x20) chCode = code + 0x40; // @ A..Z [ \ ] ^ _
        else chCode = code; // espaço, números, pontuação

        const ch = String.fromCharCode(chCode);
        const glyph = FONT_5X7[ch] || FONT_5X7[' '];
        const isInverse = raw < 0x40 || (raw < 0x80 && flashOn);

        const baseX = col * 7;
        const baseY = row * 8;
        for (let py = 0; py < 8; py++) {
          const rowBits = py < 7 ? glyph[py] : 0;
          const outY = baseY + py;
          for (let px = 0; px < 7; px++) {
            const bit = px >= 1 && px <= 5 ? (rowBits >> (5 - px)) & 1 : 0;
            const on = isInverse ? !bit : Boolean(bit);
            const off = (outY * A2_WIDTH + baseX + px) * 4;
            if (on) this.writePixel(out, off, 240, 248, 244);
            else this.writePixel(out, off, 8, 10, 12);
          }
        }
      }
    }
  }

  renderLoResRows(out, startRow, endRow) {
    for (let row = startRow; row < endRow; row++) {
      const base = textRowBaseAddr(row, this.page2);
      for (let col = 0; col < 40; col++) {
        const val = this.ram[base + col];
        const topColor = LORES_COLORS[val & 0x0f];
        const botColor = LORES_COLORS[(val >> 4) & 0x0f];
        const baseX = col * 7;
        const baseY = row * 8;
        for (let py = 0; py < 8; py++) {
          const c = py < 4 ? topColor : botColor;
          const outY = baseY + py;
          for (let px = 0; px < 7; px++) {
            const off = (outY * A2_WIDTH + baseX + px) * 4;
            this.writePixel(out, off, c[0], c[1], c[2]);
          }
        }
      }
    }
  }

  renderHiResRows(out, startY, endY) {
    const memAddr = this.page2 ? 0x4000 : 0x2000;
    for (let y = startY; y < endY; y++) {
      const rowOff = memAddr + ((y & 7) << 10) + ((y & 0x38) << 4) + (y >> 6) * 40;
      const cmRow = y * 40;
      const pxRow = y * A2_WIDTH;
      for (let col = 0; col < 40; col++) {
        const v = this.ram[rowOff + col];
        this.colorMod[cmRow + col] = (v & 0x80) ? 1 : 0;
        const baseX = pxRow + col * 7;
        for (let b = 0; b < 7; b++) {
          this.pixels[baseX + b] = (v >> b) & 1;
        }
      }
    }

    for (let y = startY; y < endY; y++) {
      const pxRow = y * A2_WIDTH;
      const cmRow = y * 40;
      for (let x = 0; x < A2_WIDTH; x += 2) {
        const cm = this.colorMod[cmRow + ((x / 7) | 0)];
        const actual = (this.pixels[pxRow + x] << 1) | this.pixels[pxRow + x + 1];
        let r = 0, g = 0, b = 0;
        if (actual === 1) {
          if (cm) { r = 250; g = 96; b = 20; }      // Laranja Apple II
          else    { r = 180; g = 40; b = 235; }    // Violeta Apple II
        } else if (actual === 2) {
          if (cm) { r = 30;  g = 156; b = 255; }   // Azul Apple II
          else    { r = 36;  g = 224; b = 54; }    // Verde Apple II
        } else if (actual === 3) {
          r = 255; g = 255; b = 255;
        }
        const o0 = (pxRow + x) * 4;
        this.writePixel(out, o0, r, g, b);
        this.writePixel(out, o0 + 4, r, g, b);
      }
    }
  }

  renderToImageData(imageData) {
    const out = imageData.data;
    if (this.textMode) {
      this.renderTextRows(out, 0, 24);
      return;
    }
    const splitRow = this.mixedMode ? 20 : 24;
    if (this.hiresMode) {
      this.renderHiResRows(out, 0, splitRow * 8);
    } else {
      this.renderLoResRows(out, 0, splitRow);
    }
    if (this.mixedMode) {
      this.renderTextRows(out, 20, 24);
    }
  }
}
