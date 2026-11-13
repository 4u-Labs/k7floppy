// Controlador Disk II (Slot 6: $C0E0-$C0EF) e conversor .DSK / .DO / .PO -> NIB (6-and-2 GCR)

export const DSK_TRACKS = 35;
export const DSK_SECTORS = 16;
export const DSK_SECTOR_SIZE = 256;
export const DSK_SIZE = DSK_TRACKS * DSK_SECTORS * DSK_SECTOR_SIZE; // 143360 bytes
export const NIB_TRACK_SIZE = 6656;

// Ordem de setores lógicos em imagem .DSK/.DO (DOS 3.3) -> físico na trilha
const PHYS_TO_DOS_LOGICAL = [
  0x0, 0x7, 0xe, 0x6, 0xd, 0x5, 0xc, 0x4,
  0xb, 0x3, 0xa, 0x2, 0x9, 0x1, 0x8, 0xf,
];

// Ordem de setores em imagem .PO (ProDOS) -> físico na trilha
const PHYS_TO_PO_LOGICAL = [
  0x0, 0x8, 0x1, 0x9, 0x2, 0xa, 0x3, 0xb,
  0x4, 0xc, 0x5, 0xd, 0x6, 0xe, 0x7, 0xf,
];

// Tabela oficial 6-and-2 GCR do Disk II
const GCR62 = new Uint8Array([
  0x96, 0x97, 0x9a, 0x9b, 0x9d, 0x9e, 0x9f, 0xa6,
  0xa7, 0xab, 0xac, 0xad, 0xae, 0xaf, 0xb2, 0xb3,
  0xb4, 0xb5, 0xb6, 0xb7, 0xb9, 0xba, 0xbb, 0xbc,
  0xbd, 0xbe, 0xbf, 0xcb, 0xcd, 0xce, 0xcf, 0xd3,
  0xd6, 0xd7, 0xd9, 0xda, 0xdb, 0xdc, 0xdd, 0xde,
  0xdf, 0xe5, 0xe6, 0xe7, 0xe9, 0xea, 0xeb, 0xec,
  0xed, 0xee, 0xef, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6,
  0xf7, 0xf9, 0xfa, 0xfb, 0xfc, 0xfd, 0xfe, 0xff,
]);

const GCR62_INV = new Int8Array(256).fill(-1);
for (let i = 0; i < GCR62.length; i++) {
  GCR62_INV[GCR62[i]] = i;
}

function write44(out, pos, val) {
  out[pos] = ((val >> 1) & 0x55) | 0xaa;
  out[pos + 1] = (val & 0x55) | 0xaa;
  return pos + 2;
}

function nibblizeTrack(dskBytes, track, isProdos, volume = 254) {
  const out = new Uint8Array(NIB_TRACK_SIZE);
  out.fill(0xff);
  const map = isProdos ? PHYS_TO_PO_LOGICAL : PHYS_TO_DOS_LOGICAL;
  let pos = 0;

  // Gap inicial
  for (let i = 0; i < 48 && pos < NIB_TRACK_SIZE; i++) out[pos++] = 0xff;

  const nib2 = new Uint8Array(86);

  for (let phys = 0; phys < DSK_SECTORS; phys++) {
    const logicalSec = map[phys];
    const secOffset = (track * DSK_SECTORS + logicalSec) * DSK_SECTOR_SIZE;

    // Gap entre setores
    for (let i = 0; i < 16 && pos < NIB_TRACK_SIZE; i++) out[pos++] = 0xff;

    // Cabeçalho de endereço (D5 AA 96)
    out[pos++] = 0xd5;
    out[pos++] = 0xaa;
    out[pos++] = 0x96;
    pos = write44(out, pos, volume);
    pos = write44(out, pos, track);
    pos = write44(out, pos, phys);
    pos = write44(out, pos, volume ^ track ^ phys);
    out[pos++] = 0xde;
    out[pos++] = 0xaa;
    out[pos++] = 0xeb;

    // Gap antes dos dados
    for (let i = 0; i < 6; i++) out[pos++] = 0xff;

    // Campo de dados (D5 AA AD + 342 bytes GCR + checksum + DE AA EB)
    out[pos++] = 0xd5;
    out[pos++] = 0xaa;
    out[pos++] = 0xad;

    nib2.fill(0);
    for (let i = 0; i < 256; i++) {
      const val = dskBytes[secOffset + i];
      const idx = 85 - (i % 86);
      const shift = ((i / 86) | 0) * 2;
      const rev2 = ((val & 1) << 1) | ((val & 2) >> 1);
      nib2[idx] |= rev2 << shift;
    }

    let prev = 0;
    // Transmite nib2 em ordem 85..0 para coincidir com LDY #$56 / DEY / STA $0300,Y do boot Disk II
    for (let i = 85; i >= 0; i--) {
      const v = nib2[i] & 0x3f;
      out[pos++] = GCR62[v ^ prev];
      prev = v;
    }
    for (let i = 0; i < 256; i++) {
      const v = (dskBytes[secOffset + i] >> 2) & 0x3f;
      out[pos++] = GCR62[v ^ prev];
      prev = v;
    }
    out[pos++] = GCR62[prev];

    out[pos++] = 0xde;
    out[pos++] = 0xaa;
    out[pos++] = 0xeb;
  }

  return out;
}

