document.addEventListener('DOMContentLoaded', async () => {
    const auth = window.OrbitAuth;
    if (!auth) {
        window.location.href = '/signin/signin.html';
        return;
    }
    const user = await auth.requireAuth('/signin/signin.html');
    if (!user) {
        return;
    }

    function toProfile(input) {
        if (!input || typeof input !== 'object') return null;
        const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
        if (!email) return null;
        const fullName = typeof input.fullName === 'string' && input.fullName.trim()
            ? input.fullName.trim()
            : '';
        const username = typeof input.username === 'string' && input.username.trim()
            ? input.username.trim()
            : '';
        const displayName = fullName || username || email.split('@')[0];
        return {
            email,
            displayName,
            fullName: fullName || null
        };
    }

    const navIcons = document.querySelectorAll('.nav-menu .nav-icon');
    if (navIcons[0]) navIcons[0].textContent = '\u25CB';
    if (navIcons[1]) navIcons[1].textContent = '\u2699';
    const navChevron = document.querySelector('.nav-menu .chevron');
    if (navChevron) navChevron.textContent = '\u25BE';
    const saveIcon = document.querySelector('.save-icon');
    if (saveIcon) saveIcon.textContent = '\u2726';
    const rangePreviewEl = document.getElementById('rangePreview');
    if (rangePreviewEl) rangePreviewEl.textContent = '\u2014 days selected';
    const langSelectEl = document.getElementById('langSelect');
    if (langSelectEl) {
        const langMap = { vi: 'Tieng Viet', ja: 'Japanese', fr: 'Francais' };
        [...langSelectEl.options].forEach((opt) => {
            if (langMap[opt.value]) opt.textContent = langMap[opt.value];
        });
    }
    const uploadText = document.querySelector('label[for="bgUpload"] span');
    if (uploadText) uploadText.textContent = '\u2191 Upload';
    const exportBtnLabel = document.getElementById('exportBtn');
    if (exportBtnLabel) exportBtnLabel.textContent = 'Export \u2193';
    const durMinusBtn = document.getElementById('durMinus');
    if (durMinusBtn) durMinusBtn.textContent = '\u2212';
    const remMinusBtn = document.getElementById('remMinus');
    if (remMinusBtn) remMinusBtn.textContent = '\u2212';
    const avatarDisplay = document.getElementById('avatarDisplay');
    if (avatarDisplay && !avatarDisplay.querySelector('img')) avatarDisplay.textContent = '\u2726';

    const SETTINGS_KEY = 'orbitSettings';
    const PROJECTS_KEY = 'helloProjectsState';
    const LEGACY_TIMEZONE_MAP = {
        'UTC+7 (Ho Chi Minh)': 'Asia/Ho_Chi_Minh',
        'UTC+0 (London)': 'Europe/London',
        'UTC-5 (New York)': 'America/New_York',
        'UTC+9 (Tokyo)': 'Asia/Tokyo',
        'UTC+8 (Singapore)': 'Asia/Singapore'
    };

    const starField = document.getElementById('starField');
    const stars = [];
    const NUM_STARS = 160;

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

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let curX = mouseX;
    let curY = mouseY;
    document.addEventListener('mousemove', (e) => { mouseX = e.clientX; mouseY = e.clientY; });

    function animateStars() {
        curX += (mouseX - curX) * 0.04;
        curY += (mouseY - curY) * 0.04;
        const dx = curX - window.innerWidth / 2;
        const dy = curY - window.innerHeight / 2;
        for (const s of stars) {
            s.style.transform = `translate(${dx * s._factor}px, ${dy * s._factor}px)`;
        }
        requestAnimationFrame(animateStars);
    }
    animateStars();

    function activateTab(tabKey) {
        if (!tabKey) return false;
        const tabBtn = document.querySelector(`.tab[data-tab="${tabKey}"]`);
        const panel = document.getElementById(`tab-${tabKey}`);
        if (!tabBtn || !panel) return false;
        document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
        document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
        tabBtn.classList.add('active');
        panel.classList.add('active');
        return true;
    }

    function getTabFromHash() {
        const hash = window.location.hash || '';
        if (!hash.startsWith('#tab-')) return '';
        return hash.slice(5);
    }

    document.querySelectorAll('.tab').forEach((tab) => {
        tab.addEventListener('click', () => {
            const tabKey = tab.dataset.tab;
            activateTab(tabKey);
            history.replaceState(null, '', `#tab-${tabKey}`);
        });
    });

    const initialTab = getTabFromHash();
    if (initialTab) {
        activateTab(initialTab);
    }

    window.addEventListener('hashchange', () => {
        const tabKey = getTabFromHash();
        if (tabKey) activateTab(tabKey);
    });

    function showToast(msg, duration = 2200) {
        const toast = document.getElementById('toast');
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), duration);
    }

    function safeParse(raw) {
        if (!raw || typeof raw !== 'string') return null;
        try {
            return JSON.parse(raw);
        } catch (_) {
            return null;
        }
    }

    function isISODate(value) {
        return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
    }

    function sanitizeImageUrl(url) {
        if (typeof url !== 'string') return '';
        const trimmed = url.trim();
        if (!trimmed) return '';
        if (/^data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=\s]+$/.test(trimmed)) return trimmed;
        if (/^https?:\/\/\S+$/i.test(trimmed)) return trimmed;
        return '';
    }

    function sanitizeTimezone(value, fallback) {
        const baseFallback = typeof fallback === 'string' && fallback
            ? fallback
            : (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
        if (typeof value !== 'string' || !value.trim()) return baseFallback;
        const mapped = LEGACY_TIMEZONE_MAP[value.trim()] || value.trim();
        try {
            Intl.DateTimeFormat('en-US', { timeZone: mapped }).format(new Date());
            return mapped;
        } catch (_) {
            return baseFallback;
        }
    }

    function getDefaultSettings() {
        return {
            timeline: {
                startDate: '',
                endDate: '',
                hourFormat: '24',
                showWeekends: false,
                weekStart: 'mon',
                defaultDuration: 2,
                snapGrid: true,
                overlapWarn: true
            },
            appearance: {
                bgDim: 55,
                showStars: true,
                starDensity: 'medium',
                sidebarWidth: 240,
                glassBlur: 'normal',
                reducedMotion: false,
                accentColor: '#ffffff',
                bgDataUrl: ''
            },
            notifications: {
                taskReminder: true,
                reminderLeadTime: 15,
                deadlineWarn: true,
                soundFx: false,
                dailySummary: true,
                weeklyReport: false
            },
            account: {
                displayName: 'Astronaut',
                email: 'crew@orbit.space',
                language: 'en',
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh',
                autoSave: true,
                avatarDataUrl: ''
            }
        };
    }

    function sanitizeSettings(raw) {
        const defaults = getDefaultSettings();
        const timeline = raw && typeof raw === 'object' && raw.timeline && typeof raw.timeline === 'object' ? raw.timeline : {};
        const appearance = raw && typeof raw === 'object' && raw.appearance && typeof raw.appearance === 'object' ? raw.appearance : {};
        const notifications = raw && typeof raw === 'object' && raw.notifications && typeof raw.notifications === 'object' ? raw.notifications : {};
        const account = raw && typeof raw === 'object' && raw.account && typeof raw.account === 'object' ? raw.account : {};
        const durationNum = Number(timeline.defaultDuration);
        const bgDimNum = Number(appearance.bgDim);
        const sidebarNum = Number(appearance.sidebarWidth);
        const reminderNum = Number(notifications.reminderLeadTime);
        return {
            timeline: {
                startDate: isISODate(timeline.startDate) ? timeline.startDate : defaults.timeline.startDate,
                endDate: isISODate(timeline.endDate) ? timeline.endDate : defaults.timeline.endDate,
                hourFormat: timeline.hourFormat === '12' ? '12' : defaults.timeline.hourFormat,
                showWeekends: typeof timeline.showWeekends === 'boolean' ? timeline.showWeekends : defaults.timeline.showWeekends,
                weekStart: timeline.weekStart === 'sun' ? 'sun' : defaults.timeline.weekStart,
                defaultDuration: Number.isFinite(durationNum) ? Math.max(0.5, Math.min(12, durationNum)) : defaults.timeline.defaultDuration,
                snapGrid: typeof timeline.snapGrid === 'boolean' ? timeline.snapGrid : defaults.timeline.snapGrid,
                overlapWarn: typeof timeline.overlapWarn === 'boolean' ? timeline.overlapWarn : defaults.timeline.overlapWarn
            },
            appearance: {
                bgDim: Number.isFinite(bgDimNum) ? Math.max(0, Math.min(90, bgDimNum)) : defaults.appearance.bgDim,
                showStars: typeof appearance.showStars === 'boolean' ? appearance.showStars : defaults.appearance.showStars,
                starDensity: ['low', 'medium', 'high'].includes(appearance.starDensity) ? appearance.starDensity : defaults.appearance.starDensity,
                sidebarWidth: Number.isFinite(sidebarNum) ? Math.max(200, Math.min(320, sidebarNum)) : defaults.appearance.sidebarWidth,
                glassBlur: ['off', 'normal', 'strong'].includes(appearance.glassBlur) ? appearance.glassBlur : defaults.appearance.glassBlur,
                reducedMotion: typeof appearance.reducedMotion === 'boolean' ? appearance.reducedMotion : defaults.appearance.reducedMotion,
                accentColor: typeof appearance.accentColor === 'string' ? appearance.accentColor : defaults.appearance.accentColor,
                bgDataUrl: sanitizeImageUrl(appearance.bgDataUrl)
            },
            notifications: {
                taskReminder: typeof notifications.taskReminder === 'boolean' ? notifications.taskReminder : defaults.notifications.taskReminder,
                reminderLeadTime: Number.isFinite(reminderNum) ? reminderNum : defaults.notifications.reminderLeadTime,
                deadlineWarn: typeof notifications.deadlineWarn === 'boolean' ? notifications.deadlineWarn : defaults.notifications.deadlineWarn,
                soundFx: typeof notifications.soundFx === 'boolean' ? notifications.soundFx : defaults.notifications.soundFx,
                dailySummary: typeof notifications.dailySummary === 'boolean' ? notifications.dailySummary : defaults.notifications.dailySummary,
                weeklyReport: typeof notifications.weeklyReport === 'boolean' ? notifications.weeklyReport : defaults.notifications.weeklyReport
            },
            account: {
                displayName: typeof account.displayName === 'string' && account.displayName.trim() ? account.displayName.trim().slice(0, 50) : defaults.account.displayName,
                email: typeof account.email === 'string' && account.email.trim() ? account.email.trim() : defaults.account.email,
                language: typeof account.language === 'string' && account.language.trim() ? account.language : defaults.account.language,
                timezone: sanitizeTimezone(account.timezone, defaults.account.timezone),
                autoSave: typeof account.autoSave === 'boolean' ? account.autoSave : defaults.account.autoSave,
                avatarDataUrl: sanitizeImageUrl(account.avatarDataUrl)
            }
        };
    }

    const parsedSettings = safeParse(localStorage.getItem(SETTINGS_KEY)) || {};
    const storedProfile = typeof auth.getStoredUser === 'function' ? auth.getStoredUser() : null;
    const liveProfile = typeof auth.getCurrentUser === 'function' ? await auth.getCurrentUser() : null;
    const authProfile = toProfile(liveProfile) || toProfile(storedProfile) || toProfile(user);
    if (authProfile) {
        const account = parsedSettings.account && typeof parsedSettings.account === 'object'
            ? parsedSettings.account
            : {};
        parsedSettings.account = {
            ...account,
            displayName: authProfile.displayName,
            email: authProfile.email,
        };
    }

    let workingSettings = sanitizeSettings(parsedSettings);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(workingSettings));

    const startDateEl = document.getElementById('startDate');
    const endDateEl = document.getElementById('endDate');
    const rangePreview = document.getElementById('rangePreview');
    const rangeBadge = document.getElementById('rangeBadge');
    const bgDim = document.getElementById('bgDim');
    const bgDimVal = document.getElementById('bgDimVal');
    const sidebarWidthSlider = document.getElementById('sidebarWidth');
    const sidebarWidthVal = document.getElementById('sidebarWidthVal');
    const bgLayer = document.getElementById('bgLayer');

    const remSteps = [5, 10, 15, 30, 60];
    let remIdx = 2;
    let durVal = 2;

    function setSegActive(ctrlId, val) {
        if (!val) return;
        const ctrl = document.getElementById(ctrlId);
        if (!ctrl) return;
        ctrl.querySelectorAll('.seg').forEach((seg) => seg.classList.toggle('active', seg.dataset.val === val));
    }

    function getSegValue(ctrlId) {
        return document.querySelector(`#${ctrlId} .seg.active`)?.dataset.val || '';
    }

    function formatDate(d) {
        return d.toISOString().split('T')[0];
    }

    function updateRangePreview() {
        const s = new Date(startDateEl.value);
        const e = new Date(endDateEl.value);
        rangePreview.style.color = 'rgba(255,255,255,0.28)';
        if (!isNaN(s) && !isNaN(e) && e >= s) {
            const diff = Math.round((e - s) / 86400000) + 1;
            const opts = { month: 'short', day: 'numeric' };
            rangePreview.textContent = `${s.toLocaleDateString('en-US', opts)} -> ${e.toLocaleDateString('en-US', opts)}`;
            rangeBadge.textContent = `${diff}d`;
            rangeBadge.style.color = diff > 14 ? 'rgba(255,180,80,0.8)' : 'rgba(255,255,255,0.6)';
        } else if (e < s) {
            rangePreview.textContent = 'End date must be after start';
            rangePreview.style.color = 'rgba(255,80,100,0.8)';
            rangeBadge.textContent = '!';
        } else {
            rangePreview.textContent = '— days selected';
            rangeBadge.textContent = '0d';
        }
    }

    document.querySelectorAll('.seg-control').forEach((ctrl) => {
        ctrl.querySelectorAll('.seg').forEach((btn) => {
            btn.addEventListener('click', () => {
                ctrl.querySelectorAll('.seg').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    });

    startDateEl.addEventListener('change', updateRangePreview);
    endDateEl.addEventListener('change', updateRangePreview);

    document.getElementById('durMinus').addEventListener('click', () => {
        if (durVal > 1) {
            durVal -= 0.5;
            document.getElementById('durVal').textContent = `${durVal}h`;
        }
    });
    document.getElementById('durPlus').addEventListener('click', () => {
        if (durVal < 12) {
            durVal += 0.5;
            document.getElementById('durVal').textContent = `${durVal}h`;
        }
    });

    document.getElementById('remMinus').addEventListener('click', () => {
        if (remIdx > 0) {
            remIdx--;
            document.getElementById('remVal').textContent = `${remSteps[remIdx]}m`;
        }
    });
    document.getElementById('remPlus').addEventListener('click', () => {
        if (remIdx < remSteps.length - 1) {
            remIdx++;
            document.getElementById('remVal').textContent = `${remSteps[remIdx]}m`;
        }
    });

    function updateBgDim() {
        const dimPct = parseInt(bgDim.value, 10) / 100;
        const bgUrl = sanitizeImageUrl(workingSettings.appearance.bgDataUrl);
        if (bgUrl) {
            bgLayer.style.backgroundImage = `linear-gradient(rgba(0,0,0,${dimPct}),rgba(0,0,0,${dimPct})),url(${bgUrl})`;
            bgLayer.style.backgroundSize = 'cover';
            bgLayer.style.backgroundPosition = 'center';
        } else {
            bgLayer.style.backgroundImage = '';
        }
    }

    bgDim.addEventListener('input', () => {
        bgDimVal.textContent = `${bgDim.value}%`;
        updateBgDim();
    });

    sidebarWidthSlider.addEventListener('input', () => {
        const v = sidebarWidthSlider.value;
        sidebarWidthVal.textContent = `${v}px`;
        document.querySelector('.sidebar').style.width = `${v}px`;
    });

    function fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Read failed'));
            reader.readAsDataURL(file);
        });
    }

    document.getElementById('bgUpload').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            showToast('Please select an image file');
            return;
        }
        const dataUrl = await fileToDataUrl(file);
        workingSettings.appearance.bgDataUrl = dataUrl;
        document.getElementById('bgThumb').style.backgroundImage = `url(${dataUrl})`;
        document.getElementById('bgFilename').textContent = file.name;
        document.getElementById('bgPreviewRow').style.display = 'flex';
        updateBgDim();
        showToast('Wallpaper applied');
    });

    document.getElementById('removeBg').addEventListener('click', () => {
        workingSettings.appearance.bgDataUrl = '';
        document.getElementById('bgPreviewRow').style.display = 'none';
        document.getElementById('bgFilename').textContent = '—';
        document.getElementById('bgUpload').value = '';
        updateBgDim();
        showToast('Background removed');
    });

    document.getElementById('showStars').addEventListener('change', (e) => {
        starField.style.opacity = e.target.checked ? '1' : '0';
    });

    document.getElementById('reducedMotion').addEventListener('change', (e) => {
        if (e.target.checked) {
            stars.forEach((s) => { s.style.animation = 'none'; });
        } else {
            stars.forEach((s) => {
                s.style.animation = `twinkle ${3 + Math.random() * 4}s ${Math.random() * 5}s ease-in-out infinite`;
            });
        }
    });

    document.querySelectorAll('.swatch').forEach((sw) => {
        sw.addEventListener('click', () => {
            document.querySelectorAll('.swatch').forEach((s) => s.classList.remove('active'));
            sw.classList.add('active');
            document.documentElement.style.setProperty('--accent', sw.dataset.color);
            showToast('Accent color updated');
        });
    });

    document.getElementById('avatarUpload').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            showToast('Please select an image file');
            return;
        }
        const dataUrl = await fileToDataUrl(file);
        workingSettings.account.avatarDataUrl = dataUrl;
        const avatarDisplay = document.getElementById('avatarDisplay');
        avatarDisplay.textContent = '';
        const img = document.createElement('img');
        img.src = dataUrl;
        img.alt = 'avatar';
        avatarDisplay.appendChild(img);
        showToast('Avatar updated');
    });

    function gatherSettings() {
        return sanitizeSettings({
            timeline: {
                startDate: startDateEl.value,
                endDate: endDateEl.value,
                hourFormat: getSegValue('hourFormat'),
                showWeekends: document.getElementById('showWeekends').checked,
                weekStart: getSegValue('weekStart'),
                defaultDuration: durVal,
                snapGrid: document.getElementById('snapGrid').checked,
                overlapWarn: document.getElementById('overlapWarn').checked
            },
            appearance: {
                bgDim: parseInt(bgDim.value, 10),
                showStars: document.getElementById('showStars').checked,
                starDensity: getSegValue('starDensity'),
                sidebarWidth: parseInt(sidebarWidthSlider.value, 10),
                glassBlur: getSegValue('glassBlur'),
                reducedMotion: document.getElementById('reducedMotion').checked,
                accentColor: document.querySelector('.swatch.active')?.dataset.color,
                bgDataUrl: workingSettings.appearance.bgDataUrl || ''
            },
            notifications: {
                taskReminder: document.getElementById('taskReminder').checked,
                reminderLeadTime: remSteps[remIdx],
                deadlineWarn: document.getElementById('deadlineWarn').checked,
                soundFx: document.getElementById('soundFx').checked,
                dailySummary: document.getElementById('dailySummary').checked,
                weeklyReport: document.getElementById('weeklyReport').checked
            },
            account: {
                displayName: document.getElementById('displayName').value,
                email: document.getElementById('userEmail').value,
                language: document.getElementById('langSelect').value,
                timezone: document.getElementById('tzSelect').value,
                autoSave: document.getElementById('autoSave').checked,
                avatarDataUrl: workingSettings.account.avatarDataUrl || ''
            }
        });
    }

    function saveSettings() {
        workingSettings = gatherSettings();
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(workingSettings));
    }

    function applySettingsToUI(settings) {
        workingSettings = settings;

        if (settings.timeline.startDate) startDateEl.value = settings.timeline.startDate;
        if (settings.timeline.endDate) endDateEl.value = settings.timeline.endDate;
        document.getElementById('showWeekends').checked = settings.timeline.showWeekends;
        document.getElementById('snapGrid').checked = settings.timeline.snapGrid;
        document.getElementById('overlapWarn').checked = settings.timeline.overlapWarn;
        durVal = settings.timeline.defaultDuration;
        document.getElementById('durVal').textContent = `${durVal}h`;
        setSegActive('hourFormat', settings.timeline.hourFormat);
        setSegActive('weekStart', settings.timeline.weekStart);

        bgDim.value = settings.appearance.bgDim;
        bgDimVal.textContent = `${settings.appearance.bgDim}%`;
        document.getElementById('showStars').checked = settings.appearance.showStars;
        starField.style.opacity = settings.appearance.showStars ? '1' : '0';
        sidebarWidthSlider.value = settings.appearance.sidebarWidth;
        sidebarWidthVal.textContent = `${settings.appearance.sidebarWidth}px`;
        document.querySelector('.sidebar').style.width = `${settings.appearance.sidebarWidth}px`;
        setSegActive('starDensity', settings.appearance.starDensity);
        setSegActive('glassBlur', settings.appearance.glassBlur);
        document.getElementById('reducedMotion').checked = settings.appearance.reducedMotion;
        document.querySelectorAll('.swatch').forEach((sw) => sw.classList.toggle('active', sw.dataset.color === settings.appearance.accentColor));
        document.documentElement.style.setProperty('--accent', settings.appearance.accentColor);

        document.getElementById('taskReminder').checked = settings.notifications.taskReminder;
        document.getElementById('deadlineWarn').checked = settings.notifications.deadlineWarn;
        document.getElementById('soundFx').checked = settings.notifications.soundFx;
        document.getElementById('dailySummary').checked = settings.notifications.dailySummary;
        document.getElementById('weeklyReport').checked = settings.notifications.weeklyReport;
        remIdx = remSteps.indexOf(settings.notifications.reminderLeadTime);
        if (remIdx < 0) remIdx = 2;
        document.getElementById('remVal').textContent = `${remSteps[remIdx]}m`;

        document.getElementById('displayName').value = settings.account.displayName;
        document.getElementById('userEmail').value = settings.account.email;
        document.getElementById('langSelect').value = settings.account.language;
        document.getElementById('tzSelect').value = settings.account.timezone;
        document.getElementById('autoSave').checked = settings.account.autoSave;

        if (settings.account.avatarDataUrl) {
            const avatarDisplay = document.getElementById('avatarDisplay');
            avatarDisplay.textContent = '';
            const img = document.createElement('img');
            img.src = settings.account.avatarDataUrl;
            img.alt = 'avatar';
            avatarDisplay.appendChild(img);
        }

        if (settings.appearance.bgDataUrl) {
            document.getElementById('bgThumb').style.backgroundImage = `url(${settings.appearance.bgDataUrl})`;
            document.getElementById('bgFilename').textContent = 'custom-background.png';
            document.getElementById('bgPreviewRow').style.display = 'flex';
        } else {
            document.getElementById('bgPreviewRow').style.display = 'none';
            document.getElementById('bgFilename').textContent = '—';
        }

        updateBgDim();
        updateRangePreview();
    }

    const today = new Date();
    const mon = new Date(today);
    mon.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const fri = new Date(mon);
    fri.setDate(mon.getDate() + 4);
    if (!workingSettings.timeline.startDate) workingSettings.timeline.startDate = formatDate(mon);
    if (!workingSettings.timeline.endDate) workingSettings.timeline.endDate = formatDate(fri);

    applySettingsToUI(workingSettings);

    // Always reflect current authenticated profile in account inputs.
    if (authProfile) {
        const displayNameInput = document.getElementById('displayName');
        const userEmailInput = document.getElementById('userEmail');
        if (displayNameInput) displayNameInput.value = authProfile.displayName;
        if (userEmailInput) userEmailInput.value = authProfile.email;

        workingSettings.account.displayName = authProfile.displayName;
        workingSettings.account.email = authProfile.email;
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(workingSettings));
    }

    document.getElementById('saveBtn').addEventListener('click', () => {
        saveSettings();
        const btn = document.getElementById('saveBtn');
        btn.classList.add('saved');
        btn.innerHTML = '<span class="save-icon">✓</span> Saved!';
        setTimeout(() => {
            btn.classList.remove('saved');
            btn.innerHTML = '<span class="save-icon">✦</span> Save Changes';
        }, 1800);
        showToast('Settings saved successfully');
    });

    document.getElementById('exportBtn').addEventListener('click', () => {
        const data = {
            settings: gatherSettings(),
            projects: safeParse(localStorage.getItem(PROJECTS_KEY)) || []
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'orbit-data.json';
        a.click();
        URL.revokeObjectURL(url);
        showToast('Data exported');
    });

    document.getElementById('clearBtn').addEventListener('click', () => {
        if (!confirm('Clear all tasks from every project? This cannot be undone.')) return;
        const projects = safeParse(localStorage.getItem(PROJECTS_KEY));
        const cleaned = Array.isArray(projects)
            ? projects.map((p, idx) => {
                if (!p || typeof p !== 'object') {
                    return {
                        id: `proj-${Date.now()}-${idx}`,
                        name: `Project ${idx + 1}`,
                        active: idx === 0,
                        members: [],
                        tasks: []
                    };
                }
                return {
                    ...p,
                    members: Array.isArray(p.members) ? p.members : [],
                    tasks: []
                };
            })
            : [];
        localStorage.setItem(PROJECTS_KEY, JSON.stringify(cleaned));
        showToast('All tasks cleared');
    });

    document.getElementById('resetBtn').addEventListener('click', () => {
        if (!confirm('Reset all settings to defaults?')) return;
        workingSettings = getDefaultSettings();
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(workingSettings));
        applySettingsToUI(workingSettings);
        showToast('Settings reset to defaults');
    });

    const accountLogoutBtn = document.getElementById('accountLogoutBtn');
    if (accountLogoutBtn) {
        accountLogoutBtn.addEventListener('click', async () => {
            if (!confirm('Sign out now?')) return;
            await auth.signOut({ redirectTo: '/landing' });
            window.location.replace('/landing');
        });
    }
});
