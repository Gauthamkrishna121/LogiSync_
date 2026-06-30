/**
 * auth_particles.js — Slow, fluid star-field with gentle cursor repulsion
 * Particles drift like distant stars. Cursor softly pushes them aside.
 * No green tint, no bouncing, no attraction. Pure elegance.
 */
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('particle-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let width, height;
    let particles = [];
    let mouse = { x: -9999, y: -9999, prevX: -9999, prevY: -9999 };
    let isHovering = false;
    let animId;

    /* ── Tuning knobs ─────────────────────────────────────── */
    const COUNT          = 280;     // Total particles
    const REPEL_RADIUS   = 130;     // Cursor influence zone
    const REPEL_FORCE    = 1.8;     // How hard the push is (very gentle)
    const FRICTION       = 0.985;   // High = very smooth, slow stop
    const RETURN_SPEED   = 0.003;   // How slowly particles drift home
    const MAX_SPEED      = 1.2;     // Speed clamp (prevents bouncing)
    const LINE_DIST      = 100;     // Max distance for faint connections
    const LINE_OPACITY   = 0.04;    // Very subtle connection lines

    /* ── Setup ────────────────────────────────────────────── */
    function resize() {
        width  = canvas.parentElement.clientWidth;
        height = canvas.parentElement.clientHeight;
        canvas.width  = width;
        canvas.height = height;
        // Re-seed particles if size changed drastically
        if (particles.length === 0) initParticles();
    }

    // Enable pointer events on parent so we capture mouse
    const container = canvas.parentElement;
    container.style.pointerEvents = 'auto';
    // But keep canvas itself non-blocking so content behind is clickable
    canvas.style.pointerEvents = 'none';

    container.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mouse.prevX = mouse.x;
        mouse.prevY = mouse.y;
        mouse.x = e.clientX - rect.left;
        mouse.y = e.clientY - rect.top;
        isHovering = true;
    });

    container.addEventListener('mouseleave', () => {
        isHovering = false;
        mouse.x = -9999;
        mouse.y = -9999;
    });

    window.addEventListener('resize', resize);
    resize();

    /* ── Color palette — muted blues, cyans, soft whites ── */
    const colors = [
        { r: 120, g: 160, b: 230 },  // Soft blue
        { r: 100, g: 190, b: 220 },  // Muted cyan
        { r: 150, g: 170, b: 210 },  // Lavender blue
        { r: 80,  g: 200, b: 210 },  // Teal
        { r: 170, g: 180, b: 220 },  // Pale periwinkle
        { r: 200, g: 210, b: 240 },  // Near white-blue
        { r: 100, g: 140, b: 200 },  // Steel blue
    ];

    /* ── Particle class ───────────────────────────────────── */
    class Particle {
        constructor() {
            this.spawn();
        }

        spawn() {
            this.homeX = Math.random() * width;
            this.homeY = Math.random() * height;
            this.x = this.homeX;
            this.y = this.homeY;
            this.vx = 0;
            this.vy = 0;

            // Size: mix of tiny stars and slightly larger ones
            this.size = Math.random() < 0.85
                ? Math.random() * 1.2 + 0.3   // 85% tiny (0.3–1.5px)
                : Math.random() * 1.8 + 1.0;   // 15% medium (1.0–2.8px)

            this.baseAlpha = Math.random() * 0.4 + 0.15; // 0.15–0.55
            this.alpha = this.baseAlpha;

            const c = colors[Math.floor(Math.random() * colors.length)];
            this.r = c.r;
            this.g = c.g;
            this.b = c.b;

            // Organic drift: each particle floats on its own sine wave
            this.driftAngle  = Math.random() * Math.PI * 2;
            this.driftSpeed  = Math.random() * 0.0008 + 0.0003; // Very slow
            this.driftRadius = Math.random() * 0.15 + 0.05;     // Tiny amplitude

            // Twinkle
            this.twinklePhase = Math.random() * Math.PI * 2;
            this.twinkleSpeed = Math.random() * 0.008 + 0.003;
        }

        update() {
            // ── 1. Organic slow drift (sine wave floating) ──
            this.driftAngle += this.driftSpeed;
            this.vx += Math.sin(this.driftAngle) * this.driftRadius * 0.02;
            this.vy += Math.cos(this.driftAngle * 0.73 + 1.3) * this.driftRadius * 0.02;

            // ── 2. Gentle return toward home ──
            const dhx = this.homeX - this.x;
            const dhy = this.homeY - this.y;
            this.vx += dhx * RETURN_SPEED;
            this.vy += dhy * RETURN_SPEED;

            // ── 3. Cursor repulsion (soft push away) ──
            if (isHovering) {
                const dx = this.x - mouse.x;
                const dy = this.y - mouse.y;
                const distSq = dx * dx + dy * dy;

                if (distSq < REPEL_RADIUS * REPEL_RADIUS && distSq > 1) {
                    const dist = Math.sqrt(distSq);
                    // Smooth falloff: stronger near center, fades at edge
                    const t = 1 - (dist / REPEL_RADIUS);
                    const force = t * t * REPEL_FORCE; // Quadratic falloff = buttery
                    this.vx += (dx / dist) * force;
                    this.vy += (dy / dist) * force;

                    // Slight brightness boost near cursor
                    this.alpha = this.baseAlpha + t * 0.3;
                }
            }

            // ── 4. Friction (smooth deceleration) ──
            this.vx *= FRICTION;
            this.vy *= FRICTION;

            // ── 5. Speed clamp (prevents any bouncing) ──
            const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            if (speed > MAX_SPEED) {
                this.vx = (this.vx / speed) * MAX_SPEED;
                this.vy = (this.vy / speed) * MAX_SPEED;
            }

            // ── 6. Update position ──
            this.x += this.vx;
            this.y += this.vy;

            // ── 7. Soft wrapping ──
            if (this.x < -30) { this.x = width + 30;  this.homeX = this.x; }
            if (this.x > width + 30) { this.x = -30;  this.homeX = this.x; }
            if (this.y < -30) { this.y = height + 30;  this.homeY = this.y; }
            if (this.y > height + 30) { this.y = -30;  this.homeY = this.y; }

            // ── 8. Twinkle (gentle alpha oscillation) ──
            this.twinklePhase += this.twinkleSpeed;
            const twinkle = Math.sin(this.twinklePhase) * 0.12;
            this.alpha = Math.max(0.05, Math.min(0.7,
                this.baseAlpha + twinkle + (isHovering ? 0 : 0)
            ));

            // Fade alpha back to base smoothly when not near cursor
            if (!isHovering || (Math.abs(this.x - mouse.x) > REPEL_RADIUS ||
                                Math.abs(this.y - mouse.y) > REPEL_RADIUS)) {
                this.alpha += (this.baseAlpha + twinkle - this.alpha) * 0.04;
            }
        }

        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${this.r},${this.g},${this.b},${this.alpha.toFixed(3)})`;
            ctx.fill();
        }
    }

    /* ── Connection lines (very faint, like constellations) ── */
    function drawConnections() {
        ctx.lineWidth = 0.5;
        for (let i = 0; i < particles.length; i++) {
            const a = particles[i];
            // Only check nearby particles (skip most for performance)
            for (let j = i + 1; j < particles.length; j++) {
                const b = particles[j];
                const dx = a.x - b.x;
                const dy = a.y - b.y;

                // Quick bounding-box check before sqrt
                if (Math.abs(dx) > LINE_DIST || Math.abs(dy) > LINE_DIST) continue;

                const distSq = dx * dx + dy * dy;
                if (distSq < LINE_DIST * LINE_DIST) {
                    const dist = Math.sqrt(distSq);
                    const opacity = (1 - dist / LINE_DIST) * LINE_OPACITY;
                    if (opacity < 0.003) continue;

                    // Use the average color of both particles
                    const mr = (a.r + b.r) >> 1;
                    const mg = (a.g + b.g) >> 1;
                    const mb = (a.b + b.b) >> 1;

                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.strokeStyle = `rgba(${mr},${mg},${mb},${opacity.toFixed(4)})`;
                    ctx.stroke();
                }
            }
        }
    }

    /* ── Init ──────────────────────────────────────────────── */
    function initParticles() {
        particles = [];
        for (let i = 0; i < COUNT; i++) {
            particles.push(new Particle());
        }
    }

    initParticles();

    /* ── Render loop ──────────────────────────────────────── */
    function animate() {
        // Full clear each frame — no trails, no ghosting, no green
        ctx.clearRect(0, 0, width, height);

        // Update & draw particles
        for (let i = 0; i < particles.length; i++) {
            particles[i].update();
        }

        // Draw faint constellation lines
        drawConnections();

        // Draw dots on top of lines
        for (let i = 0; i < particles.length; i++) {
            particles[i].draw();
        }

        animId = requestAnimationFrame(animate);
    }

    animate();
});
