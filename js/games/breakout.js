import { CRT_WIDTH, CRT_HEIGHT } from '../crt.js';

export class BreakoutGame {
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
    this.level = 1;
    this.initLevel();
  }

  initLevel() {
    this.paddle = { x: 118, y: 176, w: 44, h: 5 };
    this.ball = { x: 140, y: 168, vx: 85, vy: -105, stuck: true };
    this.bricks = [];
    const cols = 11;
    const rows = 5;
    const colors = [7, 4, 6, 2, 5];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        this.bricks.push({
          x: 12 + c * 23,
          y: 26 + r * 10,
          w: 21,
          h: 7,
          color: colors[r % colors.length],
          pts: (rows - r) * 20,
          alive: true,
        });
      }
    }
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
    if (this.state === 'play' && this.ball.stuck && (code === 'Space' || code === 'ArrowUp')) {
      this.ball.stuck = false;
      const spd = 115 + (this.level - 1) * 14;
      this.ball.vx = (Math.random() > 0.5 ? 1 : -1) * spd * 0.72;
      this.ball.vy = -spd;
      this.audio.beep(520, 0.05, 0.16);
    }
  }

  update(dt, keys) {
    if (this.state !== 'play') return;

    const p = this.paddle;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) p.x -= 175 * dt;
    if (keys.has('ArrowRight') || keys.has('KeyD')) p.x += 175 * dt;
    p.x = Math.max(4, Math.min(CRT_WIDTH - p.w - 4, p.x));

    const b = this.ball;
    if (b.stuck) {
      b.x = p.x + p.w / 2;
      b.y = p.y - 4;
      return;
    }

    b.x += b.vx * dt;
    b.y += b.vy * dt;

    // Paredes
    if (b.x <= 4) {
      b.x = 4;
      b.vx = Math.abs(b.vx);
      this.audio.beep(360, 0.03, 0.12);
    }
    if (b.x >= CRT_WIDTH - 6) {
      b.x = CRT_WIDTH - 6;
      b.vx = -Math.abs(b.vx);
      this.audio.beep(360, 0.03, 0.12);
    }
    if (b.y <= 16) {
      b.y = 16;
      b.vy = Math.abs(b.vy);
      this.audio.beep(420, 0.03, 0.12);
    }

    // Raquete
    if (b.vy > 0 && b.x >= p.x - 2 && b.x <= p.x + p.w + 2 && b.y >= p.y - 4 && b.y <= p.y + 4) {
      const hitOffset = (b.x - (p.x + p.w / 2)) / (p.w / 2);
      const speed = Math.min(200, Math.hypot(b.vx, b.vy) * 1.015);
      const angle = hitOffset * 1.1;
      b.vx = Math.sin(angle) * speed;
      b.vy = -Math.cos(angle) * speed;
      b.y = p.y - 4;
      this.audio.beep(580, 0.04, 0.16);
    }

    // Tijolos
    for (const br of this.bricks) {
      if (!br.alive) continue;
      if (b.x + 3 >= br.x && b.x <= br.x + br.w && b.y + 3 >= br.y && b.y <= br.y + br.h) {
        br.alive = false;
        b.vy = -b.vy;
        this.score += br.pts;
        this.audio.beep(720 + br.pts * 2, 0.045, 0.16);
        break;
      }
    }

    if (this.bricks.every((br) => !br.alive)) {
      this.level++;
      this.score += 400;
      this.audio.playJingle('win');
      this.initLevel();
      return;
    }

    // Caiu
    if (b.y > CRT_HEIGHT + 4) {
      this.lives--;
      this.audio.noise(0.16, 400, 0.24);
      if (this.lives <= 0) {
        this.state = 'gameover';
        this.audio.playJingle('gameover');
      } else {
        b.stuck = true;
      }
    }
  }

  render() {
    const c = this.crt;
    c.clear(0);

    if (this.state === 'title') {
      c.rectOutline(8, 8, CRT_WIDTH - 16, CRT_HEIGHT - 16, 4);
      c.drawTextCentered('QUEBRA-TIJOLOS TK', 36, 4);
      c.drawTextCentered('(FITA K7 - ARCADE)', 50, 6);
      [7, 4, 6, 2, 5].forEach((col, i) => {
        c.rect(68 + i * 30, 78, 24, 8, col);
      });
      c.drawTextCentered('ESQ/DIR: MOVER RAQUETE', 112, 1);
      c.drawTextCentered('ESPACO: LANCAR BOLA', 126, 2);
      c.drawTextCentered('PRESSIONE ESPACO PARA INICIAR', 150, 4);
      c.drawTextCentered('ESC: VOLTAR AO TK-BASIC', 170, 8);
      c.flush();
      return;
    }

    c.rect(0, 0, CRT_WIDTH, 14, 8);
    c.drawText(`PTS:${String(this.score).padStart(5, '0')}`, 4, 3, 6);
    c.drawText(`FASE:${this.level}`, 120, 3, 5);
    c.drawText(`♥${this.lives}`, 248, 3, 7);

    // Bordas da quadra
    c.rect(0, 14, 3, CRT_HEIGHT - 14, 1);
    c.rect(CRT_WIDTH - 3, 14, 3, CRT_HEIGHT - 14, 1);
    c.rect(0, 14, CRT_WIDTH, 2, 1);

    for (const br of this.bricks) {
      if (br.alive) c.rect(br.x, br.y, br.w, br.h, br.color);
    }

    c.rect(Math.floor(this.paddle.x), this.paddle.y, this.paddle.w, this.paddle.h, 1);
    c.rect(Math.floor(this.paddle.x + 2), this.paddle.y + 1, this.paddle.w - 4, 3, 5);
    c.rect(Math.floor(this.ball.x), Math.floor(this.ball.y), 4, 4, 6);

    if (this.ball.stuck && this.state === 'play') {
      c.drawTextCentered('ESPACO PARA LANCAR', 142, 6);
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
