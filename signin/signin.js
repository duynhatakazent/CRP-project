document.addEventListener('DOMContentLoaded', async () => {
    const auth = window.OrbitAuth;
    const params = new URLSearchParams(window.location.search);
    const googleToken = params.get('token');
    const googleStatus = params.get('google');
    const googleMessage = params.get('message');

    // If OAuth callback appends a token, store it and continue to home.
    if (googleToken) {
        if (auth && typeof auth.storeToken === 'function') {
            auth.storeToken(googleToken);
        } else {
            localStorage.setItem('accessToken', googleToken);
        }
        if (auth && typeof auth.getCurrentUser === 'function') {
            await auth.getCurrentUser();
        }
        window.location.href = '/home/project.html';
        return;
    }

    if (auth) {
        const current = await auth.getCurrentUser();
        if (current) {
            window.location.href = '/home/project.html';
            return;
        }
    }

    const form = document.getElementById('auth-form');
    if (!form) return;

    const emailInput = form.querySelector('input[type="email"]');
    const passwordInput = form.querySelector('input[type="password"]');
    if (!emailInput || !passwordInput) return;

    const errorEl = document.createElement('div');
    errorEl.id = 'signin-error';
    errorEl.className = 'error-message';
    errorEl.setAttribute('aria-live', 'polite');
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
        form.insertBefore(errorEl, submitBtn);
    } else {
        form.appendChild(errorEl);
    }

    if (googleStatus === 'error') {
        errorEl.textContent = googleMessage || 'Google login failed.';
    } else if (googleStatus === '2fa') {
        errorEl.textContent = 'This account requires 2FA verification.';
    }

    const googleContainer = document.getElementById('google-signin-container');
    if (googleContainer) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn full-width';
        btn.textContent = 'Continue with Google';
        btn.addEventListener('click', () => {
            if (auth && typeof auth.startGoogleFlow === 'function') {
                auth.startGoogleFlow();
            } else {
                // fallback URL
                window.location.href = '/api/auth/google';
            }
        });
        googleContainer.appendChild(btn);
    }

    const signupEmail = localStorage.getItem('signupEmail');
    if (signupEmail) {
        emailInput.value = signupEmail;
        localStorage.removeItem('signupEmail');
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        errorEl.textContent = '';
        emailInput.setAttribute('aria-invalid', 'false');
        passwordInput.setAttribute('aria-invalid', 'false');

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!auth || !auth.validateEmail(email)) {
            errorEl.textContent = 'Please enter a valid email address.';
            emailInput.setAttribute('aria-invalid', 'true');
            emailInput.focus();
            return;
        }

        const submit = form.querySelector('button[type="submit"]');
        if (submit) {
            submit.disabled = true;
        }

        const result = await auth.signIn({ email, password });
        if (!result.ok) {
            errorEl.textContent = result.error || 'Invalid email or password.';
            emailInput.setAttribute('aria-invalid', 'true');
            passwordInput.setAttribute('aria-invalid', 'true');
            passwordInput.focus();
            if (submit) {
                submit.disabled = false;
            }
            return;
        }

        // Force profile fetch so UI account/sidebar reflects current login immediately.
        const currentUser = await auth.getCurrentUser();
        if (!currentUser) {
            errorEl.textContent = 'Signed in but failed to load profile.';
            if (submit) {
                submit.disabled = false;
            }
            return;
        }

        window.location.href = '/home/project.html';
    });
});
