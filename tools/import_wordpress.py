#!/usr/bin/env python3
"""Import devotionals and Bible study material from the old WordPress site into the redesign.

Reads the WordPress export in content/wordpress/ (posts.json, pages.json) and writes:
  redesign/devotionals.html, redesign/devotionals/<slug>.html
  redesign/bible-study.html (outlines, articles, books), redesign/bible-study/<slug>.html
Shared header/footer are taken from redesign/teaching.html so every page matches.

Refresh the export with:
  B=https://www.thefellowshipinwinnipeg.com/wp-json/wp/v2
  curl -sk "$B/posts?per_page=100&page=N&_fields=id,slug,title,date,content,excerpt,link" ...
"""
import datetime
import html
import json
import pathlib
import re
import urllib.parse
from html.parser import HTMLParser

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = ROOT / 'redesign'
DATA = ROOT / 'content' / 'wordpress'
AUTHOR = 'Winnipeg Christian Assembly'
OLD_HOSTS = ('thefellowshipinwinnipeg.com', 'www.thefellowshipinwinnipeg.com')

posts = json.load(open(DATA / 'posts.json'))
pages = json.load(open(DATA / 'pages.json'))
page_by_id = {p['id']: p for p in pages}


def title_of(item):
    return html.unescape(item['title']['rendered']).strip()


def nice_date(iso):
    d = datetime.date.fromisoformat(iso[:10])
    return f'{d:%B} {d.day}, {d.year}'


# ---------------------------------------------------------------- what we import
STUDY_PARENT = next(p['id'] for p in pages if p['slug'] == 'bible-study-outlines')
outlines = sorted([p for p in pages if p['parent'] == STUDY_PARENT], key=lambda p: p['date'], reverse=True)
outlines.append(next(p for p in pages if p['slug'] == 'study-outline'))  # Holiness, Consecration and Purposeful Living
ARTICLE_SLUGS = ['living-as-priests-before-god', 'gods-church',
                 '1679-prophecy-to-the-sons-of-god-by-jane-lead-later-shared-by-charles-price']
articles = [next(p for p in pages if p['slug'] == s) for s in ARTICLE_SLUGS]
TITLE_OVERRIDES = {'study-outline': 'Holiness, Consecration, and Purposeful Living: Study Outline'}

# Files copied into redesign/media (from the old site, or from the backup drive where the site had lost them)
PDFS = {
    'Gods-Church.pdf': 'media/pdf/gods-church.pdf',
    'Living-as-Priests-of-God-Large-Font.pdf': 'media/pdf/living-as-priests-of-god.pdf',
    'The-Foundation-of-holiness-consecration-and-purposeful-living-outline@.pdf': 'media/pdf/holiness-consecration-purposeful-living-outline.pdf',
    'Vol.-1-The-curriculum-of-the-Christian-faith-Final.pdf': 'media/pdf/the-curriculum-of-the-christian-faith-vol-1.pdf',
    'Faith-Large-Font.pdf': 'media/pdf/faith.pdf',
    'WOW vol 1.pdf': 'media/pdf/walking-on-water-vol-1.pdf',
    'This_Way.pdf': 'media/pdf/this-way.pdf',
    'Grace [Large Font].pdf': 'media/pdf/grace.pdf',
    'Resurrection [Large Font].pdf': 'media/pdf/resurrection-the-hope-of-a-believer.pdf',
    'Spiritual Understanding.pdf': 'media/pdf/spiritual-understanding.pdf',
    'The Feasts - Passover.pdf': 'media/pdf/feasts-passover.pdf',
    'The Feasts - Pentecost.pdf': 'media/pdf/feasts-pentecost.pdf',
    'The Feasts - Trumpets.pdf': 'media/pdf/feasts-trumpets.pdf',
    'Understanding your Salvation - We  have been Saved [Large Font for phones].pdf': 'media/pdf/we-have-been-saved.pdf',
}
BOOKS = [
    ('The Curriculum of the Christian Faith', 'Volume 1', 'media/books/curriculum-of-the-christian-faith.jpg',
     'media/pdf/the-curriculum-of-the-christian-faith-vol-1.pdf'),
    ('Walking on Water', 'Volume 1', 'media/books/walking-on-water.jpg', 'media/pdf/walking-on-water-vol-1.pdf'),
    ('This Way', 'Securing your Place in the Final Revival', 'media/books/this-way.jpg', 'media/pdf/this-way.pdf'),
]

