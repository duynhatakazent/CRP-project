/**
 * Orbit Task Board
 */
let draggingTask = null;
let resizingTask = null;
let currentTaskData = null;
let currentContextMenuProjectId = null;
let currentContextTaskData = null;
let activeModal = null;
let lastFocusedElement = null;
let longPressTimer = null;

let mouseX = 0;
let mouseY = 0;
let isDragging = false;
let isResizing = false;
let dragMoved = false;
let resizeMoved = false;
let touchMoved = false;
let longPressOpened = false;

const TASK_STATUSES = ['Not Started', 'In Progress', 'Done', 'Dropped'];
const TASK_PRIORITIES = ['Low', 'Medium', 'High'];
const DAY_HOURS = 24;
const DEFAULT_HOUR_WIDTH = 72;
const VIEW_MODE_STORAGE_KEY = 'orbitTaskViewMode';
const SYNC_DEBOUNCE_MS = 700;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROJECT_META_PREFIX = '__ORBIT_PROJECT_META_V1__:';
const TASK_META_PREFIX = '__ORBIT_TASK_META_V1__:';
const LOCAL_TO_BACKEND_STATUS = {
    'Not Started': 'TODO',
    'In Progress': 'IN_PROGRESS',
    Done: 'DONE',
    Dropped: 'BLOCKED'
};
const BACKEND_TO_LOCAL_STATUS = {
    TODO: 'Not Started',
    IN_PROGRESS: 'In Progress',
    DONE: 'Done',
    BLOCKED: 'Dropped'
};
const LOCAL_TO_BACKEND_PRIORITY = {
    Low: 'LOW',
    Medium: 'MEDIUM',
    High: 'HIGH'
};
const BACKEND_TO_LOCAL_PRIORITY = {
    LOW: 'Low',
    MEDIUM: 'Medium',
    HIGH: 'High',
    URGENT: 'High'
};
const LEGACY_TIMEZONE_MAP = {
    'UTC+7 (Ho Chi Minh)': 'Asia/Ho_Chi_Minh',
    'UTC+0 (London)': 'Europe/London',
    'UTC-5 (New York)': 'America/New_York',
    'UTC+9 (Tokyo)': 'Asia/Tokyo',
    'UTC+8 (Singapore)': 'Asia/Singapore'
};

const state = {
    projects: [],
    hourWidth: DEFAULT_HOUR_WIDTH,
    settings: null,
    viewMode: 'timeline',
    didInitialScroll: false,
    remoteSync: {
        workspaceId: '',
        timer: null,
        syncing: false,
        pending: false,
        hydrating: false
    },
    filters: {
        text: '',
        status: 'All',
        member: 'All'
    }
};

function navigateTo(url) {
    document.body.classList.add('fade-out');
    setTimeout(() => {
        window.location.href = url;
    }, 280);
}

