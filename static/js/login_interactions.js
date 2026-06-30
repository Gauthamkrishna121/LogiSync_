/**
 * ══════════════════════════════════════════════════════════════════
 *  MENTIS.AI — Login Page Interactions
 *  Spring physics · 3D card tilt · Stagger entrance · Micro-interactions
 * ══════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    /* ═══════════════════════════════════════════════════════════
       SPRING PHYSICS
       ═══════════════════════════════════════════════════════════ */

    class Spring {
        constructor(stiffness = 0.08, damping = 0.82) {
            this.value    = 0;
            this.target   = 0;
            this.velocity = 0;
            this.stiffness = stiffness;
            this.damping   = damping;
        }

        update() {
            const force    = (this.target - this.value) * this.stiffness;
            this.velocity += force;
            this.velocity *= this.damping;
            this.value    += this.velocity;
            return this.value;
        }

        isResting(threshold) {
            threshold = threshold || 0.001;
            return Math.abs(this.velocity) < threshold &&
                   Math.abs(this.target - this.value) < threshold;
        }
    }

    /* ═══════════════════════════════════════════════════════════
       CARD 3D TILT + FLOATING
       ═══════════════════════════════════════════════════════════ */

    function initCardTilt() {
        const card = document.getElementById('login-card');
        if (!card) return;

        const MAX_TILT  = 4;           // degrees
        const FLOAT_AMP = 5;           // pixels
        const FLOAT_SPEED = 0.0012;    // very slow

        const tiltX = new Spring(0.06, 0.85);
        const tiltY = new Spring(0.06, 0.85);
        let mouseOnPage = false;
        let raf;

        document.addEventListener('mousemove', (e) => {
            mouseOnPage = true;
            const rect = card.getBoundingClientRect();
            const cx   = rect.left + rect.width  / 2;
            const cy   = rect.top  + rect.height / 2;
            const hw   = window.innerWidth  / 2;
            const hh   = window.innerHeight / 2;

            // Tilt based on mouse distance from card center
            tiltX.target = ((e.clientY - cy) / hh) * -MAX_TILT;
            tiltY.target = ((e.clientX - cx) / hw) *  MAX_TILT;
        });

        document.addEventListener('mouseleave', () => {
            mouseOnPage = false;
            tiltX.target = 0;
            tiltY.target = 0;
        });

        let time = 0;
        function tick() {
            time += FLOAT_SPEED;

            tiltX.update();
            tiltY.update();

            const floatY = Math.sin(time) * FLOAT_AMP;

            card.style.transform =
                `perspective(1200px)` +
                ` rotateX(${tiltX.value.toFixed(3)}deg)` +
                ` rotateY(${tiltY.value.toFixed(3)}deg)` +
                ` translateY(${floatY.toFixed(2)}px)`;

            raf = requestAnimationFrame(tick);
        }

        // Start after card entrance completes
        setTimeout(() => {
            tick();
        }, 1200);
    }


    /* ═══════════════════════════════════════════════════════════
       ENTRANCE ANIMATIONS
       ═══════════════════════════════════════════════════════════ */

    function initEntrance() {
        const card = document.getElementById('login-card');
        if (!card) return;

        // Card entrance
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                card.classList.add('visible');
            });
        });

        // Stagger child elements
        const items = card.querySelectorAll('.stagger');
        items.forEach((el, i) => {
            el.style.setProperty('--d', i);
            // Trigger the animation class after a small delay
            requestAnimationFrame(() => {
                el.classList.add('in');
            });
        });
    }


    /* ═══════════════════════════════════════════════════════════
       FLOATING LABELS
       ═══════════════════════════════════════════════════════════ */

    function initFloatingLabels() {
        const inputs = document.querySelectorAll('.field-group input');
        inputs.forEach(input => {
            // Set initial state
            function update() {
                if (input.value.length > 0) {
                    input.classList.add('has-value');
                } else {
                    input.classList.remove('has-value');
                }
            }
            input.addEventListener('input', update);
            input.addEventListener('change', update);
            // Handle autofill detection
            setTimeout(update, 100);
            setTimeout(update, 500);
            setTimeout(update, 1500);
        });
    }


    /* ═══════════════════════════════════════════════════════════
       PASSWORD TOGGLE
       ═══════════════════════════════════════════════════════════ */

    function initPasswordToggle() {
        const toggle = document.getElementById('pw-toggle');
        const input  = document.getElementById('password');
        if (!toggle || !input) return;

        const eyeOpen = toggle.querySelector('.eye-open');
        const eyeShut = toggle.querySelector('.eye-shut');

        toggle.addEventListener('click', () => {
            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';
            if (eyeOpen && eyeShut) {
                eyeOpen.style.display = isPassword ? 'none'  : 'block';
                eyeShut.style.display = isPassword ? 'block' : 'none';
            }
        });
    }


    /* ═══════════════════════════════════════════════════════════
       FORM SUBMISSION
       ═══════════════════════════════════════════════════════════ */

    function initForm() {
        const form  = document.getElementById('login-form');
        const btn   = document.getElementById('btn-continue');
        const uname = document.getElementById('username');
        const pw    = document.getElementById('password');
        if (!form || !btn) return;

        form.addEventListener('submit', (e) => {
            e.preventDefault();

            const username = (uname ? uname.value.trim() : '');
            const password = (pw ? pw.value : '');

            // Validate
            if (!username) {
                showToast('Please enter your username.', 'warning');
                if (uname) uname.focus();
                return;
            }
            if (!password) {
                showToast('Please enter your password.', 'warning');
                if (pw) pw.focus();
                return;
            }

            // Loading state
            btn.classList.add('loading');
            btn.disabled = true;

            fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            })
            .then(res => {
                if (!res.ok) return res.json().then(d => { throw new Error(d.error || 'Login failed.'); });
                return res.json();
            })
            .then(data => {
                // Success
                btn.classList.remove('loading');
                btn.classList.add('success');
                btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg><span class="btn-label">Success</span>';

                showToast('Welcome back! Redirecting...', 'success');

                setTimeout(() => {
                    const role = data.user ? data.user.role : '';
                    if (role === 'admin') window.location.href = '/admin';
                    else if (role === 'mentor') window.location.href = '/mentor';
                    else window.location.href = '/';
                }, 800);
            })
            .catch(err => {
                btn.classList.remove('loading');
                btn.disabled = false;
                showToast(err.message, 'error');

                // Shake card
                const card = document.getElementById('login-card');
                if (card) {
                    card.style.animation = 'none';
                    card.offsetHeight; // trigger reflow
                    card.style.animation = 'shake 0.45s ease';
                    setTimeout(() => { card.style.animation = ''; }, 500);
                }
            });
        });
    }


    /* ═══════════════════════════════════════════════════════════
       OAUTH PLACEHOLDER HANDLERS
       ═══════════════════════════════════════════════════════════ */

    function initOAuth() {
        const oauthBtns = document.querySelectorAll('.btn-oauth');
        oauthBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                showToast('OAuth coming soon. Use username & password.', 'info');
            });
        });
    }

    function initForgot() {
        const link = document.getElementById('forgot-link');
        if (!link) return;
        link.addEventListener('click', (e) => {
            e.preventDefault();
            showToast('Password reset coming soon.', 'info');
        });
    }


    /* ═══════════════════════════════════════════════════════════
       TOAST SYSTEM
       ═══════════════════════════════════════════════════════════ */

    function showToast(message, type) {
        type = type || 'info';
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = 'toast toast-' + type;

        const icons = {
            success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
            error:   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
            warning: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
            info:    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
        };

        toast.innerHTML =
            '<span class="toast-icon">' + (icons[type] || icons.info) + '</span>' +
            '<span>' + message + '</span>';

        container.appendChild(toast);

        // Auto dismiss
        setTimeout(() => {
            toast.style.animation = 'toastOut 0.35s ease forwards';
            setTimeout(() => toast.remove(), 400);
        }, 4000);
    }

    // Expose globally for inline use
    window.showToast = showToast;


    /* ═══════════════════════════════════════════════════════════
       SHAKE KEYFRAMES (injected dynamically)
       ═══════════════════════════════════════════════════════════ */

    const shakeCSS = document.createElement('style');
    shakeCSS.textContent = `
        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            15%, 55%  { transform: translateX(-5px); }
            35%, 75%  { transform: translateX(5px); }
        }
    `;
    document.head.appendChild(shakeCSS);


    /* ═══════════════════════════════════════════════════════════
       BOOT
       ═══════════════════════════════════════════════════════════ */

    function boot() {
        initEntrance();
        initCardTilt();
        initFloatingLabels();
        initPasswordToggle();
        initForm();
        initOAuth();
        initForgot();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
