#!/usr/bin/env python3
"""Build the Music page and a page per song from the backup drive and the old site's song pages.

Songs come from the old "Songs Playlist" page, the Songs folder, and the lyric pages (lyrics are attached to
the matching song). Full Sunday worship recordings are listed separately as worship sessions.

Writes content/songs/songs.json, content/songs/audio-upload.csv (for tools/upload_sermon_audio.py --set songs),
redesign/music.html and redesign/music/<slug>.html. A song gets a player once its key is in
content/songs/uploaded.txt; until then its page says "Audio coming soon".
"""
import csv
import difflib
import html
import json
import os
import pathlib
import re
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = ROOT / 'redesign'
OUT = ROOT / 'content' / 'songs'
BACKUP = pathlib.Path(os.environ.get('WCA_BACKUP', '/Volumes/Seagate/thefellowshipinwinnipeg.com'))
UPLOADS = BACKUP / 'wp-content' / 'uploads'
MEDIA_BASE = os.environ.get('WCA_MEDIA_BASE', 'https://pub-6c084b91637a45a78c9c5ce4207369a1.r2.dev').rstrip('/')

_src = (ROOT / 'tools' / 'import_wordpress.py').read_text()
_ns = {'__file__': str(ROOT / 'tools' / 'import_wordpress.py')}
exec(_src[:_src.index('# ---------------------------------------------------------------- devotionals\n')], _ns)
clean, write = _ns['clean'], _ns['write']

pages = json.load(open(ROOT / 'content' / 'wordpress' / 'pages.json'))
songs_parent = next(p['id'] for p in pages if p['slug'] == 'songs' and p['title']['rendered'] == 'Songs')
lyric_pages = [p for p in pages if p['parent'] == songs_parent]
playlist = next(p for p in pages if p['slug'] == 'songs-playlist')
NOT_SONGS = ('cinematography of the throne room', 'abundant life and peace')  # sermons that were filed under Songs

index = {}
for f in UPLOADS.rglob('*'):
    if f.suffix.lower() in ('.mp3', '.m4a', '.mp4') and 'mailpoet' not in str(f):
        index.setdefault(re.sub(r'[^a-z0-9]', '', f.stem.lower()), f)


def find(url):
    path = BACKUP / urllib.parse.unquote(urllib.parse.urlsplit(url).path).lstrip('/')
    return path if path.is_file() else index.get(re.sub(r'[^a-z0-9]', '', path.stem.lower()))


def norm(t):
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9]+', ' ', t.lower())).strip()


def slugify(t):
    return re.sub(r'[^a-z0-9]+', '-', t.lower()).strip('-')


def split_name(stem):
    """'More than a conqueror- Bro Philip' -> ('More than a conqueror', 'Bro Philip')."""
    s = re.sub(r'[-_]', ' ', stem)
    s = re.sub(r'\(\d\)|\b(0001|redone|copy)\b|\s\d$|(?<=[a-z])\d$', '', s, flags=re.I)
    s = re.sub(r'\s+', ' ', s).strip(' .')
    credit = ''
    m = re.search(r'\s*(?:-\s*)?\b((?:Bro|Sis)\.?\s+[A-Za-z]+)\s*$', s, re.I)
    if m:
        credit, s = m.group(1).strip(), s[:m.start()].strip(' -,')
    if not credit:
        m = re.search(r'(Sis|Bro)([A-Z]?[a-z]+)$', s)  # e.g. covermeSisnicole
        if m:
            credit, s = f'{m.group(1)} {m.group(2).title()}', s[:m.start()]
    return (s[:1].upper() + s[1:]).strip(), credit


songs, sessions, seen, sizes = [], [], set(), set()


def add_song(f, title=None, credit=''):
    t, c = split_name(f.stem)
    title = title or t
    credit = credit or c
    if any(x in norm(f.stem) for x in NOT_SONGS):
        return
    key = norm(title)
    size = f.stat().st_size
    if size in sizes and f.suffix.lower() != '.mp4':
        return
    sizes.add(size)
    if key in seen:
        existing = next(s for s in songs if norm(s['title']) == key)
        if existing['source'].endswith('.mp4') and f.suffix.lower() != '.mp4':  # prefer the audio copy
            existing['source'] = str(f.relative_to(BACKUP))
        return
    seen.add(key)
    songs.append({'title': title, 'credit': credit, 'source': str(f.relative_to(BACKUP)), 'lyrics': '', 'lyrics_title': ''})


for url in re.findall(r'(https?://[^"\' <]+\.(?:mp3|m4a|mp4))', html.unescape(playlist['content']['rendered'])):
    f = find(url)
    if f:
        add_song(f)
for f in sorted((UPLOADS / 'Songs').iterdir()):
    if f.suffix.lower() not in ('.mp3', '.m4a', '.mp4'):
        continue
    if re.search(r'worship|^sunday', f.stem, re.I):
        sessions.append({'title': re.sub(r'\s+', ' ', f.stem.replace('-', ' ')).strip(), 'source': str(f.relative_to(BACKUP))})
    else:
        add_song(f)