function safeParseJSON(raw) {
    if (!raw || typeof raw !== 'string') return null;
    try {
        return JSON.parse(raw);
    } catch (_) {
        return null;
    }
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function sanitizeText(value, maxLen = 120) {
    if (typeof value !== 'string') return '';
    return value.trim().replace(/\s+/g, ' ').slice(0, maxLen);
}

function sanitizeNote(value) {
    if (typeof value !== 'string') return '';
    return value.trim().slice(0, 1000);
}

function isISODate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isTimeValue(value) {
    return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function toDateTimeLocal(dateISO, timeValue) {
    if (!isISODate(dateISO) || !isTimeValue(timeValue)) return '';
    return `${dateISO}T${timeValue}`;
}

function parseDateTimeLocal(value) {
    if (typeof value !== 'string' || !value.includes('T')) return null;
    const [datePart, timePartRaw] = value.split('T');
    const timePart = timePartRaw ? timePartRaw.slice(0, 5) : '';
    if (!isISODate(datePart) || !isTimeValue(timePart)) return null;
    return { date: datePart, time: timePart };
}

function timeToMinutes(value) {
    if (!isTimeValue(value)) return null;
    const [h, m] = value.split(':').map(Number);
    return h * 60 + m;
}

function minutesToTime(totalMinutes) {
    const clamped = clamp(Math.round(totalMinutes), 0, DAY_HOURS * 60);
    const hours = Math.floor(clamped / 60) % DAY_HOURS;
    const mins = clamped % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function leftToTime(left) {
    const hours = clamp(left / state.hourWidth, 0, DAY_HOURS);
    return minutesToTime(hours * 60);
}

function timeToLeft(timeValue) {
    const minutes = timeToMinutes(timeValue);
    if (minutes === null) return 0;
    return (minutes / 60) * state.hourWidth;
}

function widthToMinutes(width) {
    return clamp((width / state.hourWidth) * 60, 15, DAY_HOURS * 60);
}

function getQuarterRoundedNowTime() {
    const now = new Date();
    const mins = now.getMinutes();
    const rounded = Math.ceil(mins / 15) * 15;
    if (rounded >= 60) {
        now.setHours(now.getHours() + 1, 0, 0, 0);
    } else {
        now.setMinutes(rounded, 0, 0);
    }
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function sanitizeImageUrl(value) {
    if (typeof value !== 'string') return '';
    const url = value.trim();
    if (!url) return '';
    if (/^data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=\s]+$/.test(url)) return url;
    if (/^https?:\/\/\S+$/i.test(url)) return url;
    return '';
}

function sanitizeTimezone(value) {
    const defaultTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    if (typeof value !== 'string' || !value.trim()) return defaultTz;
    const mapped = LEGACY_TIMEZONE_MAP[value] || value;
    try {
        Intl.DateTimeFormat('en-US', { timeZone: mapped }).format(new Date());
        return mapped;
    } catch (_) {
        return defaultTz;
    }
}

function getDefaultBoardSettings() {
    return {
        timeline: {
            startDate: '',
            endDate: '',
            hourFormat: '24',
            showWeekends: true,
            weekStart: 'mon',
            defaultDuration: 2,
            snapGrid: true
        },
        account: {
            timezone: sanitizeTimezone('')
        }
    };
}

function sanitizeBoardSettings(raw) {
    const defaults = getDefaultBoardSettings();
    const timeline = raw && typeof raw === 'object' && raw.timeline && typeof raw.timeline === 'object' ? raw.timeline : {};
    const account = raw && typeof raw === 'object' && raw.account && typeof raw.account === 'object' ? raw.account : {};
    const defaultDuration = Number(timeline.defaultDuration);
    return {
        timeline: {
            startDate: isISODate(timeline.startDate) ? timeline.startDate : '',
            endDate: isISODate(timeline.endDate) ? timeline.endDate : '',
            hourFormat: timeline.hourFormat === '12' ? '12' : defaults.timeline.hourFormat,
            showWeekends: typeof timeline.showWeekends === 'boolean' ? timeline.showWeekends : defaults.timeline.showWeekends,
            weekStart: timeline.weekStart === 'sun' ? 'sun' : defaults.timeline.weekStart,
            defaultDuration: Number.isFinite(defaultDuration) ? clamp(defaultDuration, 0.5, 12) : defaults.timeline.defaultDuration,
            snapGrid: typeof timeline.snapGrid === 'boolean' ? timeline.snapGrid : defaults.timeline.snapGrid
        },
        account: {
            timezone: sanitizeTimezone(account.timezone)
        }
    };
}

function loadBoardSettings() {
    return sanitizeBoardSettings(safeParseJSON(localStorage.getItem('orbitSettings')));
}

function toISODate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function fromISODate(value) {
    const [y, m, d] = String(value).split('-').map(Number);
    return new Date(y, m - 1, d);
}

function shiftISODate(dateISO, days) {
    const d = fromISODate(dateISO);
    d.setDate(d.getDate() + days);
    return toISODate(d);
}

function computeEndDateTime(startDate, startTime, durationHours) {
    const startMinutes = timeToMinutes(startTime);
    if (!startDate || startMinutes === null) {
        return { endDate: startDate, endTime: startTime };
    }
    const totalMinutes = startMinutes + Math.round(durationHours * 60);
    if (totalMinutes < DAY_HOURS * 60) {
        return {
            endDate: startDate,
            endTime: minutesToTime(totalMinutes)
        };
    }
    return {
        endDate: shiftISODate(startDate, 1),
        endTime: minutesToTime(totalMinutes - DAY_HOURS * 60)
    };
}

function getISOInTimezone(date, timeZone) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    return formatter.format(date);
}

function getTodayISO() {
    const tz = state.settings?.account?.timezone || 'UTC';
    return getISOInTimezone(new Date(), tz);
}

function getDefaultProject() {
    return {
        id: `proj-${Date.now()}`,
        name: 'Project Nebula',
        active: true,
        background: '',
        members: [
            { name: 'Commander', color: '#6e56cf' },
            { name: 'Pilot', color: '#29a3a3' }
        ],
        tasks: []
    };
}

function sanitizeMember(member, index) {
    const raw = member && typeof member === 'object' ? member : {};
    const color = typeof raw.color === 'string' && /^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/.test(raw.color)
        ? raw.color
        : '#6e56cf';
    const name = sanitizeText(raw.name, 40) || `Member ${index + 1}`;
    return { name, color };
}

function sanitizeTask(task, index) {
    const raw = task && typeof task === 'object' ? task : {};
    const maxWidth = state.hourWidth * DAY_HOURS;
    const leftRaw = Number(raw.left);
    const widthRaw = Number(raw.width);
    const leftFallback = Number.isFinite(leftRaw) ? clamp(leftRaw, 0, maxWidth) : 48;
    const widthSafe = Number.isFinite(widthRaw) ? widthRaw : state.hourWidth * 2;
    const widthFallback = clamp(widthSafe, state.hourWidth * 0.25, Math.max(state.hourWidth * 0.25, maxWidth - leftFallback));

    const startDate = isISODate(raw.startDate) ? raw.startDate : (isISODate(raw.date) ? raw.date : '');
    let endDate = isISODate(raw.endDate) ? raw.endDate : startDate;
    if (startDate && endDate && endDate < startDate) endDate = startDate;

    const startTime = isTimeValue(raw.startTime) ? raw.startTime : leftToTime(leftFallback);
    const endTimeRaw = isTimeValue(raw.endTime) ? raw.endTime : (isTimeValue(raw.dueTime) ? raw.dueTime : leftToTime(leftFallback + widthFallback));
    const startMinutes = timeToMinutes(startTime);
    const endMinutesRaw = timeToMinutes(endTimeRaw);

    let left = leftFallback;
    let width = widthFallback;
    let endTime = endTimeRaw;

    if (startMinutes !== null) {
        left = clamp(timeToLeft(startTime), 0, maxWidth);
    }

    const isCrossDay = Boolean(startDate && endDate && endDate > startDate);
    if (startMinutes !== null && endMinutesRaw !== null) {
        if (isCrossDay) {
            width = clamp(maxWidth - left, state.hourWidth * 0.25, Math.max(state.hourWidth * 0.25, maxWidth - left));
        } else {
            const endMinutes = endMinutesRaw > startMinutes ? endMinutesRaw : startMinutes + 15;
            endTime = minutesToTime(endMinutes);
            width = clamp(((endMinutes - startMinutes) / 60) * state.hourWidth, state.hourWidth * 0.25, Math.max(state.hourWidth * 0.25, maxWidth - left));
        }
    } else {
        width = clamp(width, state.hourWidth * 0.25, Math.max(state.hourWidth * 0.25, maxWidth - left));
        endTime = leftToTime(left + width);
    }

    return {
        id: typeof raw.id === 'string' && raw.id ? raw.id : `task-${Date.now()}-${index}`,
        name: sanitizeText(raw.name, 120) || 'Untitled Task',
        date: startDate,
        startDate,
        startTime,
        endDate: endDate || startDate,
        endTime,
        status: TASK_STATUSES.includes(raw.status) ? raw.status : 'Not Started',
        memberName: sanitizeText(raw.memberName, 40),
        note: sanitizeNote(raw.note),
        image: sanitizeImageUrl(raw.image),
        left,
        width,
        priority: TASK_PRIORITIES.includes(raw.priority) ? raw.priority : 'Medium',
        dueTime: endTime,
        track: Number.isFinite(Number(raw.track)) ? Math.max(0, Number(raw.track)) : 0
    };
}

function sanitizeProject(project, index) {
    const raw = project && typeof project === 'object' ? project : {};
    const membersRaw = Array.isArray(raw.members) ? raw.members : [];
    const tasksRaw = Array.isArray(raw.tasks) ? raw.tasks : [];
    return {
        id: typeof raw.id === 'string' && raw.id ? raw.id : `proj-${Date.now()}-${index}`,
        name: sanitizeText(raw.name, 80) || `Project ${index + 1}`,
        active: Boolean(raw.active),
        background: sanitizeImageUrl(raw.background),
        starred: Boolean(raw.starred),
        members: membersRaw.map(sanitizeMember),
        tasks: tasksRaw.map(sanitizeTask).filter((task) => task.date)
    };
}

function isUuid(value) {
    return typeof value === 'string' && UUID_REGEX.test(value.trim());
}

function hasTaskApiClient() {
    return Boolean(
        window.OrbitTaskApi &&
        typeof window.OrbitTaskApi.getToken === 'function' &&
        typeof window.OrbitTaskApi.ensureWorkspace === 'function'
    );
}

function toIsoDateTime(dateISO, timeValue) {
    if (!isISODate(dateISO) || !isTimeValue(timeValue)) return null;
    const parsed = new Date(`${dateISO}T${timeValue}:00`);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
}

function fromIsoDateTime(value) {
    if (typeof value !== 'string' || value.trim().length === 0) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return {
        date: toISODate(parsed),
        time: `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`
    };
}

function sanitizePersistentImage(value, maxLen) {
    const normalized = sanitizeImageUrl(value);
    if (!normalized) return '';
    if (normalized.startsWith('data:')) return '';
    return normalized.slice(0, maxLen);
}

function buildProjectDescription(project) {
    const members = Array.isArray(project.members)
        ? project.members.slice(0, 30).map((member, index) => sanitizeMember(member, index))
        : [];
    const meta = {
        version: 1,
        background: sanitizePersistentImage(project.background, 1200),
        starred: Boolean(project.starred),
        members
    };
    return `${PROJECT_META_PREFIX}${JSON.stringify(meta)}`;
}

function parseProjectDescription(description) {
    if (typeof description !== 'string' || !description.startsWith(PROJECT_META_PREFIX)) {
        return null;
    }
    const parsed = safeParseJSON(description.slice(PROJECT_META_PREFIX.length));
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
}

function buildTaskDescription(task) {
    const meta = {
        version: 1,
        startDate: isISODate(task.startDate) ? task.startDate : '',
        startTime: isTimeValue(task.startTime) ? task.startTime : '',
        endDate: isISODate(task.endDate) ? task.endDate : '',
        endTime: isTimeValue(task.endTime) ? task.endTime : '',
        note: sanitizeNote(task.note),
        image: sanitizePersistentImage(task.image, 1200),
        memberName: sanitizeText(task.memberName, 40),
        track: Number.isFinite(Number(task.track)) ? Math.max(0, Number(task.track)) : 0
    };
    return `${TASK_META_PREFIX}${JSON.stringify(meta)}`;
}

function parseTaskDescription(description) {
    if (typeof description !== 'string' || !description.startsWith(TASK_META_PREFIX)) {
        return null;
    }
    const parsed = safeParseJSON(description.slice(TASK_META_PREFIX.length));
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
}

function mapLocalStatusToBackend(value) {
    return LOCAL_TO_BACKEND_STATUS[value] || 'TODO';
}

function mapBackendStatusToLocal(value) {
    return BACKEND_TO_LOCAL_STATUS[value] || 'Not Started';
}

function mapLocalPriorityToBackend(value) {
    return LOCAL_TO_BACKEND_PRIORITY[value] || 'MEDIUM';
}

function mapBackendPriorityToLocal(value) {
    return BACKEND_TO_LOCAL_PRIORITY[value] || 'Medium';
}

function normalizeProjectsCollection(projects) {
    if (!Array.isArray(projects) || projects.length === 0) {
        return [];
    }
    const activeIndex = projects.findIndex((project) => project.active);
    projects.forEach((project, index) => {
        project.active = index === (activeIndex >= 0 ? activeIndex : 0);
    });
    return projects;
}

function mapRemoteTaskToLocal(task, index) {
    const parsedMeta = parseTaskDescription(task && task.description);
    const dueAtParts = fromIsoDateTime(task && task.dueAt);

    let startDate = parsedMeta && isISODate(parsedMeta.startDate) ? parsedMeta.startDate : '';
    let startTime = parsedMeta && isTimeValue(parsedMeta.startTime) ? parsedMeta.startTime : '';
    let endDate = parsedMeta && isISODate(parsedMeta.endDate) ? parsedMeta.endDate : '';
    let endTime = parsedMeta && isTimeValue(parsedMeta.endTime) ? parsedMeta.endTime : '';

    if ((!endDate || !endTime) && dueAtParts) {
        endDate = dueAtParts.date;
        endTime = dueAtParts.time;
    }

    if ((!startDate || !startTime) && endDate && endTime) {
        const fallbackStart = new Date(`${endDate}T${endTime}:00`);
        fallbackStart.setHours(fallbackStart.getHours() - 1);
        if (!Number.isNaN(fallbackStart.getTime())) {
            startDate = toISODate(fallbackStart);
            startTime = `${String(fallbackStart.getHours()).padStart(2, '0')}:${String(fallbackStart.getMinutes()).padStart(2, '0')}`;
        }
    }

    if (!startDate || !startTime) {
        const today = getTodayISO();
        startDate = startDate || today;
        startTime = startTime || '09:00';
    }

    if (!endDate || !endTime) {
        const fallbackEnd = new Date(`${startDate}T${startTime}:00`);
        fallbackEnd.setHours(fallbackEnd.getHours() + 1);
        endDate = toISODate(fallbackEnd);
        endTime = `${String(fallbackEnd.getHours()).padStart(2, '0')}:${String(fallbackEnd.getMinutes()).padStart(2, '0')}`;
    }

    return sanitizeTask({
        id: typeof task.id === 'string' ? task.id : `task-${Date.now()}-${index}`,
        name: sanitizeText(task && task.title, 120) || 'Untitled Task',
        date: startDate,
        startDate,
        startTime,
        endDate,
        endTime,
        status: mapBackendStatusToLocal(task && task.status),
        priority: mapBackendPriorityToLocal(task && task.priority),
        note: sanitizeNote(parsedMeta && parsedMeta.note),
        image: sanitizeImageUrl(parsedMeta && parsedMeta.image),
        memberName: sanitizeText(parsedMeta && parsedMeta.memberName, 40),
        dueTime: endTime,
        track: Number.isFinite(Number(parsedMeta && parsedMeta.track)) ? Math.max(0, Number(parsedMeta.track)) : 0
    }, index);
}

function flattenBoardTasks(board) {
    const unique = new Map();
    const columns = board && Array.isArray(board.columns) ? board.columns : [];
    columns.forEach((column) => {
        const tasks = column && Array.isArray(column.tasks) ? column.tasks : [];
        tasks.forEach((task) => {
            if (!task || typeof task.id !== 'string') return;
            if (!unique.has(task.id)) {
                unique.set(task.id, task);
            }
        });
    });
    return [...unique.values()];
}

function resolveColumnIdForStatus(columns, backendStatus) {
    const normalizedColumns = Array.isArray(columns) ? columns : [];
    if (normalizedColumns.length === 0) return '';

    let hint = 'done';
    if (backendStatus === 'TODO') hint = 'todo';
    if (backendStatus === 'IN_PROGRESS') hint = 'in progress';

    const matched = normalizedColumns.find((column) => {
        const name = typeof column.name === 'string' ? column.name.toLowerCase() : '';
        return name.includes(hint);
    });
    const selected = matched || normalizedColumns[0];
    return selected && typeof selected.id === 'string' ? selected.id : '';
}

function buildRemoteTaskPayload(task, columns) {
    const status = mapLocalStatusToBackend(task.status);
    const columnId = resolveColumnIdForStatus(columns, status);
    const payload = {
        title: sanitizeText(task.name, 120) || 'Untitled Task',
        description: buildTaskDescription(task),
        priority: mapLocalPriorityToBackend(task.priority),
        status
    };
    if (isUuid(columnId)) {
        payload.columnId = columnId;
    }
    const dueAt = toIsoDateTime(task.endDate, task.endTime);
    if (dueAt) {
        payload.dueAt = dueAt;
    }
    return payload;
}

function saveState(options = {}) {
    localStorage.setItem('helloProjectsState', JSON.stringify(state.projects));
    if (options.skipRemoteSync) return;
    if (state.remoteSync.hydrating) return;
    queueRemoteSync();
}

function loadStateFromLocalCache() {
    const raw = localStorage.getItem('helloProjectsState');
    if (raw === null) {
        state.projects = [getDefaultProject()];
        saveState({ skipRemoteSync: true });
        return { hadSavedData: false };
    }

    const parsed = safeParseJSON(raw);
    if (!Array.isArray(parsed)) {
        state.projects = [getDefaultProject()];
        saveState({ skipRemoteSync: true });
        return { hadSavedData: false };
    }

    const sanitized = parsed.map(sanitizeProject);
    if (sanitized.length === 0) {
        state.projects = [];
        saveState({ skipRemoteSync: true });
        return { hadSavedData: true };
    }

    state.projects = normalizeProjectsCollection(sanitized);
    saveState({ skipRemoteSync: true });
    return { hadSavedData: true };
}

async function resolveWorkspace(taskApi) {
    if (isUuid(state.remoteSync.workspaceId)) {
        return { id: state.remoteSync.workspaceId };
    }
    const workspace = await taskApi.ensureWorkspace('My Workspace');
    if (workspace && isUuid(workspace.id)) {
        state.remoteSync.workspaceId = workspace.id;
    }
    return workspace;
}

async function loadStateFromRemote() {
    if (!hasTaskApiClient()) return null;
    if (!window.OrbitTaskApi.getToken()) return null;

    try {
        const workspace = await resolveWorkspace(window.OrbitTaskApi);
        if (!workspace || !isUuid(workspace.id)) return null;

        const projectsResponse = await window.OrbitTaskApi.listProjects(workspace.id, 1, 100);
        const remoteProjects = Array.isArray(projectsResponse.data) ? projectsResponse.data : [];
        const mappedProjects = [];

        for (let index = 0; index < remoteProjects.length; index += 1) {
            const remoteProject = remoteProjects[index];
            const board = await window.OrbitTaskApi.getBoard(remoteProject.id);
            const tasks = flattenBoardTasks(board).map((task, taskIndex) => mapRemoteTaskToLocal(task, taskIndex));
            const parsedMeta = parseProjectDescription(remoteProject.description);
            const membersRaw = parsedMeta && Array.isArray(parsedMeta.members) ? parsedMeta.members : [];

            mappedProjects.push(sanitizeProject({
                id: remoteProject.id,
                name: remoteProject.name,
                active: index === 0,
                background: parsedMeta && parsedMeta.background ? parsedMeta.background : '',
                starred: Boolean(parsedMeta && parsedMeta.starred),
                members: membersRaw.map(sanitizeMember),
                tasks
            }, index));
        }

        return normalizeProjectsCollection(mappedProjects);
    } catch (error) {
        console.warn('Unable to load remote project state:', error);
        return null;
    }
}

async function syncProjectTasks(project) {
    const board = await window.OrbitTaskApi.getBoard(project.id);
    const columns = board && Array.isArray(board.columns) ? board.columns : [];
    const remoteTasks = flattenBoardTasks(board);
    const remoteById = new Map(remoteTasks.map((task) => [task.id, task]));
    const localTaskIds = new Set();

    for (const task of project.tasks) {
        const payload = buildRemoteTaskPayload(task, columns);
        const knownRemoteTask = isUuid(task.id) ? remoteById.get(task.id) : null;

        if (knownRemoteTask) {
            await window.OrbitTaskApi.updateTask(task.id, payload);
            localTaskIds.add(task.id);
            continue;
        }

        const created = await window.OrbitTaskApi.createTask(project.id, payload);
        if (created && typeof created.id === 'string') {
            task.id = created.id;
            localTaskIds.add(created.id);
        }
    }

    for (const remoteTask of remoteTasks) {
        if (!localTaskIds.has(remoteTask.id)) {
            await window.OrbitTaskApi.deleteTask(remoteTask.id);
        }
    }
}

async function syncStateToRemote() {
    if (!hasTaskApiClient()) return;
    if (!window.OrbitTaskApi.getToken()) return;

    const workspace = await resolveWorkspace(window.OrbitTaskApi);
    if (!workspace || !isUuid(workspace.id)) return;

    const remoteProjectsResponse = await window.OrbitTaskApi.listProjects(workspace.id, 1, 100);
    const remoteProjects = Array.isArray(remoteProjectsResponse.data) ? remoteProjectsResponse.data : [];
    const remoteById = new Map(remoteProjects.map((project) => [project.id, project]));
    const localProjectIds = new Set();

    for (const project of state.projects) {
        const projectPayload = {
            name: sanitizeText(project.name, 80) || 'Untitled Project',
            description: buildProjectDescription(project)
        };
        const knownRemoteProject = isUuid(project.id) ? remoteById.get(project.id) : null;

        if (!knownRemoteProject) {
            const created = await window.OrbitTaskApi.createProject(workspace.id, projectPayload);
            if (!created || !isUuid(created.id)) {
                continue;
            }
            project.id = created.id;
        } else {
            await window.OrbitTaskApi.updateProject(project.id, projectPayload);
        }

        localProjectIds.add(project.id);
        await syncProjectTasks(project);
    }

    for (const remoteProject of remoteProjects) {
        if (!localProjectIds.has(remoteProject.id)) {
            await window.OrbitTaskApi.deleteProject(remoteProject.id);
        }
    }

    saveState({ skipRemoteSync: true });
}

async function flushRemoteSyncQueue() {
    if (state.remoteSync.syncing) {
        state.remoteSync.pending = true;
        return;
    }

    state.remoteSync.syncing = true;
    state.remoteSync.pending = false;
    try {
        await syncStateToRemote();
    } catch (error) {
        console.warn('Unable to sync project state to server:', error);
    } finally {
        state.remoteSync.syncing = false;
    }

    if (state.remoteSync.pending) {
        state.remoteSync.pending = false;
        await flushRemoteSyncQueue();
    }
}

function queueRemoteSync(immediate = false) {
    if (!hasTaskApiClient()) return;
    if (!window.OrbitTaskApi.getToken()) return;

    if (state.remoteSync.timer) {
        clearTimeout(state.remoteSync.timer);
        state.remoteSync.timer = null;
    }

    const delay = immediate ? 0 : SYNC_DEBOUNCE_MS;
    state.remoteSync.timer = setTimeout(() => {
        state.remoteSync.timer = null;
        void flushRemoteSyncQueue();
    }, delay);
}

async function loadState() {
    const localState = loadStateFromLocalCache();
    const remoteProjects = await loadStateFromRemote();
    if (Array.isArray(remoteProjects)) {
        state.remoteSync.hydrating = true;
        if (remoteProjects.length > 0) {
            state.projects = normalizeProjectsCollection(remoteProjects);
            saveState({ skipRemoteSync: true });
            state.remoteSync.hydrating = false;
            return;
        }
        state.remoteSync.hydrating = false;
        if (localState.hadSavedData && state.projects.length > 0) {
            queueRemoteSync(true);
        }
    }
}

function loadBoardViewMode() {
    const raw = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return raw === 'board' ? 'board' : 'timeline';
}

function setBoardViewMode(mode, options = {}) {
    const persist = options.persist !== false;
    const skipLayout = options.skipLayout === true;
    const nextMode = mode === 'board' ? 'board' : 'timeline';
    state.viewMode = nextMode;

    const timelineWrapper = document.querySelector('.timeline-wrapper');
    const kanbanWrapper = document.getElementById('kanbanWrapper');
    const timelineViewBtn = document.getElementById('timelineViewBtn');
    const boardViewBtn = document.getElementById('boardViewBtn');

    if (timelineWrapper) {
        timelineWrapper.hidden = nextMode !== 'timeline';
        timelineWrapper.style.display = nextMode === 'timeline' ? 'flex' : 'none';
    }
    if (kanbanWrapper) {
        kanbanWrapper.hidden = nextMode !== 'board';
        kanbanWrapper.style.display = nextMode === 'board' ? 'flex' : 'none';
    }

    if (timelineViewBtn) {
        timelineViewBtn.classList.toggle('active', nextMode === 'timeline');
        timelineViewBtn.setAttribute('aria-pressed', nextMode === 'timeline' ? 'true' : 'false');
    }
    if (boardViewBtn) {
        boardViewBtn.classList.toggle('active', nextMode === 'board');
        boardViewBtn.setAttribute('aria-pressed', nextMode === 'board' ? 'true' : 'false');
    }

    if (persist) localStorage.setItem(VIEW_MODE_STORAGE_KEY, nextMode);
    if (!skipLayout) layoutAllTasks();
}

function getActiveBoardWrapper() {
    if (state.viewMode === 'board') return document.getElementById('kanbanWrapper');
    return document.querySelector('.timeline-wrapper');
}

document.addEventListener('DOMContentLoaded', async () => {
    const auth = window.OrbitAuth;
    if (!auth) {
        window.location.href = '/signin/signin.html';
        return;
    }
    const user = await auth.requireAuth('/signin/signin.html');
    if (!user) return;
    state.settings = loadBoardSettings();
    state.viewMode = loadBoardViewMode();
    await loadState();
    initStarField();
    initPageTransitions();
    setupEventListeners();
    setBoardViewMode(state.viewMode, { persist: false, skipLayout: true });
    renderProjects();
    updateUIAfterProjectSwitch();
});

function initStarField() {
    const starField = document.getElementById('starField');
    if (!starField) return;

    const stars = [];
    const NUM_STARS = 180;
    for (let i = 0; i < NUM_STARS; i++) {
        const star = document.createElement('div');
        star.className = 'star';
        const size = Math.random() * 2.2 + 0.4;
        const depth = Math.random();
        star.style.width = `${size}px`;
        star.style.height = `${size}px`;
        star.style.top = `${Math.random() * 100}%`;
        star.style.left = `${Math.random() * 100}%`;
        star.style.opacity = 0.2 + depth * 0.6;
        star.style.animation = `twinkle ${3 + Math.random() * 4}s ${Math.random() * 5}s ease-in-out infinite`;
        star._factor = 0.015 + depth * 0.04;
        starField.appendChild(star);
        stars.push(star);
    }

    let localMouseX = window.innerWidth / 2;
    let localMouseY = window.innerHeight / 2;
    let curX = localMouseX;
    let curY = localMouseY;
    let scrollY = window.scrollY;

    document.addEventListener('mousemove', (e) => {
        localMouseX = e.clientX;
        localMouseY = e.clientY;
    }, { passive: true });

    document.addEventListener('scroll', () => {
        scrollY = window.scrollY;
    }, { passive: true });

    function animateStars() {
        curX += (localMouseX - curX) * 0.04;
        curY += (localMouseY - curY) * 0.04;
        const dx = curX - window.innerWidth / 2;
        const dy = curY - window.innerHeight / 2;

        for (const star of stars) {
            const offsetX = dx * star._factor;
            const offsetY = dy * star._factor - scrollY * star._factor * 0.5;
            star.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
        }
        requestAnimationFrame(animateStars);
    }
    animateStars();
}

function isWeekendDate(dateISO) {
    const day = fromISODate(dateISO).getDay();
    return day === 0 || day === 6;
}

function formatHourTick(hour) {
    if (state.settings?.timeline?.hourFormat === '12') {
        const suffix = hour >= 12 ? 'PM' : 'AM';
        const adjusted = hour % 12 === 0 ? 12 : hour % 12;
        return `${adjusted}:00 ${suffix}`;
    }
    return `${String(hour).padStart(2, '0')}:00`;
}

function buildTimelineDates(taskDates) {
    const timeline = state.settings?.timeline || getDefaultBoardSettings().timeline;
    const todayISO = getTodayISO();
    const cleanedTaskDates = taskDates.filter(isISODate);
    let dates = [];
    const hasExplicitRange = isISODate(timeline.startDate) && isISODate(timeline.endDate) && timeline.startDate <= timeline.endDate;

    if (hasExplicitRange) {
        let cur = fromISODate(timeline.startDate);
        const end = fromISODate(timeline.endDate);
        while (cur <= end) {
            dates.push(toISODate(cur));
            cur.setDate(cur.getDate() + 1);
        }
    } else if (cleanedTaskDates.length > 0) {
        const dateSet = new Set([todayISO, ...cleanedTaskDates]);
        const sortedDates = [...dateSet].sort();
        let cur = fromISODate(sortedDates[0]);
        const end = fromISODate(sortedDates[sortedDates.length - 1]);
        while (cur <= end) {
            dates.push(toISODate(cur));
            cur.setDate(cur.getDate() + 1);
        }
    } else {
        const today = fromISODate(todayISO);
        const offset = timeline.weekStart === 'sun' ? today.getDay() : (today.getDay() + 6) % 7;
        const start = new Date(today);
        start.setDate(today.getDate() - offset);
        const totalDays = timeline.showWeekends ? 7 : 5;
        for (let i = 0; i < totalDays; i++) {
            const cur = new Date(start);
            cur.setDate(start.getDate() + i);
            dates.push(toISODate(cur));
        }
    }

    if (!timeline.showWeekends && !hasExplicitRange) {
        dates = dates.filter((dateISO) => !isWeekendDate(dateISO));
    }
    if (dates.length === 0) dates = [todayISO];
    return dates;
}

function initTimeline(taskDates = []) {
    const daysGrid = document.getElementById('daysGrid');
    const hoursScale = document.getElementById('hoursScale');
    const timeRangeLabel = document.querySelector('.time-range-label');
    const todayISO = getTodayISO();

    daysGrid.innerHTML = '';
    hoursScale.innerHTML = '';

    for (let i = 0; i < DAY_HOURS; i++) {
        const h = document.createElement('div');
        h.className = 'hour-tick';
        h.textContent = formatHourTick(i);
        hoursScale.appendChild(h);
    }

    const allDates = buildTimelineDates(taskDates);
    const dayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
    const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short' });

    allDates.forEach((dateISO) => {
        const d = fromISODate(dateISO);
        const isToday = dateISO === todayISO;

        const row = document.createElement('div');
        row.className = isToday ? 'day-row today-row' : 'day-row';

        const label = document.createElement('div');
        label.className = isToday ? 'day-label today-label' : 'day-label';

        const dayName = document.createElement('div');
        dayName.className = 'day-name';
        dayName.textContent = dayFormatter.format(d).toUpperCase();

        const dayNum = document.createElement('div');
        dayNum.className = 'day-num';
        dayNum.textContent = d.getDate().toString().padStart(2, '0');

        label.appendChild(dayName);
        label.appendChild(dayNum);
        if (isToday) {
            const dot = document.createElement('div');
            dot.className = 'today-dot';
            label.appendChild(dot);
        }

        const lane = document.createElement('div');
        lane.className = 'task-lane';
        lane.dataset.date = dateISO;

        row.appendChild(label);
        row.appendChild(lane);
        daysGrid.appendChild(row);
    });

    if (allDates.length === 0) {
        timeRangeLabel.textContent = '—';
        return;
    }

    const first = fromISODate(allDates[0]);
    const last = fromISODate(allDates[allDates.length - 1]);
    const fmt = (d) => `${dayFormatter.format(d).toUpperCase()} ${d.getDate().toString().padStart(2, '0')} ${monthFormatter.format(d).toUpperCase()}`;
    timeRangeLabel.textContent = allDates.length === 1 ? fmt(first) : `${fmt(first)} - ${fmt(last)}`;
}

function initPageTransitions() {
    document.body.classList.remove('fade-out');
    document.querySelectorAll('.breadcrumb').forEach((el) => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            document.body.classList.add('fade-out');
            setTimeout(() => { document.body.classList.remove('fade-out'); }, 300);
        });
    });
}
function setupEventListeners() {
    document.getElementById('addTaskBtn').addEventListener('click', () => {
        const firstDay = document.querySelector('.task-lane')?.dataset.date || getTodayISO();
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

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.context-menu')) hideContextMenus();
        const renamePopup = document.getElementById('renamePopup');
        if (renamePopup && renamePopup.style.display === 'block' && !e.target.closest('#renamePopup')) {
            renamePopup.style.display = 'none';
        }
    });

    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);
    document.addEventListener('keydown', handleGlobalKeyDown);

    document.getElementById('pmenuSettings').addEventListener('click', openProjectSettings);
    document.getElementById('pmenuStar').addEventListener('click', toggleProjectStar);
    document.getElementById('pmenuDelete').addEventListener('click', confirmDeleteProject);

    document.getElementById('renameCancelBtn').addEventListener('click', () => {
        document.getElementById('renamePopup').style.display = 'none';
    });
    document.getElementById('renameConfirmBtn').addEventListener('click', renameProjectFromPopup);

    document.getElementById('menuEdit').addEventListener('click', () => {
        hideContextMenus();
        if (currentContextTaskData) openTaskModal(currentContextTaskData);
    });
    document.getElementById('menuDelete').addEventListener('click', () => {
        hideContextMenus();
        if (currentContextTaskData) {
            currentTaskData = currentContextTaskData;
            deleteTask();
        }
    });

    const menuStatusMap = [
        { id: 'menuStatusNotStarted', status: 'Not Started' },
        { id: 'menuStatusInProgress', status: 'In Progress' },
        { id: 'menuStatusDone', status: 'Done' },
        { id: 'menuStatusDropped', status: 'Dropped' }
    ];
    menuStatusMap.forEach((entry) => {
        const el = document.getElementById(entry.id);
        if (!el) return;
        el.addEventListener('click', () => {
            hideContextMenus();
            if (currentContextTaskData) switchTaskStatus(currentContextTaskData.id, entry.status);
        });
    });

    const searchInput = document.getElementById('taskSearchInput');
    const statusFilter = document.getElementById('taskStatusFilter');
    const memberFilter = document.getElementById('taskMemberFilter');
    const timelineViewBtn = document.getElementById('timelineViewBtn');
    const boardViewBtn = document.getElementById('boardViewBtn');
    const timelineContainer = document.querySelector('.timeline-container');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            state.filters.text = e.target.value.trim().toLowerCase();
            layoutAllTasks();
        });
    }
    if (statusFilter) {
        statusFilter.addEventListener('change', (e) => {
            state.filters.status = e.target.value;
            layoutAllTasks();
        });
    }
    if (memberFilter) {
        memberFilter.addEventListener('change', (e) => {
            state.filters.member = e.target.value;
            layoutAllTasks();
        });
    }
    if (timelineViewBtn) {
        timelineViewBtn.addEventListener('click', () => setBoardViewMode('timeline'));
    }
    if (boardViewBtn) {
        boardViewBtn.addEventListener('click', () => setBoardViewMode('board'));
    }

    if (timelineContainer) {
        timelineContainer.addEventListener('wheel', (e) => {
            if (!e.shiftKey) return;
            timelineContainer.scrollLeft += e.deltaY;
            e.preventDefault();
        }, { passive: false });
    }

    syncSidebarProfile();

    const profileCard = document.getElementById('profileCard');
    if (profileCard) {
        profileCard.addEventListener('click', (e) => {
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            navigateTo('../setting/setting.html#tab-account');
        });
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm('Sign out of Orbit?')) {
                if (window.OrbitAuth) {
                    await window.OrbitAuth.signOut({
                        redirectTo: '/landing',
                    });
                    window.location.replace('/landing');
                } else {
                    window.location.href = '/landing';
                }
            }
        });
    }

    document.getElementById('taskStatusSelect').addEventListener('change', updateSelectColor);
    window.addEventListener('storage', (e) => {
        if (e.key === 'orbitSettings') {
            state.settings = loadBoardSettings();
            syncSidebarProfile();
            layoutAllTasks();
        }
    });
}

