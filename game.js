/**
 * ARCTIC APEX: COMPLETE SOURCE
 */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const CONFIG = {
    playerSpeed: 5.5,
    playerDmg: 40,
    playerHp: 200,
    playerAttackCooldown: 20,
    meatCap: 10,
    machineSpeed: 40,
    machineValue: 15,
    drag: 0.82,
    huntBoundary: 600 // Safe zone is X < 600
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
    touch: { active: false, x: 0, y: 0, startX: 0, startY: 0, dx: 0, dy: 0, attacking: false },
    particles: [],
    drops: [],
    enemies: [],
    texts: [],
    cam: { x: 0, y: 0 },
    shake: 0,
    machineAngle: 0,
    slices: []
};

// --- ANIMATION HELPERS ---
const drawWarrior = (x, y, angle, walking, attacking) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    
    // Legs animation
    const legMove = walking ? Math.sin(Date.now() * 0.01) * 10 : 0;
    ctx.fillStyle = '#2f3542';
    ctx.fillRect(-8, -15 + legMove, 6, 12);
    ctx.fillRect(-8, 3 - legMove, 6, 12);

    // Body
    ctx.fillStyle = '#57606f';
    ctx.beginPath();
    ctx.ellipse(0, 0, 15, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2f3542';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Spear
    const attackReach = attacking ? Math.sin(attacking * 0.3) * 30 : 0;
    ctx.fillStyle = '#dfe4ea';
    ctx.fillRect(10 + attackReach, -2, 40, 4);
    ctx.fillStyle = '#a4b0be';
    ctx.beginPath();
    ctx.moveTo(50 + attackReach, -6);
    ctx.lineTo(65 + attackReach, 0);
    ctx.lineTo(50 + attackReach, 6);
    ctx.fill();

    // Head
    ctx.fillStyle = '#ffdbac';
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
};

