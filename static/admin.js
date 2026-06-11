document.addEventListener('DOMContentLoaded', () => {
    // DOM elements
    const globalConfigForm = document.getElementById('global-config-form');
    const teamsSyncDirInput = document.getElementById('teams_sync_dir');
    const startDateInput = document.getElementById('start_date');
    const saveConfigBtn = document.getElementById('save-config-btn');

    const addStudentForm = document.getElementById('add-student-form');
    const studentUsernameInput = document.getElementById('username');
    const studentFullNameInput = document.getElementById('full_name');
    const studentPasswordInput = document.getElementById('password');
    const autoCreateCheckbox = document.getElementById('auto_create_folder');
    const addStudentBtn = document.getElementById('add-student-btn');

    const studentsTableBody = document.getElementById('students-table-body');

    let globalConfig = {
        teams_sync_dir: 'users',
        start_date: '2026-06-01'
    };

    // Initialize Page
    loadConfig();
    loadStudents();

    // 1. Config Loading & Saving
    function loadConfig() {
        fetch('/api/admin/config')
            .then(res => {
                if (!res.ok) throw new Error('Failed to load global configurations.');
                return res.json();
            })
            .then(data => {
                globalConfig = data;
                teamsSyncDirInput.value = data.teams_sync_dir;
                startDateInput.value = data.start_date;
            })
            .catch(err => showToast(err.message, 'warning'));
    }

    globalConfigForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const teams_sync_dir = teamsSyncDirInput.value.trim();
        const start_date = startDateInput.value;

        saveConfigBtn.disabled = true;
        saveConfigBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

        fetch('/api/admin/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ teams_sync_dir, start_date })
        })
        .then(res => {
            if (!res.ok) throw new Error('Failed to save settings.');
            return res.json();
        })
        .then(data => {
            globalConfig = data.config;
            saveConfigBtn.disabled = false;
            saveConfigBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Settings';
            showToast('Configuration settings updated successfully!', 'success');
            // Reload students list since folder existence paths might have changed
            loadStudents();
        })
        .catch(err => {
            saveConfigBtn.disabled = false;
            saveConfigBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Settings';
            showToast(err.message, 'warning');
        });
    });

    // 2. Student Profiles CRUD operations
    function loadStudents() {
        fetch('/api/admin/students')
            .then(res => {
                if (!res.ok) throw new Error('Failed to retrieve student roster.');
                return res.json();
            })
            .then(students => {
                renderStudents(students);
            })
            .catch(err => {
                studentsTableBody.innerHTML = `
                    <tr>
                        <td colspan="5" style="text-align: center; color: var(--color-warning); padding: 2rem;">
                            <i class="fa-solid fa-circle-exclamation" style="font-size: 1.5rem; margin-bottom: 0.5rem; display: block;"></i>
                            ${err.message}
                        </td>
                    </tr>
                `;
            });
    }

    function renderStudents(students) {
        studentsTableBody.innerHTML = '';
        if (students.length === 0) {
            studentsTableBody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 3rem;">
                        <i class="fa-solid fa-users-slash" style="font-size: 2rem; margin-bottom: 0.5rem; display: block; opacity: 0.4;"></i>
                        No student accounts registered yet.
                    </td>
                </tr>
            `;
            return;
        }

        students.forEach(s => {
            const tr = document.createElement('tr');
            
            // Name initials avatar placeholder
            const initials = s.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            
            // folder path display
            const pathDisplay = `${globalConfig.teams_sync_dir}/${s.username}`;

            // folder status badge
            const folderBadge = s.folder_exists 
                ? '<span class="badge badge-success"><i class="fa-solid fa-folder-check"></i> Created</span>'
                : '<span class="badge badge-warning"><i class="fa-solid fa-folder-plus"></i> Missing</span>';

            // excel status badge
            const excelBadge = s.excel_exists
                ? '<span class="badge badge-success"><i class="fa-solid fa-file-excel"></i> Initialized</span>'
                : '<span class="badge badge-danger"><i class="fa-solid fa-file-circle-exclamation"></i> Missing</span>';

            // create folder button
            const folderBtn = s.folder_exists && s.excel_exists
                ? ''
                : `<button class="btn btn-outline btn-sm create-folder-btn" data-username="${s.username}">
                     <i class="fa-solid fa-folder-plus"></i> Create Folder & Log
                   </button>`;

            tr.innerHTML = `
                <td>
                    <div class="student-meta">
                        <div class="profile-pic-placeholder">${initials}</div>
                        <div>
                            <div style="font-weight: 600; color: var(--text-primary);">${s.full_name}</div>
                            <div style="font-size: 0.8rem; color: var(--text-secondary);">@${s.username}</div>
                        </div>
                    </div>
                </td>
                <td style="font-family: monospace; font-size: 0.8rem; color: var(--text-secondary); max-width: 250px; overflow-wrap: break-word;">
                    ${pathDisplay}
                </td>
                <td>${folderBadge}</td>
                <td>${excelBadge}</td>
                <td>
                    <div class="actions-cell">
                        ${folderBtn}
                        <button class="btn btn-danger btn-sm delete-student-btn" data-username="${s.username}" data-name="${s.full_name}">
                            <i class="fa-solid fa-user-xmark"></i> Remove
                        </button>
                    </div>
                </td>
            `;

            studentsTableBody.appendChild(tr);
        });

        // Add event listeners dynamically to buttons
        document.querySelectorAll('.create-folder-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const username = btn.getAttribute('data-username');
                createStudentFolder(username);
            });
        });

        document.querySelectorAll('.delete-student-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const username = btn.getAttribute('data-username');
                const name = btn.getAttribute('data-name');
                if (confirm(`Are you sure you want to delete the student profile for "${name}" (@${username})?`)) {
                    deleteStudent(username);
                }
            });
        });
    }

    // Add Student Profile Form Submission
    addStudentForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = studentUsernameInput.value.trim().toLowerCase();
        const full_name = studentFullNameInput.value.trim();
        const password = studentPasswordInput.value;
        const auto_create_folder = autoCreateCheckbox.checked;

        addStudentBtn.disabled = true;
        addStudentBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Registering...';

        fetch('/api/admin/students', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, full_name, password, auto_create_folder })
        })
        .then(res => {
            if (!res.ok) {
                return res.json().then(data => {
                    throw new Error(data.error || 'Failed to register student.');
                });
            }
            return res.json();
        })
        .then(data => {
            addStudentBtn.disabled = false;
            addStudentBtn.innerHTML = '<i class="fa-solid fa-user-check"></i> Register Intern';
            showToast(`Registered profile for ${data.student.full_name} successfully!`, 'success');
            
            // Reset form fields
            studentUsernameInput.value = '';
            studentFullNameInput.value = '';
            studentPasswordInput.value = '';
            
            loadStudents();
        })
        .catch(err => {
            addStudentBtn.disabled = false;
            addStudentBtn.innerHTML = '<i class="fa-solid fa-user-check"></i> Register Intern';
            showToast(err.message, 'warning');
        });
    });

    // Create Student Folder & Template Spreadsheet
    function createStudentFolder(username) {
        fetch('/api/admin/create-folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        })
        .then(res => {
            if (!res.ok) {
                return res.json().then(data => {
                    throw new Error(data.error || 'Failed to create student folder.');
                });
            }
            return res.json();
        })
        .then(data => {
            showToast(`Sync folder and log sheet initialized for @${username}!`, 'success');
            loadStudents();
        })
        .catch(err => showToast(err.message, 'warning'));
    }

    // Delete Student Profile
    function deleteStudent(username) {
        fetch(`/api/admin/students/${username}`, {
            method: 'DELETE'
        })
        .then(res => {
            if (!res.ok) {
                return res.json().then(data => {
                    throw new Error(data.error || 'Failed to delete student.');
                });
            }
            return res.json();
        })
        .then(() => {
            showToast(`Successfully deleted student account: @${username}`, 'success');
            loadStudents();
        })
        .catch(err => showToast(err.message, 'warning'));
    }

    // Toast Utility
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
        
        setTimeout(() => {
            toast.style.animation = 'fadeOut 0.3s forwards';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }
});