function getFocusableElements(container) {
    return Array.from(container.querySelectorAll('a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'))
        .filter((el) => el.offsetParent !== null);
}

function handleGlobalKeyDown(e) {
    if (e.key === 'Escape') {
        if (activeModal) {
            closeModals();
            e.preventDefault();
            return;
        }
        const detailModal = document.getElementById('taskDetailModal');
        if (detailModal) {
            detailModal.remove();
            e.preventDefault();
            return;
        }
        const renamePopup = document.getElementById('renamePopup');
        if (renamePopup && renamePopup.style.display === 'block') {
            renamePopup.style.display = 'none';
            e.preventDefault();
        }
    }

    if (activeModal && e.key === 'Tab') {
        const focusable = getFocusableElements(activeModal);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!e.shiftKey && document.activeElement === last) {
            first.focus();
            e.preventDefault();
        } else if (e.shiftKey && document.activeElement === first) {
            last.focus();
            e.preventDefault();
        }
    }
}

function updateSelectColor(e) {
    const sel = e.target;
    sel.dataset.value = sel.value;
    const statusColors = {
        'Not Started': '#000000',
        'In Progress': '#0d1a2e',
        'Done': '#0a1a0d',
        'Dropped': '#1a0a0a'
    };
    if (statusColors[sel.value] !== undefined) {
        sel.style.backgroundColor = statusColors[sel.value];
    }
}

