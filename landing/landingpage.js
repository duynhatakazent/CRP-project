document.addEventListener('DOMContentLoaded', async () => {
    // ─── NAVIGATION ───
    const getStartedBtn = document.querySelector('header .cta .btn.primary');
    if (getStartedBtn) {
        getStartedBtn.addEventListener('click', async () => {
            let loggedIn = false;
            if (window.OrbitAuth) {
                const user = await window.OrbitAuth.getCurrentUser();
                loggedIn = !!user;
            }
            if (loggedIn) {
                window.location.href = '/home/project.html';
            } else {
                window.location.href = '/signin/signin.html';
            }
        });
    }

    const aboutUsBtn = document.querySelector('header .cta .btn:not(.primary)');
    if (aboutUsBtn) {
        aboutUsBtn.addEventListener('click', () => {
            window.location.href = '../about/about.html';
        });
    }

    // ─── PARALLAX STAR FIELD ───
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
            // Twinkle via opacity animation only — NOT transform, so parallax works
            star.style.animation = `twinkle ${3 + Math.random() * 4}s ${Math.random() * 5}s ease-in-out infinite`;

            // Factor for both mouse and scroll parallax
            star._factor = 0.015 + depth * 0.04; // noticeable but gentle

            starField.appendChild(star);
            stars.push(star);
        }

        // Mouse parallax variables
        let mouseX = window.innerWidth / 2;
        let mouseY = window.innerHeight / 2;
        let curX = mouseX, curY = mouseY;
        
        // Scroll parallax variable
        let scrollY = window.scrollY;

        document.addEventListener('mousemove', (e) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
        }, { passive: true });

        document.addEventListener('scroll', () => {
            scrollY = window.scrollY;
        }, { passive: true });

        function animateStars() {
            // Lerp for smooth mouse movement
            curX += (mouseX - curX) * 0.04;
            curY += (mouseY - curY) * 0.04;

            const cx = window.innerWidth / 2;
            const cy = window.innerHeight / 2;
            const dx = curX - cx; // Mouse X offset from center
            const dy = curY - cy; // Mouse Y offset from center

            for (let s of stars) {
                // Calculate offset from mouse
                const mouseOffsetX = dx * s._factor;
                const mouseOffsetY = dy * s._factor;
                
                // Calculate offset from scroll
                const scrollOffsetY = -scrollY * s._factor * 0.5; // Apply factor and a multiplier for effect strength

                // Combine offsets
                const totalOffsetY = mouseOffsetY + scrollOffsetY;

                s.style.transform = `translate(${mouseOffsetX}px, ${totalOffsetY}px)`;
            }

            requestAnimationFrame(animateStars);
        }
        animateStars();
    }
});
