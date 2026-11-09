/* ========================================
   MAHIN PORTFOLIO - INTERACTIVE BUILDING WEBSITE
   ======================================== */

// ========================================
// UTILITY FUNCTIONS
// ========================================

const $ = (selector, context = document) => context.querySelector(selector);
const $$ = (selector, context = document) => [...context.querySelectorAll(selector)];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const lerp = (start, end, factor) => start + (end - start) * factor;

const throttle = (fn, limit) => {
    let inThrottle;
    return (...args) => {
        if (!inThrottle) {
            fn.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
};

const debounce = (fn, delay) => {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
};

// ========================================
// STATE
// ========================================

const state = {
    scrollY: 0,
    scrollProgress: 0,
    viewportHeight: window.innerHeight,
    viewportWidth: window.innerWidth,
    isMobile: window.innerWidth < 760,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    cursor: { x: 0, y: 0 },
    cursorTarget: { x: 0, y: 0 },
    navOpen: false,
    currentFilter: 'all'
};

// ========================================
// CONFIG-AWARE SETTINGS
// ========================================

const DEFAULT_ANIM = {
    scrollReveal: true, hoverEffects: true, pageTransitions: true,
    scrollProgress: true, loadingAnimation: true, parallax: true,
    magnetic: true, cursor: true, counters: true, reducedMotion: 'system'
};

function getSettings() {
    let cfg = null;
    try {
        if (window.MahinRender && typeof window.MahinRender.current === 'function') cfg = window.MahinRender.current();
        if (!cfg && window.MahinConfig) cfg = window.MahinConfig.load();
    } catch (e) { /* config unavailable — fall back to defaults */ }
    return Object.assign({}, DEFAULT_ANIM, (cfg && cfg.animations) || {});
}

function prefersReduced() {
    const forced = document.documentElement.getAttribute('data-reduced-motion') === 'force-off';
    return forced || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

// ========================================
// INITIALIZATION
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    // Run each module in isolation so one failure can never blank the page
    // or stop the remaining interactive features from initialising.
    [
        initCursor,
        initNavigation,
        initProgressBar,
        initScrollReveal,
        initHeroBuild,
        initCounters,
        initProjectFilter,
        initContactForm,
        initParallax,
        initMagneticButtons,
        initSmoothScroll,
        initActiveNavHighlight,
        handleResize,
        checkReducedMotion,
        checkBattery,
        registerServiceWorker
    ].forEach(fn => {
        try { fn(); } catch (err) { console.warn('[mahin] init failed:', fn.name, err); }
    });

    // Content must never be left hidden if the observer API is missing.
    ensureContentVisible();

    // Trigger hero build animation
    requestAnimationFrame(() => {
        const hero = $('.hero-build');
        if (hero) hero.classList.add('built');
    });

    window.__mahinReady = true;
});

function ensureContentVisible() {
    // Reveal everything if the observer API is missing, the reveal module
    // failed to initialise, scroll-reveal is switched off, or the visitor
    // prefers reduced motion. Content must never be left permanently hidden.
    const anim = getSettings();
    if (!('IntersectionObserver' in window) || !window.__mahinRevealReady ||
        anim.scrollReveal === false || prefersReduced()) {
        $$('.reveal,.build-rule').forEach(el => el.classList.add('visible'));
    }
    if (prefersReduced()) {
        document.body.classList.add('reduced-motion');
        $$('.stat strong[data-count]').forEach(el => {
            el.textContent = (el.dataset.count || '') + '+';
        });
    }
}

window.addEventListener('resize', debounce(handleResize, 150));

function handleResize() {
    state.viewportHeight = window.innerHeight;
    state.viewportWidth = window.innerWidth;
    state.isMobile = window.innerWidth < 760;
    
    if (!state.isMobile && state.navOpen) {
        closeNav();
    }
}

// ========================================
// CURSOR FOLLOWER
// ========================================

const cursor = $('#cursor');
const cursorFollower = $('#cursorFollower');
let mouseX = 0, mouseY = 0;
let cursorX = 0, cursorY = 0;
let followerX = 0, followerY = 0;
let isHovering = false;
let isClicking = false;
let cursorVisible = true;
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

function initCursor() {
    if (isTouchDevice || state.reducedMotion || getSettings().cursor === false) {
        if (cursor) cursor.style.display = 'none';
        if (cursorFollower) cursorFollower.style.display = 'none';
        document.body.style.cursor = 'auto';
        return;
    }

    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    });

    document.addEventListener('mousedown', () => {
        isClicking = true;
        if (cursor) cursor.classList.add('click');
    });

    document.addEventListener('mouseup', () => {
        isClicking = false;
        if (cursor) cursor.classList.remove('click');
    });

    // Hover detection for interactive elements
    const hoverElements = $$('a, button, .project, .chip, .filter-btn, .btn, .stat, .timeline-item, .nav-links a');
    hoverElements.forEach(el => {
        el.addEventListener('mouseenter', () => {
            isHovering = true;
            if (cursor) cursor.classList.add('hover');
        });
        el.addEventListener('mouseleave', () => {
            isHovering = false;
            if (cursor) cursor.classList.remove('hover');
        });
    });

    // Hide cursor when leaving window
    document.addEventListener('mouseleave', () => {
        cursorVisible = false;
        if (cursor) cursor.style.opacity = '0';
        if (cursorFollower) cursorFollower.style.opacity = '0';
    });

    document.addEventListener('mouseenter', () => {
        cursorVisible = true;
        if (cursor) cursor.style.opacity = '1';
        if (cursorFollower) cursorFollower.style.opacity = '1';
    });

    animateCursor();
}

