import { CRT_WIDTH, CRT_HEIGHT } from '../crt.js';

const ALIEN_A = [
  '..1...1..',
  '...1.1...',
  '..11111..',
  '.11.1.11.',
  '111111111',
  '1.11111.1',
  '1.1...1.1',
  '...1.1...',
];

const ALIEN_B = [
  '...111...',
  '.1111111.',
  '111111111',
  '11.111.11',
  '111111111',
  '..11.11..',
  '.11...11.',
  '11.....11',
];

const PLAYER_SPRITE = [
  '.....2.....',
  '....222....',
  '.222222222.',
  '22222122222',
  '22222222222',
];

export class InvadersGame {
  constructor(crt, audio, onExit) {
    this.crt = crt;
    this.audio = audio;
    this.onExit = onExit;
    this.reset();
  }

  reset() {
    this.state = 'title';
    this.score = 0;
    this.lives = 3;
    this.wave = 1;
    this.initWave();
  }

  initWave() {
    this.player = { x: 134, y: 174, shootCd: 0, invuln: 0 };
    this.bullets = [];
    this.enemyShots = [];
    this.aliens = [];
    const cols = 9;
    const rows = 4;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        this.aliens.push({
          x: 28 + c * 24,
          y: 28 + r * 16,
          row: r,
          alive: true,
        });
      }
    }
    this.alienDir = 1;
    this.stepTimer = 0;
    this.stepToggle = 0;
    this.beatIndex = 0;
    this.ufo = { active: false, x: 0, dir: 1, timer: 8 };
    this.bunkers = [46, 128, 210].map((bx) => ({ x: bx, y: 152, hp: 10 }));
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
    }
  }

  update(dt, keys) {
    if (this.state !== 'play') return;

    const p = this.player;
    if (p.shootCd > 0) p.shootCd -= dt;
    if (p.invuln > 0) p.invuln -= dt;

    if (keys.has('ArrowLeft') || keys.has('KeyA')) p.x -= 130 * dt;
    if (keys.has('ArrowRight') || keys.has('KeyD')) p.x += 130 * dt;
    p.x = Math.max(8, Math.min(CRT_WIDTH - 19, p.x));

    if ((keys.has('Space') || keys.has('ArrowUp') || keys.has('KeyZ')) && p.shootCd <= 0 && this.bullets.length < 2) {
      p.shootCd = 0.25;
      this.bullets.push({ x: p.x + 5, y: p.y - 3 });
      this.audio.sweep(960, 420, 0.06, 'square', 0.14);
    }

    // Marcha dos invasores acelerando conforme restam menos inimigos
    const alive = this.aliens.filter((a) => a.alive);
    if (alive.length === 0) {
      this.wave++;
      this.score += 500;
      this.audio.playJingle('win');
      this.initWave();
      return;
    }

    const stepInterval = Math.max(0.08, 0.52 * (alive.length / 36) - (this.wave - 1) * 0.04);
    this.stepTimer += dt;
    if (this.stepTimer >= stepInterval) {
      this.stepTimer = 0;
      this.stepToggle ^= 1;
      const beatNotes = [110, 98, 87, 82];
      this.audio.beep(beatNotes[this.beatIndex % 4], 0.045, 0.12, 'square');
      this.beatIndex++;

      let hitEdge = false;
      for (const a of alive) {
        a.x += this.alienDir * 6;
        if ((this.alienDir > 0 && a.x >= CRT_WIDTH - 16) || (this.alienDir < 0 && a.x <= 6)) {
          hitEdge = true;
        }
      }
      if (hitEdge) {
        this.alienDir *= -1;
        for (const a of alive) {
          a.y += 7;
          if (a.y >= p.y - 6) {
            this.state = 'gameover';
            this.audio.playJingle('gameover');
          }
        }
      }

      // Disparo aleatório de um invasor
      if (Math.random() < 0.42 && this.enemyShots.length < 4 + this.wave) {
        const shooter = alive[Math.floor(Math.random() * alive.length)];
        this.enemyShots.push({ x: shooter.x + 4, y: shooter.y + 8 });
      }
    }

    // OVNI bônus no topo
    if (!this.ufo.active) {
      this.ufo.timer -= dt;
      if (this.ufo.timer <= 0) {
        this.ufo.active = true;
        this.ufo.dir = Math.random() > 0.5 ? 1 : -1;
        this.ufo.x = this.ufo.dir > 0 ? -16 : CRT_WIDTH + 4;
      }
    } else {
      this.ufo.x += this.ufo.dir * 75 * dt;
      if (this.ufo.x < -20 || this.ufo.x > CRT_WIDTH + 20) {
        this.ufo.active = false;
        this.ufo.timer = 9 + Math.random() * 6;
      }
    }

    // Balas do jogador
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.y -= 210 * dt;
      if (b.y < 14) {
        this.bullets.splice(i, 1);
        continue;
      }

      let hit = false;
      if (this.ufo.active && b.x >= this.ufo.x && b.x <= this.ufo.x + 14 && b.y <= 24) {
        this.ufo.active = false;
        this.ufo.timer = 10;
        this.score += 300;
        this.audio.playJingle('pickup');
        hit = true;
      }

      if (!hit) {
        for (const a of alive) {
          if (b.x >= a.x && b.x <= a.x + 9 && b.y >= a.y && b.y <= a.y + 8) {
            a.alive = false;
            this.score += (4 - a.row) * 25;
            this.audio.noise(0.08, 700, 0.22);
            hit = true;
            break;
          }
        }
      }

      if (!hit) {
        for (const bk of this.bunkers) {
          if (bk.hp > 0 && b.x >= bk.x && b.x <= bk.x + 24 && b.y >= bk.y && b.y <= bk.y + 10) {
            bk.hp--;
            hit = true;
            break;
          }
        }
      }

      if (hit) this.bullets.splice(i, 1);
    }

    // Tiros inimigos
    for (let i = this.enemyShots.length - 1; i >= 0; i--) {
      const s = this.enemyShots[i];
      s.y += (95 + this.wave * 10) * dt;
      if (s.y > 184) {
        this.enemyShots.splice(i, 1);
        continue;
      }

      let hit = false;
      for (const bk of this.bunkers) {
        if (bk.hp > 0 && s.x >= bk.x && s.x <= bk.x + 24 && s.y >= bk.y && s.y <= bk.y + 10) {
          bk.hp--;
          hit = true;
          break;
        }
      }

      if (!hit && p.invuln <= 0 && s.x >= p.x && s.x <= p.x + 11 && s.y >= p.y && s.y <= p.y + 5) {
        hit = true;
        this.lives--;
        this.audio.noise(0.18, 500, 0.28);
        if (this.lives <= 0) {
          this.state = 'gameover';
          this.audio.playJingle('gameover');
        } else {
          p.invuln = 1.6;
        }
      }

      if (hit) this.enemyShots.splice(i, 1);
    }
  }

  render() {
    const c = this.crt;
    c.clear(0);

    if (this.state === 'title') {
      c.rectOutline(8, 8, CRT_WIDTH - 16, CRT_HEIGHT - 16, 3);
      c.drawTextCentered('GALAXY INVADERS', 34, 6);
      c.drawTextCentered('DEFESA ESPACIAL TK 2000', 48, 3);
      c.drawSprite(ALIEN_A, 120, 74, { 1: 2 });
      c.drawSprite(ALIEN_B, 148, 74, { 1: 3 });
      c.drawTextCentered('ESQ/DIR: MOVER   ESPACO: ATIRAR', 112, 1);
      c.drawTextCentered('PRESSIONE ESPACO PARA INICIAR', 150, 4);
      c.drawTextCentered('ESC: VOLTAR AO TK-BASIC', 170, 8);
      c.flush();
      return;
    }

    c.rect(0, 0, CRT_WIDTH, 14, 8);
    c.drawText(`PTS:${String(this.score).padStart(5, '0')}`, 4, 3, 6);
    c.drawText(`ONDA:${this.wave}`, 120, 3, 5);
    c.drawText(`♥${this.lives}`, 248, 3, 7);

    // Chão
    c.rect(0, 185, CRT_WIDTH, 2, 2);

    // OVNI
    if (this.ufo.active) {
      c.rect(Math.floor(this.ufo.x) + 3, 17, 8, 3, 7);
      c.rect(Math.floor(this.ufo.x), 20, 14, 3, 7);
    }

    // Bunkers
    for (const bk of this.bunkers) {
      if (bk.hp <= 0) continue;
      const color = bk.hp > 5 ? 2 : bk.hp > 2 ? 6 : 4;
      c.rect(bk.x, bk.y, 24, Math.max(3, bk.hp), color);
    }

    // Invasores
    const rowColors = [7, 3, 5, 6];
    for (const a of this.aliens) {
      if (!a.alive) continue;
      const sp = (a.row + this.stepToggle) % 2 === 0 ? ALIEN_A : ALIEN_B;
      c.drawSprite(sp, Math.floor(a.x), Math.floor(a.y), { 1: rowColors[a.row % 4] });
    }

    // Jogador
    if (this.player.invuln <= 0 || Math.floor(this.player.invuln * 14) % 2 === 0) {
      c.drawSprite(PLAYER_SPRITE, Math.floor(this.player.x), this.player.y, { 2: 2, 1: 1 });
    }

    for (const b of this.bullets) c.rect(Math.floor(b.x), Math.floor(b.y), 2, 5, 1);
    for (const s of this.enemyShots) c.rect(Math.floor(s.x), Math.floor(s.y), 2, 5, 4);

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
