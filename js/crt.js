import { FONT_5X7, normalizeTkChar } from './font.js';

export const CRT_WIDTH = 280;
export const CRT_HEIGHT = 192;
export const TERM_COLS = 40;
export const TERM_ROWS = 24;

// Paleta inspirada no modo gráfico do TK 2000 (NTSC/PAL-M)
export const PALETTE = [
  [10, 12, 16],    // 0: Preto
  [240, 244, 248], // 1: Branco
  [54, 232, 94],   // 2: Verde
  [200, 92, 255],  // 3: Violeta / Magenta
  [255, 124, 41],  // 4: Laranja
  [56, 168, 255],  // 5: Azul
  [255, 224, 71],  // 6: Amarelo
  [255, 62, 78],   // 7: Vermelho
  [36, 44, 58],    // 8: Cinza escuro (sombras/grades)
];

export class CRTDisplay {
  constructor(canvas) {
    this.canvas = canvas;
    this.canvas.width = CRT_WIDTH;
    this.canvas.height = CRT_HEIGHT;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.ctx.imageSmoothingEnabled = false;

    this.imageData = this.ctx.createImageData(CRT_WIDTH, CRT_HEIGHT);
    this.frame = new Uint8Array(CRT_WIDTH * CRT_HEIGHT);
    this.mode = 'color'; // 'color' | 'green' | 'amber'
    this.powered = true;

    // Buffer de texto 40x24 para modo terminal/BASIC
    this.lines = [];
    this.termReset();
  }

  setMode(mode) {
    this.mode = mode;
    this.flush();
  }

  setPowered(on) {
    this.powered = on;
    if (!on) {
      this.clear(0);
      this.flush();
    }
  }

  clear(colorIdx = 0) {
    this.frame.fill(colorIdx);
  }

  pixel(x, y, colorIdx = 1) {
    const ix = x | 0;
    const iy = y | 0;
    if (ix < 0 || ix >= CRT_WIDTH || iy < 0 || iy >= CRT_HEIGHT) return;
    this.frame[iy * CRT_WIDTH + ix] = colorIdx;
  }

  rect(x, y, w, h, colorIdx = 1) {
    const x0 = Math.max(0, x | 0);
    const y0 = Math.max(0, y | 0);
    const x1 = Math.min(CRT_WIDTH, (x + w) | 0);
    const y1 = Math.min(CRT_HEIGHT, (y + h) | 0);
    for (let py = y0; py < y1; py++) {
      const rowOffset = py * CRT_WIDTH;
      for (let px = x0; px < x1; px++) {
        this.frame[rowOffset + px] = colorIdx;
      }
    }
  }

  rectOutline(x, y, w, h, colorIdx = 1) {
    this.rect(x, y, w, 1, colorIdx);
    this.rect(x, y + h - 1, w, 1, colorIdx);
    this.rect(x, y, 1, h, colorIdx);
    this.rect(x + w - 1, y, 1, h, colorIdx);
  }

  line(x0, y0, x1, y1, colorIdx = 1) {
    let ix0 = x0 | 0;
    let iy0 = y0 | 0;
    const ix1 = x1 | 0;
    const iy1 = y1 | 0;
    const dx = Math.abs(ix1 - ix0);
    const dy = -Math.abs(iy1 - iy0);
    const sx = ix0 < ix1 ? 1 : -1;
    const sy = iy0 < iy1 ? 1 : -1;
    let err = dx + dy;
    while (true) {
      this.pixel(ix0, iy0, colorIdx);
      if (ix0 === ix1 && iy0 === iy1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        ix0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        iy0 += sy;
      }
    }
  }

  circle(cx, cy, r, colorIdx = 1, fill = false) {
    const icx = cx | 0;
    const icy = cy | 0;
    const ir = r | 0;
    for (let dy = -ir; dy <= ir; dy++) {
      for (let dx = -ir; dx <= ir; dx++) {
        const d2 = dx * dx + dy * dy;
        if (fill ? d2 <= ir * ir : Math.abs(d2 - ir * ir) <= ir) {
          this.pixel(icx + dx, icy + dy, colorIdx);
        }
      }
    }
  }

  drawChar(ch, px, py, colorIdx = 1, bgIdx = null) {
    const key = normalizeTkChar(ch);
    const glyph = FONT_5X7[key] || FONT_5X7[' '];
    if (bgIdx !== null) {
      this.rect(px, py, 7, 8, bgIdx);
    }
    for (let row = 0; row < glyph.length; row++) {
      const bits = glyph[row];
      for (let col = 0; col < 5; col++) {
        if (bits & (1 << (4 - col))) {
          this.pixel(px + col + 1, py + row, colorIdx);
        }
      }
    }
  }

  drawText(str, px, py, colorIdx = 1, bgIdx = null) {
    const text = String(str);
    for (let i = 0; i < text.length; i++) {
      this.drawChar(text[i], px + i * 7, py, colorIdx, bgIdx);
    }
  }

