/* ═══════════════════════════════════════════════════════
   KLUBIK — script.js
═══════════════════════════════════════════════════════ */

// Initialise les icônes Lucide (garde : absent sur certaines pages)
if (typeof lucide !== 'undefined') lucide.createIcons();

// ─── Navbar scroll ───────────────────────────────────
const navbar = document.getElementById('navbar');
let lastScroll = 0;

window.addEventListener('scroll', () => {
  const y = window.scrollY;
  navbar.classList.toggle('scrolled', y > 24);
  lastScroll = y;
}, { passive: true });

// ─── Mobile menu ─────────────────────────────────────
const burger    = document.getElementById('burger');
const navLinks  = document.getElementById('navLinks');
let menuOpen    = false;

burger.addEventListener('click', () => {
  menuOpen = !menuOpen;
  navLinks.classList.toggle('open', menuOpen);
  document.body.style.overflow = menuOpen ? 'hidden' : '';
  burger.setAttribute('aria-expanded', menuOpen ? 'true' : 'false');
  burger.setAttribute('aria-label', menuOpen ? 'Fermer le menu' : 'Ouvrir le menu');

  const [s1, s2] = burger.querySelectorAll('span');
  if (menuOpen) {
    s1.style.cssText = 'transform: translateY(7px) rotate(45deg)';
    s2.style.cssText = 'transform: translateY(-7px) rotate(-45deg)';
  } else {
    s1.style.cssText = '';
    s2.style.cssText = '';
  }
});

navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
function closeMenu() {
  menuOpen = false;
  navLinks.classList.remove('open');
  document.body.style.overflow = '';
  burger.querySelectorAll('span').forEach(s => s.style.cssText = '');
}

// ─── Reveal on scroll ────────────────────────────────
const revealItems = document.querySelectorAll('.reveal-item');

const revealObs = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (!entry.isIntersecting) return;
    const el    = entry.target;
    const delay = parseFloat(el.dataset.delay || 0);
    const index = [...revealItems].indexOf(el);

    // Stagger siblings inside the same parent
    const siblings = [...el.parentElement.querySelectorAll('.reveal-item')];
    const sibIndex = siblings.indexOf(el);

    setTimeout(() => {
      el.classList.add('in');
    }, delay || sibIndex * 80);

    revealObs.unobserve(el);
  });
}, {
  threshold: 0.1,
  rootMargin: '0px 0px -40px 0px',
});

revealItems.forEach(el => revealObs.observe(el));

// ─── Hero cards — subtle parallax on mouse move ──────
const heroCards = document.querySelectorAll('.hcard');
const heroSection = document.querySelector('.hero');

if (heroSection && window.matchMedia('(min-width: 1024px)').matches) {
  heroSection.addEventListener('mousemove', (e) => {
    const rect = heroSection.getBoundingClientRect();
    const cx   = (e.clientX - rect.left) / rect.width  - 0.5;
    const cy   = (e.clientY - rect.top)  / rect.height - 0.5;

    heroCards.forEach((card, i) => {
      const depth = (i % 3 + 1) * 6;
      card.style.transform = `translate(${cx * depth}px, ${cy * depth}px)`;
    });
  });

  heroSection.addEventListener('mouseleave', () => {
    heroCards.forEach(card => card.style.transform = '');
  });
}

// ─── Active nav link ─────────────────────────────────
const sections = document.querySelectorAll('section[id]');
const navAs    = document.querySelectorAll('.nav-links a[href^="#"]');

const activeObs = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const id = entry.target.getAttribute('id');
    navAs.forEach(a => {
      a.style.color = a.getAttribute('href') === `#${id}` ? 'var(--blue)' : '';
    });
  });
}, { threshold: 0.4 });

sections.forEach(s => activeObs.observe(s));

// ─── Contact form ─────────────────────────────────────
// Remplacez VOTRE_ID_FORMSPREE par l'ID obtenu sur formspree.io/new
const FORMSPREE_ENDPOINT = 'https://formspree.io/f/xlgynyro';

const form = document.getElementById('contactForm');
if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn      = form.querySelector('.btn-submit');
    const original = btn.textContent;

    btn.textContent   = 'Envoi en cours…';
    btn.style.opacity = '0.7';
    btn.disabled      = true;

    try {
      const res = await fetch(FORMSPREE_ENDPOINT, {
        method:  'POST',
        body:    new FormData(form),
        headers: { 'Accept': 'application/json' },
      });

      if (!res.ok) throw new Error('Erreur serveur');

      btn.textContent      = '✓ Message envoyé !';
      btn.style.opacity    = '1';
      btn.style.background = '#22c55e';
      form.reset();

      setTimeout(() => {
        btn.textContent      = original;
        btn.style.background = '';
        btn.disabled         = false;
      }, 3000);

    } catch {
      btn.textContent      = 'Erreur — réessayez';
      btn.style.opacity    = '1';
      btn.style.background = '#ef4444';

      setTimeout(() => {
        btn.textContent      = original;
        btn.style.background = '';
        btn.disabled         = false;
      }, 3000);
    }
  });
}


// ─── Smooth hover on service cards (tilt) ─────────────
const scards = document.querySelectorAll('.scard, .pcard');

if (window.matchMedia('(hover: hover)').matches) {
  scards.forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x    = (e.clientX - rect.left) / rect.width  - 0.5;
      const y    = (e.clientY - rect.top)  / rect.height - 0.5;
      card.style.transform = `translateY(-4px) rotateX(${-y * 3}deg) rotateY(${x * 3}deg)`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
    });
  });
}

