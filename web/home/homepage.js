document.addEventListener('DOMContentLoaded', () => {
    const daysGrid = document.getElementById('daysGrid');
    const hoursScale = document.getElementById('hoursScale');
    const taskModal = document.getElementById('taskModal');
    const contextMenu = document.getElementById('contextMenu');
    let currentLane = null, selectedTaskCard = null;

    // ─── 1. HOURS RULER (0h–24h) ───
    for (let i = 0; i <= 24; i++) {
        const tick = document.createElement('div');
        tick.className = 'hour-tick';
        tick.innerText = String(i).padStart(2, '0') + ':00';
        hoursScale.appendChild(tick);
    }

    // ─── 2. PARALLAX STAR FIELD ───
    const starField = document.getElementById('starField');
    const stars = [];
    const NUM_STARS = 180;

    for (let i = 0; i < NUM_STARS; i++) {
        const star = document.createElement('div');
        star.className = 'star';
        const size = Math.random() * 2.2 + 0.4;
        const depth = Math.random();
        star.style.width = size + 'px';
        star.style.height = size + 'px';
        star.style.top = Math.random() * 100 + '%';
        star.style.left = Math.random() * 100 + '%';
        star.style.opacity = 0.2 + depth * 0.6;
        // Twinkle via opacity animation only — NOT transform, so parallax works
        star.style.animation = `twinkle ${3 + Math.random() * 4}s ${Math.random() * 5}s ease-in-out infinite`;

        star._factor = 0.015 + depth * 0.04; // noticeable but gentle

        starField.appendChild(star);
        stars.push(star);
    }

    // Mouse parallax
    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let curX = mouseX, curY = mouseY;

    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    });

    function animateStars() {
        curX += (mouseX - curX) * 0.04;
        curY += (mouseY - curY) * 0.04;

        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        const dx = curX - cx;
        const dy = curY - cy;

        for (let s of stars) {
            const ox = dx * s._factor;
            const oy = dy * s._factor;
            s.style.transform = `translate(${ox}px, ${oy}px)`;
        }

        requestAnimationFrame(animateStars);
    }
    animateStars();

    // ─── 3. CONTEXT MENU ───
    document.addEventListener('contextmenu', (e) => {
        const card = e.target.closest('.task-card');
        if (card) {
            e.preventDefault();
            selectedTaskCard = card;
            contextMenu.style.display = 'block';
            // Keep menu within viewport
            const menuW = 168, menuH = 80;
            let x = e.clientX, y = e.clientY;
            if (x + menuW > window.innerWidth) x -= menuW;
            if (y + menuH > window.innerHeight) y -= menuH;
            contextMenu.style.left = x + 'px';
            contextMenu.style.top = y + 'px';
        } else {
            contextMenu.style.display = 'none';
        }
    });
    document.addEventListener('click', () => contextMenu.style.display = 'none');

    document.getElementById('menuDelete').onclick = () => {
        if (!selectedTaskCard) return;
        const lane = selectedTaskCard.parentElement;
        selectedTaskCard.remove();
        updateAddButtonPosition(lane);
        selectedTaskCard = null;
    };

    document.getElementById('menuEdit').onclick = () => openModal(true);

    // ─── 4. MODAL ───
    function openModal(isEdit = false) {
        if (isEdit && selectedTaskCard) {
            document.getElementById('modalTitle').innerText = "Edit Mission";
            document.getElementById('taskInput').value = selectedTaskCard.querySelector('span')?.innerText || '';
            document.getElementById('taskNote').value = selectedTaskCard.dataset.note || '';
            document.getElementById('taskImageUrl').value = selectedTaskCard.dataset.img || '';
        } else {
            document.getElementById('modalTitle').innerText = "New Mission";
            document.getElementById('taskInput').value = '';
            document.getElementById('taskNote').value = '';
            document.getElementById('taskImageUrl').value = '';
        }
        taskModal.style.display = 'flex';
        setTimeout(() => document.getElementById('taskInput').focus(), 50);
    }

    document.getElementById('confirmBtn').onclick = () => {
        const name = document.getElementById('taskInput').value.trim();
        const note = document.getElementById('taskNote').value.trim();
        const img = document.getElementById('taskImageUrl').value.trim();
        if (!name) return;

        if (selectedTaskCard && document.getElementById('modalTitle').innerText === "Edit Mission") {
            updateTaskContent(selectedTaskCard, name, img, note);
        } else if (currentLane) {
            const btn = currentLane.querySelector('.add-task-btn');
            createTask(name, currentLane, btn ? btn.offsetLeft : 20, note, img);
        }
        taskModal.style.display = 'none';
    };

    // Close on Abort button
    document.getElementById('abortBtn').onclick = () => {
        taskModal.style.display = 'none';
        selectedTaskCard = null;
    };

    // Close on modal-close X
    document.getElementById('cancelBtn').onclick = () => {
        taskModal.style.display = 'none';
        selectedTaskCard = null;
    };

    // Close modal on overlay click
    taskModal.addEventListener('click', (e) => {
        if (e.target === taskModal) {
            taskModal.style.display = 'none';
            selectedTaskCard = null;
        }
    });

    // Confirm on Enter (not in textarea)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            taskModal.style.display = 'none';
            contextMenu.style.display = 'none';
        }
        if (e.key === 'Enter' && taskModal.style.display === 'flex') {
            if (document.activeElement.tagName !== 'TEXTAREA') {
                document.getElementById('confirmBtn').click();
            }
        }
    });

    // ─── 5. TASK LOGIC ───
    function createTask(name, lane, left, note = '', img = '') {
        const card = document.createElement('div');
        card.className = 'task-card';
        card.style.left = left + 'px';
        card.style.width = '160px';
        updateTaskContent(card, name, img, note);
        lane.appendChild(card);
        makeDraggable(card);
        makeResizable(card);
        updateAddButtonPosition(lane);
    }

    function updateTaskContent(card, name, img, note) {
        card.innerHTML = '';
        card.dataset.note = note;
        card.dataset.img = img;
        if (img) {
            const elImg = document.createElement('img');
            elImg.src = img;
            elImg.className = 'task-img';
            elImg.onerror = () => elImg.remove(); // hide broken images
            card.appendChild(elImg);
        }
        const span = document.createElement('span');
        span.innerText = name;
        card.appendChild(span);
        const resizer = document.createElement('div');
        resizer.className = 'resizer';
        card.appendChild(resizer);
        makeResizable(card);
    }

    function updateAddButtonPosition(lane) {
        const tasks = Array.from(lane.querySelectorAll('.task-card'));
        const btn = lane.querySelector('.add-task-btn');
        if (!btn) return;
        if (tasks.length === 0) {
            btn.style.left = '20px';
        } else {
            const maxRight = Math.max(...tasks.map(t => t.offsetLeft + t.offsetWidth));
            btn.style.left = (maxRight + 16) + 'px';
        }
    }

    function isOverlapping(card) {
        const r1 = { left: card.offsetLeft, right: card.offsetLeft + card.offsetWidth };
        const others = card.parentElement.querySelectorAll('.task-card');
        for (let o of others) {
            if (o === card) continue;
            const r2 = { left: o.offsetLeft, right: o.offsetLeft + o.offsetWidth };
            if (r1.right > r2.left + 2 && r1.left < r2.right - 2) return true;
        }
        return false;
    }

    const HOUR_PX = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--hour-width')) || 72;
    const MAX_LANE_PX = 24 * HOUR_PX;

    function makeDraggable(card) {
        let isDragging = false, startX, initialLeft;
        card.onmousedown = (e) => {
            if (e.target.classList.contains('resizer')) return;
            e.preventDefault();
            isDragging = true;
            startX = e.clientX;
            initialLeft = card.offsetLeft;
            card.style.zIndex = 100;
            card.style.boxShadow = '0 8px 32px rgba(0,0,0,0.5)';
        };
        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const newLeft = Math.max(0, Math.min(
                MAX_LANE_PX - card.offsetWidth,
                initialLeft + (e.clientX - startX)
            ));
            card.style.left = newLeft + 'px';
            updateAddButtonPosition(card.parentElement);
        });
        window.addEventListener('mouseup', () => {
            if (!isDragging) return;
            isDragging = false;
            card.style.zIndex = 2;
            card.style.boxShadow = '';
            if (isOverlapping(card)) card.style.left = initialLeft + 'px';
            updateAddButtonPosition(card.parentElement);
        });
    }

    function makeResizable(card) {
        const resizer = card.querySelector('.resizer');
        if (!resizer) return;
        resizer.onmousedown = (e) => {
            e.stopPropagation();
            e.preventDefault();
            let startW = card.offsetWidth, startX = e.clientX;
            const onMove = (mE) => {
                const oldW = card.style.width;
                const newW = Math.max(60, Math.min(
                    MAX_LANE_PX - card.offsetLeft,
                    startW + (mE.clientX - startX)
                ));
                card.style.width = newW + 'px';
                if (isOverlapping(card)) card.style.width = oldW;
                updateAddButtonPosition(card.parentElement);
            };
            const onUp = () => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        };
    }

    // ─── 6. PROJECT DATA STORE ───
    // Each project stores its task data per day-row
    // Structure: projects[name] = [ { dayLabel, dayNum, tasks: [{name, note, img, left, width}] } ]
    const DAYS = [
        { label: 'MON', num: '01' },
        { label: 'TUE', num: '02' },
        { label: 'WED', num: '03' },
        { label: 'THU', num: '04' },
        { label: 'FRI', num: '05' },
    ];

    // Default projects
    const projectStore = {
        'Nebula Task': { days: DAYS, tasks: {} },
        'Galaxy Orbit': { days: DAYS, tasks: {} },
    };

    let activeProject = 'Nebula Task';

    // ─── Save current grid state into store ───
    function saveCurrentProject() {
        if (!projectStore[activeProject]) return;
        const saved = {};
        daysGrid.querySelectorAll('.day-row').forEach((row, i) => {
            const dayKey = DAYS[i]?.label || i;
            saved[dayKey] = [];
            row.querySelectorAll('.task-card').forEach(card => {
                saved[dayKey].push({
                    name: card.querySelector('span')?.innerText || '',
                    note: card.dataset.note || '',
                    img: card.dataset.img || '',
                    left: card.offsetLeft,
                    width: card.offsetWidth,
                });
            });
        });
        projectStore[activeProject].tasks = saved;
    }

    // ─── Build grid for a given project ───
    function loadProject(name) {
        if (!projectStore[name]) return;

        // Save old project first
        saveCurrentProject();
        activeProject = name;

        // Update header
        document.getElementById('projectName').innerText = `"${name}"`;

        // Highlight active item in sidebar
        document.querySelectorAll('#projectList li.project-item').forEach(li => {
            li.classList.toggle('active-project', li.dataset.project === name);
        });

        // Clear and rebuild grid
        daysGrid.innerHTML = '';
        const project = projectStore[name];
        const savedTasks = project.tasks || {};

        DAYS.forEach(day => {
            const row = document.createElement('div');
            row.className = 'day-row';
            row.innerHTML = `
                <div class="day-label">
                    <span class="day-name">${day.label}</span>
                    <span class="day-num">${day.num}</span>
                </div>
                <div class="task-lane">
                    <div class="add-task-btn">+ ADD</div>
                </div>
            `;
            daysGrid.appendChild(row);
            const lane = row.querySelector('.task-lane');

            // Restore saved tasks for this day
            const dayTasks = savedTasks[day.label] || [];
            dayTasks.forEach(t => {
                const card = document.createElement('div');
                card.className = 'task-card';
                card.style.left = t.left + 'px';
                card.style.width = t.width + 'px';
                updateTaskContent(card, t.name, t.img, t.note);
                lane.appendChild(card);
                makeDraggable(card);
                makeResizable(card);
            });

            updateAddButtonPosition(lane);
            row.querySelector('.add-task-btn').onclick = () => {
                currentLane = lane;
                selectedTaskCard = null;
                openModal(false);
            };
        });
    }

    // ─── Build sidebar project list ───
    function buildSidebarProjects() {
        const list = document.getElementById('projectList');
        list.querySelectorAll('.project-item').forEach(el => el.remove());
        const addBtn = list.querySelector('.add-project');

        // Sort: starred first, then alphabetical
        const names = Object.keys(projectStore).sort((a, b) => {
            const sa = projectStore[a].starred ? 1 : 0;
            const sb = projectStore[b].starred ? 1 : 0;
            return sb - sa;
        });

        names.forEach(name => {
            const proj = projectStore[name];
            const li = document.createElement('li');
            li.className = 'project-item' + (proj.starred ? ' starred' : '');
            li.dataset.project = name;
            li.innerHTML = `<span class="dot"></span><span class="proj-name">${name}</span>${proj.starred ? '<span class="star-badge">★</span>' : ''}`;
            if (name === activeProject) li.classList.add('active-project');

            // Left click → switch project
            li.onclick = (e) => {
                if (e.target.closest('#projectContextMenu')) return;
                loadProject(name);
            };

            // Right click → project context menu
            li.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                selectedProjectName = name;
                showProjectContextMenu(e.clientX, e.clientY, name);
            });

            list.insertBefore(li, addBtn);
        });
    }

    let selectedProjectName = null;
    const projectContextMenu = document.getElementById('projectContextMenu');
    const renamePopup = document.getElementById('renamePopup');

    function showProjectContextMenu(x, y, name) {
        const proj = projectStore[name];
        // Update star label
        document.getElementById('pmenuStarIcon').innerText = proj.starred ? '★' : '☆';
        document.getElementById('pmenuStarLabel').innerText = proj.starred ? 'Remove Star' : 'Mark as Starred';

        projectContextMenu.style.display = 'block';
        // Keep in viewport
        const w = 190, h = 110;
        projectContextMenu.style.left = Math.min(x, window.innerWidth - w) + 'px';
        projectContextMenu.style.top = Math.min(y, window.innerHeight - h) + 'px';
    }

    // Close project context menu on outside click
    document.addEventListener('click', () => {
        projectContextMenu.style.display = 'none';
    });

    // ★ Star / Unstar
    document.getElementById('pmenuStar').onclick = (e) => {
        e.stopPropagation();
        if (!selectedProjectName || !projectStore[selectedProjectName]) return;
        projectStore[selectedProjectName].starred = !projectStore[selectedProjectName].starred;
        projectContextMenu.style.display = 'none';
        buildSidebarProjects();
    };

    // ✎ Rename
    document.getElementById('pmenuRename').onclick = (e) => {
        e.stopPropagation();
        if (!selectedProjectName) return;
        projectContextMenu.style.display = 'none';

        // Position popup near the menu
        const menuRect = projectContextMenu.getBoundingClientRect();
        renamePopup.style.left = Math.min(parseInt(projectContextMenu.style.left) + 10, window.innerWidth - 280) + 'px';
        renamePopup.style.top = (parseInt(projectContextMenu.style.top) || 100) + 'px';
        renamePopup.style.display = 'block';

        const input = document.getElementById('renameInput');
        input.value = selectedProjectName;
        setTimeout(() => { input.focus(); input.select(); }, 30);
    };

    document.getElementById('renameConfirmBtn').onclick = () => {
        const newName = document.getElementById('renameInput').value.trim();
        if (!newName || !selectedProjectName) { renamePopup.style.display = 'none'; return; }
        if (newName === selectedProjectName) { renamePopup.style.display = 'none'; return; }
        if (projectStore[newName]) { alert('A project with this name already exists.'); return; }

        // Move data under new key
        projectStore[newName] = { ...projectStore[selectedProjectName] };
        delete projectStore[selectedProjectName];

        if (activeProject === selectedProjectName) activeProject = newName;
        selectedProjectName = newName;

        renamePopup.style.display = 'none';
        buildSidebarProjects();
        document.getElementById('projectName').innerText = `"${activeProject}"`;
    };

    document.getElementById('renameCancelBtn').onclick = () => {
        renamePopup.style.display = 'none';
    };

    document.getElementById('renameInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('renameConfirmBtn').click();
        if (e.key === 'Escape') renamePopup.style.display = 'none';
    });

    // ⊗ Delete
    document.getElementById('pmenuDelete').onclick = (e) => {
        e.stopPropagation();
        if (!selectedProjectName) return;
        projectContextMenu.style.display = 'none';

        const keys = Object.keys(projectStore);
        if (keys.length <= 1) {
            // Show brief warning instead of deleting last project
            const item = document.querySelector(`[data-project="${selectedProjectName}"]`);
            if (item) {
                item.style.transition = 'color 0.2s';
                item.style.color = 'rgba(255,80,100,0.8)';
                setTimeout(() => { item.style.color = ''; }, 800);
            }
            return;
        }

        // If deleting active project, switch to another first
        if (selectedProjectName === activeProject) {
            const next = keys.find(k => k !== selectedProjectName);
            delete projectStore[selectedProjectName];
            buildSidebarProjects();
            loadProject(next);
        } else {
            delete projectStore[selectedProjectName];
            buildSidebarProjects();
        }
        selectedProjectName = null;
    };

    // ─── Init ───
    buildSidebarProjects();
    loadProject(activeProject);

    // Expose addNewProject globally
    window._addNewProject = () => {
        const pName = prompt("New Project Name:");
        if (!pName || !pName.trim()) return;
        const trimmed = pName.trim();
        if (projectStore[trimmed]) return; // already exists
        projectStore[trimmed] = { days: DAYS, tasks: {} };
        buildSidebarProjects();
        loadProject(trimmed);
    };
});

// ─── ADD PROJECT (called from HTML onclick) ───
function addNewProject() {
    if (window._addNewProject) window._addNewProject();
}