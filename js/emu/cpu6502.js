// Copyright (c) 2024 FBLabs (ported to JavaScript from fbelavenuto/tk2000, GPL-2.0-or-later)
// MOS 6502 CPU Emulator for Microdigital TK 2000

export const CPU_CLOCK = 1022727;

const FLAG_C = 1 << 0;
const FLAG_Z = 1 << 1;
const FLAG_I = 1 << 2;
const FLAG_D = 1 << 3;
const FLAG_B = 1 << 4;
const FLAG_U = 1 << 5;
const FLAG_V = 1 << 6;
const FLAG_N = 1 << 7;

const INT_NMI = 1 << 0;
const INT_IRQ = 1 << 1;

export class Cpu6502 {
  constructor(bus) {
    this.bus = bus;
    this.a = 0;
    this.x = 0;
    this.y = 0;
    this.s = 0xff;
    this.p = FLAG_U;
    this.pc = 0;
    this.cycles = 0;
    this.fullSpeed = false;
    this.interruptFlags = 0;

    this.bcdAdd = new Uint16Array(512);
    this.bcdSub = new Uint16Array(512);
    for (let i = 0; i < 512; i++) {
      let add = (i & 0x0f) <= 0x09 ? i : i + 0x06;
      add += (add & 0xf0) <= 0x90 ? 0 : 0x60;
      if (add > 0x1ff) add -= 0x100;
      this.bcdAdd[i] = add;

      let sub = (i & 0x0f) <= 0x09 ? i : i - 0x06;
      sub -= (sub & 0xf0) <= 0x90 ? 0 : 0x60;
      this.bcdSub[i] = sub & 0x1ff;
    }
  }

  reset() {
    this.interruptFlags = 0;
    this.a = 0;
    this.x = 0;
    this.y = 0;
    this.p = FLAG_U;
    this.s = 0xff;
    this.cycles = 0;
    this.pc = this.readWord(0xfffc);
  }

  triggerNMI() {
    this.interruptFlags |= INT_NMI;
  }

  triggerIRQ() {
    this.interruptFlags |= INT_IRQ;
  }

  readByte(addr) {
    return this.bus.readByte(addr & 0xffff, this.cycles);
  }

  writeByte(addr, val) {
    this.bus.writeByte(addr & 0xffff, val & 0xff, this.cycles);
  }

  readWord(addr) {
    const lo = this.readByte(addr);
    const hi = this.readByte((addr + 1) & 0xffff);
    return lo | (hi << 8);
  }

  push(v) {
    this.writeByte(0x100 | this.s, v & 0xff);
    this.s = (this.s - 1) & 0xff;
  }

  pop() {
    this.s = (this.s + 1) & 0xff;
    return this.readByte(0x100 | this.s);
  }

  setFlag(mask, cond) {
    if (cond) this.p |= mask;
    else this.p &= ~mask;
  }

  setNZ(val) {
    const b = val & 0xff;
    if (b & 0x80) this.p |= FLAG_N;
    else this.p &= ~FLAG_N;
    if (b === 0) this.p |= FLAG_Z;
    else this.p &= ~FLAG_Z;
  }

  eaimm() {
    const v = this.readByte(this.pc);
    this.pc = (this.pc + 1) & 0xffff;
    return v;
  }

  eazp() {
    const v = this.readByte(this.pc);
    this.pc = (this.pc + 1) & 0xffff;
    return v;
  }

  eazpx() {
    const v = (this.readByte(this.pc) + this.x) & 0xff;
    this.pc = (this.pc + 1) & 0xffff;
    return v;
  }

  eazpy() {
    const v = (this.readByte(this.pc) + this.y) & 0xff;
    this.pc = (this.pc + 1) & 0xffff;
    return v;
  }

  eaabs() {
    const v = this.readWord(this.pc);
    this.pc = (this.pc + 2) & 0xffff;
    return v;
  }

  eaabsx() {
    return (this.eaabs() + this.x) & 0xffff;
  }

  eaabsy() {
    return (this.eaabs() + this.y) & 0xffff;
  }

  eaabsind() {
    const a = this.eaabs();
    const lo = this.readByte(a);
    const hi = this.readByte((a & 0xff00) | ((a + 1) & 0x00ff));
    return lo | (hi << 8);
  }

