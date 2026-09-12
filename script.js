(() => {
  'use strict';

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;

  /* ============================================================
     NAVIGATION — scroll state + mobile menu
     ============================================================ */
  function initNav() {
    const nav = document.getElementById('nav');
    const toggle = document.getElementById('navToggle');
    const menu = document.getElementById('mobileMenu');

    const onScroll = () => {
      nav.classList.toggle('is-scrolled', window.scrollY > 40);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      menu.classList.toggle('is-open', !open);
      toggle.setAttribute('aria-label', open ? 'Open menu' : 'Close menu');
    });

    menu.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Open menu');
        menu.classList.remove('is-open');
      });
    });
  }

  /* ============================================================
     SCROLL PROGRESS BAR
     ============================================================ */
  function initProgress() {
    const fill = document.getElementById('progressFill');
    const update = () => {
      const h = document.documentElement;
      const scrolled = h.scrollTop;
      const max = h.scrollHeight - h.clientHeight;
      fill.style.width = max > 0 ? `${(scrolled / max) * 100}%` : '0%';
    };
    window.addEventListener('scroll', update, { passive: true });
    update();
  }

  /* ============================================================
     CUSTOM CURSOR
     ============================================================ */
  function initCursor() {
    if (isTouch) return;
    document.body.classList.add('using-mouse');

    const dot = document.querySelector('.cursor-dot');
    const ring = document.querySelector('.cursor-ring');
    let mx = window.innerWidth / 2, my = window.innerHeight / 2;
    let rx = mx, ry = my;

    window.addEventListener('mousemove', (e) => {
      mx = e.clientX; my = e.clientY;
      dot.style.transform = `translate(${mx}px, ${my}px) translate(-50%,-50%)`;
    });

    function loop() {
      rx += (mx - rx) * 0.18;
      ry += (my - ry) * 0.18;
      ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%,-50%)`;
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    document.querySelectorAll('a, button, input, textarea').forEach((el) => {
      el.addEventListener('mouseenter', () => ring.classList.add('is-link'));
      el.addEventListener('mouseleave', () => ring.classList.remove('is-link'));
    });

    document.querySelectorAll('.project').forEach((el) => {
      el.addEventListener('mouseenter', () => ring.classList.add('is-project'));
      el.addEventListener('mouseleave', () => ring.classList.remove('is-project'));
    });
  }

  /* ============================================================
     HERO — generative blob, cursor + scroll reactive
     ============================================================ */
  function initHeroField() {
    const path = document.getElementById('heroBlob');
    const field = document.getElementById('heroField');
    if (!path) return;

    const points = 8;
    const radius = 190;
    const cx = 300, cy = 300;
    let t = 0;
    let targetX = 0, targetY = 0, curX = 0, curY = 0;

    function blobPath(offset, wobble) {
      const pts = [];
      for (let i = 0; i < points; i++) {
        const angle = (i / points) * Math.PI * 2;
        const noise = Math.sin(angle * 3 + offset) * wobble + Math.cos(angle * 2 - offset * 0.7) * (wobble * 0.6);
        const r = radius + noise;
        pts.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
      }
      // Smooth closed curve through pts using Catmull-Rom -> cubic Bezier
      let d = `M ${pts[0][0]} ${pts[0][1]} `;
      for (let i = 0; i < points; i++) {
        const p0 = pts[(i - 1 + points) % points];
        const p1 = pts[i];
        const p2 = pts[(i + 1) % points];
        const p3 = pts[(i + 2) % points];
        const c1x = p1[0] + (p2[0] - p0[0]) / 6;
        const c1y = p1[1] + (p2[1] - p0[1]) / 6;
        const c2x = p2[0] - (p3[0] - p1[0]) / 6;
        const c2y = p2[1] - (p3[1] - p1[1]) / 6;
        d += `C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]} `;
      }
      return d + 'Z';
    }

    function animate() {
      t += 0.004;
      curX += (targetX - curX) * 0.04;
      curY += (targetY - curY) * 0.04;
      path.setAttribute('d', blobPath(t * 10, 22));
      field.style.transform = `translateY(-50%) translate(${curX}px, ${curY}px)`;
      if (!prefersReducedMotion) requestAnimationFrame(animate);
    }

    if (!isTouch) {
      window.addEventListener('mousemove', (e) => {
        const nx = (e.clientX / window.innerWidth - 0.5);
        const ny = (e.clientY / window.innerHeight - 0.5);
        targetX = nx * 26;
        targetY = ny * 26;
      });
    }

    if (prefersReducedMotion) {
      path.setAttribute('d', blobPath(0, 22));
    } else {
      requestAnimationFrame(animate);
    }
  }

  /* ============================================================
     INTRO — word-by-word lit reveal on scroll
     ============================================================ */
  function initIntroReveal() {
    const el = document.querySelector('[data-scramble]');
    if (!el) return;
    const text = el.textContent.trim();
    el.textContent = '';
    text.split(' ').forEach((word, i) => {
      const span = document.createElement('span');
      span.className = 'word';
      span.textContent = word + (i < text.split(' ').length - 1 ? ' ' : '');
      el.appendChild(span);
    });

    const words = el.querySelectorAll('.word');

    function onScroll() {
      const rect = el.getBoundingClientRect();
      const start = window.innerHeight * 0.85;
      const end = window.innerHeight * 0.35;
      const progress = Math.min(1, Math.max(0, (start - rect.top) / (start - end)));
      const litCount = Math.floor(progress * words.length);
      words.forEach((w, i) => w.classList.toggle('is-lit', i < litCount));
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ============================================================
     GENERIC SCROLL REVEAL (IntersectionObserver)
     ============================================================ */
  function initScrollReveal() {
    const targets = document.querySelectorAll('.stack-row, .contact, [data-reveal-up]');
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-view');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.25 }
    );
    targets.forEach((t) => io.observe(t));
  }

  /* ============================================================
     PROJECT TILT — subtle 3D response to cursor
     ============================================================ */
  function initProjectTilt() {
    if (isTouch || prefersReducedMotion) return;
    document.querySelectorAll('[data-tilt] .project-visual').forEach((visual) => {
      const card = visual.closest('.project');
      card.addEventListener('mousemove', (e) => {
        const rect = visual.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width - 0.5;
        const py = (e.clientY - rect.top) / rect.height - 0.5;
        visual.style.transform = `scale(1.015) rotateX(${py * -4}deg) rotateY(${px * 4}deg)`;
      });
      card.addEventListener('mouseleave', () => {
        visual.style.transform = '';
      });
    });
  }

  /* ============================================================
     MAGNETIC BUTTON
     ============================================================ */
  function initMagnetic() {
    if (isTouch || prefersReducedMotion) return;
    document.querySelectorAll('[data-magnetic]').forEach((btn) => {
      btn.addEventListener('mousemove', (e) => {
        const rect = btn.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        btn.style.transform = `translate(${x * 0.25}px, ${y * 0.4}px)`;
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.transform = '';
      });
    });
  }

  /* ============================================================
     CONTACT FORM — no submission logic, placeholder only
     ============================================================ */
  function initForm() {
    const form = document.getElementById('contactForm');
    const status = document.getElementById('formStatus');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();

      if (!form.checkValidity()) {
        status.textContent = 'Please fill in your name, email, and message.';
        return;
      }

      // CONNECT YOUR FORM SUBMISSION LOGIC HERE
      // e.g. fetch('/api/contact', { method: 'POST', body: new FormData(form) })

      status.textContent = 'Form ready — connect a submission endpoint to send this.';
    });
  }

  /* ============================================================
     SCROLL VELOCITY — subtle stretch on fast scroll
     ============================================================ */
  function initScrollVelocity() {
    if (prefersReducedMotion) return;
    const name = document.querySelector('.hero-name');
    if (!name) return;

    let lastY = window.scrollY;
    let lastT = performance.now();
    let raf = null;

    function onScroll() {
      const now = performance.now();
      const dy = window.scrollY - lastY;
      const dt = Math.max(now - lastT, 1);
      const velocity = Math.min(Math.abs(dy / dt), 3);
      lastY = window.scrollY;
      lastT = now;

      const scale = 1 + velocity * 0.02;
      name.style.transform = `scaleY(${scale})`;

      clearTimeout(raf);
      raf = setTimeout(() => {
        name.style.transform = 'scaleY(1)';
      }, 120);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ============================================================
     INIT
     ============================================================ */
  document.addEventListener('DOMContentLoaded', () => {
    initNav();
    initProgress();
    initCursor();
    initHeroField();
    initIntroReveal();
    initScrollReveal();
    initProjectTilt();
    initMagnetic();
    initForm();
    initScrollVelocity();
  });
})();
