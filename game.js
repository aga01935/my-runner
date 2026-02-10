const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const CONFIG = {
    playerSpeed: 6,
    playerDmg: 45,
    playerHp: 200,
    playerAttackCooldown: 18, 
    meatCap: 12,
    machineSpeed: 30, 
    machineValue: 15, 
    drag: 0.8,
    huntBoundary: 500 // The "Fence" line
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
    shake: 0,
    grinderSlices: [],
    grinderAngle: 0
};

// --- ENTITIES ---

class Machine {
    constructor() {
        this.x = 0; // Center of safe zone
        this.y = 0;
    }
    update() {
        const dist = Math.hypot(player.x - this.x, player.y - this.y);
        if (dist < 120 && state.meat > 0) {
            state.meatStored += state.meat;
            state.meat = 0;
            updateUI();
        }
        
        if (state.meatStored > 0) {
            state.grinderAngle += 0.15;
            if (Date.now() % CONFIG.machineSpeed === 0) { // Throttle processing
                state.meatStored--;
                state.money += CONFIG.machineValue;
                state.grinderSlices.push({
                    x: this.x + 40, y: this.y, 
                    vx: 3 + Math.random() * 2, vy: (Math.random() - 0.5) * 2, 
                    life: 50
                });
                updateUI();
            }
        }
    }
    draw() {
        const sx = this.x - state.cam.x, sy = this.y - state.cam.y;
        
        // Machine Base
        ctx.fillStyle = '#455a64';
        ctx.fillRect(sx - 50, sy - 50, 100, 100);
        ctx.strokeStyle = '#263238';
        ctx.lineWidth = 4;
        ctx.strokeRect(sx - 50, sy - 50, 100, 100);

        // Rotating Gear
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(state.grinderAngle);
        ctx.fillStyle = '#90a4ae';
        for(let i=0; i<4; i++) {
            ctx.rotate(Math.PI/2);
            ctx.fillRect(-8, -40, 16, 80);
        }
        ctx.restore();

        // Signage
        ctx.fillStyle = 'white';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText("MEAT GRINDER", sx, sy - 60);
        ctx.fillStyle = '#ffeb3b';
        ctx.fillText("STASH: " + state.meatStored, sx, sy + 70);
    }
}

class Player {
    constructor() {
        this.x = -200; this.y = 0; this.vx = 0; this.vy = 0;
        this.radius = 20; this.angle = 0;
        this.hp = CONFIG.playerHp; this.maxHp = CONFIG.playerHp;
        this.cooldown = 0; this.attacking = 0;
    }
    update() {
        let ix = 0, iy = 0;
        if (state.keys['KeyW'] || state.keys['ArrowUp']) iy = -1;
        if (state.keys['KeyS'] || state.keys['ArrowDown']) iy = 1;
        if (state.keys['KeyA'] || state.keys['ArrowLeft']) ix = -1;
        if (state.keys['KeyD'] || state.keys['ArrowRight']) ix = 1;
        if (state.touch.active) { ix = state.touch.dx; iy = state.touch.dy; }

        if (ix !== 0 || iy !== 0) {
            const mag = Math.hypot(ix, iy);
            this.vx += (ix/mag) * CONFIG.playerSpeed * 0.2;
            this.vy += (iy/mag) * CONFIG.playerSpeed * 0.2;
            this.angle = Math.atan2(iy, ix);
        }

        this.x += this.vx; this.y += this.vy;
        this.vx *= CONFIG.drag; this.vy *= CONFIG.drag;
        
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
        const hX = this.x + Math.cos(this.angle) * 50;
        const hY = this.y + Math.sin(this.angle) * 50;

        state.enemies.forEach(e => {
            if (Math.hypot(e.x - hX, e.y - hY) < 70) {
                e.takeDamage(CONFIG.playerDmg);
                state.shake = 8;
                spawnFloatingText("-" + CONFIG.playerDmg, e.x, e.y, '#ffeb3b');
                createParticle(e.x, e.y, '#f44336', 4);
            }
        });
    }
    draw() {
        ctx.save();
        ctx.translate(this.x - state.cam.x, this.y - state.cam.y);
        ctx.rotate(this.angle);
        ctx.fillStyle = '#2196f3';
        ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = 'white'; ctx.lineWidth = 3; ctx.stroke();
        ctx.fillStyle = 'white'; ctx.fillRect(15, -4, 45, 8); // Spear
        ctx.restore();
    }
}

