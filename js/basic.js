import { CRT_WIDTH, CRT_HEIGHT } from './crt.js';
import { ALL_MEDIA } from './media.js';

// Avaliador seguro de expressões matemáticas simples para TK-BASIC
function evalExpr(exprStr, vars) {
  const tokens = [];
  let i = 0;
  while (i < exprStr.length) {
    const ch = exprStr[i];
    if (ch === ' ' || ch === '\t') {
      i++;
      continue;
    }
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      let num = '';
      while (i < exprStr.length && ((exprStr[i] >= '0' && exprStr[i] <= '9') || exprStr[i] === '.')) {
        num += exprStr[i++];
      }
      tokens.push({ type: 'num', val: parseFloat(num) });
      continue;
    }
    if ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z')) {
      let id = '';
      while (i < exprStr.length && /[A-Za-z0-9_]/.test(exprStr[i])) {
        id += exprStr[i++];
      }
      tokens.push({ type: 'id', val: id.toUpperCase() });
      continue;
    }
    if ('+-*/%()'.includes(ch)) {
      tokens.push({ type: 'op', val: ch });
      i++;
      continue;
    }
    i++;
  }

  let pos = 0;
  function peek() {
    return tokens[pos];
  }
  function parseAddSub() {
    let left = parseMulDiv();
    while (peek() && (peek().val === '+' || peek().val === '-')) {
      const op = tokens[pos++].val;
      const right = parseMulDiv();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }
  function parseMulDiv() {
    let left = parsePrimary();
    while (peek() && (peek().val === '*' || peek().val === '/' || peek().val === '%')) {
      const op = tokens[pos++].val;
      const right = parsePrimary();
      if (op === '*') left *= right;
      else if (op === '/') left = right === 0 ? 0 : left / right;
      else left = right === 0 ? 0 : left % right;
    }
    return left;
  }
  function parsePrimary() {
    const t = peek();
    if (!t) return 0;
    if (t.val === '-') {
      pos++;
      return -parsePrimary();
    }
    if (t.val === '(') {
      pos++;
      const v = parseAddSub();
      if (peek() && peek().val === ')') pos++;
      return v;
    }
    if (t.type === 'num') {
      pos++;
      return t.val;
    }
    if (t.type === 'id') {
      pos++;
      if (t.val === 'RND') return Math.random();
      return vars[t.val] ?? 0;
    }
    pos++;
    return 0;
  }

  return parseAddSub();
}

export class TkBasicShell {
  constructor(crt, audio, callbacks) {
    this.crt = crt;
    this.audio = audio;
    this.callbacks = callbacks; // { onLaunchGame, onLoadMediaByName, getInsertedMedia }
    this.program = new Map(); // lineNum -> code
    this.vars = {};
    this.inputBuffer = '';
    this.running = false;
    this.graphicsMode = false;
    this.drawColor = 1;
    this.cursorTimer = 0;
    this.cursorOn = true;
    this.runToken = 0;
  }

  boot() {
    this.stopProgram();
    this.graphicsMode = false;
    this.crt.termClear();
    this.crt.termPrintln('MICRODIGITAL', 1);
    this.crt.termPrintln('// TK 2000 //', 2);
    this.crt.termPrintln('SYSTEM READY', 1);
    this.crt.termPrintln('64K RAM', 5);
    this.crt.termPrintln('');
    this.crt.termPrintln('DIGITE HELP OU CLIQUE NUM DISCO/FITA.', 6);
    this.inputBuffer = '';
    this.render();
  }

  stopProgram() {
    this.running = false;
    this.runToken++;
  }

  loadListing(lines) {
    this.program.clear();
    lines.forEach((raw) => {
      const m = raw.trim().match(/^(\d+)\s+(.*)$/);
      if (m) {
        this.program.set(parseInt(m[1], 10), m[2]);
      }
    });
  }

  handleChar(ch) {
    if (this.running) return;
    if (this.graphicsMode) {
      this.graphicsMode = false;
    }
    if (this.inputBuffer.length < 38) {
      this.inputBuffer += ch.toUpperCase();
      this.cursorOn = true;
      this.cursorTimer = 0;
    }
  }

