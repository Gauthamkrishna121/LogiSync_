/**
 * ══════════════════════════════════════════════════════════════════
 *  MENTIS.AI — WebGL Particle Flow Field
 *  GPU-accelerated · 6 000 particles · Curl-noise flow · 60 FPS
 * ══════════════════════════════════════════════════════════════════
 *
 *  All particle state is computed in the vertex shader.
 *  CPU does zero per-particle work.  Single draw call per frame.
 *
 *  Visual: thousands of tiny luminous dots flowing along invisible
 *  magnetic currents.  Calm, intelligent, mesmerising.
 */

(function () {
    'use strict';

    /* ── Config ─────────────────────────────────────────────── */
    const DESKTOP_COUNT  = 6000;
    const TABLET_COUNT   = 3500;
    const MOBILE_COUNT   = 1800;
    const TIME_SPEED     = 0.00028;   // Very slow
    const MOUSE_RADIUS   = 0.22;      // In clip-space units
    const MOUSE_STRENGTH = 0.10;      // Gentle push

    /* ── Shaders ────────────────────────────────────────────── */

    const VERT = `
        attribute vec3 a_seed;    // xy: position in [-1.3, 1.3], z: depth [0, 1]
        attribute float a_rand;   // per-particle random [0, 1]

        uniform float u_time;
        uniform vec2  u_mouse;    // mouse in clip-space [-1, 1]
        uniform float u_mouseIn;  // 0..1 mouse influence (smoothed)
        uniform float u_dpr;      // device pixel ratio

        varying float v_alpha;
        varying float v_depth;

        /* ─── Smooth scalar field (layered sines) ─── */
        float field(vec2 p, float t) {
            float v = 0.0;
            v += sin(p.x * 0.7  + t * 0.13) * cos(p.y * 0.9  - t * 0.11);
            v += sin(p.x * 1.4  - p.y * 0.6 + t * 0.09) * 0.65;
            v += cos(p.x * 2.1  + p.y * 1.4 + t * 0.07) * 0.45;
            v += sin(p.x * 0.35 + p.y * 1.8 - t * 0.05) * 0.30;
            return v;
        }

        /* ─── Curl of the scalar field ─── */
        vec2 curlF(vec2 p, float t) {
            float e  = 0.005;
            float n  = field(p, t);
            float nx = field(p + vec2(e, 0.0), t);
            float ny = field(p + vec2(0.0, e), t);
            return vec2((ny - n), -(nx - n)) / e;
        }

        /* ─── Second flow layer (different frequencies) ─── */
        float field2(vec2 p, float t) {
            float v = 0.0;
            v += cos(p.x * 1.1 + t * 0.10) * sin(p.y * 0.75 + t * 0.12);
            v += cos(p.x * 0.8 + p.y * 1.6  - t * 0.065) * 0.55;
            v += sin(p.x * 2.6 - p.y * 0.45 + t * 0.085) * 0.35;
            return v;
        }
        vec2 curlF2(vec2 p, float t) {
            float e  = 0.005;
            float n  = field2(p, t);
            float nx = field2(p + vec2(e, 0.0), t);
            float ny = field2(p + vec2(0.0, e), t);
            return vec2((ny - n), -(nx - n)) / e;
        }

        void main() {
            float depth = a_seed.z;
            float speed = 0.35 + depth * 0.65;   // deeper = slower
            float t     = u_time * speed;

            /* Seed position with per-particle offset */
            vec2 pos = a_seed.xy;
            float off = a_rand * 20.0;  // scatter into different flow regions

            /* Multi-scale curl flow */
            vec2 flow = curlF(pos * 0.55 + off, t * 0.45) * 0.13;
            flow     += curlF2(pos * 1.3 + off * 0.5, t * 0.75) * 0.065;
            flow     += curlF(pos * 2.8, t * 1.1) * 0.028;  // fine turbulence

            pos += flow;

            /* Mouse soft displacement */
            vec2  diff  = pos - u_mouse;
            float dist  = length(diff);
            float mR    = ${MOUSE_RADIUS.toFixed(4)};
            float mS    = ${MOUSE_STRENGTH.toFixed(4)};
            if (dist < mR && dist > 0.001) {
                float f = 1.0 - dist / mR;
                f = f * f * f;                // cubic falloff
                pos += normalize(diff) * f * mS * u_mouseIn;
            }

            /* Wrap seamlessly */
            pos = mod(pos + 1.5, 3.0) - 1.5;

            gl_Position = vec4(pos, 0.0, 1.0);

            /* Point size: depth-scaled, DPR-aware */
            float sz = mix(0.8, 2.8, depth * depth);
            gl_PointSize = sz * u_dpr;

            /* Alpha: depth + variation + subtle breathing */
            float breath = 1.0 + sin(u_time * 0.18 + a_rand * 6.28) * 0.06;
            v_alpha = mix(0.06, 0.42, depth) * (0.65 + a_rand * 0.35) * breath;
            v_depth = depth;
        }
    `;

    const FRAG = `
        precision mediump float;
        varying float v_alpha;
        varying float v_depth;

        void main() {
            /* Soft circular point */
            float d = length(gl_PointCoord - 0.5) * 2.0;
            if (d > 1.0) discard;

            /* Radial falloff → soft glow */
            float a = (1.0 - d * d) * v_alpha;

            /* Color: accent blue → soft blue based on depth */
            vec3 core = vec3(0.310, 0.486, 1.0);   // #4F7CFF
            vec3 soft = vec3(0.545, 0.722, 1.0);    // #8BB8FF
            vec3 col  = mix(core, soft, v_depth * 0.55 + 0.1);

            gl_FragColor = vec4(col, a);
        }
    `;

    /* ── Helpers ─────────────────────────────────────────────── */

    function compileShader(gl, src, type) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            console.error('Shader compile error:', gl.getShaderInfoLog(s));
            gl.deleteShader(s);
            return null;
        }
        return s;
    }

    function createProgram(gl, vSrc, fSrc) {
        const vs = compileShader(gl, vSrc, gl.VERTEX_SHADER);
        const fs = compileShader(gl, fSrc, gl.FRAGMENT_SHADER);
        if (!vs || !fs) return null;

        const p = gl.createProgram();
        gl.attachShader(p, vs);
        gl.attachShader(p, fs);
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
            console.error('Program link error:', gl.getProgramInfoLog(p));
            return null;
        }
        return p;
    }

    function getParticleCount() {
        const w = window.innerWidth;
        if (w <= 480)  return MOBILE_COUNT;
        if (w <= 768)  return TABLET_COUNT;
        return DESKTOP_COUNT;
    }

    /* ── Init ───────────────────────────────────────────────── */

    function init() {
        const canvas = document.getElementById('particle-canvas');
        if (!canvas) return;

        const gl = canvas.getContext('webgl', {
            alpha: false,
            antialias: false,
            premultipliedAlpha: false,
            preserveDrawingBuffer: false,
        });
        if (!gl) {
            console.warn('WebGL not available — skipping particles');
            canvas.classList.add('visible');
            return;
        }

        /* Program */
        const program = createProgram(gl, VERT, FRAG);
        if (!program) return;
        gl.useProgram(program);

        /* Uniforms */
        const uTime    = gl.getUniformLocation(program, 'u_time');
        const uMouse   = gl.getUniformLocation(program, 'u_mouse');
        const uMouseIn = gl.getUniformLocation(program, 'u_mouseIn');
        const uDpr     = gl.getUniformLocation(program, 'u_dpr');

        /* Attributes */
        const aSeed = gl.getAttribLocation(program, 'a_seed');
        const aRand = gl.getAttribLocation(program, 'a_rand');

        /* Generate particle seeds */
        const count = getParticleCount();
        const seeds = new Float32Array(count * 3);
        const rands = new Float32Array(count);

        for (let i = 0; i < count; i++) {
            seeds[i * 3]     = (Math.random() * 2.6) - 1.3;  // x: [-1.3, 1.3]
            seeds[i * 3 + 1] = (Math.random() * 2.6) - 1.3;  // y: [-1.3, 1.3]
            seeds[i * 3 + 2] = Math.random();                  // z: depth [0, 1]
            rands[i]          = Math.random();
        }

        /* Buffers */
        const seedBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, seedBuf);
        gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(aSeed);
        gl.vertexAttribPointer(aSeed, 3, gl.FLOAT, false, 0, 0);

        const randBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, randBuf);
        gl.bufferData(gl.ARRAY_BUFFER, rands, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(aRand);
        gl.vertexAttribPointer(aRand, 1, gl.FLOAT, false, 0, 0);

        /* Blending: additive for glowing particles */
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

        /* Sizing */
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        function resize() {
            const w = canvas.clientWidth;
            const h = canvas.clientHeight;
            canvas.width  = w * dpr;
            canvas.height = h * dpr;
            gl.viewport(0, 0, canvas.width, canvas.height);
        }
        window.addEventListener('resize', resize);
        resize();

        /* Mouse tracking (clip-space) */
        let mouseClip = { x: -9, y: -9 };
        let mouseInfluence = 0;  // smoothed 0..1

        document.addEventListener('mousemove', (e) => {
            mouseClip.x = (e.clientX / window.innerWidth) * 2 - 1;
            mouseClip.y = -((e.clientY / window.innerHeight) * 2 - 1);  // flip Y
            mouseInfluence = 1;
        });
        document.addEventListener('mouseleave', () => {
            mouseInfluence = 0;
        });

        /* Fade in canvas */
        requestAnimationFrame(() => {
            canvas.classList.add('visible');
        });

        /* Render loop */
        let time = 0;
        let lastTs = 0;
        let smoothMouse = 0;

        function frame(ts) {
            const dt = lastTs ? (ts - lastTs) : 16;
            lastTs = ts;

            time += dt * TIME_SPEED;

            // Smooth mouse influence
            smoothMouse += (mouseInfluence - smoothMouse) * 0.04;

            // Clear with background color
            gl.clearColor(0.0196, 0.0196, 0.0196, 1.0);  // #050505
            gl.clear(gl.COLOR_BUFFER_BIT);

            // Set uniforms
            gl.uniform1f(uTime, time);
            gl.uniform2f(uMouse, mouseClip.x, mouseClip.y);
            gl.uniform1f(uMouseIn, smoothMouse);
            gl.uniform1f(uDpr, dpr);

            // Bind buffers (needed if context state changes)
            gl.bindBuffer(gl.ARRAY_BUFFER, seedBuf);
            gl.vertexAttribPointer(aSeed, 3, gl.FLOAT, false, 0, 0);
            gl.bindBuffer(gl.ARRAY_BUFFER, randBuf);
            gl.vertexAttribPointer(aRand, 1, gl.FLOAT, false, 0, 0);

            // Draw ALL particles in one call
            gl.drawArrays(gl.POINTS, 0, count);

            requestAnimationFrame(frame);
        }

        requestAnimationFrame(frame);
    }

    /* Wait for DOM */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
