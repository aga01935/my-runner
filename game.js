/**
 * ARCTIC APEX - SOURCE CODE
 * A complete HTML5 Survival Game
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- GAME CONFIGURATION ---
const CONFIG = {
    playerSpeed: 4,
    playerDmg: 20,
    playerHp: 100,
    playerAttackCooldown: 25, // Frames
    meatCap: 10,
    machineSpeed: 60, // Frames per tick
    machineValue: 10, // Gold per tick
    drag: 0.85 // Movement smoothness
};

// --- STATE MANAGEMENT ---
const state = {
    screen: 'start', // start, game, upgrade, gameover, win
    money: 0,
    meat: 0,
    meatStored: 0,
    stage: 1,
    maxStages: 5,
    bearsKilled: 0,
    bearsToNextStage: 5,
    keys: {},
    mouse: { x: 0, y: 0, down: false },
    touch: { active: false, x: 0, y: 0, dx: 0, dy: 0 },
    lastTime: 0,
    particles: [],
    drops: [],
    enemies: [],
    texts: [],
    cam: { x: 0, y: 0 }
};

// --- ASSETS (Procedural Generation) ---
// We draw everything with code to avoid external asset dependencies.

// --- ENTITIES ---

class Player {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.vx = 0;
        this.vy = 0;
        this.radius = 15;
        this.angle = 0;
        this.hp = CONFIG.playerHp;
        this.maxHp = CONFIG.playerHp;
        this.cooldown = 0;
        this.attacking = 0;
    }

    update() {
        // Movement Logic
        let dx = 0;
        let dy = 0;

        if (state.keys['KeyW'] || state.keys['ArrowUp']) dy = -1;
        if (state.keys['KeyS'] || state.keys['ArrowDown']) dy = 1;
        if (state.keys['KeyA'] || state.keys['ArrowLeft']) dx = -1;
        if (state.keys['KeyD'] || state.keys['ArrowRight']) dx = 1;

        // Mobile Joystick
        if (state.touch.active) {
            dx = state.touch.dx;
            dy = state.touch.dy;
        }

        // Normalize
        const len = Math.sqrt(dx*dx + dy*dy);
        if (len > 0) {
            this.vx += (dx / len) * CONFIG.playerSpeed * 0.2;
            this.vy += (dy / len) * CONFIG.playerSpeed * 0.2;
        }

        this.x += this.vx;
        this.y += this.vy;
        this.vx *= CONFIG.drag;
        this.vy *= CONFIG.drag;

        // Boundaries (World is 2000x2000)
        this.x = Math.max(-1000, Math.min(1000, this.x));
        this.y = Math.max(-1000, Math.min(1000, this.y));

        // Rotation
        if (state.touch.active && len > 0.1) {
            this.angle = Math.atan2(dy, dx);
        } else if (!state.touch.active) {
            this.angle = Math.atan2(state.mouse.y - (this.y - state.cam.y), state.mouse.x - (this.x - state.cam.x));
        }

        // Attack
        if (this.cooldown > 0) this.cooldown--;
        if (this.attacking > 0) this.attacking--;

        if ((state.keys['Space'] || state.mouse.down || state.touch.attackBtn) && this.cooldown <= 0) {
            this.performAttack();
        }
    }

    performAttack() {
        this.cooldown = CONFIG.playerAttackCooldown;
        this.attacking = 10;
        
        // Hitbox check
        const reach = 60;
        const hitX = this.x + Math.cos(this.angle) * 40;
        const hitY = this.y + Math.sin(this.angle) * 40;

        // Visual Swing
        createParticle(hitX, hitY, 'white', 5);

        // Check enemies
        state.enemies.forEach(e => {
            const dist = Math.hypot(e.x - hitX, e.y - hitY);
            if (dist < reach) {
                e.takeDamage(CONFIG.playerDmg);
                spawnFloatingText(Math.floor(CONFIG.playerDmg), e.x, e.y, 'yellow');
                createBlood(e.x, e.y);
                // Knockback
                e.x += Math.cos(this.angle) * 20;
                e.y += Math.sin(this.angle) * 20;
            }
        });
    }

    draw() {
        ctx.save();
        ctx.translate(this.x - state.cam.x, this.y - state.cam.y);
        ctx.rotate(this.angle);

        // Body
        ctx.fillStyle = '#2c3e50';
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#95a5a6';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Shoulders
        ctx.fillStyle = '#7f8c8d';
        ctx.fillRect(-10, -15, 20, 30);

        // Head
        ctx.fillStyle = '#f1c40f'; // Helmet
        ctx.beginPath();
        ctx.arc(5, 0, 10, 0, Math.PI * 2);
        ctx.fill();

        // Weapon
        ctx.save();
        if (this.attacking > 0) {
            ctx.translate(10, 0);
            ctx.rotate(Math.PI / 4 - (this.attacking / 10)); // Swing anim
        }
        ctx.fillStyle = '#bdc3c7'; // Steel
        ctx.fillRect(10, -3, 35, 6); // Spear shaft
        ctx.fillStyle = '#ecf0f1'; // Tip
        ctx.beginPath();
        ctx.moveTo(45, -6);
        ctx.lineTo(60, 0);
        ctx.lineTo(45, 6);
        ctx.fill();
        ctx.restore();

        ctx.restore();
    }
}

class Enemy {
    constructor(tier) {
        // Spawn distance
        const angle = Math.random() * Math.PI * 2;
        const dist = 600 + Math.random() * 200;
        this.x = player.x + Math.cos(angle) * dist;
        this.y = player.y + Math.sin(angle) * dist;
        
        // Stats scale with tier/stage
        const scale = 1 + (tier * 0.3);
        this.radius = 20 * Math.sqrt(scale);
        this.hp = 40 * scale;
        this.maxHp = this.hp;
        this.speed = 1.5 + (tier * 0.1);
        this.dmg = 5 + (tier * 2);
        
        this.state = 'chase'; // chase, charge, cooldown
        this.attackTimer = 0;
        this.color = tier > 3 ? '#ecf0f1' : '#fff'; // Alphas are brighter
    }

    update() {
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const dist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);

        if (this.attackTimer > 0) this.attackTimer--;

        // Collision with player
        if (dist < this.radius + player.radius) {
            if (this.attackTimer <= 0) {
                player.hp -= this.dmg;
                this.attackTimer = 60;
                createBlood(player.x, player.y, true); // Player blood
                updateUI();
                if (player.hp <= 0) gameOver();
            }
        }

        // Movement
        if (dist > this.radius + 5) {
            this.x += Math.cos(angle) * this.speed;
            this.y += Math.sin(angle) * this.speed;
        }

        // Collision with other enemies (soft)
        state.enemies.forEach(other => {
            if (other === this) return;
            const d = Math.hypot(this.x - other.x, this.y - other.y);
            if (d < this.radius + other.radius) {
                const a = Math.atan2(this.y - other.y, this.x - other.x);
                this.x += Math.cos(a) * 0.5;
                this.y += Math.sin(a) * 0.5;
            }
        });
    }

    takeDamage(amt) {
        this.hp -= amt;
        if (this.hp <= 0) {
            this.die();
        }
    }

    die() {
        state.enemies = state.enemies.filter(e => e !== this);
        state.bearsKilled++;
        
        // Drops
        for(let i=0; i<3; i++) {
            state.drops.push(new Drop(this.x, this.y));
        }
        
        checkStageProgress();
    }

    draw() {
        const screenX = this.x - state.cam.x;
        const screenY = this.y - state.cam.y;

        // Culling
        if (screenX < -50 || screenX > canvas.width + 50 || screenY < -50 || screenY > canvas.height + 50) return;

        ctx.save();
        ctx.translate(screenX, screenY);
        const angle = Math.atan2(player.y - this.y, player.x - this.x);
        ctx.rotate(angle);

        // Fur
        ctx.fillStyle = this.color;
        
        // Body (Oval)
        ctx.beginPath();
        ctx.ellipse(0, 0, this.radius * 1.5, this.radius, 0, 0, Math.PI*2);
        ctx.fill();

        // Head
        ctx.beginPath();
        ctx.arc(this.radius, 0, this.radius * 0.8, 0, Math.PI*2);
        ctx.fill();

        // Ears
        ctx.beginPath();
        ctx.arc(this.radius, -10, 5, 0, Math.PI*2);
        ctx.arc(this.radius, 10, 5, 0, Math.PI*2);
        ctx.fill();

        // Eyes (Red if attacking)
        ctx.fillStyle = this.attackTimer > 40 ? 'red' : 'black';
        ctx.beginPath();
        ctx.arc(this.radius + 5, -5, 2, 0, Math.PI*2);
        ctx.arc(this.radius + 5, 5, 2, 0, Math.PI*2);
        ctx.fill();

        ctx.restore();
        
        // Health Bar
        const pct = this.hp / this.maxHp;
        ctx.fillStyle = 'red';
        ctx.fillRect(screenX - 20, screenY - 40, 40 * pct, 5);
    }
}

class Drop {
    constructor(x, y) {
        this.x = x + (Math.random() - 0.5) * 30;
        this.y = y + (Math.random() - 0.5) * 30;
        this.life = 600; // 10 seconds
        this.magnet = false;
    }

    update() {
        this.life--;
        const dist = Math.hypot(player.x - this.x, player.y - this.y);
        
        // Pickup
        if (dist < 30) {
            if (state.meat < CONFIG.meatCap) {
                state.meat++;
                spawnFloatingText('+1 Meat', player.x, player.y - 20, '#ff9999');
                updateUI();
                return true; // remove
            } else {
                if (this.life % 60 === 0) spawnFloatingText('FULL!', player.x, player.y - 20, 'white');
            }
        }

        // Magnet effect
        if (dist < 100 && state.meat < CONFIG.meatCap) {
            this.x += (player.x - this.x) * 0.1;
            this.y += (player.y - this.y) * 0.1;
        }
        
        return this.life <= 0;
    }

    draw() {
        const screenX = this.x - state.cam.x;
        const screenY = this.y - state.cam.y;
        ctx.fillStyle = '#e74c3c'; // Meat red
        ctx.beginPath();
        ctx.moveTo(screenX, screenY - 5);
        ctx.lineTo(screenX + 5, screenY + 2);
        ctx.lineTo(screenX - 5, screenY + 2);
        ctx.fill();
        ctx.strokeStyle = '#c0392b';
        ctx.stroke();
    }
}

class Machine {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.width = 100;
        this.height = 100;
        this.timer = 0;
    }

    update() {
        // Player interaction
        const dist = Math.hypot(player.x - this.x, player.y - this.y);
        
        if (dist < 100) {
            // Deposit
            if (state.meat > 0) {
                state.meatStored += state.meat;
                state.meat = 0;
                spawnFloatingText('Deposited!', this.x, this.y - 60, '#2ecc71');
                updateUI();
            }
        }

        // Processing
        if (state.meatStored > 0) {
            this.timer++;
            if (this.timer >= CONFIG.machineSpeed) {
                this.timer = 0;
                state.meatStored--;
                state.money += CONFIG.machineValue;
                spawnFloatingText('+' + CONFIG.machineValue + 'g', this.x, this.y - 80, 'gold');
                updateUI();
            }
        }
    }

    draw() {
        const screenX = this.x - state.cam.x;
        const screenY = this.y - state.cam.y;

        // Base
        ctx.fillStyle = '#34495e';
        ctx.fillRect(screenX - 50, screenY - 50, 100, 100);
        
        // Detail
        ctx.fillStyle = '#7f8c8d';
        ctx.fillRect(screenX - 40, screenY - 40, 80, 80);

        // Conveyor / Funnel
        ctx.fillStyle = '#2c3e50';
        ctx.beginPath();
        ctx.arc(screenX, screenY, 30, 0, Math.PI*2);
        ctx.fill();

        // Animation
        if (state.meatStored > 0) {
            ctx.fillStyle = `hsl(${Date.now() % 360}, 50%, 50%)`; // Active light
        } else {
            ctx.fillStyle = '#c0392b'; // Idle red
        }
        ctx.beginPath();
        ctx.arc(screenX, screenY, 10, 0, Math.PI*2);
        ctx.fill();

        // Text
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`Meat: ${state.meatStored}`, screenX, screenY + 60);
    }
}

// --- PARTICLES ---
function createParticle(x, y, color, size) {
    state.particles.push({
        x, y, color, size,
        vx: (Math.random() - 0.5) * 5,
        vy: (Math.random() - 0.5) * 5,
        life: 30
    });
}

function createBlood(x, y, isPlayer=false) {
    for(let i=0; i<8; i++) {
        createParticle(x, y, isPlayer ? '#e74c3c' : '#8e44ad', Math.random() * 4);
    }
}

function spawnFloatingText(text, x, y, color) {
    state.texts.push({ text, x, y, color, life: 60, dy: 0 });
}

// --- CORE SYSTEM ---

let player;
let machine;

function init() {
    // Canvas Resize
    const resize = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    player = new Player();
    machine = new Machine();

    // Input Listeners
    window.addEventListener('keydown', e => {
        state.keys[e.code] = true;
        if (e.code === 'KeyU') toggleUpgradeMenu();
        if (e.code === 'Escape') toggleUpgradeMenu();
    });
    window.addEventListener('keyup', e => state.keys[e.code] = false);

    window.addEventListener('mousemove', e => {
        state.mouse.x = e.clientX;
        state.mouse.y = e.clientY;
    });
    window.addEventListener('mousedown', () => state.mouse.down = true);
    window.addEventListener('mouseup', () => state.mouse.down = false);

    // Touch Handling (Joystick)
    const joyZone = document.getElementById('joystickZone');
    const attackBtn = document.getElementById('attackBtn');

    joyZone.addEventListener('touchstart', e => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        state.touch.active = true;
        state.touch.startX = touch.clientX;
        state.touch.startY = touch.clientY;
        state.touch.id = touch.identifier;
    }, {passive: false});

    joyZone.addEventListener('touchmove', e => {
        e.preventDefault();
        [...e.changedTouches].forEach(t => {
            if (t.identifier === state.touch.id) {
                let dx = t.clientX - state.touch.startX;
                let dy = t.clientY - state.touch.startY;
                const dist = Math.min(50, Math.hypot(dx, dy));
                const angle = Math.atan2(dy, dx);
                state.touch.dx = Math.cos(angle) * (dist / 50);
                state.touch.dy = Math.sin(angle) * (dist / 50);
            }
        });
    }, {passive: false});

    joyZone.addEventListener('touchend', e => {
        e.preventDefault();
        state.touch.active = false;
        state.touch.dx = 0;
        state.touch.dy = 0;
    });

    attackBtn.addEventListener('touchstart', e => {
        e.preventDefault();
        state.touch.attackBtn = true;
    }, {passive: false});
    
    attackBtn.addEventListener('touchend', e => {
        e.preventDefault();
        state.touch.attackBtn = false;
    });

    // UI Buttons
    document.getElementById('startBtn').onclick = startGame;
    document.getElementById('upgradeBtn').onclick = toggleUpgradeMenu;
    document.getElementById('closeUpgradeBtn').onclick = toggleUpgradeMenu;
    document.getElementById('restartBtn').onclick = resetGame;
    document.getElementById('restartWinBtn').onclick = resetGame;

    // Upgrade Logic
    setupUpgrades();

    // Start Loop
    loop();
}

function startGame() {
    state.screen = 'game';
    document.getElementById('startScreen').classList.remove('active');
    spawnEnemies();
    updateUI();
}

function spawnEnemies() {
    const count = 3 + state.stage;
    for(let i=0; i<count; i++) {
        state.enemies.push(new Enemy(state.stage));
    }
}

function checkStageProgress() {
    if (state.bearsKilled >= state.bearsToNextStage) {
        state.stage++;
        state.bearsKilled = 0;
        state.bearsToNextStage += 2;
        
        if (state.stage > state.maxStages) {
            state.screen = 'win';
            document.getElementById('winScreen').classList.add('active');
        } else {
            spawnFloatingText('STAGE ' + state.stage, player.x, player.y - 50, '#3498db');
            spawnEnemies();
            updateUI();
        }
    } else if (state.enemies.length === 0) {
        spawnEnemies(); // Respawn wave if cleared but stage not done
    }
}

function updateUI() {
    document.getElementById('moneyDisplay').innerText = state.money;
    document.getElementById('meatDisplay').innerText = state.meat;
    document.getElementById('meatCapDisplay').innerText = CONFIG.meatCap;
    document.getElementById('stageDisplay').innerText = state.stage;
    document.getElementById('healthBarFill').style.width = (player.hp / player.maxHp * 100) + '%';
    checkUpgradeAffordability();
}

function gameOver() {
    state.screen = 'gameover';
    document.getElementById('finalStage').innerText = state.stage;
    document.getElementById('gameOverScreen').classList.add('active');
}

function resetGame() {
    location.reload();
}

// --- RENDER & LOOP ---

function update() {
    if (state.screen !== 'game') return;

    player.update();
    machine.update();

    state.enemies.forEach(e => e.update());
    
    // Drop logic
    for (let i = state.drops.length - 1; i >= 0; i--) {
        if (state.drops[i].update()) state.drops.splice(i, 1);
    }

    // Particle logic
    for (let i = state.particles.length - 1; i >= 0; i--) {
        let p = state.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        if (p.life <= 0) state.particles.splice(i, 1);
    }

    // Camera follow
    state.cam.x = player.x - canvas.width / 2;
    state.cam.y = player.y - canvas.height / 2;

    // Environmental Snow
    if (Math.random() < 0.3) {
        state.particles.push({
            x: state.cam.x + Math.random() * canvas.width,
            y: state.cam.y - 10,
            vx: Math.random() - 0.5,
            vy: 2 + Math.random(),
            life: 200,
            color: 'white',
            size: 2
        });
    }
}

function draw() {
    // Clear
    ctx.fillStyle = '#0b1016';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Grid (Ground)
    ctx.save();
    ctx.strokeStyle = '#1c2b36';
    ctx.lineWidth = 1;
    const gridSize = 100;
    const offsetX = -state.cam.x % gridSize;
    const offsetY = -state.cam.y % gridSize;
    
    for(let x=offsetX; x<canvas.width; x+=gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for(let y=offsetY; y<canvas.height; y+=gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
    ctx.restore();

    machine.draw();
    state.drops.forEach(d => d.draw());
    state.enemies.forEach(e => e.draw());
    player.draw();

    // Particles
    state.particles.forEach(p => {
        const sx = p.x - state.cam.x;
        const sy = p.y - state.cam.y;
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life / 30;
        ctx.beginPath();
        ctx.arc(sx, sy, p.size, 0, Math.PI*2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    });

    // Floating Text
    for (let i = state.texts.length - 1; i >= 0; i--) {
        let t = state.texts[i];
        t.y -= 0.5;
        t.life--;
        
        ctx.fillStyle = t.color;
        ctx.font = 'bold 16px Arial';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 2;
        ctx.strokeText(t.text, t.x - state.cam.x, t.y - state.cam.y);
        ctx.fillText(t.text, t.x - state.cam.x, t.y - state.cam.y);

        if (t.life <= 0) state.texts.splice(i, 1);
    }

    // Snow Overlay
    // (Already handled in particles, but we can add a vignette here)
    const gradient = ctx.createRadialGradient(canvas.width/2, canvas.height/2, canvas.height/3, canvas.width/2, canvas.height/2, canvas.height);
    gradient.addColorStop(0, 'transparent');
    gradient.addColorStop(1, 'rgba(100, 200, 255, 0.1)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0,0, canvas.width, canvas.height);
}

function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

// --- UPGRADE SYSTEM ---
const upgrades = {
    upgDmg: { cost: 100, apply: () => CONFIG.playerDmg += 10 },
    upgHp: { cost: 100, apply: () => { CONFIG.playerHp += 50; player.maxHp += 50; player.hp += 50; } },
    upgSpd: { cost: 150, apply: () => CONFIG.playerSpeed += 0.5 },
    upgCap: { cost: 200, apply: () => CONFIG.meatCap += 5 },
    upgMach: { cost: 300, apply: () => CONFIG.machineValue += 5 }
};

function setupUpgrades() {
    Object.keys(upgrades).forEach(id => {
        const el = document.getElementById(id);
        const btn = el.querySelector('button');
        const data = upgrades[id];
        
        btn.innerText = data.cost + 'g';
        
        btn.onclick = () => {
            if (state.money >= data.cost) {
                state.money -= data.cost;
                data.apply();
                data.cost = Math.floor(data.cost * 1.5); // Price scaling
                btn.innerText = data.cost + 'g';
                updateUI();
            }
        };
    });
}

function checkUpgradeAffordability() {
    Object.keys(upgrades).forEach(id => {
        const el = document.getElementById(id);
        const btn = el.querySelector('button');
        if (state.money < upgrades[id].cost) {
            btn.disabled = true;
        } else {
            btn.disabled = false;
        }
    });
}

function toggleUpgradeMenu() {
    if (state.screen === 'start' || state.screen === 'gameover') return;
    
    const menu = document.getElementById('upgradeMenu');
    if (state.screen === 'game') {
        state.screen = 'upgrade';
        menu.classList.add('active');
        updateUI();
    } else {
        state.screen = 'game';
        menu.classList.remove('active');
    }
}

// Init
init();
