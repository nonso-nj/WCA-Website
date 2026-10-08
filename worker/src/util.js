// Small helpers shared by the site and the admin.

export const MEDIA_BASE = 'https://pub-6c084b91637a45a78c9c5ce4207369a1.r2.dev';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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
