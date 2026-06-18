document.addEventListener('DOMContentLoaded', () => {
    // ═══════════════════════════════════════
    // DOM REFERENCES
    // ═══════════════════════════════════════
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const headerDateEl = document.getElementById('header-date');

    const studentsTableBody = document.getElementById('students-table-body');
    const tasksTableBody = document.getElementById('tasks-table-body');

    // Modals
    const logsModal = document.getElementById('logs-modal');
    const logsModalTitle = document.getElementById('logs-modal-title');
    const logDateInput = document.getElementById('log-date');
    const loadLogsBtn = document.getElementById('load-logs-btn');
    const logsContainer = document.getElementById('logs-container');
    const logsModalClose = document.getElementById('logs-modal-close');

    const taskModal = document.getElementById('task-modal');
    const taskModalStudentName = document.getElementById('task-modal-student-name');
    const assignTaskForm = document.getElementById('assign-task-form');
    const taskStudentUsernameInput = document.getElementById('task-student-username');
    const taskDescriptionInput = document.getElementById('task-description');
    const taskModalCancel = document.getElementById('task-modal-cancel');
    const taskModalSubmit = document.getElementById('task-modal-submit');

    // State Variables
    let activeStudentLogUsername = null;

    // ═══════════════════════════════════════
    // INIT
    // ═══════════════════════════════════════
    if (headerDateEl) {
        headerDateEl.textContent = new Date().toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
    }

    // Set default log date in modal to today
    const today = new Date();
    const tzOffset = today.getTimezoneOffset() * 60000;
    const localISO = new Date(today.getTime() - tzOffset).toISOString().split('T')[0];
    if (logDateInput) logDateInput.value = localISO;

    loadStudents();
    loadTasks();

    // ═══════════════════════════════════════
    // SIDEBAR NAVIGATION
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

        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('active');
    }

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const view = item.getAttribute('data-view');
            if (view) switchView(view);
        });
    });

    // Mobile sidebar
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
    // RETRIEVE DATA
    // ═══════════════════════════════════════
    function loadStudents() {
        fetch('/api/mentor/students')
            .then(res => {
                if (!res.ok) throw new Error('Failed to load students.');
                return res.json();
            })
            .then(students => renderStudents(students))
            .catch(err => {
                studentsTableBody.innerHTML = `
                    <tr><td colspan="3" style="text-align: center; color: var(--warning); padding: 2rem;">
                        <i class="fa-solid fa-triangle-exclamation" style="font-size: 1.5rem; margin-bottom: 0.5rem; display: block;"></i>
                        ${err.message}
                    </td></tr>
                `;
            });
    }

    function renderStudents(students) {
        studentsTableBody.innerHTML = '';

        if (students.length === 0) {
            studentsTableBody.innerHTML = `
                <tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 3rem;">
                    <i class="fa-solid fa-graduation-cap" style="font-size: 2.5rem; margin-bottom: 0.5rem; display: block; opacity: 0.4;"></i>
                    No students currently assigned to you.
                </td></tr>
            `;
            return;
        }

        students.forEach(s => {
            const tr = document.createElement('tr');
            const initials = s.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            
            const fileBadge = s.excel_exists
                ? '<span class="badge badge-success"><i class="fa-solid fa-file-excel"></i> Ready</span>'
                : '<span class="badge badge-danger"><i class="fa-solid fa-xmark"></i> Missing</span>';

            tr.innerHTML = `
                <td>
                    <div class="student-cell">
                        <div class="student-avatar">${initials}</div>
                        <div>
                            <div class="student-name">${s.full_name}</div>
                            <div class="student-username">@${s.username}</div>
                        </div>
                    </div>
                </td>
                <td>${fileBadge}</td>
                <td>
                    <div class="actions-cell">
                        <button class="btn btn-outline btn-sm view-logs-btn" data-username="${s.username}" data-name="${s.full_name}">
                            <i class="fa-solid fa-eye"></i> View Logs
                        </button>
                        <button class="btn btn-primary btn-sm assign-task-btn" data-username="${s.username}" data-name="${s.full_name}">
                            <i class="fa-solid fa-plus"></i> Assign Task
                        </button>
                    </div>
                </td>
            `;
            studentsTableBody.appendChild(tr);
        });

        // Event listeners
        document.querySelectorAll('.view-logs-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const username = btn.getAttribute('data-username');
                const name = btn.getAttribute('data-name');
                openLogsModal(username, name);
            });
        });

        document.querySelectorAll('.assign-task-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const username = btn.getAttribute('data-username');
                const name = btn.getAttribute('data-name');
                openTaskModal(username, name);
            });
        });
    }

    // ═══════════════════════════════════════
    // LOGS VIEWER MODAL
    // ═══════════════════════════════════════
    function openLogsModal(username, name) {
        activeStudentLogUsername = username;
        logsModalTitle.textContent = `${name}'s Log Sheet`;
        logsContainer.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); padding: 2rem;">
                Click "Load Logs" to load timesheet items for ${logDateInput.value}.
            </div>
        `;
        logsModal.classList.remove('hidden');
    }

    if (logsModalClose) {
        logsModalClose.addEventListener('click', () => {
            logsModal.classList.add('hidden');
            activeStudentLogUsername = null;
        });
    }

    if (loadLogsBtn) {
        loadLogsBtn.addEventListener('click', () => {
            if (!activeStudentLogUsername) return;
            const date = logDateInput.value;

            logsContainer.innerHTML = `
                <div style="text-align: center; padding: 2rem;">
                    <i class="fa-solid fa-spinner fa-spin" style="font-size: 1.5rem; color: var(--accent);"></i>
                    <span style="display: block; margin-top: 0.5rem; color: var(--text-muted);">Fetching log sheet...</span>
                </div>
            `;

            fetch(`/api/mentor/student-logs/${activeStudentLogUsername}?date=${date}`)
                .then(res => {
                    if (!res.ok) return res.json().then(d => { throw new Error(d.error || 'Failed to fetch logs.'); });
                    return res.json();
                })
                .then(data => {
                    renderStudentLogs(data.slots);
                })
                .catch(err => {
                    logsContainer.innerHTML = `
                        <div style="text-align: center; color: var(--error); padding: 2rem;">
                            <i class="fa-solid fa-triangle-exclamation" style="font-size: 1.5rem; margin-bottom: 0.5rem; display: block;"></i>
                            ${err.message}
                        </div>
                    `;
                });
        });
    }

    function renderStudentLogs(slots) {
        logsContainer.innerHTML = '';

        if (!slots || slots.length === 0) {
            logsContainer.innerHTML = `
                <div style="text-align: center; color: var(--text-muted); padding: 2rem;">
                    No logs initialized/saved for this date.
                </div>
            `;
            return;
        }

        const list = document.createElement('div');
        list.style.display = 'flex';
        list.style.flexDirection = 'column';
        list.style.gap = '0.75rem';

        slots.forEach(s => {
            const card = document.createElement('div');
            const isLunch = s.type === 'Lunch Break';
            
            card.style.background = isLunch ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)';
            card.style.border = '1px solid var(--border)';
            card.style.borderRadius = 'var(--radius-sm)';
            card.style.padding = '0.75rem 1rem';
            card.style.display = 'flex';
            card.style.justifyContent = 'space-between';
            card.style.alignItems = 'center';
            card.style.gap = '1rem';

            const timeStr = `${s.start} - ${s.end} (${s.duration}h)`;
            const categoryBadge = isLunch 
                ? '<span class="badge badge-ghost">Lunch</span>' 
                : `<span class="badge badge-info">${s.type}</span>`;
            
            const activityText = s.activity && s.activity.trim() 
                ? s.activity 
                : '<span style="color: var(--text-muted); font-style: italic;">No description logged</span>';

            card.innerHTML = `
                <div style="flex: 1;">
                    <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.25rem;">
                        <span style="font-family: var(--font-heading); font-weight: 600; font-size: 0.85rem; color: var(--text-primary);">${timeStr}</span>
                        ${categoryBadge}
                    </div>
                    <div style="font-size: 0.85rem; line-height: 1.4; color: var(--text-secondary);">${activityText}</div>
                </div>
            `;
            list.appendChild(card);
        });

        logsContainer.appendChild(list);
    }

    // ═══════════════════════════════════════
    // ASSIGN TASK MODAL
    // ═══════════════════════════════════════
    function openTaskModal(username, name) {
        taskStudentUsernameInput.value = username;
        taskModalStudentName.textContent = name;
        taskDescriptionInput.value = '';
        taskModal.classList.remove('hidden');
    }

    if (taskModalCancel) {
        taskModalCancel.addEventListener('click', () => {
            taskModal.classList.add('hidden');
        });
    }

    assignTaskForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const student_username = taskStudentUsernameInput.value;
        const description = taskDescriptionInput.value.trim();

        taskModalSubmit.disabled = true;
        taskModalSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Assigning...';

        fetch('/api/mentor/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ student_username, description })
        })
        .then(res => {
            if (!res.ok) return res.json().then(d => { throw new Error(d.error || 'Failed to assign task.'); });
            return res.json();
        })
        .then(() => {
            taskModalSubmit.disabled = false;
            taskModalSubmit.innerHTML = 'Assign Task';
            taskModal.classList.add('hidden');
            showToast('Task assigned successfully!', 'success');
            loadTasks();
        })
        .catch(err => {
            taskModalSubmit.disabled = false;
            taskModalSubmit.innerHTML = 'Assign Task';
            showToast(err.message, 'error');
        });
    });

    // ═══════════════════════════════════════
    // TASKS HISTORY
    // ═══════════════════════════════════════
    function loadTasks() {
        fetch('/api/mentor/tasks')
            .then(res => {
                if (!res.ok) throw new Error('Failed to load tasks.');
                return res.json();
            })
            .then(tasks => renderTasks(tasks))
            .catch(err => console.error(err));
    }

    function renderTasks(tasks) {
        tasksTableBody.innerHTML = '';

        if (tasks.length === 0) {
            tasksTableBody.innerHTML = `
                <tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 3rem;">
                    <i class="fa-solid fa-list-check" style="font-size: 2.5rem; margin-bottom: 0.5rem; display: block; opacity: 0.4;"></i>
                    No tasks currently assigned to your students.
                </td></tr>
            `;
            return;
        }

        tasks.forEach(t => {
            const tr = document.createElement('tr');
            
            const statusBadge = t.status === 'completed'
                ? '<span class="badge badge-success"><i class="fa-solid fa-check"></i> Completed</span>'
                : '<span class="badge badge-warning"><i class="fa-solid fa-hourglass"></i> Pending</span>';

            tr.innerHTML = `
                <td><strong>${t.student_name}</strong><br><span style="font-size: 0.72rem; color: var(--text-muted);">@${t.student_username}</span></td>
                <td style="max-width: 300px; word-break: break-word;">${t.task_description}</td>
                <td>${t.assigned_date}</td>
                <td>${statusBadge}</td>
                <td>
                    <button class="btn btn-danger btn-sm delete-task-btn" data-id="${t.id}">
                        <i class="fa-solid fa-trash-can"></i> Delete
                    </button>
                </td>
            `;
            tasksTableBody.appendChild(tr);
        });

        // Event listeners
        document.querySelectorAll('.delete-task-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                deleteTask(id);
            });
        });
    }

    function deleteTask(id) {
        fetch(`/api/mentor/tasks/${id}`, { method: 'DELETE' })
            .then(res => {
                if (!res.ok) return res.json().then(d => { throw new Error(d.error || 'Failed to delete task.'); });
                return res.json();
            })
            .then(() => {
                showToast('Task deleted successfully.', 'success');
                loadTasks();
            })
            .catch(err => showToast(err.message, 'error'));
    }

    // ═══════════════════════════════════════
    // TOAST NOTIFICATIONS
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
});