function applySelectColors() {
    document.querySelectorAll('.modal-content select').forEach((sel) => {
        sel.dataset.value = sel.value;
    });
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    lastFocusedElement = document.activeElement;
    activeModal = modal;
    modal.style.display = 'flex';

    const content = modal.querySelector('.modal-content');
    if (content) {
        content.classList.remove('animate-in');
        void content.offsetWidth;
        content.classList.add('animate-in');
        const firstInput = content.querySelector('input, textarea, select, button');
        if (firstInput) firstInput.focus();
    }
    applySelectColors();
}

function closeModals() {
    document.querySelectorAll('.modal-overlay').forEach((m) => { m.style.display = 'none'; });
    currentTaskData = null;
    currentContextMenuProjectId = null;
    activeModal = null;
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
        lastFocusedElement.focus();
    }
    lastFocusedElement = null;
}

function showCustomConfirm({ title, message, onOk, onCancel }) {
    const modal = document.getElementById('customConfirmModal');
    document.getElementById('customConfirmTitle').textContent = title;
    document.getElementById('customConfirmMessage').textContent = message;

    const okBtn = document.getElementById('customConfirmOk');
    const cancelBtn = document.getElementById('customConfirmCancel');
    const closeBtn = document.getElementById('customConfirmClose');

    const cleanup = () => {
        modal.style.display = 'none';
        okBtn.onclick = null;
        cancelBtn.onclick = null;
        closeBtn.onclick = null;
        activeModal = null;
        if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
            lastFocusedElement.focus();
        }
        lastFocusedElement = null;
    };

    okBtn.onclick = () => { if (onOk) onOk(); cleanup(); };
    cancelBtn.onclick = () => { if (onCancel) onCancel(); cleanup(); };
    closeBtn.onclick = () => { if (onCancel) onCancel(); cleanup(); };

    lastFocusedElement = document.activeElement;
    activeModal = modal;
    modal.style.display = 'flex';
    okBtn.focus();
}

function hexToRgba(hex, alpha = 1) {
    if (!hex || !/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
        return 'rgba(255, 255, 255, 0.1)';
    }
    let c = hex.substring(1).split('');
    if (c.length === 3) c = [c[0], c[0], c[1], c[1], c[2], c[2]];
    const num = Number(`0x${c.join('')}`);
    return `rgba(${[(num >> 16) & 255, (num >> 8) & 255, num & 255].join(',')},${alpha})`;
}

function openProjectSettings() {
    const isNew = !currentContextMenuProjectId;
    const project = isNew ? null : state.projects.find((p) => p.id === currentContextMenuProjectId);

    document.getElementById('settingsModalTitle').textContent = isNew ? 'New Project Settings' : 'Project Settings';
    document.getElementById('projectNameInput').value = isNew ? 'New Cosmic Project' : project.name;
    document.getElementById('projectBackgroundInput').value = isNew ? '' : (project.background || '');

    const membersList = document.getElementById('projectMembersList');
    membersList.innerHTML = '';
    const membersToRender = isNew ? [{ name: 'Captain', color: '#6e56cf' }] : project.members;
    membersToRender.forEach((member) => renderMemberRow(member));

    openModal('projectSettingsModal');
}

