// Winnipeg Christian Assembly site: static pages from redesign/, content pages from the D1 database,
// public forms, and the admin API. See wrangler.jsonc for which paths reach this Worker first.
import { json } from './util.js';
import { rateLimited } from './auth.js';
import { handleAdmin } from './admin.js';
import * as render from './render.js';

const PRAYER_DAYS = 90; // prayer and pastoral care requests are deleted after this many days

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\.html$/, '').replace(/\/+$/, '') || '/';
    const origin = url.origin;

    try {
      if (path.startsWith('/api/admin/')) return await handleAdmin(request, env, path.slice('/api/admin/'.length));
      if (path.startsWith('/api/forms/') && request.method === 'POST') return await handleForm(request, env, path.slice('/api/forms/'.length));

      if (request.method === 'GET' || request.method === 'HEAD') {
        let res = null;
        let m;
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
  },

  // Daily: delete prayer requests older than PRAYER_DAYS, expired admin sessions and old rate-limit rows.
  async scheduled(event, env) {
    await env.DB.prepare(`DELETE FROM submissions WHERE kind = 'prayer' AND created_at < datetime('now', ?)`).bind(`-${PRAYER_DAYS} days`).run();
    await env.DB.prepare("DELETE FROM sessions WHERE expires_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')").run();
    await env.DB.prepare("DELETE FROM rate_limits WHERE window_start < datetime('now', '-1 day')").run();
  },
};

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