// Clean-room Disk II P5/P6 Boot ROM ($C600-$C6FF):
// Recalibra até a Trilha 0 e lê Trilha 0 Setor Físico 0 para $0800-$08FF, depois JMP $0801.
// Implementado diretamente como código 6502 para compatibilidade com imagens .DSK padrão.
export function buildCleanDisk2BootRom() {
  const rom = new Uint8Array(256);
  const bytes = [];
  const labels = {};
  const fixups = [];

  const emit = (...arr) => {
    for (const b of arr) bytes.push(b & 0xff);
  };
  const label = (name) => {
    labels[name] = bytes.length;
  };
  const branch = (opcode, target) => {
    bytes.push(opcode);
    fixups.push({ type: 'rel', at: bytes.length, target });
    bytes.push(0x00);
  };
  const jmp = (target) => {
    bytes.push(0x4c);
    fixups.push({ type: 'abs', at: bytes.length, target });
    bytes.push(0x00, 0x00);
  };

  // Inicializa Slot 6 -> X = $60 ($2B = $60 para DOS/ProDOS saberem o slot de boot)
  emit(0xa2, 0x60);       // LDX #$60
  emit(0x86, 0x2b);       // STX $2B (boot slot * 16)
  emit(0xbd, 0x89, 0xc0); // LDA $C089,X (Motor ON)

  // Recalibra cabeçote puxando fase 3..0 para Trilha 0 (70 passos: Y=69..0 -> último Y=0 deixa X=$60!)
  emit(0xa0, 0x45);       // LDY #$45 (69 -> 70 iterações com BPL)
  label('recal');
  emit(0x98);             // TYA
  emit(0x29, 0x03);       // AND #$03
  emit(0x0a);             // ASL A
  emit(0x09, 0x61);       // ORA #$61
  emit(0xaa);             // TAX
  emit(0xbd, 0x80, 0xc0); // Phase ON
  emit(0xca);             // DEX (para Y=0: $61 - 1 = $60)
  emit(0xbd, 0x80, 0xc0); // Phase OFF
  emit(0x88);             // DEY
  branch(0x10, 'recal');  // BPL recal

  // Destino = $0800, setor desejado = 0
  emit(0xa9, 0x00);
  emit(0x85, 0x26);       // $26 = $00
  emit(0x85, 0x3d);       // $3D = setor 0
  emit(0xa9, 0x08);
  emit(0x85, 0x27);       // $27 = $08
  jmp('find_addr');

  // Subrotina wait_hdr: espera sequência D5 AA <A>
  label('wait_hdr');
  emit(0x85, 0x3f);       // STA $3F (3o byte alvo)
  label('wh_d5');
  emit(0x20); fixups.push({ type: 'abs', at: bytes.length, target: 'rdbyte' }); emit(0, 0);
  emit(0xc9, 0xd5);
  branch(0xd0, 'wh_d5');
  emit(0x20); fixups.push({ type: 'abs', at: bytes.length, target: 'rdbyte' }); emit(0, 0);
  emit(0xc9, 0xaa);
  branch(0xd0, 'wh_d5');
  emit(0x20); fixups.push({ type: 'abs', at: bytes.length, target: 'rdbyte' }); emit(0, 0);
  emit(0xc5, 0x3f);
  branch(0xd0, 'wh_d5');
  emit(0x60);

  // Subrotina rdbyte: aguarda latch pronto em $C0EC (X=$60)
  label('rdbyte');
  emit(0xbd, 0x8c, 0xc0);
  branch(0x10, 'rdbyte');
  emit(0x60);

  // Subrotina rd_gcr: lê byte GCR e converte para índice 0..63
  label('rd_gcr');
  emit(0x20); fixups.push({ type: 'abs', at: bytes.length, target: 'rdbyte' }); emit(0, 0);
  emit(0x86, 0x3e);
  emit(0xa2, 0x3f);
  label('dg_loop');
  emit(0xdd); fixups.push({ type: 'abs', at: bytes.length, target: 'gcr_tbl' }); emit(0, 0);
  branch(0xf0, 'dg_found');
  emit(0xca);
  branch(0x10, 'dg_loop');
  label('dg_found');
  emit(0x8a);
  emit(0xa6, 0x3e);
  emit(0x60);

  if (bytes.length > 0x5c) {
    throw new Error(`Disk II Boot ROM pre-C65C overflow: ${bytes.length} > 0x5c`);
  }
  while (bytes.length < 0x5c) emit(0xea); // Alinha find_addr exatamente em $C65C

  // Ponto de entrada padrão $C65C (chamado pelo boot inicial e por DOS/bootloaders via JSR $C65C)
  label('find_addr');
  emit(0xa9, 0x96);
  emit(0x20); fixups.push({ type: 'abs', at: bytes.length, target: 'wait_hdr' }); emit(0, 0);

  // Pula Vol (2 bytes) + Trilha (2 bytes)
  emit(0xa0, 0x04);
  label('skip_vt');
  emit(0x20); fixups.push({ type: 'abs', at: bytes.length, target: 'rdbyte' }); emit(0, 0);
  emit(0x88);
  branch(0xd0, 'skip_vt');

  // Lê setor físico (4-and-4): wait_hdr garante Carry=1 (via CMP $3F), logo ROL A preenche bit 0 = 1
  emit(0x20); fixups.push({ type: 'abs', at: bytes.length, target: 'rdbyte' }); emit(0, 0);
  emit(0x2a);
  emit(0x85, 0x3c);
  emit(0x20); fixups.push({ type: 'abs', at: bytes.length, target: 'rdbyte' }); emit(0, 0);
  emit(0x25, 0x3c);
  emit(0xc5, 0x3d);
  branch(0xd0, 'find_addr');

  // Procura dados D5 AA AD
  emit(0xa9, 0xad);
  emit(0x20); fixups.push({ type: 'abs', at: bytes.length, target: 'wait_hdr' }); emit(0, 0);

  // Lê 86 bytes secundários (Y = 85..0 -> $0300,Y)
  emit(0xa0, 0x56);
  emit(0xa9, 0x00);
  label('rd_sec2');
  emit(0x88);
  emit(0x85, 0x3c);
  emit(0x20); fixups.push({ type: 'abs', at: bytes.length, target: 'rd_gcr' }); emit(0, 0);
  emit(0x45, 0x3c);
  emit(0x99, 0x00, 0x03);
  emit(0xc0, 0x00);       // CPY #$00 (necessário pois EOR $3C altera Z!)
  branch(0xd0, 'rd_sec2');

  // Lê 256 bytes primários (Y já é 0 ao sair de rd_sec2; Y = 0..255 -> ($26),Y)
  label('rd_prim');
  emit(0x85, 0x3c);
  emit(0x20); fixups.push({ type: 'abs', at: bytes.length, target: 'rd_gcr' }); emit(0, 0);
  emit(0x45, 0x3c);
  emit(0x91, 0x26);
  emit(0xc8);
  branch(0xd0, 'rd_prim');

  // Reconstrói 2 bits inferiores em ($26),Y (Y já está em 0)
  label('post_init');
  emit(0xa2, 0x56);
  label('post_loop');
  emit(0xca);
  branch(0x30, 'post_init');
  emit(0xb1, 0x26);
  emit(0x5e, 0x00, 0x03);
  emit(0x2a);
  emit(0x5e, 0x00, 0x03);
  emit(0x2a);
  emit(0x91, 0x26);
  emit(0xc8);
  branch(0xd0, 'post_loop');

  // Avança página/setor e verifica total de setores em $0800
  emit(0xe6, 0x27);       // INC $27
  emit(0xe6, 0x3d);       // INC $3D
  emit(0xa5, 0x3d);       // LDA $3D
  emit(0xcd, 0x00, 0x08); // CMP $0800
  branch(0x90, 'find_addr'); // BCC find_addr

  // Salta para $0801 com Carry=1 (garantido ao passar por BCC) e X=$60 (ou retorna via RTS)
  emit(0xa6, 0x2b);       // LDX $2B
  emit(0x4c, 0x01, 0x08); // JMP $0801

  label('gcr_tbl');
  for (let i = 0; i < GCR62.length; i++) emit(GCR62[i]);

  if (bytes.length > 256) {
    throw new Error(`Disk II Boot ROM overflow: ${bytes.length} > 256`);
  }

  for (const fx of fixups) {
    const targetAddr = 0xc600 + labels[fx.target];
    if (fx.type === 'abs') {
      bytes[fx.at] = targetAddr & 0xff;
      bytes[fx.at + 1] = (targetAddr >> 8) & 0xff;
    } else {
      const rel = labels[fx.target] - (fx.at + 1);
      bytes[fx.at] = rel & 0xff;
    }
  }

  rom.set(bytes, 0);
  return rom;
}

