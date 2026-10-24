// WCA's YouTube channel. The cron (and the "Check YouTube now" button in WCA Admin) reads the channel's feed,
// keeps the list of recent videos that the Teaching page shows, and adds each finished Sunday to the sermon archive.
import { esc, slugify, excerpt, winnipegDate } from './util.js';

export const CHANNEL_ID = 'UCz9AoNNmq4lLpCqRT3wmZ4w';
const FEED = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
// Services before this date were not on YouTube's feed when importing started; add older ones by hand in WCA Admin.
const IMPORT_FROM = '2026-10-11';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const unxml = s => String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');

// "Sunday Worship Service | October 11, 2026" -> { name: 'Sunday Worship Service', date: '2026-10-11' }
function splitTitle(title) {
  const m = title.match(/^(.*?)\s*[|–—-]\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s*$/);
  if (!m || !MONTHS.includes(m[2].toLowerCase())) return { name: title.trim(), date: null };
  const month = String(MONTHS.indexOf(m[2].toLowerCase()) + 1).padStart(2, '0');
  return { name: m[1].trim(), date: `${m[4]}-${month}-${m[3].padStart(2, '0')}` };
}

const isFullService = name => /worship service/i.test(name);

export function parseFeed(xml) {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => {
    const get = re => unxml((e.match(re) || [])[1]);
    const title = get(/<title>([\s\S]*?)<\/title>/);
    const published = get(/<published>([^<]+)<\/published>/);
    const { name, date } = splitTitle(title);
    return {
      id: get(/<yt:videoId>([^<]+)<\/yt:videoId>/), title, name, published,
      date: date || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Winnipeg' }).format(new Date(published)),
      dated: Boolean(date),
      description: get(/<media:description>([\s\S]*?)<\/media:description>/),
    };
  }).filter(v => /^[\w-]{11}$/.test(v.id));
}

// For each Sunday keep one video: a sermon cut or a named message if there is one, otherwise the latest upload
// (a stream that failed is usually followed by a full re-upload).
function bestPerDate(videos) {
  const byDate = new Map();
  for (const v of videos) byDate.set(v.date, [...(byDate.get(v.date) || []), v]);
  return [...byDate.entries()].map(([date, list]) => {
    const latest = arr => arr.slice().sort((a, b) => b.published.localeCompare(a.published))[0];
    return { date, video: latest(list.filter(v => !isFullService(v.name))) || latest(list), all: list };
  });
}

const descriptionHtml = text => String(text || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
  .map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');

export async function syncYouTube(env) {
  const res = await fetch(FEED, { headers: { 'user-agent': 'Mozilla/5.0 (WCA website)' } });
  if (!res.ok) throw new Error(`YouTube feed: ${res.status}`);
  const videos = parseFeed(await res.text());
  const today = winnipegDate();

  // The Teaching page's list: one sermon and one full service per Sunday at most, nothing scheduled for later.
  const shown = new Map();
  for (const v of videos.filter(x => x.dated && x.date <= today)) {
    const key = `${v.date}|${isFullService(v.name) ? 'service' : 'sermon'}`;
    if (!shown.has(key) || shown.get(key).published < v.published) shown.set(key, v);
  }
  const recent = [...shown.values()].sort((a, b) => b.date.localeCompare(a.date) || isFullService(a.name) - isFullService(b.name))
    .map(({ id, name, date }) => ({ id, name, date }));
  await env.DB.prepare(`INSERT INTO site_data (key, value, updated_at) VALUES ('youtube_recent', ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).bind(JSON.stringify(recent)).run();

  // The sermon archive: each finished Sunday (yesterday or earlier) from IMPORT_FROM on.
  const added = [], updated = [];
  for (const { date, video, all } of bestPerDate(videos.filter(v => v.dated && v.date >= IMPORT_FROM && v.date < today))) {
    const ids = all.map(v => v.id);
    const existing = await env.DB.prepare(`SELECT slug, youtube, auto_youtube FROM sermons
      WHERE date = ? OR youtube IN (${ids.map(() => '?').join(',')}) ORDER BY auto_youtube IS NULL LIMIT 1`).bind(date, ...ids).first();
    if (existing) {
      // Swap in a better upload only if the importer added this sermon and nobody has changed its video since.
      if (existing.auto_youtube && existing.youtube === existing.auto_youtube && existing.youtube !== video.id) {
        await env.DB.prepare("UPDATE sermons SET youtube = ?, auto_youtube = ?, youtube_start = 0, updated_at = datetime('now') WHERE slug = ?")
          .bind(video.id, video.id, existing.slug).run();
        updated.push({ slug: existing.slug, title: video.title });
      }
      continue;
    }
    const generic = /^sunday\b/i.test(video.name);
    let base = slugify(generic ? `${video.name} ${date}` : video.name) || `service-${date}`, slug = base, n = 2;
    while (await env.DB.prepare('SELECT 1 FROM sermons WHERE slug = ?').bind(slug).first()) slug = `${base}-${n++}`;
    const description = descriptionHtml(video.description);
    await env.DB.prepare(`INSERT INTO sermons (slug, title, date, speakers, series, topics, description, summary, youtube, youtube_start, auto_youtube, published)
      VALUES (?, ?, ?, '[]', '[]', '[]', ?, ?, ?, 0, ?, 1)`)
      .bind(slug, video.name, date, description, excerpt(description, 150), video.id, video.id).run();
    added.push({ slug, title: video.title });
  }
  return { added, updated, recent: recent.length };
}

// The Teaching page's "latest sermon" and "recent services", from the list saved by syncYouTube.
const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5Z"/></svg>';
const longDate = iso => { const [y, m, d] = iso.split('-').map(Number); return `${MONTHS[m - 1][0].toUpperCase()}${MONTHS[m - 1].slice(1)} ${d}, ${y}`; };
const videoBox = (v, thumb) => `<div class="video" data-video="${esc(v.id)}" data-title="${esc(`${v.name} | ${longDate(v.date)}`)}"><img src="https://i.ytimg.com/vi/${esc(v.id)}/${thumb}.jpg" alt="" loading="lazy"><button type="button" class="video-play" aria-label="Play video: ${esc(`${v.name} | ${longDate(v.date)}`)}">${PLAY}</button></div>`;

export async function recentVideosHtml(env) {
  const row = await env.DB.prepare("SELECT value FROM site_data WHERE key = 'youtube_recent'").first();
  const list = row ? JSON.parse(row.value) : [];
  if (!list.length) return null;
  const [first, ...rest] = list;
  return {
    latest: `<div class="latest-media" style="--thumb:url(https://i.ytimg.com/vi/${esc(first.id)}/maxresdefault.jpg)">${videoBox(first, 'maxresdefault')}</div>
        <h3>${esc(first.name)}</h3>
        <p class="muted">${longDate(first.date)}</p>`,
    episodes: rest.slice(0, 9).map(v => `<article class="episode">${videoBox(v, 'hqdefault')}<h4>${esc(v.name)}</h4><p class="muted">${longDate(v.date)}</p></article>`).join('\n        '),
  };
}
