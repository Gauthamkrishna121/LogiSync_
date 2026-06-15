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

    // Weekly history elements
    const timesheetLoaded = document.getElementById('timesheet-loaded');
    const timesheetEmpty = document.getElementById('timesheet-empty');
    const timesheetWeekBadge = document.getElementById('timesheet-week-badge');
    const weekDaysGrid = document.getElementById('week-days-grid');

    // Activity log stored locally
    const activityLog = [];

    // Current app state cache
    let currentWeekNum = 1;
    let currentDayNum = 1;
    let currentSlots = [];

    // ═══════════════════════════════════════
    // THEME CONTROLLER
    // ═══════════════════════════════════════
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    
    function initTheme() {
        const savedTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        setTheme(savedTheme);
    }
    
    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        
        if (themeToggleBtn) {
            const icon = themeToggleBtn.querySelector('i');
            if (icon) {
                icon.className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
            }
        }
    }
    
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
            setTheme(currentTheme === 'dark' ? 'light' : 'dark');
        });
    }
    
    initTheme();

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

        // If transitioning to timesheet view, load the weekly history summary
        if (viewName === 'timesheet') {
            const week_num = parseInt(cfgWeek.value) || currentWeekNum || 1;
            loadWeeklyProgress(week_num);
        }
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

            // Save state cache
            currentWeekNum = week_num;
            currentDayNum = day_num;
            currentSlots = data.slots;

            // Update KPIs
            updateKPIs(data.slots, week_num, day_num);
            updateKPIRings(data.slots, week_num);

            // Switch to dashboard and show loaded content
            dashboardEmpty.classList.add('hidden');
            dashboardLoaded.classList.remove('hidden');
            timesheetDateBadge.textContent = `Week ${week_num}, Day ${day_num} • ${date_val}`;

            // Render visual Day Timeline
            renderDayTimeline(data.slots, arrival_time);

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
                        <div class="slot-suggestions">
                            <button class="suggestion-chip" data-text="💻 Development: Implemented codebase features and visual upgrades.">
                                <i class="fa-solid fa-code"></i> Dev
                            </button>
                            <button class="suggestion-chip" data-text="🤝 Team Sync: Attended daily meeting and aligned on milestones.">
                                <i class="fa-solid fa-users"></i> Meeting
                            </button>
                            <button class="suggestion-chip" data-text="📝 Documentation: Updated technical logs and timesheet entries.">
                                <i class="fa-solid fa-file-signature"></i> Docs
                            </button>
                            <button class="suggestion-chip" data-text="🔍 Testing & QA: Ran tests and validated dashboard responsive layouts.">
                                <i class="fa-solid fa-vial"></i> QA
                            </button>
                        </div>
                    </div>
                `;

                const textarea = card.querySelector('.slot-textarea');
                textarea.addEventListener('blur', () => {
                    saveSlot(slot.row, textarea.value);
                });
                
                textarea.addEventListener('input', () => {
                    const badge = document.getElementById(`status-${slot.row}`);
                    if (badge) {
                        badge.className = 'slot-status unsaved';
                        badge.innerHTML = '<i class="fa-solid fa-circle-dot"></i> Unsaved';
                    }
                    
                    // Mark timeline segment as unsaved/active
                    const seg = document.querySelector(`.timeline-segment[data-row="${slot.row}"]`);
                    if (seg) {
                        seg.className = `timeline-segment work empty active`;
                    }
                });

                // Hook up suggestion chips
                const chips = card.querySelectorAll('.suggestion-chip');
                chips.forEach(chip => {
                    chip.addEventListener('click', () => {
                        const targetText = chip.getAttribute('data-text');
                        const currentVal = textarea.value.trim();
                        textarea.value = currentVal ? `${currentVal}\n${targetText}` : targetText;
                        
                        // Trigger input events
                        textarea.dispatchEvent(new Event('input'));
                        saveSlot(slot.row, textarea.value);
                    });
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

            // Find slot in local currentSlots and update it
            const matchedSlot = currentSlots.find(s => s.row === row);
            if (matchedSlot) {
                matchedSlot.activity = text;
            }

            // Update real-time visual progress ring
            updateKPIRings(currentSlots, currentWeekNum);

            // Update timeline segment class
            const seg = document.querySelector(`.timeline-segment[data-row="${row}"]`);
            if (seg) {
                const isFilled = text && text.trim().length > 0;
                seg.className = `timeline-segment work ${isFilled ? 'filled' : 'empty'}`;
                
                // Update tooltip text
                const tooltipText = seg.querySelector('.tooltip span:last-child');
                if (tooltipText) {
                    tooltipText.textContent = isFilled ? 'Logged: ' + text.substring(0, 30) + '...' : 'Empty — Click to edit';
                }
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
                syncBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Sync & Publish';
                showToast('Synced to daily log successfully!', 'success');
                addActivity('Synced to Teams', `Week ${week_num}, Day ${day_num}`);

                // Update Cloud Sync Ring to 100%
                updateRing('sync', 100, 'Synced ✓');
                const kpiSync = document.getElementById('kpi-sync');
                if (kpiSync) {
                    kpiSync.style.color = 'var(--success)';
                }
            })
            .catch(err => {
                syncBtn.disabled = false;
                syncBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Sync & Publish';
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

    // ═══════════════════════════════════════
    // VISUAL CIRCULAR GAUGE RENDERER
    // ═══════════════════════════════════════
    function updateKPIRings(slots, weekNum) {
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

        // 1. Hours Tracked ring: relative to standard 8-hour workday
        const hoursPct = Math.min(Math.round((totalHours / 8) * 100), 100);
        updateRing('hours', hoursPct, totalHours, 'h');

        // 2. Blocks Logged ring: relative to total work slots
        const slotsPct = workSlots > 0 ? Math.round((filledSlots / workSlots) * 100) : 0;
        updateRing('slots', slotsPct, `${filledSlots}/${workSlots}`);

        // 3. Active Week ring: relative to 8 internship weeks
        const maxWeeks = 8;
        const weekPct = Math.min(Math.round((weekNum / maxWeeks) * 100), 100);
        updateRing('week', weekPct, `W${weekNum}`);

        // 4. Cloud Integration ring: read status text
        const kpiSync = document.getElementById('kpi-sync');
        const syncText = kpiSync ? kpiSync.textContent.trim() : 'Not synced';
        let syncPct = 0;
        if (syncText.includes('Synced')) syncPct = 100;
        else if (syncText.includes('Pending')) syncPct = 50;
        updateRing('sync', syncPct, syncText);
    }

    function updateRing(key, percent, valText, suffix = '') {
        const ring = document.getElementById(`kpi-${key}-ring`);
        const pctText = document.getElementById(`kpi-${key}-pct`);
        const valueEl = document.getElementById(`kpi-${key}`);
        
        if (valueEl) valueEl.textContent = valText + suffix;
        if (pctText) pctText.textContent = `${percent}%`;
        
        if (ring) {
            const radius = 22;
            const circumference = 2 * Math.PI * radius; // 138.23
            const offset = circumference - (percent / 100) * circumference;
            ring.style.strokeDashoffset = offset;
        }
    }

    // ═══════════════════════════════════════
    // DAY TIMELINE RENDERING
    // ═══════════════════════════════════════
    function renderDayTimeline(slots, arrivalTime) {
        const timelineTrack = document.getElementById('timeline-track');
        const timelineStats = document.getElementById('timeline-stats');
        const timelineTicks = document.getElementById('timeline-ticks');
        if (!timelineTrack) return;

        timelineTrack.innerHTML = '';
        if (timelineTicks) timelineTicks.innerHTML = '';

        if (!slots || slots.length === 0) return;

        // Find overall day boundaries
        const firstSlot = slots[0];
        const lastSlot = slots[slots.length - 1];
        
        if (timelineStats) {
            timelineStats.textContent = `${firstSlot.start} — ${lastSlot.end} • Daily Spread`;
        }

        // Helper to convert time "HH:MM" to minutes
        function timeToMin(timeStr) {
            const [h, m] = timeStr.split(':').map(Number);
            return h * 60 + m;
        }

        const startMin = timeToMin(firstSlot.start);
        const endMin = timeToMin(lastSlot.end);
        const totalMin = endMin - startMin;

        // Render ticks
        if (timelineTicks) {
            // Generate ticks for each hour
            const startHour = Math.floor(startMin / 60);
            const endHour = Math.ceil(endMin / 60);
            
            // Render relative ticks positioning them absolute
            timelineTicks.style.position = 'relative';
            timelineTicks.style.height = '20px';

            for (let h = startHour; h <= endHour; h++) {
                const tickMin = h * 60;
                if (tickMin >= startMin && tickMin <= endMin) {
                    const pct = ((tickMin - startMin) / totalMin) * 100;
                    const tick = document.createElement('span');
                    tick.className = 'timeline-tick';
                    tick.style.position = 'absolute';
                    tick.style.left = `${pct}%`;
                    tick.style.transform = 'translateX(-50%)';
                    
                    // Format tick hour
                    const displayHour = h % 12 === 0 ? 12 : h % 12;
                    const ampm = h >= 12 ? 'PM' : 'AM';
                    tick.textContent = `${displayHour}${ampm}`;
                    
                    timelineTicks.appendChild(tick);
                }
            }
        }

        // Render segments
        slots.forEach(s => {
            const sMin = timeToMin(s.start);
            const eMin = timeToMin(s.end);
            const dMin = eMin - sMin;
            const widthPct = (dMin / totalMin) * 100;

            const segment = document.createElement('div');
            const isLunch = s.type === 'Lunch Break';
            const isFilled = s.activity && s.activity.trim().length > 0;
            
            segment.className = `timeline-segment ${isLunch ? 'lunch' : 'work'} ${isFilled ? 'filled' : 'empty'}`;
            segment.style.width = `${widthPct}%`;
            segment.setAttribute('data-row', s.row);

            // Tooltip preview
            const tooltip = document.createElement('div');
            tooltip.className = 'tooltip';
            tooltip.innerHTML = `
                <strong>${s.start} - ${s.end}</strong> (${s.duration}h)<br>
                <span>${s.type}</span><br>
                <span style="color: var(--text-muted); font-size: 0.65rem;">${isLunch ? 'Auto-Skipped' : (isFilled ? 'Logged: ' + s.activity.substring(0, 30) + '...' : 'Empty — Click to edit')}</span>
            `;
            segment.appendChild(tooltip);

            // Click listener: focus card
            if (!isLunch) {
                segment.addEventListener('click', () => {
                    const cardTextarea = document.querySelector(`.slot-textarea[data-row="${s.row}"]`);
                    if (cardTextarea) {
                        const card = cardTextarea.closest('.slot-card');
                        if (card) {
                            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            
                            // Highlight animation outline
                            card.style.outline = '3px solid var(--accent)';
                            card.style.borderRadius = 'var(--radius-md)';
                            cardTextarea.focus();
                            
                            setTimeout(() => {
                                card.style.outline = '';
                            }, 1500);
                        }
                    }
                });
            }

            timelineTrack.appendChild(segment);
        });

        // Initialize/update playhead if selected date is today
        updateTimelinePlayhead(startMin, totalMin);
    }

    function updateTimelinePlayhead(startMin, totalMin) {
        const playhead = document.getElementById('timeline-playhead');
        if (!playhead) return;

        const cfgDate = document.getElementById('cfg-date');
        const todayStr = new Date().toISOString().split('T')[0];
        
        if (cfgDate && cfgDate.value === todayStr) {
            const now = new Date();
            const currMin = now.getHours() * 60 + now.getMinutes();
            const endMin = startMin + totalMin;

            if (currMin >= startMin && currMin <= endMin) {
                const pct = ((currMin - startMin) / totalMin) * 100;
                playhead.style.left = `${pct}%`;
                playhead.style.display = 'block';
                return;
            }
        }
        playhead.style.display = 'none';
    }

    // ═══════════════════════════════════════
    // WEEK CALENDAR EXPLORER RENDERER
    // ═══════════════════════════════════════
    function loadWeeklyProgress(weekNum) {
        if (!weekDaysGrid) return;
        
        timesheetWeekBadge.textContent = `Week ${weekNum} Progress`;
        
        // Render Loading Indicator
        weekDaysGrid.innerHTML = `
            <div style="grid-column: 1 / -1; padding: 3rem; text-align: center; color: var(--text-secondary);">
                <div class="spinner" style="margin: 0 auto 1rem;"></div>
                Scanning timesheet Excel data...
            </div>
        `;
        
        fetch('/api/load-week', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                week_num: weekNum,
                teams_sync_dir: cfgTeamsDir.value.trim()
            })
        })
        .then(res => res.json())
        .then(data => {
            if (timesheetEmpty) timesheetEmpty.classList.add('hidden');
            if (timesheetLoaded) timesheetLoaded.classList.remove('hidden');

            weekDaysGrid.innerHTML = '';
            const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

            data.days.forEach(day => {
                const dayCard = document.createElement('div');
                dayCard.className = 'day-card';

                const initialized = day.initialized;
                const pct = day.work_slots > 0 ? Math.round((day.filled_slots / day.work_slots) * 100) : 0;
                
                let statusBadge = '<span class="badge badge-danger">Not Started</span>';
                if (initialized) {
                    statusBadge = pct === 100 
                        ? '<span class="badge badge-success">Fully Logged</span>'
                        : `<span class="badge badge-warning">${day.filled_slots}/${day.work_slots} Logged</span>`;
                }

                const logPreview = day.log 
                    ? day.log 
                    : (initialized ? 'Draft details in timesheet...' : 'No work blocks loaded for this day.');

                dayCard.innerHTML = `
                    <div class="day-card-header">
                        <div class="day-card-title">${dayNames[day.day_num - 1]}</div>
                        ${statusBadge}
                    </div>
                    <div class="day-progress-bar">
                        <div class="day-progress-fill" style="width: ${pct}%"></div>
                    </div>
                    <div class="day-progress-label">
                        <span>Completion</span>
                        <span>${pct}% (${day.hours.toFixed(1)}h)</span>
                    </div>
                    <div class="day-preview-log" title="${logPreview}">
                        ${logPreview}
                    </div>
                    <div class="day-card-actions">
                        <button class="btn btn-ghost btn-sm btn-block load-day-btn" data-day="${day.day_num}">
                            <i class="fa-solid fa-folder-open"></i> Load Day Details
                        </button>
                    </div>
                `;

                // Wire up Load Day button
                dayCard.querySelector('.load-day-btn').addEventListener('click', () => {
                    cfgDay.value = day.day_num.toString();
                    
                    // Set cfgDate matching this week day
                    const weekStartDate = getWeekStartDate(weekNum);
                    if (weekStartDate) {
                        const targetDate = new Date(weekStartDate);
                        targetDate.setDate(targetDate.getDate() + (day.day_num - 1));
                        
                        const localISO = new Date(targetDate.getTime() - targetDate.getTimezoneOffset() * 60000).toISOString().split('T')[0];
                        cfgDate.value = localISO;
                    }
                    
                    // Submit configForm to load the day
                    configForm.dispatchEvent(new Event('submit'));
                });

                weekDaysGrid.appendChild(dayCard);
            });
        })
        .catch(err => {
            console.error('Week load error:', err);
            weekDaysGrid.innerHTML = `
                <div style="grid-column: 1 / -1; padding: 2rem; text-align: center; color: var(--error);">
                    <i class="fa-solid fa-triangle-exclamation" style="font-size: 2rem; margin-bottom: 0.5rem;"></i>
                    <p>Failed to scan week progress log data. Make sure a valid sheet is selected.</p>
                </div>
            `;
        });
    }

    // Helper to calculate start date of a week index
    function getWeekStartDate(weekNum) {
        const cfgDateVal = cfgDate.value;
        const currentSelectedDate = new Date(cfgDateVal);
        if (isNaN(currentSelectedDate.getTime())) return null;
        
        const dayOffset = currentSelectedDate.getDay() - 1; // days since monday (0-indexed)
        const monday = new Date(currentSelectedDate);
        monday.setDate(monday.getDate() - (dayOffset < 0 ? 4 : dayOffset)); // fallback for weekends
        
        const currentWeekVal = parseInt(cfgWeek.value) || 1;
        const weekDiff = weekNum - currentWeekVal;
        
        const targetMonday = new Date(monday);
        targetMonday.setDate(targetMonday.getDate() + (weekDiff * 7));
        return targetMonday;
    }
});