export class Disk2Controller {
  constructor() {
    this.tracks = []; // 35 x Uint8Array(6656)
    this.diskName = null;
    this.halfTrack = 0; // 0..68 (trilha = halfTrack >> 1)
    this.phases = 0; // bitmask 0..3
    this.motorOn = false;
    this.drive = 0;
    this.q6 = false;
    this.q7 = false;
    this.bytePos = 0;
    this.latch = 0;
    this.writeProtected = false;
    this.bootRom = buildCleanDisk2BootRom();
  }

  reset() {
    this.halfTrack = 0;
    this.phases = 0;
    this.motorOn = false;
    this.q6 = false;
    this.q7 = false;
    this.bytePos = 0;
    this.latch = 0;
  }

  hasDisk() {
    return this.tracks.length === DSK_TRACKS;
  }

  insertDsk(uint8, name = 'DISCO.DSK') {
    if (!uint8 || uint8.length < DSK_SIZE) return false;
    const isProdos = name.toLowerCase().endsWith('.po');
    this.tracks = [];
    for (let t = 0; t < DSK_TRACKS; t++) {
      this.tracks.push(nibblizeTrack(uint8, t, isProdos, 254));
    }
    this.diskName = name;
    this.halfTrack = 0;
    this.bytePos = 0;
    this.motorOn = false;
    return true;
  }

