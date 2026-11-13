import { CRT_WIDTH, CRT_HEIGHT } from '../crt.js';

export class SnakeGame {
  constructor(crt, audio, onExit) {
    this.crt = crt;
    this.audio = audio;
    this.onExit = onExit;
    this.cols = 34;
    this.rows = 20;
    this.cell = 8;
    this.ox = 4;
    this.oy = 22;
    this.highScore = Number(localStorage.getItem('tk2000_snake_hi') || 0);
    this.reset();
  }

  reset() {
    this.state = 'title';
    this.score = 0;
    this.snake = [
      { x: 16, y: 10 },
      { x: 15, y: 10 },
      { x: 14, y: 10 },
      { x: 13, y: 10 },
    ];
    this.dir = { x: 1, y: 0 };
    this.nextDir = { x: 1, y: 0 };
    this.acc = 0;
    this.speed = 9;
    this.spawnApple();
  }

  spawnApple() {
    while (true) {
      const ax = Math.floor(Math.random() * this.cols);
      const ay = Math.floor(Math.random() * this.rows);
      if (!this.snake.some((s) => s.x === ax && s.y === ay)) {
        this.apple = { x: ax, y: ay };
        break;
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

    if ((code === 'ArrowLeft' || code === 'KeyA') && this.dir.x !== 1) this.nextDir = { x: -1, y: 0 };
    else if ((code === 'ArrowRight' || code === 'KeyD') && this.dir.x !== -1) this.nextDir = { x: 1, y: 0 };
    else if ((code === 'ArrowUp' || code === 'KeyW') && this.dir.y !== 1) this.nextDir = { x: 0, y: -1 };
    else if ((code === 'ArrowDown' || code === 'KeyS') && this.dir.y !== -1) this.nextDir = { x: 0, y: 1 };
  }

  update(dt) {
    if (this.state !== 'play') return;

    this.acc += dt * this.speed;
    if (this.acc < 1) return;
    this.acc -= 1;

    this.dir = { ...this.nextDir };
    const head = {
      x: this.snake[0].x + this.dir.x,
      y: this.snake[0].y + this.dir.y,
    };

    if (
      head.x < 0 ||
      head.x >= this.cols ||
      head.y < 0 ||
      head.y >= this.rows ||
      this.snake.some((s) => s.x === head.x && s.y === head.y)
    ) {
      this.state = 'gameover';
      if (this.score > this.highScore) {
        this.highScore = this.score;
        localStorage.setItem('tk2000_snake_hi', String(this.highScore));
      }
      this.audio.playJingle('gameover');
      return;
    }

    this.snake.unshift(head);
    if (head.x === this.apple.x && head.y === this.apple.y) {
      this.score += 50;
      this.speed = Math.min(20, this.speed + 0.35);
      this.audio.playJingle('pickup');
      this.spawnApple();
    } else {
      this.snake.pop();
    }
  }

  render() {
    const c = this.crt;
    c.clear(0);

    if (this.state === 'title') {
      c.rectOutline(8, 8, CRT_WIDTH - 16, CRT_HEIGHT - 16, 2);
      c.drawTextCentered('COBRA TK', 36, 2);
      c.drawTextCentered('(FITA K7 - CLASSICO)', 50, 6);
      for (let i = 0; i < 8; i++) {
        c.rect(96 + i * 9, 80, 7, 7, i === 7 ? 6 : 2);
      }
      c.rect(182, 80, 7, 7, 7);
      c.drawTextCentered('COMA AS FRUTAS SEM BATER NAS PAREDES', 108, 1);
      c.drawTextCentered('SETAS / WASD: DIRECAO', 126, 5);
      c.drawTextCentered('PRESSIONE ESPACO PARA INICIAR', 150, 4);
      c.drawTextCentered('ESC: VOLTAR AO TK-BASIC', 170, 8);
      c.flush();
      return;
    }

    c.rect(0, 0, CRT_WIDTH, 14, 8);
    c.drawText(`PTS:${String(this.score).padStart(4, '0')}`, 4, 3, 6);
    c.drawText(`RECORDE:${String(this.highScore).padStart(4, '0')}`, 160, 3, 2);

    // Arena
    c.rectOutline(this.ox - 1, this.oy - 1, this.cols * this.cell + 2, this.rows * this.cell + 2, 5);

    // Fruta
    c.rect(this.ox + this.apple.x * this.cell + 1, this.oy + this.apple.y * this.cell + 1, 6, 6, 7);

    // Cobra
    this.snake.forEach((seg, idx) => {
      c.rect(
        this.ox + seg.x * this.cell + 1,
        this.oy + seg.y * this.cell + 1,
        6,
        6,
        idx === 0 ? 6 : 2
      );
    });

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
