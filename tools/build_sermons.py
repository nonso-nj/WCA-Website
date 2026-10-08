#!/usr/bin/env python3
"""Build the sermon archive (redesign/sermons.html and redesign/sermons/<slug>.html).

Inputs (content/wordpress/): sermons.json, ctc_sermon_series.json, ctc_sermon_speaker.json,
ctc_sermon_topic.json, sermon-media.json (audio/video/PDF links taken from the database backup).

Optional: the backup drive (WCA_BACKUP, default /Volumes/Seagate/thefellowshipinwinnipeg.com). When it is
connected, audio files are matched to sermons and sermon-note PDFs are copied into redesign/media.

Outputs:
  content/sermons/sermons.json        clean list of every sermon (what the pages are built from)
  content/sermons/audio-upload.csv    local audio file -> R2 key, for the convert/upload step
  redesign/sermons.html, redesign/sermons/<slug>.html

Audio plays from WCA_MEDIA_BASE (e.g. https://media.example.org). Until that is set, sermon pages say
"Audio coming soon" instead of showing a player.
"""
import csv
import html
import json
import os
import pathlib
import re
import shutil
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent.parent
WP = ROOT / 'content' / 'wordpress'
OUT = ROOT / 'content' / 'sermons'
SITE = ROOT / 'redesign'
BACKUP = pathlib.Path(os.environ.get('WCA_BACKUP', '/Volumes/Seagate/thefellowshipinwinnipeg.com'))
MEDIA_BASE = os.environ.get('WCA_MEDIA_BASE', '').rstrip('/')

# Reuse the HTML cleaner and page shell from the WordPress importer (everything above its devotional section).
_src = (ROOT / 'tools' / 'import_wordpress.py').read_text()
_ns = {'__file__': str(ROOT / 'tools' / 'import_wordpress.py')}
exec(_src[:_src.index('# ---------------------------------------------------------------- devotionals\n')], _ns)
clean, excerpt, nice_date, write = _ns['clean'], _ns['excerpt'], _ns['nice_date'], _ns['write']

sermons = sorted(json.load(open(WP / 'sermons.json')), key=lambda s: s['date'], reverse=True)
media = json.load(open(WP / 'sermon-media.json'))
names = {tax: {t['id']: html.unescape(t['name']).strip() for t in json.load(open(WP / f'{tax}.json'))}
         for tax in ('ctc_sermon_series', 'ctc_sermon_speaker', 'ctc_sermon_topic')}


JUNK = re.compile(r'(^|>)[^<>]{0,140}?Download\s*(?=<|$)', re.I)  # labels left over from the old PDF viewer


def strip_junk(text):
    return JUNK.sub(lambda m: m.group(1), text).strip()


def short_text(markup, n):
    t = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', markup))).strip()
    return t if len(t) <= n else t[:n].rsplit(' ', 1)[0].rstrip(',;:—–-') + '…'


def slugify(t):
    return re.sub(r'[^a-z0-9]+', '-', t.lower()).strip('-')


def norm_name(path):
    return re.sub(r'[^a-z0-9]', '', pathlib.Path(path).stem.lower())


# ---------------------------------------------------------------- audio files on the backup drive
drive = BACKUP.is_dir()
audio_index = {}
if drive:
    for f in (BACKUP / 'wp-content' / 'uploads').rglob('*'):
        if f.suffix.lower() in ('.mp3', '.m4a') and f.is_file():
            audio_index.setdefault(norm_name(f.name), f)


def local_file(url):
    if not url or 'thefellowshipinwinnipeg.com' not in url:
        return None
    path = BACKUP / urllib.parse.unquote(urllib.parse.urlsplit(url.strip()).path).lstrip('/')
    if path.is_file():
        return path
    return audio_index.get(norm_name(path.name))  # same name with different spacing or punctuation


def youtube(url):
    if not url:
        return None, 0
    m = re.search(r'(?:youtu\.be/|youtube\.com/(?:live/|embed/|watch\?(?:.*&)?v=|shorts/))([\w-]{11})', url)
    if not m:
        return None, 0
    t = re.search(r'[?&](?:t|start)=(\d+)', url)
    return m.group(1), int(t.group(1)) if t else 0


# ---------------------------------------------------------------- build the clean sermon list
previous = {}
if (OUT / 'sermons.json').exists():
    previous = {s['slug']: s for s in json.load(open(OUT / 'sermons.json'))}

