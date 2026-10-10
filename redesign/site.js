// Header: solid on scroll, mobile menu, one dropdown open at a time
(() => {
  const header = document.querySelector('[data-header]');
  const btn = document.querySelector('[data-menu-btn]');
  if (!header || !btn) return;
  const onScroll = () => header.classList.toggle('is-solid', window.scrollY > 60);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const setOpen = open => {
    header.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };
  btn.addEventListener('click', () => setOpen(!header.classList.contains('is-open')));
  header.querySelectorAll('.nav a').forEach(a => a.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && header.classList.contains('is-open')) { setOpen(false); btn.focus(); }
  });

  const menus = [...header.querySelectorAll('.nav details')];
  menus.forEach(d => d.addEventListener('toggle', () => {
    if (d.open) menus.forEach(o => { if (o !== d) o.open = false; });
  }));
  document.addEventListener('click', e => {
    menus.forEach(d => { if (d.open && !d.contains(e.target)) d.open = false; });
  });
})();

// Home hero slideshow
(() => {
  const root = document.querySelector('[data-carousel]');
  if (!root) return;
  const slides = [...root.querySelectorAll('[data-slide]')];
  const count = root.querySelector('[data-count]');
  const toggle = root.querySelector('[data-toggle]');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let index = 0;
  let timer = null;

  const show = i => {
    index = (i + slides.length) % slides.length;
    slides.forEach((s, n) => {
      const on = n === index;
      s.classList.toggle('is-active', on);
      s.setAttribute('aria-hidden', String(!on));
      s.inert = !on;
    });
    count.textContent = `${String(index + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}`;
  };
  const stop = () => {
    clearInterval(timer); timer = null;
    toggle.textContent = '▶'; toggle.setAttribute('aria-label', 'Play slideshow');
  };
  const start = () => {
    if (reduced.matches || document.hidden) return;
    clearInterval(timer);
    timer = setInterval(() => show(index + 1), 7000);
    toggle.textContent = 'Ⅱ'; toggle.setAttribute('aria-label', 'Pause slideshow');
  };

  root.querySelector('[data-prev]').addEventListener('click', () => { show(index - 1); if (timer) start(); });
  root.querySelector('[data-next]').addEventListener('click', () => { show(index + 1); if (timer) start(); });
  toggle.addEventListener('click', () => (timer ? stop() : start()));
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  reduced.matches ? stop() : start();
})();

// Footer photo strip pause
(() => {
  document.querySelectorAll('[data-strip]').forEach(strip => {
    const btn = strip.querySelector('[data-strip-toggle]');
    btn.addEventListener('click', () => {
      const paused = strip.classList.toggle('is-paused');
      btn.textContent = paused ? 'Play' : 'Pause';
      btn.setAttribute('aria-label', paused ? 'Play photo strip' : 'Pause photo strip');
    });
  });
})();

// Prayer request dialog
(() => {
  const dialog = document.getElementById('prayer-dialog');
  if (!dialog || typeof dialog.showModal !== 'function') return;
  document.querySelectorAll('[data-open-prayer]').forEach(b => b.addEventListener('click', () => dialog.showModal()));
  dialog.querySelectorAll('[data-close-prayer]').forEach(b => b.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
})();

// Videos: swap the thumbnail for the YouTube player where it was clicked
(() => {
  document.querySelectorAll('.video[data-video]').forEach(box => {
    box.querySelector('.video-play')?.addEventListener('click', () => {
      const frame = document.createElement('iframe');
      frame.src = `https://www.youtube-nocookie.com/embed/${box.dataset.video}?autoplay=1&rel=0${Number(box.dataset.start) ? `&start=${box.dataset.start}` : ''}`;
      frame.title = box.dataset.title;
      frame.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen';
      frame.allowFullscreen = true;
      box.replaceChildren(frame);
      box.classList.add('is-playing');
    });
  });
})();

// List search: hide rows that don't match, and empty year groups
(() => {
  const input = document.querySelector('[data-filter]');
  if (!input) return;
  const items = [...document.querySelectorAll('[data-filter-item]')];
  const groups = [...document.querySelectorAll('[data-filter-group]')];
  const empty = document.querySelector('[data-filter-empty]');
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    items.forEach(el => { el.hidden = q && !el.textContent.toLowerCase().includes(q); });
    groups.forEach(g => { g.hidden = !g.querySelector('[data-filter-item]:not([hidden])'); });
    if (empty) empty.hidden = items.some(el => !el.hidden);
  });
})();

