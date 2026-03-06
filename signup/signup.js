document.addEventListener('DOMContentLoaded', () => {
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirm-password');
    const form = document.getElementById('auth-form');
    const submitBtn = document.getElementById('submit-btn');
    const emailInput = document.getElementById('email');
    const passwordError = document.getElementById('password-error');
    const emailError = document.getElementById('email-error');

    const policy = {
        length: document.getElementById('policy-length'),
        uppercase: document.getElementById('policy-uppercase'),
        lowercase: document.getElementById('policy-lowercase'),
        number: document.getElementById('policy-number')
    };

    // Disable the button by default
    submitBtn.disabled = true;

    const validateEmail = () => {
        const email = emailInput.value;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const isEmailValid = emailRegex.test(email);

        if (isEmailValid) {
            emailError.textContent = '';
        } else if (email.length > 0) {
            emailError.textContent = 'Invalid email format.';
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
        } else if (confirmPasswordInput.value.length > 0) {
            passwordError.textContent = 'Passwords do not match.';
        }

        // Enable or disable the button
        if (isPasswordValid && doPasswordsMatch && confirmPasswordInput.value.length > 0 && isEmailValid) {
            submitBtn.disabled = false;
        } else {
            submitBtn.disabled = true;
        }

        return isPasswordValid && isEmailValid;
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

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        // Store the email in localStorage
        localStorage.setItem('signupEmail', emailInput.value);

        // Redirect to the sign-in page
        window.location.href = '../signin/index.html';
    });
});
