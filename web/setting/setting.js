document.addEventListener('DOMContentLoaded', () => {

    // ─── STAR FIELD ───
    const starField = document.getElementById('starField');
    const stars = [];
    const NUM_STARS = 160;

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

    let mouseX = window.innerWidth / 2, mouseY = window.innerHeight / 2;
    let curX = mouseX, curY = mouseY;
    document.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });

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

    // ─── TABS ───
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
        });
    });

    // ─── TOAST ───
    function showToast(msg, duration = 2200) {
        const toast = document.getElementById('toast');
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), duration);
    }

    // ─── SAVE BUTTON ───
    document.getElementById('saveBtn').addEventListener('click', () => {
        saveSettings();
        const btn = document.getElementById('saveBtn');
        btn.classList.add('saved');
        btn.innerHTML = '<span class="save-icon">✓</span> Saved!';
        setTimeout(() => {
            btn.classList.remove('saved');
            btn.innerHTML = '<span class="save-icon">✦</span> Save Changes';
        }, 1800);
        showToast('✦ Settings saved successfully');
    });

    // ─── DATE RANGE ───
    const startDateEl = document.getElementById('startDate');
    const endDateEl = document.getElementById('endDate');
    const rangePreview = document.getElementById('rangePreview');
    const rangeBadge = document.getElementById('rangeBadge');

    // Set default range (Mon–Fri of current week)
    const today = new Date();
    const mon = new Date(today);
    mon.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const fri = new Date(mon);
    fri.setDate(mon.getDate() + 4);

    startDateEl.value = formatDate(mon);
    endDateEl.value = formatDate(fri);
    updateRangePreview();

    startDateEl.addEventListener('change', updateRangePreview);
    endDateEl.addEventListener('change', updateRangePreview);

    function formatDate(d) {
        return d.toISOString().split('T')[0];
    }

    function updateRangePreview() {
        const s = new Date(startDateEl.value);
        const e = new Date(endDateEl.value);
        if (!isNaN(s) && !isNaN(e) && e >= s) {
            const diff = Math.round((e - s) / 86400000) + 1;
            const opts = { month: 'short', day: 'numeric' };
            rangePreview.textContent = `${s.toLocaleDateString('en-US', opts)} → ${e.toLocaleDateString('en-US', opts)}`;
            rangeBadge.textContent = diff + 'd';
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

    // ─── SEGMENTED CONTROLS ───
    document.querySelectorAll('.seg-control').forEach(ctrl => {
        ctrl.querySelectorAll('.seg').forEach(btn => {
            btn.addEventListener('click', () => {
                ctrl.querySelectorAll('.seg').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    });

    // ─── STEPPERS ───
    // Duration stepper
    let durVal = 2;
    document.getElementById('durMinus').addEventListener('click', () => {
        if (durVal > 1) { durVal--; document.getElementById('durVal').textContent = durVal + 'h'; }
    });
    document.getElementById('durPlus').addEventListener('click', () => {
        if (durVal < 12) { durVal++; document.getElementById('durVal').textContent = durVal + 'h'; }
    });

    // Reminder stepper
    const remSteps = [5, 10, 15, 30, 60];
    let remIdx = 2;
    document.getElementById('remMinus').addEventListener('click', () => {
        if (remIdx > 0) { remIdx--; document.getElementById('remVal').textContent = remSteps[remIdx] + 'm'; }
    });
    document.getElementById('remPlus').addEventListener('click', () => {
        if (remIdx < remSteps.length - 1) { remIdx++; document.getElementById('remVal').textContent = remSteps[remIdx] + 'm'; }
    });

    // ─── RANGE SLIDERS ───
    const bgDim = document.getElementById('bgDim');
    const bgDimVal = document.getElementById('bgDimVal');
    bgDim.addEventListener('input', () => {
        bgDimVal.textContent = bgDim.value + '%';
        updateBgDim();
    });

    const sidebarWidthSlider = document.getElementById('sidebarWidth');
    const sidebarWidthVal = document.getElementById('sidebarWidthVal');
    sidebarWidthSlider.addEventListener('input', () => {
        const v = sidebarWidthSlider.value;
        sidebarWidthVal.textContent = v + 'px';
        document.querySelector('.sidebar').style.width = v + 'px';
    });

    // ─── BACKGROUND UPLOAD ───
    const bgUpload = document.getElementById('bgUpload');
    const bgLayer = document.getElementById('bgLayer');
    let bgObjectUrl = null;

    bgUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (bgObjectUrl) URL.revokeObjectURL(bgObjectUrl);
        bgObjectUrl = URL.createObjectURL(file);

        // Apply background
        bgLayer.style.backgroundImage = `url(${bgObjectUrl})`;
        updateBgDim();

        // Show preview
        document.getElementById('bgThumb').style.backgroundImage = `url(${bgObjectUrl})`;
        document.getElementById('bgFilename').textContent = file.name;
        document.getElementById('bgPreviewRow').style.display = 'flex';

        showToast('↑ Wallpaper applied');
    });

    document.getElementById('removeBg').addEventListener('click', () => {
        bgLayer.style.backgroundImage = '';
        bgLayer.style.background = '';
        document.getElementById('bgPreviewRow').style.display = 'none';
        document.getElementById('bgFilename').textContent = '—';
        if (bgObjectUrl) { URL.revokeObjectURL(bgObjectUrl); bgObjectUrl = null; }
        bgUpload.value = '';
        showToast('Background removed');
    });

    function updateBgDim() {
        const dimPct = parseInt(bgDim.value) / 100;
        if (bgObjectUrl) {
            bgLayer.style.background = `linear-gradient(rgba(0,0,0,${dimPct}),rgba(0,0,0,${dimPct}))`;
            bgLayer.style.backgroundImage = `url(${bgObjectUrl})`;
            bgLayer.style.backgroundSize = 'cover';
            bgLayer.style.backgroundPosition = 'center';
        }
    }

    // ─── STAR FIELD TOGGLE ───
    document.getElementById('showStars').addEventListener('change', (e) => {
        starField.style.opacity = e.target.checked ? '1' : '0';
    });

    // ─── REDUCED MOTION ───
    document.getElementById('reducedMotion').addEventListener('change', (e) => {
        document.documentElement.style.setProperty(
            '--transition-speed', e.target.checked ? '0s' : ''
        );
        if (e.target.checked) {
            stars.forEach(s => { s.style.animation = 'none'; });
        } else {
            stars.forEach((s, i) => {
                s.style.animation = `twinkle ${3 + Math.random() * 4}s ${Math.random() * 5}s ease-in-out infinite`;
            });
        }
    });

    // ─── COLOR SWATCHES ───
    document.querySelectorAll('.swatch').forEach(sw => {
        sw.addEventListener('click', () => {
            document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
            sw.classList.add('active');
            const color = sw.dataset.color;
            document.documentElement.style.setProperty('--accent', color);
            showToast('Accent color updated');
        });
    });

    // ─── AVATAR UPLOAD ───
    document.getElementById('avatarUpload').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const url = URL.createObjectURL(file);
        const avatarEl = document.getElementById('avatarDisplay');
        avatarEl.innerHTML = `<img src="${url}" alt="avatar" />`;
        showToast('Avatar updated');
    });

    // ─── EXPORT ───
    document.getElementById('exportBtn').addEventListener('click', () => {
        const data = gatherSettings();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'orbit-settings.json'; a.click();
        URL.revokeObjectURL(url);
        showToast('↓ Settings exported');
    });

    // ─── CLEAR / RESET ───
    document.getElementById('clearBtn').addEventListener('click', () => {
        if (confirm('Clear all tasks from every project? This cannot be undone.')) {
            showToast('All tasks cleared');
        }
    });

    document.getElementById('resetBtn').addEventListener('click', () => {
        if (confirm('Reset all settings to defaults?')) {
            location.reload();
        }
    });

    // ─── GATHER SETTINGS ───
    function gatherSettings() {
        return {
            timeline: {
                startDate: document.getElementById('startDate').value,
                endDate: document.getElementById('endDate').value,
                hourFormat: document.querySelector('#hourFormat .seg.active')?.dataset.val,
                showWeekends: document.getElementById('showWeekends').checked,
                weekStart: document.querySelector('#weekStart .seg.active')?.dataset.val,
                defaultDuration: durVal,
                snapGrid: document.getElementById('snapGrid').checked,
                overlapWarn: document.getElementById('overlapWarn').checked,
            },
            appearance: {
                bgDim: parseInt(bgDim.value),
                showStars: document.getElementById('showStars').checked,
                starDensity: document.querySelector('#starDensity .seg.active')?.dataset.val,
                sidebarWidth: parseInt(sidebarWidthSlider.value),
                glassBlur: document.querySelector('#glassBlur .seg.active')?.dataset.val,
                reducedMotion: document.getElementById('reducedMotion').checked,
                accentColor: document.querySelector('.swatch.active')?.dataset.color,
            },
            notifications: {
                taskReminder: document.getElementById('taskReminder').checked,
                reminderLeadTime: remSteps[remIdx],
                deadlineWarn: document.getElementById('deadlineWarn').checked,
                soundFx: document.getElementById('soundFx').checked,
                dailySummary: document.getElementById('dailySummary').checked,
                weeklyReport: document.getElementById('weeklyReport').checked,
            },
            account: {
                displayName: document.getElementById('displayName').value,
                email: document.getElementById('userEmail').value,
                language: document.getElementById('langSelect').value,
                timezone: document.getElementById('tzSelect').value,
                autoSave: document.getElementById('autoSave').checked,
            },
        };
    }

    function saveSettings() {
        try {
            localStorage.setItem('orbitSettings', JSON.stringify(gatherSettings()));
        } catch(e) {}
    }

    // ─── LOAD SAVED SETTINGS ───
    function loadSettings() {
        try {
            const raw = localStorage.getItem('orbitSettings');
            if (!raw) return;
            const s = JSON.parse(raw);

            if (s.timeline) {
                if (s.timeline.startDate) startDateEl.value = s.timeline.startDate;
                if (s.timeline.endDate) endDateEl.value = s.timeline.endDate;
                if (s.timeline.showWeekends !== undefined) document.getElementById('showWeekends').checked = s.timeline.showWeekends;
                if (s.timeline.snapGrid !== undefined) document.getElementById('snapGrid').checked = s.timeline.snapGrid;
                if (s.timeline.overlapWarn !== undefined) document.getElementById('overlapWarn').checked = s.timeline.overlapWarn;
                if (s.timeline.defaultDuration) { durVal = s.timeline.defaultDuration; document.getElementById('durVal').textContent = durVal + 'h'; }
                setSegActive('hourFormat', s.timeline.hourFormat);
                setSegActive('weekStart', s.timeline.weekStart);
            }
            if (s.appearance) {
                if (s.appearance.bgDim !== undefined) { bgDim.value = s.appearance.bgDim; bgDimVal.textContent = s.appearance.bgDim + '%'; }
                if (s.appearance.showStars !== undefined) { document.getElementById('showStars').checked = s.appearance.showStars; starField.style.opacity = s.appearance.showStars ? '1' : '0'; }
                if (s.appearance.sidebarWidth) { sidebarWidthSlider.value = s.appearance.sidebarWidth; sidebarWidthVal.textContent = s.appearance.sidebarWidth + 'px'; document.querySelector('.sidebar').style.width = s.appearance.sidebarWidth + 'px'; }
                if (s.appearance.accentColor) {
                    document.querySelectorAll('.swatch').forEach(sw => {
                        sw.classList.toggle('active', sw.dataset.color === s.appearance.accentColor);
                    });
                    document.documentElement.style.setProperty('--accent', s.appearance.accentColor);
                }
                setSegActive('starDensity', s.appearance.starDensity);
                setSegActive('glassBlur', s.appearance.glassBlur);
                if (s.appearance.reducedMotion !== undefined) document.getElementById('reducedMotion').checked = s.appearance.reducedMotion;
            }
            if (s.notifications) {
                if (s.notifications.taskReminder !== undefined) document.getElementById('taskReminder').checked = s.notifications.taskReminder;
                if (s.notifications.deadlineWarn !== undefined) document.getElementById('deadlineWarn').checked = s.notifications.deadlineWarn;
                if (s.notifications.soundFx !== undefined) document.getElementById('soundFx').checked = s.notifications.soundFx;
                if (s.notifications.dailySummary !== undefined) document.getElementById('dailySummary').checked = s.notifications.dailySummary;
                if (s.notifications.weeklyReport !== undefined) document.getElementById('weeklyReport').checked = s.notifications.weeklyReport;
                if (s.notifications.reminderLeadTime) {
                    remIdx = remSteps.indexOf(s.notifications.reminderLeadTime);
                    if (remIdx < 0) remIdx = 2;
                    document.getElementById('remVal').textContent = remSteps[remIdx] + 'm';
                }
            }
            if (s.account) {
                if (s.account.displayName) document.getElementById('displayName').value = s.account.displayName;
                if (s.account.email) document.getElementById('userEmail').value = s.account.email;
                if (s.account.language) document.getElementById('langSelect').value = s.account.language;
                if (s.account.autoSave !== undefined) document.getElementById('autoSave').checked = s.account.autoSave;
            }
            updateRangePreview();
        } catch(e) {}
    }

    function setSegActive(ctrlId, val) {
        if (!val) return;
        const ctrl = document.getElementById(ctrlId);
        if (!ctrl) return;
        ctrl.querySelectorAll('.seg').forEach(s => s.classList.toggle('active', s.dataset.val === val));
    }

    loadSettings();
});