// Public pages built from the database, inside the site's normal header and footer.
import { esc, slugify, winnipegDate, niceDate, shortDate, excerpt, minutes, parseList, MEDIA_BASE, html, seoTags, SITE_URL, SITE_NAME } from './util.js';

const AUTHOR = 'Winnipeg Christian Assembly';
const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5Z"/></svg>';

// ---------------------------------------------------------------- structured data
const ORG = { '@type': 'Organization', name: SITE_NAME, url: SITE_URL + '/' };
const article = (title, description, path, date) => ({
  '@type': 'Article', headline: title, description, mainEntityOfPage: SITE_URL + path, author: ORG, publisher: ORG,
  ...(date ? { datePublished: date } : {}),
});

// ---------------------------------------------------------------- page shell
let shellCache = null;

async function getShell(env, origin, name = '/teaching') {
  if (name === '/teaching' && shellCache) return shellCache;
  const res = await env.ASSETS.fetch(new Request(origin + name));
  const text = await res.text();
  if (name === '/teaching') shellCache = text;
  return text;
}

function prefixRelative(s, depth) {
  if (!depth) return s;
  const up = '../'.repeat(depth);
  return s.replace(/\b(href|src)=(["'])([^"']*)\2/g, (m, attr, q, url) =>
    /^(https?:|mailto:|tel:|data:|#|\/)/.test(url) ? m : `${attr}=${q}${up}${url}${q}`);
}

export async function page(env, origin, { title, description, current, depth = 0, bodyClass = '', main, shellName, path, type, image, data }) {
  const shell = await getShell(env, origin, shellName);
  let [head, rest] = shell.split('<main id="main">');
  const tail = rest.slice(rest.indexOf('</main>') + '</main>'.length);
  head = head.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)} | Winnipeg Christian Assembly</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(description)}">`)
    .replace(/<!-- seo -->[\s\S]*?<!-- \/seo -->/, () => seoTags({ title, description, path, type, image, data }))
    .replaceAll(' aria-current="page"', '')
    .replace(`<a href="${current}">`, `<a href="${current}" aria-current="page">`);
  if (bodyClass) head = head.replace('<body id="top">', `<body id="top" class="${bodyClass}">`);
  return html(prefixRelative(head, depth) + '<main id="main">\n' + main + '\n</main>' + prefixRelative(tail, depth));
}

const card = (href, title, text, meta, more = 'Read', attrs = '') =>
  `<a class="card-post" href="${href}"${attrs}><span class="card-meta">${meta}</span><h3>${esc(title)}</h3><p>${esc(text)}</p><span class="card-more">${more} →</span></a>`;

const video = (id, start, title) =>
  `<div class="video sermon-video" data-video="${esc(id)}" data-start="${start || 0}" data-title="${esc(title)}">` +
  `<img src="https://i.ytimg.com/vi/${esc(id)}/hqdefault.jpg" alt="" loading="lazy">` +
  `<button type="button" class="video-play" aria-label="Play video: ${esc(title)}">${PLAY}</button></div>`;

const player = key => `<div class="audio-box"><p class="audio-label">Listen</p><audio controls preload="none" src="${MEDIA_BASE}/${esc(key)}"></audio></div>`;

const hero = (title, lede, actions = '') => `  <section class="page-hero">
    <div class="wrap">
      <h1>${title}</h1>
      <p>${lede}</p>
      ${actions ? `<div class="actions">${actions}</div>` : ''}
    </div>
  </section>`;

// ---------------------------------------------------------------- sermons
const who = r => parseList(r.speakers).join(', ') || AUTHOR;

function flags(r) {
  const f = [];
  if (r.audio_key) f.push('Audio');
  if (r.youtube) f.push('Video');
  if (r.notes_url || r.summary_count) f.push('Notes');
  return f;
}

export async function sermonsArchive(env, origin) {
  const { results: rows } = await env.DB.prepare(`SELECT s.*, (SELECT count(*) FROM summaries m WHERE m.sermon_slug = s.slug) summary_count
    FROM sermons s WHERE published = 1 ORDER BY date DESC, title`).all();
  const years = [...new Set(rows.map(r => r.date.slice(0, 4)))];
  const count = (key) => { const c = {}; rows.forEach(r => parseList(r[key]).forEach(x => { c[x] = (c[x] || 0) + 1; })); return c; };
  const speakers = Object.entries(count('speakers')).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(x => x[0]);
  const series = Object.keys(count('series')).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  const topics = Object.keys(count('topics')).sort();
  const opts = list => list.map(v => `<option value="${slugify(v)}">${esc(v)}</option>`).join('');
  const recent = rows.slice(0, 6).map(r => card(`sermons/${r.slug}.html`, r.title, r.summary || parseList(r.series)[0] || '',
    `${shortDate(r.date)} · ${esc(who(r))}`, r.youtube ? 'Watch' : r.audio_key ? 'Listen' : 'Read')).join('');
  const list = rows.map(r => {
    const sub = [who(r), ...parseList(r.series).slice(0, 1)].join(' · ');
    const attrs = ` data-item data-year="${r.date.slice(0, 4)}" data-speaker="${parseList(r.speakers).map(slugify).join(' ')}"` +
      ` data-series="${parseList(r.series).map(slugify).join(' ')}" data-topic="${parseList(r.topics).map(slugify).join(' ')}"`;
    return `<a class="list-row sermon-row" href="sermons/${r.slug}.html"${attrs}><span><span class="list-title">${esc(r.title)}</span>` +
      `<span class="row-sub">${esc(sub)}</span></span><span class="row-end">${flags(r).map(f => `<span class="flag">${f}</span>`).join('')}` +
      `<span class="list-date">${shortDate(r.date)}</span></span></a>`;
  }).join('');
  const first = rows.length ? rows[rows.length - 1].date.slice(0, 4) : '', last = rows.length ? rows[0].date.slice(0, 4) : '';
  const main = `${hero('Sermons', `${rows.length} messages from Winnipeg Christian Assembly, ${first} to ${last}.`,
    '<a class="btn btn-primary" href="teaching.html#messages">Latest services on YouTube</a>')}

  <section class="section bg-white list-section">
    <div class="wrap">
      <h2 class="list-heading">Recent sermons</h2>
      <div class="card-grid">${recent}</div>
    </div>
  </section>

  <section class="section list-section" id="all" data-sermons data-step="20">
    <div class="wrap">
      <div class="browse-head"><h2 class="list-heading">All sermons</h2><span class="muted" data-count></span></div>
      <div class="sermon-filters">
        <label class="filter"><span class="visually-hidden">Search sermons</span><input type="search" placeholder="Search titles" data-search></label>
        <label><span class="visually-hidden">Year</span><select data-key="year"><option value="">All years</option>${opts(years)}</select></label>
        <label><span class="visually-hidden">Speaker</span><select data-key="speaker"><option value="">All speakers</option>${opts(speakers)}</select></label>
        <label><span class="visually-hidden">Series</span><select data-key="series"><option value="">All series</option>${opts(series)}</select></label>
        <label><span class="visually-hidden">Topic</span><select data-key="topic"><option value="">All topics</option>${opts(topics)}</select></label>
      </div>
      <div class="list" data-list>${list}</div>
      <p class="muted" data-none hidden>No sermons match. Try clearing a filter.</p>
      <div class="center-actions"><button type="button" class="btn btn-line" data-more>Show more</button></div>
    </div>
  </section>`;
  return page(env, origin, { title: 'Sermons', description: 'Sermons from Winnipeg Christian Assembly to watch, listen to and revisit, searchable by speaker, series and topic.', current: 'sermons.html', main, path: '/sermons' });
}

export async function sermonPage(env, origin, slug) {
  const r = await env.DB.prepare('SELECT * FROM sermons WHERE slug = ? AND published = 1').bind(slug).first();
  if (!r) return null;
  const { results: summaries } = await env.DB.prepare('SELECT id, kind, url FROM summaries WHERE sermon_slug = ? ORDER BY position, id').bind(slug).all();
  // Match series and speaker exactly with json_each: D1 rejects LIKE patterns over 50 bytes, which long series names hit.
  const series = parseList(r.series)[0];
  let related = [];
  if (series) {
    related = (await env.DB.prepare(`SELECT slug, title, date FROM sermons WHERE published = 1 AND slug != ?
      AND EXISTS (SELECT 1 FROM json_each(sermons.series) WHERE value = ?) ORDER BY date LIMIT 6`)
      .bind(slug, series).all()).results;
  } else if (parseList(r.speakers)[0]) {
    related = (await env.DB.prepare(`SELECT slug, title, date FROM sermons WHERE published = 1 AND slug != ?
      AND EXISTS (SELECT 1 FROM json_each(sermons.speakers) WHERE value = ?) ORDER BY date DESC LIMIT 6`)
      .bind(slug, parseList(r.speakers)[0]).all()).results;
  }
  const meta = [`<span>${niceDate(r.date)}</span>`, `<span>${esc(who(r))}</span>`];
  if (series) meta.push(`<span><a href="../sermons.html?series=${slugify(series)}#all">${esc(series)}</a></span>`);
  const blocks = [];
  if (r.youtube) blocks.push(video(r.youtube, r.youtube_start, r.title));
  if (r.audio_key) blocks.push(player(r.audio_key));
  const docs = [];
  if (r.notes_url) docs.push(`<a class="btn btn-dark btn-sm" href="${esc(r.notes_url)}" download>Download sermon notes (PDF)</a>`);
  summaries.forEach((s, i) => {
    const label = 'Message summary' + (summaries.length > 1 ? ` ${i + 1}` : '') + (s.kind === 'pdf' ? ' (PDF)' : '');
    docs.push(s.kind === 'pdf'
      ? `<a class="btn btn-line btn-sm" href="${esc(s.url)}" target="_blank" rel="noopener">${label}</a>`
      : `<a class="btn btn-line btn-sm" href="../summaries/${s.id}.html">${label}</a>`);
  });
  if (docs.length) blocks.push(`<p class="doc-actions">${docs.join(' ')}</p>`);
  const more = related.length ? `<section class="more-sermons"><h2 class="list-heading">${series ? `More in ${esc(series)}` : `More from ${esc(who(r))}`}</h2><div class="list">${
    related.map(x => `<a class="list-row" href="${x.slug}.html"><span class="list-title">${esc(x.title)}</span><span class="list-date">${shortDate(x.date)}</span></a>`).join('')}</div></section>` : '';
  const main = `  <article class="article">
    <header class="wrap article-head">
      <a class="back-link" href="../sermons.html">← All sermons</a>
      <p class="kicker">Sermon</p>
      <h1>${esc(r.title)}</h1>
      <p class="article-meta">${meta.join('')}</p>
    </header>
    <div class="wrap article-body sermon-body">
      <div class="sermon-media">${blocks.join('')}</div>
      ${r.description || ''}
      ${more}
    </div>
  </article>`;
  const description = r.summary || `A sermon by ${who(r)}.`;
  const path = `/sermons/${slug}`;
  const data = r.youtube
    ? { '@type': 'VideoObject', name: r.title, description, uploadDate: r.date, thumbnailUrl: `https://i.ytimg.com/vi/${r.youtube}/hqdefault.jpg`,
        embedUrl: `https://www.youtube.com/embed/${r.youtube}`, publisher: ORG }
    : article(r.title, description, path, r.date);
  return page(env, origin, { title: r.title, description, current: 'sermons.html', depth: 1, bodyClass: 'no-hero', main, path, type: 'article',
    image: r.youtube ? `https://i.ytimg.com/vi/${r.youtube}/hqdefault.jpg` : undefined, data });
}

export async function summaryPage(env, origin, id) {
  const s = await env.DB.prepare(`SELECT m.body, m.sermon_slug, s.title FROM summaries m JOIN sermons s ON s.slug = m.sermon_slug
    WHERE m.id = ? AND m.kind = 'page'`).bind(id).first();
  if (!s) return null;
  const main = `  <article class="article">
    <header class="wrap article-head">
      <a class="back-link" href="../sermons/${s.sermon_slug}.html">← ${esc(s.title)}</a>
      <p class="kicker">Message summary</p>
      <h1>${esc(s.title)}</h1>
    </header>
    <div class="wrap article-body">${s.body}</div>
  </article>`;
  return page(env, origin, { title: s.title, description: `Message summary: ${s.title}`, current: 'sermons.html', depth: 1, bodyClass: 'no-hero', main, path: `/summaries/${id}`, type: 'article' });
}

// ---------------------------------------------------------------- music
export async function musicPage(env, origin) {
  const { results } = await env.DB.prepare('SELECT * FROM songs WHERE published = 1 ORDER BY kind, position, title').all();
  const songs = results.filter(s => s.kind === 'song').sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  const sessions = results.filter(s => s.kind === 'session');
  const worship = await env.DB.prepare(`SELECT title, youtube, youtube_start FROM sermons WHERE published = 1 AND youtube IS NOT NULL
    AND lower(title) LIKE '%worship%' ORDER BY date DESC LIMIT 1`).first();
  const songRows = songs.map(s => {
    const f = [['Audio', s.audio_key], ['Lyrics', s.lyrics]].filter(x => x[1]).map(x => `<span class="flag">${x[0]}</span>`).join('');
    return `<a class="list-row sermon-row" href="music/${s.slug}.html" data-item><span><span class="list-title">${esc(s.title)}</span>` +
      `${s.credit ? `<span class="row-sub">${esc(s.credit)}</span>` : ''}</span><span class="row-end">${f}</span></a>`;
  }).join('');
  const sessionRows = sessions.map(s => `<div class="session-row"><span class="list-title">${esc(s.title)}</span>${
    s.audio_key ? `<audio controls preload="none" src="${MEDIA_BASE}/${esc(s.audio_key)}"></audio>` : '<span class="status">Audio coming soon</span>'}</div>`).join('');
  const main = `${hero('Music', 'Songs and worship from Winnipeg Christian Assembly.',
    '<a class="btn btn-primary" href="#songs">Songs</a><a class="btn btn-line" href="#worship">Worship sessions</a>')}
${worship ? `
  <section class="section bg-white">
    <div class="wrap split">
      ${video(worship.youtube, worship.youtube_start, worship.title).replace('sermon-video', 'split-video')}
      <div>
        <p class="kicker">Sunday worship</p>
        <h2>Worship with us</h2>
        <p>Watch the worship from a recent Sunday service: ${esc(worship.title)}.</p>
        <div class="actions"><a class="btn btn-primary" href="teaching.html#messages">More services</a></div>
      </div>
    </div>
  </section>` : ''}

  <section class="section list-section" id="songs" data-sermons data-step="1000" data-noun="song">
    <div class="wrap narrow">
      <div class="browse-head"><h2 class="list-heading">Songs</h2><span class="muted" data-count></span></div>
      <div class="sermon-filters"><label class="filter"><span class="visually-hidden">Search songs</span><input type="search" placeholder="Search songs" data-search></label></div>
      <div class="list" data-list>${songRows}</div>
      <p class="muted" data-none hidden>No songs match.</p>
      <div class="center-actions" hidden><button type="button" class="btn btn-line" data-more>Show more</button></div>
    </div>
  </section>

  <section class="section bg-white list-section" id="worship">
    <div class="wrap narrow">
      <h2 class="list-heading">Worship sessions</h2>
      <p class="muted" style="margin-bottom:20px">Full recordings of worship from Sunday services.</p>
      <div class="sessions">${sessionRows}</div>
    </div>
  </section>`;
  return page(env, origin, { title: 'Music', description: 'Worship songs and recordings from Winnipeg Christian Assembly, with lyrics.', current: 'music.html', main, path: '/music' });
}

export async function songPage(env, origin, slug) {
  const s = await env.DB.prepare("SELECT * FROM songs WHERE slug = ? AND published = 1 AND kind = 'song'").bind(slug).first();
  if (!s) return null;
  const main = `  <article class="article">
    <header class="wrap article-head">
      <a class="back-link" href="../music.html">← Music</a>
      <p class="kicker">Song</p>
      <h1>${esc(s.title)}</h1>
      ${s.credit ? `<p class="article-meta"><span>${esc(s.credit)}</span></p>` : ''}
    </header>
    <div class="wrap article-body song-body">
      <div class="sermon-media">${s.audio_key ? player(s.audio_key) : ''}</div>
      ${s.lyrics ? `<h2>Lyrics</h2>${s.lyrics}` : ''}
    </div>
  </article>`;
  return page(env, origin, { title: s.title, description: `${s.title}: a song from Winnipeg Christian Assembly.`, current: 'music.html', depth: 1, bodyClass: 'no-hero', main, path: `/music/${slug}` });
}

// ---------------------------------------------------------------- devotionals
const devCard = (d, attrs = '') => card(`devotionals/${d.slug}.html`, d.title, d.excerpt, `${shortDate(d.date)} · ${esc(d.topic)}`, 'Read', attrs);

const chipRow = (group, values, hidden = false) => `<div class="tabs" role="group" data-filter-group="${group}"${hidden ? ' hidden' : ''}>` +
  '<button type="button" class="tab" data-value="" aria-pressed="true">All</button>' +
  values.map(([v, label]) => `<button type="button" class="tab" data-value="${esc(v)}" aria-pressed="false">${esc(label)}</button>`).join('') + '</div>';

export async function devotionalsIndex(env, origin) {
  const { results: devos } = await env.DB.prepare('SELECT slug, title, date, topic, excerpt FROM devotionals WHERE published = 1 ORDER BY date DESC, slug').all();
  const years = [...new Set(devos.map(d => d.date.slice(0, 4)))].map(y => [y, y]);
  const topics = [...new Set(devos.map(d => d.topic).filter(Boolean))].sort().map(t => [slugify(t), t]);
  const main = `${hero('Devotionals', 'Short reflections to start your day in the Word.')}

  <section class="section bg-white list-section">
    <div class="wrap">
      <h2 class="list-heading">Latest</h2>
      <div class="card-grid">${devos.slice(0, 6).map(d => devCard(d)).join('')}</div>
      <div class="center-actions"><button type="button" class="btn btn-dark" data-reveal="browse">See all ${devos.length} devotionals</button></div>
    </div>
  </section>

  <section class="section list-section" id="browse" data-browse data-step="12" hidden>
    <div class="wrap">
      <div class="browse-head">
        <h2 class="list-heading">All devotionals</h2>
        <div class="sort" role="group" aria-label="Sort by">
          <span class="muted">Sort by</span>
          <button type="button" class="sort-btn" data-mode="year" aria-pressed="true">Year</button>
          <button type="button" class="sort-btn" data-mode="topic" aria-pressed="false">Topic</button>
        </div>
      </div>
      ${chipRow('year', years)}
      ${chipRow('topic', topics, true)}
      <div class="card-grid" data-list>${devos.map(d => devCard(d, ` data-item data-year="${d.date.slice(0, 4)}" data-topic="${slugify(d.topic)}"`)).join('')}</div>
      <div class="center-actions"><button type="button" class="btn btn-line more-btn" data-more>Show more</button></div>
    </div>
  </section>
  <noscript><style>#browse { display: block !important; } [data-reveal] { display: none; }</style></noscript>`;
  return page(env, origin, { title: 'Devotionals', description: 'Short daily devotionals from Winnipeg Christian Assembly to start your day in the Word.', current: 'devotionals.html', main, path: '/devotionals' });
}

export async function devotionalPage(env, origin, slug) {
  const d = await env.DB.prepare('SELECT * FROM devotionals WHERE slug = ? AND published = 1').bind(slug).first();
  if (!d) return null;
  const newer = await env.DB.prepare('SELECT slug, title FROM devotionals WHERE published = 1 AND (date > ? OR (date = ? AND slug < ?)) ORDER BY date ASC, slug DESC LIMIT 1').bind(d.date, d.date, slug).first();
  const older = await env.DB.prepare('SELECT slug, title FROM devotionals WHERE published = 1 AND (date < ? OR (date = ? AND slug > ?)) ORDER BY date DESC, slug ASC LIMIT 1').bind(d.date, d.date, slug).first();
  const pager = '<nav class="pager" aria-label="More devotionals">' +
    (newer ? `<a class="pager-prev" href="${newer.slug}.html"><span>Newer</span>${esc(newer.title)}</a>` : '<span></span>') +
    (older ? `<a class="pager-next" href="${older.slug}.html"><span>Older</span>${esc(older.title)}</a>` : '<span></span>') + '</nav>';
  const main = `  <article class="article">
    <header class="wrap article-head">
      <a class="back-link" href="../devotionals.html">← All devotionals</a>
      <p class="kicker">Devotional</p>
      <h1>${esc(d.title)}</h1>
      <p class="article-meta"><span>${niceDate(d.date)}</span><span>${AUTHOR}</span><span>${minutes(d.body)} min read</span>${d.number ? `<span>No. ${esc(d.number)}</span>` : ''}</p>
    </header>${d.image ? `
    <div class="wrap"><div class="article-img"><img src="${esc(d.image)}" alt=""></div></div>` : ''}
    <div class="wrap article-body devotional-body">
      ${d.body}
      ${pager}
    </div>
  </article>`;
  return page(env, origin, { title: d.title, description: d.excerpt, current: 'devotionals.html', depth: 1, bodyClass: 'no-hero', main, path: `/devotionals/${slug}`, type: 'article',
    data: article(d.title, d.excerpt, `/devotionals/${slug}`, d.date) });
}

// Verse of the day. A new devotional is the verse of the day on its feature_on date (the day after it is added).
// Every other day it is a random devotional with a key verse, skipping the most recent half of the picks so nothing
// repeats soon. The pick is saved (verse_days) the first time it is needed and by the daily cron, so everyone
// sees the same verse all day.
export async function todaysVerse(env, today = winnipegDate()) {
  const cols = 'slug, title, verse_text AS text, verse_ref AS ref';
  const hasVerse = "published = 1 AND verse_text IS NOT NULL AND verse_text != ''";
  const save = (slug, kind) => env.DB.prepare('INSERT INTO verse_days (date, slug, kind) VALUES (?, ?, ?) ON CONFLICT(date) DO UPDATE SET slug = excluded.slug, kind = excluded.kind')
    .bind(today, slug, kind).run();
  const done = await env.DB.prepare('SELECT slug, kind FROM verse_days WHERE date = ?').bind(today).first();

  const featured = await env.DB.prepare(`SELECT ${cols} FROM devotionals WHERE ${hasVerse} AND feature_on = ? ORDER BY slug LIMIT 1`).bind(today).first();
  if (featured) {
    if (!(done && done.kind === 'featured' && done.slug === featured.slug)) await save(featured.slug, 'featured');
    return featured;
  }
  if (done && done.kind === 'random') {
    const v = await env.DB.prepare(`SELECT ${cols} FROM devotionals WHERE ${hasVerse} AND slug = ?`).bind(done.slug).first();
    if (v) return v; // otherwise it was unpublished since this morning: pick again
  }

  const { results: all } = await env.DB.prepare(`SELECT ${cols} FROM devotionals WHERE ${hasVerse} AND (feature_on IS NULL OR feature_on < ?)`)
    .bind(today).all();
  if (!all.length) return null;
  const { results: recent } = await env.DB.prepare('SELECT slug FROM verse_days WHERE date < ? ORDER BY date DESC LIMIT ?')
    .bind(today, Math.floor(all.length / 2)).all();
  const seen = new Set(recent.map(r => r.slug));
  const fresh = all.filter(d => !seen.has(d.slug));
  const pool = fresh.length ? fresh : all;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  await save(pick.slug, 'random');
  return pick;
}

// Kept for pages cached before the verse moved to the Worker: a one-item list, so any day picks today's verse.
export async function versesJson(env) {
  const verse = await todaysVerse(env);
  return new Response(JSON.stringify(verse ? [verse] : []), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-cache' } });
}

// ---------------------------------------------------------------- Bible study
export async function bibleStudyIndex(env, origin) {
  const { results: studies } = await env.DB.prepare('SELECT slug, title, kind, topic, excerpt, body FROM studies WHERE published = 1 ORDER BY position, title').all();
  const topics = [];
  studies.forEach(s => { const t = s.topic || (s.kind === 'article' ? 'Articles' : 'More studies'); if (!topics.includes(t)) topics.push(t); });
  const cards = studies.map(s => {
    const t = s.topic || (s.kind === 'article' ? 'Articles' : 'More studies');
    return card(`bible-study/${s.slug}.html`, s.title, s.excerpt, `${esc(t)} · ${minutes(s.body)} min read`, 'Read', ` data-item data-topic="${slugify(t)}"`);
  }).join('');
  const section = `<section class="section bg-white list-section" id="outlines" data-browse>
    <div class="wrap">
      <div class="browse-head"><h2 class="list-heading">Study outlines</h2></div>
      ${chipRow('topic', topics.map(t => [slugify(t), t]))}
      <div class="card-grid" data-list>${cards}</div>
    </div>
  </section>`;
  // bible-study.html is the template: its outlines section is replaced with the studies from the database
  const shell = await getShell(env, origin, '/bible-study');
  const start = shell.indexOf('<section class="section bg-white list-section" id="outlines"');
  const end = shell.indexOf('</section>', start) + '</section>'.length;
  return html(start === -1 ? shell : shell.slice(0, start) + section + shell.slice(end));
}

function sectionBar(body) {
  const links = [...body.matchAll(/<h([234]) id="([^"]+)">([\s\S]*?)<\/h\1>/g)]
    .map(m => [m[2], m[3].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()]).filter(x => x[1]);
  if (links.length < 3) return '';
  return `<nav class="topic-bar" aria-label="Sections"><div class="wrap"><div class="chips">${
    links.map(([id, t]) => `<a href="#${esc(id)}" data-topic-link title="${esc(t)}">${esc(t)}</a>`).join('')}</div></div></nav>`;
}

export async function studyPage(env, origin, slug) {
  const s = await env.DB.prepare('SELECT * FROM studies WHERE slug = ? AND published = 1').bind(slug).first();
  if (!s) return null;
  const main = `  <article class="article">
    <header class="wrap article-head">
      <a class="back-link" href="../bible-study.html">← Bible study</a>
      <p class="kicker">${s.kind === 'article' ? 'Article' : 'Study outline'}</p>
      <h1>${esc(s.title)}</h1>
      <p class="article-meta"><span>${AUTHOR}</span><span>${minutes(s.body)} min read</span></p>
      ${s.pdf_url ? `<div class="actions"><a class="btn btn-dark btn-sm" href="${esc(s.pdf_url)}" download>Download PDF</a></div>` : ''}
    </header>
    ${sectionBar(s.body)}
    <div class="wrap article-body study-body">
      ${s.body}
    </div>
  </article>`;
  const description = s.excerpt || excerpt(s.body);
  return page(env, origin, { title: s.title, description, current: 'bible-study.html', depth: 1, bodyClass: 'no-hero', main, path: `/bible-study/${slug}`, type: 'article',
    data: article(s.title, description, `/bible-study/${slug}`) });
}

// ---------------------------------------------------------------- this week (Church life)
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Today's date in Winnipeg, as YYYY-MM-DD.
const winnipegToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Winnipeg' }).format(new Date());
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekday = iso => new Date(`${iso}T12:00:00Z`).getUTCDay();

function clock(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}`;
}
const half = t => (Number(t.split(':')[0]) < 12 ? 'a.m.' : 'p.m.');
// "7:00 – 9:00 p.m.", "10:00 a.m. – 1:00 p.m.", "7:00 p.m."
function timeRange(start, end) {
  if (!start) return '';
  if (!end) return `${clock(start)} ${half(start)}`;
  return half(start) === half(end) ? `${clock(start)} – ${clock(end)} ${half(end)}` : `${clock(start)} ${half(start)} – ${clock(end)} ${half(end)}`;
}

const happensOn = (e, iso) => {
  if (e.recurs === 'once') return e.date === iso;
  if (e.date && iso < e.date) return false;
  if (e.end_date && iso > e.end_date) return false;
  return e.recurs === 'daily' || parseList(e.days).map(Number).includes(weekday(iso));
};

const joinLink = e => `<a class="arrow-link" href="visit.html?join=${encodeURIComponent(e.title)}#connect">Reach out to join</a>`;
const eventWhere = e => (e.contact_to_join ? joinLink(e) : e.location ? `<span class="ev-where">${esc(e.location)}</span>` : '');

export async function weekHtml(env) {
  const { results: events } = await env.DB.prepare('SELECT * FROM events WHERE published = 1 ORDER BY start_time, title').all();
  const today = winnipegToday();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const dayLabel = iso => { const [, m, d] = iso.split('-').map(Number); return `${MONTH_NAMES[m - 1]} ${d}`; };

  // Daily events sit in one "Every day" bar, grouped by name ("Daily prayer · 12:00 – 1:00 a.m. and 6:00 – 7:00 a.m.").
  const daily = events.filter(e => e.recurs === 'daily' && days.some(d => happensOn(e, d)));
  const groups = [...daily.reduce((m, e) => m.set(e.title, [...(m.get(e.title) || []), e]), new Map())];
  const everyDay = groups.length ? `<div class="everyday"><span class="everyday-label">Every day</span>${groups.map(([title, list]) =>
    `<p><strong>${esc(title)}</strong> <span class="ev-time">${list.map(e => timeRange(e.start_time, e.end_time)).filter(Boolean).join(' and ')}</span>
      ${list[0].details ? `<span class="ev-details">${esc(list[0].details)}</span>` : ''}${list.some(e => e.contact_to_join) ? joinLink(list[0]) : eventWhere(list[0])}</p>`).join('')}</div>` : '';

  const week = days.map((iso, i) => {
    const on = events.filter(e => e.recurs !== 'daily' && happensOn(e, iso));
    return `<div class="day${i === 0 ? ' is-today' : ''}${on.length ? '' : ' is-empty'}">
      <p class="day-head"><span>${i === 0 ? 'Today' : WEEKDAYS[weekday(iso)].slice(0, 3)}</span>${dayLabel(iso)}</p>
      ${on.length ? on.map(e => `<div class="ev">${e.start_time ? `<span class="ev-time">${timeRange(e.start_time, e.end_time)}</span>` : ''}
        <strong>${esc(e.title)}</strong>${e.details ? `<span class="ev-details">${esc(e.details)}</span>` : ''}${eventWhere(e)}</div>`).join('')
        : '<span class="day-none">—</span>'}</div>`;
  }).join('');

  // One-time events after this week, up to three months out.
  const later = events.filter(e => e.recurs === 'once' && e.date > days[6] && e.date <= addDays(today, 90)).sort((a, b) => a.date.localeCompare(b.date));
  const comingUp = later.length ? `<div class="coming-up"><h3>Coming up</h3>${later.map(e => `<div class="list-row"><span class="list-title">${esc(e.title)}${
    e.start_time ? ` · ${timeRange(e.start_time, e.end_time)}` : ''}${e.location && !e.contact_to_join ? ` · ${esc(e.location)}` : ''}</span><span class="list-date">${
    WEEKDAYS[weekday(e.date)].slice(0, 3)}, ${dayLabel(e.date)}</span></div>`).join('')}</div>` : '';

  return `<p class="week-range">${WEEKDAYS[weekday(days[0])]}, ${dayLabel(days[0])} – ${WEEKDAYS[weekday(days[6])]}, ${dayLabel(days[6])}</p>
    ${everyDay}<div class="week">${week}</div>${comingUp}`;
}

// ---------------------------------------------------------------- bulletin (Church life)
// Which message the bulletin points to. Sunday: the live service. Monday–Tuesday: the newest message (it should be
// uploaded by Monday). Wednesday–Thursday, Friday and Saturday: a message from the archive, picked at random for that
// stretch from the date, so everyone sees the same one and nothing needs saving.
const hashOf = s => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
async function meditation(env, today) {
  const day = weekday(today);
  if (day === 0) return { live: true };
  const latest = await env.DB.prepare('SELECT slug, title, date FROM sermons WHERE published = 1 ORDER BY date DESC LIMIT 1').first();
  if (!latest) return null;
  if (day === 1 || day === 2) return { latest: true, sermon: latest };
  const { results: archive } = await env.DB.prepare('SELECT slug, title, date FROM sermons WHERE published = 1 AND slug != ? ORDER BY date, slug').bind(latest.slug).all();
  if (!archive.length) return { latest: true, sermon: latest };
  const stretch = day === 4 ? addDays(today, -1) : today; // Thursday keeps Wednesday's message
  return { sermon: archive[hashOf(stretch) % archive.length] };
}

// Announcements from WCA Admin, then two standing reminders: meditate on the latest message, and Wednesday Bible study.
export async function bulletinHtml(env) {
  const today = winnipegToday();
  const { results: notes } = await env.DB.prepare(`SELECT title, body, link_url, link_label FROM announcements WHERE published = 1
    AND (show_from IS NULL OR show_from <= ?) AND (show_until IS NULL OR show_until >= ?) ORDER BY COALESCE(show_from, '') DESC, updated_at DESC`)
    .bind(today, today).all();
  const meditate = await meditation(env, today);
  const study = await env.DB.prepare("SELECT * FROM events WHERE published = 1 AND recurs != 'daily' AND lower(title) LIKE '%bible study%' ORDER BY start_time LIMIT 1").first();
  const next = study && Array.from({ length: 14 }, (_, i) => addDays(today, i)).find(d => happensOn(study, d));
  const dayName = iso => { const [, m, d] = iso.split('-').map(Number); return `${WEEKDAYS[weekday(iso)]}, ${MONTH_NAMES[m - 1]} ${d}`; };

  const items = notes.map(n => `<li class="note"><strong>${esc(n.title)}</strong>${n.body ? `<p>${esc(n.body)}</p>` : ''}${n.link_url
    ? `<a class="arrow-link" href="${esc(n.link_url)}"${/^https?:/i.test(n.link_url) ? ' target="_blank" rel="noopener"' : ''}>${esc(n.link_label || 'Find out more')}</a>` : ''}</li>`);
  if (meditate?.live) items.push(`<li><strong>Today’s message</strong><p>Join us at 10:00 a.m. at 90 Ashland Avenue, or watch the service live.</p>
    <a class="arrow-link" href="https://www.youtube.com/@WinnipegChristianAssembly/live" target="_blank" rel="noopener">Watch live</a></li>`);
  else if (meditate?.latest) items.push(`<li><strong>Meditate on the message</strong><p>Take time this week to go back over “${esc(meditate.sermon.title)}” and let it sink in.</p>
    <a class="arrow-link" href="sermons/${esc(meditate.sermon.slug)}.html">Review the message</a></li>`);
  else if (meditate) items.push(`<li><strong>Meditate on the message</strong><p>From the archive: “${esc(meditate.sermon.title)}” (${niceDate(meditate.sermon.date)}). Go back over it and let it speak to you.</p>
    <a class="arrow-link" href="sermons/${esc(meditate.sermon.slug)}.html">Review the message</a></li>`);
  if (next) items.push(`<li><strong>${esc(study.title)} on ${WEEKDAYS[weekday(next)]}</strong><p>${dayName(next)}${study.start_time ? ` · ${timeRange(study.start_time, study.end_time)}` : ''}${
    study.location ? ` · ${esc(study.location)}` : ''}</p><a class="arrow-link" href="bible-study.html">Study outlines</a></li>`);
  return items.length ? `<ul class="bulletin">${items.join('')}</ul>` : '';
}
