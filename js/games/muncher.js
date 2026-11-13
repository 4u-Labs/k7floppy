import { CRT_WIDTH, CRT_HEIGHT } from '../crt.js';

// Mapa 28x17 células (cada célula = 10x10 px -> 280x170, + 18px HUD)
const MAZE_TEMPLATE = [
  '############################',
  '#o...........##...........o#',
  '#.####.#####.##.#####.####.#',
  '#.####.#####.##.#####.####.#',
  '#..........................#',
  '#.####.##.########.##.####.#',
  '#......##....##....##......#',
  '######.##### ## #####.######',
  '     #.##          ##.#     ',
  '######.## ###  ### ##.######',
  '      .   #      #   .      ',
  '######.## ######## ##.######',
  '     #.##          ##.#     ',
  '######.## ######## ##.######',
  '#............##............#',
  '#o####.#####.##.#####.####o#',
  '############################',
];

const GHOST_COLORS = [7, 3, 5, 4];

export class MuncherGame {
  constructor(crt, audio, onExit) {
    this.crt = crt;
    this.audio = audio;
    this.onExit = onExit;
    this.cell = 10;
    this.offsetY = 18;
    this.reset();
  }

  reset() {
    this.state = 'title';
    this.score = 0;
    this.lives = 3;
    this.level = 1;
    this.initLevel();
  }

  initLevel() {
    this.grid = MAZE_TEMPLATE.map((row) => row.split(''));
    this.dotsLeft = 0;
    for (let r = 0; r < this.grid.length; r++) {
      for (let c = 0; c < this.grid[r].length; c++) {
        if (this.grid[r][c] === '.' || this.grid[r][c] === 'o') {
          this.dotsLeft++;
        }
      }
    }
    this.resetPositions();
  }

  resetPositions() {
    this.player = { col: 13, row: 14, dirX: -1, dirY: 0, wantX: -1, wantY: 0, moveAcc: 0, mouth: 0 };
    this.frightTimer = 0;
    this.ghosts = [
      { col: 13, row: 8, dirX: 1, dirY: 0, color: GHOST_COLORS[0], acc: 0 },
      { col: 14, row: 8, dirX: -1, dirY: 0, color: GHOST_COLORS[1], acc: 0 },
      { col: 12, row: 10, dirX: 0, dirY: -1, color: GHOST_COLORS[2], acc: 0 },
      { col: 15, row: 10, dirX: 0, dirY: -1, color: GHOST_COLORS[3], acc: 0 },
    ];
  }

  start() {
    this.reset();
  }

  onKeyDown(code) {
    if (code === 'Escape') {
      this.onExit();
      return;
    }
    if (this.state === 'title' && (code === 'Space' || code === 'Enter')) {
      this.state = 'play';
      this.audio.playJingle('start');
      return;
    }
    if (this.state === 'gameover' && (code === 'Space' || code === 'Enter')) {
      this.reset();
      this.state = 'play';
      this.audio.playJingle('start');
      return;
    }
    if (code === 'ArrowLeft' || code === 'KeyA') {
      this.player.wantX = -1;
      this.player.wantY = 0;
    } else if (code === 'ArrowRight' || code === 'KeyD') {
      this.player.wantX = 1;
      this.player.wantY = 0;
    } else if (code === 'ArrowUp' || code === 'KeyW') {
      this.player.wantX = 0;
      this.player.wantY = -1;
    } else if (code === 'ArrowDown' || code === 'KeyS') {
      this.player.wantX = 0;
      this.player.wantY = 1;
    }
  }

  isWall(col, row) {
    const w = this.grid[0].length;
    const c = (col + w) % w;
    if (row < 0 || row >= this.grid.length) return true;
    return this.grid[row][c] === '#';
  }

