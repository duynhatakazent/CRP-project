/**
 * Application State
 */
let draggingTask = null;
let resizingTask = null;
let currentTaskData = null;
let currentContextMenuProjectId = null;

const state = {
    projects: [],
    hourWidth: 72
};

/**
 * State Management
 */
function saveState() {
    localStorage.setItem('helloProjectsState', JSON.stringify(state.projects));
}

function loadState() {
    const savedState = localStorage.getItem('helloProjectsState');
    if (savedState) {
        state.projects = JSON.parse(savedState);
        // Migrate old projects: remove timeLimit field
        state.projects.forEach(p => { delete p.timeLimit; });
    } else {
        state.projects = [
            {
                id: `proj-${Date.now()}`,
                name: "Project Nebula",
                active: true,
                background: "",
                members: [
                    { name: "Commander", color: "#6e56cf" },
                    { name: "Pilot", color: "#29a3a3" }
                ],
                tasks: []
            }
        ];
    }
}

/**
 * Format a Date as YYYY-MM-DD (local time, no UTC shift)
 */
function toISODate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/**
 * Parse YYYY-MM-DD string into local Date (midnight)
 */
function fromISODate(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
}

/**
 * Initialization & UI Setup
 */
document.addEventListener('DOMContentLoaded', () => {
    loadState();
    initStarField();
    initPageTransitions();
    setupEventListeners();
    renderProjects();
    updateUIAfterProjectSwitch();
});

function initStarField() {
    const starField = document.getElementById('starField');
    if (starField) {
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
            star.style.animation = `twinkle ${3 + Math.random() * 4}s ${Math.random() * 5}s ease-in-out infinite`;
            star._factor = 0.015 + depth * 0.04;
            starField.appendChild(star);
            stars.push(star);
        }

        let mouseX = window.innerWidth / 2;
        let mouseY = window.innerHeight / 2;
        let curX = mouseX, curY = mouseY;
        let scrollY = window.scrollY;

        document.addEventListener('mousemove', (e) => { mouseX = e.clientX; mouseY = e.clientY; }, { passive: true });
        document.addEventListener('scroll', () => { scrollY = window.scrollY; }, { passive: true });

        function animateStars() {
            curX += (mouseX - curX) * 0.04;
            curY += (mouseY - curY) * 0.04;
            const cx = window.innerWidth / 2;
            const cy = window.innerHeight / 2;
            const dx = curX - cx;
            const dy = curY - cy;
            for (let s of stars) {
                const mouseOffsetX = dx * s._factor;
                const mouseOffsetY = dy * s._factor;
                const scrollOffsetY = -scrollY * s._factor * 0.5;
                s.style.transform = `translate(${mouseOffsetX}px, ${mouseOffsetY + scrollOffsetY}px)`;
            }
            requestAnimationFrame(animateStars);
        }
        animateStars();
    }
}

/**
 * Build an infinite timeline: always shows today + all days that have tasks.
 * Dates are sorted chronologically. The header label shows the full range.
 */
