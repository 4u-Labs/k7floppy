// Copyright (c) 2024 FBLabs (ported & adapted from fbelavenuto/tk2000, GPL-2.0-or-later)
// Matriz de Teclado 8x6 do Microdigital TK 2000

const CODE_TO_MATRIX = {
  KeyZ: [0, 5], KeyX: [0, 4], KeyC: [0, 3], KeyV: [0, 2], KeyB: [0, 1],
  KeyA: [1, 5], KeyS: [1, 4], KeyD: [1, 3], KeyF: [1, 2], KeyG: [1, 1],
  KeyQ: [2, 5], KeyW: [2, 4], KeyE: [2, 3], KeyR: [2, 2], KeyT: [2, 1], Space: [2, 0],
  Digit1: [3, 5], Digit2: [3, 4], Digit3: [3, 3], Digit4: [3, 2], Digit5: [3, 1], ArrowLeft: [3, 0], Backspace: [3, 0],
  Digit0: [4, 5], Digit9: [4, 4], Digit8: [4, 3], Digit7: [4, 2], Digit6: [4, 1], ArrowRight: [4, 0],
  KeyP: [5, 5], KeyO: [5, 4], KeyI: [5, 3], KeyU: [5, 2], KeyY: [5, 1], ArrowDown: [5, 0],
  KeyH: [6, 1], KeyJ: [6, 2], KeyK: [6, 3], KeyL: [6, 4], ArrowUp: [6, 0],
  KeyN: [7, 1], KeyM: [7, 2], Comma: [7, 3], Period: [7, 4], Enter: [7, 0], NumpadEnter: [7, 0],
};

// Mapeia caracteres reais digitados (suporte ABNT2 / US) para a matriz + estado Shift do TK 2000
const CHAR_TO_MATRIX = {
  ':': { rc: [6, 5], shift: false },
  ';': { rc: [6, 5], shift: true },
  '?': { rc: [7, 5], shift: false },
  '/': { rc: [7, 5], shift: true },
  '!': { rc: [3, 5], shift: true },
  '"': { rc: [3, 4], shift: true },
  '#': { rc: [3, 3], shift: true },
  '$': { rc: [3, 2], shift: true },
  '%': { rc: [3, 1], shift: true },
  '&': { rc: [4, 1], shift: true },
  "'": { rc: [4, 2], shift: true },
  '(': { rc: [4, 3], shift: true },
  ')': { rc: [4, 4], shift: true },
  '*': { rc: [4, 5], shift: true },
  '=': { rc: [5, 4], shift: true },
  '-': { rc: [5, 3], shift: true },
  '+': { rc: [5, 5], shift: true },
  '^': { rc: [6, 3], shift: true },
  '@': { rc: [6, 4], shift: true },
  '<': { rc: [7, 3], shift: true },
  '>': { rc: [7, 4], shift: true },
  ',': { rc: [7, 3], shift: false },
  '.': { rc: [7, 4], shift: false },
};

export class KeyboardDevice {
  constructor() {
    this.matrix = new Uint8Array(8);
    this.kbOut = 0;
    this.kbOutCtrl = false;
    this.ctrl = false;
    this.shift = false;
    this.activePresses = new Map(); // id -> { r, c, prevShift? }
  }

  reset() {
    this.matrix.fill(0);
    this.kbOut = 0;
    this.kbOutCtrl = false;
    this.ctrl = false;
    this.shift = false;
    this.activePresses.clear();
  }

  read() {
    if (this.kbOut === 1 && this.shift) {
      return 1;
    }
    let result = this.kbOutCtrl && this.ctrl ? 1 : 0;
    for (let l = 0; l < 8; l++) {
      if (this.kbOut & (1 << l)) {
        result |= this.matrix[l];
      }
    }
    return result & 0xff;
  }

  write(addr, data) {
    if (addr === 0xc05e) {
      this.kbOutCtrl = false;
      return;
    }
    if (addr === 0xc05f) {
      this.kbOutCtrl = true;
      return;
    }
    if ((addr & 0xf0) === 0x00) {
      this.kbOut = data & 0xff;
    }
  }

  setKeyState(code, key, down, shiftKey = false, ctrlKey = false) {
    if (code === 'ShiftLeft' || code === 'ShiftRight') {
      this.shift = down;
      return;
    }
    if (code === 'ControlLeft' || code === 'ControlRight') {
      this.ctrl = down;
      return;
    }

    if (down) {
      if (this.activePresses.has(code)) return;

      // Verifica mapeamento especial por caractere (ABNT2 / símbolos)
      if (key && CHAR_TO_MATRIX[key]) {
        const spec = CHAR_TO_MATRIX[key];
        const [r, c] = spec.rc;
        this.matrix[r] |= 1 << c;
        const prevShift = this.shift;
        this.shift = spec.shift;
        this.activePresses.set(code, { r, c, restoreShift: true, prevShift });
        return;
      }

      const rc = CODE_TO_MATRIX[code];
      if (rc) {
        const [r, c] = rc;
        this.matrix[r] |= 1 << c;
        this.shift = shiftKey;
        this.ctrl = ctrlKey;
        this.activePresses.set(code, { r, c, restoreShift: false });
      }
    } else {
      const info = this.activePresses.get(code);
      if (info) {
        this.matrix[info.r] &= ~(1 << info.c);
        if (info.restoreShift) {
          this.shift = shiftKey;
        }
        this.activePresses.delete(code);
      }
    }
  }
}