  update(dt, keys) {
    if (this.state !== 'play') return;

    // Também checa teclas pressionadas no frame
    if (keys.has('ArrowLeft') || keys.has('KeyA')) { this.player.wantX = -1; this.player.wantY = 0; }
    else if (keys.has('ArrowRight') || keys.has('KeyD')) { this.player.wantX = 1; this.player.wantY = 0; }
    else if (keys.has('ArrowUp') || keys.has('KeyW')) { this.player.wantX = 0; this.player.wantY = -1; }
    else if (keys.has('ArrowDown') || keys.has('KeyS')) { this.player.wantX = 0; this.player.wantY = 1; }

    if (this.frightTimer > 0) this.frightTimer -= dt;
    this.player.mouth += dt * 10;

    // Movimento em grade do jogador
    this.player.moveAcc += dt * 8.5;
    if (this.player.moveAcc >= 1) {
      this.player.moveAcc -= 1;
      const p = this.player;
      const w = this.grid[0].length;

      if (!this.isWall(p.col + p.wantX, p.row + p.wantY)) {
        p.dirX = p.wantX;
        p.dirY = p.wantY;
      }
      if (!this.isWall(p.col + p.dirX, p.row + p.dirY)) {
        p.col = (p.col + p.dirX + w) % w;
        p.row += p.dirY;
      }

      const cell = this.grid[p.row][p.col];
      if (cell === '.' || cell === 'o') {
        this.grid[p.row][p.col] = ' ';
        this.dotsLeft--;
        if (cell === 'o') {
          this.score += 50;
          this.frightTimer = 6.5;
          this.audio.playJingle('pickup');
        } else {
          this.score += 10;
          this.audio.beep(420 + (p.col % 2) * 100, 0.025, 0.1, 'square');
        }
        if (this.dotsLeft <= 0) {
          this.level++;
          this.score += 300;
          this.audio.playJingle('win');
          this.initLevel();
          return;
        }
      }
    }

    // Fantasmas
    const ghostSpeed = this.frightTimer > 0 ? 4.8 : Math.min(8.0, 5.8 + this.level * 0.4);
    for (const g of this.ghosts) {
      g.acc += dt * ghostSpeed;
      if (g.acc >= 1) {
        g.acc -= 1;
        const w = this.grid[0].length;
        const dirs = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].filter(([dx, dy]) => !this.isWall(g.col + dx, g.row + dy));

        // Evita voltar imediatamente se houver outra opção
        const nonReverse = dirs.filter(([dx, dy]) => !(dx === -g.dirX && dy === -g.dirY));
        const choices = nonReverse.length > 0 ? nonReverse : dirs;

        if (choices.length > 0) {
          // Escolhe com leve tendência ao jogador (ou foge quando assustado)
          choices.sort((a, b) => {
            const da = Math.hypot(g.col + a[0] - this.player.col, g.row + a[1] - this.player.row);
            const db = Math.hypot(g.col + b[0] - this.player.col, g.row + b[1] - this.player.row);
            return this.frightTimer > 0 ? db - da : da - db;
          });
          const pick = Math.random() < 0.65 ? choices[0] : choices[Math.floor(Math.random() * choices.length)];
          g.dirX = pick[0];
          g.dirY = pick[1];
          g.col = (g.col + g.dirX + w) % w;
          g.row += g.dirY;
        }
      }

      // Colisão fantasma x jogador
      if (g.col === this.player.col && g.row === this.player.row) {
        if (this.frightTimer > 0) {
          this.score += 200;
          this.audio.sweep(300, 900, 0.12, 'square', 0.2);
          g.col = 13;
          g.row = 10;
        } else {
          this.lives--;
          this.audio.noise(0.18, 450, 0.25);
          if (this.lives <= 0) {
            this.state = 'gameover';
            this.audio.playJingle('gameover');
          } else {
            this.resetPositions();
          }
          break;
        }
      }
    }
  }

  render() {
    const c = this.crt;
    c.clear(0);

    if (this.state === 'title') {
      c.rectOutline(8, 8, CRT_WIDTH - 16, CRT_HEIGHT - 16, 6);
      c.drawTextCentered('LABIRINTO TK', 34, 6);
      c.drawTextCentered('(FITA K7 - ARCADE)', 48, 5);
      c.circle(124, 82, 7, 6, true);
      c.rect(125, 80, 7, 4, 0);
      c.circle(152, 82, 6, 7, true);
      c.drawTextCentered('COMA TODAS AS PASTILHAS DO LABIRINTO', 108, 1);
      c.drawTextCentered('SETAS / WASD: MOVER', 126, 2);
      c.drawTextCentered('PRESSIONE ESPACO PARA INICIAR', 150, 4);
      c.drawTextCentered('ESC: VOLTAR AO TK-BASIC', 170, 8);
      c.flush();
      return;
    }

    c.rect(0, 0, CRT_WIDTH, 14, 8);
    c.drawText(`PTS:${String(this.score).padStart(5, '0')}`, 4, 3, 6);
    c.drawText(`FASE:${this.level}`, 120, 3, 5);
    c.drawText(`♥${this.lives}`, 248, 3, 7);

    // Labirinto e pastilhas
    for (let r = 0; r < this.grid.length; r++) {
      for (let col = 0; col < this.grid[r].length; col++) {
        const ch = this.grid[r][col];
        const x = col * this.cell;
        const y = this.offsetY + r * this.cell;
        if (ch === '#') {
          c.rect(x + 1, y + 1, this.cell - 2, this.cell - 2, 5);
          c.rect(x + 3, y + 3, this.cell - 6, this.cell - 6, 0);
        } else if (ch === '.') {
          c.rect(x + 4, y + 4, 2, 2, 1);
        } else if (ch === 'o') {
          c.rect(x + 3, y + 3, 4, 4, 4);
        }
      }
    }

    // Fantasmas
    for (const g of this.ghosts) {
      const gx = g.col * this.cell + 1;
      const gy = this.offsetY + g.row * this.cell + 1;
      const gColor = this.frightTimer > 0
        ? (this.frightTimer < 2 && Math.floor(this.frightTimer * 10) % 2 === 0 ? 1 : 5)
        : g.color;
      c.rect(gx + 1, gy, 6, 7, gColor);
      c.rect(gx, gy + 2, 8, 5, gColor);
      c.pixel(gx + 2, gy + 3, 1);
      c.pixel(gx + 5, gy + 3, 1);
    }

    // Jogador
    const px = this.player.col * this.cell + 5;
    const py = this.offsetY + this.player.row * this.cell + 5;
    c.circle(px, py, 4, 6, true);
    if (Math.floor(this.player.mouth) % 2 === 0) {
      c.rect(px + this.player.dirX * 2 - 1, py + this.player.dirY * 2 - 1, 3, 3, 0);
    }

    if (this.state === 'gameover') {
      c.rect(48, 64, CRT_WIDTH - 96, 58, 0);
      c.rectOutline(48, 64, CRT_WIDTH - 96, 58, 7);
      c.drawTextCentered('GAME OVER', 76, 7);
      c.drawTextCentered(`PONTUACAO: ${this.score}`, 92, 6);
      c.drawTextCentered('ESPACO: JOGAR DE NOVO', 108, 1);
    }

    c.flush();
  }
}