function animateCursor() {
    if (cursorVisible && cursor && cursorFollower) {
        cursorX += (mouseX - cursorX) * 0.2;
        cursorY += (mouseY - cursorY) * 0.2;
        followerX += (mouseX - followerX) * 0.1;
        followerY += (mouseY - followerY) * 0.1;

        cursor.style.transform = `translate(${cursorX - 14}px, ${cursorY - 14}px)`;
        cursorFollower.style.transform = `translate(${followerX - 4}px, ${followerY - 4}px)`;
    }
    requestAnimationFrame(animateCursor);
}

// ========================================
// NAVIGATION
// ========================================

const menuBtn = $('#menuBtn');
const navLinks = $('#navLinks');
const nav = $('#nav');

function initNavigation() {
    // Mobile menu toggle
    if (menuBtn && navLinks) {
        menuBtn.addEventListener('click', () => {
            const open = navLinks.classList.toggle('open');
            menuBtn.setAttribute('aria-expanded', String(open));
            menuBtn.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
            menuBtn.textContent = open ? '✕' : '☰';
            state.navOpen = open;
            document.body.style.overflow = open ? 'hidden' : '';
        });
    }

    // Close menu on link click
    if (navLinks) {
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('open');
                if (menuBtn) {
                    menuBtn.setAttribute('aria-expanded', 'false');
                    menuBtn.setAttribute('aria-label', 'Open navigation');
                    menuBtn.textContent = '☰';
                }
                state.navOpen = false;
                document.body.style.overflow = '';
            });
        });
    }

    // Nav scroll effect
    window.addEventListener('scroll', throttle(() => {
        if (window.scrollY > 100) {
            nav.classList.add('scrolled');
        } else {
            nav.classList.remove('scrolled');
        }
    }, 50));
}

function closeNav() {
    if (navLinks) navLinks.classList.remove('open');
    if (menuBtn) {
        menuBtn.setAttribute('aria-expanded', 'false');
        menuBtn.setAttribute('aria-label', 'Open navigation');
        menuBtn.textContent = '☰';
    }
    state.navOpen = false;
    document.body.style.overflow = '';
}

// ========================================
// PROGRESS BAR
// ========================================

const progressBar = $('#progressBar');

function initProgressBar() {
    if (getSettings().scrollProgress === false) {
        if (progressBar) progressBar.style.width = '0%';
        const wrapEl = $('.progress');
        if (wrapEl) wrapEl.style.display = 'none';
        return;
    }
    window.addEventListener('scroll', throttle(() => {
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        const progress = maxScroll > 0 ? window.scrollY / maxScroll * 100 : 0;
        if (progressBar) progressBar.style.width = progress + '%';
    }, 16), { passive: true });
    
    // Initial update
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const progress = maxScroll > 0 ? window.scrollY / maxScroll * 100 : 0;
    if (progressBar) progressBar.style.width = progress + '%';
}

// ========================================
// HERO BUILD ANIMATION
// ========================================

function initHeroBuild() {
    const heroSection = $('.hero-build');
    if (!heroSection) return;

    if (getSettings().loadingAnimation === false) {
        heroSection.classList.add('built');
        return;
    }

    // Already triggered in DOMContentLoaded, but ensure it runs
    setTimeout(() => {
        heroSection.classList.add('built');
    }, 100);
}

// ========================================
// SCROLL REVEAL (BUILD EFFECT)
// ========================================

function initScrollReveal() {
    if (!('IntersectionObserver' in window) || getSettings().scrollReveal === false || prefersReduced()) {
        $$('.reveal,.build-rule').forEach(el => el.classList.add('visible'));
        window.__mahinRevealReady = true;
        return;
    }

    const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                
                // Add section-built class to parent section for corner markers
                const section = entry.target.closest('section');
                if (section) section.classList.add('section-built');
                
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.13, rootMargin: '0px 0px -35px 0px' });

    $$('.reveal,.build-rule').forEach(el => revealObserver.observe(el));
    window.__mahinRevealReady = true;
}