function initTimeline(taskDates = []) {
    const daysGrid = document.getElementById('daysGrid');
    const hoursScale = document.getElementById('hoursScale');
    const timeRangeLabel = document.querySelector('.time-range-label');

    daysGrid.innerHTML = '';
    hoursScale.innerHTML = '';

    // Hour ruler
    for (let i = 0; i < 24; i++) {
        const h = document.createElement('div');
        h.className = 'hour-tick';
        h.innerText = `${i.toString().padStart(2, '0')}:00`;
        hoursScale.appendChild(h);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = toISODate(today);

    // Collect unique dates: always include today, plus all task dates
    const dateSet = new Set([todayISO, ...taskDates]);
    const sortedDates = [...dateSet].sort();

    // Fill gaps: include every day between first and last date
    if (sortedDates.length >= 2) {
        const first = fromISODate(sortedDates[0]);
        const last  = fromISODate(sortedDates[sortedDates.length - 1]);
        const cur = new Date(first);
        while (cur <= last) {
            dateSet.add(toISODate(cur));
            cur.setDate(cur.getDate() + 1);
        }
    }

    const allDates = [...dateSet].sort();
    const dayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
    const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short' });

    allDates.forEach(dateISO => {
        const d = fromISODate(dateISO);
        const dayName = dayFormatter.format(d).toUpperCase();
        const dayNum = d.getDate().toString().padStart(2, '0');
        const isToday = dateISO === todayISO;

        const row = document.createElement('div');
        row.className = 'day-row' + (isToday ? ' today-row' : '');
        row.innerHTML = `
            <div class="day-label${isToday ? ' today-label' : ''}">
                <div class="day-name">${dayName}</div>
                <div class="day-num">${dayNum}</div>
                ${isToday ? '<div class="today-dot"></div>' : ''}
            </div>
            <div class="task-lane" data-date="${dateISO}"></div>
        `;
        daysGrid.appendChild(row);
    });

    // Header label: show range
    if (allDates.length > 0) {
        const first = fromISODate(allDates[0]);
        const last  = fromISODate(allDates[allDates.length - 1]);
        const fmt = (d) => `${dayFormatter.format(d).toUpperCase()} ${d.getDate().toString().padStart(2,'0')} ${monthFormatter.format(d).toUpperCase()}`;
        timeRangeLabel.innerText = allDates.length === 1
            ? fmt(first)
            : `${fmt(first)} — ${fmt(last)}`;
    }
}

function initPageTransitions() {
    document.body.classList.remove('fade-out');
    document.querySelectorAll('.nav-item, .breadcrumb').forEach(el => {
        el.addEventListener('click', (e) => {
            if (!el.classList.contains('dropdown-toggle')) {
                e.preventDefault();
                document.body.classList.add('fade-out');
                setTimeout(() => { document.body.classList.remove('fade-out'); }, 300);
            }
        });
    });
}

function setupEventListeners() {
    document.getElementById('addTaskBtn').addEventListener('click', () => {
        const firstDay = document.querySelector('.task-lane')?.dataset.date;
        openTaskModal(null, true, firstDay);
    });

    document.getElementById('cancelBtn').addEventListener('click', closeModals);
    document.getElementById('abortBtn').addEventListener('click', closeModals);
    document.getElementById('confirmBtn').addEventListener('click', saveTask);
    document.getElementById('deleteBtn').addEventListener('click', deleteTask);

    document.getElementById('cancelSettingsBtn').addEventListener('click', closeModals);
    document.getElementById('confirmSettingsBtn').addEventListener('click', saveProjectSettings);
    document.getElementById('addMemberBtn').addEventListener('click', () => renderMemberRow());

    document.getElementById('taskImageFile').addEventListener('change', handleFileSelect);
    document.getElementById('projectBackgroundFile').addEventListener('change', handleFileSelect);

    document.addEventListener('click', hideContextMenus);
    document.getElementById('pmenuSettings').addEventListener('click', openProjectSettings);

    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);

    // Select background color feedback
    document.getElementById('taskStatusSelect').addEventListener('change', updateSelectColor);
}

/**
 * Makes a <select> element's background reflect its current value
 * Works by setting a data-value attribute and matching it in CSS,
 * or via inline style for arbitrary values like member colors.
 */
function updateSelectColor(e) {
    const sel = e.target;
    sel.dataset.value = sel.value;

    // Status-specific colors
    const statusColors = {
        'Not Started': '#000000',
        'In Progress': '#0d1a2e',
        'Done':        '#0a1a0d',
        'Dropped':     '#1a0a0a'
    };

    if (statusColors[sel.value] !== undefined) {
        sel.style.backgroundColor = statusColors[sel.value];
    }
}

function applySelectColors() {
    document.querySelectorAll('.modal-content select').forEach(sel => {
        sel.dataset.value = sel.value;
        const statusColors = {
            'Not Started': '#000000',
            'In Progress': '#0d1a2e',
            'Done':        '#0a1a0d',
            'Dropped':     '#1a0a0a'
        };
        if (statusColors[sel.value] !== undefined) {
            sel.style.backgroundColor = statusColors[sel.value];
        }
    });
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.style.display = 'flex';
    const content = modal.querySelector('.modal-content');
    content.classList.remove('animate-in');
    void content.offsetWidth;
    content.classList.add('animate-in');
    // Apply color feedback after opening
    applySelectColors();
}

function closeModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
    currentTaskData = null;
    currentContextMenuProjectId = null;
}