dev_slugs = {p['slug'] for p in posts}
study_slugs = {p['slug'] for p in outlines + articles}


def new_link(url, depth):
    """Point links at the old site to their new home. Returns None when there is no new home."""
    if re.match(r'^[a-z][a-z0-9+.-]*:', url, re.I) and not re.match(r'^(https?|mailto|tel):', url, re.I):
        return None  # e.g. x-apple-data-detectors:// links pasted in from Notes
    if not re.match(r'https?://(?:www\.)?thefellowshipinwinnipeg\.com', url):
        return url
    parts = urllib.parse.urlsplit(url)
    path = urllib.parse.unquote(parts.path)
    frag = f'#{parts.fragment}' if parts.fragment else ''
    up = '../' * depth
    name = path.rsplit('/', 1)[-1]
    if name in PDFS:
        return up + PDFS[name]
    slug = path.strip('/').split('/')[-1] if path.strip('/') else ''
    if slug in dev_slugs:
        return f'{up}devotionals/{slug}.html{frag}'
    if slug in study_slugs:
        return f'{up}bible-study/{slug}.html{frag}'
    if slug in ('', 'homepage'):
        return f'{up}index.html'
    return None


# ---------------------------------------------------------------- HTML cleaning
class Cleaner(HTMLParser):
    """Keep simple, readable markup; drop WordPress classes, styles and wrappers."""
    KEEP = {'p', 'strong', 'b', 'em', 'i', 'u', 'sup', 'sub', 'ul', 'ol', 'li', 'blockquote', 'cite', 'hr',
            'br', 'h2', 'h3', 'h4', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'a'}
    HEADINGS = {'h1': 'h2', 'h2': 'h2', 'h3': 'h3', 'h4': 'h4', 'h5': 'h4', 'h6': 'h4'}
    DROP = {'script', 'style', 'iframe', 'figure', 'figcaption', 'img', 'meta', 'noscript', 'object', 'embed', 'audio', 'video'}

    def __init__(self, depth):
        super().__init__(convert_charrefs=True)
        self.depth = depth
        self.out = []
        self.skip = 0
        self.stack = []

    VOID = {'img', 'meta', 'br', 'hr', 'input', 'source', 'wbr', 'col', 'area', 'link', 'param', 'embed', 'track'}

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = a.get('class') or ''
        if self.skip:  # inside something we are dropping: just track nesting
            if tag not in self.VOID:
                self.skip += 1
            return
        if tag in self.DROP or tag == 'label' or 'ez-toc-title' in cls or 'eztoc-hide' in cls:
            if tag not in self.VOID:
                self.skip = 1
            return
        if tag in self.VOID and tag not in ('br', 'hr'):
            return
        if tag == 'div' and a.get('id') == 'ez-toc-container':
            self.out.append('<nav class="toc" aria-label="Contents"><p class="toc-title">Contents</p>')
            self.stack.append('</nav>')
            return
        if tag == 'pre' and 'wp-block-verse' in cls:
            self.out.append('<blockquote class="verse"><p>')
            self.stack.append('</p></blockquote>')
            return
        if tag == 'blockquote':
            self.out.append('<blockquote class="verse">')
            self.stack.append('</blockquote>')
            return
        tag = self.HEADINGS.get(tag, tag)
        if tag not in self.KEEP:
            if a.get('id'):
                self.out.append(f'<span id="{html.escape(a["id"])}"></span>')
            self.stack.append('')
            return
        if tag in ('br', 'hr'):
            self.out.append(f'<{tag}>')
            return
        if tag == 'a':
            href = new_link(html.unescape(a.get('href') or ''), self.depth)
            if not href:
                self.stack.append('')
                return
            ext = href.startswith('http')
            self.out.append(f'<a href="{html.escape(href)}"' + (' target="_blank" rel="noopener"' if ext else '') + '>')
        else:
            anchor = f' id="{html.escape(a["id"])}"' if a.get('id') and tag in ('h2', 'h3', 'h4') else ''
            self.out.append(f'<{tag}{anchor}>')
        self.stack.append(f'</{tag}>')

    def handle_endtag(self, tag):
        if self.skip:
            if tag not in self.VOID:
                self.skip -= 1
            return
        if tag in self.VOID:
            return
        if self.stack:
            self.out.append(self.stack.pop())

    def handle_data(self, data):
        if not self.skip:
            self.out.append(html.escape(data, quote=False))

    def result(self):
        s = ''.join(self.out + self.stack[::-1])
        s = re.sub(r'<p>(\s|&nbsp;|\xa0|<br>)*</p>', '', s)
        s = re.sub(r'(<br>\s*){2,}', '<br>', s)
        s = re.sub(r'\[/?(?:audio|video|embed|caption|gallery|playlist|pdf-embedder|sermon[a-z_]*|ctc[a-z_]*)\b[^\]]*\]', '', s)  # WordPress shortcodes only
        return re.sub(r'\n{3,}', '\n\n', s).strip()


