/* ═══════════════════════════════════════════════════════
   KLUBIK : script.js
═══════════════════════════════════════════════════════ */

// ─── Consentement cookies (RGPD/CNIL) ────────────────
(function () {
  const GA_ID = 'G-PDBNFLX6NJ';
  const STORAGE_KEY = 'cookie-consent';

  function loadGA() {
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    function gtag() { dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', GA_ID);
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'accepted') {
    loadGA();
    return;
  }

  const banner = document.getElementById('cookieBanner');
  if (!banner) return;

  if (!stored) banner.hidden = false;

  document.getElementById('cookieAccept').addEventListener('click', function () {
    localStorage.setItem(STORAGE_KEY, 'accepted');
    banner.hidden = true;
    loadGA();
  });

  document.getElementById('cookieRefuse').addEventListener('click', function () {
    localStorage.setItem(STORAGE_KEY, 'refused');
    banner.hidden = true;
  });
})();

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

// ─── Hero cards, subtle parallax on mouse move ──────
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
      btn.textContent      = 'Erreur, réessayez';
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

  // Affiche le popup après 17 secondes, une seule fois par session
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

  let rafId;

  function tick() {
    if (rotating) offset = (offset + 0.25) % 360;
    update();
    rafId = requestAnimationFrame(tick);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(rafId);
    } else {
      rafId = requestAnimationFrame(tick);
    }
  });

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
  rafId = requestAnimationFrame(tick);
})();

// ─── Modales détail pack ─────────────────────────────
(function () {
  const overlay = document.getElementById('packModalOverlay');
  const content = document.getElementById('packModalContent');
  if (!overlay || !content) return;

  function openModal(packId) {
    const tpl = document.getElementById('modal-' + packId);
    if (!tpl) return;
    content.innerHTML = '';
    content.appendChild(tpl.content.cloneNode(true));
    content.querySelector('.pack-modal-close')
      ?.addEventListener('click', closeModal);
    overlay.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    overlay.setAttribute('hidden', '');
    document.body.style.overflow = '';
  }

  document.querySelectorAll('[data-pack-modal]').forEach(btn => {
    btn.addEventListener('click', () => openModal(btn.dataset.packModal));
  });

  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !overlay.hasAttribute('hidden')) closeModal();
  });
})();