// ─── Popup guide image pro ───────────────────────────
(function () {
  const EMAILJS_SERVICE_ID  = 'service_hhd7mln';
  const EMAILJS_TEMPLATE_ID = 'template_s9sq30s';

  // URL publique du PDF à inclure dans l'email envoyé au visiteur
  const PDF_URL = 'https://klubik.pro/guide-image-pro/guide-image-pro.html';

  const overlay  = document.getElementById('popupGuide');
  const closeBtn = document.getElementById('popupClose');
  const form     = document.getElementById('popupForm');
  const success  = document.getElementById('popupSuccess');

  if (!overlay) return;

  emailjs.init({ publicKey: 'bherDarQtTkvkJlP3' });

  function openPopup() {
    overlay.classList.add('visible');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    const firstInput = overlay.querySelector('input');
    if (firstInput) firstInput.focus();
  }

  function closePopup() {
    overlay.classList.remove('visible');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    sessionStorage.setItem('guide-popup-seen', '1');
  }

  // Affiche le popup après 17 secondes — une seule fois par session
  if (!sessionStorage.getItem('guide-popup-seen')) {
    setTimeout(openPopup, 17000);
  }

  closeBtn.addEventListener('click', closePopup);

  // Fermer en cliquant sur le fond sombre
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePopup();
  });

  // Fermer avec Échap
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('visible')) closePopup();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    // Validation manuelle
    const nameInput  = document.getElementById('popup-name');
    const emailInput = document.getElementById('popup-email');
    if (!nameInput.value.trim() || !emailInput.value.trim()) return;

    const btn = form.querySelector('.popup-submit');
    btn.textContent = 'Envoi en cours…';
    btn.disabled    = true;

    emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_ID,
      {
        to_name:  nameInput.value.trim(),
        to_email: emailInput.value.trim(),
        pdf_url:  PDF_URL,
      }
    )
    .then(() => {
      form.hidden    = true;
      success.hidden = false;
      sessionStorage.setItem('guide-popup-seen', '1');
    })
    .catch(() => {
      btn.textContent = 'Réessayer →';
      btn.disabled    = false;
    });
  });
})();

// ─── Système orbital "Pour qui" ───────────────────────
(function () {
  const scene = document.getElementById('orbitalScene');
  if (!scene) return;

  const nodes = Array.from(scene.querySelectorAll('.onode'));
  const TOTAL = nodes.length;

  // Taille calculée depuis la scène réelle (fonctionne sur tous les écrans)
  const BASE   = 520;
  const sceneW = scene.offsetWidth;
  const SCALE  = sceneW / BASE;
  const RADIUS = Math.round(200 * SCALE);

  // Redimensionner les éléments dont la taille est en CSS fixe
  const ring = scene.querySelector('.orbital-ring');
  if (ring) ring.style.width = ring.style.height = Math.round(420 * SCALE) + 'px';

  scene.querySelectorAll('.orbital-ping').forEach((ping, i) => {
    const s = Math.round([80, 104][i] * SCALE);
    ping.style.width = ping.style.height = s + 'px';
  });

  const core = scene.querySelector('.orbital-core');
  if (core) core.style.width = core.style.height = Math.round(58 * SCALE) + 'px';

  const coreInner = scene.querySelector('.orbital-core-inner');
  if (coreInner) coreInner.style.width = coreInner.style.height = Math.round(26 * SCALE) + 'px';

  nodes.forEach(node => {
    const btn = node.querySelector('.onode-btn');
    if (btn) {
      const s = Math.round(48 * SCALE);
      btn.style.width = btn.style.height = s + 'px';
      btn.style.fontSize = Math.round(20 * SCALE) + 'px';
    }
    const lbl = node.querySelector('.onode-label');
    if (lbl) {
      lbl.style.fontSize = Math.round(10.4 * SCALE) + 'px';
      lbl.style.top = Math.round(36 * SCALE) + 'px';
    }
    const pop = node.querySelector('.onode-popup');
    if (pop) pop.style.width = Math.round(210 * Math.min(SCALE, 1)) + 'px';
  });

  let offset   = 270;
  let rotating = true;
  let active   = null;
  const POP_OFF = Math.round(60 * SCALE);

  function update() {
    nodes.forEach((node, i) => {
      const deg     = ((i / TOTAL) * 360 + offset) % 360;
      const rad     = (deg * Math.PI) / 180;
      const x       = RADIUS * Math.cos(rad);
      const y       = RADIUS * Math.sin(rad);
      const depth   = (1 + Math.cos(rad)) / 2;
      const opacity = node === active ? 1 : Math.max(0.25, 0.25 + 0.75 * depth);
      const z       = node === active ? 200 : Math.round(20 + 80 * depth);

      node.style.transform = `translate(${x}px, ${y}px)`;
      node.style.opacity   = opacity;
      node.style.zIndex    = z;

      const popup = node.querySelector('.onode-popup');
      if (popup) {
        if (y > POP_OFF * 0.3) {
          popup.style.top    = 'auto';
          popup.style.bottom = POP_OFF + 'px';
        } else {
          popup.style.bottom = 'auto';
          popup.style.top    = POP_OFF + 'px';
        }
      }
    });
  }

  function tick() {
    if (rotating) offset = (offset + 0.25) % 360;
    update();
    requestAnimationFrame(tick);
  }

  nodes.forEach(node => {
    node.addEventListener('click', e => {
      e.stopPropagation();
      if (node === active) {
        node.classList.remove('active');
        active   = null;
        rotating = true;
      } else {
        if (active) active.classList.remove('active');
        node.classList.add('active');
        active   = node;
        rotating = false;
      }
    });
  });

  scene.addEventListener('click', e => {
    if (!e.target.closest('.onode')) {
      if (active) active.classList.remove('active');
      active   = null;
      rotating = true;
    }
  });

  update();
  requestAnimationFrame(tick);
})();