class Enemy {
    constructor(tier) {
        this.x = CONFIG.huntBoundary + 300 + Math.random() * 500;
        this.y = (Math.random() - 0.5) * 800;
        this.hp = 70 + (tier * 20);
        this.maxHp = this.hp;
        this.speed = 1.2 + (tier * 0.1);
        this.flash = 0;
    }
    update() {
        if (this.flash > 0) this.flash--;
        const dist = Math.hypot(player.x - this.x, player.y - this.y);
        
        if (dist < 500) {
            const angle = Math.atan2(player.y - this.y, player.x - this.x);
            let nx = this.x + Math.cos(angle) * this.speed;
            let ny = this.y + Math.sin(angle) * this.speed;
            
            // STAY IN REGION
            if (nx > CONFIG.huntBoundary) this.x = nx;
            this.y = ny;

            if (dist < 40) {
                player.hp -= 0.5; // Constant small damage
                updateUI();
                if (player.hp <= 0) gameOver();
            }
        }
    }
    takeDamage(amt) {
        this.hp -= amt;
        this.flash = 10;
        if (this.hp <= 0) {
            state.enemies = state.enemies.filter(e => e !== this);
            state.bearsKilled++;
            for(let i=0; i<3; i++) state.drops.push({x: this.x, y: this.y, life: 600});
            checkStageProgress();
        }
    }
    draw() {
        const sx = this.x - state.cam.x, sy = this.y - state.cam.y;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.fillStyle = this.flash > 0 ? 'red' : 'white';
        ctx.beginPath(); ctx.arc(0, 0, 25, 0, Math.PI*2); ctx.fill();
        ctx.restore();
        // HP Bar
        ctx.fillStyle = '#333'; ctx.fillRect(sx-20, sy-40, 40, 5);
        ctx.fillStyle = '#4caf50'; ctx.fillRect(sx-20, sy-40, 40 * (this.hp/this.maxHp), 5);
    }
}

// --- CORE LOOPS ---

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
                const dx = t.clientX - state.touch.startX, dy = t.clientY - state.touch.startY;
                const d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
                state.touch.dx = Math.cos(a) * (Math.min(d, 50)/50);
                state.touch.dy = Math.sin(a) * (Math.min(d, 50)/50);
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

function spawnEnemies() { for(let i=0; i<3 + state.stage; i++) state.enemies.push(new Enemy(state.stage)); }

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
    if (state.screen === 'game' || state.screen === 'upgrade') {
        player.update();
        machine.update();
        state.enemies.forEach(e => e.update());
        
        // Meat Drops Logic
        state.drops = state.drops.filter(d => {
            d.life--;
            const dist = Math.hypot(player.x - d.x, player.y - d.y);
            if (dist < 30 && state.meat < CONFIG.meatCap) { state.meat++; updateUI(); return false; }
            if (dist < 150) { d.x += (player.x - d.x) * 0.1; d.y += (player.y - d.y) * 0.1; }
            return d.life > 0;
        });

        // Slice Animations
        state.grinderSlices.forEach(s => { s.x += s.vx; s.y += s.vy; s.life--; });
        state.grinderSlices = state.grinderSlices.filter(s => s.life > 0);

        // Camera
        state.cam.x += (player.x - canvas.width / 2 - state.cam.x) * 0.1;
        state.cam.y += (player.y - canvas.height / 2 - state.cam.y) * 0.1;
        if (state.shake > 0) { state.cam.x += (Math.random()-0.5)*state.shake; state.cam.y += (Math.random()-0.5)*state.shake; state.shake *= 0.9; }
    }

    ctx.fillStyle = '#101720'; ctx.fillRect(0, 0, canvas.width, canvas.height);

    // DRAW REGION LINE (The Fence)
    ctx.strokeStyle = '#f44336'; ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(CONFIG.huntBoundary - state.cam.x, -1000 - state.cam.y);
    ctx.lineTo(CONFIG.huntBoundary - state.cam.x, 1000 - state.cam.y);
    ctx.stroke();

    machine.draw();
    state.drops.forEach(d => {
        ctx.fillStyle = '#e91e63';
        ctx.beginPath(); ctx.arc(d.x - state.cam.x, d.y - state.cam.y, 8, 0, Math.PI*2); ctx.fill();
    });
    
    state.enemies.forEach(e => e.draw());
    player.draw();

    // Grinder Slices
    state.grinderSlices.forEach(s => {
        ctx.fillStyle = '#ff8a80';
        ctx.fillRect(s.x - state.cam.x, s.y - state.cam.y, 12, 6);
    });

    if (state.touch.active) {
        ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.arc(state.touch.startX, state.touch.startY, 50, 0, Math.PI*2); ctx.stroke();
    }

    state.texts.forEach(t => { 
        t.y -= 1; t.life--;
        ctx.fillStyle = t.color; ctx.font = 'bold 20px Arial'; 
        ctx.fillText(t.text, t.x - state.cam.x, t.y - state.cam.y); 
    });
    state.texts = state.texts.filter(t => t.life > 0);

    requestAnimationFrame(loop);
}

function spawnFloatingText(text, x, y, color) { state.texts.push({text, x, y, color, life:50}); }
function createParticle(x, y, color, size) { /* simpler particle logic handled in enemy die */ }
function toggleUpgradeMenu() { 
    const m = document.getElementById('upgradeMenu');
    if (state.screen === 'game') { state.screen = 'upgrade'; m.classList.add('active'); }
    else if (state.screen === 'upgrade') { state.screen = 'game'; m.classList.remove('active'); }
}

function setupUpgrades() {
    const upgs = {
        upgDmg: { cost: 100, run: () => CONFIG.playerDmg += 20 },
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
