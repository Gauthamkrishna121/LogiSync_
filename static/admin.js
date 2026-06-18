document.addEventListener('DOMContentLoaded', () => {
    // ═══════════════════════════════════════
    // DOM REFERENCES
    // ═══════════════════════════════════════
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');



    const addStudentForm = document.getElementById('add-student-form');
    const stuUsernameInput = document.getElementById('stu-username');
    const stuFullNameInput = document.getElementById('stu-fullname');
    const stuPasswordInput = document.getElementById('stu-password');
    const autoCreateCheckbox = document.getElementById('auto-create-folder');
    const addStudentBtn = document.getElementById('add-student-btn');

    const studentsTableBody = document.getElementById('students-table-body');
    const mentorsTableBody = document.getElementById('mentors-table-body');
    const addMentorForm = document.getElementById('add-mentor-form');
    const menUsernameInput = document.getElementById('men-username');
    const menNameInput = document.getElementById('men-name');
    const menEmailInput = document.getElementById('men-email');
    const menPasswordInput = document.getElementById('men-password');
    const addMentorBtn = document.getElementById('add-mentor-btn');
    const stuMentorEmailSelect = document.getElementById('stu-mentor-email');

    // Modal
    const confirmModal = document.getElementById('confirm-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    const modalCancel = document.getElementById('modal-cancel');
    const modalConfirm = document.getElementById('modal-confirm');
    let modalCallback = null;

    // Edit Student Modal DOM
    const editStudentModal = document.getElementById('edit-student-modal');
    const editStudentForm = document.getElementById('edit-student-form');
    const editStuUsername = document.getElementById('edit-stu-username');
    const editStuFullname = document.getElementById('edit-stu-fullname');
    const editStuMentorEmail = document.getElementById('edit-stu-mentor-email');
    const editStuPassword = document.getElementById('edit-stu-password');
    const editStuCancel = document.getElementById('edit-stu-cancel');

    // Edit Mentor Modal DOM
    const editMentorModal = document.getElementById('edit-mentor-modal');
    const editMentorForm = document.getElementById('edit-mentor-form');
    const editMenUsername = document.getElementById('edit-men-username');
    const editMenName = document.getElementById('edit-men-name');
    const editMenEmail = document.getElementById('edit-men-email');
    const editMenPassword = document.getElementById('edit-men-password');
    const editMenCancel = document.getElementById('edit-men-cancel');

    let globalConfig = { teams_sync_dir: 'users' };
    let globalMentors = [];
    let currentStudents = [];

    // ═══════════════════════════════════════
    // HEADER DATE
    // ═══════════════════════════════════════
    const headerDateEl = document.getElementById('header-date');
    if (headerDateEl) {
        headerDateEl.textContent = new Date().toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
    }

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
            panel.offsetHeight;
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

    // "Add Student" shortcut button
    const btnGotoAdd = document.getElementById('btn-goto-add');
    if (btnGotoAdd) btnGotoAdd.addEventListener('click', () => switchView('add-student'));

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
    // MODAL SYSTEM
    // ═══════════════════════════════════════
    function showModal(title, message, onConfirm) {
        modalTitle.textContent = title;
        modalMessage.textContent = message;
        modalCallback = onConfirm;
        confirmModal.classList.remove('hidden');
    }

    function hideModal() {
        confirmModal.classList.add('hidden');
        modalCallback = null;
    }

    modalCancel.addEventListener('click', hideModal);
    modalConfirm.addEventListener('click', () => {
        if (modalCallback) modalCallback();
        hideModal();
    });

    confirmModal.addEventListener('click', (e) => {
        if (e.target === confirmModal) hideModal();
    });

    // ═══════════════════════════════════════
    // INIT
    // ═══════════════════════════════════════
    loadStudents();

    // ═══════════════════════════════════════
    // STUDENTS & MENTORS
    // ═══════════════════════════════════════
    function loadStudents() {
        fetch('/api/admin/students')
            .then(res => {
                if (!res.ok) throw new Error('Failed to load students.');
                return res.json();
            })
            .then(students => {
                currentStudents = students;
                // Fetch mentors before rendering
                return fetch('/api/admin/mentors')
                    .then(res => {
                        if (!res.ok) throw new Error('Failed to load mentors.');
                        return res.json();
                    })
                    .then(mentors => {
                        globalMentors = mentors;
                        populateMentorSelects(mentors);
                        renderStudents(students);
                        renderMentors(mentors);
                    });
            })
            .catch(err => {
                studentsTableBody.innerHTML = `
                    <tr><td colspan="6" style="text-align: center; color: var(--warning); padding: 2rem;">
                        <i class="fa-solid fa-triangle-exclamation" style="font-size: 1.5rem; margin-bottom: 0.5rem; display: block;"></i>
                        ${err.message}
                    </td></tr>
                `;
            });
    }

    function populateMentorSelects(mentors) {
        if (!stuMentorEmailSelect) return;
        stuMentorEmailSelect.innerHTML = '<option value="">No Mentor Assigned</option>';
        mentors.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.email;
            opt.textContent = `${m.full_name} (${m.email})`;
            stuMentorEmailSelect.appendChild(opt);
        });
    }

    function renderStudents(students) {
        studentsTableBody.innerHTML = '';

        if (students.length === 0) {
            studentsTableBody.innerHTML = `
                <tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 3rem;">
                    <i class="fa-solid fa-users-slash" style="font-size: 2rem; margin-bottom: 0.5rem; display: block; opacity: 0.4;"></i>
                    No student accounts registered yet.
                </td></tr>
            `;
            return;
        }

        students.forEach(s => {
            const tr = document.createElement('tr');
            const initials = s.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            const pathDisplay = `${globalConfig.teams_sync_dir}/${s.username}`;

            const folderBadge = s.folder_exists
                ? '<span class="badge badge-success"><i class="fa-solid fa-check"></i> Created</span>'
                : '<span class="badge badge-warning"><i class="fa-solid fa-plus"></i> Missing</span>';

            const excelBadge = s.excel_exists
                ? '<span class="badge badge-success"><i class="fa-solid fa-check"></i> Ready</span>'
                : '<span class="badge badge-danger"><i class="fa-solid fa-xmark"></i> Missing</span>';

            const folderBtn = (s.folder_exists && s.excel_exists) ? '' : `
                <button class="btn btn-outline btn-sm create-folder-btn" data-username="${s.username}">
                    <i class="fa-solid fa-folder-plus"></i> Create
                </button>
            `;

            // Build dynamic mentor selector
            let mentorOptions = `<option value="" ${!s.mentor_email ? 'selected' : ''}>No Mentor Assigned</option>`;
            globalMentors.forEach(m => {
                const isSelected = s.mentor_email === m.email ? 'selected' : '';
                mentorOptions += `<option value="${m.email}" ${isSelected}>${m.full_name}</option>`;
            });

            const mentorSelectHtml = `
                <select class="form-select assign-mentor-select" data-username="${s.username}" style="padding: 0.35rem 0.75rem; font-size: 0.82rem; width: auto; min-width: 160px; background-color: var(--bg-input); border-color: var(--border);">
                    ${mentorOptions}
                </select>
            `;

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
                <td class="path-cell">${pathDisplay}</td>
                <td>${folderBadge}</td>
                <td>${excelBadge}</td>
                <td>${mentorSelectHtml}</td>
                <td>
                    <div class="actions-cell">
                        ${folderBtn}
                        <button class="btn btn-ghost btn-sm edit-student-btn" data-username="${s.username}" data-name="${s.full_name}" data-mentor-email="${s.mentor_email || ''}">
                            <i class="fa-solid fa-user-pen"></i> Edit
                        </button>
                        <button class="btn btn-danger btn-sm delete-student-btn" data-username="${s.username}" data-name="${s.full_name}">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            `;

            studentsTableBody.appendChild(tr);
        });

        // Event listeners
        document.querySelectorAll('.create-folder-btn').forEach(btn => {
            btn.addEventListener('click', () => createStudentFolder(btn.getAttribute('data-username')));
        });

        document.querySelectorAll('.edit-student-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const username = btn.getAttribute('data-username');
                const name = btn.getAttribute('data-name');
                const mentorEmail = btn.getAttribute('data-mentor-email');
                
                editStuUsername.value = username;
                editStuFullname.value = name;
                
                editStuMentorEmail.innerHTML = '<option value="">No Mentor Assigned</option>';
                globalMentors.forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = m.email;
                    opt.textContent = `${m.full_name} (${m.email})`;
                    if (m.email === mentorEmail) {
                        opt.selected = true;
                    }
                    editStuMentorEmail.appendChild(opt);
                });
                
                editStuPassword.value = '';
                editStudentModal.classList.remove('hidden');
            });
        });

        document.querySelectorAll('.delete-student-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const username = btn.getAttribute('data-username');
                const name = btn.getAttribute('data-name');
                showModal(
                    'Delete Student',
                    `Are you sure you want to remove "${name}" (@${username})? This action cannot be undone.`,
                    () => deleteStudent(username)
                );
            });
        });

        // Assign mentor dropdown change
        document.querySelectorAll('.assign-mentor-select').forEach(select => {
            select.addEventListener('change', () => {
                const username = select.getAttribute('data-username');
                const mentor_email = select.value;
                assignMentor(username, mentor_email);
            });
        });
    }

    function assignMentor(username, mentor_email) {
        fetch('/api/admin/assign-mentor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, mentor_email })
        })
        .then(res => {
            if (!res.ok) return res.json().then(d => { throw new Error(d.error || 'Failed.'); });
            return res.json();
        })
        .then(() => {
            showToast(`Assigned mentor successfully!`, 'success');
            loadStudents(); // Reload to update counters and views
        })
        .catch(err => {
            showToast(err.message, 'error');
            loadStudents();
        });
    }

    // Add Student
    addStudentForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = stuUsernameInput.value.trim().toLowerCase();
        const full_name = stuFullNameInput.value.trim();
        const password = stuPasswordInput.value;
        const auto_create_folder = autoCreateCheckbox.checked;
        const mentor_email = stuMentorEmailSelect.value;

        addStudentBtn.disabled = true;
        addStudentBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Registering...';

        fetch('/api/admin/students', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, full_name, password, auto_create_folder, mentor_email })
        })
        .then(res => {
            if (!res.ok) return res.json().then(d => { throw new Error(d.error || 'Failed.'); });
            return res.json();
        })
        .then(data => {
            addStudentBtn.disabled = false;
            addStudentBtn.innerHTML = '<i class="fa-solid fa-user-check"></i> Register Intern';
            showToast(`Registered ${data.student.full_name} successfully!`, 'success');
            stuUsernameInput.value = '';
            stuFullNameInput.value = '';
            stuPasswordInput.value = '';
            stuMentorEmailSelect.value = '';
            loadStudents();
            switchView('students');
        })
        .catch(err => {
            addStudentBtn.disabled = false;
            addStudentBtn.innerHTML = '<i class="fa-solid fa-user-check"></i> Register Intern';
            showToast(err.message, 'error');
        });
    });

    // Create Folder
    function createStudentFolder(username) {
        fetch('/api/admin/create-folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        })
        .then(res => {
            if (!res.ok) return res.json().then(d => { throw new Error(d.error || 'Failed.'); });
            return res.json();
        })
        .then(() => {
            showToast(`Folder initialized for @${username}!`, 'success');
            loadStudents();
        })
        .catch(err => showToast(err.message, 'error'));
    }

    // Delete Student
    function deleteStudent(username) {
        fetch(`/api/admin/students/${username}`, { method: 'DELETE' })
        .then(res => {
            if (!res.ok) return res.json().then(d => { throw new Error(d.error || 'Failed.'); });
            return res.json();
        })
        .then(() => {
            showToast(`Deleted @${username} successfully.`, 'success');
            loadStudents();
        })
        .catch(err => showToast(err.message, 'error'));
    }

    // ═══════════════════════════════════════
    // MENTORS MANAGEMENT
    // ═══════════════════════════════════════
    function renderMentors(mentors) {
        if (!mentorsTableBody) return;
        mentorsTableBody.innerHTML = '';

        if (mentors.length === 0) {
            mentorsTableBody.innerHTML = `
                <tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 3rem;">
                    <i class="fa-solid fa-chalkboard-user" style="font-size: 2rem; margin-bottom: 0.5rem; display: block; opacity: 0.4;"></i>
                    No mentors registered yet.
                </td></tr>
            `;
            return;
        }

        mentors.forEach(m => {
            const assignedCount = currentStudents.filter(s => s.mentor_email === m.email).length;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${m.full_name}</strong></td>
                <td>${m.email}</td>
                <td><span class="badge badge-info">${assignedCount} Students</span></td>
                <td>
                    <div class="actions-cell">
                        <button class="btn btn-ghost btn-sm edit-mentor-btn" data-username="${m.username}" data-name="${m.full_name}" data-email="${m.email}">
                            <i class="fa-solid fa-user-pen"></i> Edit
                        </button>
                        <button class="btn btn-danger btn-sm delete-mentor-btn" data-id="${m.id}" data-name="${m.full_name}">
                            <i class="fa-solid fa-trash-can"></i> Delete
                        </button>
                    </div>
                </td>
            `;
            mentorsTableBody.appendChild(tr);
        });

        // Event listeners
        document.querySelectorAll('.edit-mentor-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const username = btn.getAttribute('data-username');
                const name = btn.getAttribute('data-name');
                const email = btn.getAttribute('data-email');
                
                editMenUsername.value = username;
                editMenName.value = name;
                editMenEmail.value = email;
                editMenPassword.value = '';
                
                editMentorModal.classList.remove('hidden');
            });
        });

        document.querySelectorAll('.delete-mentor-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const name = btn.getAttribute('data-name');
                showModal(
                    'Delete Mentor',
                    `Are you sure you want to delete mentor "${name}"? All assigned students will be unassigned.`,
                    () => deleteMentor(id)
                );
            });
        });
    }

    // Add Mentor form submission
    if (addMentorForm) {
        addMentorForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const username = menUsernameInput.value.trim().toLowerCase();
            const name = menNameInput.value.trim();
            const email = menEmailInput.value.trim().toLowerCase();
            const password = menPasswordInput.value;

            addMentorBtn.disabled = true;
            addMentorBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

            fetch('/api/admin/mentors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, name, email, password })
            })
            .then(res => {
                if (!res.ok) return res.json().then(d => { throw new Error(d.error || 'Failed.'); });
                return res.json();
            })
            .then(() => {
                addMentorBtn.disabled = false;
                addMentorBtn.innerHTML = '<i class="fa-solid fa-user-check"></i> Save Mentor';
                showToast(`Added mentor "${name}" successfully!`, 'success');
                menUsernameInput.value = '';
                menNameInput.value = '';
                menEmailInput.value = '';
                menPasswordInput.value = '';
                loadStudents(); // Reloads both students & mentors
            })
            .catch(err => {
                addMentorBtn.disabled = false;
                addMentorBtn.innerHTML = '<i class="fa-solid fa-user-check"></i> Save Mentor';
                showToast(err.message, 'error');
            });
        });
    }

    function deleteMentor(mentor_id) {
        fetch(`/api/admin/mentors/${mentor_id}`, { method: 'DELETE' })
        .then(res => {
            if (!res.ok) return res.json().then(d => { throw new Error(d.error || 'Failed.'); });
            return res.json();
        })
        .then(() => {
            showToast('Deleted mentor successfully.', 'success');
            loadStudents();
        })
        .catch(err => showToast(err.message, 'error'));
    }

    // Edit Modals Submit / Cancel
    if (editStuCancel) {
        editStuCancel.addEventListener('click', () => {
            editStudentModal.classList.add('hidden');
        });
    }
    if (editStudentModal) {
        editStudentModal.addEventListener('click', (e) => {
            if (e.target === editStudentModal) {
                editStudentModal.classList.add('hidden');
            }
        });
    }

    if (editStudentForm) {
        editStudentForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const username = editStuUsername.value;
            const full_name = editStuFullname.value.trim();
            const mentor_email = editStuMentorEmail.value;
            const password = editStuPassword.value;

            const saveBtn = document.getElementById('edit-stu-save');
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

            fetch('/api/admin/students/edit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, full_name, mentor_email, password })
            })
            .then(res => {
                if (!res.ok) return res.json().then(d => { throw new Error(d.error || 'Failed to edit student.'); });
                return res.json();
            })
            .then(() => {
                showToast(`Updated student @${username} successfully!`, 'success');
                editStudentModal.classList.add('hidden');
                loadStudents();
            })
            .catch(err => {
                showToast(err.message, 'error');
            })
            .finally(() => {
                saveBtn.disabled = false;
                saveBtn.innerHTML = 'Save Changes';
            });
        });
    }

    if (editMenCancel) {
        editMenCancel.addEventListener('click', () => {
            editMentorModal.classList.add('hidden');
        });
    }
    if (editMentorModal) {
        editMentorModal.addEventListener('click', (e) => {
            if (e.target === editMentorModal) {
                editMentorModal.classList.add('hidden');
            }
        });
    }

    if (editMentorForm) {
        editMentorForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const username = editMenUsername.value;
            const full_name = editMenName.value.trim();
            const email = editMenEmail.value.trim().toLowerCase();
            const password = editMenPassword.value;

            const saveBtn = document.getElementById('edit-men-save');
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

            fetch('/api/admin/mentors/edit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, full_name, email, password })
            })
            .then(res => {
                if (!res.ok) return res.json().then(d => { throw new Error(d.error || 'Failed to edit mentor.'); });
                return res.json();
            })
            .then(() => {
                showToast(`Updated mentor "${full_name}" successfully!`, 'success');
                editMentorModal.classList.add('hidden');
                loadStudents();
            })
            .catch(err => {
                showToast(err.message, 'error');
            })
            .finally(() => {
                saveBtn.disabled = false;
                saveBtn.innerHTML = 'Save Changes';
            });
        });
    }

    // ═══════════════════════════════════════
    // TOAST
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