  eject() {
    this.tracks = [];
    this.diskName = null;
    this.motorOn = false;
  }

  readBootRom(offset) {
    return this.bootRom[offset & 0xff];
  }

  stepMotor(addr) {
    const phase = (addr >> 1) & 0x03;
    const on = (addr & 1) !== 0;
    if (on) {
      this.phases |= 1 << phase;
      const curPhase = this.halfTrack & 0x03;
      if (((curPhase + 1) & 3) === phase && this.halfTrack < 68) {
        this.halfTrack++;
      } else if (((curPhase + 3) & 3) === phase && this.halfTrack > 0) {
        this.halfTrack--;
      }
    } else {
      this.phases &= ~(1 << phase);
    }
  }

  accessIo(addr, isWrite, val = 0) {
    const reg = addr & 0x0f;
    switch (reg) {
      case 0x0: case 0x1: case 0x2: case 0x3:
      case 0x4: case 0x5: case 0x6: case 0x7:
        this.stepMotor(reg);
        break;
      case 0x8:
        this.motorOn = false;
        break;
      case 0x9:
        this.motorOn = true;
        break;
      case 0xa:
        this.drive = 0;
        break;
      case 0xb:
        this.drive = 1;
        break;
      case 0xc:
        this.q6 = false;
        break;
      case 0xd:
        this.q6 = true;
        if (isWrite && this.q7) {
          this.latch = val & 0xff;
        }
        break;
      case 0xe:
        this.q7 = false;
        break;
      case 0xf:
        this.q7 = true;
        if (isWrite) {
          this.latch = val & 0xff;
        }
        break;
    }

    if (isWrite) return 0xff;

    // Status (Q6 = true, Q7 = false)
    if (this.q6 && !this.q7) {
      return this.writeProtected ? 0x80 : 0x00;
    }

    // Leitura da trilha ativa
    if (!this.q6 && !this.q7 && this.drive === 0 && this.hasDisk()) {
      const trkIdx = Math.min(DSK_TRACKS - 1, this.halfTrack >> 1);
      const track = this.tracks[trkIdx];
      const b = track[this.bytePos];
      this.bytePos = (this.bytePos + 1) % NIB_TRACK_SIZE;
      return b;
    }

    // Escrita em trilha (Q6 = true, Q7 = true) quando em read/shift
    if (this.q7 && this.drive === 0 && this.hasDisk() && !this.writeProtected) {
      const trkIdx = Math.min(DSK_TRACKS - 1, this.halfTrack >> 1);
      const track = this.tracks[trkIdx];
      track[this.bytePos] = this.latch;
      this.bytePos = (this.bytePos + 1) % NIB_TRACK_SIZE;
    }

    return 0x00;
  }
}