function renderMemberRow(member = { name: '', color: '#ffffff' }) {
    const membersList = document.getElementById('projectMembersList');
    const memberRow = document.createElement('div');
    memberRow.className = 'member-row';

    const colorWrap = document.createElement('div');
    colorWrap.className = 'color-picker-wrap';

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'member-color-input';
    colorInput.value = sanitizeMember(member, 0).color;

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'color-confirm-btn';
    confirmBtn.title = 'Confirm color';
    confirmBtn.textContent = '✓';
    confirmBtn.style.background = colorInput.value;

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'member-name-input';
    nameInput.placeholder = 'Member name...';
    nameInput.value = sanitizeText(member.name, 40);
    nameInput.maxLength = 40;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn-remove-member';
    removeBtn.textContent = '✕';

    colorWrap.appendChild(colorInput);
    colorWrap.appendChild(confirmBtn);
    memberRow.appendChild(colorWrap);
    memberRow.appendChild(nameInput);
    memberRow.appendChild(removeBtn);
    membersList.appendChild(memberRow);

    colorInput.addEventListener('input', () => {
        confirmBtn.style.background = colorInput.value;
        confirmBtn.style.transform = 'scale(1.12)';
    });
    colorInput.addEventListener('change', () => {
        confirmBtn.style.transform = 'scale(1)';
    });
    confirmBtn.addEventListener('click', () => {
        confirmBtn.style.background = colorInput.value;
        confirmBtn.style.boxShadow = `0 0 12px ${colorInput.value}99`;
        confirmBtn.style.transform = 'scale(0.92)';
        setTimeout(() => {
            confirmBtn.style.transform = 'scale(1)';
            confirmBtn.style.boxShadow = '';
        }, 200);
    });
    removeBtn.addEventListener('click', () => memberRow.remove());
}

function saveProjectSettings() {
    const isNew = !state.projects.some((p) => p.id === currentContextMenuProjectId);
    const nameInput = document.getElementById('projectNameInput');
    const bgInput = document.getElementById('projectBackgroundInput');

    const projectName = sanitizeText(nameInput.value, 80);
    if (!projectName) {
        showCustomConfirm({ title: 'Validation Error', message: 'Project name is required.' });
        nameInput.focus();
        return;
    }

    const background = sanitizeImageUrl(bgInput.value);
    if (bgInput.value.trim() && !background) {
        showCustomConfirm({ title: 'Validation Error', message: 'Background URL must be a valid http(s) or image data URL.' });
        bgInput.focus();
        return;
    }

    const members = [];
    document.querySelectorAll('#projectMembersList .member-row').forEach((row) => {
        const rawName = row.querySelector('.member-name-input').value;
        const rawColor = row.querySelector('.member-color-input').value;
        const memberName = sanitizeText(rawName, 40);
        if (!memberName) return;
        members.push(sanitizeMember({ name: memberName, color: rawColor }, members.length));
    });

    if (isNew) {
        state.projects.forEach((p) => { p.active = false; });
        state.projects.push({
            id: currentContextMenuProjectId || `proj-${Date.now()}`,
            name: projectName,
            active: true,
            background,
            members,
            tasks: []
        });
    } else {
        const project = state.projects.find((p) => p.id === currentContextMenuProjectId);
        if (project) {
            project.name = projectName;
            project.background = background;
            project.members = members;
            project.tasks = Array.isArray(project.tasks) ? project.tasks : [];
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
    if (!activeProject || !Array.isArray(activeProject.members)) return;

    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = 'Unassigned';
    select.appendChild(emptyOpt);

    activeProject.members.forEach((member) => {
        const opt = document.createElement('option');
        opt.value = member.name;
        opt.textContent = member.name;
        select.appendChild(opt);
    });
}

function populateTaskFilterMembers(activeProject) {
    const select = document.getElementById('taskMemberFilter');
    if (!select) return;
    const currentValue = select.value || 'All';
    select.innerHTML = '';

    const allOpt = document.createElement('option');
    allOpt.value = 'All';
    allOpt.textContent = 'All Members';
    select.appendChild(allOpt);

    if (activeProject && Array.isArray(activeProject.members)) {
        activeProject.members.forEach((member) => {
            const opt = document.createElement('option');
            opt.value = member.name;
            opt.textContent = member.name;
            select.appendChild(opt);
        });
    }

    if ([...select.options].some((opt) => opt.value === currentValue)) {
        select.value = currentValue;
        state.filters.member = currentValue;
    } else {
        select.value = 'All';
        state.filters.member = 'All';
    }
}

function openTaskModal(taskData = null, isNew = false, day = null) {
    const activeProject = state.projects.find((p) => p.active);
    if (!activeProject) {
        showCustomConfirm({ title: 'No Active Project', message: 'Create a project before adding tasks.' });
        return;
    }

    populateMemberSelect(activeProject);

    document.getElementById('deleteBtn').style.display = taskData ? 'block' : 'none';
    document.getElementById('modalTitle').textContent = taskData ? 'Edit Task' : 'New Task';
    currentTaskData = taskData;

    if (taskData) {
        const startDate = isISODate(taskData.startDate) ? taskData.startDate : (isISODate(taskData.date) ? taskData.date : getTodayISO());
        const startTime = isTimeValue(taskData.startTime) ? taskData.startTime : leftToTime(taskData.left);
        const endDate = isISODate(taskData.endDate) ? taskData.endDate : startDate;
        const endTime = isTimeValue(taskData.endTime) ? taskData.endTime : leftToTime(taskData.left + taskData.width);

        document.getElementById('taskInput').value = taskData.name || '';
        document.getElementById('taskStartAtInput').value = toDateTimeLocal(startDate, startTime);
        document.getElementById('taskEndAtInput').value = toDateTimeLocal(endDate, endTime);
        document.getElementById('taskStatusSelect').value = taskData.status || 'Not Started';
        document.getElementById('taskPrioritySelect').value = taskData.priority || 'Medium';
        document.getElementById('taskNote').value = taskData.note || '';
        document.getElementById('taskImageUrl').value = taskData.image || '';
        document.getElementById('taskMembersSelect').value = taskData.memberName || '';
    } else {
        const startDate = isISODate(day) ? day : getTodayISO();
        const startTime = getQuarterRoundedNowTime();
        const defaultDurationHours = state.settings?.timeline?.defaultDuration || 2;
        const { endDate, endTime } = computeEndDateTime(startDate, startTime, defaultDurationHours);

        document.getElementById('taskInput').value = '';
        document.getElementById('taskStartAtInput').value = toDateTimeLocal(startDate, startTime);
        document.getElementById('taskEndAtInput').value = toDateTimeLocal(endDate, endTime);
        document.getElementById('taskStatusSelect').value = 'Not Started';
        document.getElementById('taskPrioritySelect').value = 'Medium';
        document.getElementById('taskNote').value = '';
        document.getElementById('taskImageUrl').value = '';
        document.getElementById('taskMembersSelect').value = '';
    }

    openModal('taskModal');
}

function validateTaskPayload(payload, activeProject) {
    const errors = [];
    if (!payload.name) errors.push('Task name is required.');
    if (!isISODate(payload.startDate)) errors.push('Please select a valid start date.');
    if (!isTimeValue(payload.startTime)) errors.push('Please select a valid start time.');
    if (!isISODate(payload.endDate)) errors.push('Please select a valid end date.');
    if (!isTimeValue(payload.endTime)) errors.push('Please select a valid end time.');
    if (!TASK_STATUSES.includes(payload.status)) errors.push('Invalid task status.');
    if (!TASK_PRIORITIES.includes(payload.priority)) errors.push('Invalid task priority.');
    if (payload.imageInput && !payload.image) errors.push('Image URL must be a valid http(s) or image data URL.');

    if (errors.length === 0) {
        const start = new Date(`${payload.startDate}T${payload.startTime}:00`);
        const end = new Date(`${payload.endDate}T${payload.endTime}:00`);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            errors.push('Invalid task schedule.');
        } else if (end <= start) {
            errors.push('End date/time must be after start date/time.');
        }
    }

    const hasMember = payload.memberName && activeProject.members.some((m) => m.name === payload.memberName);
    if (payload.memberName && !hasMember) errors.push('Selected member is not part of this project.');
    return errors;
}

function saveTask() {
    const activeProject = state.projects.find((p) => p.active);
    if (!activeProject) return;

    const name = sanitizeText(document.getElementById('taskInput').value, 120);
    const startAtRaw = document.getElementById('taskStartAtInput').value;
    const endAtRaw = document.getElementById('taskEndAtInput').value;
    const startAt = parseDateTimeLocal(startAtRaw);
    const endAt = parseDateTimeLocal(endAtRaw);
    const startDate = startAt ? startAt.date : '';
    const startTime = startAt ? startAt.time : '';
    const endDate = endAt ? endAt.date : '';
    const endTime = endAt ? endAt.time : '';
    const status = document.getElementById('taskStatusSelect').value;
    const priority = document.getElementById('taskPrioritySelect').value;
    const memberName = sanitizeText(document.getElementById('taskMembersSelect').value, 40);
    const note = sanitizeNote(document.getElementById('taskNote').value);
    const imageInput = document.getElementById('taskImageUrl').value.trim();
    const image = sanitizeImageUrl(imageInput);
    const defaultDurationHours = state.settings?.timeline?.defaultDuration || 2;
    const maxWidth = state.hourWidth * DAY_HOURS;
    const fallbackLeft = currentTaskData ? currentTaskData.left : 48;
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);

    let left = clamp(startMinutes !== null ? timeToLeft(startTime) : fallbackLeft, 0, maxWidth);
    let width = state.hourWidth * defaultDurationHours;
    if (startMinutes !== null && endMinutes !== null) {
        if (startDate === endDate) {
            const durationMinutes = Math.max(15, endMinutes - startMinutes);
            width = (durationMinutes / 60) * state.hourWidth;
        } else {
            width = maxWidth - left;
        }
    } else if (currentTaskData) {
        width = currentTaskData.width;
    }
    width = clamp(width, state.hourWidth * 0.25, Math.max(state.hourWidth * 0.25, maxWidth - left));

    const payload = {
        id: currentTaskData ? currentTaskData.id : `task-${Date.now()}`,
        name,
        date: startDate,
        startDate,
        startTime,
        endDate,
        endTime,
        status,
        priority,
        dueTime: endTime,
        memberName,
        note,
        image,
        imageInput,
        left,
        width
    };

    const errors = validateTaskPayload(payload, activeProject);
    if (errors.length > 0) {
        showCustomConfirm({ title: 'Validation Error', message: errors[0] });
        if (errors[0] === 'Task name is required.') {
            document.getElementById('taskInput').focus();
        } else if (errors[0] === 'Please select a valid start date.' || errors[0] === 'Please select a valid start time.') {
            document.getElementById('taskStartAtInput').focus();
        } else if (errors[0] === 'Please select a valid end date.') {
            document.getElementById('taskEndAtInput').focus();
        } else if (errors[0] === 'Please select a valid end time.' || errors[0] === 'End date/time must be after start date/time.') {
            document.getElementById('taskEndAtInput').focus();
        }
        return;
    }

    payload.left = clamp(payload.left, 0, maxWidth);
    payload.width = clamp(payload.width, state.hourWidth * 0.25, Math.max(state.hourWidth * 0.25, maxWidth - payload.left));

    const idx = activeProject.tasks.findIndex((task) => task.id === payload.id);
    if (idx >= 0) {
        activeProject.tasks[idx] = { ...activeProject.tasks[idx], ...payload };
    } else {
        activeProject.tasks.push(payload);
    }

    saveState();
    layoutAllTasks();
    setTimeout(() => scrollToTaskSchedule(payload.startDate, payload.left), 40);
    closeModals();
}

