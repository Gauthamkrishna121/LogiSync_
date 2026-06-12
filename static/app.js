document.addEventListener('DOMContentLoaded', () => {
    // ═══════════════════════════════════════
    // DOM REFERENCES
    // ═══════════════════════════════════════
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');

    const configForm = document.getElementById('config-form');
    const cfgUsername = document.getElementById('cfg-username');
    const cfgTeamsDir = document.getElementById('cfg-teams-dir');
    const cfgWeek = document.getElementById('cfg-week');
    const cfgDay = document.getElementById('cfg-day');
    const cfgDate = document.getElementById('cfg-date');
    const cfgArrival = document.getElementById('cfg-arrival');
    const loadBtn = document.getElementById('load-btn');
    const syncBtn = document.getElementById('sync-btn');

    const slotsContainer = document.getElementById('slots-container');
    const dashboardEmpty = document.getElementById('dashboard-empty');
    const dashboardLoaded = document.getElementById('dashboard-loaded');
    const timesheetDateBadge = document.getElementById('timesheet-date-badge');

    // Activity log stored locally
    const activityLog = [];

    // ═══════════════════════════════════════
    // GREETING & DATE
    // ═══════════════════════════════════════
    function setGreeting() {
        const hour = new Date().getHours();
        let greeting = 'Good evening';
        if (hour < 12) greeting = 'Good morning';
        else if (hour < 17) greeting = 'Good afternoon';

        const nameEl = document.getElementById('user-display-name');
        const firstName = nameEl ? nameEl.textContent.split(' ')[0] : 'there';
        const el = document.getElementById('header-greeting');
        if (el) el.textContent = `${greeting}, ${firstName}`;
    }

    function setHeaderDate() {
        const el = document.getElementById('header-date');
        if (el) {
            const now = new Date();
            el.textContent = now.toLocaleDateString('en-US', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            });
        }
    }

    setGreeting();
    setHeaderDate();

    // Set default date to today
    const today = new Date();
    const tzOffset = today.getTimezoneOffset() * 60000;
    const localISO = new Date(today.getTime() - tzOffset).toISOString().split('T')[0];
    cfgDate.value = localISO;

    // ═══════════════════════════════════════
    // VIEW NAVIGATION
    // ═══════════════════════════════════════
    const navItems = document.querySelectorAll('.nav-item[data-view]');
    const viewPanels = document.querySelectorAll('.view-panel');

    function switchView(viewName) {
        viewPanels.forEach(p => p.classList.add('hidden'));
        navItems.forEach(n => n.classList.remove('active'));

        const panel = document.getElementById(`view-${viewName}`);
        const navBtn = document.querySelector(`.nav-item[data-view="${viewName}"]`);

        if (panel) {
            panel.classList.remove('hidden');
            panel.style.animation = 'none';
            panel.offsetHeight; // reflow
            panel.style.animation = 'fadeInUp 0.3s var(--ease-out)';
        }
        if (navBtn) navBtn.classList.add('active');

        // Close mobile sidebar
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('active');
    }

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const view = item.getAttribute('data-view');
            if (view) switchView(view);
        });
    });

    // Quick navigation buttons
    const gotoTimesheetBtn = document.getElementById('goto-timesheet-btn');
    if (gotoTimesheetBtn) gotoTimesheetBtn.addEventListener('click', () => switchView('config'));

    const gotoConfigBtn2 = document.getElementById('goto-config-btn2');
    if (gotoConfigBtn2) gotoConfigBtn2.addEventListener('click', () => switchView('config'));

    // ═══════════════════════════════════════
    // MOBILE SIDEBAR
    // ═══════════════════════════════════════
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            sidebar.classList.toggle('open');
            sidebarOverlay.classList.toggle('active');
        });
    }

    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', () => {
            sidebar.classList.remove('open');
            sidebarOverlay.classList.remove('active');
        });
    }

    // ═══════════════════════════════════════
    // LOAD CONFIG FROM BACKEND
    // ═══════════════════════════════════════
    fetch('/api/config')
        .then(res => {
            if (res.redirected || !res.ok) { window.location.href = '/login'; return; }
            return res.json();
        })
        .then(config => {
            if (!config) return;
            if (config.default_username) cfgUsername.value = config.default_username;
            if (config.teams_sync_dir) cfgTeamsDir.value = config.teams_sync_dir;
            if (config.start_date) calculateWeekAndDay(config.start_date);
        })
        .catch(err => console.error('Config load error:', err));

    // ═══════════════════════════════════════
    // AUTO WEEK/DAY CALCULATION
    // ═══════════════════════════════════════
    cfgDate.addEventListener('change', () => {
        fetch('/api/config')
            .then(r => r.json())
            .then(config => {
                if (config.start_date) calculateWeekAndDay(config.start_date);
            });
    });

    function calculateWeekAndDay(startDateStr) {
        const start = new Date(startDateStr);
        const current = new Date(cfgDate.value);
        if (isNaN(start.getTime()) || isNaN(current.getTime())) return;

        start.setHours(0, 0, 0, 0);
        current.setHours(0, 0, 0, 0);

        const diffTime = current.getTime() - start.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) { cfgWeek.value = '1'; cfgDay.value = '1'; return; }

        const week = Math.floor(diffDays / 7) + 1;
        let day = current.getDay();
        if (day === 0 || day === 6) day = 5;

        cfgWeek.value = week.toString();
        cfgDay.value = day.toString();
    }

    // ═══════════════════════════════════════
    // LOAD TIMESHEET
    // ═══════════════════════════════════════
    configForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const username = cfgUsername.value.trim();
        const teams_sync_dir = cfgTeamsDir.value.trim();
        const week_num = parseInt(cfgWeek.value);
        const day_num = parseInt(cfgDay.value);
        const date_val = cfgDate.value;
        const arrival_time = cfgArrival.value;

        if (!username) { showToast('Username is required.', 'warning'); return; }

        loadBtn.disabled = true;
        loadBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...';

        fetch('/api/load-timesheet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, teams_sync_dir, week_num, day_num, date_val, arrival_time })
        })
        .then(res => {
            if (!res.ok) throw new Error('Failed to load timesheet.');
            return res.json();
        })
        .then(data => {
            loadBtn.disabled = false;
            loadBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> Load Timesheet';

            // Update KPIs
            updateKPIs(data.slots, week_num, day_num);

            // Switch to dashboard and show loaded content
            dashboardEmpty.classList.add('hidden');
            dashboardLoaded.classList.remove('hidden');
            timesheetDateBadge.textContent = `Week ${week_num}, Day ${day_num} • ${date_val}`;

            // Also make timesheet view mirror dashboard
            const timesheetEmpty = document.getElementById('timesheet-empty');
            if (timesheetEmpty) timesheetEmpty.classList.add('hidden');

            renderSlotCards(data.slots);
            switchView('dashboard');
            showToast('Timesheet loaded successfully!', 'success');
            addActivity('Loaded timesheet', `Week ${week_num}, Day ${day_num}`);
        })
        .catch(err => {
            loadBtn.disabled = false;
            loadBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> Load Timesheet';
            showToast(err.message, 'error');
        });
    });

    // ═══════════════════════════════════════
    // KPI UPDATE
    // ═══════════════════════════════════════
    function updateKPIs(slots, weekNum, dayNum) {
        // Hours today
        let totalHours = 0;
        let filledSlots = 0;
        let workSlots = 0;

        slots.forEach(s => {
            if (s.type === 'Work') {
                workSlots++;
                totalHours += (s.duration || 0);
                if (s.activity && s.activity.trim()) filledSlots++;
            }
        });

        const kpiHours = document.getElementById('kpi-hours');
        const kpiSlots = document.getElementById('kpi-slots');
        const kpiWeek = document.getElementById('kpi-week');
        const kpiDayLabel = document.getElementById('kpi-day-label');
        const kpiSync = document.getElementById('kpi-sync');

        if (kpiHours) animateValue(kpiHours, totalHours, 'h');
        if (kpiSlots) kpiSlots.textContent = `${filledSlots} / ${workSlots}`;
        if (kpiWeek) kpiWeek.textContent = `W${weekNum}`;
        if (kpiDayLabel) {
            const days = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
            kpiDayLabel.textContent = `Day ${dayNum} — ${days[dayNum] || ''}`;
        }
        if (kpiSync) { kpiSync.textContent = 'Pending'; kpiSync.style.color = 'var(--warning)'; }
    }

    function animateValue(el, target, suffix = '') {
        const duration = 600;
        const start = 0;
        const startTime = performance.now();

        function step(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
            const current = Math.round((start + (target - start) * eased) * 10) / 10;
            el.textContent = current + suffix;
            if (progress < 1) requestAnimationFrame(step);
        }

        requestAnimationFrame(step);
    }

    // ═══════════════════════════════════════
    // RENDER SLOT CARDS
    // ═══════════════════════════════════════
    function renderSlotCards(slots) {
        slotsContainer.innerHTML = '';

        slots.forEach(slot => {
            const card = document.createElement('div');
            const isLunch = slot.type === 'Lunch Break';
            card.className = `slot-card${isLunch ? ' lunch' : ''}`;

            const timeStr = `${slot.start} — ${slot.end}`;
            const durStr = `${slot.duration}h`;

            if (isLunch) {
                card.innerHTML = `
                    <div class="slot-time-block">
                        <div class="slot-time">${timeStr}</div>
                        <div class="slot-duration"><i class="fa-solid fa-mug-hot"></i> ${durStr}</div>
                    </div>
                    <div class="slot-body">
                        <div class="slot-top">
                            <span class="slot-category">Lunch Break</span>
                        </div>
                        <div class="lunch-content">
                            <i class="fa-solid fa-utensils"></i> Blocked for lunch (auto-skipped in daily log)
                        </div>
                    </div>
                `;
            } else {
                card.innerHTML = `
                    <div class="slot-time-block">
                        <div class="slot-time">${timeStr}</div>
                        <div class="slot-duration"><i class="fa-solid fa-hourglass-half"></i> ${durStr}</div>
                    </div>
                    <div class="slot-body">
                        <div class="slot-top">
                            <span class="slot-category">${slot.type}</span>
                            <span class="slot-status saved" id="status-${slot.row}">
                                <i class="fa-solid fa-cloud-arrow-up"></i> Synced
                            </span>
                        </div>
                        <textarea
                            class="slot-textarea"
                            data-row="${slot.row}"
                            placeholder="What did you work on during this block?"
                        >${slot.activity || ''}</textarea>
                    </div>
                `;

                const textarea = card.querySelector('.slot-textarea');
                textarea.addEventListener('blur', () => saveSlot(slot.row, textarea.value));
                textarea.addEventListener('input', () => {
                    const badge = document.getElementById(`status-${slot.row}`);
                    if (badge) {
                        badge.className = 'slot-status unsaved';
                        badge.innerHTML = '<i class="fa-solid fa-circle-dot"></i> Unsaved';
                    }
                });
            }

            slotsContainer.appendChild(card);
        });
    }

    // ═══════════════════════════════════════
    // SAVE SLOT
    // ═══════════════════════════════════════
    function saveSlot(row, text) {
        const username = cfgUsername.value.trim();
        const badge = document.getElementById(`status-${row}`);

        if (badge) {
            badge.className = 'slot-status saving';
            badge.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
        }

        fetch('/api/save-slot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, teams_sync_dir: cfgTeamsDir.value.trim(), row, text })
        })
        .then(res => {
            if (!res.ok) throw new Error();
            if (badge) {
                badge.className = 'slot-status saved';
                badge.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Synced';
            }
        })
        .catch(() => {
            if (badge) {
                badge.className = 'slot-status error';
                badge.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Failed';
            }
            showToast('Failed to save. Check connection.', 'error');
        });
    }

    // ═══════════════════════════════════════
    // SYNC TO TEAMS
    // ═══════════════════════════════════════
    if (syncBtn) {
        syncBtn.addEventListener('click', () => {
            const username = cfgUsername.value.trim();
            const week_num = parseInt(cfgWeek.value);
            const day_num = parseInt(cfgDay.value);

            syncBtn.disabled = true;
            syncBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Syncing...';

            fetch('/api/sync-day', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, teams_sync_dir: cfgTeamsDir.value.trim(), week_num, day_num })
            })
            .then(res => {
                if (!res.ok) throw new Error('Sync failed.');
                return res.json();
            })
            .then(() => {
                syncBtn.disabled = false;
                syncBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Sync to Teams';
                showToast('Synced to daily log successfully!', 'success');
                addActivity('Synced to Teams', `Week ${week_num}, Day ${day_num}`);

                const kpiSync = document.getElementById('kpi-sync');
                if (kpiSync) {
                    kpiSync.textContent = 'Synced ✓';
                    kpiSync.style.color = 'var(--success)';
                }
            })
            .catch(err => {
                syncBtn.disabled = false;
                syncBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Sync to Teams';
                showToast(err.message, 'error');
            });
        });
    }

    // ═══════════════════════════════════════
    // ACTIVITY FEED
    // ═══════════════════════════════════════
    function addActivity(action, detail) {
        const now = new Date();
        const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        activityLog.unshift({ action, detail, time });

        const feed = document.getElementById('activity-feed');
        if (!feed) return;

        feed.innerHTML = activityLog.map(a => `
            <div style="display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.75rem 0; border-bottom: 1px solid var(--border);">
                <div style="width: 8px; height: 8px; border-radius: 50%; background: var(--accent); margin-top: 6px; flex-shrink: 0;"></div>
                <div style="flex: 1;">
                    <div style="font-size: 0.85rem; font-weight: 500; color: var(--text-primary);">${a.action}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">${a.detail} • ${a.time}</div>
                </div>
            </div>
        `).join('');
    }

    // ═══════════════════════════════════════
    // TOAST SYSTEM
    // ═══════════════════════════════════════
    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const icons = {
            success: 'fa-circle-check',
            warning: 'fa-triangle-exclamation',
            error: 'fa-circle-xmark',
            info: 'fa-circle-info'
        };

        toast.innerHTML = `
            <i class="fa-solid ${icons[type] || icons.info} toast-icon"></i>
            <span class="toast-message">${message}</span>
        `;

        container.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'slideOutRight 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }
});
