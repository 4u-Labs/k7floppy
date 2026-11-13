import { CRT_WIDTH, CRT_HEIGHT } from '../crt.js';

const ROVER_SPRITE = [
  '.....5555.....',
  '...55111155...',
  '.555555555555.',
  '55544555544555',
  '.111......111.',
  '.1.1......1.1.',
];

const UFO_SPRITE = [
  '...3333...',
  '.33555533.',
  '3333333333',
  '..7....7..',
];

export class PatrolGame {
  constructor(crt, audio, onExit) {
    this.crt = crt;
    this.audio = audio;
    this.onExit = onExit;
    this.groundY = 160;
    this.reset();
  }

  reset() {
    this.state = 'title';
    this.score = 0;
    this.lives = 3;
    this.dist = 0;
    this.speed = 95;
    this.rover = { x: 44, y: this.groundY - 6, vy: 0, onGround: true, invuln: 0, shootCd: 0 };
    this.shots = [];
    this.enemies = [];
    this.enemyBombs = [];
    this.obstacles = [];
    this.particles = [];
    this.spawnTimer = 1.6;
    this.ufoTimer = 2.4;
    this.scroll = 0;
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
    if (this.state === 'play' && (code === 'ArrowUp' || code === 'KeyW') && this.rover.onGround) {
      this.rover.vy = -155;
      this.rover.onGround = false;
      this.audio.sweep(260, 620, 0.14, 'square', 0.18);
    }
  }