function deleteTask() {
    if (!currentTaskData) return;
    showCustomConfirm({
        title: 'Delete Task',
        message: `Are you sure you want to delete "${currentTaskData.name}"? This action cannot be undone.`,
        onOk: () => {
            const activeProject = state.projects.find((p) => p.active);
            if (!activeProject) return;
            activeProject.tasks = activeProject.tasks.filter((task) => task.id !== currentTaskData.id);
            saveState();
            layoutAllTasks();
            closeModals();
        }
    });
}

function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Unable to read file.'));
        reader.readAsDataURL(file);
    });
}

async function handleFileSelect(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        showCustomConfirm({ title: 'Invalid File', message: 'Please choose an image file.' });
        e.target.value = '';
        return;
    }
    if (file.size > 2 * 1024 * 1024) {
        showCustomConfirm({ title: 'File Too Large', message: 'Please choose an image smaller than 2MB.' });
        e.target.value = '';
        return;
    }

    try {
        const dataUrl = await readFileAsDataURL(file);
        const targetInputId = e.target.id === 'taskImageFile' ? 'taskImageUrl' : 'projectBackgroundInput';
        document.getElementById(targetInputId).value = dataUrl;
    } catch (_) {
        showCustomConfirm({ title: 'Error', message: 'Could not load selected image.' });
    } finally {
        e.target.value = '';
    }
}
function formatDisplayTime(hourDecimal) {
    const hour = clamp(hourDecimal, 0, DAY_HOURS);
    const totalMinutes = Math.round(hour * 60);
    const hrs = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;

    if (state.settings?.timeline?.hourFormat === '12') {
        const suffix = hrs >= 12 ? 'PM' : 'AM';
        const adjusted = hrs % 12 === 0 ? 12 : hrs % 12;
        return `${adjusted}:${String(mins).padStart(2, '0')} ${suffix}`;
    }
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function calculateTimeString(left, width) {
    const maxWidth = state.hourWidth * DAY_HOURS;
    const safeLeft = clamp(left, 0, maxWidth);
    const safeWidth = clamp(width, state.hourWidth * 0.25, Math.max(state.hourWidth * 0.25, maxWidth - safeLeft));
    const startHour = safeLeft / state.hourWidth;
    const endHour = (safeLeft + safeWidth) / state.hourWidth;
    return `${formatDisplayTime(startHour)} - ${formatDisplayTime(endHour)}`;
}

function formatTaskSchedule(taskData) {
    const baseRange = calculateTimeString(taskData.left, taskData.width);
    const startDate = isISODate(taskData.startDate) ? taskData.startDate : taskData.date;
    const endDate = isISODate(taskData.endDate) ? taskData.endDate : startDate;
    if (startDate && endDate && startDate !== endDate) {
        return `${baseRange} (${startDate} -> ${endDate})`;
    }
    return baseRange;
}

function formatTaskDateTimeSummary(taskData) {
    const startDate = isISODate(taskData.startDate) ? taskData.startDate : taskData.date;
    const endDate = isISODate(taskData.endDate) ? taskData.endDate : startDate;
    const startTime = isTimeValue(taskData.startTime) ? taskData.startTime : leftToTime(taskData.left);
    const endTime = isTimeValue(taskData.endTime) ? taskData.endTime : leftToTime(taskData.left + taskData.width);
    return `${startDate} ${startTime} -> ${endDate} ${endTime}`;
}

function startResize(e, taskEl) {
    if (e.button !== 0) return;
    e.stopPropagation();
    resizingTask = taskEl;
    taskEl.dataset.startWidth = String(taskEl.offsetWidth);
    taskEl.dataset.mouseX = String(e.clientX);
    isResizing = true;
    resizeMoved = false;
    requestAnimationFrame(dragUpdateLoop);
}

function handleDragMove(e) {
    mouseX = e.clientX;
    mouseY = e.clientY;
    if (isDragging && draggingTask) {
        const pointerStartX = Number(draggingTask.dataset.pointerStartX);
        const pointerStartY = Number(draggingTask.dataset.pointerStartY);
        if (Number.isFinite(pointerStartX) && Number.isFinite(pointerStartY)) {
            if (Math.abs(mouseX - pointerStartX) > 3 || Math.abs(mouseY - pointerStartY) > 3) {
                draggingTask.dataset.suppressClick = '1';
                dragMoved = true;
            }
        }
    }
    if (isResizing && resizingTask) {
        const resizeStartX = Number(resizingTask.dataset.mouseX);
        if (Number.isFinite(resizeStartX) && Math.abs(mouseX - resizeStartX) > 2) {
            resizeMoved = true;
        }
    }
    if (isDragging || isResizing) touchMoved = true;
}

function getActiveTaskById(taskId) {
    const activeProject = state.projects.find((p) => p.active);
    if (!activeProject) return null;
    return activeProject.tasks.find((task) => task.id === taskId) || null;
}

function dragUpdateLoop() {
    const timelineSnapEnabled = state.settings?.timeline?.snapGrid !== false;
    const snapInterval = state.hourWidth * 0.25;
    const dayWidth = state.hourWidth * DAY_HOURS;

    if (isDragging && draggingTask) {
        let newLeft = mouseX - Number(draggingTask.dataset.startX);
        if (timelineSnapEnabled) newLeft = Math.round(newLeft / snapInterval) * snapInterval;
        const maxLeft = Math.max(0, dayWidth - draggingTask.offsetWidth);
        newLeft = clamp(newLeft, 0, maxLeft);

        draggingTask.style.left = `${newLeft}px`;
        const task = getActiveTaskById(draggingTask.dataset.id);
        const timeEl = draggingTask.querySelector('.time-estimate');
        if (timeEl) timeEl.textContent = calculateTimeString(newLeft, draggingTask.offsetWidth);
    }

    if (isResizing && resizingTask) {
        const diff = mouseX - Number(resizingTask.dataset.mouseX);
        const startWidth = Number(resizingTask.dataset.startWidth);
        let newWidth = startWidth + diff;

        const maxWidth = Math.max(state.hourWidth * 0.25, dayWidth - resizingTask.offsetLeft);
        newWidth = clamp(newWidth, state.hourWidth * 0.25, maxWidth);
        if (timelineSnapEnabled) {
            newWidth = Math.round(newWidth / snapInterval) * snapInterval;
            newWidth = clamp(newWidth, state.hourWidth * 0.25, maxWidth);
        }

        resizingTask.style.width = `${newWidth}px`;
        const task = getActiveTaskById(resizingTask.dataset.id);
        const timeEl = resizingTask.querySelector('.time-estimate');
        if (timeEl) timeEl.textContent = calculateTimeString(resizingTask.offsetLeft, newWidth);
    }

    if (isDragging || isResizing) {
        requestAnimationFrame(dragUpdateLoop);
    }
}

function handleDragEnd() {
    const activeProject = state.projects.find((p) => p.active);
    if (!activeProject) return;

    const dayWidth = state.hourWidth * DAY_HOURS;
    let needsLayout = false;

    if (isDragging && draggingTask && dragMoved) {
        draggingTask.style.zIndex = 2;
        const task = activeProject.tasks.find((t) => t.id === draggingTask.dataset.id);
        if (task) {
            task.left = clamp(draggingTask.offsetLeft, 0, Math.max(0, dayWidth - draggingTask.offsetWidth));
            task.startDate = isISODate(task.startDate) ? task.startDate : task.date;
            task.date = task.startDate;
            task.startTime = leftToTime(task.left);
            task.endDate = task.startDate;
            task.endTime = leftToTime(task.left + task.width);
            task.dueTime = task.endTime;
            needsLayout = true;
        }
    } else if (isDragging && draggingTask) {
        draggingTask.style.zIndex = 2;
    }

    if (isResizing && resizingTask && resizeMoved) {
        const task = activeProject.tasks.find((t) => t.id === resizingTask.dataset.id);
        if (task) {
            task.width = clamp(resizingTask.offsetWidth, state.hourWidth * 0.25, Math.max(state.hourWidth * 0.25, dayWidth - resizingTask.offsetLeft));
            task.endDate = isISODate(task.startDate) ? task.startDate : task.date;
            task.endTime = leftToTime(task.left + task.width);
            task.dueTime = task.endTime;
            needsLayout = true;
        }
    }

    isDragging = false;
    isResizing = false;
    dragMoved = false;
    resizeMoved = false;
    draggingTask = null;
    resizingTask = null;
    touchMoved = false;

    if (needsLayout) {
        saveState();
        layoutAllTasks();
    }
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
    document.querySelectorAll('.context-menu').forEach((menu) => {
        menu.style.display = 'none';
    });
}

function switchTaskStatus(taskId, nextStatus) {
    const activeProject = state.projects.find((p) => p.active);
    if (!activeProject || !TASK_STATUSES.includes(nextStatus)) return;
    const task = activeProject.tasks.find((item) => item.id === taskId);
    if (!task) return;
    task.status = nextStatus;
    saveState();
    layoutAllTasks();
}

function cycleTaskStatus(taskId) {
    const task = getActiveTaskById(taskId);
    if (!task) return;
    const idx = TASK_STATUSES.indexOf(task.status);
    const nextStatus = TASK_STATUSES[(idx + 1) % TASK_STATUSES.length];
    switchTaskStatus(taskId, nextStatus);
}

function renderTask(taskData) {
    const dayLane = document.querySelector(`.task-lane[data-date="${taskData.date}"]`);
    if (!dayLane) return;

    const activeProject = state.projects.find((p) => p.active);
    const member = activeProject.members.find((m) => m.name === taskData.memberName);

    const taskEl = document.createElement('div');
    taskEl.className = 'task-card';
    taskEl.dataset.id = taskData.id;
    taskEl.style.left = `${taskData.left}px`;
    taskEl.style.width = `${taskData.width}px`;
    taskEl.style.top = `${taskData.track * 45}px`;
    taskEl.tabIndex = 0;

    if (member && member.color) {
        taskEl.style.background = `linear-gradient(135deg, ${hexToRgba(member.color, 0.6)} 0%, ${hexToRgba(member.color, 0.4)} 100%)`;
    } else {
        taskEl.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.06) 100%)';
    }

    if (taskData.image) {
        const img = document.createElement('img');
        img.src = taskData.image;
        img.className = 'task-img';
        img.alt = 'task';
        taskEl.appendChild(img);
    }

    const nameEl = document.createElement('div');
    nameEl.className = 'task-name';
    nameEl.textContent = taskData.name;
    taskEl.appendChild(nameEl);

    const timeEl = document.createElement('div');
    timeEl.className = 'time-estimate';
    timeEl.textContent = formatTaskSchedule(taskData);
    taskEl.appendChild(timeEl);

    const statusEl = document.createElement('div');
    statusEl.className = 'status-indicator';
    statusEl.textContent = `${taskData.status} | ${taskData.priority}`;
    taskEl.appendChild(statusEl);

    const resizer = document.createElement('div');
    resizer.className = 'resizer';
    resizer.addEventListener('mousedown', (e) => startResize(e, taskEl));
    taskEl.appendChild(resizer);

    taskEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        currentContextTaskData = taskData;
        showContextMenu('contextMenu', e.pageX, e.pageY);
    });

    taskEl.addEventListener('click', (e) => {
        if (e.button !== 0) return;
        if (e.target.classList.contains('resizer')) return;
        if (taskEl.dataset.suppressClick === '1') {
            taskEl.dataset.suppressClick = '0';
            return;
        }
        openTaskModal(taskData);
    });

    taskEl.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (e.target.classList.contains('resizer')) return;
        draggingTask = taskEl;
        dragMoved = false;
        taskEl.dataset.startX = String(e.clientX - taskEl.offsetLeft);
        taskEl.dataset.pointerStartX = String(e.clientX);
        taskEl.dataset.pointerStartY = String(e.clientY);
        taskEl.dataset.suppressClick = '0';
        taskEl.style.zIndex = 10;
        isDragging = true;
        touchMoved = false;
        requestAnimationFrame(dragUpdateLoop);
    });

    taskEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            openTaskModal(taskData);
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            currentTaskData = taskData;
            deleteTask();
        } else if (e.key.toLowerCase() === 'e') {
            e.preventDefault();
            openTaskModal(taskData);
        } else if (e.key.toLowerCase() === 's') {
            e.preventDefault();
            cycleTaskStatus(taskData.id);
        }
    });

    taskEl.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        touchMoved = false;
        longPressOpened = false;
        const touch = e.touches[0];
        longPressTimer = setTimeout(() => {
            currentContextTaskData = taskData;
            showContextMenu('contextMenu', touch.clientX, touch.clientY);
            longPressOpened = true;
        }, 500);
    }, { passive: true });

    taskEl.addEventListener('touchmove', () => {
        touchMoved = true;
        if (longPressTimer) clearTimeout(longPressTimer);
    }, { passive: true });

    taskEl.addEventListener('touchend', () => {
        if (longPressTimer) clearTimeout(longPressTimer);
        if (!touchMoved && !longPressOpened) openTaskModal(taskData);
    });

    dayLane.appendChild(taskEl);
}