  drawTextCentered(str, py, colorIdx = 1, bgIdx = null) {
    const text = String(str);
    const px = Math.floor((CRT_WIDTH - text.length * 7) / 2);
    this.drawText(text, px, py, colorIdx, bgIdx);
  }

  // Desenha sprite ASCII art onde cada caractere mapeia para um índice da paleta
  drawSprite(rows, px, py, colorMap, flipX = false) {
    for (let r = 0; r < rows.length; r++) {
      const line = rows[r];
      for (let c = 0; c < line.length; c++) {
        const ch = line[c];
        if (ch === '.' || ch === ' ') continue;
        const colorIdx = colorMap[ch] ?? 1;
        const drawX = flipX ? px + (line.length - 1 - c) : px + c;
        this.pixel(drawX, py + r, colorIdx);
      }
    }
  }

  // Converte o framebuffer indexado para RGBA considerando o modo do monitor
  flush() {
    const data = this.imageData.data;
    const len = this.frame.length;

    for (let i = 0; i < len; i++) {
      const cIdx = this.powered ? this.frame[i] : 0;
      const rgb = PALETTE[cIdx] || PALETTE[0];
      const offset = i * 4;

      if (this.mode === 'color') {
        data[offset] = rgb[0];
        data[offset + 1] = rgb[1];
        data[offset + 2] = rgb[2];
      } else {
        // Luminância perceptual para fósforo verde ou âmbar
        const lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
        if (this.mode === 'green') {
          data[offset] = Math.round(lum * 55);
          data[offset + 1] = Math.round(14 + lum * 241);
          data[offset + 2] = Math.round(lum * 85);
        } else {
          // Âmbar P3
          data[offset] = Math.round(16 + lum * 239);
          data[offset + 1] = Math.round(8 + lum * 172);
          data[offset + 2] = Math.round(lum * 28);
        }
      }
      data[offset + 3] = 255;
    }

    this.ctx.putImageData(this.imageData, 0, 0);
  }

  // ---- Terminal / Modo Texto 40x24 ----
  termReset() {
    this.lines = [];
  }

  termClear() {
    this.lines = [];
  }

  termPrint(text = '', colorIdx = 1) {
    const str = String(text);
    if (this.lines.length === 0) {
      this.lines.push({ text: '', color: colorIdx });
    }
    const last = this.lines[this.lines.length - 1];
    const combined = last.text + str;
    // Quebra automática em 40 colunas
    let idx = 0;
    let firstChunk = true;
    while (idx < combined.length || firstChunk) {
      const slice = combined.slice(idx, idx + TERM_COLS);
      if (firstChunk) {
        last.text = slice;
        last.color = colorIdx;
        firstChunk = false;
      } else {
        this.lines.push({ text: slice, color: colorIdx });
      }
      idx += TERM_COLS;
      if (idx >= combined.length) break;
    }
    this.trimLines();
  }

  termPrintln(text = '', colorIdx = 1) {
    const str = String(text);
    if (str.length === 0) {
      this.lines.push({ text: '', color: colorIdx });
      this.trimLines();
      return;
    }
    for (let i = 0; i < str.length; i += TERM_COLS) {
      this.lines.push({ text: str.slice(i, i + TERM_COLS), color: colorIdx });
    }
    this.trimLines();
  }

  trimLines() {
    while (this.lines.length > TERM_ROWS - 1) {
      this.lines.shift();
    }
  }

  renderTerminal(promptPrefix = ']', inputBuffer = '', cursorOn = true, statusBanner = null) {
    this.clear(0);

    let startY = 0;
    if (statusBanner) {
      this.rect(0, 0, CRT_WIDTH, 9, 5);
      this.drawText(statusBanner.slice(0, 40), 0, 1, 1);
      startY = 10;
    }

    const maxVisible = statusBanner ? TERM_ROWS - 2 : TERM_ROWS - 1;
    const visibleLines = this.lines.slice(-maxVisible);

    for (let i = 0; i < visibleLines.length; i++) {
      this.drawText(visibleLines[i].text, 0, startY + i * 8, visibleLines[i].color);
    }

    // Linha de entrada atual
    const inputRow = startY + visibleLines.length * 8;
    const fullInput = promptPrefix + inputBuffer;
    const clipped = fullInput.length >= TERM_COLS
      ? fullInput.slice(fullInput.length - (TERM_COLS - 1))
      : fullInput;

    if (inputRow <= CRT_HEIGHT - 8) {
      this.drawText(clipped, 0, inputRow, 1);
      if (cursorOn) {
        const cursorX = Math.min(TERM_COLS - 1, clipped.length) * 7;
        this.rect(cursorX + 1, inputRow, 5, 7, 2);
      }
    }

    this.flush();
  }
}