def clean(raw, depth=1):
    c = Cleaner(depth)
    c.feed(raw)
    c.close()
    return c.result()


def plain(raw):
    t = re.sub(r'<div id="ez-toc-container".*?</nav>\s*</div>', ' ', raw, flags=re.S)  # old table of contents
    t = re.sub(r'<(pre|blockquote)[^>]*>.*?</\1>', ' ', t, flags=re.S)
    t = html.unescape(re.sub(r'<[^>]+>', ' ', t))
    return re.sub(r'\s+', ' ', t).strip()


def excerpt(raw, n=170):
    t = plain(raw)
    if len(t) <= n:
        return t
    return t[:n].rsplit(' ', 1)[0].rstrip(',;:—–-') + '…'


def minutes(raw):
    return max(1, round(len(plain(raw).split()) / 200))


def pdfs_in(raw, depth):
    out = []
    for url in dict.fromkeys(html.unescape(u) for u in re.findall(r'href="([^"]+\.pdf)"', raw, flags=re.I)):
        name = urllib.parse.unquote(url.rsplit('/', 1)[-1])
        if name in PDFS:
            out.append('../' * depth + PDFS[name])
    return out


# ---------------------------------------------------------------- page shell
shell = (SITE / 'teaching.html').read_text()
HEAD, rest = shell.split('<main id="main">', 1)
_, TAIL = rest.split('</main>', 1)


def prefix_relative(s, depth):
    if not depth:
        return s
    up = '../' * depth

    def fix(m):
        attr, q, url = m.group(1), m.group(2), m.group(3)
        if re.match(r'(https?:|mailto:|tel:|data:|#|/)', url):
            return m.group(0)
        return f'{attr}={q}{up}{url}{q}'
    return re.sub(r'\b(href|src)=(["\'])([^"\']*)\2', fix, s)


def write(path, title, desc, body, current, body_class=''):
    depth = path.count('/')
    head = HEAD.replace('<title>Teaching | Winnipeg Christian Assembly</title>',
                        f'<title>{html.escape(title)} | Winnipeg Christian Assembly</title>')
    head = re.sub(r'<meta name="description" content="[^"]*">',
                  f'<meta name="description" content="{html.escape(desc)}">', head)
    if body_class:
        head = head.replace('<body id="top">', f'<body id="top" class="{body_class}">')
    head = head.replace(' aria-current="page"', '')
    head = head.replace(f'<a href="{current}">', f'<a href="{current}" aria-current="page">')
    out = prefix_relative(head, depth) + '<main id="main">\n' + body + '\n</main>' + prefix_relative(TAIL, depth)
    (SITE / path).parent.mkdir(parents=True, exist_ok=True)
    (SITE / path).write_text(out)