// ========================================
// COUNTER ANIMATION
// ========================================

function initCounters() {
    if (!('IntersectionObserver' in window) || getSettings().counters === false || prefersReduced()) {
        $$('.stat strong[data-count]').forEach(el => {
            el.textContent = (el.dataset.count || '') + '+';
        });
        return;
    }

    const counterObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const target = entry.target;
                const count = parseInt(target.dataset.count);
                animateCounter(target, count);
                observer.unobserve(target);
            }
        });
    }, { threshold: 0.5 });

    $$('.stat strong[data-count]').forEach(el => counterObserver.observe(el));
}

function animateCounter(el, target) {
    let current = 0;
    const duration = 2000;
    const startTime = performance.now();

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        current = Math.round(target * eased);
        el.textContent = current.toLocaleString() + (target >= 100 ? '+' : '+');
        if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
}

// ========================================
// PROJECT FILTERING
// ========================================

function initProjectFilter() {
    // render.js owns filter clicks when the config-driven grid is active.
    if (window.__mahinRenderOwnsFilters) return;
    const filterBtns = $$('.filter-btn');
    const projects = $$('.project');

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const filter = btn.dataset.filter;
            
            filterBtns.forEach(b => {
                b.classList.remove('active');
                b.setAttribute('aria-selected', 'false');
            });
            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');

            projects.forEach((project, index) => {
                const category = project.dataset.category;
                if (filter === 'all' || category === filter) {
                    project.classList.remove('hidden');
                    project.style.transitionDelay = `${index * 80}ms`;
                } else {
                    project.classList.add('hidden');
                }
            });
        });
    });
}

// ========================================
// CONTACT FORM
// ========================================

function initContactForm() {
    const contactForm = $('#contactForm');
    if (!contactForm) return;

    contactForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(contactForm);
        const data = Object.fromEntries(formData);

        // Validate
        if (!validateForm(data)) return;

        // Show success feedback
        const submitBtn = contactForm.querySelector('button[type="submit"]');
        if (!submitBtn) return;
        
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = 'Sent! <span class="arrow">✓</span>';
        submitBtn.style.background = 'var(--lime)';
        submitBtn.style.borderColor = 'var(--lime)';
        submitBtn.style.color = '#111';

        setTimeout(() => {
            submitBtn.innerHTML = originalText;
            submitBtn.style.background = '';
            submitBtn.style.borderColor = '';
            submitBtn.style.color = '';
            contactForm.reset();
        }, 3000);

        console.log('Form submitted:', data);
    });

    // Form validation styling
    const inputs = contactForm.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
        input.addEventListener('blur', () => {
            if (input.required && !input.value.trim()) {
                input.style.borderColor = '#ff6b6b';
            } else {
                input.style.borderColor = '';
            }
        });
        input.addEventListener('input', () => {
            if (input.style.borderColor === 'rgb(255, 107, 107)') {
                input.style.borderColor = '';
            }
        });
    });
}

function validateForm(data) {
    if (!data.name?.trim()) return false;
    if (!data.email?.trim()) return false;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return false;
    if (!data.project) return false;
    if (!data.message?.trim()) return false;
    if (data.message.trim().length < 10) return false;
    return true;
}

// ========================================
// PARALLAX EFFECTS
// ========================================

function initParallax() {
    if (state.reducedMotion || state.isMobile || getSettings().parallax === false) return;

    const heroOrb = $('.hero-orb');
    
    window.addEventListener('scroll', throttle(() => {
        const scrolled = window.scrollY;
        if (heroOrb && scrolled < window.innerHeight) {
            heroOrb.style.transform = `translateY(${scrolled * 0.3}px) rotate(${scrolled * 0.02}deg)`;
        }
    }, 16), { passive: true });
}

// ========================================
// MAGNETIC BUTTONS
// ========================================

function initMagneticButtons() {
    if (getSettings().magnetic === false) return;
    $$('.magnetic').forEach(btn => {
        if (btn.dataset.magnetBound === 'true') return;
        btn.dataset.magnetBound = 'true';
        btn.addEventListener('mousemove', (e) => {
            const rect = btn.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            btn.style.setProperty('--mx', `${x}px`);
            btn.style.setProperty('--my', `${y}px`);
        });
    });
}

// ========================================
// SMOOTH SCROLL
// ========================================

function initSmoothScroll() {
    $$('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            const target = $(targetId);
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                history.pushState(null, '', targetId);
            }
        });
    });
}

// ========================================
// ACTIVE NAV HIGHLIGHT
// ========================================

