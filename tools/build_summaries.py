#!/usr/bin/env python3
"""Message summaries: upload the PDFs to R2, turn Word files into pages, link them to sermons.

Reads the "Message Summarries" folder on the backup drive (WCA_BACKUP). Duplicate files are skipped.
  PDF  -> uploaded to the wca-media bucket as summaries/<name>.pdf (skipped if already online)
  Word -> converted to a web page at redesign/summaries/<name>.html
Every summary ends up on a sermon page:
  - matched to one of the 337 published sermons, or
  - EXTRA_SERMONS: a new sermon for a recording that was never published (dated from the recording),
    or for a summary with no recording (dated from the document).
Writes content/sermons/summaries.json and content/sermons/extra-sermons.json; tools/build_sermons.py
adds the extra sermons to the archive and a "Message summary" button to each sermon.
"""
import difflib
import hashlib
import html
import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = ROOT / 'redesign'
BACKUP = pathlib.Path(os.environ.get('WCA_BACKUP', '/Volumes/Seagate/thefellowshipinwinnipeg.com'))
FOLDER = BACKUP / 'wp-content' / 'uploads' / 'Message Summarries'
BUCKET = os.environ.get('WCA_BUCKET', 'wca-media')
MEDIA_BASE = os.environ.get('WCA_MEDIA_BASE', 'https://pub-6c084b91637a45a78c9c5ce4207369a1.r2.dev').rstrip('/')

_src = (ROOT / 'tools' / 'import_wordpress.py').read_text()
_ns = {'__file__': str(ROOT / 'tools' / 'import_wordpress.py')}
exec(_src[:_src.index('# ---------------------------------------------------------------- devotionals\n')], _ns)
clean_html, write = _ns['clean'], _ns['write']

if not FOLDER.is_dir():
    sys.exit(f'Message summaries folder not found: {FOLDER}')
sermons = json.load(open(ROOT / 'content' / 'sermons' / 'sermons.json'))

WORDNUM = {'first': '1', 'second': '2', 'third': '3', 'fourth': '4'}
ROMAN = {'ii': '2', 'iii': '3', 'iv': '4', 'vi': '6', 'vii': '7'}


def base(t):
    t = t.lower()
    t = re.sub(r'(\.docx?)+$|\.pdf$|\.m4a$|\.mp3$', '', t)
    t = re.sub(r'\(1\)|-1$|-converted|large font', ' ', t)
    return re.sub(r'[-,\s]+(bro|sis|uncle|aunty|dan)\b.*$', '', t)


def nums(t):
    t = base(t)
    out = set(re.findall(r'\b\d\b', t))
    out |= {WORDNUM[w] for w in re.findall(r'\b(first|second|third|fourth)\b', t)}
    out |= {ROMAN[w] for w in re.findall(r'\b(ii|iii|iv|vi|vii)\b', t)}
    return out


def words(t):
    t = re.sub(r'[^a-z0-9]+', ' ', base(t))
    t = re.sub(r'\b(pt|part|ppart|day|the|a|of|and|\d|first|second|third|ii|iii|iv)\b', ' ', t)
    return re.sub(r'\s+', ' ', t).strip()


def pretty(name):
    t = re.sub(r'(\.docx?)+$|\.pdf$', '', name)
    t = re.sub(r'\(\d\)|-converted', '', t).replace('-', ' ').replace('_', ' ')
    t = re.sub(r'\s+', ' ', t).strip(' ,')
    return t[:1].upper() + t[1:] if not t.isupper() else t.title()


def slugify(t):
    return re.sub(r'[^a-z0-9]+', '-', t.lower()).strip('-')


def online(key):
    try:
        return urllib.request.urlopen(urllib.request.Request(f'{MEDIA_BASE}/{key}', method='HEAD'), timeout=20).status == 200
    except (urllib.error.URLError, TimeoutError):
        return False


