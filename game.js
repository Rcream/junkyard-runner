// ============================================================
// JUNKYARD RUNNER — Full Game
// ============================================================

const CFG = {
  W: 960, H: 540,
  GRAVITY: 0.55,
  JUMP_VEL: -10.5,
  MAX_SPEED: 4.5,
  ACCEL: 0.4,
  GROUND_FRIC: 0.82,
  AIR_FRIC: 0.94,
  MAX_FALL: 12,
  PW: 20, PH: 30,
  PLAT_H: 16,
  SW: 10, SH: 10,
  CRUMBLE_DELAY: 90,
  CRUMBLE_SHAKE: 30,
  CRUMBLE_RESPAWN: 180,
  INVINCIBLE: 90,
  SCROLL_BASE: 1.5,
  DIFF_INTERVAL: 1200,
  DIFF_STEP: 0.3,
  MAX_DIFF: 5,
  LEFT_DEATH: 60,
  CHUNK_W: 400,
};

function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

function rand(mn, mx) { return mn + Math.random() * (mx - mn); }
function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }

// ============================================================
// INPUT
// ============================================================
class Input {
  constructor() {
    this.keys = {};
    this.justPressed = {};
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Space'].includes(e.key) || e.key.startsWith('Arrow')) {
        e.preventDefault();
      }
      if (!this.keys[e.key]) this.justPressed[e.key] = true;
      this.keys[e.key] = true;
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.key] = false;
    });
  }
  down(k) { return !!this.keys[k]; }
  pressed(k) { return !!this.justPressed[k]; }
  clearFrame() { this.justPressed = {}; }
}

// ============================================================
// CAMERA
// ============================================================
class Camera {
  constructor() {
    this.x = 0;
    this.shakeX = 0; this.shakeY = 0;
    this.shakeTimer = 0;
    this.scrollSpeed = CFG.SCROLL_BASE;
    this.targetX = 0;
  }

  shake() { this.shakeTimer = 15; }

  update(player, dt) {
    const desiredX = player.x - CFG.W * 0.33;
    const target = Math.max(this.targetX, desiredX);
    this.x += (target - this.x) * 0.08 * clamp(dt, 0.5, 2);
    if (Math.abs(this.x - target) < 0.5) this.x = target;

    if (this.shakeTimer > 0) {
      this.shakeX = (Math.random() - 0.5) * 8;
      this.shakeY = (Math.random() - 0.5) * 8;
      this.shakeTimer -= dt;
      if (this.shakeTimer < 0) { this.shakeX = 0; this.shakeY = 0; }
    }
  }
}

// ============================================================
// PLAYER
// ============================================================
class Player {
  constructor() {
    this.x = 0; this.y = 0;
    this.w = CFG.PW; this.h = CFG.PH;
    this.vx = 0; this.vy = 0;
    this.grounded = false;
    this.groundPlat = null;
    this.facingRight = true;
    this.invTimer = 0;
    this.walkFrame = 0;
    this.alive = true;
  }

  reset(x, y) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.grounded = false; this.groundPlat = null;
    this.invTimer = 0; this.alive = true; this.walkFrame = 0;
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  takeDamage() {
    if (this.invTimer > 0) return false;
    this.invTimer = CFG.INVINCIBLE;
    return true;
  }

  isInv() { return this.invTimer > 0; }