// ─── Bandeau portfolio courbé ────────────────────────
// Les visuels défilent de droite à gauche sur l'intérieur d'un cylindre :
// à plat au centre, courbés vers soi sur les bords, en fondu aux extrémités.
// Une boîte CSS ne peut pas se courber : chaque visuel est donc découpé en
// fines bandes verticales, chacune tournée de quelques degrés. C'est le CSS
// (une animation par visuel) qui fait tourner le tout ; le JS calcule les
// tailles et change d'image quand un visuel repasse hors de l'écran.
(function () {
  const band = document.getElementById('portfolioBand');
  const source = document.getElementById('portfolioBandImages');
  if (!band || !source) return;

  // Réglages
  const SLICES = 16;          // bandes par visuel (moins = arêtes visibles)
  const CAMERA = 1.6;         // distance de la caméra, en rayons du cylindre
  const SPEED = 4;            // secondes pour avancer d'un visuel
  const TILE_HEIGHT = 0.55;   // hauteur d'un visuel / hauteur du bandeau
  const MAX_WIDTH = 0.55;     // largeur max d'un visuel / largeur du bandeau
  const ASPECT = 900 / 1125;  // format des visuels (largeur / hauteur)
  const GAP = 0.08;           // espace entre visuels / hauteur d'un visuel
  const CURVE = 60;           // courbure atteinte au bord de l'écran, en degrés

  const images = [...source.content.querySelectorAll('img')].map(img => img.getAttribute('src'));
  if (!images.length) return;

  const bend = CURVE * Math.PI / 180;
  const toDeg = rad => rad * 180 / Math.PI;
  const round = n => +n.toFixed(4);
  // Rayon du cylindre (en part de la largeur) pour que le bord de l'écran tombe à `bend`
  const arc = (CAMERA - 1 + Math.cos(bend)) / (2 * CAMERA * Math.sin(bend));

  const keyframes = document.createElement('style');
  document.head.appendChild(keyframes);
  let stage = null;
  let current = '';
  let visible = false;

  function build() {
    const width = band.clientWidth;
    const height = band.clientHeight;
    const h = Math.min(TILE_HEIGHT * height, MAX_WIDTH * width / ASPECT);
    const radius = round(width * arc);
    if (!(h > 0) || !(radius > 0)) return;

    const unit = toDeg(h / radius);                 // arc couvert par une hauteur de visuel
    const pitch = (ASPECT + GAP) * unit;            // arc entre deux visuels
    const limit = toDeg(bend) + ASPECT * unit / 2;  // au-delà, le visuel est hors écran
    const columns = Math.min(60, Math.max(2, Math.ceil(2 * limit / pitch)));
    const sweep = round(columns * pitch / 2);

    // Même taille qu'avant : inutile de tout reconstruire
    const key = columns + '|' + Math.round(h) + '|' + Math.round(radius);
    if (key === current) return;
    current = key;

    // Place une boîte sur le cylindre : on avance jusqu'à l'axe, on tourne, on revient
    const turn = deg => `translateZ(${radius}px) rotateY(${round(deg)}deg) translateZ(-${radius}px)`;
    // Masqué quand il est entièrement hors écran, là où il reboucle
    const hide = round((sweep - Math.min(sweep, limit)) / (2 * sweep) * 100);
    keyframes.textContent =
      `@keyframes portfolio-orbit{` +
      `from{transform:${turn(-sweep)}}to{transform:${turn(sweep)}}` +
      `0%,${hide}%,${100 - hide}%,100%{visibility:hidden}` +
      `${hide + 0.001}%,${100 - hide - 0.001}%{visibility:visible}}`;

    const share = ASPECT / SLICES;
    const tileWidth = ASPECT * h;
    const duration = columns * SPEED;

    const next = document.createElement('div');
    next.className = 'portfolio-band-stage';
    next.style.perspective = `${round(radius * CAMERA)}px`;

    for (let t = 0; t < columns; t++) {
      // Numérote les visuels dans leur ordre d'arrivée à l'écran
      const first = columns - 1 - t;
      const tile = document.createElement('div');
      tile.className = 'portfolio-band-tile';
      Object.assign(tile.style, {
        left: `calc(50% - ${tileWidth / 2}px)`,
        top: `calc(50% - ${h / 2}px)`,
        width: `${tileWidth}px`,
        height: `${h}px`,
        // Le délai négatif place chaque visuel à sa position sur l'arc
        animation: `portfolio-orbit ${duration}s linear ${-t * SPEED}s infinite`,
      });

      for (let k = 0; k < SLICES; k++) {
        const slice = document.createElement('div');
        slice.className = 'portfolio-band-slice';
        Object.assign(slice.style, {
          left: `${(ASPECT - share) / 2 * h}px`,
          // 1px de plus pour qu'aucun fil ne s'ouvre entre deux bandes
          width: `${share * h + (k === SLICES - 1 ? 0 : 1)}px`,
          height: `${h}px`,
          transform: turn((ASPECT / 2 - (k + 0.5) * share) * unit),
        });
        const img = document.createElement('img');
        img.alt = '';
        img.draggable = false;
        img.src = images[first % images.length];
        Object.assign(img.style, { left: `${-k * share * h}px`, width: `${tileWidth}px`, height: `${h}px` });
        slice.appendChild(img);
        tile.appendChild(slice);
      }

      // À chaque tour (hors écran), le visuel prend l'image suivante de la liste
      tile.addEventListener('animationiteration', e => {
        const lap = Math.round(e.elapsedTime / duration);
        const src = images[(lap * columns + first) % images.length];
        tile.querySelectorAll('img').forEach(img => { img.src = src; });
      });
      next.appendChild(tile);
    }

    if (stage) stage.remove();
    band.appendChild(next);
    stage = next;
    stage.classList.toggle('paused', !visible);
    requestAnimationFrame(() => next.classList.add('ready'));
  }

  // Construit le bandeau à l'approche de la section (ne ralentit pas le chargement
  // de la page), puis le met en pause quand il sort de l'écran
  let started = false;
  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible && !started) {
      started = true;
      images.forEach(src => { new Image().src = src; });
      build();
      let timer;
      new ResizeObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(build, 150);
      }).observe(band);
    }
    if (stage) stage.classList.toggle('paused', !visible);
  }, { rootMargin: '300px 0px' }).observe(band);
})();

// ─── Modale portfolio (lightbox) ─────────────────────
(function () {
  const overlay = document.getElementById('portfolioModalOverlay');
  const content = document.getElementById('portfolioModalContent');
  if (!overlay || !content) return;

  function openModal(galleryId) {
    const tpl = document.getElementById('portfolio-modal-' + galleryId);
    if (!tpl) return;
    content.innerHTML = '';
    content.appendChild(tpl.content.cloneNode(true));
    content.querySelector('.portfolio-modal-close')
      ?.addEventListener('click', closeModal);
    overlay.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    overlay.setAttribute('hidden', '');
    document.body.style.overflow = '';
  }

  document.querySelectorAll('[data-portfolio-open]').forEach(btn => {
    btn.addEventListener('click', () => openModal(btn.dataset.portfolioOpen));
  });

  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !overlay.hasAttribute('hidden')) closeModal();
  });
})();

// ─── FAQ accordéon ───────────────────────────────────
(function () {
  document.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
      const item   = btn.closest('.faq-item');
      const isOpen = item.classList.contains('open');

      document.querySelectorAll('.faq-item.open').forEach(el => {
        el.classList.remove('open');
        el.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
      });

      if (!isOpen) {
        item.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });
})();