# Summaries attached by hand where file names differ too much to match automatically
MANUAL = {
    'The flesh and the spirit Two Ri.pdf': 'the-flesh-the-spirit-two-rival-forces',
    'THE ANATOMY OF THE RENEWED MIND.docx': 'the-anatomy-of-the-renewed-mind-1',
}
SKIP = {
    'Faith-Large-Font.pdf',                    # the Faith Bible study's own PDF (already on that page)
    'they must first be tested(1).docx.doc',   # notes for a devotional series, not a sermon
}
# Messages that were never published as sermons: (summary file, recording in Messages/ or None, title, speaker)
EXTRA_SERMONS = [
    ('A-cry-for-righteousness-Bro-Rukky.pdf', 'Crying out for righteousness-1.m4a', 'A Cry for Righteousness', 'Bro Rukky Atebefia'),
    ('A-man-under-authority.pdf', 'A man under authority 1.m4a', 'A Man Under Authority', ''),
    ('Affirming-the-covenant.pdf', 'Affirming the covenant-1.m4a', 'Affirming the Covenant', ''),
    ('another-miracle-of-sight.pdf', 'Another miracle of sight.m4a', 'Another Miracle of Sight', ''),
    ('appropriating-the-right-of-our-kinsman-redeemer.pdf', 'Apprioprating our kinsman redeemer. Bro achu.m4a',
     'Appropriating the Right of our Kinsman Redeemer', 'Bro Achu Bisong'),
    ('Dividing-the-sea.pdf', 'Dividing the sea- the path of life_ tolu.m4a', 'Dividing the Sea: The Path of Life', 'Bro Tolu Olunubi'),
    ('From-Eden-to-Zion-Pt-1.pdf', 'From Eden to Zion-Pt 1. Aunty Bukky.m4a', 'From Eden to Zion, Part 1', 'Aunty Bukky'),
    ('Power of love.pdf', 'The power of Love. Bro Eli.m4a', 'The Power of Love', 'Bro Eli Ugbomeh'),
    ('ROCK OF AGES 2019.pdf', 'Rock of ages. Bro Richard.  July 21st evening.m4a', 'Rock of Ages', 'Bro Richard Iyoha'),
    ('Understandingthe altar of God.pdf', 'Understanding the altar of God.m4a', 'Understanding the Altar of God', ''),
    ("Walking in the reality of God's word.pdf", 'Walking in the reality of Gods of word.m4a', "Walking in the Reality of God's Word", ''),
    ('7 KEYS TO CONSECRATION.docx', '7 keys to conscencration-sis efe ovwah. July 20th.m4a', '7 Keys to Consecration', 'Sis Efe Ovwah'),
    ('the I Ams of Jesus.docx', "Aunty Efe. The I am's of Jesus.m4a", 'The I AMs of Jesus', 'Aunty Efe'),
    ('The day of atonement 1.pdf', 'Day of atonement.m4a', 'The Day of Atonement', ''),
    ('Day of atonement 2.pdf', 'Day of atonement.m4a', 'The Day of Atonement', ''),
    ('Spiritual Warfare fundamentals (1).pdf', 'Spiritual warfare fundamentals.m4a', 'Spiritual Warfare Fundamentals', ''),
    ('age of war(1).pdf', 'The age of war- A precursor to age of productivity.m4a', 'The Age of War: A Precursor to the Age of Productivity', ''),
    ('Christ our Divine Clothing PT 1 - Bro Salawu-converted.pdf', None, 'Christ our Divine Clothing, Part 1', 'Bro Daniel Salawu'),
    ('Christ our Divine Clothing Pt 2 - Dan Salawu(1).pdf', None, 'Christ our Divine Clothing, Part 2', 'Bro Daniel Salawu'),
    ('Ask-for-the-ancient-path-walk-therein.pdf', None, 'Ask for the Ancient Path, Walk Therein', ''),
    ('Death- Instrument of our change.pdf', None, 'Death: Instrument of our Change', ''),
    ('Evening and morning, Bro sam.pdf', None, 'Evening and Morning', 'Bro Samuel Agboola'),
    ('Let my change come Oh God.pdf', None, 'Let My Change Come, O God', ''),
    ('Message Summary nov 26th 2017.pdf', None, 'Message of November 26, 2017', ''),
    ('The Table of Showbread.pdf', None, 'The Table of Showbread', ''),
    ('The Bread of His presence', None, 'The Bread of His Presence', 'Bro Chidera Bisong'),
    ('WINNIPEG IN-HOUSE TEACHING AUGUST 2019(1).pdf', None, 'Winnipeg In-House Teaching, August 2019', ''),
    ('Resurrection.pdf', None, 'Resurrection', ''),
]
extra_by_file = {e[0]: e for e in EXTRA_SERMONS}
DATES = {'rock-of-ages': '2019-07-21', 'message-of-november-26-2017': '2017-11-26'}  # from the file names


def extra_for(f):
    return extra_by_file.get(f) or next((e for k, e in extra_by_file.items() if f.startswith(k)), None)


cands = [(r['title'], r) for r in sermons] + [(pathlib.Path(r['audio_source']).name, r) for r in sermons if r['audio_source']]
notes_hash = {}
for r in sermons:
    if r['notes'] and (SITE / r['notes']).exists():
        notes_hash[r['slug']] = hashlib.md5((SITE / r['notes']).read_bytes()).hexdigest()

