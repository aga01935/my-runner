/**
 * ARCTIC APEX - SOURCE CODE
 * Fully Updated: Responsive Touch + Keyboard Combat
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- GAME CONFIGURATION ---
const CONFIG = {
    playerSpeed: 5,
    playerDmg: 20,
    playerHp: 100,
    playerAttackCooldown: 25, 
    meatCap: 10,
    machineSpeed: 60, 
    machineValue: 10, 
    drag: 0.82 // Lower drag = snappier movement
};

// --- STATE MANAGEMENT ---
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
    touch: {
        active: false,
        identifier: null,
        startX: 0, startY: 0,
        currX: 0, currY: 0,
        dx: 0, dy: 0,
        attacking: false
    },
    particles: [],
    drops: [],
    enemies: [],
    texts: [],
    cam: { x: 0, y: 0 }
};

// --- ENTITIES ---

class Player {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.vx = 0;
        this.vy = 0;
        this.radius = 18;
        this.angle = 0;
        this.hp = CONFIG.playerHp;
        this.maxHp = CONFIG.playerHp;
        this.cooldown = 0;
        this.attacking = 0;
    }

    update() {
        let inputX = 0;
        let inputY = 0;

        // Keyboard Logic
        if (state.keys['KeyW'] || state.keys['ArrowUp']) inputY = -1;
        if (state.keys['KeyS'] || state.keys['ArrowDown']) inputY = 1;
        if (state.keys['KeyA'] || state.keys['ArrowLeft']) inputX = -1;
        if (state.keys['KeyD'] || state.keys['ArrowRight']) inputX = 1;

        // Mobile Override
        if (state.touch.active) {
            inputX = state.touch.dx;
            inputY = state.touch.dy;
        }

        // Apply Movement
        if (!state.touch.active && (inputX !== 0 || inputY !== 0)) {
            const len = Math.hypot(inputX, inputY);
            inputX /= len;
            inputY /= len;
        }

        this.vx += inputX * CONFIG.playerSpeed * 0.25;
        this.vy += inputY * CONFIG.playerSpeed * 0.25;

        this.x += this.vx;
        this.y += this.vy;

        this.vx *= CONFIG.drag;
        this.vy *= CONFIG.drag;

        // World Bounds
        this.x = Math.max(-1500, Math.min(1500, this.x));
        this.y = Math.max(-1500, Math.min(1500, this.y));

        // Face movement direction
        if (Math.hypot(this.vx, this.vy) > 0.2) {
            this.angle = Math.atan2(this.vy, this.vx);
        }

        // Combat
        if (this.cooldown > 0) this.cooldown--;
        if (this.attacking > 0) this.attacking--;

        if ((state.keys['Space'] || state.mouse.down || state.touch.attacking) && this.cooldown <= 0) {
            this.performAttack();
            state.touch.attacking = false; // Prevents "stuck" attack
        }
    }

    performAttack() {
        this.cooldown = CONFIG.playerAttackCooldown;
        this.attacking = 10;
        
        const hitX = this.x + Math.cos(this.angle) * 45;
        const hitY = this.y + Math.sin(this.angle) * 45;

        createParticle(hitX, hitY, '#fff', 6);

        state.enemies.forEach(e => {
            const dist = Math.hypot(e.x - hitX, e.y - hitY);
            if (dist < 65) {
                e.takeDamage(CONFIG.playerDmg);
                spawnFloatingText(Math.floor(CONFIG.playerDmg), e.x, e.y, 'yellow');
                createBlood(e.x, e.y);
            }
        });
    }

    draw() {
        ctx.save();
        ctx.translate(this.x - state.cam.x, this.y - state.cam.y);
        ctx.rotate(this.angle);

        // Body Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath(); ctx.ellipse(0, 10, 15, 8, 0, 0, Math.PI*2); ctx.fill();

        // Main Body
        ctx.fillStyle = '#2c3e50';
        ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#95a5a6';
        ctx.lineWidth = 3; ctx.stroke();

        // Weapon
        ctx.save();
        if (this.attacking > 0) {
            ctx.rotate(Math.PI / 2 - (this.attacking / 10));
        }
        ctx.fillStyle = '#bdc3c7';
        ctx.fillRect(15, -3, 40, 6); // Spear
        ctx.fillStyle = '#ecf0f1';
        ctx.beginPath(); ctx.moveTo(55, -8); ctx.lineTo(70, 0); ctx.lineTo(55, 8); ctx.fill();
        ctx.restore();

        ctx.restore();
    }
}

class Enemy {
    constructor(tier) {
        const side = Math.random() > 0.5;
        this.x = player.x + (side ? 400 : -400) + (Math.random()*200);
        this.y = player.y + (side ? 400 : -400) + (Math.random()*200);
        
        const scale = 1 + (tier * 0.25);
        this.radius = 22 * scale;
        this.hp = 50 * scale;
        this.maxHp = this.hp;
        this.speed = 1.2 + (tier * 0.2);
        this.dmg = 8 + (tier * 2);
        this.attackTimer = 0;
    }

    update() {
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const dist = Math.hypot(dx, dy);

        if (this.attackTimer > 0) this.attackTimer--;

        // Chase
        if (dist > this.radius + 10) {
            const angle = Math.atan2(dy, dx);
            this.x += Math.cos(angle) * this.speed;
            this.y += Math.sin(angle) * this.speed;
        } else if (this.attackTimer <= 0) {
            // Damage Player
            player.hp -= this.dmg;
            this.attackTimer = 60;
            createBlood(player.x, player.y, true);
            updateUI();
            if (player.hp <= 0) gameOver();
        }
    }

    takeDamage(amt) {
        this.hp -= amt;
        if (this.hp <= 0) this.die();
    }

    die() {
        state.enemies = state.enemies.filter(e => e !== this);
        state.bearsKilled++;
        for(let i=0; i<3; i++) state.drops.push(new Drop(this.x, this.y));
        checkStageProgress();
    }

    draw() {
        const sx = this.x - state.cam.x;
        const sy = this.y - state.cam.y;
        if (sx < -100 || sx > canvas.width + 100 || sy < -100 || sy > canvas.height + 100) return;

        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(Math.atan2(player.y - this.y, player.x - this.x));

        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.ellipse(0, 0, this.radius * 1.3, this.radius, 0, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(this.radius, 0, this.radius*0.7, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = 'black';
        ctx.beginPath(); ctx.arc(this.radius+5, -5, 2, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(this.radius+5, 5, 2, 0, Math.PI*2); ctx.fill();
        ctx.restore();

        // HP Bar
        ctx.fillStyle = '#333'; ctx.fillRect(sx - 20, sy - 35, 40, 4);
        ctx.fillStyle = 'red'; ctx.fillRect(sx - 20, sy - 35, 40 * (this.hp/this.maxHp), 4);
    }
}

class Drop {
    constructor(x, y) {
        this.x = x + (Math.random()-0.5)*40;
        this.y = y + (Math.random()-0.5)*40;
        this.life = 600;
    }
    update() {
        this.life--;
        const d = Math.hypot(player.x - this.x, player.y - this.y);
        if (d < 30 && state.meat < CONFIG.meatCap) {
            state.meat++;
            updateUI();
            return true;
        }
        if (d < 120 && state.meat < CONFIG.meatCap) {
            this.x += (player.x - this.x) * 0.12;
            this.y += (player.y - this.y) * 0.12;
        }
        return this.life <= 0;
    }
    draw() {
        const sx = this.x - state.cam.x;
        const sy = this.y - state.cam.y;
        ctx.fillStyle = '#e74c3c';
        ctx.beginPath(); ctx.arc(sx, sy, 6, 0, Math.PI*2); ctx.fill();
    }
}

class Machine {
    constructor() { this.x = 0; this.y = 0; this.timer = 0; }
    update() {
        if (Math.hypot(player.x - this.x, player.y - this.y) < 100 && state.meat > 0) {
            state.meatStored += state.meat;
            state.meat = 0;
            updateUI();
            spawnFloatingText('PROCESSING...', this.x, this.y - 60, '#2ecc71');
        }
        if (state.meatStored > 0) {
            this.timer++;
            if (this.timer >= CONFIG.machineSpeed) {
                this.timer = 0; state.meatStored--; state.money += CONFIG.machineValue;
                updateUI();
            }
        }
    }
    draw() {
        const sx = this.x - state.cam.x; const sy = this.y - state.cam.y;
        ctx.fillStyle = '#34495e'; ctx.fillRect(sx-50, sy-50, 100, 100);
        ctx.fillStyle = state.meatStored > 0 ? '#2ecc71' : '#e74c3c';
        ctx.beginPath(); ctx.arc(sx, sy, 15, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = 'white'; ctx.textAlign = 'center';
        ctx.fillText("MEAT: " + state.meatStored, sx, sy + 70);
    }
}

// --- CORE LOGIC ---

let player = new Player();
let machine = new Machine();

function init() {
    window.addEventListener('resize', () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; });
    window.dispatchEvent(new Event('resize'));

    // Input Listeners
    window.addEventListener('keydown', e => state.keys[e.code] = true);
    window.addEventListener('keyup', e => state.keys[e.code] = false);
    window.addEventListener('mousemove', e => { state.mouse.x = e.clientX; state.mouse.y = e.clientY; });
    window.addEventListener('mousedown', () => state.mouse.down = true);
    window.addEventListener('mouseup', () => state.mouse.down = false);

    // FIXED TOUCH
    const tL = document.getElementById('mobileControls');
    tL.addEventListener('touchstart', e => {
        e.preventDefault();
        for (let t of e.changedTouches) {
            if (t.clientX < window.innerWidth / 2 && !state.touch.active) {
                state.touch.active = true; state.touch.identifier = t.identifier;
                state.touch.startX = t.clientX; state.touch.startY = t.clientY;
                state.touch.currX = t.clientX; state.touch.currY = t.clientY;
            } else if (t.clientX >= window.innerWidth / 2) {
                state.touch.attacking = true;
            }
        }
    }, {passive: false});

    tL.addEventListener('touchmove', e => {
        e.preventDefault();
        for (let t of e.changedTouches) {
            if (t.identifier === state.touch.identifier) {
                state.touch.currX = t.clientX; state.touch.currY = t.clientY;
                const dx = state.touch.currX - state.touch.startX;
                const dy = state.touch.currY - state.touch.startY;
                const dist = Math.hypot(dx, dy);
                const angle = Math.atan2(dy, dx);
                const force = Math.min(dist, 50) / 50;
                state.touch.dx = Math.cos(angle) * force;
                state.touch.dy = Math.sin(angle) * force;
            }
        }
    }, {passive: false});

    tL.addEventListener('touchend', e => {
        for (let t of e.changedTouches) {
            if (t.identifier === state.touch.identifier) {
                state.touch.active = false; state.touch.identifier = null;
                state.touch.dx = 0; state.touch.dy = 0;
            } else if (t.clientX >= window.innerWidth / 2) {
                state.touch.attacking = false;
            }
        }
    });

    // Buttons
    document.getElementById('startBtn').onclick = () => {
        state.screen = 'game';
        document.getElementById('startScreen').classList.remove('active');
        spawnEnemies();
    };
    document.getElementById('upgradeBtn').onclick = toggleUpgradeMenu;
    document.getElementById('closeUpgradeBtn').onclick = toggleUpgradeMenu;
    document.getElementById('restartBtn').onclick = () => location.reload();
    document.getElementById('restartWinBtn').onclick = () => location.reload();

    setupUpgrades();
    loop();
}

function spawnEnemies() {
    for(let i=0; i<3 + state.stage; i++) state.enemies.push(new Enemy(state.stage));
}

function checkStageProgress() {
    if (state.bearsKilled >= state.bearsToNextStage) {
        state.stage++;
        state.bearsKilled = 0;
        state.bearsToNextStage += 3;
        if (state.stage > state.maxStages) {
            state.screen = 'win';
            document.getElementById('winScreen').classList.add('active');
        } else {
            spawnFloatingText("STAGE " + state.stage, player.x, player.y - 50, 'cyan');
            spawnEnemies();
            updateUI();
        }
    } else if (state.enemies.length === 0) spawnEnemies();
}

function updateUI() {
    document.getElementById('moneyDisplay').innerText = state.money;
    document.getElementById('meatDisplay').innerText = state.meat;
    document.getElementById('meatCapDisplay').innerText = CONFIG.meatCap;
    document.getElementById('stageDisplay').innerText = state.stage;
    document.getElementById('healthBarFill').style.width = (player.hp / player.maxHp * 100) + '%';
    
    // Check buyable status
    const buttons = document.querySelectorAll('.buy-btn');
    buttons.forEach(btn => {
        const cost = parseInt(btn.innerText);
        btn.disabled = state.money < cost;
    });
}

function gameOver() {
    state.screen = 'gameover';
    document.getElementById('finalStage').innerText = state.stage;
    document.getElementById('gameOverScreen').classList.add('active');
}

// --- RENDER LOOP ---

function loop() {
    if (state.screen === 'game') {
        player.update();
        machine.update();
        state.enemies.forEach(e => e.update());
        state.drops = state.drops.filter(d => !d.update());
        state.particles = state.particles.filter(p => {
            p.x += p.vx; p.y += p.vy; p.life--;
            return p.life > 0;
        });
        state.texts = state.texts.filter(t => { t.y -= 0.5; t.life--; return t.life > 0; });
        
        state.cam.x += (player.x - canvas.width / 2 - state.cam.x) * 0.1;
        state.cam.y += (player.y - canvas.height / 2 - state.cam.y) * 0.1;
    }

    // DRAW
    ctx.fillStyle = '#0b1016';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid
    ctx.strokeStyle = '#1c2b36';
    const gs = 100;
    for(let x = -state.cam.x % gs; x < canvas.width; x += gs) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for(let y = -state.cam.y % gs; y < canvas.height; y += gs) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    machine.draw();
    state.drops.forEach(d => d.draw());
    state.enemies.forEach(e => e.draw());
    player.draw();

    // Visual Joystick
    if (state.touch.active) {
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(state.touch.startX, state.touch.startY, 50, 0, Math.PI*2); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath(); ctx.arc(state.touch.currX, state.touch.currY, 20, 0, Math.PI*2); ctx.fill();
    }

    // Particles & Text
    state.particles.forEach(p => {
        ctx.fillStyle = p.color; ctx.globalAlpha = p.life/30;
        ctx.beginPath(); ctx.arc(p.x - state.cam.x, p.y - state.cam.y, p.size, 0, Math.PI*2); ctx.fill();
        ctx.globalAlpha = 1;
    });
    state.texts.forEach(t => {
        ctx.fillStyle = t.color; ctx.font = 'bold 20px Arial'; ctx.textAlign = 'center';
        ctx.fillText(t.text, t.x - state.cam.x, t.y - state.cam.y);
    });

    requestAnimationFrame(loop);
}

// --- HELPERS ---
function createParticle(x, y, color, size) {
    for(let i=0; i<5; i++) state.particles.push({x, y, color, size, vx:(Math.random()-0.5)*5, vy:(Math.random()-0.5)*5, life:30});
}
function createBlood(x, y, isPlayer=false) {
    createParticle(x, y, isPlayer ? '#ff3e3e' : '#ecf0f1', 4);
}
function spawnFloatingText(text, x, y, color) {
    state.texts.push({text, x, y, color, life:60});
}
function toggleUpgradeMenu() {
    const m = document.getElementById('upgradeMenu');
    if (state.screen === 'game') { state.screen = 'upgrade'; m.classList.add('active'); }
    else if (state.screen === 'upgrade') { state.screen = 'game'; m.classList.remove('active'); }
    updateUI();
}

function setupUpgrades() {
    const upgs = {
        upgDmg: { cost: 100, run: () => CONFIG.playerDmg += 10 },
        upgHp: { cost: 100, run: () => { CONFIG.playerHp += 50; player.maxHp += 50; player.hp += 50; } },
        upgSpd: { cost: 150, run: () => CONFIG.playerSpeed += 0.5 },
        upgCap: { cost: 200, run: () => CONFIG.meatCap += 5 },
        upgMach: { cost: 300, run: () => CONFIG.machineValue += 5 }
    };
    Object.keys(upgs).forEach(id => {
        const btn = document.getElementById(id).querySelector('button');
        btn.onclick = () => {
            const u = upgs[id];
            if (state.money >= u.cost) {
                state.money -= u.cost; u.run(); u.cost = Math.floor(u.cost * 1.6);
                btn.innerText = u.cost + "g"; updateUI();
            }
        };
    });
}

init();