function sortTasksForBoard(tasks) {
    return [...tasks].sort((a, b) => {
        const aDate = isISODate(a.startDate) ? a.startDate : (isISODate(a.date) ? a.date : '9999-12-31');
        const bDate = isISODate(b.startDate) ? b.startDate : (isISODate(b.date) ? b.date : '9999-12-31');
        if (aDate !== bDate) return aDate.localeCompare(bDate);

        const aTime = isTimeValue(a.startTime) ? a.startTime : leftToTime(a.left);
        const bTime = isTimeValue(b.startTime) ? b.startTime : leftToTime(b.left);
        if (aTime !== bTime) return aTime.localeCompare(bTime);

        return String(a.name || '').localeCompare(String(b.name || ''));
    });
}

function openNewTaskForStatus(status) {
    const firstDay = document.querySelector('.task-lane')?.dataset.date || getTodayISO();
    openTaskModal(null, true, firstDay);
    if (!TASK_STATUSES.includes(status)) return;
    const statusSelect = document.getElementById('taskStatusSelect');
    if (!statusSelect) return;
    statusSelect.value = status;
    updateSelectColor({ target: statusSelect });
}

function createKanbanTaskCard(taskData, activeProject) {
    const member = activeProject.members.find((m) => m.name === taskData.memberName);
    const taskEl = document.createElement('article');
    taskEl.className = 'kanban-task-card';
    taskEl.dataset.id = taskData.id;
    taskEl.tabIndex = 0;
    taskEl.draggable = true;

    if (member && member.color) {
        taskEl.style.borderLeftColor = member.color;
        taskEl.style.background = `linear-gradient(135deg, ${hexToRgba(member.color, 0.42)} 0%, ${hexToRgba(member.color, 0.22)} 100%)`;
    }

    if (taskData.image) {
        const img = document.createElement('img');
        img.src = taskData.image;
        img.alt = 'task';
        img.className = 'kanban-task-img';
        taskEl.appendChild(img);
    }

    const title = document.createElement('div');
    title.className = 'kanban-task-title';
    title.textContent = taskData.name;
    taskEl.appendChild(title);

    const schedule = document.createElement('div');
    schedule.className = 'kanban-task-meta';
    schedule.textContent = formatTaskSchedule(taskData);
    taskEl.appendChild(schedule);

    const badges = document.createElement('div');
    badges.className = 'kanban-task-badges';

    const priority = document.createElement('span');
    const priorityClass = String(taskData.priority || 'medium').toLowerCase().replace(/\s+/g, '-');
    priority.className = `kanban-task-priority priority-${priorityClass}`;
    priority.textContent = String(taskData.priority || 'Medium');
    badges.appendChild(priority);

    if (taskData.memberName) {
        const memberBadge = document.createElement('span');
        memberBadge.className = 'kanban-task-chip';
        memberBadge.textContent = taskData.memberName;
        badges.appendChild(memberBadge);
    }

    const hasEndDate = isISODate(taskData.endDate);
    const hasEndTime = isTimeValue(taskData.endTime);
    if (hasEndDate || hasEndTime) {
        const dueBadge = document.createElement('span');
        dueBadge.className = 'kanban-task-chip due';
        if (hasEndDate && hasEndTime) {
            dueBadge.textContent = `Due ${taskData.endDate} ${taskData.endTime}`;
        } else if (hasEndDate) {
            dueBadge.textContent = `Due ${taskData.endDate}`;
        } else {
            dueBadge.textContent = `Due ${taskData.endTime}`;
        }
        badges.appendChild(dueBadge);
    }
    taskEl.appendChild(badges);

    const actions = document.createElement('div');
    actions.className = 'kanban-task-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'kanban-action-btn';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openTaskModal(taskData);
    });
    actions.appendChild(editBtn);

    taskEl.appendChild(actions);

    taskEl.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        openTaskModal(taskData);
    });
    taskEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        currentContextTaskData = taskData;
        showContextMenu('contextMenu', e.pageX, e.pageY);
    });
    taskEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            openTaskModal(taskData);
        } else if (e.key.toLowerCase() === 's') {
            e.preventDefault();
            cycleTaskStatus(taskData.id);
        }
    });
    taskEl.addEventListener('dragstart', (e) => {
        taskEl.classList.add('dragging');
        if (!e.dataTransfer) return;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', taskData.id);
    });
    taskEl.addEventListener('dragend', () => {
        taskEl.classList.remove('dragging');
    });

    return taskEl;
}

function renderKanban(filteredTasks, activeProject) {
    const container = document.getElementById('kanbanContainer');
    const timeRangeLabel = document.querySelector('.time-range-label');
    if (!container || !activeProject) return;

    container.textContent = '';
    if (timeRangeLabel) {
        const count = filteredTasks.length;
        timeRangeLabel.textContent = `BOARD ${count} TASK${count === 1 ? '' : 'S'}`;
    }

    const grouped = {};
    TASK_STATUSES.forEach((status) => { grouped[status] = []; });

    filteredTasks.forEach((task) => {
        const status = TASK_STATUSES.includes(task.status) ? task.status : 'Not Started';
        grouped[status].push(task);
    });

    TASK_STATUSES.forEach((status) => {
        const column = document.createElement('section');
        column.className = 'kanban-column';
        column.dataset.status = status;

        const header = document.createElement('div');
        header.className = 'kanban-column-header';

        const title = document.createElement('div');
        title.className = 'kanban-column-title';
        title.textContent = status;
        header.appendChild(title);

        const count = document.createElement('div');
        count.className = 'kanban-column-count';
        count.textContent = String(grouped[status].length);
        header.appendChild(count);

        column.appendChild(header);

        const list = document.createElement('div');
        list.className = 'kanban-task-list';
        const sorted = sortTasksForBoard(grouped[status]);
        if (sorted.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'kanban-column-empty';
            empty.textContent = 'No tasks';
            list.appendChild(empty);
        } else {
            sorted.forEach((task) => list.appendChild(createKanbanTaskCard(task, activeProject)));
        }
        column.appendChild(list);

        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'kanban-add-btn';
        addBtn.textContent = '+ Add Task';
        addBtn.addEventListener('click', () => openNewTaskForStatus(status));
        column.appendChild(addBtn);

        column.addEventListener('dragover', (e) => {
            e.preventDefault();
            column.classList.add('drag-over');
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        });
        column.addEventListener('dragleave', (e) => {
            if (!column.contains(e.relatedTarget)) column.classList.remove('drag-over');
        });
        column.addEventListener('drop', (e) => {
            e.preventDefault();
            column.classList.remove('drag-over');
            if (!e.dataTransfer) return;
            const taskId = e.dataTransfer.getData('text/plain');
            if (!taskId) return;
            switchTaskStatus(taskId, status);
        });

        container.appendChild(column);
    });
}

function renderProjects() {
    const projectList = document.getElementById('projectList');
    const addProjectEl = projectList.querySelector('.add-project');
    projectList.querySelectorAll('li:not(.add-project)').forEach((li) => li.remove());

    state.projects.forEach((project) => {
        const li = document.createElement('li');
        li.dataset.id = project.id;
        li.tabIndex = 0;
        if (project.active) li.className = 'active-project';
        if (project.starred) li.classList.add('starred');

        const dot = document.createElement('span');
        dot.className = 'dot';
        li.appendChild(dot);
        li.appendChild(document.createTextNode(` ${project.name}`));

        if (project.starred) {
            const badge = document.createElement('span');
            badge.className = 'star-badge';
            badge.textContent = '★';
            li.appendChild(badge);
        }

        li.addEventListener('click', (e) => {
            e.stopPropagation();
            switchProject(project.id);
        });

        li.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            openRenamePopup(project.id, li);
        });

        li.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            currentContextMenuProjectId = project.id;
            document.getElementById('pmenuStarIcon').textContent = project.starred ? '★' : '☆';
            document.getElementById('pmenuStarLabel').textContent = project.starred ? 'Unstar Project' : 'Mark as Starred';
            showContextMenu('projectContextMenu', e.pageX, e.pageY);
        });

        li.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                switchProject(project.id);
            } else if (e.key === 'F2') {
                e.preventDefault();
                openRenamePopup(project.id, li);
            }
        });

        projectList.insertBefore(li, addProjectEl);
    });
}

function openRenamePopup(projectId, anchorEl) {
    const popup = document.getElementById('renamePopup');
    const input = document.getElementById('renameInput');
    const project = state.projects.find((p) => p.id === projectId);
    if (!popup || !input || !project) return;

    currentContextMenuProjectId = projectId;
    input.value = project.name;
    const rect = anchorEl.getBoundingClientRect();
    popup.style.left = `${rect.left + window.scrollX + 16}px`;
    popup.style.top = `${rect.bottom + window.scrollY + 8}px`;
    popup.style.display = 'block';
    input.focus();
    input.select();
}

function renameProjectFromPopup() {
    const input = document.getElementById('renameInput');
    const popup = document.getElementById('renamePopup');
    const newName = sanitizeText(input.value, 80);
    if (!newName || !currentContextMenuProjectId) {
        popup.style.display = 'none';
        return;
    }

    const project = state.projects.find((p) => p.id === currentContextMenuProjectId);
    if (project) {
        project.name = newName;
        saveState();
        renderProjects();
        updateUIAfterProjectSwitch();
    }
    popup.style.display = 'none';
}

function toggleProjectStar() {
    const project = state.projects.find((p) => p.id === currentContextMenuProjectId);
    if (project) {
        project.starred = !project.starred;
        saveState();
        renderProjects();
    }
    hideContextMenus();
}

