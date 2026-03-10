(function (global) {
    'use strict';

    const DEFAULT_LOCAL_BASE = 'http://localhost:3002/api';

    function resolveTaskApiBase() {
        const configured = global.OrbitConfig && typeof global.OrbitConfig.taskApiBase === 'string'
            ? global.OrbitConfig.taskApiBase
            : '';
        const normalized = configured.trim().replace(/\/+$/, '');
        if (normalized) {
            return normalized;
        }

        const hostname = String(global.location && global.location.hostname || '').toLowerCase();
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return DEFAULT_LOCAL_BASE;
        }

        // On Vercel this is rewritten to api.nhanctm.site/api.
        return '/api';
    }

    function getToken() {
        if (global.OrbitAuth && typeof global.OrbitAuth.getToken === 'function') {
            return global.OrbitAuth.getToken();
        }

        const fallback = localStorage.getItem('accessToken');
        return typeof fallback === 'string' && fallback.trim() ? fallback.trim() : null;
    }

    function resolveErrorMessage(body, status) {
        if (!body || typeof body !== 'object') {
            return `Request failed (${status})`;
        }
        if (typeof body.message === 'string' && body.message.trim().length > 0) {
            return body.message;
        }
        if (typeof body.error === 'string' && body.error.trim().length > 0) {
            return body.error;
        }
        return `Request failed (${status})`;
    }

    async function request(path, options) {
        const token = getToken();
        if (!token) {
            throw { status: 401, message: 'Missing access token' };
        }

        const requestOptions = options || {};
        const headers = { ...(requestOptions.headers || {}) };
        const hasBody = requestOptions.body !== undefined && requestOptions.body !== null;

        if (hasBody && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }

        headers.Authorization = `Bearer ${token}`;

        const response = await fetch(API_BASE + path, {
            ...requestOptions,
            headers,
        });
        const body = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw {
                status: response.status,
                body,
                message: resolveErrorMessage(body, response.status),
            };
        }

        return body;
    }

    function toPageQuery(page, limit) {
        const qp = new URLSearchParams();
        if (Number.isInteger(page) && page > 0) qp.set('page', String(page));
        if (Number.isInteger(limit) && limit > 0) qp.set('limit', String(limit));
        const suffix = qp.toString();
        return suffix ? `?${suffix}` : '';
    }

    async function listWorkspaces(page, limit) {
        const body = await request(`/workspaces${toPageQuery(page, limit)}`, { method: 'GET' });
        return {
            data: Array.isArray(body && body.data) ? body.data : [],
            meta: body && body.meta ? body.meta : null,
        };
    }

    async function createWorkspace(payload) {
        const body = await request('/workspaces', {
            method: 'POST',
            body: JSON.stringify(payload || {}),
        });
        return body && body.data ? body.data : null;
    }

    async function ensureWorkspace(name) {
        const list = await listWorkspaces(1, 1);
        if (list.data.length > 0) {
            return list.data[0];
        }
        return createWorkspace({ name: String(name || 'My Workspace').slice(0, 120) || 'My Workspace' });
    }

    async function listProjects(workspaceId, page, limit) {
        const body = await request(`/workspaces/${encodeURIComponent(workspaceId)}/projects${toPageQuery(page, limit)}`, {
            method: 'GET',
        });
        return {
            data: Array.isArray(body && body.data) ? body.data : [],
            meta: body && body.meta ? body.meta : null,
        };
    }

    async function createProject(workspaceId, payload) {
        const body = await request(`/workspaces/${encodeURIComponent(workspaceId)}/projects`, {
            method: 'POST',
            body: JSON.stringify(payload || {}),
        });
        return body && body.data ? body.data : null;
    }

    async function updateProject(projectId, payload) {
        const body = await request(`/projects/${encodeURIComponent(projectId)}`, {
            method: 'PATCH',
            body: JSON.stringify(payload || {}),
        });
        return body && body.data ? body.data : null;
    }

    async function deleteProject(projectId) {
        const body = await request(`/projects/${encodeURIComponent(projectId)}`, {
            method: 'DELETE',
        });
        return body && typeof body === 'object' ? body : { success: true };
    }

    async function getBoard(projectId) {
        const body = await request(`/projects/${encodeURIComponent(projectId)}/board`, {
            method: 'GET',
        });
        return body && body.data ? body.data : null;
    }

    async function createTask(projectId, payload) {
        const body = await request(`/projects/${encodeURIComponent(projectId)}/tasks`, {
            method: 'POST',
            body: JSON.stringify(payload || {}),
        });
        return body && body.data ? body.data : null;
    }

    async function updateTask(taskId, payload) {
        const body = await request(`/tasks/${encodeURIComponent(taskId)}`, {
            method: 'PATCH',
            body: JSON.stringify(payload || {}),
        });
        return body && body.data ? body.data : null;
    }

    async function deleteTask(taskId) {
        const body = await request(`/tasks/${encodeURIComponent(taskId)}`, {
            method: 'DELETE',
        });
        return body && typeof body === 'object' ? body : { success: true };
    }

    async function moveTask(taskId, payload) {
        const body = await request(`/tasks/${encodeURIComponent(taskId)}/move`, {
            method: 'POST',
            body: JSON.stringify(payload || {}),
        });
        return body && body.data ? body.data : null;
    }

    const API_BASE = resolveTaskApiBase();

    global.OrbitTaskApi = {
        apiBase: API_BASE,
        getToken,
        request,
        listWorkspaces,
        createWorkspace,
        ensureWorkspace,
        listProjects,
        createProject,
        updateProject,
        deleteProject,
        getBoard,
        createTask,
        updateTask,
        deleteTask,
        moveTask,
    };
})(window);