  eazpxind() {
    const zp = this.eazpx();
    return this.readByte(zp) | (this.readByte((zp + 1) & 0xff) << 8);
  }

  eazpindy() {
    const zp = this.eazp();
    const base = this.readByte(zp) | (this.readByte((zp + 1) & 0xff) << 8);
    return (base + this.y) & 0xffff;
  }

  earel() {
    const b = this.readByte(this.pc);
    this.pc = (this.pc + 1) & 0xffff;
    return b >= 128 ? b - 256 : b;
  }

  branch(rel) {
    this.pc = (this.pc + rel) & 0xffff;
    this.cycles += 1;
  }

  adc(operand) {
    let result = operand + this.a + (this.p & FLAG_C ? 1 : 0);
    this.setFlag(FLAG_V, !((operand ^ this.a) & 0x80) && Boolean((this.a ^ result) & 0x80));
    if (this.p & FLAG_D) {
      result = this.bcdAdd[result & 0x1ff];
    }
    this.setFlag(FLAG_C, (result & 0x100) !== 0);
    this.a = result & 0xff;
    this.setNZ(this.a);
  }

  sbc(operand) {
    const inv = 255 - operand;
    let result = inv + this.a + (this.p & FLAG_C ? 1 : 0);
    this.setFlag(FLAG_V, !((inv ^ this.a) & 0x80) && Boolean((this.a ^ result) & 0x80));
    if (this.p & FLAG_D) {
      result = this.bcdSub[result & 0x1ff];
    }
    this.setFlag(FLAG_C, (result & 0x100) !== 0);
    this.a = result & 0xff;
    this.setNZ(this.a);
  }

  cmp(reg, val) {
    const res = reg - val;
    this.setFlag(FLAG_C, (res & 0x100) === 0);
    this.setNZ(res & 0xff);
  }

