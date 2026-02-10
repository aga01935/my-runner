/**
 * ARCTIC APEX - RE-BALANCED VERSION
 * Buffed Player Health & Damage | Nerfed Early Bears
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- GAME CONFIGURATION (POWER BUFFED) ---
const CONFIG = {
    playerSpeed: 5.5,
    playerDmg: 35,          // Increased from 20
    playerHp: 200,          // Doubled from 100
    playerAttackCooldown: 20, 
    meatCap: 12,
    machineSpeed: 50, 
    machineValue: 15, 
    drag: 0.82
};

const state = {
    screen: 'start',
    money: 0,
    meat: 0,
    meatStored: 0,
    stage: 1,
    maxStages: 5,
    bearsKilled: 0,
    bearsToNextStage: 5,
    keys: {},
    mouse: { x: 0, y: 0, down: false },
    touch: { active: false, identifier: null, startX: 0, startY: 0, currX: 0, currY: 0, dx: 0, dy: 0, attacking: false },
    particles: [],
    drops: [],
    enemies: [],
    texts: [],
    cam: { x: 0, y: 0 },
    shake: 0 // Screen shake intensity
};

class Player {
    constructor() {
        this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
        this.radius = 18; this.angle = 0;
        this.hp = CONFIG.playerHp; this.maxHp = CONFIG.playerHp;
        this.cooldown = 0; this.attacking = 0;
    }

    update() {
        let inputX = 0, inputY = 0;
        if (state.keys['KeyW'] || state.keys['ArrowUp']) inputY = -1;
        if (state.keys['KeyS'] || state.keys['ArrowDown']) inputY = 1;
        if (state.keys['KeyA'] || state.keys['ArrowLeft']) inputX = -1;
        if (state.keys['KeyD'] || state.keys['ArrowRight']) inputX = 1;

        if (state.touch.active) { inputX = state.touch.dx; inputY = state.touch.dy; }

        if (!state.touch.active && (inputX !== 0 || inputY !== 0)) {
            const len = Math.hypot(inputX, inputY);
            inputX /= len; inputY /= len;
        }

        this.vx += inputX * CONFIG.playerSpeed * 0.25;
        this.vy += inputY * CONFIG.playerSpeed * 0.25;
        this.x += this.vx; this.y += this.vy;
        this.vx *= CONFIG.drag; this.vy *= CONFIG.drag;

        if (Math.hypot(this.vx, this.vy) > 0.2) this.angle = Math.atan2(this.vy, this.vx);

        if (this.cooldown > 0) this.cooldown--;
        if (this.attacking > 0) this.attacking--;

        if ((state.keys['Space'] || state.mouse.down || state.touch.attacking) && this.cooldown <= 0) {
            this.performAttack();
            state.touch.attacking = false;
        }
    }

    performAttack() {
        this.cooldown = CONFIG.playerAttackCooldown;
        this.attacking = 10;
        const hitX = this.x + Math.cos(this.angle) * 50;
        const hitY = this.y + Math.sin(this.angle) * 50;

        state.enemies.forEach(e => {
            const dist = Math.hypot(e.x - hitX, e.y - hitY);
            if (dist < 70) {
                e.takeDamage(CONFIG.playerDmg);
                state.shake = 5; // Shake screen on hit
                spawnFloatingText(Math.floor(CONFIG.playerDmg), e.x, e.y, '#f1c40f');
                createBlood(e.x, e.y);
            }
        });
    }

    draw() {
        ctx.save();
        ctx.translate(this.x - state.cam.x, this.y - state.cam.y);
        ctx.rotate(this.angle);
        ctx.fillStyle = '#2c3e50';
        ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#95a5a6'; ctx.lineWidth = 3; ctx.stroke();
        ctx.fillStyle = '#bdc3c7'; ctx.fillRect(15, -3, 45, 6);
        ctx.restore();
    }
}

class Enemy {
    constructor(tier) {
        const side = Math.random() > 0.5;
        this.x = player.x + (side ? 500 : -500);
        this.y = player.y + (side ? 500 : -500);
        const scale = 1 + (tier * 0.2);
        this.radius = 22 * scale;
        this.hp = 60 * scale; // Reduced from 100+ effectively
        this.maxHp = this.hp;
        this.speed = 1.0 + (tier * 0.2);
        this.dmg = 5 + (tier * 2); // Player can tank more now
        this.attackTimer = 0;
        this.flash = 0;
    }

    update() {
        const dx = player.x - this.x, dy = player.y - this.y;
        const dist = Math.hypot(dx, dy);
        if (this.flash > 0) this.flash--;
        if (this.attackTimer > 0) this.attackTimer--;

        if (dist > this.radius + 10) {
            const angle = Math.atan2(dy, dx);
            this.x += Math.cos(angle) * this.speed;
            this.y += Math.sin(angle) * this.speed;
        } else if (this.attackTimer <= 0) {
            player.hp -= this.dmg;
            this.attackTimer = 60;
            updateUI();
            if (player.hp <= 0) gameOver();
        }
    }

    takeDamage(amt) {
        this.hp -= amt;
        this.flash = 5; 
        if (this.hp <= 0) this.die();
    }

    die() {
        state.enemies = state.enemies.filter(e => e !== this);
        state.bearsKilled++;
        for(let i=0; i<4; i++) state.drops.push(new Drop(this.x, this.y));
        checkStageProgress();
    }

    draw() {
        const sx = this.x - state.cam.x, sy = this.y - state.cam.y;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(Math.atan2(player.y - this.y, player.x - this.x));
        ctx.fillStyle = this.flash > 0 ? 'red' : 'white';
        ctx.beginPath(); ctx.ellipse(0, 0, this.radius * 1.3, this.radius, 0, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(this.radius, 0, this.radius*0.7, 0, Math.PI*2); ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#333'; ctx.fillRect(sx - 20, sy - 35, 40, 4);
        ctx.fillStyle = '#2ecc71'; ctx.fillRect(sx - 20, sy - 35, 40 * (this.hp/this.maxHp), 4);
    }
}

class Drop {
    constructor(x, y) { this.x = x; this.y = y; this.life = 600; }
    update() {
        this.life--;
        const d = Math.hypot(player.x - this.x, player.y - this.y);
        if (d < 30 && state.meat < CONFIG.meatCap) { state.meat++; updateUI(); return true; }
        if (d < 150) { this.x += (player.x - this.x) * 0.15; this.y += (player.y - this.y) * 0.15; }
        return this.life <= 0;
    }
    draw() {
        const sx = this.x - state.cam.x, sy = this.y - state.cam.y;
        ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.arc(sx, sy, 6, 0, Math.PI*2); ctx.fill();
    }
}

class Machine {
    constructor() { this.x = 0; this.y = 0; this.timer = 0; }
    update() {
        if (Math.hypot(player.x - this.x, player.y - this.y) < 100 && state.meat > 0) {
            state.meatStored += state.meat; state.meat = 0; updateUI();
        }
        if (state.meatStored > 0) {
            this.timer++;
            if (this.timer >= CONFIG.machineSpeed) {
                this.timer = 0; state.meatStored--; state.money += CONFIG.machineValue; updateUI();
            }
        }
    }
    draw() {
        const sx = this.x - state.cam.x, sy = this.y - state.cam.y;
        ctx.fillStyle = '#34495e'; ctx.fillRect(sx-50, sy-50, 100, 100);
        ctx.fillStyle = state.meatStored > 0 ? '#f1c40f' : '#7f8c8d';
        ctx.beginPath(); ctx.arc(sx, sy, 15, 0, Math.PI*2); ctx.fill();
    }
}

let player = new Player();
let machine = new Machine();

function init() {
    window.addEventListener('resize', () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; });
    window.dispatchEvent(new Event('resize'));
    window.addEventListener('keydown', e => state.keys[e.code] = true);
    window.addEventListener('keyup', e => state.keys[e.code] = false);

    const tL = document.getElementById('mobileControls');
    tL.addEventListener('touchstart', e => {
        e.preventDefault();
        for (let t of e.changedTouches) {
            if (t.clientX < window.innerWidth / 2) {
                state.touch.active = true; state.touch.identifier = t.identifier;
                state.touch.startX = t.clientX; state.touch.startY = t.clientY;
            } else { state.touch.attacking = true; }
        }
    }, {passive: false});

    tL.addEventListener('touchmove', e => {
        for (let t of e.changedTouches) {
            if (t.identifier === state.touch.identifier) {
                state.touch.currX = t.clientX; state.touch.currY = t.clientY;
                const dx = state.touch.currX - state.touch.startX, dy = state.touch.currY - state.touch.startY;
                const dist = Math.hypot(dx, dy), angle = Math.atan2(dy, dx);
                const force = Math.min(dist, 50) / 50;
                state.touch.dx = Math.cos(angle) * force; state.touch.dy = Math.sin(angle) * force;
            }
        }
    });

    tL.addEventListener('touchend', e => {
        for (let t of e.changedTouches) {
            if (t.identifier === state.touch.identifier) { state.touch.active = false; state.touch.dx = 0; state.touch.dy = 0; }
            else if (t.clientX >= window.innerWidth / 2) { state.touch.attacking = false; }
        }
    });

    document.getElementById('startBtn').onclick = () => { state.screen = 'game'; document.getElementById('startScreen').classList.remove('active'); spawnEnemies(); };
    document.getElementById('upgradeBtn').onclick = toggleUpgradeMenu;
    document.getElementById('closeUpgradeBtn').onclick = toggleUpgradeMenu;
    document.getElementById('restartBtn').onclick = () => location.reload();
    document.getElementById('restartWinBtn').onclick = () => location.reload();

    setupUpgrades();
    loop();
}

function spawnEnemies() { for(let i=0; i<2 + state.stage; i++) state.enemies.push(new Enemy(state.stage)); }

function checkStageProgress() {
    if (state.bearsKilled >= state.bearsToNextStage) {
        state.stage++; state.bearsKilled = 0; state.bearsToNextStage += 2;
        if (state.stage > state.maxStages) { state.screen = 'win'; document.getElementById('winScreen').classList.add('active'); }
        else { spawnFloatingText("STAGE COMPLETE", player.x, player.y - 50, 'cyan'); spawnEnemies(); updateUI(); }
    } else if (state.enemies.length === 0) spawnEnemies();
}

function updateUI() {
    document.getElementById('moneyDisplay').innerText = state.money;
    document.getElementById('meatDisplay').innerText = state.meat;
    document.getElementById('meatCapDisplay').innerText = CONFIG.meatCap;
    document.getElementById('stageDisplay').innerText = state.stage;
    document.getElementById('healthBarFill').style.width = (player.hp / player.maxHp * 100) + '%';
}

function gameOver() { state.screen = 'gameover'; document.getElementById('gameOverScreen').classList.add('active'); }

function loop() {
    if (state.screen === 'game') {
        player.update();
        machine.update();
        state.enemies.forEach(e => e.update());
        state.drops = state.drops.filter(d => !d.update());
        state.particles = state.particles.filter(p => { p.x += p.vx; p.y += p.vy; p.life--; return p.life > 0; });
        state.texts = state.texts.filter(t => { t.y -= 0.5; t.life--; return t.life > 0; });
        
        state.cam.x += (player.x - canvas.width / 2 - state.cam.x) * 0.1;
        state.cam.y += (player.y - canvas.height / 2 - state.cam.y) * 0.1;
        if (state.shake > 0) { state.cam.x += (Math.random()-0.5)*state.shake; state.cam.y += (Math.random()-0.5)*state.shake; state.shake *= 0.9; }
    }

    ctx.fillStyle = '#0b1016'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    machine.draw();
    state.drops.forEach(d => d.draw());
    state.enemies.forEach(e => e.draw());
    player.draw();

    if (state.touch.active) {
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.arc(state.touch.startX, state.touch.startY, 50, 0, Math.PI*2); ctx.stroke();
    }

    state.particles.forEach(p => { ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x - state.cam.x, p.y - state.cam.y, p.size, 0, Math.PI*2); ctx.fill(); });
    state.texts.forEach(t => { ctx.fillStyle = t.color; ctx.font = 'bold 20px Arial'; ctx.fillText(t.text, t.x - state.cam.x, t.y - state.cam.y); });

    requestAnimationFrame(loop);
}

function createParticle(x, y, color, size) { for(let i=0; i<5; i++) state.particles.push({x, y, color, size, vx:(Math.random()-0.5)*5, vy:(Math.random()-0.5)*5, life:20}); }
function createBlood(x, y) { createParticle(x, y, '#e74c3c', 3); }
function spawnFloatingText(text, x, y, color) { state.texts.push({text, x, y, color, life:60}); }
function toggleUpgradeMenu() { 
    const m = document.getElementById('upgradeMenu');
    if (state.screen === 'game') { state.screen = 'upgrade'; m.classList.add('active'); }
    else if (state.screen === 'upgrade') { state.screen = 'game'; m.classList.remove('active'); }
}

function setupUpgrades() {
    const upgs = {
        upgDmg: { cost: 100, run: () => CONFIG.playerDmg += 15 },
        upgHp: { cost: 100, run: () => { CONFIG.playerHp += 50; player.maxHp += 50; player.hp += 50; } },
        upgSpd: { cost: 150, run: () => CONFIG.playerSpeed += 0.5 },
        upgCap: { cost: 200, run: () => CONFIG.meatCap += 5 },
        upgMach: { cost: 300, run: () => CONFIG.machineValue += 10 }
    };
    Object.keys(upgs).forEach(id => {
        const btn = document.getElementById(id).querySelector('button');
        btn.onclick = () => {
            const u = upgs[id];
            if (state.money >= u.cost) {
                state.money -= u.cost; u.run(); u.cost = Math.floor(u.cost * 1.5);
                btn.innerText = u.cost + "g"; updateUI();
            }
        };
    });
}

init();