# ---------------------------------------------------------------- devotionals
devos = sorted(posts, key=lambda p: p['date'], reverse=True)

ROMAN = r'(?:i{1,3}|iv|v|vi{1,3}|ix|x)'


def number_of(t):
    m = re.match(r'^\s*(\d+)\s*[–—-]', t)
    return m.group(1) if m else None


def display_title(t):
    """Title without the running number, e.g. '158 – They must first be tested' -> 'They must first be tested'."""
    return re.sub(r'^\s*\d+\s*[–—-]\s*', '', t).strip()


def series_key(t):
    k = display_title(t).lower().replace('’', "'")
    k = re.sub(r'\bfist\b', 'first', k)
    k = re.sub(r'\s*\((?:\d+|' + ROMAN + r')\)\s*$', '', k)
    for _ in range(3):
        k = re.sub(r'[\s\-–—]*\b(?:\d+|' + ROMAN + r')\.?\s*$', '', k)
    k = re.split(r'\s+[–—-]\s*|\s*[–—-]\s+|\s*\(', k)[0]
    k = re.sub(r'[.!?,:;\s]+$', '', k)
    return re.sub(r'foundations\b', 'foundation', k)


def slugify(t):
    return re.sub(r'[^a-z0-9]+', '-', t.lower()).strip('-')


groups = {}
for p in sorted(devos, key=lambda p: p['date']):
    groups.setdefault(series_key(title_of(p)), []).append(p)
series_of = {}
SERIES = []
for key, items in groups.items():
    if len(items) < 2:
        continue
    first = display_title(title_of(items[0]))
    name = re.split(r'\s+[–—-]\s+|\s*\(', first)[0].rstrip(' .!?,')
    entry = {'name': name, 'id': 'series-' + slugify(key), 'items': items}
    SERIES.append(entry)
    for i, it in enumerate(items, 1):
        series_of[it['slug']] = (entry, i)
SERIES.sort(key=lambda e: e['items'][-1]['date'], reverse=True)
HANDMADE = SITE / 'devotional-our-god-is-a-sun.html'
handmade_body = None
if HANDMADE.exists():
    m = re.search(r'<div class="wrap article-body">(.*?)\n    </div>\n  </article>', HANDMADE.read_text(), re.S)
    handmade_body = m.group(1) if m else None
    handmade_body = handmade_body and re.sub(r'\s*<footer class="article-foot">.*?</footer>', '', handmade_body, flags=re.S)

for i, p in enumerate(devos):
    slug, t = p['slug'], title_of(p)
    newer = devos[i - 1] if i > 0 else None
    older = devos[i + 1] if i + 1 < len(devos) else None
    body_html = handmade_body if (slug == 'our-god-is-a-sun' and handmade_body) else clean(p['content']['rendered'])
    hero_img = ''
    if slug == 'our-god-is-a-sun':
        hero_img = ('\n    <div class="wrap"><div class="article-img"><img src="https://images.unsplash.com/photo-1470252649378-9c29740c9fa8'
                    '?w=1800&q=72&auto=format&fit=crop" alt="The sun rising over a misty field"></div></div>')
    series_line = ''
    if slug in series_of:
        entry, n = series_of[slug]
        series_line = (f'<p class="series-line">Part {n} of {len(entry["items"])} in '
                       f'<a href="../devotionals.html#{entry["id"]}">{html.escape(entry["name"])}</a></p>')
    pager = '<nav class="pager" aria-label="More devotionals">'
    pager += (f'<a class="pager-prev" href="{newer["slug"]}.html"><span>Newer</span>{html.escape(display_title(title_of(newer)))}</a>' if newer else '<span></span>')
    pager += (f'<a class="pager-next" href="{older["slug"]}.html"><span>Older</span>{html.escape(display_title(title_of(older)))}</a>' if older else '<span></span>')
    pager += '</nav>'
    body = f'''  <article class="article">
    <header class="wrap article-head">
      <a class="back-link" href="devotionals.html">← All devotionals</a>
      <p class="kicker">Devotional</p>
      <h1>{html.escape(display_title(t))}</h1>
      <p class="article-meta"><span>{nice_date(p['date'])}</span><span>{AUTHOR}</span><span>{minutes(p['content']['rendered'])} min read</span>{f'<span>No. {number_of(t)}</span>' if number_of(t) else ''}</p>
      {series_line}
    </header>{hero_img}
    <div class="wrap article-body devotional-body">
      {body_html}
      {pager}
    </div>
  </article>'''
    body = body.replace('href="devotionals.html"', 'href="../devotionals.html"')
    write(f'devotionals/{slug}.html', display_title(t), excerpt(p['content']['rendered'], 150), body, 'devotionals.html', 'no-hero')