// Card lists: filter by year or topic, "show more", and the "see all" reveal
(() => {
  document.querySelectorAll('[data-reveal]').forEach(btn => btn.addEventListener('click', () => {
    const target = document.getElementById(btn.dataset.reveal);
    target.hidden = false;
    btn.closest('.center-actions').hidden = true;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  document.querySelectorAll('[data-browse]').forEach(root => {
    const items = [...root.querySelectorAll('[data-item]')];
    const groups = [...root.querySelectorAll('[data-filter-group]')];
    const modes = [...root.querySelectorAll('[data-mode]')];
    const more = root.querySelector('[data-more]');
    const step = Number(root.dataset.step) || Infinity;
    let mode = groups[0] && groups[0].dataset.filterGroup, value = '', limit = step;
    const render = () => {
      const matches = items.filter(el => !value || el.dataset[mode] === value);
      items.forEach(el => { el.hidden = true; });
      matches.forEach((el, i) => { el.hidden = i >= limit; });
      if (more) more.closest('.center-actions').hidden = matches.length <= limit;
    };
    groups.forEach(g => g.querySelectorAll('[data-value]').forEach(btn => btn.addEventListener('click', () => {
      value = btn.dataset.value; limit = step;
      g.querySelectorAll('[data-value]').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
      render();
    })));
    modes.forEach(btn => btn.addEventListener('click', () => {
      mode = btn.dataset.mode; value = ''; limit = step;
      modes.forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
      groups.forEach(g => {
        g.hidden = g.dataset.filterGroup !== mode;
        g.querySelectorAll('[data-value]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === '')));
      });
      render();
    }));
    if (more) more.addEventListener('click', () => { limit += step; render(); });
    render();
  });
})();

// Open a series when arriving from a devotional's "Part n of m" link
(() => {
  const open = () => { const el = location.hash && document.querySelector(location.hash); if (el && el.tagName === 'DETAILS') el.open = true; };
  open(); window.addEventListener('hashchange', open);
})();

// Section bar: highlight the section you're reading
(() => {
  const links = [...document.querySelectorAll('[data-topic-link]')];
  const targets = links.map(a => { const id = a.getAttribute('href').slice(1); return document.getElementById(id) || document.getElementById(decodeURIComponent(id)); });
  if (!links.length) return;
  let current = -1;
  const update = () => {
    let idx = 0;
    targets.forEach((t, i) => { if (t && t.getBoundingClientRect().top <= 160) idx = i; });
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) idx = targets.length - 1;
    if (idx === current) return;
    current = idx;
    links.forEach((a, i) => a.classList.toggle('is-active', i === idx));
    const a = links[idx];
    a.parentElement.scrollTo({ left: a.offsetLeft - 24, behavior: 'smooth' });
  };
  update();
  window.addEventListener('scroll', update, { passive: true });
})();

// Sermon archive: search + year/speaker/series/topic filters, 20 at a time; ?series=… preselects a filter
(() => {
  const root = document.querySelector('[data-sermons]');
  if (!root) return;
  const items = [...root.querySelectorAll('[data-item]')];
  const selects = [...root.querySelectorAll('select[data-key]')];
  const search = root.querySelector('[data-search]');
  const more = root.querySelector('[data-more]');
  const none = root.querySelector('[data-none]');
  const count = root.querySelector('[data-count]');
  const step = Number(root.dataset.step) || 20;
  let limit = step;
  const params = new URLSearchParams(location.search);
  selects.forEach(s => { if (params.get(s.dataset.key)) s.value = params.get(s.dataset.key); });
  const render = () => {
    const q = search.value.trim().toLowerCase();
    const matches = items.filter(el => selects.every(s => !s.value || (el.dataset[s.dataset.key] || '').split(' ').includes(s.value))
      && (!q || el.textContent.toLowerCase().includes(q)));
    items.forEach(el => { el.hidden = true; });
    matches.forEach((el, i) => { el.hidden = i >= limit; });
    more.closest('.center-actions').hidden = matches.length <= limit;
    none.hidden = matches.length > 0;
    const noun = root.dataset.noun || 'sermon';
    count.textContent = `${matches.length} ${noun}${matches.length === 1 ? '' : 's'}`;
  };
  selects.forEach(s => s.addEventListener('change', () => { limit = step; render(); }));
  search.addEventListener('input', () => { limit = step; render(); });
  more.addEventListener('click', () => { limit += step; render(); });
  render();
})();

// Verse of the day: same verse for everyone on a given Winnipeg date, from the devotionals' key verses
(() => {
  document.querySelectorAll('[data-votd]').forEach(async box => {
    try {
      const verses = await (await fetch(box.dataset.src)).json();
      const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Winnipeg' }).format(new Date());
      const day = Math.floor(Date.parse(ymd + 'T00:00:00Z') / 86400000);
      const v = verses[day % verses.length];
      box.querySelector('[data-votd-text]').textContent = `“${v.text}”`;
      box.querySelector('[data-votd-ref]').textContent = v.ref;
      box.querySelector('[data-votd-link]').href = `${box.dataset.base}devotionals/${v.slug}.html`;
      const title = box.querySelector('[data-votd-title]');
      if (title) title.textContent = v.title;
    } catch (e) { /* keep the verse already on the page */ }
  });
})();

// Public forms (Plan a visit, Prayer & pastoral care): send to the church's inbox
(() => {
  document.querySelectorAll('form[data-form-kind]').forEach(form => {
    const status = form.querySelector('[data-form-status]');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      form.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'));
      const missing = [...form.querySelectorAll('[required]')].filter(el => (el.type === 'checkbox' ? !el.checked : !el.value.trim()));
      if (missing.length) {
        missing.forEach(el => el.closest('label').classList.add('invalid'));
        status.textContent = 'Please fill in the fields marked *.';
        missing[0].focus();
        return;
      }
      const data = {};
      [...form.elements].forEach(el => { if (el.name) data[el.name] = el.type === 'checkbox' ? el.checked : el.value; });
      const button = form.querySelector('[type=submit]');
      button.disabled = true; status.textContent = 'Sending…';
      try {
        const res = await fetch(`/api/forms/${form.dataset.formKind}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(out.error || 'Something went wrong. Please try again.');
        form.innerHTML = form.dataset.formKind === 'prayer'
          ? '<h3>Thank you.</h3><p>Your request has been received, and our care team will be praying with you.</p><div class="form-foot"><button class="btn btn-line" type="button" data-close-prayer>Close</button></div>'
          : '<h3>Thank you!</h3><p>We’ve received your message and look forward to meeting you.</p>';
        const close = form.querySelector('[data-close-prayer]');
        if (close) close.addEventListener('click', () => form.closest('dialog').close());
      } catch (ex) {
        status.textContent = ex.message; button.disabled = false;
      }
    });
  });
})();

// "Reach out to join" links (visit.html?join=Daily%20prayer#connect) fill in the contact form
(() => {
  const join = new URLSearchParams(location.search).get('join');
  const form = document.querySelector('form[data-form-kind="visit"]');
  if (!join || !form) return;
  const topic = form.querySelector('select[name="topic"]');
  if (topic) topic.value = 'Joining prayer or a meeting';
  const message = form.querySelector('textarea[name="message"]');
  if (message && !message.value) message.value = `I’d like to join ${join.slice(0, 80)}. How do I take part?`;
})();
