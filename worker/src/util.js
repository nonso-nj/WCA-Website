// Small helpers shared by the site and the admin.

export const MEDIA_BASE = 'https://pub-6c084b91637a45a78c9c5ce4207369a1.r2.dev';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// A date in Winnipeg as YYYY-MM-DD: today, or `offset` days from today.
export function winnipegDate(offset = 0) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Winnipeg' }).format(new Date());
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

export const slugify = s => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const niceDate = iso => {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};
export const shortDate = iso => {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${MONTHS[m - 1].slice(0, 3)} ${d}, ${y}`;
};

export const plainText = html => String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&#39;|&rsquo;/g, '’').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

export const excerpt = (html, n = 150) => {
  const t = plainText(html);
  if (t.length <= n) return t;
  return t.slice(0, n).replace(/\s+\S*$/, '').replace(/[,;:—–-]+$/, '') + '…';
};

export const minutes = html => Math.max(1, Math.round(plainText(html).split(' ').length / 200));

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

export const html = (body, status = 200) =>
  new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } });

export const parseList = v => { try { return JSON.parse(v || '[]'); } catch { return []; } };

export function youtubeId(url) {
  const m = String(url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:live\/|embed\/|watch\?(?:.*&)?v=|shorts\/))([\w-]{11})/);
  if (!m) return { id: null, start: 0 };
  const t = String(url).match(/[?&](?:t|start)=(\d+)/);
  return { id: m[1], start: t ? Number(t[1]) : 0 };
}

// Keep only simple, safe markup in anything typed or pasted into the admin editor.
const ALLOWED = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'sup', 'sub', 'ul', 'ol', 'li', 'blockquote', 'cite', 'hr',
  'h2', 'h3', 'h4', 'a', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'nav', 'span']);
const DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'link', 'meta', 'svg', 'img', 'video', 'audio']);

export async function sanitize(input) {
  const rewriter = new HTMLRewriter().on('*', {
    element(el) {
      const tag = el.tagName.toLowerCase();
      if (DROP.has(tag)) { el.remove(); return; }
      if (tag === 'h1') { el.tagName = 'h2'; }
      if (tag === 'div') { el.tagName = 'p'; }
      if (!ALLOWED.has(el.tagName) ) { el.removeAndKeepContent(); return; }
      for (const [name, value] of [...el.attributes]) {
        const keep = (name === 'href' && el.tagName === 'a' && /^(https?:|mailto:|tel:|\/|#|\.\.?\/)/i.test(value))
          || (name === 'id' && /^h[234]$|^span$/.test(el.tagName))
          || (name === 'class' && /^(verse|toc|toc-title)$/.test(value));
        if (!keep) el.removeAttribute(name);
      }
      if (el.tagName === 'a' && /^https?:/i.test(el.getAttribute('href') || '')) {
        el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener');
      }
    },
  });
  const out = await rewriter.transform(new Response(`<body>${input || ''}</body>`)).text();
  return out.replace(/^<body>|<\/body>$/g, '').replace(/<p>(\s|&nbsp;|<br>)*<\/p>/g, '').trim();
}

// Give headings an id (from their text) so the study's section bar can link to them.
export function addHeadingIds(html) {
  const used = new Set([...String(html).matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
  return String(html).replace(/<h([234])>([\s\S]*?)<\/h\1>/g, (m, level, inner) => {
    let id = slugify(plainText(inner)) || 'section', n = 2;
    while (used.has(id)) id = `${slugify(plainText(inner))}-${n++}`;
    used.add(id);
    return `<h${level} id="${id}">${inner}</h${level}>`;
  });
}

// ---------------------------------------------------------------- search engines and link previews
// The public address. Canonical links, the sitemap and share previews use it, so change it here if the domain changes
// (then run `node tools/seo_static.mjs` to update the static pages).
export const SITE_URL = 'https://winnipegchristianassembly.com';
export const SITE_NAME = 'Winnipeg Christian Assembly';
const SHARE_IMAGE = `${SITE_URL}/assets/share.jpg`;

// <script type="application/ld+json"> with "<" escaped so text can't close the tag.
export const jsonLd = data => `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', ...data }).replace(/</g, '\\u003c')}</script>`;

// Canonical link, Open Graph and Twitter tags (and optional structured data), between <!-- seo --> markers in each page.
export function seoTags({ title, description, path = '/', type = 'website', image = SHARE_IMAGE, data = null }) {
  const url = SITE_URL + path;
  const full = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
  return [
    '<!-- seo -->',
    `<link rel="canonical" href="${esc(url)}">`,
    `<meta property="og:type" content="${type}">`,
    `<meta property="og:site_name" content="${SITE_NAME}">`,
    `<meta property="og:title" content="${esc(full)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:image" content="${esc(image)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    ...(data ? [].concat(data).map(jsonLd) : []),
    '<!-- /seo -->',
  ].join('\n  ');
}

export const churchData = () => ({
  '@type': 'Church', name: SITE_NAME, url: SITE_URL + '/', logo: `${SITE_URL}/assets/wca-mark-transparent.png`, image: SHARE_IMAGE,
  telephone: '+1-431-373-7299', email: 'winnipegchristianassembly@gmail.com',
  address: { '@type': 'PostalAddress', streetAddress: '90 Ashland Avenue', addressLocality: 'Winnipeg', addressRegion: 'MB', postalCode: 'R3L 1K6', addressCountry: 'CA' },
  sameAs: ['https://www.youtube.com/@WinnipegChristianAssembly', 'https://www.instagram.com/winnipegchristianassembly/', 'https://www.facebook.com/winnipegfellowship'],
});