  hitRover() {
    if (this.rover.invuln > 0) return;
    this.audio.noise(0.2, 500, 0.3);
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      this.particles.push({
        x: this.rover.x + 7,
        y: this.rover.y + 3,
        vx: Math.cos(a) * 60,
        vy: Math.sin(a) * 60,
        life: 0.45,
        color: 4,
      });
    }
    this.lives--;
    if (this.lives <= 0) {
      this.state = 'gameover';
      this.audio.playJingle('gameover');
    } else {
      this.rover.invuln = 2.0;
      this.rover.y = this.groundY - 6;
      this.rover.vy = 0;
      this.rover.onGround = true;
    }
  }

  update(dt, keys) {
    if (this.state !== 'play') return;

    const r = this.rover;
    if (r.invuln > 0) r.invuln -= dt;
    if (r.shootCd > 0) r.shootCd -= dt;

    // Velocidade controlada pelo jogador
    let targetSpeed = 95 + Math.min(45, this.dist * 0.015);
    if (keys.has('ArrowRight') || keys.has('KeyD')) targetSpeed += 45;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) targetSpeed -= 35;
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 5);

    this.scroll += this.speed * dt;
    this.dist += this.speed * dt * 0.1;
    this.score = Math.max(this.score, Math.floor(this.dist) * 5);

    // Pulo contínuo se segurou
    if ((keys.has('ArrowUp') || keys.has('KeyW')) && r.onGround) {
      r.vy = -155;
      r.onGround = false;
      this.audio.sweep(260, 620, 0.14, 'square', 0.18);
    }

    // Física do pulo
    if (!r.onGround) {
      r.vy += 380 * dt;
      r.y += r.vy * dt;
      if (r.y >= this.groundY - 6) {
        r.y = this.groundY - 6;
        r.vy = 0;
        r.onGround = true;
      }
    }

    // Tiro duplo (frente + cima)
    if ((keys.has('Space') || keys.has('KeyZ')) && r.shootCd <= 0) {
      r.shootCd = 0.24;
      this.shots.push({ x: r.x + 14, y: r.y + 2, vx: 210, vy: 0 });
      this.shots.push({ x: r.x + 7, y: r.y - 2, vx: 10, vy: -195 });
      this.audio.sweep(880, 340, 0.06, 'square', 0.15);
    }

    // Spawn de pedras/crateras
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1.15 + Math.random() * 1.1;
      const isCrater = Math.random() > 0.48;
      this.obstacles.push({
        type: isCrater ? 'crater' : 'rock',
        x: CRT_WIDTH + 10,
        w: isCrater ? 16 : 8,
        h: isCrater ? 6 : 8,
      });
    }

    // Spawn de OVNIs
    this.ufoTimer -= dt;
    if (this.ufoTimer <= 0) {
      this.ufoTimer = 2.0 + Math.random() * 1.6;
      this.enemies.push({
        x: CRT_WIDTH + 12,
        y: 28 + Math.random() * 48,
        vx: -(65 + Math.random() * 40),
        phase: Math.random() * 6,
        bombCd: 0.9 + Math.random(),
      });
    }

    // Atualiza tiros
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.x > CRT_WIDTH || s.y < 14) {
        this.shots.splice(i, 1);
        continue;
      }
      let hit = false;
      for (let j = this.obstacles.length - 1; j >= 0; j--) {
        const o = this.obstacles[j];
        if (o.type === 'rock' && s.x >= o.x && s.x <= o.x + o.w && s.y >= this.groundY - o.h) {
          this.obstacles.splice(j, 1);
          this.score += 100;
          this.audio.noise(0.08, 900, 0.2);
          hit = true;
          break;
        }
      }
      if (!hit) {
        for (let j = this.enemies.length - 1; j >= 0; j--) {
          const e = this.enemies[j];
          if (s.x >= e.x - 2 && s.x <= e.x + 12 && s.y >= e.y && s.y <= e.y + 8) {
            this.enemies.splice(j, 1);
            this.score += 150;
            this.audio.noise(0.11, 700, 0.22);
            this.particles.push({ x: e.x + 4, y: e.y + 2, vx: 0, vy: -15, life: 0.25, color: 6 });
            hit = true;
            break;
          }
        }
      }
      if (hit) this.shots.splice(i, 1);
    }

    // Atualiza obstáculos
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i];
      o.x -= this.speed * dt;
      if (o.x + o.w < -10) {
        this.obstacles.splice(i, 1);
        continue;
      }
      if (o.type === 'rock') {
        if (r.x + 12 > o.x && r.x + 2 < o.x + o.w && r.y + 6 > this.groundY - o.h) {
          this.hitRover();
        }
      } else {
        // Cratera: cai se passar por cima tocando o chão
        if (r.onGround && r.x + 9 > o.x + 2 && r.x + 4 < o.x + o.w - 2) {
          this.hitRover();
        }
      }
    }

    // Atualiza OVNIs
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.phase += dt * 4;
      e.x += e.vx * dt;
      e.y += Math.sin(e.phase) * 18 * dt;
      e.bombCd -= dt;
      if (e.bombCd <= 0 && e.x > 20 && e.x < CRT_WIDTH - 20) {
        e.bombCd = 1.6;
        this.enemyBombs.push({ x: e.x + 4, y: e.y + 5, vy: 85 });
      }
      if (e.x < -16) this.enemies.splice(i, 1);
    }

    // Bombas inimigas
    for (let i = this.enemyBombs.length - 1; i >= 0; i--) {
      const b = this.enemyBombs[i];
      b.y += b.vy * dt;
      b.x -= this.speed * 0.25 * dt;
      if (b.y >= this.groundY) {
        this.enemyBombs.splice(i, 1);
        continue;
      }
      if (b.x >= r.x + 1 && b.x <= r.x + 13 && b.y >= r.y && b.y <= r.y + 6) {
        this.enemyBombs.splice(i, 1);
        this.hitRover();
      }
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  render() {
    const c = this.crt;
    c.clear(0);

    if (this.state === 'title') {
      c.rectOutline(8, 8, CRT_WIDTH - 16, CRT_HEIGHT - 16, 5);
      c.drawTextCentered('ASTRO PATROL', 34, 6);
      c.drawTextCentered('PATRULHA LUNAR TK 2000', 48, 5);
      c.drawSprite(ROVER_SPRITE, 132, 78, { 5: 5, 1: 1, 4: 4 });
      c.drawTextCentered('PULE CRATERAS E DESTRUA ROCHAS/OVNIS', 108, 1);
      c.drawTextCentered('CIMA: PULAR   ESQ/DIR: VELOCIDADE', 124, 2);
      c.drawTextCentered('ESPACO: TIRO DUPLO', 136, 2);
      c.drawTextCentered('PRESSIONE ESPACO PARA INICIAR', 158, 4);
      c.drawTextCentered('ESC: VOLTAR AO TK-BASIC', 174, 8);
      c.flush();
      return;
    }

    // HUD
    c.rect(0, 0, CRT_WIDTH, 14, 8);
    c.drawText(`PTS:${String(this.score).padStart(5, '0')}`, 4, 3, 6);
    c.drawText(`DIST:${Math.floor(this.dist)}M`, 112, 3, 5);
    c.drawText(`♥${this.lives}`, 248, 3, 7);

    // Estrelas
    for (let i = 0; i < 22; i++) {
      const sx = ((i * 61 - Math.floor(this.scroll * 0.15)) % CRT_WIDTH + CRT_WIDTH) % CRT_WIDTH;
      const sy = 18 + (i * 23) % 78;
      c.pixel(sx, sy, 1);
    }

    // Montanhas lunares parallax
    for (let x = 0; x < CRT_WIDTH; x += 2) {
      const h = 16 + Math.floor(Math.sin((x + this.scroll * 0.3) * 0.04) * 10 + Math.cos((x + this.scroll * 0.3) * 0.09) * 6);
      c.line(x, this.groundY - h, x, this.groundY, 3);
    }

    // Solo lunar
    c.rect(0, this.groundY, CRT_WIDTH, CRT_HEIGHT - this.groundY, 4);
    c.rect(0, this.groundY, CRT_WIDTH, 2, 6);

    // Obstáculos
    for (const o of this.obstacles) {
      const ox = Math.floor(o.x);
      if (o.type === 'crater') {
        c.rect(ox, this.groundY, o.w, 6, 0);
      } else {
        c.rect(ox, this.groundY - o.h, o.w, o.h, 7);
        c.rect(ox + 2, this.groundY - o.h + 1, 3, 2, 6);
      }
    }

    // OVNIs
    for (const e of this.enemies) {
      c.drawSprite(UFO_SPRITE, Math.floor(e.x), Math.floor(e.y), { 3: 3, 5: 5, 7: 7 });
    }

    // Rover
    const blink = this.rover.invuln > 0 && Math.floor(this.rover.invuln * 14) % 2 === 0;
    if (!blink) {
      c.drawSprite(ROVER_SPRITE, Math.floor(this.rover.x), Math.floor(this.rover.y), { 5: 5, 1: 1, 4: 4 });
    }

    // Tiros e bombas
    for (const s of this.shots) c.rect(Math.floor(s.x), Math.floor(s.y), 3, 2, 6);
    for (const b of this.enemyBombs) c.rect(Math.floor(b.x), Math.floor(b.y), 2, 4, 7);
    for (const p of this.particles) c.rect(Math.floor(p.x), Math.floor(p.y), 2, 2, p.color);

    if (this.state === 'gameover') {
      c.rect(48, 64, CRT_WIDTH - 96, 58, 0);
      c.rectOutline(48, 64, CRT_WIDTH - 96, 58, 7);
      c.drawTextCentered('GAME OVER', 76, 7);
      c.drawTextCentered(`PONTUACAO: ${this.score}`, 92, 6);
      c.drawTextCentered('ESPACO: TENTAR DE NOVO', 108, 1);
    }

    c.flush();
  }
}
