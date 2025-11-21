class AudioController {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.dataArray = null;
        this.isListening = false;
    }

    async init() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.microphone = this.audioContext.createMediaStreamSource(stream);
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            this.microphone.connect(this.analyser);
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            this.isListening = true;
            return true;
        } catch (error) {
            console.error('Microphone access denied:', error);
            alert('Please enable microphone access to play!');
            return false;
        }
    }

    getVolume() {
        if (!this.isListening) return 0;
        this.analyser.getByteFrequencyData(this.dataArray);
        let sum = 0;
        for (let i = 0; i < this.dataArray.length; i++) {
            sum += this.dataArray[i];
        }
        const average = sum / this.dataArray.length;
        // Normalize to 0-1 range, with some thresholding
        return Math.min(Math.max((average - 10) / 50, 0), 1);
    }
}

class Game {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.audioController = new AudioController();

        this.state = 'START'; // START, PLAYING, END
        this.width = window.innerWidth;
        this.height = window.innerHeight;

        this.airplane = {
            x: 100,
            y: this.height / 2,
            velocity: { x: 0, y: 0 },
            angle: 0,
            scale: 1.5
        };

        this.camera = { x: 0 };
        this.clouds = [];
        this.particles = [];

        this.distance = 0;
        this.lastTime = 0;
        this.highScore = localStorage.getItem('paperWingsHighScore') || 0;

        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.bindEvents();
        this.loop = this.loop.bind(this);