  handleKeyDown(code, key, ctrlKey) {
    if (ctrlKey && (code === 'KeyC' || code === 'Break')) {
      if (this.running) {
        this.stopProgram();
        this.crt.termPrintln('BREAK', 7);
        this.graphicsMode = false;
      }
      return;
    }

    if (code === 'Escape') {
      if (this.running) {
        this.stopProgram();
        this.crt.termPrintln('BREAK', 7);
      }
      this.graphicsMode = false;
      return;
    }

    if (this.running) return;

    if (code === 'Backspace') {
      this.inputBuffer = this.inputBuffer.slice(0, -1);
      return;
    }

    if (code === 'Enter') {
      const cmd = this.inputBuffer.trim();
      this.crt.termPrintln(']' + this.inputBuffer, 1);
      this.inputBuffer = '';
      this.graphicsMode = false;
      if (cmd.length > 0) {
        this.executeLine(cmd);
      }
      return;
    }

    if (key && key.length === 1 && !ctrlKey) {
      this.handleChar(key);
    }
  }

  executeLine(raw) {
    // Linha numerada: armazena na memória do programa BASIC
    const numMatch = raw.match(/^(\d+)\s*(.*)$/);
    if (numMatch) {
      const lineNum = parseInt(numMatch[1], 10);
      const body = numMatch[2].trim();
      if (!body) {
        this.program.delete(lineNum);
      } else {
        this.program.set(lineNum, body);
      }
      return;
    }

    const upper = raw.toUpperCase();

    if (upper === 'HELP' || upper === 'AJUDA') {
      this.crt.termPrintln('COMANDOS TK-BASIC / TKDOS:', 6);
      this.crt.termPrintln(' CATALOG  - LISTA MIDIA INSERIDA', 1);
      this.crt.termPrintln(' LIST     - MOSTRA PROGRAMA BASIC', 1);
      this.crt.termPrintln(' RUN      - EXECUTA PROGRAMA BASIC', 1);
      this.crt.termPrintln(' HOME/CLS - LIMPA A TELA', 1);
      this.crt.termPrintln(' NEW      - APAGA PROGRAMA DA RAM', 1);
      this.crt.termPrintln(' PLAY <X> - ABRE JOGO (EX: CHOPPER)', 1);
      this.crt.termPrintln('OU CLIQUE NOS DISQUETES/FITAS AO LADO!', 2);
      return;
    }

    if (upper === 'HOME' || upper === 'CLS') {
      this.crt.termClear();
      return;
    }

    if (upper === 'NEW') {
      this.program.clear();
      this.vars = {};
      this.crt.termPrintln('RAM LIMPA.', 2);
      return;
    }

    if (upper === 'LIST') {
      if (this.program.size === 0) {
        this.crt.termPrintln('(NENHUM PROGRAMA NA MEMORIA)', 8);
        return;
      }
      const sorted = [...this.program.keys()].sort((a, b) => a - b);
      for (const ln of sorted) {
        this.crt.termPrintln(`${ln} ${this.program.get(ln)}`, 2);
      }
      return;
    }

    if (upper === 'CATALOG' || upper === 'DIR') {
      const media = this.callbacks.getInsertedMedia();
      if (!media) {
        this.crt.termPrintln('NENHUMA MIDIA INSERIDA NO DRIVE/K7.', 7);
        this.crt.termPrintln('DISPONIVEIS NA MESA:', 6);
        ALL_MEDIA.forEach((m) => {
          this.crt.termPrintln(` [${m.type === 'floppy' ? 'DSK' : 'K7 '}] ${m.shortLabel}`, 1);
        });
        return;
      }
      this.crt.termPrintln(`DISK/K7: ${media.title}`, 6);
      if (media.files) {
        media.files.forEach((f) => {
          this.crt.termPrintln(` *${f.type} ${f.size} ${f.name}`, 2);
        });
      } else {
        this.crt.termPrintln(` *B 020 ${media.shortLabel}.K7`, 2);
      }
      return;
    }

    if (upper === 'RUN') {
      this.runProgram();
      return;
    }

    if (upper.startsWith('PLAY ') || upper.startsWith('LOAD ') || upper.startsWith('BRUN ')) {
      const target = upper.replace(/^(PLAY|LOAD|BRUN)\s+/, '').replace(/["']/g, '').trim();
      const ok = this.callbacks.onLoadMediaByName(target);
      if (!ok) {
        this.crt.termPrintln(`?ARQUIVO NAO ENCONTRADO: ${target}`, 7);
      }
      return;
    }

    // Executa instrução direta
    this.execStatement(raw);
  }

  async runProgram() {
    if (this.program.size === 0) {
      const media = this.callbacks.getInsertedMedia();
      if (media && media.kind === 'game') {
        this.callbacks.onLaunchGame(media.gameId);
        return;
      }
      this.crt.termPrintln('?SEM PROGRAMA NA MEMORIA', 7);
      return;
    }

    this.running = true;
    const token = ++this.runToken;
    const lines = [...this.program.keys()].sort((a, b) => a - b);
    const lineIndex = new Map(lines.map((ln, idx) => [ln, idx]));
    const loopStack = [];
    let pc = 0;

    while (this.running && token === this.runToken && pc < lines.length) {
      const ln = lines[pc];
      const stmt = this.program.get(ln);
      const res = this.execStatement(stmt, { lines, lineIndex, loopStack, pc });

      if (res && res.end) break;
      if (res && typeof res.jumpPc === 'number') {
        pc = res.jumpPc;
      } else {
        pc++;
      }

      // Cede ao navegador para manter o CRT animado e capturar ESC
      await new Promise((r) => setTimeout(r, 18));
    }

    if (token === this.runToken) {
      this.running = false;
    }
  }

  execStatement(stmt, ctx = null) {
    const trimmed = stmt.trim();
    const upper = trimmed.toUpperCase();

    if (!trimmed || upper.startsWith('REM')) return null;
    if (upper === 'END' || upper === 'STOP') return { end: true };
    if (upper === 'HOME' || upper === 'CLS') {
      this.crt.termClear();
      this.graphicsMode = false;
      return null;
    }
    if (upper === 'HGR' || upper === 'GR') {
      this.graphicsMode = true;
      this.crt.clear(0);
      this.crt.flush();
      return null;
    }

    if (upper.startsWith('COLOR')) {
      const m = trimmed.match(/COLOR\s*=\s*(.+)/i);
      if (m) {
        this.drawColor = Math.max(0, Math.min(7, Math.floor(evalExpr(m[1], this.vars))));
      }
      return null;
    }

    if (upper.startsWith('PLOT ')) {
      const args = trimmed.slice(5).split(',');
      if (args.length >= 2) {
        const x = Math.floor(evalExpr(args[0], this.vars));
        const y = Math.floor(evalExpr(args[1], this.vars));
        this.graphicsMode = true;
        this.crt.rect(x, y, 2, 2, this.drawColor);
        this.crt.flush();
      }
      return null;
    }

    if (upper.startsWith('LINE ')) {
      const args = trimmed.slice(5).split(',');
      if (args.length >= 4) {
        const x1 = Math.floor(evalExpr(args[0], this.vars));
        const y1 = Math.floor(evalExpr(args[1], this.vars));
        const x2 = Math.floor(evalExpr(args[2], this.vars));
        const y2 = Math.floor(evalExpr(args[3], this.vars));
        this.graphicsMode = true;
        this.crt.line(x1, y1, x2, y2, this.drawColor);
        this.crt.flush();
      }
      return null;
    }

    if (upper.startsWith('BEEP')) {
      const args = trimmed.slice(4).split(',');
      const freq = args[0] ? evalExpr(args[0], this.vars) : 880;
      const ms = args[1] ? evalExpr(args[1], this.vars) : 100;
      this.audio.beep(freq, Math.min(1.5, Math.max(0.02, ms / 1000)), 0.24);
      return null;
    }

    if (upper.startsWith('PRINT ') || upper === 'PRINT' || upper.startsWith('?')) {
      const body = upper.startsWith('?') ? trimmed.slice(1).trim() : trimmed.slice(5).trim();
      if (!body) {
        this.crt.termPrintln('');
        return null;
      }
      const parts = body.split(';');
      let out = '';
      for (const part of parts) {
        const p = part.trim();
        if (!p) continue;
        if ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'"))) {
          out += p.slice(1, -1);
        } else {
          out += String(Math.round(evalExpr(p, this.vars) * 1000) / 1000);
        }
      }
      this.crt.termPrintln(out, 1);
      if (this.graphicsMode) {
        this.crt.rect(0, CRT_HEIGHT - 10, CRT_WIDTH, 10, 0);
        this.crt.drawText(out.slice(0, 40), 0, CRT_HEIGHT - 9, 1);
        this.crt.flush();
      }
      return null;
    }

    if (upper.startsWith('GOTO ') && ctx) {
      const targetLine = Math.floor(evalExpr(trimmed.slice(5), this.vars));
      if (ctx.lineIndex.has(targetLine)) {
        return { jumpPc: ctx.lineIndex.get(targetLine) };
      }
      this.crt.termPrintln(`?LINHA INEXISTENTE ${targetLine}`, 7);
      return { end: true };
    }

    if (upper.startsWith('FOR ') && ctx) {
      const m = trimmed.match(/^FOR\s+([A-Z]\w*)\s*=\s*(.+?)\s+TO\s+(.+?)(?:\s+STEP\s+(.+))?$/i);
      if (m) {
        const varName = m[1].toUpperCase();
        const startVal = evalExpr(m[2], this.vars);
        const endVal = evalExpr(m[3], this.vars);
        const stepVal = m[4] ? evalExpr(m[4], this.vars) : 1;
        this.vars[varName] = startVal;
        ctx.loopStack.push({ varName, endVal, stepVal, bodyPc: ctx.pc + 1 });
      }
      return null;
    }

    if (upper.startsWith('NEXT') && ctx) {
      const top = ctx.loopStack[ctx.loopStack.length - 1];
      if (top) {
        this.vars[top.varName] += top.stepVal;
        const done = top.stepVal >= 0
          ? this.vars[top.varName] > top.endVal
          : this.vars[top.varName] < top.endVal;
        if (!done) {
          return { jumpPc: top.bodyPc };
        }
        ctx.loopStack.pop();
      }
      return null;
    }

    if (upper.startsWith('IF ') && ctx) {
      const m = trimmed.match(/^IF\s+(.+?)\s+THEN\s+(.+)$/i);
      if (m) {
        const condStr = m[1];
        const thenStr = m[2].trim();
        const cmp = condStr.match(/^(.+?)(<=|>=|<>|!=|=|<|>)(.+)$/);
        let ok = false;
        if (cmp) {
          const l = evalExpr(cmp[1], this.vars);
          const r = evalExpr(cmp[3], this.vars);
          const op = cmp[2];
          if (op === '=') ok = l === r;
          else if (op === '<>' || op === '!=') ok = l !== r;
          else if (op === '<') ok = l < r;
          else if (op === '>') ok = l > r;
          else if (op === '<=') ok = l <= r;
          else if (op === '>=') ok = l >= r;
        }
        if (ok) {
          if (/^\d+$/.test(thenStr)) {
            const ln = parseInt(thenStr, 10);
            if (ctx.lineIndex.has(ln)) return { jumpPc: ctx.lineIndex.get(ln) };
          }
          return this.execStatement(thenStr, ctx);
        }
      }
      return null;
    }

    // Atribuição LET X = ... ou X = ...
    const assignMatch = trimmed.match(/^(?:LET\s+)?([A-Z]\w*)\s*=\s*(.+)$/i);
    if (assignMatch) {
      this.vars[assignMatch[1].toUpperCase()] = evalExpr(assignMatch[2], this.vars);
      return null;
    }

    this.crt.termPrintln('?SYNTAX ERROR', 7);
    return null;
  }

  update(dt) {
    this.cursorTimer += dt;
    if (this.cursorTimer >= 0.45) {
      this.cursorTimer = 0;
      this.cursorOn = !this.cursorOn;
    }
  }

  render() {
    if (this.graphicsMode) return;
    const media = this.callbacks.getInsertedMedia();
    const banner = media
      ? `TK 2000 // ${media.type === 'floppy' ? 'DSK' : 'K7'}: ${media.shortLabel}`
      : 'TK 2000 // SYSTEM READY 64K';
    this.crt.renderTerminal(']', this.inputBuffer, !this.running && this.cursorOn, banner);
  }
}