  update(input, platforms, dt) {
    if (!this.alive) return;
    if (this.invTimer > 0) this.invTimer -= dt;

    const doJump = this.grounded && (
      input.pressed(' ') || input.pressed('Space') ||
      input.pressed('ArrowUp') || input.pressed('w') || input.pressed('W') ||
      input.pressed('ArrowUp')
    );

    const n = Math.max(1, Math.ceil(dt * 1.5));
    const sdt = dt / n;

    let jumped = false;

    for (let s = 0; s < n; s++) {
      if (!jumped && s === 0 && doJump) {
        this.vy = CFG.JUMP_VEL;
        this.grounded = false; this.groundPlat = null;
        jumped = true;
      }

      if (input.down('ArrowLeft') || input.down('a') || input.down('A')) {
        this.vx -= CFG.ACCEL * sdt;
        this.facingRight = false;
      }
      if (input.down('ArrowRight') || input.down('d') || input.down('D')) {
        this.vx += CFG.ACCEL * sdt;
        this.facingRight = true;
      }

      const f = this.grounded ? CFG.GROUND_FRIC : CFG.AIR_FRIC;
      this.vx *= Math.pow(f, sdt);
      if (Math.abs(this.vx) > CFG.MAX_SPEED) this.vx = Math.sign(this.vx) * CFG.MAX_SPEED;

      this.vy += CFG.GRAVITY * sdt;
      if (this.vy > CFG.MAX_FALL) this.vy = CFG.MAX_FALL;

      const prevY = this.y;
      this.y += this.vy * sdt;
      this.grounded = false;
      this.groundPlat = null;

      for (const p of platforms) {
        if (p.broken || !p.active) continue;
        const hOverlap = this.x < p.x + p.w && this.x + this.w > p.x;
        if (!hOverlap) continue;

        const prevBot = prevY + this.h;
        const nowBot = this.y + this.h;
        const nowTop = this.y;

        if (this.vy >= 0 && prevBot <= p.y + 0.5 && nowBot >= p.y - 0.5 && nowBot <= p.y + 60) {
          this.y = p.y - this.h;
          this.vy = 0;
          this.grounded = true;
          this.groundPlat = p;
        } else if (this.vy <= 0 && prevY >= p.y + p.h - 0.5 && nowTop <= p.y + p.h + 0.5) {
          this.y = p.y + p.h;
          this.vy = 0;
        }
      }

      const prevX = this.x;
      this.x += this.vx * sdt;

      for (const p of platforms) {
        if (p.broken || !p.active) continue;
        if (aabb(this, p)) {
          if (this.vx >= 0 && prevX + this.w <= p.x + 0.5) {
            this.x = p.x - this.w;
          } else if (this.vx <= 0 && prevX >= p.x + p.w - 0.5) {
            this.x = p.x + p.w;
          }
          this.vx = 0;
        }
      }
    }

    if (Math.abs(this.vx) > 0.2) this.walkFrame += dt;
    else this.walkFrame = 0;
  }

  draw(ctx) {
    if (!this.alive) return;
    if (this.isInv() && Math.floor(Date.now() / 80) % 2 === 0) return;

    const x = this.x, y = this.y, w = this.w, h = this.h;

    ctx.save();
    if (!this.facingRight) {
      ctx.translate(x + w, y);
      ctx.scale(-1, 1);
      ctx.translate(-x, -y);
    }

    // Treads
    ctx.fillStyle = '#2A2A2A';
    ctx.fillRect(x + 1, y + 22, 7, 8);
    ctx.fillRect(x + w - 8, y + 22, 7, 8);
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 1, y + 22, 7, 8);
    ctx.strokeRect(x + w - 8, y + 22, 7, 8);

    // Tread bars (animated)
    const treadOff = Math.floor(this.walkFrame * 0.25) % 5;
    ctx.fillStyle = '#555';
    for (let b = 0; b < 2; b++) {
      const bx1 = x + 3 + ((b * 3 + treadOff) % 5);
      ctx.fillRect(bx1, y + 24, 2, 4);
    }
    for (let b = 0; b < 2; b++) {
      const bx2 = x + w - 6 + ((b * 3 + treadOff) % 5);
      ctx.fillRect(bx2, y + 24, 2, 4);
    }