if HANDMADE.exists():
    HANDMADE.unlink()

# ---------------------------------------------------------------- topics for devotionals
# First pass, matched on title and text. Edit the patterns, or pin a devotional with TOPIC_PINS.
DEV_TOPICS = [
    ('faith', 'Faith & trust', r'faith|trust|believ|hope|wait|patien|promise|confiden'),
    ('presence', 'Prayer & His presence', r'pray|fellowship with|presence|worship|abide|abiding|dwell|intima|seek|incense|altar|rest'),
    ('holiness', 'Holiness & consecration', r'holiness|holy|consecrat|sanctif|pur(e|ity)|flesh|\bsin\b|temptation|separat'),
    ('mind', 'The Word & the renewed mind', r'\bword\b|scripture|\bmind\b|think|meditat|truth|understanding|wisdom'),
    ('kingdom', 'The Kingdom & our calling', r'kingdom|purpose|\bcall|disciple|vision|apostolic|destin|mission|harvest|fruit|serv(e|ice)'),
    ('trials', 'Trials & spiritual warfare', r'\btest|trial|battle|\bwar\b|warfare|enemy|contend|overcom|wilderness|storm|suffer|endur'),
    ('grace', 'Grace & salvation', r'grace|salvation|saved|redeem|redemption|blood|covenant|cross|forgiv|mercy'),
    ('church', 'The Church & one another', r'church|brethren|\bbody\b|one another|family|oneness|unity|brother'),
]
TOPIC_PINS = {}  # e.g. {'our-god-is-a-sun': 'faith'}
TOPIC_NAME = {k: n for k, n, _ in DEV_TOPICS}


def dev_topic(p):
    if p['slug'] in TOPIC_PINS:
        return TOPIC_PINS[p['slug']]
    t = title_of(p).lower()
    body = plain(p['content']['rendered']).lower()
    n = max(1, len(body.split()))
    scores = {k: 6 * len(re.findall(rx, t)) + 1000 * len(re.findall(rx, body)) / n for k, _, rx in DEV_TOPICS}
    return max(scores, key=scores.get)


def short_date(iso):
    d = datetime.date.fromisoformat(iso[:10])
    return f'{d:%b} {d.day}, {d.year}'


def card(href, title, text, meta, attrs=''):
    return (f'<a class="card-post" href="{href}"{attrs}>'
            f'<span class="card-meta">{meta}</span>'
            f'<h3>{html.escape(title)}</h3>'
            f'<p>{html.escape(text)}</p>'
            f'<span class="card-more">Read →</span></a>')


def dev_card(p, attrs=''):
    topic = dev_topic(p)
    return card(f'devotionals/{p["slug"]}.html', display_title(title_of(p)), excerpt(p['content']['rendered'], 150),
                f'{short_date(p["date"])} · {TOPIC_NAME[topic]}', attrs)


def chip_row(group, values, hidden=False):
    btns = '<button type="button" class="tab" data-value="" aria-pressed="true">All</button>' + ''.join(
        f'<button type="button" class="tab" data-value="{v}" aria-pressed="false">{label}</button>' for v, label in values)
    return f'<div class="tabs" role="group" data-filter-group="{group}"{" hidden" if hidden else ""}>{btns}</div>'