function showCustomConfirm({ title, message, onOk, onCancel }) {
    const modal = document.getElementById('customConfirmModal');
    document.getElementById('customConfirmTitle').innerText = title;
    document.getElementById('customConfirmMessage').innerText = message;

    const okBtn = document.getElementById('customConfirmOk');
    const cancelBtn = document.getElementById('customConfirmCancel');
    const closeBtn = document.getElementById('customConfirmClose');

    const cleanup = () => {
        modal.style.display = 'none';
        okBtn.onclick = null; cancelBtn.onclick = null; closeBtn.onclick = null;
    };

    okBtn.onclick = () => { if (onOk) onOk(); cleanup(); };
    cancelBtn.onclick = () => { if (onCancel) onCancel(); cleanup(); };
    closeBtn.onclick = () => { if (onCancel) onCancel(); cleanup(); };

    modal.style.display = 'flex';
}

function hexToRgba(hex, alpha = 1) {
    if (!hex || !/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
        if (hex && hex.startsWith('rgba')) return hex;
        return `rgba(255, 255, 255, 0.1)`;
    }
    let c = hex.substring(1).split('');
    if (c.length === 3) { c = [c[0], c[0], c[1], c[1], c[2], c[2]]; }
    c = '0x' + c.join('');
    return `rgba(${[(c>>16)&255, (c>>8)&255, c&255].join(',')},${alpha})`;
}

function openProjectSettings() {
    const isNew = !currentContextMenuProjectId;
    const project = isNew ? null : state.projects.find(p => p.id === currentContextMenuProjectId);

    document.getElementById('settingsModalTitle').innerText = isNew ? 'New Project Settings' : 'Project Settings';
    document.getElementById('projectNameInput').value = isNew ? 'New Cosmic Project' : project.name;
    document.getElementById('projectBackgroundInput').value = isNew ? '' : project.background || '';

    const membersList = document.getElementById('projectMembersList');
    membersList.innerHTML = '';
    const membersToRender = isNew ? [{ name: 'Captain', color: '#6e56cf' }] : project.members;
    membersToRender.forEach(member => renderMemberRow(member));

    openModal('projectSettingsModal');
}

function renderMemberRow(member = { name: '', color: '#ffffff' }) {
    const membersList = document.getElementById('projectMembersList');
    const memberRow = document.createElement('div');
    memberRow.className = 'member-row';
    memberRow.innerHTML = `
        <input type="color" class="member-color-input" value="${member.color}">
        <input type="text" class="member-name-input" placeholder="Member name..." value="${member.name}">
        <button class="btn-remove-member">✕</button>
    `;
    membersList.appendChild(memberRow);
    memberRow.querySelector('.btn-remove-member').addEventListener('click', () => memberRow.remove());
}

function saveProjectSettings() {
    const isNew = !state.projects.some(p => p.id === currentContextMenuProjectId);

    const modalValues = {
        name: document.getElementById('projectNameInput').value.trim() || 'Untitled Project',
        background: document.getElementById('projectBackgroundInput').value,
        members: []
    };

    document.querySelectorAll('#projectMembersList .member-row').forEach(row => {
        const name = row.querySelector('.member-name-input').value.trim();
        const color = row.querySelector('.member-color-input').value;
        if (name) modalValues.members.push({ name, color });
    });

    if (isNew) {
        state.projects.forEach(p => p.active = false);
        const newProject = {
            id: currentContextMenuProjectId || `proj-${Date.now()}`,
            name: modalValues.name,
            active: true,
            background: modalValues.background,
            members: modalValues.members,
            tasks: []
        };
        state.projects.push(newProject);
    } else {
        let project = state.projects.find(p => p.id === currentContextMenuProjectId);
        if (project) {
            project.name = modalValues.name;
            project.background = modalValues.background;
            project.members = modalValues.members;
        }
    }

    saveState();
    renderProjects();
    updateUIAfterProjectSwitch();
    closeModals();
}

function populateMemberSelect(activeProject) {
    const select = document.getElementById('taskMembersSelect');
    select.innerHTML = '';
    if (!activeProject || !activeProject.members) return;
    activeProject.members.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.name;
        opt.innerText = m.name;
        select.appendChild(opt);
    });
}