    // Arms
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 3, y + 14);
    ctx.lineTo(x - 1, y + 14);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 1, y + 14);
    ctx.lineTo(x - 3, y + 12);
    ctx.moveTo(x - 1, y + 14);
    ctx.lineTo(x - 3, y + 16);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + w - 3, y + 14);
    ctx.lineTo(x + w + 1, y + 14);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + w + 1, y + 14);
    ctx.lineTo(x + w + 3, y + 12);
    ctx.moveTo(x + w + 1, y + 14);
    ctx.lineTo(x + w + 3, y + 16);
    ctx.stroke();

    // Body
    ctx.fillStyle = '#4A4A4A';
    ctx.fillRect(x + 3, y + 8, w - 6, 14);

    // Rivets
    ctx.fillStyle = '#777';
    ctx.beginPath(); ctx.arc(x + 5, y + 10, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + w - 5, y + 10, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 5, y + 19, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + w - 5, y + 19, 1.5, 0, Math.PI * 2); ctx.fill();

    // Rust spots
    ctx.fillStyle = '#B7410E';
    ctx.fillRect(x + 7, y + 12, 3, 2);
    ctx.fillRect(x + 14, y + 16, 2, 3);

    // Neck
    ctx.fillStyle = '#4A4A4A';
    ctx.beginPath();
    ctx.arc(x + w / 2, y + 8, 3, 0, Math.PI * 2);
    ctx.fill();

    // Head
    ctx.fillStyle = '#555';
    ctx.fillRect(x + 5, y + 1, w - 10, 9);

    // Eye glow
    ctx.fillStyle = 'rgba(232, 184, 48, 0.25)';
    ctx.beginPath();
    ctx.arc(x + w / 2, y + 5, 7, 0, Math.PI * 2);
    ctx.fill();

    // Eye
    ctx.fillStyle = '#E8B830';
    ctx.fillRect(x + w / 2 - 3, y + 3, 6, 4);

    // Antenna
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1.5;
    const antWobble = Math.sin(this.walkFrame * 0.15) * 1.5;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + 1);
    ctx.lineTo(x + w / 2 + antWobble, y - 5);
    ctx.stroke();

    // Antenna tip (blinking)
    const tipOn = Math.floor(Date.now() / 300) % 2 === 0;
    ctx.fillStyle = tipOn ? '#E03030' : '#880000';
    ctx.beginPath();
    ctx.arc(x + w / 2 + antWobble, y - 5, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

// ============================================================
// BACKGROUND
// ============================================================
function drawBg(ctx, cx, W, H) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0F0A05');
  g.addColorStop(0.5, '#1A1510');
  g.addColorStop(1, '#221A10');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Layer 1 — Far car silhouettes (parallax 5%)
  ctx.fillStyle = '#181818';
  for (let i = 0; i < 10; i++) {
    const bx = ((i * 290 - cx * 0.05) % 2900 + 2900) % 2900 - 120;
    const by = H - 120 - Math.sin(i * 2.1) * 12 - (i % 3) * 8;
    ctx.fillRect(bx, by, 55, 18);
    ctx.fillRect(bx + 12, by - 11, 28, 11);
    ctx.fillStyle = '#131313';
    ctx.fillRect(bx + 15, by - 9, 10, 7);
    ctx.fillStyle = '#181818';
    ctx.fillRect(bx + 6, by + 14, 8, 6);
    ctx.fillRect(bx + 41, by + 14, 8, 6);
  }

  // Layer 2 — Midground tires & pipes (parallax 25%)
  ctx.fillStyle = '#262626';
  ctx.strokeStyle = '#262626';
  ctx.lineWidth = 3;
  for (let i = 0; i < 8; i++) {
    const bx = ((i * 360 + 60 - cx * 0.25) % 2880 + 2880) % 2880 - 150;
    const by = H - 70 - Math.sin(i * 1.3) * 18 - i * 4;
    if (i % 2 === 0) {
      ctx.beginPath(); ctx.arc(bx, by - 8, 11, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(bx, by + 2, 11, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(bx, by + 12, 11, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + 22, by - 28); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx + 8, by - 4); ctx.lineTo(bx + 30, by - 24); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx - 4, by + 4); ctx.lineTo(bx + 18, by - 32); ctx.stroke();
      ctx.lineWidth = 3;
    }
  }

  // Layer 3 — Foreground debris (parallax 50%)
  ctx.fillStyle = '#343434';
  ctx.strokeStyle = '#343434';
  ctx.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    const bx = ((i * 190 + 80 - cx * 0.5) % 2660 + 2660) % 2660 - 120;
    const by = H - 35 + Math.sin(i * 0.7) * 8;
    if (i % 3 === 0) {
      ctx.fillRect(bx, by - 16, 10, 18);
      ctx.fillStyle = '#282828';
      ctx.fillRect(bx, by - 11, 10, 2);
      ctx.fillRect(bx, by - 4, 10, 2);
      ctx.fillStyle = '#343434';
    } else if (i % 3 === 1) {
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + 10, by - 4);
      ctx.lineTo(bx + 14, by + 4);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx, by - 20);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bx, by - 20);
      ctx.lineTo(bx + 4, by - 22);
      ctx.stroke();
    }
  }
}

// ============================================================
// LEVEL GENERATOR
// ============================================================
class LevelGen {
  constructor(game) {
    this.g = game;
    this.chunks = 0;
    this.lastX = -CFG.CHUNK_W;
  }

  update(camX) {
    if (camX + CFG.W > this.lastX + CFG.CHUNK_W * 0.5) {
      this.gen(this.lastX + CFG.CHUNK_W);
    }
  }

