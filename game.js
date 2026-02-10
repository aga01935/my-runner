/**
 * ARCTIC APEX - REGION BOUNDARY & GRINDER UPDATE
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const CONFIG = {
    playerSpeed: 5.5,
    playerDmg: 40,          // Buffed damage to ensure kills
    playerHp: 200,
    playerAttackCooldown: 20, 
    meatCap: 12,
    machineSpeed: 40, 
    machineValue: 15, 
    drag: 0.82,
    huntBoundary: 400      // Bears cannot go left of this X coordinate
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
    grinderSlices: [] // For the new animation
};

// --- NEW ANIMATED GRINDER MACHINE ---
class Machine {
    constructor() {
        this.x = -200; // Safe zone
        this.y = 0;
        this.timer = 0;
        this.rotation = 0;
    }
    update() {
        const dist = Math.hypot(player.x - this.x, player.y - this.y);
        // Collect meat from player
        if (dist < 100 && state.meat > 0) {
            state.meatStored += state.meat;
            state.meat = 0;
            updateUI();
        }
        
        // Grind Animation
        if (state.meatStored > 0) {
            this.timer++;
            this.rotation += 0.2; // Spin the gears
            
            if (this.timer >= CONFIG.machineSpeed) {
                this.timer = 0;
                state.meatStored--;
                state.money += CONFIG.machineValue;
                // Create a "Meat Slice" animation particle
                state.grinderSlices.push({
                    x: this.x, y: this.y, 
                    vx: 2 + Math.random() * 2, vy: (Math.random() - 0.5) * 4, 
                    life: 40
                });
                updateUI();
            }
        }
    }
    draw() {
        const sx = this.x - state.cam.x, sy = this.y - state.cam.y;
        
        // Machine Body
        ctx.fillStyle = '#2c3e50';
        ctx.fillRect(sx - 60, sy - 60, 120, 120);
        
        // Spinning Gear
        ctx.save();
        ctx.translate(sx, sy - 20);
        ctx.rotate(this.rotation);
        ctx.fillStyle = '#7f8c8d';
        for(let i=0; i<8; i++) {
            ctx.rotate(Math.PI/4);
            ctx.fillRect(-5, -35, 10, 70);
        }
        ctx.restore();

        // Output Slot
        ctx.fillStyle = '#1a252f';
        ctx.fillRect(sx + 40, sy, 20, 40);
        
        // Processing Text
        if (state.meatStored > 0) {
            ctx.fillStyle = '#2ecc71';
            ctx.font = 'bold 14px Arial';
            ctx.fillText("GRINDING...", sx, sy + 80);
        }
    }
}

class Player {
    constructor() {
        this.x = -100; this.y = 0; this.vx = 0; this.vy = 0;
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

        // Check if bears are hit
        state.enemies.forEach(e => {
            const dist = Math.hypot(e.x - hitX, e.y - hitY);
            if (dist < 75) { // Hit Detection Box
                e.takeDamage(CONFIG.playerDmg);
                state.shake = 6;
                spawnFloatingText("-" + CONFIG.playerDmg, e.x, e.y, '#f1c40f');
                createBlood(e.x, e.y);
            }
        });
    }

    draw() {
        ctx.save();
        ctx.translate(this.x - state.cam.x, this.y - state.cam.y);
        ctx.rotate(this.angle);
        ctx.fillStyle = '#3498db'; // Changed to blue so you can see player clearly
        ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
        // Weapon Spear
        ctx.fillStyle = '#ecf0f1'; ctx.fillRect(15, -3, 50, 6);
        ctx.restore();
    }
}

class Enemy {
    constructor(tier) {
        // Spawn ONLY inside the hunt region (X > 400)
        this.x = CONFIG.huntBoundary + 200 + Math.random() * 800;
        this.y = (Math.random() - 0.5) * 1000;
        const scale = 1 + (tier * 0.2);
        this.radius = 22 * scale;
        this.hp = 60 * scale; 
        this.maxHp = this.hp;
        this.speed = 1.0 + (tier * 0.1);
        this.dmg = 5 + (tier * 2);
        this.attackTimer = 0;
        this.flash = 0;
    }

    update() {
        const dx = player.x - this.x, dy = player.y - this.y;
        const dist = Math.hypot(dx, dy);
        if (this.flash > 0) this.flash--;
        if (this.attackTimer > 0) this.attackTimer--;

        // Chasing logic
        if (dist < 600) { // Only chase if player is close
            const angle = Math.atan2(dy, dx);
            const nextX = this.x + Math.cos(angle) * this.speed;
            const nextY = this.y + Math.sin(angle) * this.speed;

            // PREVENT LEAVING HUNT REGION
            if (nextX > CONFIG.huntBoundary) {
                this.x = nextX;
                this.y = nextY;
            }
        }

        // Damage Player
        if (dist < this.radius + 15 && this.attackTimer <= 0) {
            player.hp -= this.dmg;
            this.attackTimer = 60;
            updateUI();
            if (player.hp <= 0) gameOver();
        }
    }

    takeDamage(amt) {
        this.hp -= amt;
        this.flash = 10;
        if (this.hp <= 0) this.die();
    }

    die() {
        state.enemies = state.enemies.filter(e => e !== this);
        state.bearsKilled++;
        // Guarantee drops
        for(let i=0; i<3; i++) state.drops.push(new Drop(this.x, this.y));
        checkStageProgress();
    }

    draw() {
        const sx = this.x - state.cam.x, sy = this.y - state.cam.y;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(Math.atan2(player.y - this.y, player.x - this.x));
        // Bear color changes to red when hit
        ctx.fillStyle = this.flash > 0 ? '#ff7675' : 'white';
        ctx.beginPath(); ctx.ellipse(0, 0, this.radius * 1.3, this.radius, 0, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(this.radius, 0, this.radius*0.7, 0, Math.PI*2); ctx.fill();
        ctx.restore();
        // Clear HP Bar
        ctx.fillStyle = '#333'; ctx.fillRect(sx - 20, sy - 35, 40, 6);
        ctx.fillStyle = '#2ecc71'; ctx.fillRect(sx - 20, sy - 35, 40 * (this.hp/this.maxHp), 6);
    }
}

// ... Drop class remains same as previous balanced version ...
class Drop {
    constructor(x, y) { this.x = x; this.y = y; this.life = 600; }
    update() {
        this.life--;
        const d = Math.hypot(player.x - this.x, player.y - this.y);
        if (d < 30 && state.meat < CONFIG.meatCap) { state.meat++; updateUI(); return true; }
        if (d < 200) { this.x += (player.x - this.x) * 0.15; this.y += (player.y - this.y) * 0.15; }
        return this.life <= 0;
    }
    draw() {
        const sx = this.x - state.cam.x, sy = this.y - state.cam.y;
        ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.arc(sx, sy, 8, 0, Math.PI*2); ctx.fill();
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
    if (state.screen === 'game') {
        player.update();
        machine.update();
        state.enemies.forEach(e => e.update());
        state.drops = state.drops.filter(d => !d.update());
        state.particles = state.particles.filter(p => { p.x += p.vx; p.y += p.vy; p.life--; return p.life > 0; });
        state.texts = state.texts.filter(t => { t.y -= 0.5; t.life--; return t.life > 0; });
        
        // Meat Slice Particles
        state.grinderSlices = state.grinderSlices.filter(s => {
            s.x += s.vx; s.y += s.vy; s.life--;
            return s.life > 0;
        });
        
        state.cam.x += (player.x - canvas.width / 2 - state.cam.x) * 0.1;
        state.cam.y += (player.y - canvas.height / 2 - state.cam.y) * 0.1;
        if (state.shake > 0) { state.cam.x += (Math.random()-0.5)*state.shake; state.cam.y += (Math.random()-0.5)*state.shake; state.shake *= 0.9; }
    }

    ctx.fillStyle = '#0b1016'; ctx.fillRect(0, 0, canvas.width, canvas.height);

    // DRAW BOUNDARY LINE
    ctx.strokeStyle = 'rgba(231, 76, 60, 0.5)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(CONFIG.huntBoundary - state.cam.x, -2000 - state.cam.y);
    ctx.lineTo(CONFIG.huntBoundary - state.cam.x, 2000 - state.cam.y);
    ctx.stroke();

    machine.draw();
    state.drops.forEach(d => d.draw());
    state.enemies.forEach(e => e.draw());
    player.draw();

    // Draw Meat Slices from machine
    state.grinderSlices.forEach(s => {
        ctx.fillStyle = '#ff7675';
        ctx.fillRect(s.x - state.cam.x, s.y - state.cam.y, 15, 8);
    });

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
