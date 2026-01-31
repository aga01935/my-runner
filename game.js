import * as THREE from 'three';

// --- CONFIGURATION ---
const LANE_WIDTH = 2.5;
const GRAVITY = -18;
const JUMP_FORCE = 8;
const BASE_SPEED = 15;
const MAX_SPEED = 40;

// --- STATE ---
let scene, camera, renderer;
let player;
let isGameActive = false;
let score = 0;
let coins = 0;
let speed = BASE_SPEED;
let clock = new THREE.Clock();

// Player State
let currentLane = 0; // -1 (Left), 0 (Middle), 1 (Right)
let targetX = 0;
let verticalVelocity = 0;
let isJumping = false;
let isSliding = false;
let slideTimer = 0;

// World Objects
let rollingGround;
const obstacles = [];
const coinsList = [];
const particles = [];

// DOM Elements
const scoreEl = document.getElementById('score');
const coinsEl = document.getElementById('coins');
const gameOverScreen = document.getElementById('game-over-screen');
const startScreen = document.getElementById('start-screen');
const finalScoreEl = document.getElementById('final-score');

// --- INITIALIZATION ---
function init() {
    // 1. Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x2c003e); // Deep purple sky
    scene.fog = new THREE.Fog(0x2c003e, 20, 60);

    // 2. Camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 5, 8);
    camera.lookAt(0, 0, -5);

    // 3. Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // 4. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xff00ff, 0.8);
    dirLight.position.set(10, 20, 0);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // 5. Create World
    createPlayer();
    createEnvironment();

    // 6. Event Listeners
    window.addEventListener('resize', onWindowResize);
    document.addEventListener('keydown', handleKeyDown);
    setupTouchControls();

    document.getElementById('start-btn').addEventListener('click', startGame);
    document.getElementById('restart-btn').addEventListener('click', resetGame);

    loop();
}

// --- CREATION FUNCTIONS ---

function createPlayer() {
    const geometry = new THREE.BoxGeometry(1, 1.8, 1);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0x00ffff, // Cyan
        emissive: 0x004444,
        roughness: 0.1
    });
    player = new THREE.Mesh(geometry, material);
    player.castShadow = true;
    player.position.y = 0.9; // Sit on ground
    scene.add(player);
}

function createEnvironment() {
    // Infinite Floor Logic: A large plane that rotates textures or moves
    const planeGeo = new THREE.PlaneGeometry(100, 200, 20, 20);
    const planeMat = new THREE.MeshStandardMaterial({ 
        color: 0x111111,
        roughness: 0.8,
        wireframe: false
    });
    rollingGround = new THREE.Mesh(planeGeo, planeMat);
    rollingGround.rotation.x = -Math.PI / 2;
    rollingGround.position.z = -50;
    rollingGround.receiveShadow = true;
    scene.add(rollingGround);
    
    // Grid Helper for "Synthwave" look
    const gridHelper = new THREE.GridHelper(200, 100, 0xff00ff, 0x330033);
    gridHelper.position.y = 0.01;
    gridHelper.position.z = -50;
    scene.add(gridHelper);
}

function spawnObstacle() {
    // Randomize Lane
    const lane = Math.floor(Math.random() * 3) - 1; // -1, 0, 1
    const xPos = lane * LANE_WIDTH;

    // Determine type: 0 = Barrier (Jump), 1 = High Barrier (Slide), 2 = Train (Full Block)
    const type = Math.random() > 0.8 ? 2 : (Math.random() > 0.5 ? 1 : 0);

    let geometry, material, mesh;

    if (type === 2) { 
        // Train
        geometry = new THREE.BoxGeometry(2, 3, 8);
        material = new THREE.MeshStandardMaterial({ color: 0xff0000 }); // Red
        mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(xPos, 1.5, -60);
        mesh.userData = { type: 'train' };
    } else if (type === 1) {
        // High Barrier (Requires slide)
        geometry = new THREE.BoxGeometry(2, 1, 0.5);
        material = new THREE.MeshStandardMaterial({ color: 0xffaa00 }); // Orange
        mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(xPos, 2.0, -60); // Floating high
        mesh.userData = { type: 'barrier_high' };
    } else {
        // Low Barrier (Requires jump)
        geometry = new THREE.BoxGeometry(2, 1, 0.5);
        material = new THREE.MeshStandardMaterial({ color: 0xffaa00 }); 
        mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(xPos, 0.5, -60); 
        mesh.userData = { type: 'barrier_low' };
    }

    mesh.castShadow = true;
    scene.add(mesh);
    obstacles.push(mesh);
}

function spawnCoin() {
    const lane = Math.floor(Math.random() * 3) - 1;
    const xPos = lane * LANE_WIDTH;
    
    // Simple Torus for coin
    const geometry = new THREE.TorusGeometry(0.3, 0.1, 8, 16);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0xffd700, // Gold
        emissive: 0xaa6600 
    });
    const coin = new THREE.Mesh(geometry, material);
    coin.position.set(xPos, 1, -60);
    coin.rotation.y = Math.PI / 2;
    
    scene.add(coin);
    coinsList.push(coin);
}

// --- GAMEPLAY LOGIC ---

