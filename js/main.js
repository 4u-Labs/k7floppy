import { Tk2000Machine, VIDEO_WIDTH, VIDEO_HEIGHT } from './emu/machine.js';
import { Apple2Machine } from './emu/apple2.js';
import { BUILTIN_CT2_TAPES } from './emu/builtin_tapes.js';
import { CRTDisplay } from './crt.js';
import { audio } from './audio.js';
import { TkBasicShell } from './basic.js';
import { FLOPPY_DISKS, CASSETTE_TAPES, TK2000_CLASSIC_TAPES } from './media.js';
import { ChopperGame } from './games/chopper.js';
import { PatrolGame } from './games/patrol.js';
import { InvadersGame } from './games/invaders.js';
import { MuncherGame } from './games/muncher.js';
import { SnakeGame } from './games/snake.js';
import { BreakoutGame } from './games/breakout.js';

const STORAGE_TAPES_KEY = 'tk2000_saved_tapes_v1';
const STORAGE_A2_ROM_KEY = 'tk2000_apple2_rom_v1';

const GAME_FACTORIES = {
  chopper: ChopperGame,
  patrol: PatrolGame,
  invaders: InvadersGame,
  muncher: MuncherGame,
  snake: SnakeGame,
  breakout: BreakoutGame,
};

// Teclado fiel ao Microdigital TK 2000 II (matriz 8x6 + SHIFT/CTRL)
const TK_KEYBOARD_ROWS = [
  [
    { label: '1', sub: '!', code: 'Digit1', key: '1' },
    { label: '2', sub: '"', code: 'Digit2', key: '2' },
    { label: '3', sub: '#', code: 'Digit3', key: '3' },
    { label: '4', sub: '$', code: 'Digit4', key: '4' },
    { label: '5', sub: '%', code: 'Digit5', key: '5' },
    { label: '6', sub: '&', code: 'Digit6', key: '6' },
    { label: '7', sub: "'", code: 'Digit7', key: '7' },
    { label: '8', sub: '(', code: 'Digit8', key: '8' },
    { label: '9', sub: ')', code: 'Digit9', key: '9' },
    { label: '0', sub: '*', code: 'Digit0', key: '0' },
    { label: '←', sub: 'BS', code: 'ArrowLeft', key: 'ArrowLeft', cls: 'arrow' },
    { label: '→', sub: '', code: 'ArrowRight', key: 'ArrowRight', cls: 'arrow' },
  ],
  [
    { label: 'Q', code: 'KeyQ', key: 'Q' },
    { label: 'W', code: 'KeyW', key: 'W' },
    { label: 'E', code: 'KeyE', key: 'E' },
    { label: 'R', code: 'KeyR', key: 'R' },
    { label: 'T', code: 'KeyT', key: 'T' },
    { label: 'Y', code: 'KeyY', key: 'Y' },
    { label: 'U', code: 'KeyU', key: 'U' },
    { label: 'I', sub: '-', code: 'KeyI', key: 'I' },
    { label: 'O', sub: '=', code: 'KeyO', key: 'O' },
    { label: 'P', sub: '+', code: 'KeyP', key: 'P' },
    { label: '↑', code: 'ArrowUp', key: 'ArrowUp', cls: 'arrow' },
    { label: '↓', code: 'ArrowDown', key: 'ArrowDown', cls: 'arrow' },
  ],
  [
    { label: 'CTRL', code: 'ControlLeft', key: 'Control', cls: 'special wide', mod: 'ctrl' },
    { label: 'A', code: 'KeyA', key: 'A' },
    { label: 'S', code: 'KeyS', key: 'S' },
    { label: 'D', code: 'KeyD', key: 'D' },
    { label: 'F', code: 'KeyF', key: 'F' },
    { label: 'G', code: 'KeyG', key: 'G' },
    { label: 'H', code: 'KeyH', key: 'H' },
    { label: 'J', code: 'KeyJ', key: 'J' },
    { label: 'K', sub: '^', code: 'KeyK', key: 'K' },
    { label: 'L', sub: '@', code: 'KeyL', key: 'L' },
    { label: ':', sub: ';', code: 'Semicolon', key: ':' },
    { label: 'RETURN', code: 'Enter', key: 'Enter', cls: 'special wider' },
  ],
  [
    { label: 'SHIFT', code: 'ShiftLeft', key: 'Shift', cls: 'special wider', mod: 'shift' },
    { label: 'Z', code: 'KeyZ', key: 'Z' },
    { label: 'X', code: 'KeyX', key: 'X' },
    { label: 'C', code: 'KeyC', key: 'C' },
    { label: 'V', code: 'KeyV', key: 'V' },
    { label: 'B', code: 'KeyB', key: 'B' },
    { label: 'N', code: 'KeyN', key: 'N' },
    { label: 'M', code: 'KeyM', key: 'M' },
    { label: ',', sub: '<', code: 'Comma', key: ',' },
    { label: '.', sub: '>', code: 'Period', key: '.' },
    { label: '?', sub: '/', code: 'Slash', key: '?' },
  ],
  [
    { label: 'ESPAÇO', code: 'Space', key: ' ', cls: 'space' },
  ],
];

const CRT_MODES = [
  { id: 'color', label: 'Colorido' },
  { id: 'green', label: 'Verde P31' },
  { id: 'amber', label: 'Âmbar P3' },
];

// Referências DOM
const canvas = document.getElementById('crt-canvas');
const ctx = canvas.getContext('2d', { alpha: false });
ctx.imageSmoothingEnabled = false;

const crtScreenFrame = canvas.parentElement;
const crtScanlines = document.getElementById('crt-scanlines');
const engineBadge = document.getElementById('engine-badge');
const brandTitle = document.getElementById('brand-title');
const crtBrandLabel = document.getElementById('crt-brand-label');
const chassisLogo = document.getElementById('chassis-logo');
const chassisModel = document.getElementById('chassis-model');
const chassisSub = document.getElementById('chassis-sub');
const btnModeTk2000 = document.getElementById('btn-mode-tk2000');
const btnModeApple2 = document.getElementById('btn-mode-apple2');
const dropZone = document.getElementById('drop-zone');

const btnLamp = document.getElementById('btn-lamp');
const deskLamp = document.getElementById('desk-lamp');
const lampState = document.getElementById('lamp-state');
const btnTurbo = document.getElementById('btn-turbo');
const turboState = document.getElementById('turbo-state');
const btnScanlines = document.getElementById('btn-scanlines');
const scanlinesState = document.getElementById('scanlines-state');
const btnCrtMode = document.getElementById('btn-crt-mode');
const btnMonitorMode = document.getElementById('btn-monitor-mode');
const crtModeLabel = document.getElementById('crt-mode-label');
const btnMute = document.getElementById('btn-mute');
const muteState = document.getElementById('mute-state');
const btnPower = document.getElementById('btn-power');
const powerLed = document.getElementById('power-led');
const tkLed = document.getElementById('tk-led');
const btnReset = document.getElementById('btn-reset');

// K7 Deck DOM
const cassetteDeck = document.getElementById('cassette-deck');
const tapeCounter = document.getElementById('tape-counter');
const tapeLed = document.getElementById('tape-led');
const insertedTapeVisual = document.getElementById('inserted-tape-visual');
const insertedTapeTitle = document.getElementById('inserted-tape-title');
const btnTapePlay = document.getElementById('btn-tape-play');
const btnTapeRec = document.getElementById('btn-tape-rec');
const btnTapeRew = document.getElementById('btn-tape-rew');
const btnTapeStop = document.getElementById('btn-tape-stop');
const tapeFileInput = document.getElementById('tape-file-input');
const btnAutoloadTape = document.getElementById('btn-autoload-tape');
const tapeRack = document.getElementById('tape-rack');

// Joystick & Floppy DOM
const btnJoystickMode = document.getElementById('btn-joystick-mode');
const joyModeLabel = document.getElementById('joy-mode-label');
const keysHelp = document.getElementById('keys-help');
const joyLed = document.getElementById('joy-led');
const driveLed = document.getElementById('drive-led');
const insertedDiskEdge = document.getElementById('inserted-disk-edge');
const driveLatch = document.getElementById('drive-latch');
const driveStatusText = document.getElementById('drive-status-text');
const floppyRack = document.getElementById('floppy-rack');
const dskFileInput = document.getElementById('dsk-file-input');
const a2RomFileInput = document.getElementById('a2rom-file-input');
const a2RomStatus = document.getElementById('a2-rom-status');

// Teclado e Manuais
const tkKeyboardEl = document.getElementById('tk-keyboard');
const manualModal = document.getElementById('manual-modal');
const btnManual = document.getElementById('btn-manual');
const deskManual = document.getElementById('desk-manual');
const btnCloseManual = document.getElementById('btn-close-manual');
const basicManualModal = document.getElementById('basic-manual-modal');
const deskBasicManual = document.getElementById('desk-basic-manual');
const btnCloseBasicManual = document.getElementById('btn-close-basic-manual');
const basicSearchInput = document.getElementById('basic-search');
const basicManualContent = document.getElementById('basic-manual-content');
const a2ManualModal = document.getElementById('a2-manual-modal');
const deskA2Manual = document.getElementById('desk-a2-manual');
const btnCloseA2Manual = document.getElementById('btn-close-a2-manual');
const a2BasicManualModal = document.getElementById('a2-basic-manual-modal');
const deskA2BasicManual = document.getElementById('desk-a2-basic-manual');
const btnCloseA2BasicManual = document.getElementById('btn-close-a2-basic-manual');
const a2BasicSearch = document.getElementById('a2-basic-search');
const a2BasicManualContent = document.getElementById('a2-basic-manual-content');
const btnLang = document.getElementById('btn-lang');
const langState = document.getElementById('lang-state');

// Estado principal
const machine = new Tk2000Machine();
const apple2 = new Apple2Machine();
const emuImageData = ctx.createImageData(VIDEO_WIDTH, VIDEO_HEIGHT);
const bonusCrt = new CRTDisplay(canvas);

let powerOn = true;
let turboTape = true;
let crtModeIndex = 0;
let scanlinesOn = true;
let lampOn = true;
let muted = false;
let joystickMode = false;

let activeMode = 'tk2000'; // 'tk2000' | 'apple2' | 'arcade'
let activeFloppy = null;
let activeDskName = null;
let activeBonusTape = null;
let playingAsTkTape = false;
let currentLang = localStorage.getItem('tk2000_lang') === 'en' ? 'en' : 'pt';
const tr = (pt, en) => (currentLang === 'en' ? en : pt);
let activeBonusApp = null;

let userTapes = loadUserTapes();
let selectedTapeId = null;

// Modificadores sticky no teclado virtual
let stickyShift = false;
let stickyCtrl = false;
const keyElementsByCode = new Map();

// Estado joystick e jogos bônus
const joyKeysDown = new Set();
const bonusKeysDown = new Set();

// Fila de auto-digitação e máquina de estados do Auto-Load + RUN
const autoTypeQueue = [];
let autoTypeCurrent = null;
let autoTypeTimer = 0;
let onAutoTypeComplete = null;
let autoLoadPhase = 'idle'; // 'idle' | 'warm_wait' | 'typing_load' | 'playing_tape' | 'post_tape_wait'
let autoLoadWait = 0;
let autoLoadPendingCmd = '';

