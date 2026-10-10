// WCA Admin: a small single-page app on top of /api/admin/.
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const view = $('[data-view]');
  let me = null, mediaBase = '', options = null;

  // ---------------------------------------------------------------- API
  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch(`/api/admin/${path}`, {
      method, credentials: 'same-origin',
      headers: { 'x-wca-admin': '1', ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== 'login') { showLogin(); throw new Error('Please sign in again.'); }
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');
    return data;
  }

  function toast(msg, isError = false) {
    const t = $('[data-toast]');
    t.textContent = msg; t.classList.toggle('err', isError); t.hidden = false;
    clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, isError ? 5000 : 2500);
  }

  // ---------------------------------------------------------------- sign in
  function showLogin() { $('#app').hidden = true; $('#login').hidden = false; }
  $('[data-login]').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, err = $('[data-error]', f);
    err.hidden = true;
    try {
      await api('login', { method: 'POST', body: { email: f.email.value, password: f.password.value } });
      f.reset(); start();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });
  $('[data-logout]').addEventListener('click', async () => { await api('logout', { method: 'POST' }).catch(() => {}); showLogin(); });

  async function start() {
    try { ({ user: me, mediaBase } = await api('me')); } catch { return showLogin(); }
    $('#login').hidden = true; $('#app').hidden = false;
    $('[data-whoami]').textContent = me.email;
    document.querySelectorAll('[data-owner-only]').forEach(el => { el.hidden = !me.is_owner; });
    options = await api('options').catch(() => ({}));
    refreshInboxCount();
    route();
  }

  // ---------------------------------------------------------------- what each content type looks like
  const DEFS = {
    sermons: {
      title: 'Sermons', one: 'sermon', site: s => `../sermons/${s}.html`,
      row: i => [i.title, i.date, [i.audio_key && 'Audio', i.youtube && 'Video'].filter(Boolean)],
      fields: [
        { k: 'title', label: 'Title', type: 'text', required: true },
        { k: 'date', label: 'Date preached', type: 'date', half: true },
        { k: 'speakers', label: 'Speaker', type: 'list', list: 'speakers', hint: 'Pick from the list or type a new name. Separate two speakers with a comma.', half: true },
        { k: 'series', label: 'Series', type: 'list', list: 'series', hint: 'Optional', half: true },
        { k: 'topics', label: 'Topics', type: 'list', list: 'topics', hint: 'Optional', half: true },
        { k: 'youtube_url', label: 'YouTube link', type: 'text', hint: 'Optional. Paste the video or live-stream link. Links with a start time (…&t=2445) start the video at the sermon.' },
        { k: 'audio_key', label: 'Audio recording', type: 'audio', folder: 'sermons', hint: 'MP3 or M4A. Large files are fine; keep this page open until the upload finishes.' },
        { k: 'notes_url', label: 'Sermon notes (PDF)', type: 'pdf', folder: 'notes' },
        { k: 'summaries', label: 'Message summary', type: 'summaries' },
        { k: 'description', label: 'Description', type: 'rich', hint: 'Key scripture and a short description of the message.' },
        { k: 'published', label: 'Show on the website', type: 'bool' },
      ],
    },
    songs: {
      title: 'Songs', one: 'song', site: (s, i) => (i.kind === 'session' ? '../music.html#worship' : `../music/${s}.html`),
      row: i => [i.title, `${i.kind === 'session' ? 'Worship session' : 'Song'}${i.date ? ' · ' + i.date : ''}`, [i.audio_key && 'Audio']],
      fields: [
        { k: 'title', label: 'Title', type: 'text', required: true },
        { k: 'kind', label: 'Type', type: 'select', choices: [['song', 'Song'], ['session', 'Worship session (full recording)']], half: true },
        { k: 'credit', label: 'Singer or leader', type: 'text', hint: 'Optional, e.g. Bro Philip', half: true },
        { k: 'audio_key', label: 'Audio', type: 'audio', folder: 'songs', hint: 'MP3 or M4A.' },
        { k: 'lyrics', label: 'Lyrics', type: 'rich' },
        { k: 'published', label: 'Show on the website', type: 'bool' },
      ],
    },
    devotionals: {
      title: 'Devotionals', one: 'devotional', site: s => `../devotionals/${s}.html`,
      row: i => [i.title, i.date, []],
      fields: [
        { k: 'title', label: 'Title', type: 'text', required: true },
        { k: 'date', label: 'Date', type: 'date', half: true },
        { k: 'topic', label: 'Topic', type: 'list', list: 'devotionalTopics', single: true, half: true },
        { k: 'verse_text', label: 'Key verse', type: 'textarea', hint: 'Shown as the verse of the day, linked to this devotional. Keep it short (under 280 characters).' },
        { k: 'verse_ref', label: 'Verse reference', type: 'text', hint: 'e.g. Isaiah 26:4 (NKJV)', half: true },
        { k: 'number', label: 'Number', type: 'text', hint: 'Optional', half: true },
        { k: 'body', label: 'Devotional', type: 'rich', hint: 'Use “Verse” for Bible quotations.' },
        { k: 'published', label: 'Show on the website', type: 'bool' },
      ],
    },
    studies: {
      title: 'Bible studies', one: 'study', site: s => `../bible-study/${s}.html`,
      row: i => [i.title, i.date || '', []],
      fields: [
        { k: 'title', label: 'Title', type: 'text', required: true },
        { k: 'kind', label: 'Type', type: 'select', choices: [['outline', 'Study outline'], ['article', 'Article']], half: true },
        { k: 'topic', label: 'Topic', type: 'list', list: 'studyTopics', single: true, half: true, hint: 'Groups it on the Bible study page' },
        { k: 'pdf_url', label: 'PDF to download', type: 'pdf', folder: 'studies' },
        { k: 'body', label: 'Study', type: 'rich', hint: 'Headings become the section buttons at the top of the study.' },
        { k: 'published', label: 'Show on the website', type: 'bool' },
      ],
    },
  };

  // Events: "Every Wednesday · 7:00 p.m." style summaries for the list
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const daysOf = v => (Array.isArray(v) ? v : (() => { try { return JSON.parse(v || '[]'); } catch { return []; } })()).map(Number);
  function clock(t) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a.m.' : 'p.m.'}`;
  }
  function when(i) {
    const time = [clock(i.start_time), clock(i.end_time)].filter(Boolean).join(' – ');
    const d = daysOf(i.days);
    const repeat = i.recurs === 'daily' ? 'Every day' : i.recurs === 'once' ? (i.date || 'No date set')
      : d.length ? `Every ${d.map(n => DAY_NAMES[n]).join(', ')}` : 'Weekly (no days picked)';
    return [repeat, time].filter(Boolean).join(' · ');
  }
  DEFS.events = {
    title: 'Events', one: 'event', site: () => '../church-life.html#this-week',
    row: i => [i.title, when(i), []],
    fields: [
      { k: 'title', label: 'Event name', type: 'text', required: true },
      { k: 'recurs', label: 'How often', type: 'select', choices: [['weekly', 'Every week'], ['daily', 'Every day'], ['once', 'One time']], half: true },
      { k: 'date', label: 'Date', type: 'date', half: true, hint: 'For a one-time event. For repeating events, optional: the first date.' },
      { k: 'days', label: 'Which days', type: 'days' },
      { k: 'start_time', label: 'Starts', type: 'time', half: true },
      { k: 'end_time', label: 'Ends', type: 'time', half: true, hint: 'Optional' },
      { k: 'location', label: 'Where', type: 'text', hint: 'Optional, e.g. 90 Ashland Avenue' },
      { k: 'details', label: 'Details', type: 'textarea', hint: 'Optional. A sentence or two.' },
      { k: 'end_date', label: 'Last date', type: 'date', hint: 'Optional. For repeating events that stop on a certain date.' },
      { k: 'contact_to_join', label: 'People reach out to join (shows a “Reach out to join” link instead of the location)', type: 'bool' },
      { k: 'published', label: 'Show on the website', type: 'bool' },
    ],
  };

  // ---------------------------------------------------------------- router
  window.addEventListener('hashchange', route);
  function route() {
    if (!me) return;
    const [section = 'sermons', slug] = location.hash.slice(1).split('/');
    document.querySelectorAll('[data-nav] a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === `#${section}`));
    window.scrollTo(0, 0);
    if (DEFS[section]) return slug ? editView(section, slug) : listView(section);
    if (section === 'inbox') return inboxView();
    if (section === 'editors' && me.is_owner) return editorsView();
    if (section === 'account') return accountView();
    location.hash = '#sermons';
  }

  // ---------------------------------------------------------------- lists
  async function listView(name) {
    const d = DEFS[name];
    view.innerHTML = `<div class="bar"><h1>${d.title}</h1><div class="actions"><input type="search" placeholder="Search ${d.title.toLowerCase()}" data-q>
      <a class="btn primary" href="#${name}/new">+ New ${d.one}</a></div></div><div class="rows" data-rows><p class="row muted">Loading…</p></div>
      <div class="more" data-more-wrap hidden><button class="btn" data-more>Show more</button></div>`;
    const { items } = await api(name);
    let limit = 50;
    const draw = () => {
      const q = $('[data-q]').value.trim().toLowerCase();
      const matches = items.filter(i => !q || (i.title || '').toLowerCase().includes(q));
      $('[data-rows]').innerHTML = matches.slice(0, limit).map(i => {
        const [title, sub, tags] = d.row(i);
        return `<a class="row" href="#${name}/${encodeURIComponent(i.slug)}"><span><span class="row-title">${esc(title)}</span><br><span class="row-sub">${esc(sub || '')}</span></span>
          <span class="tags">${tags.filter(Boolean).map(t => `<span class="tag ok">${t}</span>`).join('')}${i.published ? '' : '<span class="tag draft">Hidden</span>'}</span></a>`;
      }).join('') || '<p class="row muted">Nothing found.</p>';
      $('[data-more-wrap]').hidden = matches.length <= limit;
    };
    $('[data-q]').addEventListener('input', () => { limit = 50; draw(); });
    $('[data-more]').addEventListener('click', () => { limit += 50; draw(); });
    draw();
  }

  // ---------------------------------------------------------------- edit form
  async function editView(name, slug) {
    const d = DEFS[name], isNew = slug === 'new';
    const item = isNew ? (name === 'events' ? { published: 1, recurs: 'weekly', days: [] }
      : { published: 1, date: new Date().toISOString().slice(0, 10), kind: name === 'studies' ? 'outline' : 'song', summaries: [] })
      : (await api(`${name}/${encodeURIComponent(slug)}`)).item;
    view.innerHTML = `<a class="back" href="#${name}">← ${d.title}</a>
      <div class="bar"><h1>${isNew ? `New ${d.one}` : esc(item.title)}</h1>${isNew ? '' : `<a class="btn" href="${d.site(slug, item)}" target="_blank" rel="noopener">View on website ↗</a>`}</div>
      <form class="form" data-form novalidate></form>`;
    const form = $('[data-form]');
    const getters = {};
    let row = null;
    for (const f of d.fields) {
      const wrap = document.createElement('div');
      wrap.className = 'field';
      wrap.dataset.k = f.k;
      if (f.half) {
        if (!row) { row = document.createElement('div'); row.className = 'grid2'; form.append(row); }
        row.append(wrap);
        if (row.children.length === 2) row = null;
      } else { row = null; form.append(wrap); }
      getters[f.k] = buildField(wrap, f, item[f.k] ?? (f.k === 'youtube_url' ? item.youtube_url : undefined), item);
    }
    if (name === 'events') {
      // Only show the fields that apply to how often the event happens.
      const how = $('[data-k="recurs"] select', form);
      const sync = () => {
        $('[data-k="days"]', form).hidden = how.value !== 'weekly';
        $('[data-k="end_date"]', form).hidden = how.value === 'once';
        $('[data-k="date"] label', form).firstChild.textContent = how.value === 'once' ? 'Date *' : 'First date';
      };
      how.addEventListener('change', sync); sync();
    }
    const bar = document.createElement('div');
    bar.className = 'actions';
    bar.innerHTML = `<button class="btn primary" type="submit">${isNew ? 'Create' : 'Save changes'}</button><span class="spacer"></span>${isNew ? '' : '<button class="btn danger" type="button" data-delete>Delete</button>'}`;
    form.append(bar);

    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (form.dataset.busy) return toast('Please wait for the upload to finish.', true);
      const body = {};
      for (const [k, get] of Object.entries(getters)) body[k] = get();
      if (!body.title) return toast('Give it a title first.', true);
      if (name === 'events' && body.recurs === 'once' && !body.date) return toast('Pick the date of the event.', true);
      if (name === 'events' && body.recurs === 'weekly' && !body.days.length) return toast('Pick at least one day.', true);
      try {
        const res = isNew ? await api(name, { method: 'POST', body }) : await api(`${name}/${encodeURIComponent(slug)}`, { method: 'PUT', body });
        toast('Saved');
        options = await api('options').catch(() => options);
        if (isNew) location.hash = `#${name}/${res.slug}`; else editView(name, slug);
      } catch (ex) { toast(ex.message, true); }
    });
    const del = $('[data-delete]', form);
    if (del) del.addEventListener('click', async () => {
      if (!confirm(`Delete “${item.title}” from the website? This can’t be undone.`)) return;
      try { await api(`${name}/${encodeURIComponent(slug)}`, { method: 'DELETE' }); toast('Deleted'); location.hash = `#${name}`; }
      catch (ex) { toast(ex.message, true); }
    });
  }

  function label(f) { return `${esc(f.label)}${f.required ? ' *' : ''}${f.hint ? ` <span class="hint">${esc(f.hint)}</span>` : ''}`; }

  function buildField(wrap, f, value, item) {
    const id = `f-${f.k}`;
    if (f.type === 'days') {
      const on = daysOf(value);
      wrap.innerHTML = `<label>${label(f)}</label><div class="days">${DAY_NAMES.map((n, i) =>
        `<label class="check"><input type="checkbox" value="${i}"${on.includes(i) ? ' checked' : ''}> ${n.slice(0, 3)}</label>`).join('')}</div>`;
      return () => [...wrap.querySelectorAll('input:checked')].map(c => Number(c.value));
    }
    if (f.type === 'text' || f.type === 'date' || f.type === 'time') {
      wrap.innerHTML = `<label for="${id}">${label(f)}</label><input id="${id}" type="${f.type}" value="${esc(value || '')}">`;
      return () => $('input', wrap).value.trim();
    }
    if (f.type === 'textarea') {
      wrap.innerHTML = `<label for="${id}">${label(f)}</label><textarea id="${id}" rows="3">${esc(value || '')}</textarea>`;
      return () => $('textarea', wrap).value.trim();
    }
    if (f.type === 'select') {
      wrap.innerHTML = `<label for="${id}">${label(f)}</label><select id="${id}">${f.choices.map(([v, l]) => `<option value="${v}"${v === value ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
      return () => $('select', wrap).value;
    }
    if (f.type === 'bool') {
      wrap.innerHTML = `<label class="check"><input type="checkbox"${value ? ' checked' : ''}> ${esc(f.label)}</label>`;
      return () => $('input', wrap).checked;
    }
    if (f.type === 'list') {
      const text = Array.isArray(value) ? value.join(', ') : (value || '');
      wrap.innerHTML = `<label for="${id}">${label(f)}</label><input id="${id}" list="${id}-list" value="${esc(text)}" autocomplete="off">
        <datalist id="${id}-list">${(options?.[f.list] || []).map(o => `<option value="${esc(o)}">`).join('')}</datalist>`;
      return () => f.single ? $('input', wrap).value.trim() : $('input', wrap).value.split(',').map(s => s.trim()).filter(Boolean);
    }
    if (f.type === 'rich') {
      wrap.innerHTML = `<label>${label(f)}</label>`;
      const ed = richEditor(value || '');
      wrap.append(ed.el);
      return ed.get;
    }
    if (f.type === 'audio' || f.type === 'pdf') return fileField(wrap, f, value);
    if (f.type === 'summaries') return summariesField(wrap, f, value || item.summaries || []);
    return () => value;
  }

  // ---------------------------------------------------------------- uploads
  const CHUNK = 10 * 1024 * 1024;
  function guessType(file) {
    if (file.type) return file.type;
    const ext = file.name.split('.').pop().toLowerCase();
    return { mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', pdf: 'application/pdf', mp4: 'video/mp4' }[ext] || 'application/octet-stream';
  }
  async function uploadFile(file, folder, onProgress) {
    const { key, uploadId } = await api('upload/start', { method: 'POST', body: { filename: file.name, type: guessType(file), folder } });
    const parts = [];
    try {
      for (let start = 0, n = 1; start < file.size; start += CHUNK, n++) {
        const res = await fetch(`/api/admin/upload/part?key=${encodeURIComponent(key)}&uploadId=${encodeURIComponent(uploadId)}&part=${n}`,
          { method: 'PUT', credentials: 'same-origin', headers: { 'x-wca-admin': '1' }, body: file.slice(start, start + CHUNK) });
        if (!res.ok) throw new Error('Upload failed. Please try again.');
        parts.push(await res.json());
        onProgress(Math.min(1, (start + CHUNK) / file.size));
      }
      return await api('upload/complete', { method: 'POST', body: { key, uploadId, parts } });
    } catch (ex) {
      api('upload/abort', { method: 'POST', body: { key, uploadId } }).catch(() => {});
      throw ex;
    }
  }

  function fileField(wrap, f, value) {
    let current = value || '';
    const accept = f.type === 'audio' ? 'audio/*,.mp3,.m4a,.wav' : 'application/pdf,.pdf';
    const url = () => (f.type === 'audio' ? (current ? `${mediaBase}/${current}` : '') : current);
    const draw = () => {
      wrap.innerHTML = `<label>${label(f)}</label><div class="file-box">
        ${current ? (f.type === 'audio' ? `<audio controls preload="none" src="${esc(url())}"></audio>` : `<a href="${esc(url())}" target="_blank" rel="noopener">Open the current PDF ↗</a>`) : '<span class="muted small">Nothing uploaded yet.</span>'}
        <div class="actions"><label class="btn">${current ? 'Replace' : 'Upload'} file<input type="file" accept="${accept}" hidden></label>
        ${current ? '<button type="button" class="btn danger" data-remove>Remove</button>' : ''}</div>
        <div class="progress" hidden><span></span></div><span class="small muted" data-status></span></div>`;
      $('input[type=file]', wrap).addEventListener('change', async e => {
        const file = e.target.files[0];
        if (!file) return;
        const form = wrap.closest('form'), bar = $('.progress', wrap), status = $('[data-status]', wrap);
        form.dataset.busy = '1'; bar.hidden = false; status.textContent = `Uploading ${file.name}…`;
        try {
          const done = await uploadFile(file, f.folder, p => { $('span', bar).style.width = `${Math.round(p * 100)}%`; status.textContent = `Uploading ${file.name}… ${Math.round(p * 100)}%`; });
          current = f.type === 'audio' ? done.key : done.url;
          delete form.dataset.busy; draw();
          toast('Uploaded. Save to keep it.');
        } catch (ex) { delete form.dataset.busy; status.textContent = ''; bar.hidden = true; toast(ex.message, true); }
      });
      const rm = $('[data-remove]', wrap);
      if (rm) rm.addEventListener('click', () => { current = ''; draw(); });
    };
    draw();
    return () => current;
  }

  function summariesField(wrap, f, list) {
    let items = list.map(s => ({ ...s }));
    const editors = new Map();
    const draw = () => {
      editors.clear();
      wrap.innerHTML = `<label>${label(f)} <span class="hint">Upload a PDF or write the summary here. It appears as a button on the sermon page.</span></label><div data-items></div>
        <div class="actions"><label class="btn">+ Add PDF summary<input type="file" accept="application/pdf,.pdf" hidden></label>
        <button type="button" class="btn" data-add-written>+ Write a summary</button></div><div class="progress" hidden><span></span></div>`;
      const box = $('[data-items]', wrap);
      items.forEach((s, i) => {
        const el = document.createElement('div');
        el.className = 'summary-item';
        if (s.kind === 'pdf') el.innerHTML = `<div class="actions"><a href="${esc(s.url)}" target="_blank" rel="noopener">PDF summary ${i + 1} ↗</a><span class="spacer"></span><button type="button" class="btn danger" data-rm>Remove</button></div>`;
        else {
          el.innerHTML = `<div class="actions"><strong>Written summary ${i + 1}</strong><span class="spacer"></span><button type="button" class="btn danger" data-rm>Remove</button></div>`;
          const ed = richEditor(s.body || '');
          el.append(ed.el); editors.set(i, ed);
        }
        $('[data-rm]', el).addEventListener('click', () => { sync(); items.splice(i, 1); draw(); });
        box.append(el);
      });
      $('[data-add-written]', wrap).addEventListener('click', () => { sync(); items.push({ kind: 'page', body: '' }); draw(); });
      $('input[type=file]', wrap).addEventListener('change', async e => {
        const file = e.target.files[0];
        if (!file) return;
        const form = wrap.closest('form'), bar = $('.progress', wrap);
        form.dataset.busy = '1'; bar.hidden = false;
        try {
          const done = await uploadFile(file, 'summaries', p => { $('span', bar).style.width = `${Math.round(p * 100)}%`; });
          sync(); items.push({ kind: 'pdf', url: done.url }); delete form.dataset.busy; draw(); toast('Uploaded. Save to keep it.');
        } catch (ex) { delete form.dataset.busy; bar.hidden = true; toast(ex.message, true); }
      });
    };
    const sync = () => editors.forEach((ed, i) => { items[i].body = ed.get(); });
    draw();
    return () => { sync(); return items; };
  }

  // ---------------------------------------------------------------- rich text editor
  const KEEP = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'H2', 'H3', 'H4', 'A', 'SUP', 'SUB', 'HR']);
  function cleanPaste(htmlText) {
    const doc = new DOMParser().parseFromString(htmlText, 'text/html');
    const walk = node => {
      [...node.childNodes].forEach(ch => {
        if (ch.nodeType === 8) { ch.remove(); return; }
        if (ch.nodeType !== 1) return;
        walk(ch);
        if (['SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE'].includes(ch.tagName)) { ch.remove(); return; }
        if (ch.tagName === 'H1') { const h = doc.createElement('h2'); h.append(...ch.childNodes); ch.replaceWith(h); return; }
        if (ch.tagName === 'DIV') { const p = doc.createElement('p'); p.append(...ch.childNodes); ch.replaceWith(p); return; }
        if (!KEEP.has(ch.tagName)) { ch.replaceWith(...ch.childNodes); return; }
        [...ch.attributes].forEach(a => { if (!(ch.tagName === 'A' && a.name === 'href')) ch.removeAttribute(a.name); });
      });
    };
    walk(doc.body);
    return doc.body.innerHTML;
  }
  function richEditor(initial) {
    const el = document.createElement('div');
    el.className = 'editor';
    el.innerHTML = `<div class="toolbar">
      <button type="button" data-cmd="formatBlock" data-arg="p">Text</button>
      <button type="button" data-cmd="formatBlock" data-arg="h2">Heading</button>
      <button type="button" data-cmd="formatBlock" data-arg="h3">Subheading</button>
      <button type="button" data-cmd="bold"><b>B</b></button>
      <button type="button" data-cmd="italic"><i>I</i></button>
      <button type="button" data-cmd="insertUnorderedList">• List</button>
      <button type="button" data-cmd="insertOrderedList">1. List</button>
      <button type="button" data-cmd="formatBlock" data-arg="blockquote">Verse</button>
      <button type="button" data-cmd="link">Link</button>
      <button type="button" data-cmd="removeFormat">Clear</button>
    </div><div class="editable" contenteditable="true"></div>`;
    const area = $('.editable', el);
    area.innerHTML = initial;
    el.querySelectorAll('[data-cmd]').forEach(b => b.addEventListener('mousedown', e => {
      e.preventDefault();
      const cmd = b.dataset.cmd;
      if (cmd === 'link') {
        const href = prompt('Link address (https://…)');
        if (href) document.execCommand('createLink', false, href);
        return;
      }
      document.execCommand(cmd, false, b.dataset.arg ? `<${b.dataset.arg}>` : null);
    }));
    area.addEventListener('paste', e => {
      const htmlText = e.clipboardData.getData('text/html');
      const text = e.clipboardData.getData('text/plain');
      e.preventDefault();
      if (htmlText) document.execCommand('insertHTML', false, cleanPaste(htmlText));
      else document.execCommand('insertHTML', false, text.split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join(''));
    });
    return { el, get: () => area.innerHTML };
  }

  // ---------------------------------------------------------------- inbox
  const LABELS = {
    need: 'Asking for', first_name: 'First name', last_name: 'Last name', email: 'Email', phone: 'Phone', heard: 'Heard about us', topic: 'Asking about',
    meet: 'Wants to be met on arrival', message: 'Message', request: 'Prayer request', contact: 'Wants to be contacted', consent: 'Agreed to the privacy note',
  };
  async function refreshInboxCount() {
    try {
      const { items } = await api('submissions');
      const open = items.filter(i => !i.handled).length;
      const badge = $('[data-inbox-count]');
      badge.textContent = open; badge.hidden = !open;
    } catch { /* ignore */ }
  }
  async function inboxView(kind = 'visit') {
    const { items, canSeePrayer } = await api('submissions');
    const show = items.filter(i => i.kind === kind);
    view.innerHTML = `<div class="bar"><h1>Inbox</h1></div>
      <div class="tabs"><button class="tab" data-kind="visit" aria-pressed="${kind === 'visit'}">Plan a visit (${items.filter(i => i.kind === 'visit' && !i.handled).length} new)</button>
      ${canSeePrayer ? `<button class="tab" data-kind="prayer" aria-pressed="${kind === 'prayer'}">Prayer &amp; care (${items.filter(i => i.kind === 'prayer' && !i.handled).length} new)</button>` : ''}</div>
      ${kind === 'prayer' ? '<p class="note">Only the care team can see these. Prayer requests are deleted automatically 90 days after they are sent.</p>' : ''}
      ${canSeePrayer ? '' : '<p class="note">Prayer and pastoral care requests are only visible to the care team.</p>'}
      <div data-msgs>${show.map(i => `<article class="msg${i.handled ? ' handled' : ''}" data-id="${i.id}">
        <div class="actions"><strong>${esc([i.data.first_name, i.data.last_name].filter(Boolean).join(' ') || 'No name given')}</strong>
        <span class="muted small">${esc(new Date(i.created_at + 'Z').toLocaleString())}</span><span class="spacer"></span>
        <button class="btn" data-handled>${i.handled ? 'Mark as new' : 'Mark as done'}</button><button class="btn danger" data-del>Delete</button></div>
        <dl>${Object.entries(i.data).filter(([k]) => !['first_name', 'last_name'].includes(k)).map(([k, v]) =>
          `<dt>${esc(LABELS[k] || k)}</dt><dd>${v === true ? 'Yes' : v === false ? 'No' : k === 'email' ? `<a href="mailto:${esc(v)}">${esc(v)}</a>` : esc(v)}</dd>`).join('')}</dl></article>`).join('')
        || '<p class="muted">Nothing here yet.</p>'}</div>`;
    view.querySelectorAll('[data-kind]').forEach(b => b.addEventListener('click', () => inboxView(b.dataset.kind)));
    view.querySelectorAll('.msg').forEach(m => {
      const id = m.dataset.id, item = items.find(i => String(i.id) === id);
      $('[data-handled]', m).addEventListener('click', async () => { await api(`submissions/${id}`, { method: 'PUT', body: { handled: !item.handled } }); refreshInboxCount(); inboxView(kind); });
      $('[data-del]', m).addEventListener('click', async () => {
        if (!confirm('Delete this message permanently?')) return;
        await api(`submissions/${id}`, { method: 'DELETE' }); refreshInboxCount(); inboxView(kind);
      });
    });
  }

  // ---------------------------------------------------------------- editors (owner only)
  async function editorsView() {
    const { items } = await api('users');
    view.innerHTML = `<div class="bar"><h1>Editors</h1></div>
      <p class="note">Everyone here can edit sermons, songs, devotionals and Bible studies. Only people marked “Care team” can read prayer and pastoral care requests. Owners can add and remove editors.</p>
      <div class="rows" style="margin:16px 0 28px">${items.map(u => `<div class="row" style="cursor:default" data-id="${u.id}">
        <span><span class="row-title">${esc(u.name || u.email)}</span><br><span class="row-sub">${esc(u.email)}</span></span>
        <span class="actions"><label class="check"><input type="checkbox" data-care${u.care_team ? ' checked' : ''}> Care team</label>
        <label class="check"><input type="checkbox" data-owner${u.is_owner ? ' checked' : ''}${u.id === me.id ? ' disabled' : ''}> Owner</label>
        <button class="btn" data-reset>Reset password</button>${u.id === me.id ? '' : '<button class="btn danger" data-remove>Remove</button>'}</span></div>`).join('')}</div>
      <form class="form" data-add><h2>Add an editor</h2>
        <div class="grid2"><label class="field">Name<input name="name"></label><label class="field">Email *<input name="email" type="email" required></label></div>
        <label class="field">Starting password * <span class="hint">At least 10 characters. Share it with them privately; they can change it under “My account”.</span><input name="password" type="text" autocomplete="off" required></label>
        <label class="check"><input type="checkbox" name="care_team"> Care team (can read prayer and pastoral care requests)</label>
        <div class="actions"><button class="btn primary" type="submit">Add editor</button></div></form>`;
    view.querySelectorAll('[data-id]').forEach(row => {
      const id = row.dataset.id;
      $('[data-care]', row).addEventListener('change', e => api(`users/${id}`, { method: 'PUT', body: { care_team: e.target.checked } }).then(() => toast('Saved')).catch(ex => toast(ex.message, true)));
      $('[data-owner]', row).addEventListener('change', e => api(`users/${id}`, { method: 'PUT', body: { is_owner: e.target.checked } }).then(() => toast('Saved')).catch(ex => toast(ex.message, true)));
      $('[data-reset]', row).addEventListener('click', async () => {
        const pw = prompt('New password for this editor (at least 10 characters):');
        if (pw) api(`users/${id}`, { method: 'PUT', body: { password: pw } }).then(() => toast('Password changed')).catch(ex => toast(ex.message, true));
      });
      const rm = $('[data-remove]', row);
      if (rm) rm.addEventListener('click', async () => {
        if (!confirm('Remove this editor? They will no longer be able to sign in.')) return;
        await api(`users/${id}`, { method: 'DELETE' }).catch(ex => toast(ex.message, true)); editorsView();
      });
    });
    $('[data-add]').addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target;
      try {
        await api('users', { method: 'POST', body: { name: f.name.value, email: f.email.value, password: f.password.value, care_team: f.care_team.checked } });
        toast('Editor added'); editorsView();
      } catch (ex) { toast(ex.message, true); }
    });
  }

  // ---------------------------------------------------------------- my account
  function accountView() {
    view.innerHTML = `<div class="bar"><h1>My account</h1></div>
      <p class="muted">Signed in as ${esc(me.email)}${me.care_team ? ' · Care team' : ''}${me.is_owner ? ' · Owner' : ''}</p>
      <form class="form" data-pw style="margin-top:16px"><h2>Change password</h2>
        <label class="field">Current password<input type="password" name="current" autocomplete="current-password" required></label>
        <label class="field">New password <span class="hint">At least 10 characters</span><input type="password" name="next" autocomplete="new-password" required></label>
        <div class="actions"><button class="btn primary" type="submit">Change password</button></div></form>`;
    $('[data-pw]').addEventListener('submit', async e => {
      e.preventDefault();
      try { await api('password', { method: 'POST', body: { current: e.target.current.value, next: e.target.next.value } }); e.target.reset(); toast('Password changed'); }
      catch (ex) { toast(ex.message, true); }
    });
  }

  start();
})();