# Attach lyrics from the old song pages (and add songs that only existed as a lyric page with audio)
for p in lyric_pages:
    title = html.unescape(p['title']['rendered']).strip()
    lyrics = clean(p['content']['rendered'])
    media = [find(u) for u in re.findall(r'(https?://[^"\' <]+\.(?:mp3|m4a|mp4))', html.unescape(p['content']['rendered']))]
    media = [m for m in media if m]
    target = None
    for m in media:
        target = next((s for s in songs if s['source'] == str(m.relative_to(BACKUP))), None) or target
    if not target:
        score, best = max(((difflib.SequenceMatcher(None, norm(title), norm(s['title'])).ratio(), s) for s in songs), key=lambda x: x[0])
        target = best if score >= 0.88 else None
    if not target and media:
        add_song(media[0], title=title)
        target = songs[-1]
    if target:
        target['title'] = title
        lyrics = re.sub(r'^\s*<h[234][^>]*>\s*(?:<[^>]+>)*\s*Lyrics:?\s*(?:</[^>]+>)*\s*</h[234]>', '', lyrics, flags=re.I)
        target['lyrics'] = lyrics if re.sub(r'<[^>]+>', '', lyrics).strip() else ''
    elif re.sub(r'<[^>]+>', '', lyrics).strip():
        songs.append({'title': title, 'credit': '', 'source': '', 'lyrics': lyrics, 'lyrics_title': ''})

for s in songs:
    s['slug'] = slugify(s['title'])
    s['key'] = f'songs/{s["slug"]}.m4a' if s['source'] else None
for s in sessions:
    s['slug'] = slugify(s['title'])
    s['key'] = f'songs/worship/{s["slug"]}.m4a'
songs.sort(key=lambda s: s['title'].lower())

OUT.mkdir(parents=True, exist_ok=True)
json.dump({'songs': songs, 'sessions': sessions}, open(OUT / 'songs.json', 'w'), indent=1, ensure_ascii=False)
with open(OUT / 'audio-upload.csv', 'w', newline='') as fh:
    w = csv.writer(fh)
    w.writerow(['source (relative to the backup folder)', 'r2_key'])
    w.writerows([(s['source'], s['key']) for s in songs if s['key']] + [(s['source'], s['key']) for s in sessions])
UPLOADED = set((OUT / 'uploaded.txt').read_text().split()) if (OUT / 'uploaded.txt').exists() else set()


def player(key):
    if key and key in UPLOADED:
        return f'<div class="audio-box"><p class="audio-label">Listen</p><audio controls preload="none" src="{MEDIA_BASE}/{key}"></audio></div>'
    return '<div class="audio-box"><p class="audio-label">Listen</p><p class="status">Audio coming soon</p></div>' if key else ''


for s in songs:
    credit = f'<p class="article-meta"><span>{html.escape(s["credit"])}</span></p>' if s['credit'] else ''
    lyrics = f'<h2>Lyrics</h2>{s["lyrics"]}' if s['lyrics'] else ''
    body = f'''  <article class="article">
    <header class="wrap article-head">
      <a class="back-link" href="../music.html">← Music</a>
      <p class="kicker">Song</p>
      <h1>{html.escape(s["title"])}</h1>
      {credit}
    </header>
    <div class="wrap article-body song-body">
      <div class="sermon-media">{player(s["key"])}</div>
      {lyrics}
    </div>
  </article>'''
    write(f'music/{s["slug"]}.html', s['title'], f'{s["title"]}: a song from Winnipeg Christian Assembly.', body, 'music.html', 'no-hero')


def song_row(s):
    flags = ''.join(f'<span class="flag">{x}</span>' for x, ok in (('Audio', s['key']), ('Lyrics', s['lyrics'])) if ok)
    credit = f'<span class="row-sub">{html.escape(s["credit"])}</span>' if s['credit'] else ''
    return (f'<a class="list-row sermon-row" href="music/{s["slug"]}.html" data-item>'
            f'<span><span class="list-title">{html.escape(s["title"])}</span>{credit}</span>'
            f'<span class="row-end">{flags}</span></a>')


def session_row(s):
    if s['key'] in UPLOADED:
        audio = f'<audio controls preload="none" src="{MEDIA_BASE}/{s["key"]}"></audio>'
    else:
        audio = '<span class="status">Audio coming soon</span>'
    return f'<div class="session-row"><span class="list-title">{html.escape(s["title"])}</span>{audio}</div>'


music = (SITE / 'music.html').read_text()
start = music.index('<main id="main">') + len('<main id="main">')
end = music.index('</main>')
main = music[start:end]
hero_end = main.index('</section>') + len('</section>')
worship_video = main[hero_end:main.index('</section>', hero_end) + len('</section>')] if 'Worship with us' in main else ''
new_main = f'''
  <section class="page-hero">
    <div class="wrap">
      <h1>Music</h1>
      <p>Songs and worship from Winnipeg Christian Assembly.</p>
      <div class="actions"><a class="btn btn-primary" href="#songs">Songs</a><a class="btn btn-line" href="#worship">Worship sessions</a></div>
    </div>
  </section>
{worship_video}

  <section class="section list-section" id="songs" data-sermons data-step="1000" data-noun="song">
    <div class="wrap narrow">
      <div class="browse-head"><h2 class="list-heading">Songs</h2><span class="muted" data-count></span></div>
      <div class="sermon-filters"><label class="filter"><span class="visually-hidden">Search songs</span><input type="search" placeholder="Search songs" data-search></label></div>
      <div class="list" data-list>{"".join(song_row(s) for s in songs)}
      </div>
      <p class="muted" data-none hidden>No songs match.</p>
      <div class="center-actions" hidden><button type="button" class="btn btn-line" data-more>Show more</button></div>
    </div>
  </section>

  <section class="section bg-white list-section" id="worship">
    <div class="wrap narrow">
      <h2 class="list-heading">Worship sessions</h2>
      <p class="muted" style="margin-bottom:20px">Full recordings of worship from Sunday services.</p>
      <div class="sessions">{"".join(session_row(s) for s in sessions)}
      </div>
    </div>
  </section>
'''
(SITE / 'music.html').write_text(music[:start] + new_main + music[end:])
print(f'{len(songs)} songs ({sum(1 for s in songs if s["lyrics"])} with lyrics, {sum(1 for s in songs if s["key"])} with audio), '
      f'{len(sessions)} worship sessions; players on: {len(UPLOADED)}')