function loadUserTapes() {
  try {
    const raw = localStorage.getItem(STORAGE_TAPES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistUserTapes() {
  try {
    localStorage.setItem(STORAGE_TAPES_KEY, JSON.stringify(userTapes));
  } catch {
    // localStorage indisponível ou cheio
  }
}

function getAllTapes() {
  return [...userTapes, ...BUILTIN_CT2_TAPES];
}

function sanitizeTapeName(name) {
  return String(name || 'PROG')
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 12) || 'PROG';
}

function syncAudioUnlock() {
  audio.ensureContext();
  machine.speaker.ensureStarted();
  apple2.speaker.ensureStarted();
}

function syncActiveSpeakers() {
  machine.speaker.setMuted(muted || activeMode !== 'tk2000');
  apple2.speaker.setMuted(muted || activeMode !== 'apple2');
}

function updateCrtModeUI() {
  const mode = CRT_MODES[crtModeIndex];
  crtModeLabel.textContent = currentLang === 'en' ? ({ Colorido: 'Color', 'Fósforo Verde': 'Green P31', 'Âmbar Retro': 'Amber' }[mode.label] || mode.label) : mode.label;
  machine.crtMode = mode.id;
  apple2.crtMode = mode.id;
  bonusCrt.setMode(mode.id);
}

function updateLampUI() {
  document.body.classList.toggle('lamp-on', lampOn);
  lampState.textContent = lampOn ? tr('Acesa', 'On') : tr('Apagada', 'Off');
}

function updateMuteUI() {
  audio.setMuted(muted);
  syncActiveSpeakers();
  btnMute.classList.toggle('active', !muted);
  muteState.textContent = muted ? 'OFF' : 'ON';
}

function applyLanguageUI() {
  document.documentElement.lang = currentLang === 'en' ? 'en' : 'pt-BR';
  if (langState) langState.textContent = currentLang.toUpperCase();
  if (btnLang) btnLang.title = tr('Alternar idioma PT / EN', 'Switch language PT / EN');

  const tapeRackTitle = document.querySelector('#tape-rack-section .rack-title');
  if (tapeRackTitle) tapeRackTitle.textContent = tr('FITAS K7 TK 2000', 'TK 2000 TAPES');
  const floppyRackTitle = document.querySelector('#floppy-rack-section .rack-title');
  if (floppyRackTitle) floppyRackTitle.textContent = tr('DISQUETES APPLE II', 'APPLE II DISKS');

  const tapeOpenBtn = document.querySelector('#cassette-deck .file-upload-btn');
  if (tapeOpenBtn && tapeOpenBtn.firstChild) {
    tapeOpenBtn.firstChild.textContent = tr(' 📂 Abrir .CT2 / .WAV ', ' 📂 Open .CT2 / .WAV ');
  }
  const dskOpenBtn = document.querySelector('#floppy-drive-section .file-upload-btn:not(.rom-btn)');
  if (dskOpenBtn && dskOpenBtn.firstChild) {
    dskOpenBtn.firstChild.textContent = tr(' 📂 Abrir .DSK ', ' 📂 Open .DSK ');
  }
  const joyHint = document.querySelector('.joy-hint');
  if (joyHint) joyHint.textContent = tr('Ative para jogos com Joystick (ex: Karateka)', 'Enable for Joystick games (e.g. Karateka)');

  if (btnManual) btnManual.innerHTML = tr('📖 Manual &amp; Jogos', '📖 Manual &amp; Games');
  const setBook = (sel, mini, title, sub) => {
    const el = document.querySelector(sel);
    if (!el) return;
    const m = el.querySelector('.manual-mini');
    const st = el.querySelector('strong');
    const sm = el.querySelector('small');
    if (m) m.textContent = mini;
    if (st) st.textContent = title;
    if (sm) sm.textContent = sub;
  };
  setBook('#desk-manual', 'MICRODIGITAL', tr('MANUAL TK 2000', 'TK 2000 MANUAL'), tr('Operação, SAVE T & Jogos .CT2', 'Operation, SAVE T & .CT2 Tapes'));
  setBook('#desk-basic-manual', 'MICRODIGITAL • 1984', tr('MANUAL BASIC TK 2000', 'TK 2000 BASIC MANUAL'), tr('Comandos, HGR, SOUND & Funções', 'Commands, HGR, SOUND & Functions'));
  setBook('#desk-a2-manual', 'APPLE COMPUTER', tr('MANUAL APPLE II+', 'APPLE II+ MANUAL'), tr('Disk II, PR#6, DOS 3.3 & Jogos', 'Disk II, PR#6, DOS 3.3 & Games'));
  setBook('#desk-a2-basic-manual', 'APPLESOFT • 1979', tr('MANUAL APPLESOFT BASIC', 'APPLESOFT BASIC MANUAL'), tr('Comandos, GR, HGR, PEEK/POKE', 'Commands, GR, HGR, PEEK/POKE'));

  const packsBrand = document.getElementById('packs-box-brand');
  if (packsBrand) packsBrand.textContent = tr('PACKS & MANUAIS', 'PACKS & MANUALS');
  const setPack = (id, title, sub, titleAttr) => {
    const el = document.getElementById(id);
    if (!el) return;
    const st = el.querySelector('.pack-meta strong');
    const sm = el.querySelector('.pack-meta small');
    if (st) st.textContent = title;
    if (sm) sm.textContent = sub;
    if (titleAttr) el.title = titleAttr;
  };
  setPack(
    'pack-tk-media',
    tr('Pack Fitas & Discos', 'Tape & Disk Pack'),
    tr('tk2000.zip • .CT2/.DSK', 'tk2000.zip • .CT2/.DSK'),
    tr('Baixar todas as fitas .CT2 e discos .DSK do TK 2000 (1,5 MB)', 'Download all TK 2000 .CT2 tapes and .DSK images (1.5 MB)')
  );
  setPack(
    'pack-tk-manuals',
    tr('Pack Manuais TK 2000', 'TK 2000 Manuals Pack'),
    tr('6 PDFs originais', '6 Original PDFs'),
    tr('Baixar os 6 manuais originais do TK 2000 em PDF (69,5 MB)', 'Download all 6 original TK 2000 PDF manuals (69.5 MB)')
  );
  setPack(
    'pack-a2-media',
    tr('Pack Disquetes .DSK', '.DSK Floppy Pack'),
    tr('appleii.zip • 150 discos', 'appleii.zip • 150 disks'),
    tr('Baixar todos os 150 disquetes .DSK do Apple II+ (6,8 MB)', 'Download all 150 Apple II+ .DSK disk images (6.8 MB)')
  );
  setPack(
    'pack-a2-manuals',
    tr('Pack Manuais Apple II', 'Apple II Manuals Pack'),
    tr('4 PDFs originais', '4 Original PDFs'),
    tr('Baixar os 4 manuais originais do Apple II+ em PDF (142 MB)', 'Download all 4 original Apple II+ PDF manuals (142 MB)')
  );

  const btnCatalog = document.getElementById('btn-catalog');
  if (btnCatalog) btnCatalog.innerHTML = tr('🗂️ Catálogo', '🗂️ Catalog');
  const btnOpenTapeCat = document.getElementById('btn-open-tape-catalog');
  if (btnOpenTapeCat) btnOpenTapeCat.textContent = tr('🗂️ Gaveta', '🗂️ Drawer');
  const btnOpenFloppyCat = document.getElementById('btn-open-floppy-catalog');
  if (btnOpenFloppyCat) btnOpenFloppyCat.textContent = tr('🗂️ Caixa', '🗂️ Box');
  const tapeSearchEl = document.getElementById('tape-search-input');
  if (tapeSearchEl) tapeSearchEl.placeholder = tr('🔍 Buscar fita ou jogo...', '🔍 Search tape or game...');
  const floppySearchEl = document.getElementById('floppy-search-input');
  if (floppySearchEl) floppySearchEl.placeholder = tr('🔍 Buscar disquete...', '🔍 Search diskette...');

  const pillMap = {
    all: tr('Todos', 'All'),
    featured: tr('⭐ Top', '⭐ Top'),
    classic: tr('⭐ Clássicos', '⭐ Classics'),
    arcade: '🕹️ Arcade',
    adventure: tr('🏰 Aventura', '🏰 Adventure'),
    ct2: '📼 .CT2',
    apps: tr('🧰 BASIC', '🧰 BASIC'),
    pack: tr('📦 Packs', '📦 Packs'),
  };
  document.querySelectorAll('#tape-filter-pills .rack-pill, #floppy-filter-pills .rack-pill').forEach((btn) => {
    const c = btn.dataset.cat;
    if (c === 'arcade' && btn.closest('#tape-filter-pills')) {
      btn.textContent = tr('🕹️ Ação', '🕹️ Action');
    } else if (pillMap[c]) {
      btn.textContent = pillMap[c];
    }
  });

  const modal4uTitle = document.getElementById('modal-4ulabs-title');
  if (modal4uTitle) modal4uTitle.textContent = tr('🚀 Aplicativos, suporte e comunidade — 4u-Labs', '🚀 Apps, support and community — 4u-Labs');
  const modal4uDesc = document.getElementById('modal-4ulabs-desc');
  if (modal4uDesc) {
    modal4uDesc.innerHTML = tr(
      'O <strong>K7 &amp; Floppy</strong> faz parte do ecossistema gratuito e privado da <strong>4u-Labs</strong>. Execute jogos e programas reais de TK 2000 II e Apple II+ direto no navegador, sem anúncios, sem cadastro e 100% client-side.',
      '<strong>K7 &amp; Floppy</strong> is part of the free, privacy-first <strong>4u-Labs</strong> ecosystem. Run authentic TK 2000 II and Apple II+ software directly in your browser with zero ads, zero registration, and 100% client-side emulation.'
    );
  }
  const paypalLink = document.getElementById('eco-paypal-link');
  if (paypalLink) paypalLink.textContent = tr('☕ Apoiar o projeto (PayPal) ↗', '☕ Support this project (PayPal) ↗');

  const mobileSpaceEl = document.getElementById('mobile-space-label');
  if (mobileSpaceEl) mobileSpaceEl.textContent = tr('ESPAÇO', 'SPACE');

  updateLampUI();
  updateCrtModeUI();
  updateMuteUI();
  updateJoystickUI();
  updateTapeUI();
  renderTapeRack();
  renderFloppyRack();
  if (typeof renderCatalogModal === 'function') renderCatalogModal();
  lastKeysHelpHtml = '';
  updateKeysHelp();
}

function syncPlatformVisuals(platform) {
  const isA2 = platform === 'apple2';
  document.body.classList.toggle('machine-apple2', isA2);
  document.body.classList.toggle('machine-tk2000', !isA2);
  btnModeTk2000?.classList.toggle('active', !isA2);
  btnModeApple2?.classList.toggle('active', isA2);

  if (isA2) {
    if (brandTitle) brandTitle.textContent = 'K7 & Floppy • APPLE ][+';
    if (crtBrandLabel) crtBrandLabel.textContent = 'APPLE // MONITOR III';
    if (chassisLogo) chassisLogo.textContent = 'apple ][';
    if (chassisModel) chassisModel.textContent = 'plus';
    if (chassisSub) chassisSub.textContent = '64K • DISK II';
  } else {
    if (brandTitle) brandTitle.textContent = 'K7 & Floppy • TK 2000 II';
    if (crtBrandLabel) crtBrandLabel.textContent = 'PHILIPS // COLOR MONITOR 80';
    if (chassisLogo) chassisLogo.textContent = 'MICRODIGITAL';
    if (chassisModel) chassisModel.textContent = 'TK 2000 II';
    if (chassisSub) chassisSub.textContent = 'COLOR COMPUTER • 64K';
  }
}

function switchComputerPlatform(platform) {
  syncAudioUnlock();
  if (!powerOn) {
    powerOn = true;
    updatePowerUI();
  }

  if (platform === 'apple2') {
    machine.tape.stop();
    playingAsTkTape = false;
    activeBonusTape = null;
    activeFloppy = null;
    activeMode = 'apple2';
    apple2.crtMode = CRT_MODES[crtModeIndex].id;
    syncPlatformVisuals('apple2');
    syncActiveSpeakers();
    if (activeDskName && apple2.disk2.hasDisk()) {
      const shortName = activeDskName.replace(/\.(dsk|do|po)$/i, '').toUpperCase().slice(0, 18);
      engineBadge.textContent = `APPLE II+ • ${shortName}`;
      driveStatusText.textContent = `${shortName} — SHIFT+ESC EJETA`;
    } else {
      apple2.hardReset();
      engineBadge.textContent = 'APPLE II+ • 6502';
      driveStatusText.textContent = 'DRIVE VAZIO — CLIQUE EM UM DISCO';
      if (joystickMode) {
        joystickMode = false;
        updateJoystickUI();
      }
    }
    lastScanTime = 0;
    renderFloppyRack();
    updateTapeUI();
  } else {
    ejectBonusApp(true, { keepPlatform: false });
    activeMode = 'tk2000';
    syncPlatformVisuals('tk2000');
    syncActiveSpeakers();
    engineBadge.textContent = 'CPU 6502 • ROM REAL 16K';
    if (joystickMode) {
      joystickMode = false;
      updateJoystickUI();
    }
    lastScanTime = 0;
    updateTapeUI();
  }
}

function updatePowerUI() {
  powerLed.style.opacity = powerOn ? '1' : '0.2';
  tkLed.classList.toggle('on', powerOn);
  btnPower.classList.toggle('on', powerOn);
  crtScreenFrame.classList.toggle('crt-off', !powerOn);
  if (!powerOn) {
    ctx.fillStyle = '#050608';
    ctx.fillRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
  }
}

function updateJoystickUI() {
  btnJoystickMode.classList.toggle('active', joystickMode);
  joyLed.classList.toggle('green-on', joystickMode);
  joyModeLabel.textContent = joystickMode ? 'Joystick ($C064)' : tr('Teclado', 'Keyboard');
  const mobileJoyBtn = document.getElementById('btn-mobile-joy');
  const mobileJoyState = document.getElementById('mobile-joy-state');
  if (mobileJoyBtn) mobileJoyBtn.classList.toggle('active', joystickMode);
  if (mobileJoyState) mobileJoyState.textContent = joystickMode ? 'Joystick' : tr('Teclas', 'Keys');
  if (!joystickMode) {
    joyKeysDown.clear();
    machine.paddleX = 128;
    machine.paddleY = 128;
    machine.btn0 = false;
    machine.btn1 = false;
    apple2.paddleX = 128;
    apple2.paddleY = 128;
    apple2.btn0 = false;
    apple2.btn1 = false;
  }
}


// Catálogo de controles conhecidos de clássicos Apple II / TK 2000 + Scanner automático da RAM 6502
const KNOWN_GAME_PROFILES = [
  {
    match: /karateka/i,
    title: 'KARATEKA (APPLE II)',
    rows: [
      ['K / J', 'ativar Teclado (K) ou Joystick (J)'],
      ['Espaço', 'postura de luta ↔ em pé'],
      ['←  →', 'avançar / recuar (B: corrida)'],
      ['Q / A / Z', 'soco: alto (Q), médio (A), baixo (Z)'],
      ['W / S / X', 'chute: alto (W), médio (S), baixo (X)'],
      ['Ctrl+S / Esc', 'som (Ctrl+S) / pausa (Esc)'],
    ],
  },
  {
    match: /choplifter/i,
    title: 'CHOPLIFTER',
    rows: [
      ['← → ↑ ↓', 'pilotar helicóptero (Joystick)'],
      ['Espaço', 'atirar (botão 0)'],
      ['Alt', 'girar direção do helicóptero (botão 1)'],
      ['Ctrl+S / Esc', 'som (Ctrl+S) / pausa (Esc)'],
    ],
  },
  {
    match: /lode\s*runner/i,
    title: 'LODE RUNNER',
    rows: [
      ['← → ↑ ↓', 'mover (Joystick) ou I / J / K / M'],
      ['Espaço / Alt', 'cavar esq. (Espaço) / dir. (Alt)'],
      ['U / O', 'cavar esq. / dir. (modo Teclado)'],
      ['Ctrl+J / Ctrl+K', 'modo Joystick / Teclado'],
      ['Esc', 'pausar'],
    ],
  },
  {
    match: /boulder\s*dash/i,
    title: 'BOULDER DASH',
    rows: [
      ['← → ↑ ↓', 'mover e escavar túneis'],
      ['Espaço', 'cavar parado (segurar botão 0 + seta)'],
      ['1 / 2', 'selecionar 1 ou 2 jogadores'],
      ['Ctrl+S / Ctrl+R', 'som / reiniciar fase'],
      ['Esc', 'pausar'],
    ],
  },
  {
    match: /wolfenstein/i,
    title: 'CASTLE WOLFENSTEIN',
    preferKeyboard: true,
    rows: [
      ['W / A / X / D', 'mover cima / esq. / baixo / dir.'],
      ['Q / E / Z / C', 'mover nas diagonais (S: parar)'],
      ['K / ; / L', 'mirar (K / ;) e atirar (L)'],
      ['M / , / .', 'jogar granada'],
      ['Espaço / Enter', 'revistar, abrir baú/porta / confirmar'],
    ],
  },
  {
    match: /donkey\s*kong/i,
    title: 'DONKEY KONG',
    rows: [
      ['← → ↑ ↓', 'correr e subir escadas'],
      ['Espaço', 'pular (botão 0)'],
      ['1 / 2', '1 ou 2 jogadores'],
      ['Ctrl+S / Ctrl+R', 'som / reiniciar'],
      ['Esc', 'pausar'],
    ],
  },
  {
    match: /moon\s*patrol/i,
    title: 'MOON PATROL',
    rows: [
      ['K / J', 'modo Teclado (K) ou Joystick (J)'],
      ['← →', 'acelerar / frear o jipe'],
      ['A (ou ↑)', 'pular crateras'],
      ['Espaço', 'atirar para frente e cima'],
      ['1 / 2 / Esc', 'jogadores (1/2) / pausa (Esc)'],
    ],
  },
  {
    match: /ms\.?\s*pac.?man|pac.?man/i,
    title: 'PAC-MAN / MS. PAC-MAN',
    rows: [
      ['← → ↑ ↓', 'mover no labirinto (Joystick)'],
      ['A / Z / ← →', 'mover no teclado (se aplicável)'],
      ['Espaço', 'iniciar partida'],
      ['Esc', 'pausar'],
    ],
  },
  {
    match: /frogger/i,
    title: 'FROGGER',
    preferKeyboard: true,
    rows: [
      ['I / J / K / M', 'saltar (ou D / B / setas)'],
      ['Espaço', 'iniciar partida'],
      ['Ctrl+S / Esc', 'som (Ctrl+S) / pausa (Esc)'],
    ],
  },
  {
    match: /dig\s*dug/i,
    title: 'DIG DUG',
    rows: [
      ['← → ↑ ↓', 'cavar e mover'],
      ['Espaço', 'bombar inimigos (botão 0)'],
      ['Ctrl+S / Esc', 'som (Ctrl+S) / pausa (Esc)'],
    ],
  },
  {
    match: /galaxian/i,
    title: 'GALAXIAN',
    rows: [
      ['← →', 'mover nave (Joystick)'],
      ['Espaço', 'atirar (botão 0)'],
      ['Esc', 'pausar'],
    ],
  },
  {
    match: /sabotage/i,
    title: 'SABOTAGE',
    rows: [
      ['← → (ou D / F)', 'girar canhão esq. / dir.'],
      ['Espaço', 'atirar'],
      ['Y / N', 'jogar novamente (Sim / Não)'],
    ],
  },
  {
    match: /spy\s*hunter/i,
    title: 'SPY HUNTER',
    rows: [
      ['← → ↑ ↓', 'dirigir e acelerar/frear'],
      ['Espaço', 'metralhadora (botão 0)'],
      ['Alt', 'óleo / fumaça (botão 1)'],
      ['Esc', 'pausar'],
    ],
  },
  {
    match: /zaxxon/i,
    title: 'ZAXXON',
    rows: [
      ['← → ↑ ↓', 'desviar e controlar altitude'],
      ['Espaço', 'atirar (botão 0)'],
      ['1 / 2 / Esc', 'jogadores (1/2) / pausa (Esc)'],
    ],
  },
  {
    match: /montezuma/i,
    title: 'MONTEZUMA’S REVENGE',
    rows: [
      ['Tecla 2 (menu)', 'iniciar Montezuma’s Revenge'],
      ['← → ↑ ↓', 'mover / subir escadas'],
      ['Espaço', 'pular'],
    ],
  },
  {
    match: /burger\s*time/i,
    title: 'BURGERTIME',
    preferKeyboard: true,
    arrowRemap: {
      ArrowUp: ['KeyI', 'I'],
      ArrowDown: ['KeyK', 'K'],
      ArrowLeft: ['KeyJ', 'J'],
      ArrowRight: ['KeyL', 'L'],
    },
    rows: [
      ['← → ↑ ↓ (ou I/J/K/L)', 'mover o Chef'],
      ['Espaço', 'jogar pimenta'],
      ['A (menu disco)', 'iniciar BurgerTime'],
      ['Q / Esc / Ctrl+R', 'som (Q) / pausa (Esc) / reiniciar'],
    ],
  },
  {
    match: /apple\s*panic/i,
    title: 'APPLE PANIC',
    preferKeyboard: true,
    arrowRemap: {
      ArrowUp: ['KeyI', 'I'],
      ArrowDown: ['KeyK', 'K'],
      ArrowLeft: ['KeyJ', 'J'],
      ArrowRight: ['KeyL', 'L'],
    },
    rows: [
      ['← → ↑ ↓ (ou I/J/K/L)', 'mover e subir escadas'],
      ['A / S', 'cavar e tapar buracos'],
      ['Espaço / S', 'iniciar partida'],
    ],
  },
  {
    match: /tetris/i,
    title: 'TETRIS (BEAUTIFUL BOOT)',
    preferKeyboard: true,
    rows: [
      ['A (menu disco)', 'iniciar Tetris'],
      ['← →', 'mover peça'],
      ['Espaço / Esc', 'girar peça / pausar'],
      ['Space no menu', 'muda slot (Enter volta)'],
    ],
  },
  {
    match: /gorgon/i,
    title: 'GORGON (SIRIUS)',
    preferKeyboard: true,
    arrowRemap: {
      ArrowUp: ['KeyA', 'A'],
      ArrowDown: ['KeyZ', 'Z'],
    },
    rows: [
      ['← → ↑ ↓ (ou A/Z + ←/→)', 'pilotar nave'],
      ['Espaço', 'disparar laser'],
    ],
  },
  {
    match: /super\s*taxman/i,
    title: 'SUPER TAXMAN',
    preferKeyboard: true,
    arrowRemap: {
      ArrowUp: ['Semicolon', ';'],
      ArrowDown: ['Slash', '/'],
    },
    rows: [
      ['← → ↑ ↓ (ou ← → ; /)', 'mover no labirinto'],
      ['K / 1 / Espaço', 'modo teclado / iniciar / pausar'],
    ],
  },
  {
    match: /sea\s*dragon/i,
    title: 'SEA DRAGON',
    preferKeyboard: true,
    arrowRemap: {
      ArrowUp: ['KeyA', 'A'],
      ArrowDown: ['KeyZ', 'Z'],
    },
    rows: [
      ['← → ↑ ↓ (ou A/Z + ←/→)', 'navegar submarino'],
      ['Espaço / Return', 'torpedo / carga'],
    ],
  },
  {
    match: /beer\s*run/i,
    title: 'BEER RUN (SIRIUS)',
    preferKeyboard: true,
    rows: [
      ['C (menu disco)', 'iniciar Beer Run'],
      ['← → / Espaço', 'mover / subir e saltar'],
    ],
  },
  {
    match: /cross\s*fire/i,
    title: 'CROSSFIRE (SIERRA)',
    preferKeyboard: true,
    rows: [
      ['D (menu disco)', 'iniciar CrossFire'],
      ['E / S / D / F', 'mover nave'],
      ['I / J / K / L', 'atirar em 4 direções'],
      ['Espaço', 'interromper disparo'],
    ],
  },
  {
    match: /\bescape\b/i,
    title: 'ESCAPE',
    preferKeyboard: true,
    rows: [
      ['↑ ↓ / Teclado', 'mover / opções'],
      ['Return / Esc', 'confirmar / sair'],
    ],
  },
  {
    match: /pop\s*eye/i,
    title: 'POPEYE',
    rows: [
      ['N (boot)', 'responder Não ao Mockingboard'],
      ['Setas / Joystick', 'mover Popeye'],
      ['Espaço', 'dar soco'],
    ],
  },
  {
    match: /eliminator/i,
    title: 'ELIMINATOR',
    rows: [
      ['BRUN ELIMINATOR + Return', 'rodar no prompt ] do DOS'],
      ['Setas / Joystick + Espaço', 'navegar e atirar'],
    ],
  },
  {
    match: /pest\s*patrol/i,
    title: 'PEST PATROL',
    rows: [
      ['BRUN PEST PATROL + Return', 'rodar no prompt ] do DOS'],
      ['← → + Espaço', 'mover e atirar'],
    ],
  },
  {
    match: /wavy\s*navy/i,
    title: 'WAVY NAVY',
    rows: [
      ['Tecla 2 (menu)', 'iniciar Wavy Navy'],
      ['Setas / Joystick + Espaço', 'navegar ondas e atirar'],
    ],
  },
  {
    match: /centipede_bugbattle|thief_threshold|adventureland/i,
    title: 'MENU RAM / BOOT',
    preferKeyboard: true,
    rows: [
      ['R + nome + Return', 'executar arquivo listado na tela'],
      ['Espaço / Teclado', 'navegar e jogar'],
    ],
  },
  {
    match: /zork|hitchhiker|deadline|enchanter|starcross|suspended|cutthroats|ballyhoo|seastalker|moon\s*mist|mystery\s*house|mission-?asteroid|transylvania|chivalry|dungeon\s*campaign|akalabeth|odyssey|apple\s*logo|graforth|robot\s*war|bridge|monopoly|lemonade|shanghai|xadrez|mission\s*crush|broadsides|carrier\s*force|colonial\s*conquest|computer\s*baseball|quarterback|cosmic\s*balance|crush.*chomp|fighter\s*command|galactic\s*gladiators|knights.*desert|micro\s*league|panzer|president\s*elect|rails\s*west|tigers.*snow|titan\s*empire|aztec/i,
    title: 'TECLADO / AVENTURA / ESTRATÉGIA',
    preferKeyboard: true,
    rows: [
      ['Teclado PC', 'comandos de texto / estratégia'],
      ['Return / Esc', 'confirmar / menu'],
    ],
  },
  {
    match: /breakout|pie-?man|autobahn|canyon\s*climber|crystal\s*castles|cyclod|guardian|jawbreaker|kamikaze|pitfall|narnia/i,
    title: 'MENU BEAUTIFUL BOOT',
    rows: [
      ['Letras A–Z', 'abrir jogo da lista na tela'],
      ['Space (no menu)', 'pede Slot (aperte Return p/ voltar)'],
      ['Setas / Joystick + Espaço', 'controles após iniciar o jogo'],
    ],
  },
];

let lastScanTime = 0;
let cachedScanResult = { keys: [], usesJoystick: false };

function scanActiveRamForControls() {
  const now = performance.now();
  if (now - lastScanTime < 1200) return cachedScanResult;
  lastScanTime = now;

  const ram = activeMode === 'apple2' ? apple2.ram : machine.ram;
  const maxAddr = 0xc000;
  const keys = new Set();
  let usesJoystick = false;

  for (let a = 0x0200; a < maxAddr - 3; a++) {
    const op = ram[a];
    // Instruções LDA / BIT / LDX / LDY absolutas ou indexadas em $C0xx
    if (op === 0xad || op === 0x2c || op === 0xae || op === 0xac || op === 0xbd || op === 0xbc) {
      const lo = ram[a + 1];
      const hi = ram[a + 2];
      if (hi === 0xc0 && (lo === 0x61 || lo === 0x62 || lo === 0x64 || lo === 0x65 || lo === 0x70)) {
        usesJoystick = true;
      }
      if (hi === 0xc0 && (lo === 0x00 || (activeMode === 'tk2000' && lo <= 0x0f))) {
        const limit = Math.min(maxAddr - 1, a + 160);
        for (let j = a + 3; j < limit; j++) {
          if (ram[j] === 0xc9) {
            const imm = ram[j + 1];
            const ascii = imm & 0x7f;
            if (imm >= 0x80 || activeMode === 'tk2000') {
              if (ascii === 0x20) keys.add('Espaço');
              else if (ascii === 0x0d) keys.add('Enter');
              else if (ascii === 0x1b) keys.add('Esc');
              else if (ascii === 0x08) keys.add('←');
              else if (ascii === 0x15) keys.add('→');
              else if (ascii === 0x0b) keys.add('↑');
              else if (ascii === 0x0a) keys.add('↓');
              else if (ascii >= 0x41 && ascii <= 0x5a) keys.add(String.fromCharCode(ascii));
              else if (ascii >= 0x30 && ascii <= 0x39) keys.add(String.fromCharCode(ascii));
              else if (ascii >= 0x01 && ascii <= 0x1a) keys.add('Ctrl+' + String.fromCharCode(ascii + 64));
            }
          }
        }
      }
    }
  }
  cachedScanResult = { keys: [...keys], usesJoystick };
  return cachedScanResult;
}

// Painel "TECLAS": mostra os controles válidos para o modo/mídia atual + detecção automática na RAM
let lastKeysHelpHtml = '';
function updateKeysHelp() {
  if (!keysHelp) return;
  const rows = [];
  let title = 'TECLAS';
  const row = (k, d) => rows.push(`<div class="kh-row"><kbd>${k}</kbd><span>${d}</span></div>`);

  const media = activeBonusTape || activeFloppy;
  if (activeMode === 'arcade' && media?.controls) {
    title = `TECLAS • ${media.shortLabel || media.title}`;
    for (const part of media.controls.split('|')) {
      const [k, ...d] = part.split(':');
      if (d.length) row(k.trim(), d.join(':').trim());
      else row(k.trim(), '');
    }
  } else if (activeMode === 'arcade') {
    title = 'TECLAS • BASIC';
    row('Digitar', 'comandos BASIC');
    row('Esc', 'sair');
  } else if (activeMode === 'apple2') {
    const dskTitle = activeDskName || activeFloppy?.title || '';
    const profile = KNOWN_GAME_PROFILES.find((p) => p.match.test(dskTitle));
    const scan = scanActiveRamForControls();

      if ( profile ) {
      title = `TECLAS • ${profile.title}`;
      for (const [k, d] of profile.rows) row(k, d);
      if (joystickMode) {
        row('Modo atual', 'Joystick ON (Setas + Espaço/Alt)');
      } else {
        row('Modo atual', 'Teclado ON');
      }
    } else if (media?.controls) {
      title = `TECLAS • ${media.shortLabel || media.title}`;
      for (const part of media.controls.split('|')) {
        const [k, ...d] = part.split(':');
        if (d.length) row(k.trim(), d.join(':').trim());
        else row('Controle', k.trim());
      }
      if (scan.keys.length > 0) {
        row('Detectadas RAM', scan.keys.slice(0, 10).join(', '));
      }
    } else {
      title = joystickMode ? 'TECLAS • APPLE II (JOYSTICK)' : 'TECLAS • APPLE II (TECLADO)';
      if (joystickMode) {
        row('← →', 'andar / mover');
        row('↑ ↓', 'cima / baixo');
        row('Espaço / Alt', 'botão 0 (Espaço) / botão 1 (Alt)');
      } else {
        row('Teclado PC', 'digita no Apple II');
        row('PR#6 + Enter', 'dar boot no disco');
      }
      if (scan.keys.length > 0) {
        const list = scan.keys.slice(0, 12).join(', ');
        row('Detectadas RAM', list);
      }
      if (scan.usesJoystick) {
        row('Hardware RAM', 'Joystick ($C061/$C064) detectado');
      }
    }
    row('Shift+Esc', 'ejetar disco');
  } else {
    const tapeMeta =
      activeBonusTape ||
      TK2000_CLASSIC_TAPES.find((t) => t.id === selectedTapeId) ||
      getAllTapes().find((t) => t.id === selectedTapeId);
    const tapeLabel = activeDskName || machine.tape.tapeName || tapeMeta?.title || '';
    const profile = KNOWN_GAME_PROFILES.find((p) => p.match.test(tapeLabel));
    const scan = scanActiveRamForControls();

    title = tapeMeta ? `TECLAS • ${tapeMeta.shortLabel || tapeMeta.title}` : 'TECLAS • TK 2000';
    if (profile) {
      for (const [k, d] of profile.rows) row(k, d);
    } else if (tapeMeta?.controls) {
      for (const part of tapeMeta.controls.split('|')) {
        const [k, ...d] = part.split(':');
        if (d.length) row(k.trim(), d.join(':').trim());
        else row('Controle', k.trim());
      }
    } else if (tapeMeta?.id === 'builtin-piano') {
      row('A S D F G H J K', 'tocar notas musicais');
      row('Q', 'encerrar programa');
    } else if (tapeMeta?.id === 'builtin-adiv') {
      row('0 a 9 + Enter', 'digitar palpite e confirmar');
    } else if (tapeMeta?.id === 'builtin-lab' || tapeMeta?.id === 'builtin-arte') {
      row('Automático', 'demonstração gráfica HGR');
      row('Ctrl+C', 'interromper BASIC');
    } else if (joystickMode) {
      row('← →  ↑ ↓', 'joystick');
      row('Espaço / Alt', 'botão 0 / botão 1');
    } else {
      row('Teclado do PC', 'digita no TK 2000');
      row('Enter', 'RETURN');
      row('← / Backspace', 'apagar');
    }
    if (scan.keys.length > 0 && !profile) {
      row('Detectadas RAM', scan.keys.slice(0, 10).join(', '));
    }
    row('Shift+Esc', 'ejetar fita / reset');
  }
  const html = `<span class="kh-title">${title}</span>${rows.join('')}`;
  if (html !== lastKeysHelpHtml) {
    lastKeysHelpHtml = html;
    keysHelp.innerHTML = html;
  }
}

function updateJoystickAxes() {
  const left = joyKeysDown.has('ArrowLeft');
  const right = joyKeysDown.has('ArrowRight');
  const up = joyKeysDown.has('ArrowUp');
  const down = joyKeysDown.has('ArrowDown');

  const px = left && !right ? 0 : right && !left ? 255 : 128;
  const py = up && !down ? 0 : down && !up ? 255 : 128;
  const b0 = joyKeysDown.has('Space');
  const b1 = joyKeysDown.has('AltLeft') || joyKeysDown.has('AltRight');

  machine.paddleX = px;
  machine.paddleY = py;
  machine.btn0 = b0;
  machine.btn1 = b1;

  apple2.paddleX = px;
  apple2.paddleY = py;
  apple2.btn0 = b0;
  apple2.btn1 = b1;
}

function updateTapeUI() {
  const tape = machine.tape;
  const hasTape = tape.hasTape();

  if (activeBonusTape) {
    cassetteDeck.classList.add('playing');
    cassetteDeck.classList.remove('recording');
    btnTapePlay.classList.add('pressed');
    btnTapeRec.classList.remove('pressed');
    tapeLed.classList.remove('active');
    tapeLed.classList.add('green-on');
    tapeCounter.textContent = playingAsTkTape ? 'K7 ' : 'ARC';
    insertedTapeVisual.classList.remove('empty');
    insertedTapeVisual.style.setProperty('--tape-color', activeBonusTape.color || '#eab308');
    insertedTapeTitle.textContent = `${activeBonusTape.title} (${playingAsTkTape ? tr('SHIFT+ESC SAIR', 'SHIFT+ESC EXIT') : 'ESC P/ SAIR'})`;
    return;
  }

  cassetteDeck.classList.toggle('playing', tape.playing);
  cassetteDeck.classList.toggle('recording', tape.recording);

  btnTapePlay.classList.toggle('pressed', tape.playing);
  btnTapeRec.classList.toggle('pressed', tape.recording);

  tapeLed.classList.remove('active', 'green-on');
  if (tape.recording) {
    tapeLed.classList.add('active');
  } else if (tape.playing) {
    tapeLed.classList.add('green-on');
  }

  let counterNum = 0;
  if (tape.recording) {
    counterNum = Math.min(999, Math.floor(tape.recordedDeltas.length / 24));
  } else if (hasTape) {
    counterNum = Math.floor(tape.getProgress() * 999);
  }
  tapeCounter.textContent = String(counterNum).padStart(3, '0');

  if (tape.recording) {
    insertedTapeVisual.classList.remove('empty');
    insertedTapeVisual.style.setProperty('--tape-color', '#dc2626');
    insertedTapeTitle.textContent = `REC ● ${tape.tapeName || 'GRAVANDO'}`;
  } else if (hasTape) {
    insertedTapeVisual.classList.remove('empty');
    const meta = getAllTapes().find((t) => t.id === selectedTapeId);
    insertedTapeVisual.style.setProperty('--tape-color', meta?.color || '#eab308');
    insertedTapeTitle.textContent = tape.tapeName || meta?.title || 'FITA K7 INSERIDA';
  } else {
    insertedTapeVisual.classList.add('empty');
    insertedTapeTitle.textContent = tr('SEM FITA — ARRASTE .CT2/.WAV', 'NO TAPE — DROP .CT2/.WAV');
  }
}

function selectAndInsertTape(tapeEntry, { silent = false } = {}) {
  if (!silent) {
    syncAudioUnlock();
    audio.playTapeClick();
  }
  if (activeBonusTape) {
    playingAsTkTape = false;
  ejectBonusApp(true);
  }
  selectedTapeId = tapeEntry.id;
  const bytes = new Uint8Array(tapeEntry.ct2);
  machine.tape.insertCt2(bytes, tapeEntry.loadName || tapeEntry.title);
  renderTapeRack();
  updateTapeUI();
}

let activeTapeFilter = 'all';
let activeFloppyFilter = 'all';
let autoLoadPostRunCmd = 'RUN\n';

async function launchTkTapeGame(tapeEntry) {
  syncAudioUnlock();
  audio.playTapeClick();
  if (!powerOn) {
    powerOn = true;
    updatePowerUI();
  }

  // 1) Fita .CT2 real por URL (roda na ROM real do TK 2000 via gravador K7)
  if (tapeEntry.kind === 'ct2-url' && tapeEntry.ct2Url) {
    try {
      const res = await fetch(tapeEntry.ct2Url);
      if (!res.ok) return;
      const bytes = new Uint8Array(await res.arrayBuffer());
      playingAsTkTape = false;
      activeBonusTape = null;
      activeFloppy = null;
      activeDskName = null;
      machine.disk2.eject();
      apple2.disk2.eject();
      activeMode = 'tk2000';
      syncPlatformVisuals('tk2000');
      syncActiveSpeakers();

      if (!machine.tape.insertCt2(bytes, tapeEntry.title)) return;
      selectedTapeId = tapeEntry.id;
      engineBadge.textContent = `TK 2000 • .CT2 ${tapeEntry.shortLabel}`;
      renderTapeRack();
      updateTapeUI();
      autoLoadAndRunCurrentTape(tapeEntry);
    } catch {
      // ignore fetch error
    }
    return;
  }

  // 2) Jogo nativo TK 2000 em imagem CompatBoot/TK-DOS (.dsk rodando direto na Tk2000Machine!)
  if (tapeEntry.kind === 'tk-dsk-tape' && tapeEntry.tkDskUrl) {
    try {
      const res = await fetch(tapeEntry.tkDskUrl);
      if (!res.ok) return;
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length !== 143360) return;

      playingAsTkTape = true;
      activeBonusTape = tapeEntry;
      selectedTapeId = tapeEntry.id;
      activeFloppy = null;
      activeDskName = tapeEntry.dskName || tapeEntry.title;
      activeMode = 'tk2000';
      machine.crtMode = CRT_MODES[crtModeIndex].id;
      syncPlatformVisuals('tk2000');
      syncActiveSpeakers();

      engineBadge.textContent = `TK 2000 • K7 ${tapeEntry.shortLabel}`;
      machine.bootDiskImage(bytes, activeDskName, apple2.disk2.bootRom);

      const matchedProfile = KNOWN_GAME_PROFILES.find((p) => p.match.test(activeDskName));
      const wantJoy = matchedProfile?.preferKeyboard ? false : /joystick|paddle/i.test(tapeEntry.controls || '');
      if (joystickMode !== wantJoy) {
        joystickMode = wantJoy;
        updateJoystickUI();
      }
      lastScanTime = 0;
      renderTapeRack();
      updateTapeUI();
    } catch {
      // ignore fetch error
    }
    return;
  }

  // 3) Clássico idêntico Apple II/TK 2000 (dsk-tape)
  if (!tapeEntry.dskUrl) return;

  try {
    const res = await fetch(tapeEntry.dskUrl);
    if (!res.ok) return;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length !== 143360) return;
    machine.disk2.eject();
    if (!apple2.disk2.insertDsk(bytes, tapeEntry.dskName || tapeEntry.title)) return;

    playingAsTkTape = true;
    activeBonusTape = tapeEntry;
    selectedTapeId = tapeEntry.id;
    activeFloppy = null;
    activeDskName = tapeEntry.dskName || tapeEntry.title;
    activeMode = 'apple2';
    apple2.crtMode = CRT_MODES[crtModeIndex].id;
    syncPlatformVisuals('tk2000');
    syncActiveSpeakers();

    engineBadge.textContent = `TK 2000 • K7 ${tapeEntry.shortLabel}`;
    apple2.hardReset();

    const matchedProfile = KNOWN_GAME_PROFILES.find((p) => p.match.test(activeDskName));
    const wantJoy = matchedProfile?.preferKeyboard ? false : true;
    if (joystickMode !== wantJoy) {
      joystickMode = wantJoy;
      updateJoystickUI();
    }
    lastScanTime = 0;
    renderTapeRack();
    updateTapeUI();
  } catch {
    // ignore fetch error
  }
}

