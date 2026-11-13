import { CRT_WIDTH, CRT_HEIGHT } from '../crt.js';

const HELI_RIGHT = [
  '..1111111111..',
  '......11......',
  '..22222222....',
  '.2255522222...',
  '22255522222222',
  '.222222222....',
  '...1....1.....',
  '.1111111111...',
];

const TANK_SPRITE = [
  '....4444....',
  '..44444444..',
  '444444444444',
  '.1.1.1.1.1..',
];

const JET_SPRITE = [
  '.....77.....',
  '..77777777..',
  '77755777777.',
  '....77......',
];

export class ChopperGame {
  constructor(crt, audio, onExit) {
    this.crt = crt;
    this.audio = audio;
    this.onExit = onExit;
    this.groundY = 172;
    this.worldW = 680;
    this.reset();
  }

  reset() {
    this.state = 'title'; // 'title' | 'play' | 'gameover' | 'win'
    this.score = 0;
    this.lives = 3;
    this.rescued = 0;
    this.totalHostages = 12;
    this.heli = {
      x: 56,
      y: this.groundY - 9,
      vx: 0,
      vy: 0,
      dir: 1,
      carrying: 0,
      maxCarry: 4,
      shootCd: 0,
      invuln: 0,
    };
    this.camX = 0;
    this.bullets = [];
    this.enemyShots = [];
    this.particles = [];
    this.barracks = [
      { x: 300, hp: 3, opened: false },
      { x: 430, hp: 3, opened: false },
      { x: 560, hp: 3, opened: false },
    ];
    this.hostages = [];
    this.tanks = [
      { x: 260, dir: 1, cd: 1.5, alive: true, respawn: 0 },
      { x: 490, dir: -1, cd: 2.2, alive: true, respawn: 0 },
    ];
    this.jet = { x: 640, y: 42, dir: -1, cd: 1.6, active: false, timer: 4 };
    this.rotorTick = 0;
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
    if ((this.state === 'gameover' || this.state === 'win') && (code === 'Space' || code === 'Enter')) {
      this.reset();
      this.state = 'play';
      this.audio.playJingle('start');
    }
  }