  gen(startX) {
    this.lastX = startX;
    this.chunks++;
    const g = this.g;
    const first = this.chunks === 1;
    const d = g.difficulty;

    if (first) {
      const p1 = { x: startX + 30, y: 470, w: 280, h: CFG.PLAT_H, type: 'static', broken: false, active: true, state: 'solid', timer: 0, shakeOff: 0, respawnT: 0 };
      g.platforms.push(p1);
      const p2 = { x: startX + 370, y: 400, w: 130, h: CFG.PLAT_H, type: 'static', broken: false, active: true, state: 'solid', timer: 0, shakeOff: 0, respawnT: 0 };
      g.platforms.push(p2);
      const p3 = { x: startX + 550, y: 450, w: 120, h: CFG.PLAT_H, type: 'static', broken: false, active: true, state: 'solid', timer: 0, shakeOff: 0, respawnT: 0 };
      g.platforms.push(p3);
      for (let i = 0; i < 5; i++) {
        g.scraps.push({ x: startX + 50 + i * 35, y: 458, w: CFG.SW, h: CFG.SH, col: false, bob: i * 0.5 });
      }
      g.scraps.push({ x: startX + 390, y: 388, w: CFG.SW, h: CFG.SH, col: false, bob: 0 });
      g.scraps.push({ x: startX + 570, y: 438, w: CFG.SW, h: CFG.SH, col: false, bob: 1 });
      return;
    }

    const maxCount = 2 + (d < 2.5 ? (Math.random() < 0.5 ? 1 : 0) : 0);
    const held = [];
    const MIN_H_GAP = 30;
    const MAX_V_GAP = 80;
    const MIN_V_GAP = 20;
    const Y_RANGE_LOW = 250;
    const Y_RANGE_HIGH = 470;

    for (let i = 0; i < maxCount; i++) {
      let placed = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        let px, py, pw;
        if (i === 0) {
          px = startX + 40 + rand(0, CFG.CHUNK_W - 120);
          py = rand(410, 460);
          pw = 70 + rand(0, 80);
        } else {
          const prev = held[held.length - 1];
          const xMin = prev.x + prev.w + MIN_H_GAP;
          const xMax = startX + CFG.CHUNK_W - 50;
          if (xMin >= xMax) break;
          px = rand(xMin, xMax);
          pw = 60 + rand(0, 85);
          const yOpts = [];
          for (let yc = prev.y - MAX_V_GAP; yc <= prev.y + MAX_V_GAP; yc += 5) {
            if (yc < Y_RANGE_LOW || yc > Y_RANGE_HIGH) continue;
            if (Math.abs(yc - prev.y) < MIN_V_GAP) continue;
            yOpts.push(yc);
          }
          if (yOpts.length === 0) continue;
          py = yOpts[Math.floor(rand(0, yOpts.length))];
        }
        if (pw < 40) continue;

        const cand = { x: px, y: py, w: pw, h: CFG.PLAT_H };
        let overlap = false;
        for (const hp of held) {
          if (aabb(cand, hp)) { overlap = true; break; }
        }
        if (!overlap) {
          for (const ep of g.platforms) {
            if (ep.x + ep.w > startX - 40 && ep.x < startX + CFG.CHUNK_W + 40) {
              if (aabb(cand, ep)) { overlap = true; break; }
            }
          }
        }
        if (!overlap) {
          held.push(cand);
          placed = true;
          break;
        }
      }
    }

    if (held.length === 0) {
      held.push({ x: startX + 50, y: 440, w: 80, h: CFG.PLAT_H });
    }

    for (const p of held) {
      const crum = rand(0, 1) < 0.15 + d * 0.04;
      const fp = {
        x: p.x, y: p.y, w: p.w, h: CFG.PLAT_H,
        type: crum ? 'crumbling' : 'static',
        broken: false, active: true,
        state: 'solid', timer: 0, shakeOff: 0, respawnT: 0
      };
      g.platforms.push(fp);

      for (let s = 0; s < 1 + Math.floor(rand(0, 2)); s++) {
        g.scraps.push({
          x: p.x + rand(10, p.w - 10), y: p.y - CFG.SH - 2,
          w: CFG.SW, h: CFG.SH, col: false, bob: rand(0, Math.PI * 2)
        });
      }
    }

    const py = held.length > 0 ? held[held.length - 1].y : 440;

    if (this.chunks > 3 && rand(0, 1) < 0.1 + d * 0.04) {
      const dir = rand(0, 1) < 0.5 ? 1 : -1;
      g.conveyors.push({
        x: startX + rand(30, CFG.CHUNK_W - 100), y: clamp(py + rand(-50, 20), 250, 460),
        w: 90 + rand(0, 40), h: CFG.PLAT_H, dir: dir, speed: 2 + rand(0, 1), active: true
      });
    }

    if (this.chunks > 4 && rand(0, 1) < 0.1 + d * 0.05) {
      g.hazards.push({
        x: startX + rand(50, CFG.CHUNK_W - 80), y: 350, w: 50, h: 30,
        minY: 260, maxY: 440, speed: 1.5 + rand(0, 2), phase: rand(0, Math.PI * 2)
      });
    }

    if (this.chunks > 5 && rand(0, 1) < 0.1 + d * 0.03) {
      g.magnets.push({
        x: startX + rand(50, CFG.CHUNK_W - 120), y: 310 + rand(0, 80), w: 100, h: 80,
        active: true
      });
    }
  }

  reset() {
    this.chunks = 0;
    this.lastX = -CFG.CHUNK_W;
  }
}