# ---------------------------------------------------------------- Devotionals index: six previews, then "see all" with sort by year or topic
latest_cards = ''.join('\n        ' + dev_card(p) for p in devos[:6])
years = sorted({p['date'][:4] for p in devos}, reverse=True)
used_topics = [(k, n) for k, n, _ in DEV_TOPICS if any(dev_topic(p) == k for p in devos)]
browse_cards = ''.join('\n        ' + dev_card(p, f' data-item data-year="{p["date"][:4]}" data-topic="{dev_topic(p)}"') for p in devos)

dev_index = f"""  <section class="page-hero">
    <div class="wrap">
      <h1>Devotionals</h1>
      <p>Short reflections to start your day in the Word.</p>
    </div>
  </section>

  <section class="section bg-white list-section">
    <div class="wrap">
      <h2 class="list-heading">Latest</h2>
      <div class="card-grid">{latest_cards}
      </div>
      <div class="center-actions"><button type="button" class="btn btn-dark" data-reveal="browse">See all {len(devos)} devotionals</button></div>
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
      {chip_row('year', [(y, y) for y in years])}
      {chip_row('topic', used_topics, hidden=True)}
      <div class="card-grid" data-list>{browse_cards}
      </div>
      <div class="center-actions"><button type="button" class="btn btn-line more-btn" data-more>Show more</button></div>
    </div>
  </section>
  <noscript><style>#browse {{ display: block !important; }} [data-reveal] {{ display: none; }}</style></noscript>"""
write('devotionals.html', 'Devotionals', 'Devotionals from Winnipeg Christian Assembly.', dev_index, 'devotionals.html')


# ---------------------------------------------------------------- Bible study pages
def section_bar(body, title):
    """Sticky bar of links to the study's sections, built from its headings."""
    body = re.sub(r'<nav class="toc"[^>]*>.*?</nav>', '', body, flags=re.S)  # replaced by the bar
    links, used = [], set()
    norm = lambda x: re.sub(r'[^a-z0-9]+', ' ', html.unescape(x).lower()).strip()

    def tag(m):
        level, inner = m.group(1), m.group(2)
        label = html.unescape(re.sub(r'<[^>]+>', '', inner)).replace('\xa0', ' ').strip().rstrip(':')
        if not label or norm(label) == norm(title) or len(label) > 90:
            return m.group(0)
        span = re.search(r'<span id="([^"]+)"></span>', inner)
        hid = span.group(1) if span else re.sub(r'[^a-z0-9]+', '-', label.lower()).strip('-') or f's{len(links)}'
        while hid in used:
            hid += '-2'
        used.add(hid)
        links.append((hid, label))
        inner = re.sub(r'<span id="[^"]+"></span>', '', inner)
        return f'<h{level} id="{hid}">{inner}</h{level}>'
    body = re.sub(r'<h([234])(?: id="[^"]*")?>(.*?)</h\1>', tag, body, flags=re.S)
    if len(links) < 3:
        return '', body
    chips = ''.join(f'<a href="#{h}" data-topic-link title="{html.escape(t)}">{html.escape(t)}</a>' for h, t in links)
    return f'<nav class="topic-bar" aria-label="Sections"><div class="wrap"><div class="chips">{chips}</div></div></nav>', body


def study_page(p, kind):
    slug, t = p['slug'], TITLE_OVERRIDES.get(p['slug'], title_of(p))
    raw = p['content']['rendered']
    files = pdfs_in(raw, 1)
    dl = ''.join(f'<a class="btn btn-dark btn-sm" href="{f}" download>Download PDF</a>' for f in files)
    bar, cleaned = section_bar(clean(raw), t)
    body = f"""  <article class="article">
    <header class="wrap article-head">
      <a class="back-link" href="../bible-study.html">← Bible study</a>
      <p class="kicker">{kind}</p>
      <h1>{html.escape(t)}</h1>
      <p class="article-meta"><span>{AUTHOR}</span><span>{minutes(raw)} min read</span></p>
      {f'<div class="actions">{dl}</div>' if dl else ''}
    </header>
    {bar}
    <div class="wrap article-body study-body">
      {cleaned}
    </div>
  </article>"""
    write(f'bible-study/{slug}.html', t, excerpt(raw, 150), body, 'bible-study.html', 'no-hero')