function openTaskModal(taskData = null, isNew = false, day = null) {
    const activeProject = state.projects.find(p => p.active);
    populateMemberSelect(activeProject);

    const dateInput = document.getElementById('taskDateInput');
    // No min/max — free infinite date selection
    dateInput.removeAttribute('min');
    dateInput.removeAttribute('max');

    document.getElementById('deleteBtn').style.display = taskData ? 'block' : 'none';
    document.getElementById('modalTitle').innerText = taskData ? "Edit Mission" : "New Mission";
    currentTaskData = taskData;

    if (taskData) {
        document.getElementById('taskInput').value = taskData.name || '';
        dateInput.value = taskData.date;
        document.getElementById('taskStatusSelect').value = taskData.status || 'Not Started';
        document.getElementById('taskNote').value = taskData.note || '';
        document.getElementById('taskImageUrl').value = taskData.image || '';
        document.getElementById('taskMembersSelect').value = taskData.memberName || '';
    } else {
        document.getElementById('taskInput').value = '';
        document.getElementById('taskNote').value = '';
        document.getElementById('taskImageUrl').value = '';
        document.getElementById('taskStatusSelect').value = 'Not Started';
        // Default to clicked day, or today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        dateInput.value = day || toISODate(today);
    }

    openModal('taskModal');
}

function saveTask() {
    const activeProject = state.projects.find(p => p.active);
    if (!activeProject) return;

    const taskData = {
        id: currentTaskData ? currentTaskData.id : `task-${Date.now()}`,
        name: document.getElementById('taskInput').value || 'Untitled Mission',
        date: document.getElementById('taskDateInput').value,
        status: document.getElementById('taskStatusSelect').value,
        memberName: document.getElementById('taskMembersSelect').value,
        note: document.getElementById('taskNote').value,
        image: document.getElementById('taskImageUrl').value,
        left: currentTaskData ? currentTaskData.left : 48,
        width: currentTaskData ? currentTaskData.width : (state.hourWidth * 2),
    };

    if (!taskData.date) {
        showCustomConfirm({ title: "Error", message: "Please select a date for the mission." });
        return;
    }

    const taskIndex = activeProject.tasks.findIndex(t => t.id === taskData.id);
    if (taskIndex > -1) {
        activeProject.tasks[taskIndex] = { ...activeProject.tasks[taskIndex], ...taskData };
    } else {
        activeProject.tasks.push(taskData);
    }

    saveState();
    layoutAllTasks();
    closeModals();
}

function deleteTask() {
    if (!currentTaskData) return;
    showCustomConfirm({
        title: "Delete Mission",
        message: `Are you sure you want to delete "${currentTaskData.name}"? This action cannot be undone.`,
        onOk: () => {
            const activeProject = state.projects.find(p => p.active);
            if (!activeProject) return;
            activeProject.tasks = activeProject.tasks.filter(t => t.id !== currentTaskData.id);
            saveState();
            layoutAllTasks();
            closeModals();
        }
    });
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    document.getElementById(e.target.id === 'taskImageFile' ? 'taskImageUrl' : 'projectBackgroundInput').value = url;
}

function renderTask(taskData) {
    const dayLane = document.querySelector(`.task-lane[data-date="${taskData.date}"]`);
    if (!dayLane) return;

    const activeProject = state.projects.find(p => p.active);
    const member = activeProject.members.find(m => m.name === taskData.memberName);

    let taskEl = document.createElement('div');
    taskEl.className = 'task-card';
    dayLane.appendChild(taskEl);

    taskEl.dataset.id = taskData.id;
    taskEl.style.left = `${taskData.left}px`;
    taskEl.style.width = `${taskData.width}px`;
    taskEl.style.top = `${taskData.track * 45}px`;

    if (member && member.color) {
        taskEl.style.background = `linear-gradient(135deg, ${hexToRgba(member.color, 0.6)} 0%, ${hexToRgba(member.color, 0.4)} 100%)`;
    } else {
        taskEl.style.background = `linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.06) 100%)`;
    }

    const timeStr = calculateTimeString(taskData.left, taskData.width);
    const imgHTML = taskData.image ? `<img src="${taskData.image}" class="task-img" alt="task">` : '';

    taskEl.innerHTML = `
        ${imgHTML}
        <div class="task-name">${taskData.name}</div>
        <div class="time-estimate">${timeStr}</div>
        <div class="status-indicator">${taskData.status}</div>
        <div class="resizer" onmousedown="startResize(event, this.parentElement)"></div>
    `;

    taskEl.addEventListener('dblclick', (e) => { e.stopPropagation(); openTaskModal(taskData); });
    taskEl.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('resizer')) return;
        draggingTask = taskEl;
        taskEl.dataset.id = taskData.id;
        taskEl.dataset.startX = e.clientX - taskEl.offsetLeft;
        taskEl.style.zIndex = 10;
        isDragging = true;
        requestAnimationFrame(dragUpdateLoop);
    });
}