function startGame() {
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    isGameActive = true;
    score = 0;
    coins = 0;
    speed = BASE_SPEED;
    scoreEl.innerText = '0';
    coinsEl.innerText = '0';
    
    // Reset Player
    currentLane = 0;
    player.position.set(0, 0.9, 0);
    player.scale.set(1, 1, 1);
    
    // Clear old objects
    obstacles.forEach(o => scene.remove(o));
    coinsList.forEach(c => scene.remove(c));
    obstacles.length = 0;
    coinsList.length = 0;
}

function resetGame() {
    startGame();
}

function gameOver() {
    isGameActive = false;
    finalScoreEl.innerText = Math.floor(score);
    gameOverScreen.classList.remove('hidden');
}

// --- CONTROL HANDLERS ---

function handleKeyDown(event) {
    if (!isGameActive) return;

    if (event.key === 'ArrowLeft' || event.key === 'a') changeLane(-1);
    if (event.key === 'ArrowRight' || event.key === 'd') changeLane(1);
    if (event.key === 'ArrowUp' || event.key === 'w') jump();
    if (event.key === 'ArrowDown' || event.key === 's') slide();
}

function changeLane(dir) {
    const potentialLane = currentLane + dir;
    if (potentialLane >= -1 && potentialLane <= 1) {
        currentLane = potentialLane;
    }
}

function jump() {
    if (!isJumping && !isSliding) {
        verticalVelocity = JUMP_FORCE;
        isJumping = true;
    }
}

function slide() {
    if (!isSliding && !isJumping) {
        isSliding = true;
        slideTimer = 0.8; // Slide for 0.8 seconds
        player.scale.y = 0.5; // Shrink
        // Adjust position so we don't float
        // Normal height 1.8 (center 0.9). Half height 0.9 (center 0.45)
    }
}

function setupTouchControls() {
    let touchStartX = 0;
    let touchStartY = 0;

    document.addEventListener('touchstart', e => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    });

    document.addEventListener('touchend', e => {
        if (!isGameActive) return;
        const touchEndX = e.changedTouches[0].screenX;
        const touchEndY = e.changedTouches[0].screenY;
        
        const dx = touchEndX - touchStartX;
        const dy = touchEndY - touchStartY;

        if (Math.abs(dx) > Math.abs(dy)) {
            // Horizontal Swipe
            if (dx > 30) changeLane(1);
            else if (dx < -30) changeLane(-1);
        } else {
            // Vertical Swipe
            if (dy < -30) jump();
            else if (dy > 30) slide();
        }
    });
}

// --- MAIN LOOP ---

function loop() {
    requestAnimationFrame(loop);
    const dt = clock.getDelta();

    if (!isGameActive) return;

    // 1. Update Player Position (Lerp for smooth lane switching)
    targetX = currentLane * LANE_WIDTH;
    player.position.x += (targetX - player.position.x) * 10 * dt;

    // 2. Physics (Jump & Gravity)
    if (isJumping) {
        player.position.y += verticalVelocity * dt;
        verticalVelocity += GRAVITY * dt;
        
        // Ground Check
        if (player.position.y <= 0.9 && verticalVelocity < 0) {
            player.position.y = 0.9;
            isJumping = false;
        }
    } else if (isSliding) {
        slideTimer -= dt;
        if (slideTimer <= 0) {
            isSliding = false;
            player.scale.y = 1; // Reset size
        }
    }

    // 3. Move Environment (Illusion of speed)
    // Instead of moving player forward, we move obstacles backward
    const moveDist = speed * dt;
    score += moveDist * 0.1;
    scoreEl.innerText = Math.floor(score);

    // Increase speed over time
    if (speed < MAX_SPEED) speed += 0.5 * dt;

    // 4. Object Management (Spawn/Move/Destroy)
    
    // Spawning Probability based on speed
    if (Math.random() < 0.02 + (speed/1000)) spawnObstacle();
    if (Math.random() < 0.02) spawnCoin();

    // Move Obstacles
    for (let i = obstacles.length - 1; i >= 0; i--) {
        let obs = obstacles[i];
        obs.position.z += moveDist;

        // Collision Check
        // Simple AABB collision logic
        const pBox = new THREE.Box3().setFromObject(player);
        // Slightly shrink player box for forgiveness
        pBox.expandByScalar(-0.3);
        
        const oBox = new THREE.Box3().setFromObject(obs);
        
        if (pBox.intersectsBox(oBox)) {
            gameOver();
        }

        // Cleanup
        if (obs.position.z > 10) {
            scene.remove(obs);
            obstacles.splice(i, 1);
        }
    }

    // Move Coins
    for (let i = coinsList.length - 1; i >= 0; i--) {
        let coin = coinsList[i];
        coin.position.z += moveDist;
        coin.rotation.z += 5 * dt; // Spin

        const pBox = new THREE.Box3().setFromObject(player);
        const cBox = new THREE.Box3().setFromObject(coin);

        if (pBox.intersectsBox(cBox)) {
            scene.remove(coin);
            coinsList.splice(i, 1);
            coins++;
            coinsEl.innerText = coins;
            // Add slight speed boost on coin pickup?
        }
        else if (coin.position.z > 10) {
            scene.remove(coin);
            coinsList.splice(i, 1);
        }
    }

    renderer.render(scene, camera);
}

// Handle Window Resize
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Start
init();