for p in outlines:
    study_page(p, 'Study outline')
for p in articles:
    study_page(p, 'Article')

# Bible study index: preview cards, filter by topic
STUDY_TOPICS = [
    ('salvation', 'Salvation & grace', ['we-have-been-saved', 'we-are-being-saved', 'the-dynamics-of-salvation', 'grace', 'faith',
                                        'resurrection-the-hope-of-a-believer']),
    ('feasts', 'The Feasts of the Lord', ['passover', 'pentecost', 'trumpets', 'day-of-atonement']),
    ('christ', 'Christ & the Scriptures', ['the-revelation-of-jesus-christ', 'the-book-of-romans-chapter-1', 'spiritual-understanding']),
    ('church', 'The Church', ['the-new-testament-church', 'the-foundation-of-the-vision', 'the-rain-and-the-harvest']),
    ('living', 'Christian living', ['spiritual-warfare', 'study-outline']),
    ('articles', 'Articles', [p['slug'] for p in articles]),
]
by_slug = {p['slug']: p for p in outlines + articles}
placed = {s for _, _, slugs in STUDY_TOPICS for s in slugs}
leftover = [p['slug'] for p in outlines if p['slug'] not in placed]
if leftover:
    STUDY_TOPICS.append(('more', 'More studies', leftover))

study_cards = ''.join(
    '\n        ' + card(f'bible-study/{s}.html', TITLE_OVERRIDES.get(s, title_of(by_slug[s])), excerpt(by_slug[s]['content']['rendered'], 140),
                        f'{name} · {minutes(by_slug[s]["content"]["rendered"])} min read', f' data-item data-topic="{tid}"')
    for tid, name, slugs in STUDY_TOPICS for s in slugs)

books_html = ''.join(f"""
          <article class="book">
            <div class="book-cover"><img src="{cover}" alt="Cover of {html.escape(t)}" loading="lazy"></div>
            <h3>{html.escape(t)}</h3>{f'<p class="muted">{html.escape(sub)}</p>' if sub else ''}
            {f'<a class="arrow-link" href="{pdf}" download>Download PDF</a>' if pdf else '<p class="status">PDF coming soon</p>'}
          </article>""" for t, sub, cover, pdf in BOOKS)

library = f"""  <section class="section bg-white list-section" id="outlines" data-browse>
    <div class="wrap">
      <div class="browse-head"><h2 class="list-heading">Study outlines</h2></div>
      {chip_row('topic', [(tid, name) for tid, name, _ in STUDY_TOPICS])}
      <div class="card-grid" data-list>{study_cards}
      </div>
    </div>
  </section>

  <section class="section list-section" id="books">
    <div class="wrap">
      <h2 class="list-heading">Books</h2>
      <div class="books">{books_html}
      </div>
    </div>
  </section>"""

bs = (SITE / 'bible-study.html').read_text()
start = min(i for i in (bs.find('<nav class="topic-bar"'), bs.find('<section class="section bg-white library" id="outlines">'),
                         bs.find('<section class="section bg-white list-section" id="outlines"'),
                         bs.find('<section class="section bg-white" id="outlines">')) if i >= 0)
start = bs.rindex('\n', 0, start) + 1
end = bs.index('</section>', bs.rindex('id="books"')) + len('</section>')
if 'class="topic" id="books"' in bs:  # old layout: books was nested inside the outlines section
    end = bs.index('</section>', end) + len('</section>')
bs = bs[:start] + library + bs[end:]
(SITE / 'bible-study.html').write_text(bs)

# Point the rest of the site at the new devotional location
for f in SITE.glob('*.html'):
    s = f.read_text()
    s2 = s.replace('devotional-our-god-is-a-sun.html', 'devotionals/our-god-is-a-sun.html')
    if s2 != s:
        f.write_text(s2)

print(f'{len(devos)} devotionals, {len(outlines)} study outlines, {len(articles)} articles written')
