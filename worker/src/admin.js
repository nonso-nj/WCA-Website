// Admin API: everything under /api/admin/ requires a signed-in editor.
import { json, slugify, winnipegDate, sanitize, excerpt, plainText, youtubeId, parseList, addHeadingIds, MEDIA_BASE } from './util.js';
import { hashPassword, verifyPassword, createSession, clearCookie, currentUser, endSession, rateLimited } from './auth.js';

// What each content type stores, and which fields hold editor (rich text) HTML.
const COLLECTIONS = {
  sermons: {
    order: 'date DESC, title', listCols: 'slug, title, date, published, audio_key, youtube',
    fields: ['title', 'date', 'speakers', 'series', 'topics', 'description', 'youtube', 'audio_key', 'notes_url', 'published'],
    rich: ['description'], lists: ['speakers', 'series', 'topics'],
  },
  songs: {
    order: 'kind, title', listCols: "slug, title, kind, credit AS date, published, audio_key",
    fields: ['title', 'kind', 'credit', 'lyrics', 'audio_key', 'published'], rich: ['lyrics'], lists: [],
  },
  devotionals: {
    order: 'date DESC, slug', listCols: 'slug, title, date, feature_on, published',
    fields: ['title', 'number', 'date', 'topic', 'body', 'verse_text', 'verse_ref', 'image', 'feature_on', 'published'], rich: ['body'], lists: [],
  },
  studies: {
    order: 'position, title', listCols: 'slug, title, topic AS date, published',
    fields: ['title', 'kind', 'topic', 'body', 'pdf_url', 'published'], rich: ['body'], lists: [],
  },
  events: {
    order: "CASE recurs WHEN 'daily' THEN 0 WHEN 'weekly' THEN 1 ELSE 2 END, date, start_time, title",
    listCols: 'slug, title, recurs, days, date, start_time, end_time, published',
    fields: ['title', 'recurs', 'days', 'date', 'end_date', 'start_time', 'end_time', 'location', 'details', 'contact_to_join', 'published'],
    rich: [], lists: [],
  },
  announcements: {
    order: "COALESCE(show_from, '') DESC, updated_at DESC",
    listCols: 'slug, title, show_from, show_until, published',
    fields: ['title', 'body', 'link_url', 'link_label', 'show_from', 'show_until', 'published'],
    rich: [], lists: [],
  },
};

const bad = (msg, status = 400) => json({ error: msg }, status);