// ============================================================
// UI
// ============================================================
function drawHeart(ctx, x, y, s, full) {
  ctx.fillStyle = full ? '#E03030' : '#444';
  ctx.beginPath();
  ctx.moveTo(x + s * 0.5, y + s * 0.85);
  ctx.bezierCurveTo(x, y + s * 0.4, x - s * 0.25, y, x + s * 0.5, y + s * 0.15);
  ctx.bezierCurveTo(x + s * 1.25, y, x + s, y + s * 0.4, x + s * 0.5, y + s * 0.85);
  ctx.fill();
}

function drawHUD(ctx, g) {
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, CFG.W, 36);
  ctx.fillStyle = '#B7410E';
  ctx.fillRect(0, 34, CFG.W, 2);

  ctx.fillStyle = '#E8B830';
  ctx.font = 'bold 15px monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText('SCRAP: ' + g.score, 14, 18);

  ctx.textAlign = 'center';
  ctx.fillText('DIST: ' + Math.floor(g.dist) + 'm', CFG.W / 2, 18);
  ctx.textAlign = 'left';

  for (let i = 0; i < 3; i++) {
    drawHeart(ctx, CFG.W - 75 - i * 24, 8, 16, i < g.lives);
  }
}

function drawMenu(ctx, g) {
  drawBg(ctx, 0, CFG.W, CFG.H);
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(0, 0, CFG.W, CFG.H);

  ctx.save();
  ctx.textAlign = 'center';

  ctx.shadowColor = '#B7410E';
  ctx.shadowBlur = 25;
  ctx.fillStyle = '#C85A1A';
  ctx.font = 'bold 56px monospace';
  ctx.fillText('JUNKYARD RUNNER', CFG.W / 2, 150);
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#9E9E9E';
  ctx.font = '13px monospace';
  ctx.fillText('SURVIVE THE COLLAPSE — COLLECT SCRAP — ESCAPE', CFG.W / 2, 190);

  if (g.highScore > 0) {
    ctx.fillStyle = '#E8B830';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('HIGH SCORE: ' + g.highScore, CFG.W / 2, 235);
  }

  if (Math.floor(Date.now() / 500) % 2 === 0) {
    ctx.fillStyle = '#E8B830';
    ctx.font = 'bold 22px monospace';
    ctx.fillText('PRESS ENTER TO START', CFG.W / 2, 310);
  }

  ctx.fillStyle = '#888';
  ctx.font = '13px monospace';
  ctx.fillText('ARROWS / WASD — Move     SPACE / UP — Jump', CFG.W / 2, 375);
  ctx.fillText('Collect scrap. Avoid crushers. Dont fall behind.', CFG.W / 2, 395);
  ctx.fillText('Reach the end of the junkyard to escape!', CFG.W / 2, 415);

  ctx.restore();
}

function drawDeath(ctx, g) {
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(0, 0, CFG.W, CFG.H);

  ctx.save();
  ctx.textAlign = 'center';

  ctx.fillStyle = '#C85A1A';
  ctx.font = 'bold 44px monospace';
  ctx.shadowColor = '#B7410E';
  ctx.shadowBlur = 15;
  ctx.fillText('JUNKYARD CLAIMED ANOTHER', CFG.W / 2, 180);
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#E8B830';
  ctx.font = 'bold 28px monospace';
  ctx.fillText('SCORE: ' + g.score, CFG.W / 2, 250);

  if (g.score >= g.highScore && g.score > 0) {
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 20px monospace';
    ctx.fillText('★ NEW HIGH SCORE! ★', CFG.W / 2, 285);
  } else if (g.highScore > 0) {
    ctx.fillStyle = '#999';
    ctx.font = '16px monospace';
    ctx.fillText('HIGH SCORE: ' + g.highScore, CFG.W / 2, 285);
  }

  ctx.fillStyle = '#AAA';
  ctx.font = '14px monospace';
  ctx.fillText('SCRAP: ' + g.totalScrap, CFG.W / 2, 325);
  ctx.fillText('DISTANCE: ' + Math.floor(g.dist) + 'm', CFG.W / 2, 345);

  if (Math.floor(Date.now() / 500) % 2 === 0) {
    ctx.fillStyle = '#E8B830';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('R — RESTART     ENTER — MENU', CFG.W / 2, 420);
  }

  ctx.restore();
}

// ============================================================
// GAME
// ============================================================
class Game {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = CFG.W;
    this.canvas.height = CFG.H;

    this.state = 'MENU';
    this.input = new Input();
    this.camera = new Camera();
    this.player = new Player();
    this.level = new LevelGen(this);

    this.platforms = [];
    this.hazards = [];
    this.scraps = [];
    this.magnets = [];
    this.conveyors = [];
    this.floatTexts = [];

    this.score = 0;
    this.highScore = parseInt(localStorage.getItem('jr_highscore') || '0', 10);
    this.totalScrap = 0;
    this.dist = 0;
    this.lives = 3;
    this.difficulty = 1;
    this.gameTime = 0;
    this.diffTimer = 0;

