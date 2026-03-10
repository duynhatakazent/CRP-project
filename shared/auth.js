(function (global) {
    'use strict';

    const API_BASE = resolveApiBase();
    const ACCESS_TOKEN_KEY = 'accessToken';
    const USER_PROFILE_KEY = 'authUser';
    const SETTINGS_KEY = 'orbitSettings';
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    function resolveApiBase() {
        const configured = global.OrbitConfig && typeof global.OrbitConfig.authApiBase === 'string'
            ? global.OrbitConfig.authApiBase
            : '';
        const normalized = configured.trim().replace(/\/+$/, '');
        if (normalized) {
            return normalized;
        }

        const hostname = String(global.location && global.location.hostname || '').toLowerCase();
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return 'http://localhost:3000/api/auth';
        }

        return 'https://api.nhanctm.site/api/auth';
    }

    function normalizeEmail(email) {
        return String(email || '').trim().toLowerCase();
    }

    function validateEmail(email) {
        return EMAIL_REGEX.test(normalizeEmail(email));
    }

    function validatePassword(password) {
        const value = String(password || '');
        const checks = {
            length: value.length >= 8,
            uppercase: /[A-Z]/.test(value),
            lowercase: /[a-z]/.test(value),
            number: /[0-9]/.test(value)
        };
        checks.valid = checks.length && checks.uppercase && checks.lowercase && checks.number;
        return checks;
    }

    function safeParseJSON(raw) {
        if (!raw || typeof raw !== 'string') {
            return null;
        }
        try {
            return JSON.parse(raw);
        } catch (_) {
            return null;
        }
    }

    function normalizeUser(user) {
        if (!user || typeof user !== 'object') {
            return null;
        }

        const id = typeof user.id === 'string' ? user.id.trim() : '';
        const email = normalizeEmail(user.email);
        if (!id || !validateEmail(email)) {
            return null;
        }

        const fullNameRaw = typeof user.fullName === 'string' ? user.fullName.trim() : '';
        const fullName = fullNameRaw.length > 0 ? fullNameRaw.slice(0, 120) : null;
        const username = fullName || email.split('@')[0];

        return {
            id,
            email,
            fullName,
            username
        };
    }

    function syncSettingsWithUser(user) {
        const normalizedUser = normalizeUser(user);
        if (!normalizedUser) {
            return;
        }

        const parsed = safeParseJSON(localStorage.getItem(SETTINGS_KEY));
        const settings = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        const account = settings.account && typeof settings.account === 'object' && !Array.isArray(settings.account)
            ? settings.account
            : {};

        settings.account = {
            ...account,
            displayName: normalizedUser.username,
            email: normalizedUser.email
        };

        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }

    function storeUser(user) {
        const normalizedUser = normalizeUser(user);
        if (!normalizedUser) {
            return null;
        }

        localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(normalizedUser));
        syncSettingsWithUser(normalizedUser);
        return normalizedUser;
    }

    function getStoredUser() {
        return normalizeUser(safeParseJSON(localStorage.getItem(USER_PROFILE_KEY)));
    }

    function clearUser() {
        localStorage.removeItem(USER_PROFILE_KEY);
    }

    function readToken() {
        return localStorage.getItem(ACCESS_TOKEN_KEY);
    }

    function isTokenExpired(token) {
        if (typeof token !== 'string' || token.length === 0) {
            return true;
        }

        const parts = token.split('.');
        if (parts.length < 2) {
            return false;
        }

        try {
            const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
            const payload = JSON.parse(atob(padded));
            if (!payload || typeof payload !== 'object' || typeof payload.exp !== 'number') {
                return false;
            }
            const nowInSeconds = Math.floor(Date.now() / 1000);
            return payload.exp <= nowInSeconds;
        } catch (_) {
            return false;
        }
    }

    function storeToken(token) {
        if (typeof token === 'string' && token.trim().length > 0) {
            localStorage.setItem(ACCESS_TOKEN_KEY, token.trim());
        }
    }

    function clearToken() {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
    }

    function getToken() {
        const token = readToken();
        if (!token) {
            return null;
        }
        if (isTokenExpired(token)) {
            clearToken();
            return null;
        }
        return token;
    }

    function resolveErrorMessage(body, status) {
        if (!body || typeof body !== 'object') {
            return `Request failed (${status})`;
        }

        if (typeof body.error === 'string' && body.error.trim().length > 0) {
            return body.error;
        }

        if (typeof body.message === 'string' && body.message.trim().length > 0) {
            return body.message;
        }

        if (Array.isArray(body.details)) {
            const detail = body.details.find((entry) => typeof entry === 'string' && entry.trim().length > 0);
            if (detail) {
                return detail;
            }
        }

        return `Request failed (${status})`;
    }

    async function apiRequest(path, opts) {
        const requestOptions = opts || {};
        const headers = { ...(requestOptions.headers || {}) };
        const token = getToken();
        const hasBody = requestOptions.body !== undefined && requestOptions.body !== null;
        const isFormDataPayload = typeof FormData !== 'undefined' && requestOptions.body instanceof FormData;

        if (!isFormDataPayload && hasBody && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(API_BASE + path, { ...requestOptions, headers });
        const body = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw {
                status: response.status,
                body,
                message: resolveErrorMessage(body, response.status)
            };
        }

        return body;
    }

    async function signIn(input) {
        try {
            const email = normalizeEmail(input && input.email);
            const password = String((input && input.password) || '');
            const res = await apiRequest('/login', {
                method: 'POST',
                body: JSON.stringify({ email, password })
            });

            if (res && res.requiresTwoFactor === true) {
                return {
                    ok: false,
                    requiresTwoFactor: true,
                    error: 'This account requires 2FA verification. The current page supports password-only login.'
                };
            }

            storeToken(res && res.accessToken);
            const user = storeUser(res && res.user ? res.user : null);
            return { ok: true, user };
        } catch (err) {
            return { ok: false, error: err && err.message ? err.message : 'Unable to sign in.' };
        }
    }

    async function registerUser(input) {
        try {
            const email = normalizeEmail(input && input.email);
            const password = String((input && input.password) || '');
            const fullName = String((input && input.fullName) || '').trim();

            const res = await apiRequest('/signup', {
                method: 'POST',
                body: JSON.stringify({
                    email,
                    password,
                    fullName: fullName || undefined
                })
            });

            return { ok: true, user: res && res.user ? res.user : null };
        } catch (err) {
            return { ok: false, error: err && err.message ? err.message : 'Unable to create account.' };
        }
    }

    async function getCurrentUser() {
        const token = getToken();
        if (!token) {
            return null;
        }

        try {
            const res = await apiRequest('/me', { method: 'GET' });
            if (res && typeof res === 'object' && res.user && typeof res.user === 'object') {
                return storeUser(res.user);
            }
            if (res && typeof res === 'object' && typeof res.id === 'string' && typeof res.email === 'string') {
                return storeUser(res);
            }
            return null;
        } catch (err) {
            if (err && (err.status === 401 || err.status === 403)) {
                clearToken();
                clearUser();
            }
            return null;
        }
    }

    async function requireAuth(redirectPath) {
        const token = getToken();
        const fallbackPath = redirectPath || '/signin/signin.html';

        if (!token) {
            window.location.href = fallbackPath;
            return null;
        }

        const user = await getCurrentUser();
        if (!user) {
            clearToken();
            window.location.href = fallbackPath;
            return null;
        }

        return user;
    }

    async function signOut(options) {
        const token = getToken();
        if (token) {
            try {
                await apiRequest('/logout', { method: 'POST' });
            } catch (_) {
                // ignore backend logout failure and clear local token regardless
            }
        }
        clearToken();
        clearUser();

        const redirectTo =
            options && typeof options === 'object' && typeof options.redirectTo === 'string'
                ? options.redirectTo.trim()
                : '/landing';
        window.location.replace(redirectTo || '/landing');
    }

    function startGoogleFlow() {
        window.location.href = API_BASE + '/google';
    }

    global.OrbitAuth = {
        validateEmail,
        validatePassword,
        signIn,
        registerUser,
        getCurrentUser,
        requireAuth,
        signOut,
        startGoogleFlow,
        storeToken,
        clearToken,
        storeUser,
        getStoredUser,
        getToken,
        apiBase: API_BASE
    };
})(window);
