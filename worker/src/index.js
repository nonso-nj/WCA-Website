// Winnipeg Christian Assembly site: static pages from redesign/, content pages from the D1 database,
// public forms, and the admin API. See wrangler.jsonc for which paths reach this Worker first.
import { json, SITE_URL, MEDIA_BASE, winnipegDate } from './util.js';
import { rateLimited } from './auth.js';
import { handleAdmin } from './admin.js';
import * as render from './render.js';

const PRAYER_DAYS = 90; // prayer and pastoral care requests are deleted after this many days

export default {
  async fetch(request, env) {
    const res = await route(request, env);
    // The staging address (*.workers.dev) must stay out of search results until the real domain goes live.
    if (new URL(request.url).hostname.endsWith('.workers.dev') && (res.headers.get('content-type') || '').includes('text/html')) {
      const headers = new Headers(res.headers);
      headers.set('x-robots-tag', 'noindex, nofollow');
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    }
    return res;
  },

  // Daily: settle the verse of the day (so the rotation moves on even if nobody visits), then delete prayer requests
  // older than PRAYER_DAYS, expired admin sessions and old rate-limit rows.
  async scheduled(event, env) {
    await render.todaysVerse(env).catch(err => console.error(err));
    await env.DB.prepare(`DELETE FROM submissions WHERE kind = 'prayer' AND created_at < datetime('now', ?)`).bind(`-${PRAYER_DAYS} days`).run();
    await env.DB.prepare("DELETE FROM sessions WHERE expires_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')").run();
    await env.DB.prepare("DELETE FROM rate_limits WHERE window_start < datetime('now', '-1 day')").run();
    await env.DB.prepare("DELETE FROM engagement WHERE day < date('now', '-400 days')").run();
  },
};

// Which page or API answers a request. Most paths fall through to the static files in redesign/.
async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\.html$/, '').replace(/\/+$/, '') || '/';
  const origin = url.origin;

  try {
    if (path.startsWith('/api/admin/')) return await handleAdmin(request, env, path.slice('/api/admin/'.length));
    if (path.startsWith('/api/forms/') && request.method === 'POST') return await handleForm(request, env, path.slice('/api/forms/'.length));
    if (path === '/api/track' && request.method === 'POST') return await track(request, env);

    if (request.method === 'GET' || request.method === 'HEAD') {
      let res = null;
      let m;
      if (path === '/robots.txt') return robots(url);
      if (path === '/sitemap.xml') return sitemap(env);
      if (path === '/sermons') res = await render.sermonsArchive(env, origin);
      else if ((m = path.match(/^\/sermons\/([\w-]+)$/))) res = await render.sermonPage(env, origin, m[1]);
      else if ((m = path.match(/^\/summaries\/(\d+)$/))) res = await render.summaryPage(env, origin, Number(m[1]));
      else if (path === '/music') res = await render.musicPage(env, origin);
      else if ((m = path.match(/^\/music\/([\w-]+)$/))) res = await render.songPage(env, origin, m[1]);
      else if (path === '/devotionals') res = await render.devotionalsIndex(env, origin);
      else if ((m = path.match(/^\/devotionals\/([\w-]+)$/))) res = await render.devotionalPage(env, origin, m[1]);
      else if (path === '/bible-study') res = await render.bibleStudyIndex(env, origin);
      else if ((m = path.match(/^\/bible-study\/([\w-]+)$/))) res = await render.studyPage(env, origin, m[1]);
      else if (path === '/data/verses.json') res = await render.versesJson(env);
      else if (path === '/' || path === '/index' || path === '/teaching') res = await withLiveBits(request, env);
      else if (path === '/church-life') res = await withWeek(request, env);
      if (res) return res;
      if (/^\/(sermons|music|devotionals|bible-study|summaries)\//.test(path)) {
        return env.ASSETS.fetch(new Request(`${origin}/404`, request)).then(r => new Response(r.body, { status: 404, headers: r.headers }));
      }
    }
    return env.ASSETS.fetch(request);
  } catch (err) {
    console.error(err);
    return path.startsWith('/api/') ? json({ error: 'Something went wrong. Please try again.' }, 500) : new Response('Something went wrong.', { status: 500 });
  }
}