function initActiveNavHighlight() {
    const sections = $$('main section[id]');
    const navLinksEl = $('#navLinks');
    if (!navLinksEl || !('IntersectionObserver' in window)) return;

    const sectionObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                navLinksEl.querySelectorAll('a').forEach(a => {
                    a.classList.toggle('active', a.getAttribute('href') === '#' + entry.target.id);
                });
            }
        });
    }, { rootMargin: '-35% 0px -55% 0px' });

    sections.forEach(section => sectionObserver.observe(section));
}

// ========================================
// REDUCED MOTION CHECK
// ========================================

function applyReducedMotionState(isReduced) {
    const heroSection = $('.hero-build');
    if (isReduced) {
        document.body.classList.add('reduced-motion');
        if (heroSection) heroSection.classList.add('built');
        $$('.reveal,.build-rule').forEach(el => el.classList.add('visible'));
        $$('.stat strong[data-count]').forEach(el => {
            el.textContent = (el.dataset.count || '') + '+';
        });
    } else {
        document.body.classList.remove('reduced-motion');
    }
}

function checkReducedMotion() {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => applyReducedMotionState(
        mq.matches || document.documentElement.getAttribute('data-reduced-motion') === 'force-off'
    );
    update();

    // Listen for changes (with legacy Safari fallback)
    if (mq.addEventListener) mq.addEventListener('change', update);
    else if (mq.addListener) mq.addListener(update);
}

// ========================================
// BATTERY API
// ========================================

function checkBattery() {
    if ('getBattery' in navigator) {
        navigator.getBattery().then(battery => {
            if (battery.level < 0.2 && !battery.charging) {
                document.body.classList.add('low-battery');
            }
            battery.addEventListener('levelchange', () => {
                if (battery.level < 0.2 && !battery.charging) {
                    document.body.classList.add('low-battery');
                } else {
                    document.body.classList.remove('low-battery');
                }
            });
        });
    }
}

// ========================================
// SERVICE WORKER REGISTRATION
// ========================================

function registerServiceWorker() {
    // Only meaningful over http(s); file:// throws on register.
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;

    window.addEventListener('load', () => {
        // Relative path -> works when the site is served from a sub-directory.
        navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {
            // SW registration failed, continue without
        });
    });
}

// ========================================
// YEAR UPDATE
// ========================================

const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// ========================================
// LIVE CONFIG REFRESH (used by admin preview)
// ========================================

window.__mahinApplyRuntimeConfig = function (config, opts) {
    if (!config) return;
    const anim = Object.assign({}, DEFAULT_ANIM, config.animations || {});

    const progressWrap = $('.progress');
    if (progressWrap) progressWrap.style.display = anim.scrollProgress === false ? 'none' : '';

    if (anim.scrollReveal === false || prefersReduced()) {
        $$('.reveal,.build-rule').forEach(el => el.classList.add('visible'));
    }

    const heroSection = $('.hero-build');
    if (heroSection && (anim.loadingAnimation === false || prefersReduced())) {
        heroSection.classList.add('built');
    }

    if (anim.counters === false || prefersReduced()) {
        $$('.stat strong[data-count]').forEach(el => {
            el.textContent = (el.dataset.count || '') + '+';
        });
    }

    if (anim.magnetic !== false) initMagneticButtons();

    // Content was just re-rendered (live preview or remote CMS hydration):
    // re-attach the observers to the fresh nodes so counters/reveals work.
    if (opts && (opts.remote || opts.preview)) {
        try { initScrollReveal(); } catch (e) { /* non-fatal */ }
        try { initCounters(); } catch (e) { /* non-fatal */ }
    }
};

// ========================================
// KEYBOARD NAVIGATION
// ========================================

document.addEventListener('keydown', (e) => {
    // Escape closes mobile nav
    if (e.key === 'Escape' && state.navOpen) {
        closeNav();
    }
});

// ========================================
// CONSOLE EASTER EGG
// ========================================

console.log(`
%c👋 Welcome to Mahin's Portfolio!
%c
%cThis portfolio was built with:
%c• Vanilla JS (no frameworks!)
%c• CSS Custom Properties
%c• Intersection Observer API
%c• RequestAnimationFrame loops
%c• Zero dependencies
%c
%cLike what you see? Let's create together!
%chttps://mahin.design
`, 
'font-size: 20px; font-weight: bold; color: #9be7e4;',
'',
'font-size: 14px; color: #a0a8b8;',
'font-size: 14px; color: #a0a8b8;',
'font-size: 14px; color: #a0a8b8;',
'font-size: 14px; color: #a0a8b8;',
'font-size: 14px; color: #a0a8b8;',
'',
'font-size: 14px; color: #c9f27a;',
'font-size: 14px; color: #b9a9ff;'
);