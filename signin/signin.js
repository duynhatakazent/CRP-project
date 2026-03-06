document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('auth-form');
    const emailInput = document.querySelector('input[placeholder="Email Address"]');

    // Pre-fill the email from localStorage
    const signupEmail = localStorage.getItem('signupEmail');
    if (signupEmail && emailInput) {
        emailInput.value = signupEmail;
        localStorage.removeItem('signupEmail');
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        // Simulate a successful login
        localStorage.setItem('isLoggedIn', 'true');
        window.location.href = '../home/project.html';
    });
});