records, uploads, unmatched = [], [], []
(SITE / 'media' / 'sermon-notes').mkdir(parents=True, exist_ok=True)
for s in sermons:
    m = media.get(str(s['id']), {})
    raw = s['content']['rendered']
    audio_url = m.get('_ctc_sermon_audio') or next(iter(re.findall(r'(https?://[^"\' <]+\.(?:mp3|m4a))', html.unescape(raw))), '')
    year = s['date'][:4]
    key = f'sermons/{year}/{s["slug"]}.m4a' if audio_url else None
    source = None
    if drive and audio_url:
        f = local_file(audio_url)
        source = str(f.relative_to(BACKUP)) if f else None
        if not f:
            unmatched.append(s['slug'])
    elif audio_url:
        source = previous.get(s['slug'], {}).get('audio_source')
    if key and source:
        uploads.append((source, key))

    notes = None
    pdf = m.get('_ctc_sermon_pdf')
    if pdf:
        name = slugify(pathlib.Path(urllib.parse.unquote(urllib.parse.urlsplit(pdf).path)).stem) + '.pdf'
        dest = SITE / 'media' / 'sermon-notes' / name
        src = BACKUP / urllib.parse.unquote(urllib.parse.urlsplit(pdf).path).lstrip('/')
        if drive and src.is_file() and not dest.exists():
            shutil.copy2(src, dest)
        notes = f'media/sermon-notes/{name}' if dest.exists() else None

    vid, start = youtube(m.get('_ctc_sermon_video', ''))
    if not vid:
        vid, start = youtube(next(iter(re.findall(r'(?:youtube\.com|youtu\.be)[^"\' <]+', html.unescape(raw))), ''))

    records.append({
        'slug': s['slug'],
        'title': html.unescape(s['title']['rendered']).strip(),
        'date': s['date'][:10],
        'speakers': [names['ctc_sermon_speaker'][i] for i in s['ctc_sermon_speaker'] if i in names['ctc_sermon_speaker']],
        'series': [names['ctc_sermon_series'][i] for i in s['ctc_sermon_series'] if i in names['ctc_sermon_series']],
        'topics': [names['ctc_sermon_topic'][i] for i in s['ctc_sermon_topic'] if i in names['ctc_sermon_topic']],
        'audio_key': key if source else None,
        'audio_source': source,
        'youtube': vid,
        'youtube_start': start,
        'notes': notes,
        'description': (desc := strip_junk(clean(raw))),
        'summary': short_text(desc, 150),
    })

OUT.mkdir(parents=True, exist_ok=True)
json.dump(records, open(OUT / 'sermons.json', 'w'), indent=1, ensure_ascii=False)
with open(OUT / 'audio-upload.csv', 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['source (relative to the backup folder)', 'r2_key'])
    w.writerows(uploads)

# ---------------------------------------------------------------- pages
PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5Z"/></svg>'


def who(r):
    return ', '.join(r['speakers']) or 'Winnipeg Christian Assembly'


def short_date(iso):
    y, mo, d = iso.split('-')
    return f'{["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][int(mo) - 1]} {int(d)}, {y}'


def media_flags(r):
    flags = []
    if r['audio_key']:
        flags.append('Audio')
    if r['youtube']:
        flags.append('Video')
    if r['notes']:
        flags.append('Notes')
    return flags


def sermon_page(r, related):
    meta = [f'<span>{nice_date(r["date"])}</span>', f'<span>{html.escape(who(r))}</span>']
    if r['series']:
        meta.append(f'<span><a href="../sermons.html?series={slugify(r["series"][0])}#all">{html.escape(r["series"][0])}</a></span>')
    blocks = []
    if r['youtube']:
        t = html.escape(r['title'])
        blocks.append(f'<div class="video sermon-video" data-video="{r["youtube"]}" data-start="{r["youtube_start"]}" data-title="{t}">'
                      f'<img src="https://i.ytimg.com/vi/{r["youtube"]}/hqdefault.jpg" alt="" loading="lazy">'
                      f'<button type="button" class="video-play" aria-label="Play video: {t}">{PLAY}</button></div>')
    if r['audio_key'] and MEDIA_BASE:
        blocks.append(f'<div class="audio-box"><p class="audio-label">Listen</p>'
                      f'<audio controls preload="none" src="{MEDIA_BASE}/{r["audio_key"]}"></audio></div>')
    elif r['audio_key']:
        blocks.append('<div class="audio-box"><p class="audio-label">Listen</p><p class="status">Audio coming soon</p></div>')
    if r['notes']:
        blocks.append(f'<p><a class="btn btn-dark btn-sm" href="../{r["notes"]}" download>Download sermon notes (PDF)</a></p>')
    more = ''
    if related:
        rows = ''.join(f'<a class="list-row" href="{x["slug"]}.html"><span class="list-title">{html.escape(x["title"])}</span>'
                       f'<span class="list-date">{short_date(x["date"])}</span></a>' for x in related)
        label = f'More in {html.escape(r["series"][0])}' if r['series'] else f'More from {html.escape(who(r))}'
        more = f'<section class="more-sermons"><h2 class="list-heading">{label}</h2><div class="list">{rows}</div></section>'
    body = f'''  <article class="article">
    <header class="wrap article-head">
      <a class="back-link" href="../sermons.html">← All sermons</a>
      <p class="kicker">Sermon</p>
      <h1>{html.escape(r["title"])}</h1>
      <p class="article-meta">{"".join(meta)}</p>
    </header>
    <div class="wrap article-body sermon-body">
      <div class="sermon-media">{"".join(blocks)}</div>
      {r["description"]}
      {more}
    </div>
  </article>'''
    write(f'sermons/{r["slug"]}.html', r['title'], r['summary'] or f'A sermon by {who(r)}.', body, 'sermons.html', 'no-hero')


