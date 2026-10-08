#!/usr/bin/env python3
"""Load the existing content (sermons, summaries, songs, devotionals, Bible studies) into the D1 database.

Reads content/sermons/*.json, content/songs/*.json and content/site-data/*.json (written by the other tools) and
writes content/site-data/seed.sql, then (with --apply) runs it against the remote wca-db database.
Existing rows with the same slug are replaced; rows added through the admin are left alone.

  python3 tools/export_to_d1.py           # write seed.sql only
  python3 tools/export_to_d1.py --apply   # write and load it
"""
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
MEDIA_BASE = 'https://pub-6c084b91637a45a78c9c5ce4207369a1.r2.dev'
CHUNK = 40_000  # D1 limits a single SQL statement to 100 KB, so long text is appended in pieces


def q(v):
    if v is None:
        return 'NULL'
    if isinstance(v, (int, float)):
        return str(int(v))
    return "'" + str(v).replace("'", "''") + "'"


out = []


def upsert(table, key, row, long_fields=()):
    """INSERT OR REPLACE the row, then append any long text fields in chunks."""
    short = {k: ('' if k in long_fields else v) for k, v in row.items()}
    cols = ', '.join(short)
    out.append(f'INSERT OR REPLACE INTO {table} ({cols}) VALUES ({", ".join(q(v) for v in short.values())});')
    for f in long_fields:
        text = row[f] or ''
        for i in range(0, len(text), CHUNK):
            out.append(f'UPDATE {table} SET {f} = {f} || {q(text[i:i + CHUNK])} WHERE {key} = {q(row[key])};')


def lines(path):
    return set(path.read_text().split()) if path.exists() else set()


# ---------------------------------------------------------------- sermons and their summaries
uploaded = lines(ROOT / 'content/sermons/uploaded.txt')
sermons = json.load(open(ROOT / 'content/sermons/sermons.json'))
for r in sermons:
    upsert('sermons', 'slug', {
        'slug': r['slug'], 'title': r['title'], 'date': r['date'],
        'speakers': json.dumps(r['speakers']), 'series': json.dumps(r['series']), 'topics': json.dumps(r['topics']),
        'description': r['description'], 'summary': r['summary'],
        'youtube': r['youtube'], 'youtube_start': r['youtube_start'] or 0,
        'audio_key': r['audio_key'] if r['audio_key'] in uploaded else None,
        'notes_url': f'/{r["notes"]}' if r['notes'] else None,
    }, long_fields=('description',))

out.append('DELETE FROM summaries;')
for n, s in enumerate(json.load(open(ROOT / 'content/sermons/summaries.json'))):
    if not s.get('sermon'):
        continue
    body = None
    if s['kind'] == 'page':
        page = (ROOT / 'redesign' / s['url']).read_text()
        m = re.search(r'<div class="wrap article-body">(.*?)\n    </div>\n  </article>', page, re.S)
        body = m.group(1).strip() if m else ''
    out.append(f'INSERT INTO summaries (sermon_slug, kind, url, body, position) VALUES '
               f'({q(s["sermon"])}, {q(s["kind"])}, {q(s["url"] if s["kind"] == "pdf" else None)}, \'\', {n});')
    if body:
        for i in range(0, len(body), CHUNK):
            out.append(f'UPDATE summaries SET body = body || {q(body[i:i + CHUNK])} WHERE position = {n} AND sermon_slug = {q(s["sermon"])};')

# ---------------------------------------------------------------- songs and worship sessions
song_uploaded = lines(ROOT / 'content/songs/uploaded.txt')
songs = json.load(open(ROOT / 'content/songs/songs.json'))
for i, s in enumerate(songs['songs']):
    upsert('songs', 'slug', {'slug': s['slug'], 'kind': 'song', 'title': s['title'], 'credit': s['credit'], 'lyrics': s['lyrics'],
                             'audio_key': s['key'] if s['key'] in song_uploaded else None, 'date': None, 'position': i},
           long_fields=('lyrics',))
for i, s in enumerate(songs['sessions']):
    upsert('songs', 'slug', {'slug': 'worship-' + s['slug'], 'kind': 'session', 'title': s['title'], 'credit': '', 'lyrics': '',
                             'audio_key': s['key'] if s['key'] in song_uploaded else None, 'date': None, 'position': i})

# ---------------------------------------------------------------- devotionals and studies
for d in json.load(open(ROOT / 'content/site-data/devotionals.json')):
    upsert('devotionals', 'slug', {k: d.get(k) for k in ('slug', 'title', 'number', 'date', 'topic', 'body', 'excerpt',
                                                         'verse_text', 'verse_ref', 'image')}, long_fields=('body',))
for s in json.load(open(ROOT / 'content/site-data/studies.json')):
    upsert('studies', 'slug', {'slug': s['slug'], 'title': s['title'], 'kind': s['kind'], 'topic': s['topic'], 'body': s['body'],
                               'excerpt': s['excerpt'], 'pdf_url': ('/' + s['pdf_urls'][0]) if s['pdf_urls'] else None,
                               'position': s['position']}, long_fields=('body',))

sql = ROOT / 'content/site-data/seed.sql'
sql.write_text('\n'.join(out) + '\n')
print(f'wrote {sql.relative_to(ROOT)}: {len(out)} statements, {sql.stat().st_size / 1e6:.1f} MB')
if '--apply' in sys.argv:
    subprocess.run(['npx', '--yes', 'wrangler', 'd1', 'execute', 'wca-db', '--remote', '--file', str(sql), '-y'], check=True)