function calculateTimeString(left, width) {
    const startHour = left / state.hourWidth;
    const endHour = (left + width) / state.hourWidth;
    const formatTime = (h) => {
        const hrs = Math.floor(h);
        const mins = Math.round((h - hrs) * 60);
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    };
    return `${formatTime(startHour)} - ${formatTime(endHour)}`;
}

function startResize(e, taskEl) {
    e.stopPropagation();
    resizingTask = taskEl;
    taskEl.dataset.startWidth = taskEl.offsetWidth;
    taskEl.dataset.mouseX = e.clientX;
    isResizing = true;
    requestAnimationFrame(dragUpdateLoop);
}

let mouseX = 0;
let mouseY = 0;
let isDragging = false;
let isResizing = false;

function handleDragMove(e) { mouseX = e.clientX; mouseY = e.clientY; }

function dragUpdateLoop() {
    if (isDragging && draggingTask) {
        const newLeft = Math.max(0, mouseX - draggingTask.dataset.startX);
        draggingTask.style.left = `${newLeft}px`;
        const timeEl = draggingTask.querySelector('.time-estimate');
        if (timeEl) timeEl.innerText = calculateTimeString(newLeft, draggingTask.offsetWidth);
    }
    if (isResizing && resizingTask) {
        const diff = mouseX - resizingTask.dataset.mouseX;
        const newWidth = Math.max(40, parseInt(resizingTask.dataset.startWidth) + diff);
        resizingTask.style.width = `${newWidth}px`;
        const timeEl = resizingTask.querySelector('.time-estimate');
        if (timeEl) timeEl.innerText = calculateTimeString(resizingTask.offsetLeft, newWidth);
    }
    if (isDragging || isResizing) {
        requestAnimationFrame(dragUpdateLoop);
    }
}

function handleDragEnd() {
    const activeProject = state.projects.find(p => p.active);
    if (!activeProject) return;

    let needsLayout = false;
    if (isDragging && draggingTask) {
        draggingTask.style.zIndex = 2;
        const task = activeProject.tasks.find(t => t.id === draggingTask.dataset.id);
        if (task) task.left = draggingTask.offsetLeft;
        needsLayout = true;
    }
    if (isResizing && resizingTask) {
        const task = activeProject.tasks.find(t => t.id === resizingTask.dataset.id);
        if (task) task.width = resizingTask.offsetWidth;
        needsLayout = true;
    }

    if (needsLayout) {
        saveState();
        layoutAllTasks();
    }

    isDragging = false; isResizing = false; draggingTask = null; resizingTask = null;
}

function showContextMenu(menuId, x, y) {
    hideContextMenus();
    const menu = document.getElementById(menuId);
    if (!menu) return;
    menu.style.display = 'block';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
}

function hideContextMenus() {
    document.querySelectorAll('.context-menu').forEach(m => m.style.display = 'none');
}

function renderProjects() {
    const projectList = document.getElementById('projectList');
    projectList.querySelectorAll('li:not(.add-project)').forEach(li => li.remove());
    state.projects.forEach(p => {
        const li = document.createElement('li');
        li.dataset.id = p.id;
        if (p.active) li.className = 'active-project';
        if (p.starred) li.classList.add('starred');
        li.innerHTML = `<span class="dot"></span> ${p.name}${p.starred ? ' <span class="star-badge">★</span>' : ''}`;
        li.onclick = () => switchProject(p.id);
        li.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            currentContextMenuProjectId = p.id;
            // Update star label
            const proj = state.projects.find(pr => pr.id === p.id);
            if (proj) {
                document.getElementById('pmenuStarIcon').innerText = proj.starred ? '★' : '☆';
                document.getElementById('pmenuStarLabel').innerText = proj.starred ? 'Unstar Project' : 'Mark as Starred';
            }
            showContextMenu('projectContextMenu', e.pageX, e.pageY);
        });
        projectList.insertBefore(li, projectList.querySelector('.add-project'));
    });
}

