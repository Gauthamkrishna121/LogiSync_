document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const configForm = document.getElementById('config-form');
    const usernameInput = document.getElementById('username');
    const weekSelect = document.getElementById('week_num');
    const daySelect = document.getElementById('day_num');
    const dateInput = document.getElementById('date_val');
    const arrivalInput = document.getElementById('arrival_time');
    
    const loadBtn = document.getElementById('load-btn');
    const syncBtn = document.getElementById('sync-btn');
    
    const emptyState = document.getElementById('empty-state');
    const loadingState = document.getElementById('loading-state');
    const timesheetArea = document.getElementById('timesheet-area');
    const slotsContainer = document.getElementById('slots-container');
    
    const currentTitle = document.getElementById('current-title');
    const currentDateBadge = document.getElementById('current-date-badge');
    
    // Set default date to today
    const today = new Date();
    const tzOffset = today.getTimezoneOffset() * 60000; // offset in milliseconds
    const localISODate = new Date(today.getTime() - tzOffset).toISOString().split('T')[0];
    dateInput.value = localISODate;

    // Load initial config from backend
    fetch('/api/config')
        .then(response => response.json())
        .then(config => {
            if (config.default_username) {
                usernameInput.value = config.default_username;
            }
            if (config.start_date) {
                // Auto calculate week/day based on date input and start_date if needed
                calculateWeekAndDay(config.start_date);
            }
        })
        .catch(err => console.error('Error fetching config:', err));

    // Dynamic week/day calculator
    dateInput.addEventListener('change', () => {
        fetch('/api/config')
            .then(res => res.json())
            .then(config => {
                if (config.start_date) {
                    calculateWeekAndDay(config.start_date);
                }
            });
    });

    function calculateWeekAndDay(startDateStr) {
        const start = new Date(startDateStr);
        const current = new Date(dateInput.value);
        if (isNaN(start.getTime()) || isNaN(current.getTime())) return;

        // Reset hours for date comparison
        start.setHours(0,0,0,0);
        current.setHours(0,0,0,0);

        const diffTime = current.getTime() - start.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            // If before start date, default to Week 1 Day 1
            weekSelect.value = "1";
            daySelect.value = "1";
            return;
        }

        const week = Math.floor(diffDays / 7) + 1;
        // JS getDay() returns 0 for Sunday, 1 for Monday, etc.
        let day = current.getDay(); 
        
        // Map to 1-5 (Mon-Fri)
        if (day === 0 || day === 6) {
            day = 5; // Default to Friday if it's weekend
        }

        weekSelect.value = week.toString();
        daySelect.value = day.toString();
    }

    // Submit Config Form to Load Slots
    configForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const username = usernameInput.value.trim();
        const week_num = parseInt(weekSelect.value);
        const day_num = parseInt(daySelect.value);
        const date_val = dateInput.value;
        const arrival_time = arrivalInput.value;

        if (!username) {
            showToast('Please enter a username or folder name.', 'warning');
            return;
        }

        // Show loading state
        emptyState.classList.add('hidden');
        timesheetArea.classList.add('hidden');
        loadingState.classList.remove('hidden');
        loadBtn.disabled = true;

        fetch('/api/load-timesheet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, week_num, day_num, date_val, arrival_time })
        })
        .then(response => {
            if (!response.ok) throw new Error('Failed to load timesheet.');
            return response.json();
        })
        .then(data => {
            loadingState.classList.add('hidden');
            timesheetArea.classList.remove('hidden');
            loadBtn.disabled = false;
            
            // Set header info
            currentTitle.textContent = `${username}'s Timesheet`;
            currentDateBadge.textContent = `Week ${week_num}, Day ${day_num} • ${date_val}`;

            renderSlotCards(data.slots);
            showToast('Timesheet loaded successfully!', 'success');
        })
        .catch(err => {
            loadingState.classList.add('hidden');
            emptyState.classList.remove('hidden');
            loadBtn.disabled = false;
            showToast(err.message, 'warning');
        });
    });

    // Render Slots into Dashboard
    function renderSlotCards(slots) {
        slotsContainer.innerHTML = '';

        slots.forEach(slot => {
            const card = document.createElement('div');
            card.className = `slot-card ${slot.type === 'Lunch Break' ? 'lunch-break' : ''}`;
            
            // Format times
            const timeStr = `${slot.start} - ${slot.end}`;
            const durationStr = `${slot.duration} hrs`;

            if (slot.type === 'Lunch Break') {
                card.innerHTML = `
                    <div class="slot-time-info">
                        <div class="time-range">${timeStr}</div>
                        <div class="slot-meta">
                            <i class="fa-solid fa-mug-hot"></i>
                            <span>${durationStr}</span>
                        </div>
                    </div>
                    <div class="slot-content">
                        <div class="slot-header">
                            <span class="category-tag">Lunch Break</span>
                        </div>
                        <div class="lunch-placeholder">
                            <i class="fa-solid fa-utensils"></i> Blocked for Lunch Hour (Auto-skipped in daily log)
                        </div>
                    </div>
                `;
            } else {
                card.innerHTML = `
                    <div class="slot-time-info">
                        <div class="time-range">${timeStr}</div>
                        <div class="slot-meta">
                            <i class="fa-solid fa-hourglass-half"></i>
                            <span>${durationStr}</span>
                        </div>
                    </div>
                    <div class="slot-content">
                        <div class="slot-header">
                            <span class="category-tag">${slot.type}</span>
                            <span class="save-badge saved" id="status-${slot.row}">
                                <i class="fa-solid fa-cloud-arrow-up"></i> Synced to Excel
                            </span>
                        </div>
                        <div class="slot-input-wrapper">
                            <textarea 
                                class="slot-textarea" 
                                data-row="${slot.row}"
                                placeholder="Enter what you did during this slot..."
                            >${slot.activity || ''}</textarea>
                        </div>
                    </div>
                `;

                // Add auto-saving to textarea on blur / focus-out
                const textarea = card.querySelector('.slot-textarea');
                textarea.addEventListener('blur', () => saveSlot(slot.row, textarea.value));
                textarea.addEventListener('input', () => {
                    const badge = document.getElementById(`status-${slot.row}`);
                    badge.className = 'save-badge unsaved';
                    badge.innerHTML = '<i class="fa-solid fa-circle-dot"></i> Unsaved Draft';
                });
            }
            
            slotsContainer.appendChild(card);
        });
    }

    // Save Single Slot Value
    function saveSlot(row, text) {
        const username = usernameInput.value.trim();
        const badge = document.getElementById(`status-${row}`);
        
        badge.className = 'save-badge unsaved';
        badge.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

        fetch('/api/save-slot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, row, text })
        })
        .then(response => {
            if (!response.ok) throw new Error();
            badge.className = 'save-badge saved';
            badge.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Synced to Excel';
        })
        .catch(() => {
            badge.className = 'save-badge unsaved';
            badge.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Save Failed';
            showToast('Failed to save slot. Check backend connection.', 'warning');
        });
    }

    // Sync Day Timesheet to Sheet1
    syncBtn.addEventListener('click', () => {
        const username = usernameInput.value.trim();
        const week_num = parseInt(weekSelect.value);
        const day_num = parseInt(daySelect.value);

        syncBtn.disabled = true;
        syncBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Syncing to Teams...';

        fetch('/api/sync-day', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, week_num, day_num })
        })
        .then(response => {
            if (!response.ok) throw new Error('Daily log sync failed.');
            return response.json();
        })
        .then(data => {
            syncBtn.disabled = false;
            syncBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Sync & Save to MS Teams';
            showToast('Successfully synchronized timesheet logs to Daily Summary!', 'success');
        })
        .catch(err => {
            syncBtn.disabled = false;
            syncBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Sync & Save to MS Teams';
            showToast(err.message, 'warning');
        });
    });

    // Toast Utility function
    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        let iconHtml = '<i class="fa-solid fa-circle-info toast-icon"></i>';
        if (type === 'success') {
            iconHtml = '<i class="fa-solid fa-circle-check toast-icon"></i>';
        } else if (type === 'warning') {
            iconHtml = '<i class="fa-solid fa-triangle-exclamation toast-icon"></i>';
        }

        toast.innerHTML = `
            ${iconHtml}
            <span class="toast-message">${message}</span>
        `;
        
        container.appendChild(toast);
        
        // Auto remove toast
        setTimeout(() => {
            toast.style.animation = 'fadeOut 0.3s forwards';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }
});