export async function handleAdmin(request, env, path) {
  const method = request.method;

  // ---- sign in / out (no session needed)
  if (path === 'login' && method === 'POST') {
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    if (await rateLimited(env, `login:${ip}`, 10, 15)) return bad('Too many attempts. Please wait 15 minutes and try again.', 429);
    const { email = '', password = '' } = await request.json().catch(() => ({}));
    const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email.trim().toLowerCase()).first();
    if (!user || !(await verifyPassword(password, user))) return bad('That email and password don’t match.', 401);
    return json({ ok: true }, 200, { 'set-cookie': await createSession(env, user.id) });
  }

  // Everything else needs a signed-in editor, and (against cross-site requests) our own header.
  const user = await currentUser(request, env);
  if (!user) return bad('Please sign in.', 401);
  if (method !== 'GET' && request.headers.get('x-wca-admin') !== '1') return bad('Missing admin header.', 403);

  if (path === 'logout' && method === 'POST') {
    await endSession(request, env);
    return json({ ok: true }, 200, { 'set-cookie': clearCookie });
  }
  if (path === 'me') return json({ user, mediaBase: MEDIA_BASE });

  if (path === 'password' && method === 'POST') {
    const { current = '', next = '' } = await request.json();
    const full = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
    if (!(await verifyPassword(current, full))) return bad('Your current password is not right.');
    if (next.length < 10) return bad('Choose a password of at least 10 characters.');
    const { hash, salt } = await hashPassword(next);
    await env.DB.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?').bind(hash, salt, user.id).run();
    return json({ ok: true });
  }

  // ---- uploads to R2 (multipart, so large recordings work)
  if (path.startsWith('upload/')) return handleUpload(request, env, path.slice(7), user);

  // ---- form inbox
  if (path.startsWith('submissions')) return handleSubmissions(request, env, path, user);

  // ---- editors (owner only)
  if (path.startsWith('users')) return handleUsers(request, env, path, user);

  // ---- options for pickers (speakers, series, topics)
  if (path === 'options') {
    const { results } = await env.DB.prepare('SELECT speakers, series, topics FROM sermons').all();
    const set = k => [...new Set(results.flatMap(r => parseList(r[k])))].sort((a, b) => a.localeCompare(b));
    const devTopics = (await env.DB.prepare("SELECT DISTINCT topic FROM devotionals WHERE topic != '' ORDER BY topic").all()).results.map(r => r.topic);
    const studyTopics = (await env.DB.prepare("SELECT DISTINCT topic FROM studies WHERE topic != '' ORDER BY topic").all()).results.map(r => r.topic);
    return json({ speakers: set('speakers'), series: set('series'), topics: set('topics'), devotionalTopics: devTopics, studyTopics });
  }

  // ---- content collections
  const [name, slug] = path.split('/');
  const c = COLLECTIONS[name];
  if (!c) return bad('Not found.', 404);

  if (!slug && method === 'GET') {
    const { results } = await env.DB.prepare(`SELECT ${c.listCols} FROM ${name} ORDER BY ${c.order}`).all();
    return json({ items: results });
  }
  if (!slug && method === 'POST') {
    const body = await request.json();
    if (!body.title) return bad('Give it a title first.');
    let base = slugify(body.title) || 'untitled', s = base, n = 2;
    while (await env.DB.prepare(`SELECT 1 FROM ${name} WHERE slug = ?`).bind(s).first()) s = `${base}-${n++}`;
    await save(env, name, c, s, body, true);
    return json({ ok: true, slug: s });
  }
  if (slug && method === 'GET') {
    const row = await env.DB.prepare(`SELECT * FROM ${name} WHERE slug = ?`).bind(slug).first();
    if (!row) return bad('Not found.', 404);
    c.lists.forEach(k => { row[k] = parseList(row[k]); });
    if (name === 'sermons') {
      row.summaries = (await env.DB.prepare('SELECT id, kind, url, body FROM summaries WHERE sermon_slug = ? ORDER BY position, id').bind(slug).all()).results;
      if (row.youtube) row.youtube_url = `https://www.youtube.com/watch?v=${row.youtube}${row.youtube_start ? `&t=${row.youtube_start}` : ''}`;
    }
    return json({ item: row });
  }
  if (slug && method === 'PUT') {
    if (!(await env.DB.prepare(`SELECT 1 FROM ${name} WHERE slug = ?`).bind(slug).first())) return bad('Not found.', 404);
    await save(env, name, c, slug, await request.json(), false);
    return json({ ok: true, slug });
  }
  if (slug && method === 'DELETE') {
    await env.DB.prepare(`DELETE FROM ${name} WHERE slug = ?`).bind(slug).run();
    if (name === 'sermons') await env.DB.prepare('DELETE FROM summaries WHERE sermon_slug = ?').bind(slug).run();
    return json({ ok: true });
  }
  return bad('Not found.', 404);
}