function launchArcadeCassette(tapeEntry) {
  syncAudioUnlock();
  audio.playTapeClick();
  if (!powerOn) {
    powerOn = true;
    updatePowerUI();
  }
  ejectBonusApp(true);

  selectedTapeId = tapeEntry.id;
  activeBonusTape = tapeEntry;
  activeMode = 'arcade';
  syncActiveSpeakers();
  engineBadge.textContent = `K7 ARCADE • ${tapeEntry.shortLabel}`;

  bonusCrt.setPowered(true);
  bonusCrt.setMode(CRT_MODES[crtModeIndex].id);
  bonusKeysDown.clear();

  const Factory = GAME_FACTORIES[tapeEntry.gameId];
  activeBonusApp = new Factory(bonusCrt, audio, () => ejectBonusApp());
  activeBonusApp.start();

  renderTapeRack();
  renderFloppyRack();
  updateTapeUI();
}

function downloadCt2File(tapeEntry) {
  const bytes = new Uint8Array(tapeEntry.ct2);
  const blob = new Blob([bytes], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sanitizeTapeName(tapeEntry.loadName || tapeEntry.title)}.ct2`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function updateRackStatsBar(badgeId, labelId, switchId, shownCount, totalCount) {
  const badgeEl = document.getElementById(badgeId);
  const labelEl = document.getElementById(labelId);
  const switchEl = document.getElementById(switchId);
  const filtered = shownCount < totalCount;
  if (badgeEl) badgeEl.textContent = filtered ? `${shownCount} / ${totalCount}` : String(totalCount);
  if (labelEl) {
    labelEl.textContent = filtered
      ? tr('apps filtrados', 'filtered apps')
      : tr('apps disponíveis', 'apps available');
  }
  if (switchEl) switchEl.textContent = `${totalCount} apps`;
}

function renderTapeRack() {
  tapeRack.innerHTML = '';
  const searchEl = document.getElementById('tape-search-input');
  const query = (searchEl?.value || '').trim().toLowerCase();
  const allBuiltinAndUser = getAllTapes();

  const combined = [
    ...TK2000_CLASSIC_TAPES,
    ...allBuiltinAndUser.map((t) => ({ ...t, category: 'apps', badge: t.isUser ? 'REC' : 'BASIC' })),
  ];

  const filtered = combined.filter((item) => {
    if (activeTapeFilter !== 'all' && item.category !== activeTapeFilter) return false;
    if (!query) return true;
    const hay = `${item.title} ${item.shortLabel || ''} ${item.description || ''} ${item.descriptionEn || ''} ${item.badge || ''}`.toLowerCase();
    return hay.includes(query);
  });

  updateRackStatsBar('tape-count-badge', 'tape-stats-label', 'tk-switch-count', filtered.length, combined.length);

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'tape-empty-hint';
    empty.textContent = tr('Nenhuma fita encontrada para este filtro.', 'No tapes match this filter.');
    tapeRack.appendChild(empty);
    return;
  }

  for (const item of filtered) {
    const isClassicTape = !item.ct2 && !item.isUser;
    const isActive = isClassicTape
      ? (activeBonusTape?.id === item.id || selectedTapeId === item.id)
      : selectedTapeId === item.id;

    const row = document.createElement('div');
    row.className = 'tape-item' + (isActive ? ' active' : '');
    row.style.setProperty('--tape-color', item.color || '#eab308');
    const desc = currentLang === 'en' ? (item.descriptionEn || item.description) : item.description;
    row.title = desc || item.title;

    const tapeThumb = document.createElement('img');
    tapeThumb.className = 'tape-mini-icon';
    tapeThumb.src = 'assets/k7-mini.webp?v=2';
    tapeThumb.alt = '';
    tapeThumb.width = 30;
    tapeThumb.height = 19;
    tapeThumb.loading = 'lazy';
    row.appendChild(tapeThumb);

    const info = document.createElement('div');
    info.className = 'tape-item-info';
    const titleEl = document.createElement('strong');
    titleEl.innerHTML = `${item.title}${item.badge ? `<span class="media-item-badge">${item.badge}</span>` : ''}`;
    const subEl = document.createElement('small');
    subEl.textContent = item.isUser
      ? `Minha gravação • LOAD T "${item.loadName}"`
      : desc;
    info.appendChild(titleEl);
    info.appendChild(subEl);
    row.appendChild(info);

    if (item.isUser || item.ct2) {
      const actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.gap = '3px';

      const dlBtn = document.createElement('button');
      dlBtn.className = 'tape-dl-btn';
      dlBtn.type = 'button';
      dlBtn.textContent = '⬇';
      dlBtn.title = 'Baixar arquivo .CT2';
      dlBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        downloadCt2File(item);
      });
      actions.appendChild(dlBtn);

      if (item.isUser) {
        const delBtn = document.createElement('button');
        delBtn.className = 'tape-dl-btn';
        delBtn.type = 'button';
        delBtn.textContent = '✕';
        delBtn.title = 'Remover gravação salva';
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          userTapes = userTapes.filter((t) => t.id !== item.id);
          persistUserTapes();
          if (selectedTapeId === item.id) {
            selectedTapeId = null;
            machine.tape.eject();
          }
          renderTapeRack();
          updateTapeUI();
        });
        actions.appendChild(delBtn);
      }
      row.appendChild(actions);
    }

    row.addEventListener('click', () => {
      if (isClassicTape) {
        if (activeBonusTape?.id === item.id) {
          ejectBonusApp();
        } else {
          launchTkTapeGame(item);
        }
      } else {
        selectAndInsertTape(item);
        autoLoadAndRunCurrentTape(item);
      }
    });
    tapeRack.appendChild(row);
  }
}

// Carregamento de arquivos externos (.CT2 / .WAV)
async function handleExternalTapeFile(file) {
  if (!file) return;
  syncAudioUnlock();
  audio.playTapeClick();

  const buf = await file.arrayBuffer();
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const baseName = file.name.replace(/\.[^.]+$/, '');

  let ok = false;
  if (ext === 'wav') {
    ok = machine.tape.insertWav(buf, baseName);
  } else {
    ok = machine.tape.insertCt2(new Uint8Array(buf), baseName);
  }

  if (!ok) {
    alert('Não foi possível ler este arquivo como fita K7 do TK 2000 (.CT2 ou .WAV PCM).');
    return;
  }

  selectedTapeId = null;
  renderTapeRack();
  updateTapeUI();
}

function autoLoadAndRunCurrentTape(customMeta = null) {
  syncAudioUnlock();
  if (!powerOn) {
    powerOn = true;
    updatePowerUI();
  }
  if (activeMode === 'arcade') {
    ejectBonusApp(true);
  }
  if (activeBonusTape && activeBonusTape.kind !== 'ct2-url') {
    launchTkTapeGame(activeBonusTape);
    return;
  }
  if (!machine.tape.hasTape()) {
    const first = BUILTIN_CT2_TAPES[0];
    if (first) selectAndInsertTape(first, { silent: true });
  }
  if (!machine.tape.hasTape()) return;

  machine.disk2.eject();
  machine.tape.rewind();
  audio.playTapeClick();

  const meta =
    customMeta ||
    TK2000_CLASSIC_TAPES.find((t) => t.id === selectedTapeId) ||
    getAllTapes().find((t) => t.id === selectedTapeId);
  if (meta?.loadCmd) {
    autoLoadPendingCmd = meta.loadCmd;
    autoLoadPostRunCmd = meta.postRunCmd !== undefined ? meta.postRunCmd : '';
  } else {
    const cmdName = meta?.loadName ? ` "${meta.loadName}"` : '';
    autoLoadPendingCmd = `LOAD T${cmdName}\n`;
    autoLoadPostRunCmd = 'RUN\n';
  }

  const atIdlePrompt = machine.cpu.pc >= 0xf050 && machine.cpu.pc <= 0xf080;
  if (atIdlePrompt) {
    autoLoadPhase = 'typing_load';
    enqueueAutoType(autoLoadPendingCmd, () => {
      machine.tape.play();
      autoLoadPhase = 'playing_tape';
      updateTapeUI();
    });
  } else {
    machine.softReset();
    autoLoadPhase = 'warm_wait';
    autoLoadWait = 48;
  }
  updateTapeUI();
}

function stepAutoLoadWorkflow() {
  if (autoLoadPhase === 'warm_wait') {
    autoLoadWait--;
    if (autoLoadWait <= 0) {
      autoLoadPhase = 'typing_load';
      enqueueAutoType(autoLoadPendingCmd, () => {
        machine.tape.play();
        autoLoadPhase = 'playing_tape';
        updateTapeUI();
      });
    }
  } else if (autoLoadPhase === 'playing_tape') {
    if (!machine.tape.playing) {
      autoLoadPhase = 'post_tape_wait';
      autoLoadWait = 16;
    }
  } else if (autoLoadPhase === 'post_tape_wait') {
    autoLoadWait--;
    if (autoLoadWait <= 0) {
      autoLoadPhase = 'idle';
      if (autoLoadPostRunCmd) {
        enqueueAutoType(autoLoadPostRunCmd);
      }
    }
  }
}

function enqueueAutoType(text, onDone = null) {
  autoTypeQueue.length = 0;
  autoTypeCurrent = null;
  autoTypeTimer = 0;
  onAutoTypeComplete = onDone;
  for (const ch of text) {
    autoTypeQueue.push(ch);
  }
}

function stepAutoType() {
  if (!powerOn || activeMode !== 'tk2000') return;

  if (autoTypeCurrent) {
    autoTypeTimer--;
    if (autoTypeTimer === 3) {
      machine.keyboard.setKeyState(autoTypeCurrent.code, autoTypeCurrent.key, false, false, false);
    } else if (autoTypeTimer <= 0) {
      autoTypeCurrent = null;
      if (autoTypeQueue.length === 0 && onAutoTypeComplete) {
        const cb = onAutoTypeComplete;
        onAutoTypeComplete = null;
        cb();
      }
    }
    return;
  }

  if (autoTypeQueue.length === 0) return;

  const ch = autoTypeQueue.shift();
  let code = `Auto_${ch}`;
  let key = ch;
  if (ch === '\n') {
    code = 'Enter';
    key = 'Enter';
  } else if (ch === ' ') {
    code = 'Space';
    key = ' ';
  } else if (ch >= 'A' && ch <= 'Z') {
    code = `Key${ch}`;
  } else if (ch >= '0' && ch <= '9') {
    code = `Digit${ch}`;
  }

  autoTypeCurrent = { code, key };
  autoTypeTimer = ch === '\n' ? 14 : 6;
  machine.keyboard.setKeyState(code, key, true, false, false);
}

// Drive 5¼" (Apple II+ .DSK)
function renderFloppyRack() {
  floppyRack.innerHTML = '';
  const searchEl = document.getElementById('floppy-search-input');
  const query = (searchEl?.value || '').trim().toLowerCase();

  const filtered = FLOPPY_DISKS.filter((disk) => {
    if (activeFloppyFilter !== 'all' && disk.category !== activeFloppyFilter) return false;
    if (!query) return true;
    const hay = `${disk.title} ${disk.shortLabel || ''} ${disk.description || ''} ${disk.descriptionEn || ''}`.toLowerCase();
    return hay.includes(query);
  });

  updateRackStatsBar('floppy-count-badge', 'floppy-stats-label', 'a2-switch-count', filtered.length, FLOPPY_DISKS.length);

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'tape-empty-hint';
    empty.textContent = tr('Nenhum disquete encontrado para este filtro.', 'No diskettes match this filter.');
    floppyRack.appendChild(empty);
    return;
  }

  for (const disk of filtered) {
    const desc = currentLang === 'en' ? (disk.descriptionEn || disk.description) : disk.description;
    const btn = document.createElement('button');
    btn.className = 'floppy-item' + (activeFloppy?.id === disk.id ? ' active' : '');
    btn.style.setProperty('--disk-color', disk.color);
    btn.title = desc;

    btn.innerHTML = `
      <span class="floppy-icon"></span>
      <span class="floppy-meta">
        <strong>${disk.shortLabel}<span class="media-item-badge">${disk.year || '.DSK'}</span></strong>
        <small>${desc}</small>
      </span>
    `;
    btn.addEventListener('click', () => {
      if (activeFloppy?.id === disk.id) {
        ejectFloppy();
      } else {
        insertFloppy(disk);
      }
    });
    floppyRack.appendChild(btn);
  }
}

async function insertFloppy(disk) {
  syncAudioUnlock();
  if (!powerOn) {
    powerOn = true;
    updatePowerUI();
  }

  if (disk.kind === 'dsk-url' && disk.dskUrl) {
    try {
      const res = await fetch(disk.dskUrl);
      if (res.ok) {
        const buf = await res.arrayBuffer();
        mountDskBuffer(new Uint8Array(buf), disk.dskName || disk.shortLabel, disk);
      }
    } catch {
      driveStatusText.textContent = 'ERRO AO CARREGAR IMAGEM .DSK';
    }
    return;
  }

  ejectFloppy(true);

  activeFloppy = disk;
  activeMode = 'arcade';
  syncActiveSpeakers();
  engineBadge.textContent = `DISK II • ${disk.shortLabel}`;
  insertedDiskEdge.classList.add('visible');
  insertedDiskEdge.style.borderTopColor = disk.color;
  driveLatch.classList.remove('open');
  driveLatch.classList.add('closed');
  driveLed.classList.add('active');
  driveStatusText.textContent = `${disk.shortLabel} — ESC PARA VOLTAR À ROM`;

  audio.playFloppyLatch(true);
  audio.playFloppySeek(460);

  setTimeout(() => {
    driveLed.classList.remove('active');
  }, 600);

  bonusCrt.setPowered(true);
  bonusCrt.setMode(CRT_MODES[crtModeIndex].id);
  bonusKeysDown.clear();

  if (disk.kind === 'game') {
    const Factory = GAME_FACTORIES[disk.gameId];
    activeBonusApp = new Factory(bonusCrt, audio, () => ejectFloppy());
    activeBonusApp.start();
  } else {
    activeBonusApp = new TkBasicShell(bonusCrt, audio, {
      getInsertedMedia: () => activeFloppy,
      onLaunchGame: (id) => {
        const match = FLOPPY_DISKS.find((d) => d.gameId === id);
        if (match) insertFloppy(match);
      },
      onLoadMediaByName: (name) => {
        const q = String(name || '').trim().toUpperCase();
        const match = FLOPPY_DISKS.find(
          (d) =>
            d.shortLabel.toUpperCase().includes(q) ||
            d.title.toUpperCase().includes(q) ||
            (d.gameId && d.gameId.toUpperCase() === q)
        );
        if (match) {
          insertFloppy(match);
          return true;
        }
        return false;
      },
    });
    activeBonusApp.boot();
    if (disk.defaultListing) {
      activeBonusApp.loadListing(disk.defaultListing);
    }
    activeBonusApp.render();
  }

  renderFloppyRack();
}

function uint8ToBase64(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function base64ToUint8(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function loadSavedApple2Rom() {
  try {
    const raw = localStorage.getItem(STORAGE_A2_ROM_KEY);
    if (!raw) return;
    const bytes = base64ToUint8(raw);
    if (apple2.setUserRom(bytes)) {
      if (a2RomStatus) {
        a2RomStatus.textContent = `ROM Apple II+ carregada (${Math.round(bytes.length / 1024)}K)`;
      }
    }
  } catch {
    // ignore corrupted storage
  }
}

async function handleApple2RomFile(file) {
  if (!file) return;
  syncAudioUnlock();
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  if (!apple2.setUserRom(bytes)) {
    if (a2RomStatus) {
      a2RomStatus.textContent = 'ROM inválida (use 12K/16K/32K .ROM/.BIN)';
    }
    return;
  }
  try {
    localStorage.setItem(STORAGE_A2_ROM_KEY, uint8ToBase64(bytes));
  } catch {
    // localStorage quota exceeded — keep in memory
  }
  if (a2RomStatus) {
    a2RomStatus.textContent = `ROM: ${file.name} (${Math.round(bytes.length / 1024)}K)`;
  }
  audio.playKeyClick();
  if (activeMode === 'apple2') {
    apple2.hardReset();
  }
}

function mountDskBuffer(bytes, fileName, rackDisk = null) {
  if (bytes.length !== 143360) {
    driveStatusText.textContent = `FORMATO INVÁLIDO (${bytes.length}B — USE .DSK 140KB)`;
    audio.playFloppyLatch(false);
    return false;
  }

  ejectBonusApp(true);

  if (!apple2.disk2.insertDsk(bytes, fileName)) {
    driveStatusText.textContent = 'FALHA AO MONTAR .DSK NO DISK II';
    return false;
  }

  activeFloppy = rackDisk;
  activeDskName = fileName;
  activeMode = 'apple2';
  apple2.crtMode = CRT_MODES[crtModeIndex].id;
  syncPlatformVisuals('apple2');
  syncActiveSpeakers();

  const shortName = fileName.replace(/\.(dsk|do|po)$/i, '').toUpperCase().slice(0, 18);
  engineBadge.textContent = `APPLE II+ • ${shortName}`;
  insertedDiskEdge.classList.add('visible');
  insertedDiskEdge.style.borderTopColor = rackDisk?.color || '#3b82f6';
  driveLatch.classList.remove('open');
  driveLatch.classList.add('closed');
  driveLed.classList.add('active');
  driveStatusText.textContent = `${shortName} — SHIFT+ESC EJETA`;

  audio.playFloppyLatch(true);
  audio.playFloppySeek(460);
  apple2.hardReset();
  const matchedProfile = KNOWN_GAME_PROFILES.find((p) => p.match.test(fileName));
  const wantJoy = matchedProfile?.preferKeyboard ? false : true;
  if (joystickMode !== wantJoy) {
    joystickMode = wantJoy;
    updateJoystickUI();
  }
  lastScanTime = 0;
  renderFloppyRack();
  return true;
}

async function insertDskFile(file) {
  if (!file) return;
  syncAudioUnlock();
  if (!powerOn) {
    powerOn = true;
    updatePowerUI();
  }
  const buf = await file.arrayBuffer();
  mountDskBuffer(new Uint8Array(buf), file.name, null);
}

function ejectBonusApp(silent = false, { keepPlatform = true } = {}) {
  if (activeBonusApp) {
    activeBonusApp.stopProgram?.();
    activeBonusApp.destroy?.();
    activeBonusApp = null;
  }
  bonusKeysDown.clear();
  const wasApple2 = !playingAsTkTape && document.body.classList.contains('machine-apple2') && keepPlatform;
  const wasTkDskTape = Boolean(activeBonusTape?.mode === 'tk-dsk-tape');
  playingAsTkTape = false;
  const hadMedia = Boolean(activeFloppy || activeBonusTape || activeDskName);
  const hadFloppy = Boolean(activeFloppy || activeDskName);
  activeFloppy = null;
  activeBonusTape = null;
  activeDskName = null;
  apple2.disk2.eject();
  machine.disk2.eject();

  if (wasApple2) {
    activeMode = 'apple2';
    apple2.hardReset();
    if (joystickMode) {
      joystickMode = false;
      updateJoystickUI();
    }
    engineBadge.textContent = 'APPLE II+ • 6502';
    driveStatusText.textContent = 'DRIVE VAZIO — CLIQUE EM UM DISCO';
  } else {
    activeMode = 'tk2000';
    if (wasTkDskTape) {
      machine.hardReset();
    }
    syncPlatformVisuals('tk2000');
    engineBadge.textContent = 'CPU 6502 • ROM REAL 16K';
    driveStatusText.textContent = 'DRIVE VAZIO (ROM REAL ATIVA)';
  }
  syncActiveSpeakers();
  insertedDiskEdge.classList.remove('visible');
  driveLatch.classList.remove('closed');
  driveLatch.classList.add('open');
  driveLed.classList.remove('active');

  if (hadMedia && !silent) {
    if (hadFloppy) audio.playFloppyLatch(false);
    else audio.playTapeClick();
  }
  renderFloppyRack();
  renderTapeRack();
  updateTapeUI();
}

function ejectFloppy(silent = false) {
  ejectBonusApp(silent);
}

// Construção do teclado interativo do TK 2000
function clearStickyModifiers() {
  if (stickyShift) {
    stickyShift = false;
    keyElementsByCode.get('ShiftLeft')?.classList.remove('active');
  }
  if (stickyCtrl) {
    stickyCtrl = false;
    keyElementsByCode.get('ControlLeft')?.classList.remove('active');
  }
}

const JOYSTICK_MAPPED_CODES = new Set([
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'AltLeft', 'AltRight',
]);

function handleJoystickKey(code, isDown) {
  if (!joystickMode || !JOYSTICK_MAPPED_CODES.has(code)) return false;
  if (isDown) joyKeysDown.add(code);
  else joyKeysDown.delete(code);
  updateJoystickAxes();
  // Espaço aciona o Botão 0 ($C061) e também segue para o teclado ($C000)
  // para funcionar em menus "PRESS <SPACE> TO START" mesmo com Joystick ativo.
  return code !== 'Space';
}

function resolveApple2Key(code, key) {
  if (activeMode === 'apple2' && !joystickMode && activeDskName) {
    const profile = KNOWN_GAME_PROFILES.find((p) => p.match.test(activeDskName));
    const mapped = profile?.arrowRemap?.[code];
    if (mapped) return { code: mapped[0], key: mapped[1] };
  }
  return { code, key };
}

function setEmulatedTouchKey(code, key, isDown, opts = {}) {
  const { sub = '' } = opts;
  keyElementsByCode.get(code)?.classList.toggle('active', isDown);

  if (isDown) {
    syncAudioUnlock();
    audio.playKeyClick();
    if (activeMode === 'arcade') {
      if (activeBonusApp instanceof TkBasicShell) {
        activeBonusApp.handleKeyDown(code, key, stickyCtrl);
        if (key.length === 1 && !stickyCtrl) {
          activeBonusApp.handleChar(stickyShift && sub ? sub : key);
        }
        clearStickyModifiers();
      } else {
        bonusKeysDown.add(code);
        activeBonusApp?.onKeyDown?.(code);
      }
      return;
    }
    if (!powerOn) return;
    if (handleJoystickKey(code, true)) return;
    if (activeMode === 'apple2') {
      const keyChar = stickyShift && sub ? sub : key;
      const mapped = resolveApple2Key(code, keyChar);
      apple2.setKeyState(mapped.code, mapped.key, true, stickyCtrl);
      clearStickyModifiers();
    } else {
      machine.keyboard.setKeyState(code, key, true, stickyShift, stickyCtrl);
    }
    return;
  }

  if (activeMode === 'arcade') {
    bonusKeysDown.delete(code);
    return;
  }
  if (handleJoystickKey(code, false)) return;
  if (activeMode === 'apple2') {
    const mapped = resolveApple2Key(code, key);
    apple2.setKeyState(mapped.code, mapped.key, false, false);
    clearStickyModifiers();
  } else if (activeMode === 'tk2000') {
    machine.keyboard.setKeyState(code, key, false, false, false);
    clearStickyModifiers();
    machine.keyboard.shift = false;
    machine.keyboard.ctrl = false;
  }
}

function bindHoldPointerKey(btn, code, key, sub = '') {
  const activePointers = new Set();
  const press = (e) => {
    e.preventDefault();
    if (typeof btn.setPointerCapture === 'function' && e.pointerId !== undefined) {
      try { btn.setPointerCapture(e.pointerId); } catch {}
    }
    const wasEmpty = activePointers.size === 0;
    activePointers.add(e.pointerId ?? 'mouse');
    btn.classList.add('active');
    if (wasEmpty) setEmulatedTouchKey(code, key, true, { sub });
  };
  const release = (e) => {
    const pid = e.pointerId ?? 'mouse';
    if (!activePointers.has(pid) && activePointers.size === 0) return;
    activePointers.delete(pid);
    if (activePointers.size > 0) return;
    btn.classList.remove('active');
    setEmulatedTouchKey(code, key, false, { sub });
  };
  btn.addEventListener('pointerdown', press);
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointercancel', release);
  btn.addEventListener('lostpointercapture', release);
}

function buildKeyboard() {
  tkKeyboardEl.innerHTML = '';
  for (const row of TK_KEYBOARD_ROWS) {
    const rowEl = document.createElement('div');
    rowEl.className = 'kb-row';

    for (const item of row) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tk-key' + (item.cls ? ` ${item.cls}` : '');
      btn.dataset.code = item.code;

      if (item.sub) {
        btn.innerHTML = `<span class="sub-legend">${item.sub}</span><span>${item.label}</span>`;
      } else {
        btn.textContent = item.label;
      }

      keyElementsByCode.set(item.code, btn);

      if (item.mod === 'shift') {
        btn.addEventListener('click', () => {
          syncAudioUnlock();
          audio.playKeyClick();
          stickyShift = !stickyShift;
          btn.classList.toggle('active', stickyShift);
          machine.keyboard.shift = stickyShift;
        });
      } else if (item.mod === 'ctrl') {
        btn.addEventListener('click', () => {
          syncAudioUnlock();
          audio.playKeyClick();
          stickyCtrl = !stickyCtrl;
          btn.classList.toggle('active', stickyCtrl);
          machine.keyboard.ctrl = stickyCtrl;
        });
      } else {
        bindHoldPointerKey(btn, item.code, item.key, item.sub || '');
      }

      rowEl.appendChild(btn);
    }
    tkKeyboardEl.appendChild(rowEl);
  }
}

function initMobileTouchControls() {
  document.querySelectorAll('#mobile-touch-controls .touch-pad-btn').forEach((btn) => {
    const code = btn.dataset.code;
    const key = btn.dataset.key || code;
    if (code) bindHoldPointerKey(btn, code, key);
  });
  document.getElementById('btn-mobile-joy')?.addEventListener('click', () => {
    joystickMode = !joystickMode;
    updateJoystickUI();
  });
}
initMobileTouchControls();

// Eventos do teclado real do PC

window.addEventListener('keydown', (e) => {
  if (!manualModal.classList.contains('hidden')) {
    if (e.key === 'Escape') manualModal.classList.add('hidden');
    return;
  }
  if (!basicManualModal.classList.contains('hidden')) {
    if (e.key === 'Escape') basicManualModal.classList.add('hidden');
    return;
  }
  if (a2ManualModal && !a2ManualModal.classList.contains('hidden')) {
    if (e.key === 'Escape') a2ManualModal.classList.add('hidden');
    return;
  }
  if (a2BasicManualModal && !a2BasicManualModal.classList.contains('hidden')) {
    if (e.key === 'Escape') a2BasicManualModal.classList.add('hidden');
    return;
  }
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
    return;
  }

  syncAudioUnlock();

  if (activeMode === 'arcade') {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
    if (e.key === 'Escape') {
      ejectFloppy();
      return;
    }
    keyElementsByCode.get(e.code)?.classList.add('active');
    bonusKeysDown.add(e.code);
    if (activeBonusApp instanceof TkBasicShell) {
      activeBonusApp.handleKeyDown(e.code, e.key, e.ctrlKey);
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        activeBonusApp.handleChar(e.key);
      }
    } else if (!e.repeat) {
      activeBonusApp?.onKeyDown?.(e.code);
    }
    return;
  }

  if (activeMode === 'apple2') {
    if (!powerOn) return;
    if (e.key === 'Escape' && e.shiftKey) {
      e.preventDefault();
      ejectFloppy();
      return;
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Backspace', 'Slash', 'Quote', 'Tab', 'Escape'].includes(e.code)) {
      e.preventDefault();
    }
    if (handleJoystickKey(e.code, true)) return;
    if (!e.repeat) audio.playKeyClick();
    keyElementsByCode.get(e.code)?.classList.add('active');
    const mapped = resolveApple2Key(e.code, e.key);
    apple2.setKeyState(mapped.code, mapped.key, true, e.ctrlKey);
    if (!e.ctrlKey && !e.metaKey && (activeDskName || '').toLowerCase().includes('karateka')) {
      if (e.code === 'KeyK' && joystickMode) {
        joystickMode = false;
        updateJoystickUI();
      } else if (e.code === 'KeyJ' && !joystickMode) {
        joystickMode = true;
        updateJoystickUI();
      }
    }
    return;
  }

  if (!powerOn) return;

  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Backspace', 'Slash', 'Quote'].includes(e.code)) {
    e.preventDefault();
  }

  if (handleJoystickKey(e.code, true)) return;

  if (!e.repeat) {
    audio.playKeyClick();
  }

  keyElementsByCode.get(e.code)?.classList.add('active');
  machine.keyboard.setKeyState(e.code, e.key, true, e.shiftKey, e.ctrlKey);
});

window.addEventListener('keyup', (e) => {
  keyElementsByCode.get(e.code)?.classList.remove('active');

  if (activeMode === 'arcade') {
    bonusKeysDown.delete(e.code);
    return;
  }

  if (activeMode === 'apple2') {
    if (handleJoystickKey(e.code, false)) return;
    const mapped = resolveApple2Key(e.code, e.key);
    apple2.setKeyState(mapped.code, mapped.key, false, e.ctrlKey);
    return;
  }

  if (handleJoystickKey(e.code, false)) return;

  machine.keyboard.setKeyState(e.code, e.key, false, e.shiftKey, e.ctrlKey);
});

window.addEventListener('blur', () => {
  for (const el of keyElementsByCode.values()) el.classList.remove('active');
  joyKeysDown.clear();
  bonusKeysDown.clear();
  updateJoystickAxes();
  machine.keyboard.reset();
});

// Controles da barra superior e periféricos
btnLamp.addEventListener('click', () => {
  lampOn = !lampOn;
  updateLampUI();
});
deskLamp.addEventListener('click', () => {
  lampOn = !lampOn;
  updateLampUI();
});

btnTurbo.addEventListener('click', () => {
  turboTape = !turboTape;
  btnTurbo.classList.toggle('active', turboTape);
  turboState.textContent = turboTape ? 'ON' : 'OFF';
});

btnScanlines.addEventListener('click', () => {
  scanlinesOn = !scanlinesOn;
  btnScanlines.classList.toggle('active', scanlinesOn);
  scanlinesState.textContent = scanlinesOn ? 'ON' : 'OFF';
  crtScanlines.classList.toggle('hidden', !scanlinesOn);
});

function cycleCrtMode() {
  crtModeIndex = (crtModeIndex + 1) % CRT_MODES.length;
  updateCrtModeUI();
}
btnCrtMode.addEventListener('click', cycleCrtMode);
btnMonitorMode.addEventListener('click', cycleCrtMode);

btnMute.addEventListener('click', () => {
  muted = !muted;
  updateMuteUI();
});

btnPower.addEventListener('click', () => {
  syncAudioUnlock();
  powerOn = !powerOn;
  if (powerOn) {
    audio.playPowerOn();
    if (activeMode === 'apple2') {
      apple2.hardReset();
    } else {
      machine.hardReset();
    }
  } else {
    audio.playPowerOff();
    ejectFloppy(true);
    machine.tape.stop();
    updateTapeUI();
  }
  updatePowerUI();
});

btnReset.addEventListener('click', (e) => {
  if (!powerOn) return;
  syncAudioUnlock();
  audio.playKeyClick();
  if (activeMode === 'arcade') {
    ejectFloppy();
    return;
  }
  if (activeMode === 'apple2') {
    if (e.shiftKey) apple2.hardReset();
    else apple2.softReset();
    return;
  }
  if (e.shiftKey) {
    machine.hardReset();
  } else {
    machine.softReset();
  }
});

btnJoystickMode.addEventListener('click', () => {
  joystickMode = !joystickMode;
  updateJoystickUI();
});

// Botões do Gravador K7
btnTapePlay.addEventListener('click', () => {
  syncAudioUnlock();
  if (activeBonusTape) return;
  if (!machine.tape.hasTape()) {
    const first = getAllTapes()[0];
    if (first) selectAndInsertTape(first);
  }
  if (!machine.tape.hasTape()) {
    audio.playTapeClick();
    return;
  }

  // Se a CPU está ociosa no prompt ']', ▶ PLAY carrega e roda automaticamente
  const atIdlePrompt =
    activeMode === 'tk2000' &&
    machine.cpu.pc >= 0xf050 &&
    machine.cpu.pc <= 0xf080 &&
    autoLoadPhase === 'idle';
  if (atIdlePrompt) {
    autoLoadAndRunCurrentTape();
    return;
  }

  audio.playTapeClick();
  if (machine.tape.getProgress() >= 0.999) {
    machine.tape.rewind();
  }
  machine.tape.play();
  updateTapeUI();
});

btnTapeRec.addEventListener('click', () => {
  syncAudioUnlock();
  audio.playTapeClick();
  const suggested = `PROG${userTapes.length + 1}`;
  const rawName = prompt(
    'Nome da fita para gravar com SAVE T "NOME" (até 12 caracteres, sem espaços):',
    suggested
  );
  if (rawName === null) return;
  const cleanName = sanitizeTapeName(rawName);
  machine.tape.startRecording(cleanName);
  updateTapeUI();
});

btnTapeRew.addEventListener('click', () => {
  syncAudioUnlock();
  audio.playTapeClick();
  machine.tape.rewind();
  updateTapeUI();
});

btnTapeStop.addEventListener('click', () => {
  syncAudioUnlock();
  autoLoadPhase = 'idle';
  autoTypeQueue.length = 0;
  onAutoTypeComplete = null;

  if (activeBonusTape) {
    ejectBonusApp();
    return;
  }

  audio.playTapeClick();
  const wasPlaying = machine.tape.playing;
  const wasRecording = machine.tape.recording;
  const recorded = machine.tape.stop();

  if (recorded && recorded.ct2Bytes && recorded.ct2Bytes.length > 0) {
    const entry = {
      id: `user-${Date.now()}`,
      title: recorded.name,
      shortLabel: recorded.name,
      loadName: recorded.name,
      color: '#ef4444',
      description: 'Programa BASIC gravado no navegador',
      ct2: Array.from(recorded.ct2Bytes),
      isUser: true,
    };
    userTapes.unshift(entry);
    persistUserTapes();
    selectedTapeId = entry.id;
    machine.tape.insertCt2(recorded.ct2Bytes, recorded.name);
    renderTapeRack();
  } else if (!wasPlaying && !wasRecording && machine.tape.hasTape()) {
    machine.tape.eject();
    selectedTapeId = null;
    renderTapeRack();
  }
  updateTapeUI();
});

btnAutoloadTape.addEventListener('click', () => {
  autoLoadAndRunCurrentTape();
});

tapeFileInput.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) handleExternalTapeFile(file);
  tapeFileInput.value = '';
});

dskFileInput?.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) insertDskFile(file);
  dskFileInput.value = '';
});

a2RomFileInput?.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) handleApple2RomFile(file);
  a2RomFileInput.value = '';
});

// Arrastar e soltar .CT2 / .WAV / .DSK / .ROM em qualquer ponto da mesa
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  cassetteDeck.style.outline = '2px dashed #fbbf24';
});

dropZone.addEventListener('dragleave', () => {
  cassetteDeck.style.outline = 'none';
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  cassetteDeck.style.outline = 'none';
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (['dsk', 'do', 'po'].includes(ext)) {
    insertDskFile(file);
  } else if (['rom', 'bin'].includes(ext)) {
    handleApple2RomFile(file);
  } else {
    handleExternalTapeFile(file);
  }
});

// Drive latch ejeta disquete bônus ou .DSK
driveLatch.addEventListener('click', () => {
  if (activeFloppy || activeDskName) ejectFloppy();
});

// Manual modal
function openManual() {
  if (document.body.classList.contains('machine-apple2') && a2ManualModal) {
    a2ManualModal.classList.remove('hidden');
  } else {
    manualModal.classList.remove('hidden');
  }
}
btnManual.addEventListener('click', openManual);
deskManual.addEventListener('click', openManual);
btnCloseManual.addEventListener('click', () => manualModal.classList.add('hidden'));
manualModal.addEventListener('click', (e) => {
  if (e.target === manualModal) manualModal.classList.add('hidden');
});

// Manual do BASIC TK 2000 modal + filtro de comandos
function openBasicManual() {
  basicManualModal.classList.remove('hidden');
  basicSearchInput.focus();
}
deskBasicManual.addEventListener('click', openBasicManual);
btnCloseBasicManual.addEventListener('click', () => basicManualModal.classList.add('hidden'));
basicManualModal.addEventListener('click', (e) => {
  if (e.target === basicManualModal) basicManualModal.classList.add('hidden');
});

basicSearchInput.addEventListener('input', () => {
  const q = basicSearchInput.value.trim().toLowerCase();
  const sections = basicManualContent.querySelectorAll('.basic-sec');
  for (const sec of sections) {
    let anyVisible = false;
    const items = sec.querySelectorAll('li');
    for (const li of items) {
      const match = !q || li.textContent.toLowerCase().includes(q);
      li.classList.toggle('hidden', !match);
      if (match) anyVisible = true;
    }
    sec.classList.toggle('hidden', !anyVisible);
  }
});

// Loop principal de emulação (60 FPS)
let lastTime = performance.now();
let tapeUiCounter = 0;

function mainLoop(now) {
  updateKeysHelp();
  const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
  lastTime = now;

  if (powerOn && activeMode === 'tk2000') {
    const wasPlaying = machine.tape.playing;
    stepAutoLoadWorkflow();
    stepAutoType();
    machine.runFrame(dt, turboTape);
    machine.renderToImageData(emuImageData);
    ctx.putImageData(emuImageData, 0, 0);

    tapeUiCounter++;
    if (tapeUiCounter % 6 === 0 || wasPlaying !== machine.tape.playing) {
      updateTapeUI();
    }
  } else if (powerOn && activeMode === 'apple2') {
    apple2.runFrame(dt, turboTape);
    driveLed.classList.toggle('active', apple2.disk2.motorOn);
    apple2.renderToImageData(emuImageData);
    ctx.putImageData(emuImageData, 0, 0);
  } else if (powerOn && activeMode === 'arcade' && activeBonusApp) {
    activeBonusApp.update?.(dt, bonusKeysDown);
    activeBonusApp.render?.();
  }

  requestAnimationFrame(mainLoop);
}

// Inicialização
loadSavedApple2Rom();
if (!apple2.userRom) {
  fetch('roms/apple2plus.rom')
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .then((buf) => {
      if (buf && apple2.setUserRom(new Uint8Array(buf)) && a2RomStatus) {
        a2RomStatus.textContent = `ROM Apple II+ carregada (${Math.round(buf.byteLength / 1024)}K)`;
      }
    })
    .catch(() => {});
}
fetch('roms/disk2-16boot.rom')
  .then((r) => (r.ok ? r.arrayBuffer() : null))
  .then((buf) => {
    if (buf && buf.byteLength === 256) {
      apple2.disk2.bootRom = new Uint8Array(buf);
      machine.disk2.bootRom = new Uint8Array(buf);
    }
  })
  .catch(() => {});

// Filtros laterais de fitas K7 e disquetes 5¼"
const tapeSearchInputEl = document.getElementById('tape-search-input');
const tapeFilterPillsEl = document.getElementById('tape-filter-pills');
const floppySearchInputEl = document.getElementById('floppy-search-input');
const floppyFilterPillsEl = document.getElementById('floppy-filter-pills');

tapeSearchInputEl?.addEventListener('input', () => {
  renderTapeRack();
});

tapeFilterPillsEl?.addEventListener('click', (e) => {
  const pill = e.target.closest('.rack-pill');
  if (!pill) return;
  activeTapeFilter = pill.dataset.cat || 'all';
  tapeFilterPillsEl.querySelectorAll('.rack-pill').forEach((p) => p.classList.toggle('active', p === pill));
  renderTapeRack();
});

floppySearchInputEl?.addEventListener('input', () => {
  renderFloppyRack();
});

floppyFilterPillsEl?.addEventListener('click', (e) => {
  const pill = e.target.closest('.rack-pill');
  if (!pill) return;
  activeFloppyFilter = pill.dataset.cat || 'all';
  floppyFilterPillsEl.querySelectorAll('.rack-pill').forEach((p) => p.classList.toggle('active', p === pill));
  renderFloppyRack();
});

// Modal da Gaveta de Fitas K7 / Caixa de Disquetes 5¼"
const catalogModal = document.getElementById('catalog-modal');
const catalogModalTitle = document.getElementById('catalog-modal-title');
const catalogModalCount = document.getElementById('catalog-modal-count');
const catalogZipLink = document.getElementById('catalog-zip-link');
const catalogSearchInput = document.getElementById('catalog-search-input');
const catalogCategoryTabs = document.getElementById('catalog-category-tabs');
const catalogGrid = document.getElementById('catalog-grid');
const btnCatalog = document.getElementById('btn-catalog');
const btnOpenTapeCatalog = document.getElementById('btn-open-tape-catalog');
const btnOpenFloppyCatalog = document.getElementById('btn-open-floppy-catalog');
const btnCloseCatalog = document.getElementById('btn-close-catalog');

let catalogPlatform = 'tk2000';
let catalogCategory = 'all';
let catalogSearchQuery = '';

function getCatalogItemsForPlatform(platform) {
  if (platform === 'apple2') {
    return FLOPPY_DISKS.map((disk) => ({
      id: disk.id,
      title: disk.title,
      description: currentLang === 'en' && disk.descriptionEn ? disk.descriptionEn : (disk.description || ''),
      badge: disk.year || disk.badge || '.DSK',
      color: disk.color || '#f59e0b',
      category: disk.category || 'classic',
      controls: disk.controls || '',
      kind: 'floppy',
      raw: disk,
      isActive: activeFloppy?.id === disk.id,
    }));
  }

  const bonusTapes = TK2000_CLASSIC_TAPES.map((b) => ({
    id: b.id,
    title: b.title,
    description: currentLang === 'en' && b.descriptionEn ? b.descriptionEn : (b.description || ''),
    badge: b.badge || 'TK2K',
    color: b.color || '#f59e0b',
    category: b.category || 'arcade',
    controls: b.controls || '',
    kind: 'tk-tape',
    raw: b,
    isActive: activeBonusTape?.id === b.id || selectedTapeId === b.id,
  }));

  const allCt2 = getAllTapes().map((t) => ({
    id: t.id,
    title: t.title,
    description: t.isUser ? tr(`Minha gravação • LOAD T "${t.loadName}"`, `My recording • LOAD T "${t.loadName}"`) : (t.description || t.subtitle || ''),
    badge: t.isUser ? tr('GRAVADA', 'REC') : 'BASIC',
    color: t.color || '#38bdf8',
    category: 'apps',
    controls: 'LOAD T / RUN',
    kind: 'ct2',
    raw: t,
    isActive: selectedTapeId === t.id && !activeBonusTape,
  }));

  return [...bonusTapes, ...allCt2];
}

function renderCatalogModal() {
  if (!catalogModal || catalogModal.classList.contains('hidden')) return;
  const isA2 = catalogPlatform === 'apple2';
  const allItems = getCatalogItemsForPlatform(catalogPlatform);

  if (catalogModalTitle) {
    catalogModalTitle.textContent = isA2
      ? tr('💾 Caixa de Disquetes 5¼" — Apple II+', '💾 5¼" Floppy Disk Box — Apple II+')
      : tr('📼 Gaveta de Fitas K7 — Microdigital TK 2000 II', '📼 Cassette Tape Drawer — Microdigital TK 2000 II');
  }
  if (catalogZipLink) {
    if (isA2) {
      catalogZipLink.href = 'https://github.com/4u-Labs/k7floppy/releases/download/v1.0.0/appleii.zip';
      catalogZipLink.removeAttribute('download');
      catalogZipLink.textContent = tr('📥 Baixar Pack appleii.zip (6,8 MB)', '📥 Download appleii.zip Pack (6.8 MB)');
    } else {
      catalogZipLink.href = 'https://github.com/4u-Labs/k7floppy/releases/download/v1.0.0/tk2000.zip';
      catalogZipLink.removeAttribute('download');
      catalogZipLink.textContent = tr('📥 Baixar Pack tk2000.zip (1,5 MB)', '📥 Download tk2000.zip Pack (1.5 MB)');
    }
  }
  if (catalogSearchInput) {
    catalogSearchInput.placeholder = isA2
      ? tr('🔍 Filtrar disquete por nome, estilo ou ano (ex: Karateka, Prince, Ultima)...', '🔍 Filter disk by name, genre or year (e.g. Karateka, Prince, Ultima)...')
      : tr('🔍 Filtrar fita por nome, estilo ou formato (ex: Montezuma, Choplifter, .CT2)...', '🔍 Filter tape by name, genre or format (e.g. Montezuma, Choplifter, .CT2)...');
  }

  const categories = isA2
    ? [
        { id: 'all', label: tr('Todos', 'All') },
        { id: 'classic', label: tr('⭐ Clássicos', '⭐ Classics') },
        { id: 'arcade', label: '🕹️ Arcade' },
        { id: 'adventure', label: tr('🏰 Aventura & RPG', '🏰 Adventure & RPG') },
        { id: 'pack', label: tr('📦 Compilações & Docs', '📦 Compilations & Docs') },
      ]
    : [
        { id: 'all', label: tr('Todas', 'All') },
        { id: 'featured', label: tr('⭐ Top Clássicos', '⭐ Top Classics') },
        { id: 'arcade', label: tr('🕹️ Ação & Arcade', '🕹️ Action & Arcade') },
        { id: 'ct2', label: tr('📼 Fitas .CT2 Puras', '📼 Pure .CT2 Tapes') },
        { id: 'apps', label: tr('🧰 Apps & BASIC', '🧰 Apps & BASIC') },
      ];

  const matchCat = (item, catId) => {
    if (catId === 'all') return true;
    return item.category === catId;
  };

  if (catalogCategoryTabs) {
    catalogCategoryTabs.innerHTML = '';
    for (const c of categories) {
      const count = allItems.filter((it) => matchCat(it, c.id)).length;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `catalog-tab-btn ${catalogCategory === c.id ? 'active' : ''}`;
      btn.textContent = `${c.label} (${count})`;
      btn.addEventListener('click', () => {
        catalogCategory = c.id;
        renderCatalogModal();
      });
      catalogCategoryTabs.appendChild(btn);
    }
  }

  const q = catalogSearchQuery.trim().toLowerCase();
  const filtered = allItems.filter((it) => {
    if (!matchCat(it, catalogCategory)) return false;
    if (!q) return true;
    const hay = `${it.title} ${it.description} ${it.badge} ${it.controls}`.toLowerCase();
    return hay.includes(q);
  });

  if (catalogModalCount) {
    catalogModalCount.textContent = `${filtered.length} / ${allItems.length} ${isA2 ? tr('disquetes', 'disks') : tr('fitas', 'tapes')}`;
  }

  if (!catalogGrid) return;
  catalogGrid.innerHTML = '';

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'tape-empty-hint';
    empty.style.gridColumn = '1 / -1';
    empty.textContent = tr('Nenhum item encontrado para este filtro.', 'No items found for this filter.');
    catalogGrid.appendChild(empty);
    return;
  }

  for (const item of filtered) {
    const card = document.createElement('div');
    card.className = `catalog-card ${item.isActive ? 'active' : ''}`;
    card.style.setProperty('--card-accent', item.color);

    const icon = isA2
      ? '💾'
      : '<img class="catalog-k7-icon" src="assets/k7-mini.webp?v=2" alt="" width="22" height="14" />';
    const actionLabel = item.isActive
      ? tr('⏹ Em execução (Clique p/ ejetar)', '⏹ Running (Click to eject)')
      : isA2
        ? tr('▶ Inserir & Dar Boot', '▶ Insert & Boot')
        : tr('⚡ Inserir & Carregar', '⚡ Insert & Load');

    card.innerHTML = `
      <div class="catalog-card-top">
        <span class="catalog-card-title">${icon} ${item.title}</span>
        <div class="catalog-card-badges">
          <span class="media-item-badge">${item.badge}</span>
        </div>
      </div>
      <div class="catalog-card-desc">${item.description}</div>
      <div class="catalog-card-controls">⌨️ ${item.controls || tr('Teclado / Joystick', 'Keyboard / Joystick')}</div>
      <div class="catalog-card-play">${actionLabel}</div>
    `;

    card.addEventListener('click', () => {
      closeCatalogModal();
      if (item.kind === 'floppy') {
        if (activeMode !== 'apple2') switchComputerPlatform('apple2');
        insertFloppy(item.raw);
      } else if (item.kind === 'ct2') {
        if (document.body.classList.contains('machine-apple2')) switchComputerPlatform('tk2000');
        selectAndInsertTape(item.raw);
        autoLoadAndRunCurrentTape(item.raw);
      } else {
        if (document.body.classList.contains('machine-apple2')) switchComputerPlatform('tk2000');
        launchTkTapeGame(item.raw);
      }
    });

    catalogGrid.appendChild(card);
  }
}

function openCatalogModal(forcePlatform = null) {
  if (!catalogModal) return;
  catalogPlatform = forcePlatform || (document.body.classList.contains('machine-apple2') ? 'apple2' : 'tk2000');
  catalogCategory = 'all';
  catalogSearchQuery = '';
  if (catalogSearchInput) catalogSearchInput.value = '';
  catalogModal.classList.remove('hidden');
  renderCatalogModal();
  setTimeout(() => catalogSearchInput?.focus(), 40);
}

function closeCatalogModal() {
  catalogModal?.classList.add('hidden');
}

btnCatalog?.addEventListener('click', () => openCatalogModal());
btnOpenTapeCatalog?.addEventListener('click', () => openCatalogModal('tk2000'));
btnOpenFloppyCatalog?.addEventListener('click', () => openCatalogModal('apple2'));
btnCloseCatalog?.addEventListener('click', closeCatalogModal);
catalogModal?.addEventListener('click', (e) => {
  if (e.target === catalogModal) closeCatalogModal();
});
catalogSearchInput?.addEventListener('input', (e) => {
  catalogSearchQuery = e.target.value || '';
  renderCatalogModal();
});

buildKeyboard();
renderTapeRack();
renderFloppyRack();
deskA2Manual?.addEventListener('click', () => a2ManualModal?.classList.remove('hidden'));
btnCloseA2Manual?.addEventListener('click', () => a2ManualModal?.classList.add('hidden'));
a2ManualModal?.addEventListener('click', (e) => {
  if (e.target === a2ManualModal) a2ManualModal.classList.add('hidden');
});

deskA2BasicManual?.addEventListener('click', () => {
  a2BasicManualModal?.classList.remove('hidden');
  a2BasicSearch?.focus();
});
btnCloseA2BasicManual?.addEventListener('click', () => a2BasicManualModal?.classList.add('hidden'));
a2BasicManualModal?.addEventListener('click', (e) => {
  if (e.target === a2BasicManualModal) a2BasicManualModal.classList.add('hidden');
});
a2BasicSearch?.addEventListener('input', () => {
  if (!a2BasicManualContent) return;
  const q = a2BasicSearch.value.trim().toLowerCase();
  const sections = a2BasicManualContent.querySelectorAll('.basic-sec');
  for (const sec of sections) {
    let anyVisible = false;
    for (const li of sec.querySelectorAll('li')) {
      const match = !q || li.textContent.toLowerCase().includes(q);
      li.classList.toggle('hidden', !match);
      if (match) anyVisible = true;
    }
    sec.classList.toggle('hidden', !anyVisible);
  }
});

btnLang?.addEventListener('click', () => {
  currentLang = currentLang === 'pt' ? 'en' : 'pt';
  localStorage.setItem('tk2000_lang', currentLang);
  applyLanguageUI();
});

const modal4uLabs = document.getElementById('modal-4ulabs');
const btn4uLabs = document.getElementById('btn-4ulabs');
const btnClose4uLabs = document.getElementById('btn-close-4ulabs');
btn4uLabs?.addEventListener('click', () => modal4uLabs?.classList.remove('hidden'));
btnClose4uLabs?.addEventListener('click', () => modal4uLabs?.classList.add('hidden'));
modal4uLabs?.addEventListener('click', (e) => {
  if (e.target === modal4uLabs) modal4uLabs.classList.add('hidden');
});

const ecoYearEl = document.getElementById('eco-year');
if (ecoYearEl) ecoYearEl.textContent = String(new Date().getFullYear());

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

btnModeTk2000?.addEventListener('click', () => switchComputerPlatform('tk2000'));
btnModeApple2?.addEventListener('click', () => switchComputerPlatform('apple2'));
syncPlatformVisuals('tk2000');
applyLanguageUI();
updateLampUI();
updateMuteUI();
updatePowerUI();
updateJoystickUI();
if (BUILTIN_CT2_TAPES[0]) {
  selectAndInsertTape(BUILTIN_CT2_TAPES[0], { silent: true });
} else {
  updateTapeUI();
}
requestAnimationFrame(mainLoop);