  executeOpcode() {
    const op = this.readByte(this.pc);
    this.pc = (this.pc + 1) & 0xffff;

    let addr, val, res;

    switch (op) {
      // ADC
      case 0x69: this.adc(this.eaimm()); this.cycles += 2; break;
      case 0x6d: this.adc(this.readByte(this.eaabs())); this.cycles += 4; break;
      case 0x65: this.adc(this.readByte(this.eazp())); this.cycles += 3; break;
      case 0x61: this.adc(this.readByte(this.eazpxind())); this.cycles += 6; break;
      case 0x71: this.adc(this.readByte(this.eazpindy())); this.cycles += 5; break;
      case 0x75: this.adc(this.readByte(this.eazpx())); this.cycles += 4; break;
      case 0x7d: this.adc(this.readByte(this.eaabsx())); this.cycles += 4; break;
      case 0x79: this.adc(this.readByte(this.eaabsy())); this.cycles += 4; break;

      // AND
      case 0x29: this.a &= this.eaimm(); this.setNZ(this.a); this.cycles += 2; break;
      case 0x2d: this.a &= this.readByte(this.eaabs()); this.setNZ(this.a); this.cycles += 4; break;
      case 0x25: this.a &= this.readByte(this.eazp()); this.setNZ(this.a); this.cycles += 3; break;
      case 0x21: this.a &= this.readByte(this.eazpxind()); this.setNZ(this.a); this.cycles += 6; break;
      case 0x31: this.a &= this.readByte(this.eazpindy()); this.setNZ(this.a); this.cycles += 5; break;
      case 0x35: this.a &= this.readByte(this.eazpx()); this.setNZ(this.a); this.cycles += 4; break;
      case 0x3d: this.a &= this.readByte(this.eaabsx()); this.setNZ(this.a); this.cycles += 4; break;
      case 0x39: this.a &= this.readByte(this.eaabsy()); this.setNZ(this.a); this.cycles += 4; break;

      // ASL
      case 0x0a:
        res = this.a << 1;
        this.setFlag(FLAG_C, (res & 0x100) !== 0);
        this.a = res & 0xff;
        this.setNZ(this.a);
        this.cycles += 2;
        break;
      case 0x0e: addr = this.eaabs(); res = this.readByte(addr) << 1; this.setFlag(FLAG_C, (res & 0x100) !== 0); this.setNZ(res); this.writeByte(addr, res); this.cycles += 6; break;
      case 0x06: addr = this.eazp(); res = this.readByte(addr) << 1; this.setFlag(FLAG_C, (res & 0x100) !== 0); this.setNZ(res); this.writeByte(addr, res); this.cycles += 5; break;
      case 0x16: addr = this.eazpx(); res = this.readByte(addr) << 1; this.setFlag(FLAG_C, (res & 0x100) !== 0); this.setNZ(res); this.writeByte(addr, res); this.cycles += 6; break;
      case 0x1e: addr = this.eaabsx(); res = this.readByte(addr) << 1; this.setFlag(FLAG_C, (res & 0x100) !== 0); this.setNZ(res); this.writeByte(addr, res); this.cycles += 7; break;

      // Branches
      case 0x90: val = this.earel(); this.cycles += 2; if (!(this.p & FLAG_C)) this.branch(val); break;
      case 0xb0: val = this.earel(); this.cycles += 2; if (this.p & FLAG_C) this.branch(val); break;
      case 0xf0: val = this.earel(); this.cycles += 2; if (this.p & FLAG_Z) this.branch(val); break;
      case 0xd0: val = this.earel(); this.cycles += 2; if (!(this.p & FLAG_Z)) this.branch(val); break;
      case 0x30: val = this.earel(); this.cycles += 2; if (this.p & FLAG_N) this.branch(val); break;
      case 0x10: val = this.earel(); this.cycles += 2; if (!(this.p & FLAG_N)) this.branch(val); break;
      case 0x50: val = this.earel(); this.cycles += 2; if (!(this.p & FLAG_V)) this.branch(val); break;
      case 0x70: val = this.earel(); this.cycles += 2; if (this.p & FLAG_V) this.branch(val); break;

      // BIT
      case 0x2c:
        val = this.readByte(this.eaabs());
        this.setFlag(FLAG_N, (val & 0x80) !== 0);
        this.setFlag(FLAG_V, (val & 0x40) !== 0);
        this.setFlag(FLAG_Z, (val & this.a) === 0);
        this.cycles += 4;
        break;
      case 0x24:
        val = this.readByte(this.eazp());
        this.setFlag(FLAG_N, (val & 0x80) !== 0);
        this.setFlag(FLAG_V, (val & 0x40) !== 0);
        this.setFlag(FLAG_Z, (val & this.a) === 0);
        this.cycles += 3;
        break;

      // BRK
      case 0x00:
        this.pc = (this.pc + 1) & 0xffff;
        this.push((this.pc >> 8) & 0xff);
        this.push(this.pc & 0xff);
        this.push(this.p | FLAG_B | FLAG_U);
        this.p |= FLAG_I;
        this.pc = this.readWord(0xfffe);
        this.cycles += 7;
        break;

      // Flag clears / sets
      case 0x18: this.p &= ~FLAG_C; this.cycles += 2; break;
      case 0xd8: this.p &= ~FLAG_D; this.cycles += 2; break;
      case 0x58: this.p &= ~FLAG_I; this.cycles += 2; break;
      case 0xb8: this.p &= ~FLAG_V; this.cycles += 2; break;
      case 0x38: this.p |= FLAG_C; this.cycles += 2; break;
      case 0xf8: this.p |= FLAG_D; this.cycles += 2; break;
      case 0x78: this.p |= FLAG_I; this.cycles += 2; break;

      // CMP
      case 0xc9: this.cmp(this.a, this.eaimm()); this.cycles += 2; break;
      case 0xcd: this.cmp(this.a, this.readByte(this.eaabs())); this.cycles += 4; break;
      case 0xc5: this.cmp(this.a, this.readByte(this.eazp())); this.cycles += 3; break;
      case 0xc1: this.cmp(this.a, this.readByte(this.eazpxind())); this.cycles += 6; break;
      case 0xd1: this.cmp(this.a, this.readByte(this.eazpindy())); this.cycles += 5; break;
      case 0xd5: this.cmp(this.a, this.readByte(this.eazpx())); this.cycles += 4; break;
      case 0xdd: this.cmp(this.a, this.readByte(this.eaabsx())); this.cycles += 4; break;
      case 0xd9: this.cmp(this.a, this.readByte(this.eaabsy())); this.cycles += 4; break;

      // CPX / CPY
      case 0xe0: this.cmp(this.x, this.eaimm()); this.cycles += 2; break;
      case 0xec: this.cmp(this.x, this.readByte(this.eaabs())); this.cycles += 4; break;
      case 0xe4: this.cmp(this.x, this.readByte(this.eazp())); this.cycles += 3; break;
      case 0xc0: this.cmp(this.y, this.eaimm()); this.cycles += 2; break;
      case 0xcc: this.cmp(this.y, this.readByte(this.eaabs())); this.cycles += 4; break;
      case 0xc4: this.cmp(this.y, this.readByte(this.eazp())); this.cycles += 3; break;

      // DEC / DEX / DEY
      case 0xce: addr = this.eaabs(); val = (this.readByte(addr) - 1) & 0xff; this.setNZ(val); this.writeByte(addr, val); this.cycles += 6; break;
      case 0xc6: addr = this.eazp(); val = (this.readByte(addr) - 1) & 0xff; this.setNZ(val); this.writeByte(addr, val); this.cycles += 5; break;
      case 0xd6: addr = this.eazpx(); val = (this.readByte(addr) - 1) & 0xff; this.setNZ(val); this.writeByte(addr, val); this.cycles += 6; break;
      case 0xde: addr = this.eaabsx(); val = (this.readByte(addr) - 1) & 0xff; this.setNZ(val); this.writeByte(addr, val); this.cycles += 7; break;
      case 0xca: this.x = (this.x - 1) & 0xff; this.setNZ(this.x); this.cycles += 2; break;
      case 0x88: this.y = (this.y - 1) & 0xff; this.setNZ(this.y); this.cycles += 2; break;

      // EOR
      case 0x49: this.a ^= this.eaimm(); this.setNZ(this.a); this.cycles += 2; break;
      case 0x4d: this.a ^= this.readByte(this.eaabs()); this.setNZ(this.a); this.cycles += 4; break;
      case 0x45: this.a ^= this.readByte(this.eazp()); this.setNZ(this.a); this.cycles += 3; break;
      case 0x41: this.a ^= this.readByte(this.eazpxind()); this.setNZ(this.a); this.cycles += 6; break;
      case 0x51: this.a ^= this.readByte(this.eazpindy()); this.setNZ(this.a); this.cycles += 5; break;
      case 0x55: this.a ^= this.readByte(this.eazpx()); this.setNZ(this.a); this.cycles += 4; break;
      case 0x5d: this.a ^= this.readByte(this.eaabsx()); this.setNZ(this.a); this.cycles += 4; break;
      case 0x59: this.a ^= this.readByte(this.eaabsy()); this.setNZ(this.a); this.cycles += 4; break;

      // INC / INX / INY
      case 0xee: addr = this.eaabs(); val = (this.readByte(addr) + 1) & 0xff; this.setNZ(val); this.writeByte(addr, val); this.cycles += 6; break;
      case 0xe6: addr = this.eazp(); val = (this.readByte(addr) + 1) & 0xff; this.setNZ(val); this.writeByte(addr, val); this.cycles += 5; break;
      case 0xf6: addr = this.eazpx(); val = (this.readByte(addr) + 1) & 0xff; this.setNZ(val); this.writeByte(addr, val); this.cycles += 6; break;
      case 0xfe: addr = this.eaabsx(); val = (this.readByte(addr) + 1) & 0xff; this.setNZ(val); this.writeByte(addr, val); this.cycles += 7; break;
      case 0xe8: this.x = (this.x + 1) & 0xff; this.setNZ(this.x); this.cycles += 2; break;
      case 0xc8: this.y = (this.y + 1) & 0xff; this.setNZ(this.y); this.cycles += 2; break;

      // JMP / JSR / RTS / RTI
      case 0x4c: this.pc = this.eaabs(); this.cycles += 3; break;
      case 0x6c: this.pc = this.eaabsind(); this.cycles += 5; break;
      case 0x20:
        addr = this.eaabs();
        res = (this.pc - 1) & 0xffff;
        this.push((res >> 8) & 0xff);
        this.push(res & 0xff);
        this.pc = addr;
        this.cycles += 6;
        break;
      case 0x60:
        val = this.pop();
        this.pc = ((val | (this.pop() << 8)) + 1) & 0xffff;
        this.cycles += 6;
        break;
      case 0x40:
        this.p = this.pop() | FLAG_U;
        val = this.pop();
        this.pc = val | (this.pop() << 8);
        this.cycles += 6;
        break;

      // LDA
      case 0xa9: this.a = this.eaimm(); this.setNZ(this.a); this.cycles += 2; break;
      case 0xad: this.a = this.readByte(this.eaabs()); this.setNZ(this.a); this.cycles += 4; break;
      case 0xa5: this.a = this.readByte(this.eazp()); this.setNZ(this.a); this.cycles += 3; break;
      case 0xa1: this.a = this.readByte(this.eazpxind()); this.setNZ(this.a); this.cycles += 6; break;
      case 0xb1: this.a = this.readByte(this.eazpindy()); this.setNZ(this.a); this.cycles += 5; break;
      case 0xb5: this.a = this.readByte(this.eazpx()); this.setNZ(this.a); this.cycles += 4; break;
      case 0xbd: this.a = this.readByte(this.eaabsx()); this.setNZ(this.a); this.cycles += 4; break;
      case 0xb9: this.a = this.readByte(this.eaabsy()); this.setNZ(this.a); this.cycles += 4; break;

      // LDX
      case 0xa2: this.x = this.eaimm(); this.setNZ(this.x); this.cycles += 2; break;
      case 0xae: this.x = this.readByte(this.eaabs()); this.setNZ(this.x); this.cycles += 4; break;
      case 0xa6: this.x = this.readByte(this.eazp()); this.setNZ(this.x); this.cycles += 3; break;
      case 0xbe: this.x = this.readByte(this.eaabsy()); this.setNZ(this.x); this.cycles += 4; break;
      case 0xb6: this.x = this.readByte(this.eazpy()); this.setNZ(this.x); this.cycles += 4; break;

      // LDY
      case 0xa0: this.y = this.eaimm(); this.setNZ(this.y); this.cycles += 2; break;
      case 0xac: this.y = this.readByte(this.eaabs()); this.setNZ(this.y); this.cycles += 4; break;
      case 0xa4: this.y = this.readByte(this.eazp()); this.setNZ(this.y); this.cycles += 3; break;
      case 0xb4: this.y = this.readByte(this.eazpx()); this.setNZ(this.y); this.cycles += 4; break;
      case 0xbc: this.y = this.readByte(this.eaabsx()); this.setNZ(this.y); this.cycles += 4; break;

      // LSR
      case 0x4a:
        this.setFlag(FLAG_C, (this.a & 0x01) !== 0);
        this.a >>= 1;
        this.setNZ(this.a);
        this.cycles += 2;
        break;
      case 0x4e: addr = this.eaabs(); val = this.readByte(addr); this.setFlag(FLAG_C, (val & 1) !== 0); val >>= 1; this.setNZ(val); this.writeByte(addr, val); this.cycles += 6; break;
      case 0x46: addr = this.eazp(); val = this.readByte(addr); this.setFlag(FLAG_C, (val & 1) !== 0); val >>= 1; this.setNZ(val); this.writeByte(addr, val); this.cycles += 5; break;
      case 0x56: addr = this.eazpx(); val = this.readByte(addr); this.setFlag(FLAG_C, (val & 1) !== 0); val >>= 1; this.setNZ(val); this.writeByte(addr, val); this.cycles += 6; break;
      case 0x5e: addr = this.eaabsx(); val = this.readByte(addr); this.setFlag(FLAG_C, (val & 1) !== 0); val >>= 1; this.setNZ(val); this.writeByte(addr, val); this.cycles += 7; break;

      // NOP
      case 0xea: this.cycles += 2; break;

      // ORA
      case 0x09: this.a |= this.eaimm(); this.setNZ(this.a); this.cycles += 2; break;
      case 0x0d: this.a |= this.readByte(this.eaabs()); this.setNZ(this.a); this.cycles += 4; break;
      case 0x05: this.a |= this.readByte(this.eazp()); this.setNZ(this.a); this.cycles += 3; break;
      case 0x01: this.a |= this.readByte(this.eazpxind()); this.setNZ(this.a); this.cycles += 6; break;
      case 0x11: this.a |= this.readByte(this.eazpindy()); this.setNZ(this.a); this.cycles += 5; break;
      case 0x15: this.a |= this.readByte(this.eazpx()); this.setNZ(this.a); this.cycles += 4; break;
      case 0x1d: this.a |= this.readByte(this.eaabsx()); this.setNZ(this.a); this.cycles += 4; break;
      case 0x19: this.a |= this.readByte(this.eaabsy()); this.setNZ(this.a); this.cycles += 4; break;

      // Stack
      case 0x48: this.push(this.a); this.cycles += 3; break;
      case 0x08: this.push(this.p | FLAG_B | FLAG_U); this.cycles += 3; break;
      case 0x68: this.a = this.pop(); this.setNZ(this.a); this.cycles += 4; break;
      case 0x28: this.p = this.pop() | FLAG_U; this.cycles += 4; break;

      // ROL
      case 0x2a:
        res = (this.a << 1) | (this.p & FLAG_C ? 1 : 0);
        this.setFlag(FLAG_C, (res & 0x100) !== 0);
        this.a = res & 0xff;
        this.setNZ(this.a);
        this.cycles += 2;
        break;
      case 0x2e: addr = this.eaabs(); res = (this.readByte(addr) << 1) | (this.p & FLAG_C ? 1 : 0); this.setFlag(FLAG_C, (res & 0x100) !== 0); val = res & 0xff; this.setNZ(val); this.writeByte(addr, val); this.cycles += 6; break;
      case 0x26: addr = this.eazp(); res = (this.readByte(addr) << 1) | (this.p & FLAG_C ? 1 : 0); this.setFlag(FLAG_C, (res & 0x100) !== 0); val = res & 0xff; this.setNZ(val); this.writeByte(addr, val); this.cycles += 5; break;
      case 0x36: addr = this.eazpx(); res = (this.readByte(addr) << 1) | (this.p & FLAG_C ? 1 : 0); this.setFlag(FLAG_C, (res & 0x100) !== 0); val = res & 0xff; this.setNZ(val); this.writeByte(addr, val); this.cycles += 6; break;
      case 0x3e: addr = this.eaabsx(); res = (this.readByte(addr) << 1) | (this.p & FLAG_C ? 1 : 0); this.setFlag(FLAG_C, (res & 0x100) !== 0); val = res & 0xff; this.setNZ(val); this.writeByte(addr, val); this.cycles += 7; break;

      // ROR
      case 0x6a:
        val = this.a;
        this.a = (val >> 1) | (this.p & FLAG_C ? 0x80 : 0);
        this.setFlag(FLAG_C, (val & 1) !== 0);
        this.setNZ(this.a);
        this.cycles += 2;
        break;
      case 0x6e: addr = this.eaabs(); val = this.readByte(addr); res = (val >> 1) | (this.p & FLAG_C ? 0x80 : 0); this.setFlag(FLAG_C, (val & 1) !== 0); this.setNZ(res); this.writeByte(addr, res); this.cycles += 6; break;
      case 0x66: addr = this.eazp(); val = this.readByte(addr); res = (val >> 1) | (this.p & FLAG_C ? 0x80 : 0); this.setFlag(FLAG_C, (val & 1) !== 0); this.setNZ(res); this.writeByte(addr, res); this.cycles += 5; break;
      case 0x76: addr = this.eazpx(); val = this.readByte(addr); res = (val >> 1) | (this.p & FLAG_C ? 0x80 : 0); this.setFlag(FLAG_C, (val & 1) !== 0); this.setNZ(res); this.writeByte(addr, res); this.cycles += 6; break;
      case 0x7e: addr = this.eaabsx(); val = this.readByte(addr); res = (val >> 1) | (this.p & FLAG_C ? 0x80 : 0); this.setFlag(FLAG_C, (val & 1) !== 0); this.setNZ(res); this.writeByte(addr, res); this.cycles += 7; break;

      // SBC
      case 0xe9: this.sbc(this.eaimm()); this.cycles += 2; break;
      case 0xed: this.sbc(this.readByte(this.eaabs())); this.cycles += 4; break;
      case 0xe5: this.sbc(this.readByte(this.eazp())); this.cycles += 3; break;
      case 0xe1: this.sbc(this.readByte(this.eazpxind())); this.cycles += 6; break;
      case 0xf1: this.sbc(this.readByte(this.eazpindy())); this.cycles += 5; break;
      case 0xf5: this.sbc(this.readByte(this.eazpx())); this.cycles += 4; break;
      case 0xfd: this.sbc(this.readByte(this.eaabsx())); this.cycles += 4; break;
      case 0xf9: this.sbc(this.readByte(this.eaabsy())); this.cycles += 4; break;

      // STA / STX / STY
      case 0x8d: this.writeByte(this.eaabs(), this.a); this.cycles += 4; break;
      case 0x85: this.writeByte(this.eazp(), this.a); this.cycles += 3; break;
      case 0x81: this.writeByte(this.eazpxind(), this.a); this.cycles += 6; break;
      case 0x91: this.writeByte(this.eazpindy(), this.a); this.cycles += 6; break;
      case 0x95: this.writeByte(this.eazpx(), this.a); this.cycles += 4; break;
      case 0x9d: this.writeByte(this.eaabsx(), this.a); this.cycles += 5; break;
      case 0x99: this.writeByte(this.eaabsy(), this.a); this.cycles += 5; break;
      case 0x8e: this.writeByte(this.eaabs(), this.x); this.cycles += 4; break;
      case 0x86: this.writeByte(this.eazp(), this.x); this.cycles += 3; break;
      case 0x96: this.writeByte(this.eazpy(), this.x); this.cycles += 4; break;
      case 0x8c: this.writeByte(this.eaabs(), this.y); this.cycles += 4; break;
      case 0x84: this.writeByte(this.eazp(), this.y); this.cycles += 3; break;
      case 0x94: this.writeByte(this.eazpx(), this.y); this.cycles += 4; break;

      // Transfers
      case 0xaa: this.x = this.a; this.setNZ(this.x); this.cycles += 2; break;
      case 0xa8: this.y = this.a; this.setNZ(this.y); this.cycles += 2; break;
      case 0xba: this.x = this.s; this.setNZ(this.x); this.cycles += 2; break;
      case 0x8a: this.a = this.x; this.setNZ(this.a); this.cycles += 2; break;
      case 0x9a: this.s = this.x; this.cycles += 2; break;
      case 0x98: this.a = this.y; this.setNZ(this.a); this.cycles += 2; break;

      default: {
        // Opcodes não-documentados NMOS 6502 (ex: $17 SLO zp,X em $FB2F da ROM do TK 2000)
        // avançam PC conforme o modo de endereçamento codificado nos 5 bits inferiores.
        const m5 = op & 0x1f;
        const m4 = op & 0x0f;
        if (m5 === 0x0c || m5 === 0x19 || m5 >= 0x1c || m4 === 0x0f) {
          this.pc = (this.pc + 2) & 0xffff;
          this.cycles += 4;
        } else if (
          m4 === 0x00 || m4 === 0x03 || m4 === 0x04 || m4 === 0x07 || m4 === 0x0b ||
          op === 0x82 || op === 0xc2 || op === 0xe2
        ) {
          this.pc = (this.pc + 1) & 0xffff;
          this.cycles += 3;
        } else {
          this.cycles += 2;
        }
        break;
      }
    }

    if (this.interruptFlags & INT_NMI) {
      this.interruptFlags &= ~INT_NMI;
      this.push((this.pc >> 8) & 0xff);
      this.push(this.pc & 0xff);
      this.push(this.p);
      this.pc = this.readWord(0xfffa);
      this.cycles += 7;
    } else if ((this.interruptFlags & INT_IRQ) && !(this.p & FLAG_I)) {
      this.interruptFlags &= ~INT_IRQ;
      this.push((this.pc >> 8) & 0xff);
      this.push(this.pc & 0xff);
      this.push(this.p);
      this.p |= FLAG_I;
      this.pc = this.readWord(0xfffe);
      this.cycles += 7;
    }
  }
}
