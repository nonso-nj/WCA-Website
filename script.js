(() => {
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('#site-nav');
  if (!toggle || !nav) return;
  nav.querySelectorAll('.nav-dropdown').forEach(dropdown => {
    dropdown.addEventListener('toggle', () => {
      if (!dropdown.open) return;
      nav.querySelectorAll('.nav-dropdown[open]').forEach(other => {
        if (other !== dropdown) other.open = false;
      });
    });
  });
  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!expanded));
    toggle.setAttribute('aria-label', expanded ? 'Open menu' : 'Close menu');
    nav.classList.toggle('is-open', !expanded);
  });
  nav.addEventListener('click', event => {
    if (event.target.closest('a')) {
      nav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open menu');
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && nav.classList.contains('is-open')) {
      nav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open menu');
      toggle.focus();
    }
  });
})();

(() => {
  const homeHeader = document.querySelector('.home-page .site-header');
  if (!homeHeader) return;
  const updateHeader = () => homeHeader.classList.toggle('has-scrolled', window.scrollY > 28);
  updateHeader();
  window.addEventListener('scroll', updateHeader, { passive: true });
})();

(() => {
  document.querySelectorAll('.footer-photo-carousel').forEach(carousel => {
    const button = carousel.querySelector('[data-photo-toggle]');
    const track = carousel.querySelector('.photo-strip-track');
    if (!button || !track) return;

    button.addEventListener('click', () => {
      const paused = carousel.classList.toggle('is-paused');
      button.textContent = paused ? 'Resume' : 'Pause';
      button.setAttribute('aria-label', paused ? 'Resume congregation photo strip' : 'Pause congregation photo strip');
    });
  });
})();

(() => {
  const carousel = document.querySelector('.hero-slides');
  if (!carousel) return;

  const slides = [...carousel.querySelectorAll('[data-home-slide]')];
  const previous = document.querySelector('[data-slide-prev]');
  const next = document.querySelector('[data-slide-next]');
  const toggle = document.querySelector('[data-slide-toggle]');
  const count = document.querySelector('[data-slide-count]');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (slides.length < 2 || !previous || !next || !toggle || !count) return;

  let activeIndex = 0;
  let timer = null;

  const show = index => {
    activeIndex = (index + slides.length) % slides.length;
    slides.forEach((slide, i) => {
      const active = i === activeIndex;
      slide.classList.toggle('is-active', active);
      slide.setAttribute('aria-hidden', String(!active));
      slide.inert = !active;
    });
    count.textContent = `${String(activeIndex + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}`;
  };

  const stop = () => {
    window.clearInterval(timer);
    timer = null;
    toggle.textContent = '▶';
    toggle.setAttribute('aria-label', 'Play slideshow');
  };

  const start = () => {
    if (reducedMotion.matches || document.hidden) return;
    window.clearInterval(timer);
    timer = window.setInterval(() => show(activeIndex + 1), 7000);
    toggle.textContent = 'Ⅱ';
    toggle.setAttribute('aria-label', 'Pause slideshow');
  };

  previous.addEventListener('click', () => { show(activeIndex - 1); if (timer) start(); });
  next.addEventListener('click', () => { show(activeIndex + 1); if (timer) start(); });
  toggle.addEventListener('click', () => timer ? stop() : start());
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
  reducedMotion.addEventListener?.('change', () => reducedMotion.matches ? stop() : start());

  if (reducedMotion.matches) stop();
  else start();
})();

(() => {
  const dialog = document.querySelector('#prayer-request-dialog');
  if (!dialog || typeof dialog.showModal !== 'function') return;

  document.querySelectorAll('[data-open-prayer-form]').forEach(button => {
    button.addEventListener('click', () => dialog.showModal());
  });
  dialog.querySelectorAll('[data-close-prayer-form]').forEach(button => {
    button.addEventListener('click', () => dialog.close());
  });
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
})();
