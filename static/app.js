document.addEventListener('DOMContentLoaded', () => {
    // ═══════════════════════════════════════
    // DOM REFERENCES
    // ═══════════════════════════════════════
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');

    const configForm = document.getElementById('config-form');
    const cfgUsername = document.getElementById('cfg-username');
    const cfgDate = document.getElementById('cfg-date');
    const cfgArrival = document.getElementById('cfg-arrival');
    const loadBtn = document.getElementById('load-btn');
    const summaryBtn = document.getElementById('summary-btn');
    const downloadTimesheetBtn = document.getElementById('download-timesheet-btn');

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
    let currentSlots = [];

    // ═══════════════════════════════════════
    // THEME CONTROLLER
    // ═══════════════════════════════════════
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    
    function initTheme() {
        const savedTheme = localStorage.getItem('theme') || 'dark';
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
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
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

        if (viewName === 'mentor-tasks') {
            loadStudentTasks();
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
    // COLLAPSIBLE SIDEBAR TOGGLE
    // ═══════════════════════════════════════
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const mainArea = document.querySelector('.main-area');

    if (localStorage.getItem('sidebar-collapsed') === 'true') {
        sidebar.classList.add('collapsed');
    }

    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            const isCollapsed = sidebar.classList.contains('collapsed');
            localStorage.setItem('sidebar-collapsed', isCollapsed);
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
        })
        .catch(err => console.error('Config load error:', err));

    // ═══════════════════════════════════════
    // LOAD TIMESHEET
    // ═══════════════════════════════════════
    configForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const username = cfgUsername.value.trim();
        const date_val = cfgDate.value;
        const arrival_time = cfgArrival.value;

        if (!username) { showToast('Username is required.', 'warning'); return; }

        loadBtn.disabled = true;
        loadBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...';

        fetch('/api/load-timesheet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, date_val, arrival_time })
        })
        .then(res => {
            if (!res.ok) throw new Error('Failed to load timesheet.');
            return res.json();
        })
        .then(data => {
            loadBtn.disabled = false;
            loadBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> Load Timesheet';

            // Save state cache
            currentSlots = data.slots;

            // Update KPIs
            updateKPIs(data.slots);
            updateKPIRings(data.slots);

            // Switch to dashboard and show loaded content
            dashboardEmpty.classList.add('hidden');
            dashboardLoaded.classList.remove('hidden');
            timesheetDateBadge.textContent = date_val;

            // Render visual Day Timeline
            renderDayTimeline(data.slots, arrival_time);

            // Also make timesheet view mirror dashboard
            const timesheetEmpty = document.getElementById('timesheet-empty');
            if (timesheetEmpty) timesheetEmpty.classList.add('hidden');

            renderSlotCards(data.slots);
            switchView('dashboard');
            showToast('Timesheet loaded successfully!', 'success');
            addActivity('Loaded timesheet', date_val);
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
    function updateKPIs(slots) {
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
        const kpiDate = document.getElementById('kpi-date');
        const kpiDayLabel = document.getElementById('kpi-day-label');
        const kpiSummary = document.getElementById('kpi-summary');

        if (kpiHours) animateValue(kpiHours, totalHours, 'h');
        if (kpiSlots) kpiSlots.textContent = `${filledSlots} / ${workSlots}`;
        if (kpiDate) kpiDate.textContent = cfgDate.value;
        if (kpiDayLabel) {
            const current = new Date(cfgDate.value);
            const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            kpiDayLabel.textContent = days[current.getDay()] || '';
        }
        if (kpiSummary) { 
            kpiSummary.textContent = 'Not sent'; 
            kpiSummary.style.color = 'var(--warning)'; 
            document.getElementById('summary-banner').style.display = 'flex';
        }
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
            body: JSON.stringify({ username, date_val: cfgDate.value, row, text })
        })
        .then(res => {
            if (!res.ok) throw new Error();
            if (badge) {
                badge.className = 'slot-status saved';
                badge.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Saved';
            }

            // Find slot in local currentSlots and update it
            const matchedSlot = currentSlots.find(s => s.row === row);
            if (matchedSlot) {
                matchedSlot.activity = text;
            }

            // Update real-time visual progress ring
            updateKPIRings(currentSlots);

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
    // SEND DAILY SUMMARY
    // ═══════════════════════════════════════
    if (summaryBtn) {
        summaryBtn.addEventListener('click', () => {
            switchView('ai-summary');
        });
    }

    if (downloadTimesheetBtn) {
        downloadTimesheetBtn.addEventListener('click', () => {
            window.location.href = '/api/download-timesheet';
        });
    }

    // ═══════════════════════════════════════
    // AI SUMMARY PAGE LOGIC
    // ═══════════════════════════════════════
    const pageSummaryBtn = document.getElementById('page-summary-btn');
    const pageSummarySend = document.getElementById('page-summary-send');
    const aiSummaryEditorContainer = document.getElementById('ai-summary-editor-container');
    const pageSummaryEditor = document.getElementById('page-summary-text-editor');

    if (pageSummaryBtn) {
        pageSummaryBtn.addEventListener('click', () => {
            const username = cfgUsername.value.trim();
            const date_val = cfgDate.value;

            pageSummaryBtn.disabled = true;
            pageSummaryBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating...';

            fetch('/api/generate-summary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, date_val })
            })
            .then(res => {
                if (!res.ok) throw new Error('Failed to generate summary.');
                return res.json();
            })
            .then(data => {
                pageSummaryBtn.disabled = false;
                pageSummaryBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Generate AI Summary';
                
                if (aiSummaryEditorContainer && pageSummaryEditor) {
                    pageSummaryEditor.value = data.summary_text || '';
                    aiSummaryEditorContainer.classList.remove('hidden');
                }
            })
            .catch(err => {
                pageSummaryBtn.disabled = false;
                pageSummaryBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Generate AI Summary';
                showToast(err.message, 'error');
            });
        });
    }

    if (pageSummarySend) {
        pageSummarySend.addEventListener('click', () => {
            const username = cfgUsername.value.trim();
            const date_val = cfgDate.value;
            const summary_text = pageSummaryEditor ? pageSummaryEditor.value : '';

            pageSummarySend.disabled = true;
            pageSummarySend.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';

            fetch('/api/send-summary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, date_val, summary_text })
            })
            .then(res => {
                if (!res.ok) return res.json().then(d => { throw new Error(d.error || 'Failed to send summary.') });
                return res.json();
            })
            .then(() => {
                pageSummarySend.disabled = false;
                pageSummarySend.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Final Summary';
                
                if (aiSummaryEditorContainer) {
                    aiSummaryEditorContainer.classList.add('hidden');
                }
                if (pageSummaryEditor) {
                    pageSummaryEditor.value = '';
                }

                showToast('Daily summary sent to mentor successfully!', 'success');
                addActivity('Sent summary', date_val);

                // Update Mentor Summary Ring to 100%
                updateRing('summary', 100, 'Sent ✓');
                const kpiSummary = document.getElementById('kpi-summary');
                if (kpiSummary) {
                    kpiSummary.style.color = 'var(--success)';
                }
            })
            .catch(err => {
                pageSummarySend.disabled = false;
                pageSummarySend.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Final Summary';
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
    function updateKPIRings(slots) {
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

        // 3. Active Date ring
        updateRing('date', 100, cfgDate.value);

        // 4. Mentor Summary ring
        const kpiSummary = document.getElementById('kpi-summary');
        const summaryText = kpiSummary ? kpiSummary.textContent.trim() : 'Not sent';
        let summaryPct = 0;
        if (summaryText.includes('Sent')) summaryPct = 100;
        updateRing('summary', summaryPct, summaryText);
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
    // STUDENT MENTOR TASKS LOGIC
    // ═══════════════════════════════════════
    const studentTasksBody = document.getElementById('student-tasks-body');

    function loadStudentTasks() {
        if (!studentTasksBody) return;
        studentTasksBody.innerHTML = `
            <tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">
                <div class="spinner spinner-sm" style="margin: 0 auto 0.75rem;"></div>
                Loading tasks...
            </td></tr>
        `;

        fetch('/api/student/tasks')
            .then(res => {
                if (!res.ok) throw new Error('Failed to load tasks.');
                return res.json();
            })
            .then(tasks => renderStudentTasks(tasks))
            .catch(err => {
                studentTasksBody.innerHTML = `
                    <tr><td colspan="5" style="text-align: center; color: var(--warning); padding: 2rem;">
                        <i class="fa-solid fa-triangle-exclamation" style="font-size: 1.5rem; margin-bottom: 0.5rem; display: block;"></i>
                        ${err.message}
                    </td></tr>
                `;
            });
    }

    function renderStudentTasks(tasks) {
        if (!studentTasksBody) return;
        studentTasksBody.innerHTML = '';

        if (tasks.length === 0) {
            studentTasksBody.innerHTML = `
                <tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 3rem;">
                    <i class="fa-solid fa-list-check" style="font-size: 2.5rem; margin-bottom: 0.5rem; display: block; opacity: 0.4;"></i>
                    No tasks assigned by your mentor yet.
                </td></tr>
            `;
            return;
        }

        tasks.forEach(t => {
            const tr = document.createElement('tr');
            
            const isCompleted = t.status === 'completed';
            const checkboxHtml = isCompleted 
                ? '<i class="fa-solid fa-circle-check" style="color: var(--success); font-size: 1.25rem;"></i>' 
                : `<input type="checkbox" class="complete-task-checkbox" data-id="${t.id}" style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--accent);">`;

            const statusBadge = isCompleted 
                ? '<span class="badge badge-success"><i class="fa-solid fa-check"></i> Completed</span>' 
                : '<span class="badge badge-warning"><i class="fa-solid fa-hourglass"></i> Pending</span>';

            let responseHtml = '';
            if (isCompleted) {
                if (t.response_message || t.attachment_filename) {
                    responseHtml = '<div style="margin-top: 0.5rem; padding: 0.5rem; background: rgba(255,255,255,0.02); border-radius: 4px; font-size: 0.8rem; border: 1px solid var(--border);">';
                    if (t.response_message) {
                        responseHtml += `<div><strong>Response:</strong> ${t.response_message}</div>`;
                    }
                    if (t.attachment_filename) {
                        responseHtml += `<div style="margin-top: 0.25rem;"><a href="${t.attachment_path}" target="_blank" style="color: var(--accent);"><i class="fa-solid fa-paperclip"></i> ${t.attachment_filename}</a></div>`;
                    }
                    responseHtml += '</div>';
                }
            }

            tr.innerHTML = `
                <td style="text-align: center; vertical-align: middle;">${checkboxHtml}</td>
                <td>
                    <div style="${isCompleted ? 'text-decoration: line-through; opacity: 0.6;' : ''}">${t.task_description}</div>
                    ${responseHtml}
                </td>
                <td>${t.assigned_date}</td>
                <td><strong>${t.mentor_name}</strong></td>
                <td>${statusBadge}</td>
            `;
            studentTasksBody.appendChild(tr);
        });

        // Event listener for task checkboxes
        document.querySelectorAll('.complete-task-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    checkbox.checked = false; // Reset checkbox state immediately since we're opening modal
                    const id = checkbox.getAttribute('data-id');
                    openCompleteTaskModal(id);
                }
            });
        });
    }

    // Complete Task Modal DOM
    const completeTaskModal = document.getElementById('complete-task-modal');
    const completeTaskForm = document.getElementById('complete-task-form');
    const completeTaskIdInput = document.getElementById('complete-task-id');
    const taskResponseMsgInput = document.getElementById('task-response-msg');
    const taskAttachmentInput = document.getElementById('task-attachment');
    const completeTaskCancel = document.getElementById('complete-task-cancel');

    function openCompleteTaskModal(id) {
        if (!completeTaskModal) return;
        completeTaskIdInput.value = id;
        taskResponseMsgInput.value = '';
        taskAttachmentInput.value = '';
        completeTaskModal.classList.remove('hidden');
    }

    if (completeTaskCancel) {
        completeTaskCancel.addEventListener('click', () => {
            completeTaskModal.classList.add('hidden');
        });
    }

    if (completeTaskForm) {
        completeTaskForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const id = completeTaskIdInput.value;
            const response_message = taskResponseMsgInput.value.trim();
            const file = taskAttachmentInput.files[0];

            const submitBtn = document.getElementById('complete-task-submit');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';

            const formData = new FormData();
            formData.append('response_message', response_message);
            if (file) {
                formData.append('file', file);
            }

            fetch(`/api/student/tasks/${id}/complete`, {
                method: 'POST',
                body: formData
            })
            .then(res => {
                if (!res.ok) throw new Error('Failed to complete task.');
                return res.json();
            })
            .then(() => {
                showToast('Task completed successfully!', 'success');
                completeTaskModal.classList.add('hidden');
                loadStudentTasks();
            })
            .catch(err => {
                showToast(err.message, 'error');
            })
            .finally(() => {
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Submit Response';
            });
        });
    }

});