    this.safeX = 0; this.safeY = 0; this.safePlat = null;

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.canvas.addEventListener('click', () => this.canvas.focus());

    requestAnimationFrame((t) => this.loop(t));
  }

  resize() {
    const s = Math.min(window.innerWidth / CFG.W, window.innerHeight / CFG.H);
    this.canvas.style.width = Math.floor(CFG.W * s) + 'px';
    this.canvas.style.height = Math.floor(CFG.H * s) + 'px';
  }

  start() {
    this.platforms = []; this.hazards = []; this.scraps = [];
    this.magnets = []; this.conveyors = []; this.floatTexts = [];
    this.score = 0; this.totalScrap = 0; this.dist = 0;
    this.lives = 3; this.difficulty = 1; this.gameTime = 0; this.diffTimer = 0;

    this.level.reset();
    this.camera = new Camera();
    this.camera.scrollSpeed = CFG.SCROLL_BASE;
    this.level.gen(0);

    const fp = this.platforms[0];
    if (fp) {
      this.player.reset(fp.x + fp.w / 2 - CFG.PW / 2, fp.y - CFG.PH);
      this.safeX = this.player.x; this.safeY = this.player.y;
      this.safePlat = fp;
    }

    this.state = 'PLAYING';
  }

  activePlats() {
    const r = [];
    for (const p of this.platforms) {
      if (!p.broken && p.active) r.push(p);
    }
    for (const c of this.conveyors) {
      if (c.active) { c.type = 'conveyor'; r.push(c); }
    }
    return r;
  }

  update(dt) {
    if (this.state === 'PLAYING') this.updateGame(dt);
  }

  updateGame(dt) {
    this.gameTime += dt;
    this.diffTimer += dt / 60;

    if (this.diffTimer >= 20) {
      this.diffTimer -= 20;
      this.difficulty = Math.min(CFG.MAX_DIFF, this.difficulty + CFG.DIFF_STEP);
      this.camera.scrollSpeed = CFG.SCROLL_BASE + (this.difficulty - 1) * 0.5;
    }

    const ap = this.activePlats();
    this.player.update(this.input, ap, dt);

    this.camera.targetX += this.camera.scrollSpeed * dt;
    this.camera.update(this.player, dt);

    this.dist += this.camera.scrollSpeed * dt * 0.1;

    this.level.update(this.camera.x);

    if (this.player.grounded && this.player.groundPlat) {
      const gp = this.player.groundPlat;
      if (gp.type !== 'conveyor' && (gp.type !== 'crumbling' || gp.state === 'solid')) {
        this.safeX = this.player.x;
        this.safeY = this.player.y;
        this.safePlat = gp;
      }
    }

    for (const p of this.platforms) {
      if (p.type === 'crumbling') this.tickCrumble(p);
    }

    for (const c of this.conveyors) {
      if (c.active && (this.player.groundPlat === c || aabb(this.player, c))) {
        this.player.vx += c.dir * c.speed * 0.05 * dt;
      }
    }

    for (const h of this.hazards) {
      const t = this.gameTime * 0.02 + h.phase;
      h.y = clamp(h.minY + (Math.sin(t) + 1) * 0.5 * (h.maxY - h.minY), h.minY, h.maxY);
    }

    for (const s of this.scraps) {
      if (s.col) continue;
      s.drawY = s.y + Math.sin(this.gameTime * 0.05 + s.bob) * 2;

      if (aabb(this.player, { x: s.x, y: s.drawY, w: CFG.SW, h: CFG.SH })) {
        s.col = true;
        this.score += 10;
        this.totalScrap++;
        this.floatTexts.push({ x: s.x, y: s.drawY - 5, text: '+10', alpha: 1, vy: -1.5 });
      }

      for (const m of this.magnets) {
        if (!m.active) continue;
        const mx = m.x + m.w / 2;
        const my = m.y + m.h / 2;
        const dx = mx - (s.x + s.w / 2);
        const dy = my - (s.drawY || s.y) - s.h / 2;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 160 && dist > 4) {
          const force = 1.8;
          s.x += (dx / dist) * force;
          s.y += (dy / dist) * force;
        }
      }
    }

    const deadBy = (msg) => {
      if (this.player.takeDamage()) {
        this.lives--;
        this.camera.shake();
        this.respawn();
        if (this.lives <= 0) {
          this.state = 'DEAD';
          this.player.alive = false;
          if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('jr_highscore', String(this.highScore));
          }
        }
      }
    };

    for (const h of this.hazards) {
      if (aabb(this.player, h)) { deadBy('crusher'); break; }
    }

    if (this.player.y > CFG.H + 100) {
      if (this.player.invTimer > 0) {
        this.respawn();
      } else {
        deadBy('fall');
      }
    }

    if (this.player.x < this.camera.x - CFG.LEFT_DEATH - 10) {
      deadBy('behind');
    }

    this.floatTexts = this.floatTexts.filter(t => {
      t.y += t.vy * dt;
      t.alpha -= 0.018 * dt;
      return t.alpha > 0;
    });

    const pruneX = this.camera.x - CFG.CHUNK_W * 1.5;
    this.platforms = this.platforms.filter(p => p.x + p.w > pruneX);
    this.hazards = this.hazards.filter(h => h.x + h.w > pruneX);
    this.scraps = this.scraps.filter(s => s.x > pruneX && !s.col);
    this.conveyors = this.conveyors.filter(c => c.x + c.w > pruneX);
    this.magnets = this.magnets.filter(m => m.x + m.w > pruneX);
  }

  tickCrumble(p) {
    if (p.broken) {
      p.respawnT--;
      if (p.respawnT <= 0) {
        p.broken = false; p.active = true;
        p.state = 'solid'; p.timer = 0; p.shakeOff = 0;
      }
      return;
    }

    const onIt = this.player.groundPlat === p && this.player.grounded;

    if (p.state === 'solid' && onIt) {
      p.state = 'activated';
      p.timer = CFG.CRUMBLE_DELAY;
    }

    if (p.state === 'activated') {
      p.timer -= onIt ? 1 : 0.5;
      if (p.timer <= 0) {
        p.state = 'shaking';
        p.timer = CFG.CRUMBLE_SHAKE;
      }
    }

    if (p.state === 'shaking') {
      p.shakeOff = (Math.random() - 0.5) * 4;
      p.timer--;
      if (p.timer <= 0) {
        p.broken = true; p.active = false;
        p.shakeOff = 0;
        p.respawnT = CFG.CRUMBLE_RESPAWN;
      }
    }
  }

  respawn() {
    const sp = this.safePlat;
    if (sp && !sp.broken && sp.active && sp.x + sp.w > this.camera.x - 50) {
      this.player.x = sp.x + sp.w / 2 - CFG.PW / 2;
      this.player.y = sp.y - CFG.PH;
    } else {
      const fb = this.platforms.find(p => !p.broken && p.active && p.x + p.w > this.camera.x);
      if (fb) {
        this.player.x = fb.x + fb.w / 2 - CFG.PW / 2;
        this.player.y = fb.y - CFG.PH;
      } else {
        this.player.y = CFG.H - 150;
        this.player.x = this.camera.x + 100;
      }
    }
    this.player.vx = 0; this.player.vy = 0;
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CFG.W, CFG.H);

    if (this.state === 'MENU') {
      drawMenu(ctx, this);
    } else {
      this.renderGame(ctx);
    }

    this.input.clearFrame();
  }

  renderGame(ctx) {
    const cx = this.camera.x;
    const sx = this.camera.x + this.camera.shakeX;
    const sy = this.camera.shakeY;

    drawBg(ctx, cx, CFG.W, CFG.H);

    ctx.save();
    ctx.translate(-sx, -sy);

    for (const p of this.platforms) {
      const ox = p.shakeOff || 0;
      if (ox) ctx.translate(ox, 0);

      ctx.fillStyle = p.broken ? '#444' : (p.type === 'crumbling' ? '#B55A1A' : '#B7410E');
      ctx.fillRect(p.x, p.y, p.w, p.h);

      if (!p.broken) {
        ctx.fillStyle = '#D06A2A';
        ctx.fillRect(p.x, p.y, p.w, 3);
        ctx.fillStyle = '#7B2A0A';
        ctx.fillRect(p.x, p.y + p.h - 3, p.w, 3);

        for (let b = 0; b < Math.ceil(p.w / 35); b++) {
          ctx.fillStyle = '#6B2A0A';
          ctx.beginPath();
          ctx.arc(p.x + 8 + b * 35, p.y + 8, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }

        if (p.state === 'activated') {
          const a = 0.15 + Math.sin(Date.now() * 0.01) * 0.08;
          ctx.fillStyle = `rgba(255, 200, 50, ${a})`;
          for (let c = 0; c < 4; c++) {
            const cx2 = p.x + rand(5, p.w - 5);
            const cy2 = p.y + rand(2, p.h - 3);
            ctx.beginPath();
            ctx.moveTo(cx2, cy2); ctx.lineTo(cx2 + 3, cy2 - 5);
            ctx.lineTo(cx2 + 6, cy2); ctx.closePath();
            ctx.fill();
          }
        }
      }

      if (ox) ctx.translate(-ox, 0);
    }

    for (const c of this.conveyors) {
      ctx.fillStyle = '#4A4A4A';
      ctx.fillRect(c.x, c.y, c.w, c.h);
      ctx.fillStyle = '#6B6B6B';
      ctx.fillRect(c.x, c.y, c.w, 3);
      ctx.fillStyle = '#2A2A2A';
      ctx.fillRect(c.x, c.y + c.h - 3, c.w, 3);
      ctx.fillStyle = '#333';
      ctx.fillRect(c.x, c.y - 3, 7, c.h + 6);
      ctx.fillRect(c.x + c.w - 7, c.y - 3, 7, c.h + 6);

      ctx.fillStyle = '#E8B830';
      for (let a = -1; a <= 1; a++) {
        const ax = c.x + c.w / 2 + a * 22 * c.dir;
        const ay = c.y + c.h / 2;
        ctx.beginPath();
        ctx.moveTo(ax + (c.dir > 0 ? 0 : 9), ay - 5);
        ctx.lineTo(ax + (c.dir > 0 ? 9 : 0), ay);
        ctx.lineTo(ax + (c.dir > 0 ? 0 : 9), ay + 5);
        ctx.fill();
      }
    }

    for (const h of this.hazards) {
      ctx.fillStyle = '#4A4A4A';
      ctx.fillRect(h.x, h.y, h.w, h.h);
      ctx.fillStyle = '#333';
      ctx.fillRect(h.x + 3, h.y + 3, h.w - 6, h.h - 6);

      for (let i = 0; i < Math.ceil(h.w / 20); i++) {
        ctx.fillStyle = i % 2 === 0 ? '#E8B830' : '#1A1A1A';
        ctx.fillRect(h.x + i * 20, h.y + h.h - 8, 10, 8);
      }

      ctx.fillStyle = '#777';
      ctx.fillRect(h.x + h.w / 2 - 2, h.y - 10, 4, 10);
    }

    for (const s of this.scraps) {
      if (s.col) continue;
      const dy = s.drawY !== undefined ? s.drawY : s.y;

      ctx.fillStyle = 'rgba(212, 160, 23, 0.12)';
      ctx.beginPath();
      ctx.arc(s.x + s.w / 2, dy + s.h / 2, 9, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#D4A017';
      ctx.beginPath();
      ctx.moveTo(s.x + 1, dy + s.h - 1);
      ctx.lineTo(s.x + s.w / 2, dy + 1);
      ctx.lineTo(s.x + s.w - 1, dy + s.h - 1);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#F0D060';
      ctx.beginPath();
      ctx.moveTo(s.x + 3, dy + s.h - 3);
      ctx.lineTo(s.x + s.w / 2, dy + 3);
      ctx.lineTo(s.x + s.w - 3, dy + s.h - 3);
      ctx.closePath();
      ctx.fill();
    }

    for (const m of this.magnets) {
      if (!m.active) continue;
      ctx.fillStyle = 'rgba(183, 65, 14, 0.06)';
      ctx.beginPath();
      ctx.arc(m.x + m.w / 2, m.y + m.h / 2, 160, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(183, 65, 14, 0.18)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(m.x + m.w / 2, m.y + m.h / 2, 160, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#8B4513';
      ctx.fillRect(m.x, m.y, m.w, m.h);
      ctx.fillStyle = '#B7410E';
      ctx.fillRect(m.x, m.y, m.w, 4);
      ctx.fillRect(m.x, m.y + m.h - 4, m.w, 4);
      ctx.fillStyle = '#E8B830';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('MAGNET', m.x + m.w / 2, m.y + m.h / 2 + 4);
    }

    for (const t of this.floatTexts) {
      ctx.fillStyle = `rgba(232, 184, 48, ${t.alpha})`;
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(t.text, t.x, t.y);
    }

    this.player.draw(ctx);
    ctx.restore();

    drawHUD(ctx, this);

    if (this.state === 'DEAD') drawDeath(ctx, this);
  }

  handleInput() {
    if (this.state === 'MENU' && this.input.pressed('Enter')) {
      this.start();
    } else if (this.state === 'PLAYING' && (this.input.pressed('r') || this.input.pressed('R'))) {
      this.start();
    } else if (this.state === 'DEAD') {
      if (this.input.pressed('r') || this.input.pressed('R')) this.start();
      if (this.input.pressed('Enter')) this.state = 'MENU';
    }
  }

  loop(ts) {
    if (!this.lastTime) this.lastTime = ts;
    const dt = Math.min((ts - this.lastTime) / 16.667, 3);
    this.lastTime = ts;

    this.handleInput();
    this.update(dt);
    this.render();

    requestAnimationFrame((t) => this.loop(t));
  }
}

// ============================================================
// BOOT
// ============================================================
window.addEventListener('DOMContentLoaded', () => { new Game(); });