// Context menu actions
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('pmenuStar').addEventListener('click', () => {
        const proj = state.projects.find(p => p.id === currentContextMenuProjectId);
        if (proj) {
            proj.starred = !proj.starred;
            saveState();
            renderProjects();
        }
        hideContextMenus();
    });

    document.getElementById('pmenuDelete').addEventListener('click', () => {
        hideContextMenus();
        const proj = state.projects.find(p => p.id === currentContextMenuProjectId);
        if (!proj) return;
        showCustomConfirm({
            title: "Delete Project",
            message: `Delete "${proj.name}"? This cannot be undone.`,
            onOk: () => {
                state.projects = state.projects.filter(p => p.id !== currentContextMenuProjectId);
                if (state.projects.length > 0 && !state.projects.some(p => p.active)) {
                    state.projects[0].active = true;
                }
                saveState();
                renderProjects();
                updateUIAfterProjectSwitch();
            }
        });
    });

    // Rename popup logic
    const renamePopup = document.getElementById('renamePopup');
    document.getElementById('renameCancelBtn').addEventListener('click', () => {
        renamePopup.style.display = 'none';
    });
    document.getElementById('renameConfirmBtn').addEventListener('click', () => {
        const newName = document.getElementById('renameInput').value.trim();
        if (newName && currentContextMenuProjectId) {
            const proj = state.projects.find(p => p.id === currentContextMenuProjectId);
            if (proj) {
                proj.name = newName;
                saveState();
                renderProjects();
                updateUIAfterProjectSwitch();
            }
        }
        renamePopup.style.display = 'none';
    });

    // Context menu: Edit task
    document.getElementById('menuEdit').addEventListener('click', () => {
        hideContextMenus();
        if (window._contextMenuTaskData) {
            openTaskModal(window._contextMenuTaskData);
        }
    });
    document.getElementById('menuDelete').addEventListener('click', () => {
        hideContextMenus();
        if (window._contextMenuTaskData) {
            currentTaskData = window._contextMenuTaskData;
            deleteTask();
        }
    });
});

function addNewProject() {
    currentContextMenuProjectId = null;
    openProjectSettings();
}

function updateUIAfterProjectSwitch() {
    const activeProject = state.projects.find(p => p.active);
    if (!activeProject) return;

    document.getElementById('projectName').innerText = `"${activeProject.name}"`;
    document.body.style.backgroundImage = activeProject.background ? `url(${activeProject.background})` : 'none';

    layoutAllTasks();
}

function switchProject(id) {
    state.projects.forEach(p => p.active = p.id === id);
    saveState();
    renderProjects();
    updateUIAfterProjectSwitch();
}

function layoutAllTasks() {
    const activeProject = state.projects.find(p => p.active);
    if (!activeProject) return;

    // Collect all unique task dates
    const taskDates = activeProject.tasks ? activeProject.tasks.map(t => t.date).filter(Boolean) : [];
    initTimeline(taskDates);

    const tasksByDay = {};
    document.querySelectorAll('.task-lane').forEach(lane => {
        tasksByDay[lane.dataset.date] = [];
    });

    if (activeProject.tasks) {
        activeProject.tasks.forEach(task => {
            if (tasksByDay[task.date]) {
                tasksByDay[task.date].push(task);
            }
        });
    }

    Object.keys(tasksByDay).forEach(date => {
        const tasksForDay = tasksByDay[date].sort((a, b) => a.left - b.left);
        let tracks = [];
        tasksForDay.forEach(task => {
            let placed = false;
            for (let i = 0; i < tracks.length; i++) {
                if (!tracks[i].some(t => task.left < t.left + t.width && t.left < task.left + task.width)) {
                    tracks[i].push(task);
                    task.track = i;
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                task.track = tracks.length;
                tracks.push([task]);
            }
        });
        const dayRow = document.querySelector(`.task-lane[data-date="${date}"]`)?.parentElement;
        if (dayRow && tracks.length > 0) {
            dayRow.style.minHeight = `${Math.max(90, tracks.length * 45 + 50)}px`;
        }
    });

    document.querySelectorAll('.task-card').forEach(t => t.remove());
    if (activeProject.tasks) {
        activeProject.tasks.forEach(taskData => renderTask(taskData));
    }

    // Scroll today into view
    const todayRow = document.querySelector('.today-row');
    if (todayRow) {
        setTimeout(() => todayRow.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
    }
}