  spawnExplosion(x, y, color = 4) {
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 25 + Math.random() * 65;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        life: 0.45 + Math.random() * 0.25,
        color,
      });
    }
    this.audio.noise(0.16, 650, 0.28);
  }

  hitHeli() {
    if (this.heli.invuln > 0) return;
    this.spawnExplosion(this.heli.x + 7, this.heli.y + 4, 7);
    this.lives--;
    if (this.lives <= 0) {
      this.state = 'gameover';
      this.audio.playJingle('gameover');
    } else {
      this.heli.x = 56;
      this.heli.y = this.groundY - 9;
      this.heli.vx = 0;
      this.heli.vy = 0;
      this.heli.carrying = 0;
      this.heli.invuln = 2.0;
    }
  }

  update(dt, keys) {
    this.rotorTick += dt * 18;
    if (this.state !== 'play') return;

    const h = this.heli;
    if (h.invuln > 0) h.invuln -= dt;
    if (h.shootCd > 0) h.shootCd -= dt;

    // Controles do helicóptero
    const left = keys.has('ArrowLeft') || keys.has('KeyA');
    const right = keys.has('ArrowRight') || keys.has('KeyD');
    const up = keys.has('ArrowUp') || keys.has('KeyW');
    const down = keys.has('ArrowDown') || keys.has('KeyS');
    const fire = keys.has('Space') || keys.has('KeyJ') || keys.has('KeyZ');

    const accelX = 240;
    const accelY = 210;

    if (left) {
      h.vx -= accelX * dt;
      h.dir = -1;
    }
    if (right) {
      h.vx += accelX * dt;
      h.dir = 1;
    }
    if (up) h.vy -= accelY * dt;
    if (down) h.vy += accelY * dt;

    // Arrasto e gravidade sutil no ar
    h.vx *= Math.pow(0.18, dt);
    h.vy *= Math.pow(0.22, dt);
    if (!up && h.y < this.groundY - 9) {
      h.vy += 22 * dt;
    }

    h.x = Math.max(8, Math.min(this.worldW - 24, h.x + h.vx * dt));
    h.y = Math.max(22, Math.min(this.groundY - 8, h.y + h.vy * dt));

    const landed = h.y >= this.groundY - 9.5;

    // Desembarque na base (x < 95)
    if (landed && h.x < 95 && h.carrying > 0) {
      this.rescued += h.carrying;
      this.score += h.carrying * 250;
      h.carrying = 0;
      this.audio.playJingle('pickup');
      if (this.rescued >= this.totalHostages) {
        this.state = 'win';
        this.score += 1000;
        this.audio.playJingle('win');
      }
    }

    // Tiros do jogador
    if (fire && h.shootCd <= 0) {
      h.shootCd = 0.22;
      this.bullets.push({
        x: h.dir > 0 ? h.x + 14 : h.x - 2,
        y: h.y + 5,
        vx: h.dir * 210,
        vy: 14,
      });
      this.audio.sweep(900, 320, 0.07, 'square', 0.16);
    }

    // Atualiza balas do jogador
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < 0 || b.x > this.worldW || b.y > this.groundY) {
        this.bullets.splice(i, 1);
        continue;
      }

      let hit = false;
      // Colisão com quartéis
      for (const bar of this.barracks) {
        if (!bar.opened && b.x >= bar.x && b.x <= bar.x + 26 && b.y >= this.groundY - 18) {
          bar.hp--;
          hit = true;
          this.audio.beep(260, 0.04, 0.15);
          if (bar.hp <= 0) {
            bar.opened = true;
            this.score += 150;
            this.spawnExplosion(bar.x + 13, this.groundY - 10, 4);
            for (let k = 0; k < 4; k++) {
              this.hostages.push({
                x: bar.x + 4 + k * 5,
                y: this.groundY - 6,
                boarded: false,
                rescued: false,
                wave: Math.random() * 6,
              });
            }
          }
          break;
        }
      }

      // Colisão com tanques
      if (!hit) {
        for (const t of this.tanks) {
          if (t.alive && b.x >= t.x && b.x <= t.x + 12 && b.y >= this.groundY - 6) {
            t.alive = false;
            t.respawn = 6.5;
            this.score += 100;
            this.spawnExplosion(t.x + 6, this.groundY - 3, 6);
            hit = true;
            break;
          }
        }
      }

      // Colisão com caça
      if (!hit && this.jet.active) {
        if (b.x >= this.jet.x && b.x <= this.jet.x + 12 && b.y >= this.jet.y && b.y <= this.jet.y + 6) {
          this.jet.active = false;
          this.jet.timer = 5;
          this.score += 200;
          this.spawnExplosion(this.jet.x + 6, this.jet.y + 2, 7);
          hit = true;
        }
      }

      if (hit) this.bullets.splice(i, 1);
    }

    // Reféns correm para o helicóptero quando pousado perto
    for (const hs of this.hostages) {
      if (hs.boarded) continue;
      hs.wave += dt * 8;
      const dist = h.x + 7 - hs.x;
      if (landed && Math.abs(dist) < 85 && h.carrying < h.maxCarry) {
        hs.x += Math.sign(dist) * 28 * dt;
        if (Math.abs(dist) < 9) {
          hs.boarded = true;
          h.carrying++;
          this.score += 50;
          this.audio.beep(660, 0.05, 0.2);
        }
      }
    }

    // Tanques inimigos
    for (const t of this.tanks) {
      if (!t.alive) {
        t.respawn -= dt;
        if (t.respawn <= 0) t.alive = true;
        continue;
      }
      t.x += t.dir * 22 * dt;
      if (t.x < 170) t.dir = 1;
      if (t.x > this.worldW - 24) t.dir = -1;
      t.cd -= dt;
      if (t.cd <= 0 && Math.abs(t.x - h.x) < 170) {
        t.cd = 1.9 + Math.random();
        const dx = h.x + 7 - (t.x + 6);
        const dy = h.y + 4 - (this.groundY - 5);
        const len = Math.hypot(dx, dy) || 1;
        this.enemyShots.push({
          x: t.x + 6,
          y: this.groundY - 6,
          vx: (dx / len) * 90,
          vy: (dy / len) * 90,
        });
      }
    }

    // Caça inimigo
    if (!this.jet.active) {
      this.jet.timer -= dt;
      if (this.jet.timer <= 0) {
        this.jet.active = true;
        this.jet.dir = h.x > this.worldW / 2 ? 1 : -1;
        this.jet.x = this.jet.dir > 0 ? Math.max(120, this.camX - 16) : Math.min(this.worldW, this.camX + CRT_WIDTH + 16);
        this.jet.y = 30 + Math.random() * 55;
        this.jet.cd = 0.9;
      }
    } else {
      this.jet.x += this.jet.dir * 115 * dt;
      this.jet.cd -= dt;
      if (this.jet.cd <= 0) {
        this.jet.cd = 1.1;
        this.enemyShots.push({
          x: this.jet.x + 6,
          y: this.jet.y + 4,
          vx: this.jet.dir * 55,
          vy: 75,
        });
      }
      if (this.jet.x < 100 || this.jet.x > this.worldW + 20) {
        this.jet.active = false;
        this.jet.timer = 4;
      }
    }

    // Tiros inimigos
    for (let i = this.enemyShots.length - 1; i >= 0; i--) {
      const s = this.enemyShots[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.y > this.groundY || s.x < 0 || s.x > this.worldW) {
        this.enemyShots.splice(i, 1);
        continue;
      }
      if (s.x >= h.x && s.x <= h.x + 14 && s.y >= h.y && s.y <= h.y + 8) {
        this.enemyShots.splice(i, 1);
        this.hitHeli();
      }
    }

    // Partículas
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }

    // Câmera suave
    const targetCam = Math.max(0, Math.min(this.worldW - CRT_WIDTH, h.x - CRT_WIDTH / 2 + 12));
    this.camX += (targetCam - this.camX) * Math.min(1, dt * 6);
  }

  render() {
    const c = this.crt;
    c.clear(0);

    if (this.state === 'title') {
      c.rectOutline(8, 8, CRT_WIDTH - 16, CRT_HEIGHT - 16, 2);
      c.drawTextCentered('RESCUE CHOPPER', 34, 6);
      c.drawTextCentered('(TK 2000 EDITION)', 48, 2);
      c.drawSprite(HELI_RIGHT, 132, 74, { 1: 1, 2: 2, 5: 5 });
      c.drawTextCentered('RESGATE OS 12 REFENS DOS QUARTEIS', 102, 1);
      c.drawTextCentered('E TRAGA PARA A BASE A ESQUERDA!', 114, 1);
      c.drawTextCentered('SETAS: VOAR   ESPACO: ATIRAR', 138, 5);
      c.drawTextCentered('PRESSIONE ESPACO PARA INICIAR', 160, 4);
      c.drawTextCentered('ESC: VOLTAR AO TK-BASIC', 174, 8);
      c.flush();
      return;
    }

    // HUD
    c.rect(0, 0, CRT_WIDTH, 14, 8);
    c.drawText(`PTS:${String(this.score).padStart(4, '0')}`, 4, 3, 6);
    c.drawText(`RESG:${this.rescued}/${this.totalHostages}`, 82, 3, 2);
    c.drawText(`ABORD:${this.heli.carrying}/4`, 166, 3, 5);
    c.drawText(`♥${this.lives}`, 248, 3, 7);

    const cx = Math.floor(this.camX);

    // Estrelas e montanhas parallax
    for (let i = 0; i < 24; i++) {
      const sx = ((i * 73 - Math.floor(cx * 0.25)) % CRT_WIDTH + CRT_WIDTH) % CRT_WIDTH;
      const sy = 18 + (i * 29) % 70;
      c.pixel(sx, sy, 1);
    }

    // Chão
    c.rect(0, this.groundY, CRT_WIDTH, CRT_HEIGHT - this.groundY, 4);
    c.rect(0, this.groundY, CRT_WIDTH, 2, 6);

    // Base amigável
    const baseScreenX = 16 - cx;
    if (baseScreenX > -90 && baseScreenX < CRT_WIDTH) {
      c.rect(baseScreenX, this.groundY - 3, 74, 3, 5);
      c.rect(baseScreenX + 4, this.groundY - 22, 18, 19, 1);
      c.rect(baseScreenX + 7, this.groundY - 18, 5, 5, 5);
      c.drawText('BASE', baseScreenX + 28, this.groundY - 11, 2);
    }

    // Quartéis
    for (const bar of this.barracks) {
      const bx = Math.floor(bar.x - cx);
      if (bx < -30 || bx > CRT_WIDTH) continue;
      if (!bar.opened) {
        c.rect(bx, this.groundY - 18, 26, 18, 3);
        c.rectOutline(bx, this.groundY - 18, 26, 18, 1);
        c.rect(bx + 9, this.groundY - 10, 8, 10, 0);
      } else {
        c.rect(bx, this.groundY - 6, 26, 6, 8);
      }
    }

    // Reféns
    for (const hs of this.hostages) {
      if (hs.boarded) continue;
      const hx = Math.floor(hs.x - cx);
      if (hx < -5 || hx > CRT_WIDTH) continue;
      const armY = Math.sin(hs.wave) > 0 ? 1 : 0;
      c.rect(hx, this.groundY - 6, 2, 3, 6);
      c.rect(hx, this.groundY - 3, 2, 3, 1);
      c.pixel(hx - 1, this.groundY - 5 - armY, 6);
      c.pixel(hx + 2, this.groundY - 5 - armY, 6);
    }

    // Tanques
    for (const t of this.tanks) {
      if (!t.alive) continue;
      const tx = Math.floor(t.x - cx);
      if (tx < -14 || tx > CRT_WIDTH) continue;
      c.drawSprite(TANK_SPRITE, tx, this.groundY - 4, { 4: 7, 1: 1 });
    }

    // Caça
    if (this.jet.active) {
      const jx = Math.floor(this.jet.x - cx);
      c.drawSprite(JET_SPRITE, jx, Math.floor(this.jet.y), { 7: 7, 5: 5 }, this.jet.dir > 0);
    }

    // Helicóptero
    const blink = this.heli.invuln > 0 && Math.floor(this.heli.invuln * 14) % 2 === 0;
    if (!blink) {
      const hx = Math.floor(this.heli.x - cx);
      const hy = Math.floor(this.heli.y);
      const rotorToggle = Math.floor(this.rotorTick) % 2 === 0;
      const sprite = [...HELI_RIGHT];
      sprite[0] = rotorToggle ? '..1111111111..' : '.....1111.....';
      c.drawSprite(sprite, hx, hy, { 1: 1, 2: 2, 5: 5 }, this.heli.dir < 0);
    }

    // Tiros
    for (const b of this.bullets) {
      c.rect(Math.floor(b.x - cx), Math.floor(b.y), 3, 2, 6);
    }
    for (const s of this.enemyShots) {
      c.rect(Math.floor(s.x - cx), Math.floor(s.y), 2, 2, 7);
    }

    // Partículas
    for (const p of this.particles) {
      c.rect(Math.floor(p.x - cx), Math.floor(p.y), 2, 2, p.color);
    }

    if (this.state === 'gameover' || this.state === 'win') {
      c.rect(44, 64, CRT_WIDTH - 88, 60, 0);
      c.rectOutline(44, 64, CRT_WIDTH - 88, 60, this.state === 'win' ? 2 : 7);
      c.drawTextCentered(this.state === 'win' ? 'MISSAO CUMPRIDA!' : 'GAME OVER', 76, this.state === 'win' ? 2 : 7);
      c.drawTextCentered(`PONTUACAO: ${this.score}`, 92, 6);
      c.drawTextCentered('ESPACO: JOGAR DE NOVO', 108, 1);
    }

    c.flush();
  }
}