const drawBear = (x, y, angle, flash, scale) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(scale, scale);

    const bodyColor = flash > 0 ? '#ff4757' : '#ffffff';
    
    // Legs
    const walk = Math.sin(Date.now() * 0.005) * 5;
    ctx.fillStyle = bodyColor;
    ctx.fillRect(-25, -20 + walk, 12, 10);
    ctx.fillRect(10, -20 - walk, 12, 10);
    ctx.fillRect(-25, 10 - walk, 12, 10);
    ctx.fillRect(10, 10 + walk, 12, 10);

    // Huge Body
    ctx.beginPath();
    ctx.ellipse(0, 0, 35, 25, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Neck/Head
    ctx.beginPath();
    ctx.ellipse(35, 0, 18, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Ears
    ctx.beginPath();
    ctx.arc(30, -12, 5, 0, Math.PI * 2);
    ctx.arc(30, 12, 5, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#2f3542';
    ctx.beginPath();
    ctx.arc(45, -5, 2, 0, Math.PI * 2);
    ctx.arc(45, 5, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
};

// --- CLASSES ---

class Player {
    constructor() {
        this.x = 200; this.y = 300; this.vx = 0; this.vy = 0;
        this.hp = CONFIG.playerHp; this.maxHp = CONFIG.playerHp;
        this.angle = 0; this.cooldown = 0; this.attacking = 0;
        this.isWalking = false;
    }

    update() {
        let ix = 0, iy = 0;
        if (state.keys['KeyW'] || state.keys['ArrowUp']) iy = -1;
        if (state.keys['KeyS'] || state.keys['ArrowDown']) iy = 1;
        if (state.keys['KeyA'] || state.keys['ArrowLeft']) ix = -1;
        if (state.keys['KeyD'] || state.keys['ArrowRight']) ix = 1;

        if (state.touch.active) { ix = state.touch.dx; iy = state.touch.dy; }

        this.isWalking = Math.hypot(ix, iy) > 0.1;
        if (this.isWalking) {
            const mag = Math.hypot(ix, iy);
            this.vx += (ix / mag) * CONFIG.playerSpeed * 0.2;
            this.vy += (iy / mag) * CONFIG.playerSpeed * 0.2;
            this.angle = Math.atan2(iy, ix);
        }

        this.x += this.vx; this.y += this.vy;
        this.vx *= CONFIG.drag; this.vy *= CONFIG.drag;

        if (this.cooldown > 0) this.cooldown--;
        if (this.attacking > 0) this.attacking--;

        if ((state.keys['Space'] || state.touch.attacking) && this.cooldown <= 0) {
            this.attack();
        }
    }

    attack() {
        this.cooldown = CONFIG.playerAttackCooldown;
        this.attacking = 15;
        const hX = this.x + Math.cos(this.angle) * 50;
        const hY = this.y + Math.sin(this.angle) * 50;

        state.enemies.forEach(e => {
            if (Math.hypot(e.x - hX, e.y - hY) < 70) {
                e.hp -= CONFIG.playerDmg;
                e.flash = 10;
                state.shake = 10;
                spawnFloatingText("-" + CONFIG.playerDmg, e.x, e.y, '#ffa502');
                if (e.hp <= 0) e.die();
            }
        });
        state.touch.attacking = false;
    }

    draw() {
        drawWarrior(this.x - state.cam.x, this.y - state.cam.y, this.angle, this.isWalking, this.attacking);
    }
}

class Enemy {
    constructor(tier) {
        this.x = CONFIG.huntBoundary + 300 + Math.random() * 800;
        this.y = Math.random() * 1000;
        this.tier = tier;
        this.scale = 0.8 + (tier * 0.3);
        this.hp = 60 + (tier * 40);
        this.maxHp = this.hp;
        this.speed = 1.5 + (tier * 0.4);
        this.flash = 0;
        this.angle = Math.PI;
    }

    update() {
        if (this.flash > 0) this.flash--;
        const dist = Math.hypot(player.x - this.x, player.y - this.y);
        
        if (dist < 600) {
            const angle = Math.atan2(player.y - this.y, player.x - this.x);
            this.angle = angle;
            let nx = this.x + Math.cos(angle) * this.speed;
            let ny = this.y + Math.sin(angle) * this.speed;
            
            if (nx > CONFIG.huntBoundary) this.x = nx;
            this.y = ny;

            if (dist < 50) {
                player.hp -= 0.5 + (this.tier * 0.2);
                state.shake = 2;
                if (player.hp <= 0) gameOver();
            }
        }
    }

    die() {
        state.enemies = state.enemies.filter(e => e !== this);
        state.bearsKilled++;
        for(let i=0; i<3; i++) state.drops.push({x: this.x, y: this.y, life: 600});
        checkStageProgress();
    }

    draw() {
        drawBear(this.x - state.cam.x, this.y - state.cam.y, this.angle, this.flash, this.scale);
        const sx = this.x - state.cam.x, sy = this.y - state.cam.y;
        ctx.fillStyle = '#333'; ctx.fillRect(sx - 25, sy - 50, 50, 6);
        ctx.fillStyle = '#2ed573'; ctx.fillRect(sx - 25, sy - 50, 50 * (this.hp/this.maxHp), 6);
    }
}

// --- ENGINE ---

let player = new Player();

const init = () => {
    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    });
    window.dispatchEvent(new Event('resize'));

    // Input
    window.addEventListener('keydown', e => state.keys[e.code] = true);
    window.addEventListener('keyup', e => state.keys[e.code] = false);

    const joyBase = document.getElementById('joyBase');
    const joyStick = document.getElementById('joyStick');
    
    joyBase.addEventListener('touchstart', e => {
        state.touch.active = true;
        state.touch.startX = e.touches[0].clientX;
        state.touch.startY = e.touches[0].clientY;
    });

    window.addEventListener('touchmove', e => {
        if (!state.touch.active) return;
        const touch = Array.from(e.touches).find(t => t.target === joyBase) || e.touches[0];
        const dx = touch.clientX - state.touch.startX;
        const dy = touch.clientY - state.touch.startY;
        const dist = Math.min(Math.hypot(dx, dy), 40);
        const angle = Math.atan2(dy, dx);
        
        state.touch.dx = Math.cos(angle) * (dist / 40);
        state.touch.dy = Math.sin(angle) * (dist / 40);
        
        joyStick.style.transform = `translate(${Math.cos(angle)*dist}px, ${Math.sin(angle)*dist}px)`;
    });

    window.addEventListener('touchend', () => {
        state.touch.active = false;
        state.touch.dx = 0; state.touch.dy = 0;
        joyStick.style.transform = `translate(0,0)`;
    });

    document.getElementById('attackBtn').addEventListener('touchstart', (e) => {
        e.preventDefault();
        state.touch.attacking = true;
    });

    // UI Buttons
    document.getElementById('startBtn').onclick = () => {
        state.screen = 'game';
        document.getElementById('startScreen').classList.remove('active');
        spawnBears();
    };
    document.getElementById('upgradeBtn').onclick = toggleUpgradeMenu;
    document.getElementById('closeUpgradeBtn').onclick = toggleUpgradeMenu;
    document.getElementById('restartBtn').onclick = () => location.reload();
    document.getElementById('restartWinBtn').onclick = () => location.reload();

    setupUpgrades();
    loop();
};

const spawnBears = () => {
    for(let i=0; i < 3 + state.stage; i++) state.enemies.push(new Enemy(state.stage - 1));
};

const checkStageProgress = () => {
    if (state.bearsKilled >= state.bearsToNextStage) {
        state.stage++;
        state.bearsKilled = 0;
        state.bearsToNextStage += 2;
        if (state.stage > state.maxStages) {
            state.screen = 'win';
            document.getElementById('winScreen').classList.add('active');
        } else {
            spawnFloatingText("NEXT STAGE UNLOCKED!", player.x, player.y, '#2ed573');
            spawnBears();
        }
    } else if (state.enemies.length === 0) spawnBears();
    updateUI();
};

const updateUI = () => {
    document.getElementById('moneyDisplay').innerText = state.money;
    document.getElementById('meatDisplay').innerText = state.meat;
    document.getElementById('meatCapDisplay').innerText = CONFIG.meatCap;
    document.getElementById('stageDisplay').innerText = state.stage;
    document.getElementById('healthBarFill').style.width = (player.hp / player.maxHp * 100) + '%';
};

const gameOver = () => {
    state.screen = 'gameover';
    document.getElementById('gameOverScreen').classList.add('active');
};

const toggleUpgradeMenu = () => {
    const m = document.getElementById('upgradeMenu');
    if (state.screen === 'game') { state.screen = 'upgrade'; m.classList.add('active'); }
    else { state.screen = 'game'; m.classList.remove('active'); }
};

const spawnFloatingText = (text, x, y, color) => {
    state.texts.push({ text, x, y, color, life: 60 });
};

const loop = () => {
    if (state.screen === 'game' || state.screen === 'upgrade') {
        player.update();
        
        // Machine Logic
        const distToMach = Math.hypot(player.x - 100, player.y - 100);
        if (distToMach < 100 && state.meat > 0) {
            state.meatStored += state.meat; state.meat = 0; updateUI();
        }
        if (state.meatStored > 0) {
            state.machineAngle += 0.2;
            if (Math.random() < 0.05) {
                state.meatStored--; state.money += CONFIG.machineValue;
                state.slices.push({ x: 120, y: 100, vx: 2, vy: Math.random()-0.5, life: 40 });
                updateUI();
            }
        }

        // Cam
        state.cam.x += (player.x - canvas.width / 2 - state.cam.x) * 0.1;
        state.cam.y += (player.y - canvas.height / 2 - state.cam.y) * 0.1;
        if (state.shake > 0) { 
            state.cam.x += (Math.random()-0.5) * state.shake; 
            state.cam.y += (Math.random()-0.5) * state.shake; 
            state.shake *= 0.8; 
        }

        // Entities
        state.enemies.forEach(e => e.update());
        state.drops = state.drops.filter(d => {
            d.life--;
            const dist = Math.hypot(player.x - d.x, player.y - d.y);
            if (dist < 40 && state.meat < CONFIG.meatCap) { state.meat++; updateUI(); return false; }
            if (dist < 200) { d.x += (player.x - d.x) * 0.15; d.y += (player.y - d.y) * 0.15; }
            return d.life > 0;
        });
        state.slices.forEach(s => { s.x += s.vx; s.y += s.vy; s.life--; });
        state.slices = state.slices.filter(s => s.life > 0);
    }

    // DRAW
    ctx.fillStyle = '#a4b0be'; ctx.fillRect(0,0,canvas.width,canvas.height);
    
    // Fence Line
    ctx.strokeStyle = '#ff4757'; ctx.lineWidth = 10;
    ctx.setLineDash([20, 20]);
    ctx.beginPath(); ctx.moveTo(CONFIG.huntBoundary - state.cam.x, -2000); 
    ctx.lineTo(CONFIG.huntBoundary - state.cam.x, 2000); ctx.stroke();
    ctx.setLineDash([]);

    // Machine
    const mx = 100 - state.cam.x, my = 100 - state.cam.y;
    ctx.fillStyle = '#2f3542'; ctx.fillRect(mx-60, my-60, 120, 120);
    ctx.save(); ctx.translate(mx, my); ctx.rotate(state.machineAngle);
    ctx.fillStyle = '#747d8c'; ctx.fillRect(-40, -5, 80, 10); ctx.fillRect(-5, -40, 10, 80);
    ctx.restore();

    state.drops.forEach(d => {
        ctx.fillStyle = '#ff4757'; ctx.beginPath(); ctx.arc(d.x - state.cam.x, d.y - state.cam.y, 8, 0, Math.PI*2); ctx.fill();
    });
    state.enemies.forEach(e => e.draw());
    player.draw();
    state.slices.forEach(s => {
        ctx.fillStyle = '#ff7f50'; ctx.fillRect(s.x - state.cam.x, s.y - state.cam.y, 15, 8);
    });

    state.texts.forEach(t => {
        t.y -= 1; t.life--;
        ctx.fillStyle = t.color; ctx.font = 'bold 20px Arial';
        ctx.fillText(t.text, t.x - state.cam.x, t.y - state.cam.y);
    });
    state.texts = state.texts.filter(t => t.life > 0);

    requestAnimationFrame(loop);
};

const setupUpgrades = () => {
    const upgs = {
        upgDmg: { cost: 100, run: () => CONFIG.playerDmg += 20 },
        upgHp: { cost: 100, run: () => { CONFIG.playerHp += 50; player.maxHp += 50; player.hp += 50; } },
        upgSpd: { cost: 150, run: () => CONFIG.playerSpeed += 0.5 },
        upgCap: { cost: 200, run: () => CONFIG.meatCap += 5 },
        upgMach: { cost: 300, run: () => CONFIG.machineValue += 10 }
    };
    Object.keys(upgs).forEach(id => {
        const item = document.getElementById(id);
        const btn = item.querySelector('.buy-btn');
        btn.onclick = () => {
            const u = upgs[id];
            if (state.money >= u.cost) {
                state.money -= u.cost; u.run(); u.cost = Math.floor(u.cost * 1.5);
                btn.innerText = u.cost + "g"; updateUI();
            }
        };
    });
};

init();
