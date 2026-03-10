document.addEventListener('DOMContentLoaded', async () => {
    const auth = window.OrbitAuth;
    const params = new URLSearchParams(window.location.search);
    const googleStatus = params.get('google');
    const googleMessage = params.get('message');
    if (auth) {
        const current = await auth.getCurrentUser();
        if (current) {
            window.location.href = '/home/project.html';
            return;
        }
    }

    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirm-password');
    const form = document.getElementById('auth-form');
    const submitBtn = document.getElementById('submit-btn');
    const emailInput = document.getElementById('email');
    const fullNameInput = document.getElementById('full-name');
    const passwordError = document.getElementById('password-error');
    const emailError = document.getElementById('email-error');
    const googleContainer = document.getElementById('google-signup-container');
    const googleError = document.getElementById('google-signup-error');
    const policy = {
        length: document.getElementById('policy-length'),
        uppercase: document.getElementById('policy-uppercase'),
        lowercase: document.getElementById('policy-lowercase'),
        number: document.getElementById('policy-number')
    };

    if (googleError && googleStatus === 'error') {
        googleError.textContent = googleMessage || 'Google signup failed.';
    }

    if (googleContainer) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn full-width';
        btn.textContent = 'Continue with Google';
        btn.addEventListener('click', () => {
            if (auth && typeof auth.startGoogleFlow === 'function') {
                auth.startGoogleFlow();
            } else {
                window.location.href = '/api/auth/google';
            }
        });
        googleContainer.appendChild(btn);
    }

    // Disable the button by default
    submitBtn.disabled = true;

    const validateEmail = () => {
        const email = emailInput.value.trim();
        const isEmailValid = auth ? auth.validateEmail(email) : false;

        if (isEmailValid) {
            emailError.textContent = '';
            emailInput.setAttribute('aria-invalid', 'false');
        } else if (email.length > 0) {
            emailError.textContent = 'Invalid email format.';
            emailInput.setAttribute('aria-invalid', 'true');
        } else {
            emailInput.setAttribute('aria-invalid', 'false');
        }

        return isEmailValid;
    };

    const validateForm = () => {
        const value = passwordInput.value;
        const isLengthValid = value.length >= 8;
        const hasUppercase = /[A-Z]/.test(value);
        const hasLowercase = /[a-z]/.test(value);
        const hasNumber = /[0-9]/.test(value);
        const doPasswordsMatch = passwordInput.value === confirmPasswordInput.value;

        updatePolicyUI(policy.length, isLengthValid);
        updatePolicyUI(policy.uppercase, hasUppercase);
        updatePolicyUI(policy.lowercase, hasLowercase);
        updatePolicyUI(policy.number, hasNumber);

        const isPasswordValid = isLengthValid && hasUppercase && hasLowercase && hasNumber;
        const isEmailValid = validateEmail();

        if (doPasswordsMatch) {
            passwordError.textContent = '';
            confirmPasswordInput.setAttribute('aria-invalid', 'false');
        } else if (confirmPasswordInput.value.length > 0) {
            passwordError.textContent = 'Passwords do not match.';
            confirmPasswordInput.setAttribute('aria-invalid', 'true');
        }

        // Enable or disable the button
        if (isPasswordValid && doPasswordsMatch && confirmPasswordInput.value.length > 0 && isEmailValid) {
            submitBtn.disabled = false;
        } else {
            submitBtn.disabled = true;
        }

        return isPasswordValid && doPasswordsMatch && isEmailValid;
    };

    const updatePolicyUI = (element, isValid) => {
        if (isValid) {
            element.classList.remove('invalid');
            element.classList.add('valid');
        } else {
            element.classList.remove('valid');
            element.classList.add('invalid');
        }
    };

    passwordInput.addEventListener('input', validateForm);
    confirmPasswordInput.addEventListener('input', validateForm);
    emailInput.addEventListener('input', validateForm);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!validateForm()) return;
        if (!auth) {
            passwordError.textContent = 'Authentication service is unavailable.';
            return;
        }

        submitBtn.disabled = true;
        const result = await auth.registerUser({
            email: emailInput.value.trim(),
            password: passwordInput.value,
            fullName: fullNameInput.value.trim()
        });

        if (!result.ok) {
            if (result.error && result.error.toLowerCase().includes('email')) {
                emailError.textContent = result.error;
                emailInput.setAttribute('aria-invalid', 'true');
                emailInput.focus();
            } else {
                passwordError.textContent = result.error || 'Unable to create account.';
                passwordInput.setAttribute('aria-invalid', 'true');
                passwordInput.focus();
            }
            submitBtn.disabled = false;
            return;
        }

        emailError.textContent = '';
        passwordError.textContent = '';
        localStorage.setItem('signupEmail', emailInput.value.trim());
        window.location.href = '/signin/signin.html';
    });
});