seen, items, used_slugs = set(), [], set()
for f in sorted(os.listdir(FOLDER), key=lambda n: (not n.lower().endswith('.pdf'), n.lower())):  # prefer PDFs
    path = FOLDER / f
    digest = hashlib.md5(path.read_bytes()).hexdigest()
    key = (words(f), tuple(sorted(nums(f))))
    if digest in seen or key in seen:
        continue
    seen |= {digest, key}
    score, match = max(((difflib.SequenceMatcher(None, words(f), words(t)).ratio(), r) for t, r in cands
                        if nums(t) == nums(f)), key=lambda x: x[0], default=(0, None))
    if f in SKIP:
        continue
    sermon = match if score >= 0.8 else None
    if f in MANUAL:
        sermon = next(r for r in sermons if r['slug'] == MANUAL[f])
    if sermon and notes_hash.get(sermon['slug']) == digest:
        continue  # identical to the notes the sermon already has
    extra = None if sermon else extra_for(f)
    target = sermon['slug'] if sermon else (slugify(extra[2]) if extra else None)
    if not target:
        print('not attached to any sermon:', f)
        continue
    title = sermon['title'] if sermon else extra[2]
    slug = slugify(sermon['slug'] if sermon else pretty(f))  # same names as the first upload, so files are reused
    while slug in used_slugs:
        slug += '-2'
    used_slugs.add(slug)
    items.append({'file': f, 'path': path, 'title': title, 'slug': slug, 'sermon': target, 'extra': extra,
                  'kind': 'pdf' if f.lower().endswith('.pdf') else 'page'})

# Upload PDFs, convert Word files
with tempfile.TemporaryDirectory() as tmp:
    for it in items:
        if it['kind'] == 'pdf':
            it['key'] = f'summaries/{it["slug"]}.pdf'
            it['url'] = f'{MEDIA_BASE}/{it["key"]}'
            for attempt in range(3):  # retry: Cloudflare occasionally refuses an upload
                if online(it['key']):
                    break
                done = subprocess.run(['npx', '--yes', 'wrangler', 'r2', 'object', 'put', f'{BUCKET}/{it["key"]}', '--file',
                                       str(it['path']), '--remote', '--content-type', 'application/pdf'],
                                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=300).returncode == 0
                if done:
                    print('uploaded', it['key'])
                    break
        else:
            out = pathlib.Path(tmp) / 'doc.html'
            subprocess.run(['textutil', '-convert', 'html', str(it['path']), '-output', str(out)], check=True)
            raw = out.read_text(errors='replace')
            body_html = clean_html(raw[raw.find('<body'):] if '<body' in raw else raw)
            back = f'<a class="back-link" href="../sermons/{it["sermon"]}.html">← {html.escape(it["title"])}</a>'
            page = f'''  <article class="article">
    <header class="wrap article-head">
      {back}
      <p class="kicker">Message summary</p>
      <h1>{html.escape(it["title"])}</h1>
    </header>
    <div class="wrap article-body">
      {body_html}
    </div>
  </article>'''
            write(f'summaries/{it["slug"]}.html', it['title'], f'Message summary: {it["title"]}', page, 'sermons.html', 'no-hero')
            it['url'] = f'summaries/{it["slug"]}.html'

json.dump([{k: v for k, v in it.items() if k not in ('path', 'extra')} for it in items],
          open(ROOT / 'content' / 'sermons' / 'summaries.json', 'w'), indent=1, ensure_ascii=False)


def recorded(audio, doc):
    """Date of a recording (from the phone's metadata) or, failing that, of the summary document."""
    if audio:
        out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format_tags=creation_time,date', '-of', 'csv=p=0',
                              str(audio)], capture_output=True, text=True).stdout
        m = re.search(r'(\d{4}-\d{2}-\d{2})', out)
        if m:
            return m.group(1)
    data = doc.read_bytes()
    m = re.search(rb'CreationDate\s*\(D:(\d{4})(\d{2})(\d{2})', data)
    if m:
        return '-'.join(x.decode() for x in m.groups())
    if doc.suffix.lower().startswith('.doc'):
        import zipfile
        try:
            core = zipfile.ZipFile(doc).read('docProps/core.xml').decode()
            m = re.search(r'<dcterms:created[^>]*>(\d{4}-\d{2}-\d{2})', core)
            if m:
                return m.group(1)
        except (zipfile.BadZipFile, KeyError):
            pass
    return ''


extras = {}
for it in items:
    e = it['extra']
    if not e:
        continue
    summary_file, audio_name, title, speaker = e
    slug = slugify(title)
    audio = FOLDER.parent / 'Messages' / audio_name if audio_name else None
    rec = extras.setdefault(slug, {'slug': slug, 'title': title, 'speakers': [speaker] if speaker else [],
                                   'audio_source': str(audio.relative_to(BACKUP)) if audio and audio.is_file() else None,
                                   'date': recorded(audio if audio and audio.is_file() else None, it['path'])})
    if not rec['date']:
        rec['date'] = recorded(None, it['path'])
    rec['date'] = DATES.get(slug, rec['date'])
json.dump(sorted(extras.values(), key=lambda r: r['date'] or '0', reverse=True),
          open(ROOT / 'content' / 'sermons' / 'extra-sermons.json', 'w'), indent=1, ensure_ascii=False)
(SITE / 'message-summaries.html').unlink(missing_ok=True)
print(f'{len(items)} summaries ({sum(i["kind"] == "pdf" for i in items)} PDFs in R2, {sum(i["kind"] == "page" for i in items)} pages); '
      f'{len(extras)} new sermons for unpublished messages ({sum(1 for r in extras.values() if r["audio_source"])} with recordings)')