function confirmDeleteProject() {
    hideContextMenus();
    const project = state.projects.find((p) => p.id === currentContextMenuProjectId);
    if (!project) return;

    showCustomConfirm({
        title: 'Delete Project',
        message: `Delete "${project.name}"? This cannot be undone.`,
        onOk: () => {
            state.projects = state.projects.filter((p) => p.id !== currentContextMenuProjectId);
            if (state.projects.length > 0 && !state.projects.some((p) => p.active)) {
                state.projects[0].active = true;
            }
            saveState();
            renderProjects();
            updateUIAfterProjectSwitch();
        }
    });
}

function addNewProject(e) {
    if (e) e.stopPropagation();
    currentContextMenuProjectId = null;
    openProjectSettings();
}

function switchProject(id) {
    state.projects.forEach((p) => { p.active = p.id === id; });
    saveState();
    renderProjects();
    updateUIAfterProjectSwitch();
}
function syncSidebarProfile() {
    const raw = safeParseJSON(localStorage.getItem('orbitSettings'));
    const authUser = safeParseJSON(localStorage.getItem('authUser'));
    const settings = sanitizeBoardSettings(raw);
    const settingsDisplayName =
        raw && raw.account && typeof raw.account.displayName === 'string'
            ? sanitizeText(raw.account.displayName, 50)
            : '';
    const authDisplayName =
        authUser && typeof authUser === 'object'
            ? sanitizeText(
                (typeof authUser.fullName === 'string' && authUser.fullName.trim()) ||
                (typeof authUser.username === 'string' && authUser.username.trim()) ||
                (typeof authUser.email === 'string' ? authUser.email.split('@')[0] : ''),
                50,
            )
            : '';
    const displayName = authDisplayName || settingsDisplayName;
    const nameEl = document.getElementById('sidebarName');
    if (nameEl && displayName) {
        nameEl.textContent = displayName;
    }

    const avatarData = raw && raw.account && typeof raw.account.avatarDataUrl === 'string' ? sanitizeImageUrl(raw.account.avatarDataUrl) : '';
    if (avatarData) {
        const avatarEl = document.getElementById('sidebarAvatar');
        if (avatarEl) {
            avatarEl.textContent = '';
            const img = document.createElement('img');
            img.src = avatarData;
            img.alt = 'avatar';
            avatarEl.appendChild(img);
        }
    }
    state.settings = settings;
}

function openTaskDetail(taskData) {
    const activeProject = state.projects.find((p) => p.active);
    const member = activeProject?.members.find((m) => m.name === taskData.memberName);
    const memberColor = member?.color || '#6e56cf';

    const existing = document.getElementById('taskDetailModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'taskDetailModal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.55);backdrop-filter:blur(4px);';

    const panel = document.createElement('div');
    panel.style.cssText = 'background:linear-gradient(135deg,#0d0d1a 0%,#111128 100%);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:28px 28px 22px;min-width:320px;max-width:420px;width:90%;box-shadow:0 24px 64px rgba(0,0,0,0.7),0 0 0 1px rgba(255,255,255,0.05);position:relative;';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'position:absolute;top:12px;right:14px;cursor:pointer;color:#777;font-size:12px;line-height:1;border:none;background:transparent;';
    closeBtn.addEventListener('click', () => modal.remove());
    panel.appendChild(closeBtn);

    const accent = document.createElement('div');
    accent.style.cssText = `width:36px;height:3px;border-radius:2px;background:${memberColor};margin-bottom:16px;`;
    panel.appendChild(accent);

    if (taskData.image) {
        const img = document.createElement('img');
        img.src = taskData.image;
        img.alt = 'task';
        img.style.cssText = 'width:100%;border-radius:8px;margin-bottom:14px;max-height:140px;object-fit:cover;';
        panel.appendChild(img);
    }

    const title = document.createElement('div');
    title.textContent = taskData.name;
    title.style.cssText = 'font-size:18px;font-weight:700;color:#fff;margin-bottom:14px;line-height:1.3;';
    panel.appendChild(title);

    const meta = document.createElement('div');
    meta.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
    panel.appendChild(meta);

    const timeRow = document.createElement('div');
    timeRow.style.cssText = 'font-size:13px;color:rgba(255,255,255,0.75);';
    timeRow.textContent = `${formatTaskSchedule(taskData)} | ${formatTaskDateTimeSummary(taskData)}`;
    meta.appendChild(timeRow);

    const statusRow = document.createElement('div');
    statusRow.style.cssText = 'font-size:13px;color:rgba(255,255,255,0.75);';
    statusRow.textContent = `${taskData.status} | Priority ${taskData.priority}`;
    meta.appendChild(statusRow);

    if (taskData.memberName) {
        const memberRow = document.createElement('div');
        memberRow.style.cssText = 'font-size:13px;color:rgba(255,255,255,0.75);';
        memberRow.textContent = `Assignee: ${taskData.memberName}`;
        meta.appendChild(memberRow);
    }
    if (taskData.note) {
        const noteRow = document.createElement('div');
        noteRow.style.cssText = 'font-size:13px;color:rgba(255,255,255,0.75);line-height:1.5;';
        noteRow.textContent = taskData.note;
        meta.appendChild(noteRow);
    }

    const actionWrap = document.createElement('div');
    actionWrap.style.cssText = 'margin-top:16px;border-top:1px solid rgba(255,255,255,0.07);padding-top:14px;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;';
    panel.appendChild(actionWrap);

    ['Not Started', 'In Progress', 'Done'].forEach((status) => {
        const statusBtn = document.createElement('button');
        statusBtn.type = 'button';
        statusBtn.textContent = status;
        statusBtn.style.cssText = 'background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);color:#fff;padding:6px 10px;border-radius:8px;cursor:pointer;font-size:11px;';
        statusBtn.addEventListener('click', () => {
            switchTaskStatus(taskData.id, status);
            modal.remove();
        });
        actionWrap.appendChild(statusBtn);
    });

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = 'Edit Task';
    editBtn.style.cssText = 'background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#fff;padding:7px 16px;border-radius:8px;cursor:pointer;font-size:12px;';
    editBtn.addEventListener('click', () => {
        modal.remove();
        openTaskModal(taskData);
    });
    actionWrap.appendChild(editBtn);

    modal.appendChild(panel);
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

function applyTaskFilters(tasks) {
    const text = state.filters.text;
    const status = state.filters.status;
    const member = state.filters.member;
    return tasks.filter((task) => {
        if (status !== 'All' && task.status !== status) return false;
        if (member !== 'All' && task.memberName !== member) return false;
        if (!text) return true;
        const haystack = `${task.name} ${task.note} ${task.memberName} ${task.status}`.toLowerCase();
        return haystack.includes(text);
    });
}

function updateEmptyState(mode) {
    const wrapper = getActiveBoardWrapper();
    document.querySelectorAll('.board-empty-state').forEach((el) => {
        if (!wrapper || el.parentElement !== wrapper || !mode) {
            el.style.display = 'none';
        }
    });
    if (!wrapper) return;

    let empty = wrapper.querySelector('.board-empty-state');
    if (!empty) {
        empty = document.createElement('div');
        empty.className = 'board-empty-state';
        wrapper.appendChild(empty);
    }

    if (!mode) {
        empty.style.display = 'none';
        return;
    }

    empty.style.display = 'flex';
    empty.textContent = '';

    const title = document.createElement('div');
    title.className = 'empty-title';
    const sub = document.createElement('div');
    sub.className = 'empty-sub';

    if (mode === 'no-project') {
        title.textContent = 'No projects yet';
        sub.textContent = 'Use New Project in the sidebar to create your first project.';
    } else if (mode === 'no-results') {
        title.textContent = 'No matching tasks';
        sub.textContent = 'Adjust search or filters to see tasks.';
    } else {
        title.textContent = 'No tasks yet';
        sub.textContent = 'Create your first task using Add Task.';
    }

    empty.appendChild(title);
    empty.appendChild(sub);
}

function updateUIAfterProjectSwitch() {
    const activeProject = state.projects.find((p) => p.active);
    populateTaskFilterMembers(activeProject || null);

    if (!activeProject) {
        document.getElementById('projectName').textContent = '"No Project"';
        document.body.style.backgroundImage = 'none';
        document.getElementById('daysGrid').innerHTML = '';
        document.getElementById('hoursScale').innerHTML = '';
        const kanbanContainer = document.getElementById('kanbanContainer');
        if (kanbanContainer) kanbanContainer.innerHTML = '';
        document.querySelector('.time-range-label').textContent = '—';
        document.querySelector('.time-range-label').textContent = '\u2014';
        document.querySelectorAll('.task-card').forEach((task) => task.remove());
        document.querySelectorAll('.kanban-task-card').forEach((task) => task.remove());
        updateEmptyState('no-project');
        return;
    }

    document.getElementById('projectName').textContent = `"${activeProject.name}"`;
    document.body.style.backgroundImage = activeProject.background ? `url(${activeProject.background})` : 'none';
    layoutAllTasks();
}

function scrollToTaskSchedule(dateISO, left = 0) {
    const container = document.querySelector('.timeline-container');
    const lane = document.querySelector(`.task-lane[data-date="${dateISO}"]`);
    if (!container || !lane) return;

    const containerRect = container.getBoundingClientRect();
    const laneRect = lane.getBoundingClientRect();
    const targetTop = container.scrollTop + (laneRect.top - containerRect.top) - 32;
    container.scrollTop = Math.max(0, targetTop);
    container.scrollLeft = Math.max(0, left - state.hourWidth * 2);
}

function layoutAllTasks() {
    const activeProject = state.projects.find((p) => p.active);
    if (!activeProject) {
        updateEmptyState('no-project');
        return;
    }

    const allTasks = Array.isArray(activeProject.tasks) ? activeProject.tasks : [];
    const filteredTasks = applyTaskFilters(allTasks);
    if (state.viewMode === 'board') {
        renderKanban(filteredTasks, activeProject);
    } else {
        const taskDates = allTasks.flatMap((task) => [task.date, task.endDate]).filter(isISODate);
        initTimeline(taskDates);

        const tasksByDay = {};
        document.querySelectorAll('.task-lane').forEach((lane) => {
            tasksByDay[lane.dataset.date] = [];
        });

        filteredTasks.forEach((task) => {
            if (tasksByDay[task.date]) tasksByDay[task.date].push(task);
        });

        Object.keys(tasksByDay).forEach((date) => {
            const tasksForDay = tasksByDay[date].sort((a, b) => a.left - b.left);
            const tracks = [];
            tasksForDay.forEach((task) => {
                let placed = false;
                for (let i = 0; i < tracks.length; i++) {
                    const conflicts = tracks[i].some((t) => task.left < t.left + t.width && t.left < task.left + task.width);
                    if (!conflicts) {
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
            if (dayRow) {
                dayRow.style.minHeight = `${Math.max(90, tracks.length * 45 + 50)}px`;
            }
        });

        document.querySelectorAll('.task-card').forEach((task) => task.remove());
        filteredTasks.forEach((task) => renderTask(task));
    }

    if (filteredTasks.length === 0) {
        updateEmptyState(allTasks.length === 0 ? 'no-tasks' : 'no-results');
    } else {
        updateEmptyState(null);
    }

    if (state.viewMode === 'timeline' && !state.didInitialScroll) {
        const todayRow = document.querySelector('.today-row');
        if (todayRow) {
            setTimeout(() => todayRow.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
        }
        state.didInitialScroll = true;
    }
}