// ---------------------------------------------------------------- search engines
// Staging (*.workers.dev) asks every crawler to stay away; the real domain points them at the sitemap.
function robots(url) {
  const body = url.hostname.endsWith('.workers.dev')
    ? 'User-agent: *\nDisallow: /\n'
    : `User-agent: *\nDisallow: /admin/\nDisallow: /api/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}

// Every public page, including each published sermon, devotional, study and song, with when it last changed.
const STATIC_PAGES = ['/', '/visit', '/who-we-are', '/teaching', '/sermons', '/devotionals', '/bible-study', '/music', '/church-life', '/missions', '/care', '/operations'];
async function sitemap(env) {
  const q = sql => env.DB.prepare(sql).all().then(r => r.results);
  const [sermons, devotionals, studies, songs] = await Promise.all([
    q('SELECT slug, updated_at FROM sermons WHERE published = 1'),
    q('SELECT slug, updated_at FROM devotionals WHERE published = 1'),
    q('SELECT slug, updated_at FROM studies WHERE published = 1'),
    q("SELECT slug, updated_at FROM songs WHERE published = 1 AND kind = 'song'"),
  ]);
  const entry = (path, updated) => `<url><loc>${SITE_URL}${path}</loc>${updated ? `<lastmod>${updated.slice(0, 10)}</lastmod>` : ''}</url>`;
  const urls = [
    ...STATIC_PAGES.map(p => entry(p)),
    ...sermons.map(r => entry(`/sermons/${r.slug}`, r.updated_at)),
    ...devotionals.map(r => entry(`/devotionals/${r.slug}`, r.updated_at)),
    ...studies.map(r => entry(`/bible-study/${r.slug}`, r.updated_at)),
    ...songs.map(r => entry(`/music/${r.slug}`, r.updated_at)),
  ];
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`,
    { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}

// Home and Teaching are static pages; fill in the live sermon count (data-sermon-count) and today's verse (data-votd-*).
async function withLiveBits(request, env) {
  const res = await env.ASSETS.fetch(request);
  if (!res.ok || !(res.headers.get('content-type') || '').includes('text/html')) return res;
  const [row, verse] = await Promise.all([
    env.DB.prepare('SELECT count(*) n FROM sermons WHERE published = 1').first().catch(() => null),
    render.todaysVerse(env).catch(err => { console.error(err); return null; }),
  ]);
  if (!row && !verse) return res; // keep what is written in the page
  const headers = new Headers(res.headers);
  headers.delete('etag');
  headers.set('cache-control', 'no-cache');
  const rw = new HTMLRewriter();
  if (row) rw.on('[data-sermon-count]', { element(el) { el.setInnerContent(String(row.n)); } });
  if (verse) {
    rw.on('[data-votd-text]', { element(el) { el.setInnerContent(`“${verse.text}”`); } })
      .on('[data-votd-ref]', { element(el) { el.setInnerContent(verse.ref || ''); } })
      .on('[data-votd-title]', { element(el) { el.setInnerContent(verse.title); } })
      .on('[data-votd-link]', { element(el) { el.setAttribute('href', `devotionals/${verse.slug}.html`); } });
  }
  return rw.transform(new Response(res.body, { status: res.status, headers }));
}

// Church life is a static page; the Worker fills in this week's calendar and the bulletin from the database.
async function withWeek(request, env) {
  const res = await env.ASSETS.fetch(request);
  if (!res.ok || !(res.headers.get('content-type') || '').includes('text/html')) return res;
  const [week, bulletin] = await Promise.all([
    render.weekHtml(env).catch(err => { console.error(err); return null; }),
    render.bulletinHtml(env).catch(err => { console.error(err); return null; }),
  ]);
  if (!week && !bulletin) return res; // keep the fallback written in the page
  const headers = new Headers(res.headers);
  headers.delete('etag');
  headers.set('cache-control', 'no-cache');
  return new HTMLRewriter()
    .on('[data-week]', { element(el) { if (week) el.setInnerContent(week, { html: true }); } })
    .on('[data-bulletin]', { element(el) { if (bulletin) el.setInnerContent(bulletin, { html: true }); } })
    .transform(new Response(res.body, { status: res.status, headers }));
}

// ---------------------------------------------------------------- insights
// Counts a page view, audio play, video play or PDF download (sent by site.js) as a daily total. Nothing about the
// visitor is stored. Crawlers are ignored, and only paths and files that belong to the site are accepted.
const BOTS = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse/i;
async function track(request, env) {
  const done = new Response(null, { status: 204 });
  if (BOTS.test(request.headers.get('user-agent') || '')) return done;
  const { a, t } = await request.json().catch(() => ({}));
  if (typeof t !== 'string' || t.length > 300) return done;
  let target = null;
  const here = new URL(request.url).origin;
  if (a === 'view' || a === 'video') {
    const p = t.replace(/\.html$/, '').replace(/\/+$/, '') || '/';
    if (/^\/[\w-]*(\/[\w-]+)?$/.test(p) && !p.startsWith('/admin')) target = p === '/index' ? '/' : p;
  } else if (a === 'play' && t.startsWith(MEDIA_BASE + '/')) {
    target = decodeURIComponent(t.slice(MEDIA_BASE.length + 1));
  } else if (a === 'download' && /\.pdf$/i.test(t.split('?')[0])) {
    if (t.startsWith(MEDIA_BASE + '/')) target = t.split('?')[0];
    else if (t.startsWith(here + '/media/')) target = decodeURIComponent(t.slice(here.length).split('?')[0]);
  }
  if (!target) return done;
  await env.DB.prepare(`INSERT INTO engagement (day, action, target, count) VALUES (?, ?, ?, 1)
    ON CONFLICT(day, action, target) DO UPDATE SET count = count + 1`).bind(winnipegDate(), a, target).run();
  return done;
}

// ---------------------------------------------------------------- public forms
const FORMS = {
  visit: { required: ['first_name', 'email'], fields: ['first_name', 'last_name', 'email', 'phone', 'heard', 'topic', 'meet', 'message', 'consent'] },
  prayer: { required: ['request', 'consent'], fields: ['need', 'first_name', 'last_name', 'email', 'phone', 'request', 'contact', 'consent'] },
};

async function handleForm(request, env, kind) {
  const form = FORMS[kind];
  if (!form) return json({ error: 'Unknown form.' }, 404);
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  if (await rateLimited(env, `form:${ip}`, 5, 60)) return json({ error: 'Too many submissions. Please try again later.' }, 429);
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: 'Please fill in the form.' }, 400);
  if (body.website) return json({ ok: true }); // hidden field that only bots fill in
  const data = {};
  for (const f of form.fields) {
    const v = body[f];
    if (v === true || v === false) data[f] = v;
    else if (v != null && String(v).trim()) data[f] = String(v).trim().slice(0, f === 'request' || f === 'message' ? 5000 : 200);
  }
  const missing = form.required.filter(f => !data[f]);
  if (missing.length) return json({ error: 'Please fill in the required fields.', missing }, 400);
  if (data.email && !/^\S+@\S+\.\S+$/.test(data.email)) return json({ error: 'Please check your email address.', missing: ['email'] }, 400);
  await env.DB.prepare('INSERT INTO submissions (kind, data) VALUES (?, ?)').bind(kind, JSON.stringify(data)).run();
  // Email copies to the church inbox are switched on once the domain is connected (Cloudflare Email Routing).
  return json({ ok: true });
}