by_series = {}
by_speaker = {}
for r in records:
    for x in r['series']:
        by_series.setdefault(x, []).append(r)
    for x in r['speakers']:
        by_speaker.setdefault(x, []).append(r)

for r in records:
    pool = by_series.get(r['series'][0]) if r['series'] else by_speaker.get(r['speakers'][0], []) if r['speakers'] else []
    related = sorted((x for x in pool if x is not r), key=lambda x: x['date'])[:6]
    sermon_page(r, related)

# Archive page
def sermon_card(r):
    flags = ' · '.join(media_flags(r))
    return (f'<a class="card-post" href="sermons/{r["slug"]}.html">'
            f'<span class="card-meta">{short_date(r["date"])} · {html.escape(who(r))}</span>'
            f'<h3>{html.escape(r["title"])}</h3>'
            f'<p>{html.escape(r["summary"] or (r["series"][0] if r["series"] else ""))}</p>'
            f'<span class="card-more">{"Watch" if r["youtube"] else "Listen" if r["audio_key"] else "Read"} →</span></a>')


def options(values):
    return ''.join(f'<option value="{slugify(v)}">{html.escape(v)}</option>' for v in values)


def row(r):
    attrs = (f' data-item data-year="{r["date"][:4]}" data-speaker="{" ".join(slugify(x) for x in r["speakers"])}"'
             f' data-series="{" ".join(slugify(x) for x in r["series"])}" data-topic="{" ".join(slugify(x) for x in r["topics"])}"')
    sub = ' · '.join([who(r)] + r['series'][:1])
    flags = ''.join(f'<span class="flag">{f}</span>' for f in media_flags(r))
    return (f'<a class="list-row sermon-row" href="sermons/{r["slug"]}.html"{attrs}>'
            f'<span><span class="list-title">{html.escape(r["title"])}</span><span class="row-sub">{html.escape(sub)}</span></span>'
            f'<span class="row-end">{flags}<span class="list-date">{short_date(r["date"])}</span></span></a>')


years = sorted({r['date'][:4] for r in records}, reverse=True)
speakers = sorted(by_speaker, key=lambda x: (-len(by_speaker[x]), x))
series = sorted(by_series, key=str.lower)
topics = sorted({t for r in records for t in r['topics']}, key=str.lower)
first, last = records[-1]['date'][:4], records[0]['date'][:4]

archive = f'''  <section class="page-hero">
    <div class="wrap">
      <h1>Sermons</h1>
      <p>{len(records)} messages from Winnipeg Christian Assembly, {first} to {last}.</p>
      <div class="actions"><a class="btn btn-primary" href="teaching.html#messages">Latest services on YouTube</a></div>
    </div>
  </section>

  <section class="section bg-white list-section">
    <div class="wrap">
      <h2 class="list-heading">Recent sermons</h2>
      <div class="card-grid">{"".join(sermon_card(r) for r in records[:6])}
      </div>
    </div>
  </section>

  <section class="section list-section" id="all" data-sermons data-step="20">
    <div class="wrap">
      <div class="browse-head"><h2 class="list-heading">All sermons</h2><span class="muted" data-count></span></div>
      <div class="sermon-filters">
        <label class="filter"><span class="visually-hidden">Search sermons</span><input type="search" placeholder="Search titles" data-search></label>
        <label><span class="visually-hidden">Year</span><select data-key="year"><option value="">All years</option>{options(years)}</select></label>
        <label><span class="visually-hidden">Speaker</span><select data-key="speaker"><option value="">All speakers</option>{options(speakers)}</select></label>
        <label><span class="visually-hidden">Series</span><select data-key="series"><option value="">All series</option>{options(series)}</select></label>
        <label><span class="visually-hidden">Topic</span><select data-key="topic"><option value="">All topics</option>{options(topics)}</select></label>
      </div>
      <div class="list" data-list>{"".join(row(r) for r in records)}
      </div>
      <p class="muted" data-none hidden>No sermons match. Try clearing a filter.</p>
      <div class="center-actions"><button type="button" class="btn btn-line" data-more>Show more</button></div>
    </div>
  </section>'''
write('sermons.html', 'Sermons', 'Sermon archive of Winnipeg Christian Assembly.', archive, 'sermons.html')

with_audio = sum(1 for r in records if r['audio_key'])
print(f'{len(records)} sermons | audio matched {with_audio} | video {sum(1 for r in records if r["youtube"])} | '
      f'notes {sum(1 for r in records if r["notes"])} | audio linked but not found on drive: {len(unmatched)}'
      + ('' if drive else ' (backup drive not connected: reused previous matches)'))
if unmatched:
    print('  not found:', ', '.join(unmatched))
print('audio player:', MEDIA_BASE or 'not set (pages say "Audio coming soon")')