        // Initialize some clouds
        for (let i = 0; i < 10; i++) {
            this.spawnCloud(Math.random() * this.width);
        }
    }

    resize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
    }

    bindEvents() {
        document.getElementById('start-btn').addEventListener('click', async () => {
            const success = await this.audioController.init();
            if (success) {
                this.startGame();
            }
        });

        document.getElementById('restart-btn').addEventListener('click', () => {
            this.resetGame();
            this.startGame();
        });
    }

    spawnCloud(xOffset) {
        this.clouds.push({
            x: xOffset + this.camera.x,
            y: Math.random() * (this.height * 0.6),
            width: 100 + Math.random() * 150,
            speed: 0.2 + Math.random() * 0.5
        });
    }

    startGame() {
        this.state = 'PLAYING';
        document.getElementById('start-screen').classList.remove('active');
        document.getElementById('game-over-screen').classList.remove('active');
        document.getElementById('game-hud').classList.add('active');

        this.resetPhysics();
        this.lastTime = performance.now();
        requestAnimationFrame(this.loop);
    }

    resetPhysics() {
        this.airplane.x = 100;
        // 木头架子高度约为屏幕高度的60%，纸飞机放在架子顶部
        // 地面在 height - 150，架子从地面向上延伸约60%的屏幕高度
        const standHeight = this.height * 0.6;
        this.airplane.y = this.height - 150 - standHeight;
        this.airplane.velocity = { x: 0, y: 0 };
        this.airplane.angle = 0;
        this.distance = 0;
        this.camera.x = 0;

        // One-time blow mechanic state
        this.hasStartedBlowing = false;
        this.canBlow = true;
    }

    resetGame() {
        this.resetPhysics();
        this.updateUI();
    }

    update(dt) {
        if (this.state !== 'PLAYING') return;

        const windForce = this.audioController.getVolume();

        // Update Wind UI
        const windBar = document.getElementById('wind-bar');
        windBar.style.width = `${windForce * 100}%`;

        // Physics Constants
        const GRAVITY = 0.75; // Tuned gravity (was 1.0)
        const LIFT = 0.5; // Reduced lift (was 0.8)
        const DRAG = 0.98;
        const BOOST = 1.2; // Reduced boost (was 2.0)
        const GLIDE_LIFT = 0.02; // Reduced glide lift (was 0.05)

        // Apply forces
        const BLOW_THRESHOLD = 0.60; // Increased difficulty threshold (was 0.20)

        if (windForce > BLOW_THRESHOLD) {
            this.hasStartedBlowing = true;
            this.airplane.velocity.x += windForce * BOOST;
            this.airplane.velocity.y -= windForce * LIFT;

            // Add wind particles
            if (Math.random() > 0.5) {
                this.particles.push({
                    x: this.airplane.x - 20,
                    y: this.airplane.y + (Math.random() - 0.5) * 20,
                    vx: -2 - Math.random() * 2,
                    vy: (Math.random() - 0.5) * 1,
                    life: 1.0
                });
            }
        }

        // Natural glide lift (faster = more lift)
        this.airplane.velocity.y -= Math.abs(this.airplane.velocity.x) * GLIDE_LIFT;

        // Gravity
        if (this.hasStartedBlowing) {
            this.airplane.velocity.y += GRAVITY;
        } else {
            // Keep stationary on stand
            this.airplane.velocity.y = 0;
            this.airplane.velocity.x = 0;
            // 锁定在木头架子顶部（屏幕高度的60%位置）
            const standHeight = this.height * 0.6;
            this.airplane.y = this.height - 150 - standHeight;
        }

        // Drag
        this.airplane.velocity.x *= DRAG;
        this.airplane.velocity.y *= DRAG;

        // Terminal velocity
        this.airplane.velocity.y = Math.min(this.airplane.velocity.y, 10);
        this.airplane.velocity.x = Math.min(this.airplane.velocity.x, 20);

        // Update position
        this.airplane.x += this.airplane.velocity.x;
        this.airplane.y += this.airplane.velocity.y;

        // Calculate angle
        // Smooth rotation towards velocity vector
        const targetAngle = Math.atan2(this.airplane.velocity.y, this.airplane.velocity.x);
        this.airplane.angle += (targetAngle - this.airplane.angle) * 0.1;

        // Update distance
        this.distance = Math.max(0, (this.airplane.x - 100) / 50); // Scale pixels to meters

        // Camera Follow
        // Keep airplane at 1/3 of screen width
        const targetCameraX = this.airplane.x - this.width * 0.3;
        this.camera.x = Math.max(0, targetCameraX);

        // Bounds checking (Ground)
        if (this.airplane.y > this.height - 150) {
            this.endGame();
        }

        // Ceiling check - limit max height to 80% of screen (top 20% cannot be reached)
        const ceilingY = this.height * 0.2;
        if (this.airplane.y < ceilingY) {
            this.airplane.y = ceilingY;
            this.airplane.velocity.y *= 0.5;
        }

        // Update Clouds
        // Spawn new clouds as we move
        if (this.clouds.length < 15 || this.clouds[this.clouds.length - 1].x < this.camera.x + this.width) {
            if (Math.random() < 0.05) {
                this.spawnCloud(this.camera.x + this.width + Math.random() * 200);
            }
        }
        // Remove old clouds - 考虑视差效果，云朵的实际屏幕位置是 cloud.x - camera.x * 0.5
        this.clouds = this.clouds.filter(c => {
            const parallaxX = c.x - this.camera.x * 0.5;
            return parallaxX + c.width > -100; // 只有完全移出屏幕左侧才移除
        });

        // Update Particles
        this.particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.05;
        });
        this.particles = this.particles.filter(p => p.life > 0);
    }

    draw() {
        this.ctx.clearRect(0, 0, this.width, this.height);

        this.ctx.save();

        // Draw Sky Gradient (Parallax?)
        // For now simple gradient

        // Draw Stand
        this.drawStand();

        // Draw Clouds (Parallax)
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        this.clouds.forEach(cloud => {
            const parallaxX = cloud.x - this.camera.x * 0.5; // Move slower than camera
            this.drawCloud(parallaxX, cloud.y, cloud.width);
        });

        // Draw Ground
        const groundY = this.height - 150;
        this.ctx.fillStyle = '#81ecec';
        this.ctx.fillRect(0, groundY, this.width, 150);

        // Draw Distance Markers on Ground
        this.ctx.fillStyle = '#b2bec3';
        this.ctx.font = '12px Outfit';
        const startMarker = Math.floor(this.camera.x / 200) * 200;
        for (let m = startMarker; m < this.camera.x + this.width; m += 200) {
            const screenX = m - this.camera.x;
            this.ctx.fillRect(screenX, groundY, 2, 10);
            this.ctx.fillText(`${m / 50}m`, screenX + 5, groundY + 20);
        }

        // Draw Airplane
        const screenX = this.airplane.x - this.camera.x;
        this.ctx.save();
        this.ctx.translate(screenX, this.airplane.y);
        this.ctx.rotate(this.airplane.angle);
        this.ctx.scale(this.airplane.scale, this.airplane.scale);

        // Better Airplane Shape
        this.ctx.beginPath();
        this.ctx.moveTo(30, 0);
        this.ctx.lineTo(-15, 15);
        this.ctx.lineTo(-5, 0);
        this.ctx.lineTo(-15, -15);
        this.ctx.closePath();

        // Gradient for plane
        const grd = this.ctx.createLinearGradient(-15, 0, 30, 0);
        grd.addColorStop(0, '#ff9ff3');
        grd.addColorStop(1, '#feca57');
        this.ctx.fillStyle = grd;
        this.ctx.fill();

        // Wing shadow/detail
        this.ctx.beginPath();
        this.ctx.moveTo(-5, 0);
        this.ctx.lineTo(-15, 5);
        this.ctx.lineTo(-15, -5);
        this.ctx.fillStyle = 'rgba(0,0,0,0.1)';
        this.ctx.fill();

        this.ctx.restore();

        // Draw Particles
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        this.particles.forEach(p => {
            const pScreenX = p.x - this.camera.x;
            this.ctx.beginPath();
            this.ctx.arc(pScreenX, p.y, 2 * p.life, 0, Math.PI * 2);
            this.ctx.fill();
        });

        this.ctx.restore();
    }

    drawCloud(x, y, width) {
        this.ctx.beginPath();
        this.ctx.arc(x, y, width * 0.3, 0, Math.PI * 2);
        this.ctx.arc(x + width * 0.3, y - width * 0.1, width * 0.4, 0, Math.PI * 2);
        this.ctx.arc(x + width * 0.6, y, width * 0.35, 0, Math.PI * 2);
        this.ctx.fill();
    }

    drawStand() {
        const standX = 100 - this.camera.x;
        const standBaseY = this.height - 150; // Ground level
        // 木头架子高度为屏幕高度的60%
        const standHeight = this.height * 0.6;
        const standTopY = standBaseY - standHeight;

        // Only draw if visible
        if (standX < -50 || standX > this.width) return;

        this.ctx.save();
        this.ctx.fillStyle = '#8d6e63'; // Wood color

        // Main post
        this.ctx.fillRect(standX + 10, standTopY, 10, standHeight);

        // Base
        this.ctx.fillRect(standX, standBaseY - 10, 30, 10);

        // Top platform
        this.ctx.fillRect(standX, standTopY, 40, 5);

        this.ctx.restore();
    }

    updateUI() {
        document.getElementById('distance-display').textContent = `${this.distance.toFixed(1)}m`;
    }

    endGame() {
        this.state = 'END';
        document.getElementById('game-hud').classList.remove('active');
        document.getElementById('game-over-screen').classList.add('active');
        document.getElementById('final-distance').textContent = `${this.distance.toFixed(1)}m`;

        if (this.distance > this.highScore) {
            this.highScore = this.distance;
            localStorage.setItem('paperWingsHighScore', this.highScore);
        }
    }

    loop(timestamp) {
        if (this.state !== 'PLAYING') return;

        const dt = (timestamp - this.lastTime) / 16;
        this.lastTime = timestamp;

        this.update(dt);
        this.draw();
        this.updateUI();

        requestAnimationFrame(this.loop);
    }
}

// Initialize
window.onload = () => {
    const game = new Game();
};