async function save(env, name, c, slug, body, isNew) {
  const row = {};
  for (const f of c.fields) {
    if (!(f in body)) continue;
    let v = body[f];
    if (c.rich.includes(f)) v = await sanitize(v);
    if (f === 'body' && name === 'studies') v = addHeadingIds(v);
    else if (c.lists.includes(f)) v = JSON.stringify((Array.isArray(v) ? v : String(v || '').split(',')).map(x => String(x).trim()).filter(Boolean));
    else if (f === 'published') v = v ? 1 : 0;
    else v = v === '' || v == null ? null : String(v).trim();
    row[f] = v;
  }
  if (name === 'sermons') {
    if ('youtube_url' in body) {
      const { id, start } = youtubeId(body.youtube_url);
      row.youtube = id; row.youtube_start = start;
    }
    if ('description' in row) row.summary = excerpt(row.description, 150);
    row.date = row.date || new Date().toISOString().slice(0, 10);
  }
  if (name === 'devotionals') {
    if ('body' in row) row.excerpt = excerpt(row.body, 150);
    row.date = row.date || new Date().toISOString().slice(0, 10);
    if (row.feature_on && !/^\d{4}-\d{2}-\d{2}$/.test(row.feature_on)) row.feature_on = null;
    // A new devotional is the verse of the day on the next free day (tomorrow, or the day after the last one queued).
    if (isNew && !row.feature_on) {
      const tomorrow = winnipegDate(1);
      const last = (await env.DB.prepare('SELECT max(feature_on) d FROM devotionals WHERE feature_on >= ?').bind(tomorrow).first())?.d;
      row.feature_on = last ? new Date(Date.parse(`${last}T12:00:00Z`) + 86400000).toISOString().slice(0, 10) : tomorrow;
    }
  }
  if (name === 'studies' && 'body' in row) row.excerpt = excerpt(row.body, 140);
  if (name === 'songs') row.kind = row.kind === 'session' ? 'session' : 'song';
  if (name === 'events') {
    if ('recurs' in row) row.recurs = ['once', 'weekly', 'daily'].includes(row.recurs) ? row.recurs : 'weekly';
    if ('days' in body) row.days = JSON.stringify([...new Set((Array.isArray(body.days) ? body.days : []).map(Number))].filter(d => d >= 0 && d <= 6).sort());
    if ('contact_to_join' in body) row.contact_to_join = body.contact_to_join ? 1 : 0;
    for (const k of ['start_time', 'end_time']) if (row[k] && !/^\d{2}:\d{2}$/.test(row[k])) row[k] = null;
    for (const k of ['date', 'end_date']) if (row[k] && !/^\d{4}-\d{2}-\d{2}$/.test(row[k])) row[k] = null;
    if ('location' in row) row.location = row.location || '';
    if ('details' in row) row.details = row.details || '';
  }
  if (name === 'announcements') {
    for (const k of ['show_from', 'show_until']) if (row[k] && !/^\d{4}-\d{2}-\d{2}$/.test(row[k])) row[k] = null;
    if (row.link_url && !/^(https?:\/\/|\/|[\w-]+\.html)/i.test(row.link_url)) row.link_url = null;
    if ('body' in row) row.body = row.body || '';
  }
  if (isNew) {
    if (!('title' in row)) row.title = body.title;
    if (name === 'sermons') { row.speakers ??= '[]'; row.series ??= '[]'; row.topics ??= '[]'; }
    if (!('published' in body)) row.published = 1;
    const cols = ['slug', ...Object.keys(row)];
    await env.DB.prepare(`INSERT INTO ${name} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).bind(slug, ...Object.values(row)).run();
  } else if (Object.keys(row).length) {
    await env.DB.prepare(`UPDATE ${name} SET ${Object.keys(row).map(k => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE slug = ?`)
      .bind(...Object.values(row), slug).run();
  }
  if (name === 'sermons' && Array.isArray(body.summaries)) {
    await env.DB.prepare('DELETE FROM summaries WHERE sermon_slug = ?').bind(slug).run();
    let pos = 1;
    for (const s of body.summaries) {
      if (s.kind === 'pdf' && s.url) {
        await env.DB.prepare("INSERT INTO summaries (sermon_slug, kind, url, position) VALUES (?, 'pdf', ?, ?)").bind(slug, s.url, pos++).run();
      } else if (s.kind === 'page' && plainText(s.body)) {
        await env.DB.prepare("INSERT INTO summaries (sermon_slug, kind, body, position) VALUES (?, 'page', ?, ?)").bind(slug, await sanitize(s.body), pos++).run();
      }
    }
  }
}

// ---------------------------------------------------------------- uploads
const FOLDERS = { sermons: 'sermons', songs: 'songs', notes: 'notes', summaries: 'summaries', images: 'images', studies: 'studies' };
const TYPES = /^(audio\/|video\/mp4|application\/pdf|image\/)/;

async function handleUpload(request, env, action) {
  const url = new URL(request.url);
  if (action === 'start' && request.method === 'POST') {
    const { filename = '', type = '', folder = '' } = await request.json();
    if (!FOLDERS[folder]) return bad('Unknown upload folder.');
    if (!TYPES.test(type)) return bad('That type of file can’t be uploaded here.');
    const ext = (filename.match(/\.([a-z0-9]{2,5})$/i) || [, 'bin'])[1].toLowerCase();
    const stem = slugify(filename.replace(/\.[^.]+$/, '')) || 'file';
    const year = new Date().getFullYear();
    const key = `${FOLDERS[folder]}/${year}/${stem}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const upload = await env.MEDIA.createMultipartUpload(key, {
      httpMetadata: { contentType: type, cacheControl: 'public, max-age=31536000' },
    });
    return json({ key, uploadId: upload.uploadId });
  }
  if (action === 'part' && request.method === 'PUT') {
    const key = url.searchParams.get('key'), uploadId = url.searchParams.get('uploadId'), part = Number(url.searchParams.get('part'));
    if (!key || !uploadId || !part) return bad('Missing upload details.');
    const upload = env.MEDIA.resumeMultipartUpload(key, uploadId);
    const uploaded = await upload.uploadPart(part, request.body);
    return json({ partNumber: uploaded.partNumber, etag: uploaded.etag });
  }
  if (action === 'complete' && request.method === 'POST') {
    const { key, uploadId, parts } = await request.json();
    const upload = env.MEDIA.resumeMultipartUpload(key, uploadId);
    await upload.complete(parts);
    return json({ key, url: `${MEDIA_BASE}/${key}` });
  }
  if (action === 'abort' && request.method === 'POST') {
    const { key, uploadId } = await request.json();
    await env.MEDIA.resumeMultipartUpload(key, uploadId).abort().catch(() => {});
    return json({ ok: true });
  }
  return bad('Not found.', 404);
}

// ---------------------------------------------------------------- form inbox
async function handleSubmissions(request, env, path, user) {
  const kinds = user.care_team ? ['visit', 'prayer'] : ['visit'];
  const id = Number(path.split('/')[1]);
  if (!id && request.method === 'GET') {
    const { results } = await env.DB.prepare(`SELECT id, kind, data, handled, created_at FROM submissions
      WHERE kind IN (${kinds.map(() => '?').join(',')}) ORDER BY created_at DESC LIMIT 500`).bind(...kinds).all();
    return json({ items: results.map(r => ({ ...r, data: JSON.parse(r.data) })), canSeePrayer: !!user.care_team });
  }
  const row = await env.DB.prepare('SELECT kind FROM submissions WHERE id = ?').bind(id).first();
  if (!row || !kinds.includes(row.kind)) return bad('Not found.', 404);
  if (request.method === 'PUT') {
    const { handled } = await request.json();
    await env.DB.prepare('UPDATE submissions SET handled = ? WHERE id = ?').bind(handled ? 1 : 0, id).run();
    return json({ ok: true });
  }
  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM submissions WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }
  return bad('Not found.', 404);
}

// ---------------------------------------------------------------- editors
async function handleUsers(request, env, path, user) {
  if (!user.is_owner) return bad('Only the site owner can manage editors.', 403);
  const id = Number(path.split('/')[1]);
  if (!id && request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT id, email, name, is_owner, care_team, created_at FROM users ORDER BY created_at').all();
    return json({ items: results });
  }
  if (!id && request.method === 'POST') {
    const { email = '', name = '', password = '', care_team = false, is_owner = false } = await request.json();
    if (!/^\S+@\S+\.\S+$/.test(email)) return bad('Enter a valid email address.');
    if (password.length < 10) return bad('The starting password must be at least 10 characters.');
    const { hash, salt } = await hashPassword(password);
    try {
      await env.DB.prepare('INSERT INTO users (email, name, password_hash, salt, care_team, is_owner) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(email.trim().toLowerCase(), name.trim(), hash, salt, care_team ? 1 : 0, is_owner ? 1 : 0).run();
    } catch { return bad('There is already an editor with that email.'); }
    return json({ ok: true });
  }
  if (id && request.method === 'PUT') {
    const body = await request.json();
    if (id === user.id && body.is_owner === false) return bad('You can’t remove your own owner access.');
    if ('care_team' in body) await env.DB.prepare('UPDATE users SET care_team = ? WHERE id = ?').bind(body.care_team ? 1 : 0, id).run();
    if ('is_owner' in body) await env.DB.prepare('UPDATE users SET is_owner = ? WHERE id = ?').bind(body.is_owner ? 1 : 0, id).run();
    if (body.password) {
      if (body.password.length < 10) return bad('The new password must be at least 10 characters.');
      const { hash, salt } = await hashPassword(body.password);
      await env.DB.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?').bind(hash, salt, id).run();
      await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run();
    }
    return json({ ok: true });
  }
  if (id && request.method === 'DELETE') {
    if (id === user.id) return bad('You can’t remove yourself.');
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }
  return bad('Not found.', 404);
}
