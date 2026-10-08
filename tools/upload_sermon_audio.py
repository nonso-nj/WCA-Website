#!/usr/bin/env python3
"""Convert the matched sermon audio to speech-quality AAC and upload it to Cloudflare R2.

One file at a time: convert to a temporary file, upload with Wrangler, delete the temporary file.
Sermons whose audio is already reachable at the public address are skipped, so the script can be
stopped and run again safely.

Setup (once): `npx wrangler login` on this Mac (uses your Cloudflare sign-in; no access keys needed).

Usage:
  python3 tools/upload_sermon_audio.py                 upload everything not yet uploaded
  python3 tools/upload_sermon_audio.py --limit 1       upload just one (a test)
  python3 tools/upload_sermon_audio.py --dry-run       list what would be uploaded
  python3 tools/upload_sermon_audio.py --set songs     songs and worship sessions (stereo, music quality)

Reads content/sermons/audio-upload.csv (written by tools/build_sermons.py). The backup drive must be connected
(WCA_BACKUP, default /Volumes/Seagate/thefellowshipinwinnipeg.com).
"""
import argparse
import csv
import os
import pathlib
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
BACKUP = pathlib.Path(os.environ.get('WCA_BACKUP', '/Volumes/Seagate/thefellowshipinwinnipeg.com'))
BUCKET = os.environ.get('WCA_BUCKET', 'wca-media')
MEDIA_BASE = os.environ.get('WCA_MEDIA_BASE', 'https://pub-6c084b91637a45a78c9c5ce4207369a1.r2.dev').rstrip('/')

ap = argparse.ArgumentParser()
ap.add_argument('--limit', type=int, default=0)
ap.add_argument('--dry-run', action='store_true')
ap.add_argument('--set', choices=['sermons', 'songs'], default='sermons')
args = ap.parse_args()

# sermons: mono 64 kbps (speech, about 29 MB per hour); songs: stereo 128 kbps (music)
LIST = ROOT / 'content' / args.set / 'audio-upload.csv'
LOG = ROOT / 'content' / args.set / 'uploaded.txt'  # read by tools/build_sermons.py / tools/build_songs.py
FAILED = ROOT / 'content' / args.set / 'failed.txt'  # files that could not be converted
ENCODE = ['-ac', '1', '-b:a', '64k'] if args.set == 'sermons' else ['-ac', '2', '-b:a', '128k']

if not BACKUP.is_dir():
    sys.exit(f'Backup drive not found at {BACKUP}')


def uploaded(key):
    try:
        req = urllib.request.Request(f'{MEDIA_BASE}/{urllib.request.quote(key)}', method='HEAD')
        return urllib.request.urlopen(req, timeout=20).status == 200
    except urllib.error.HTTPError:
        return False


rows = list(csv.reader(open(LIST)))[1:]
done = set(LOG.read_text().split()) if LOG.exists() else set()
todo = [(src, key) for src, key in rows if key not in done and not uploaded(key)]
for src, key in rows:  # record anything found online but missing from the log
    if key not in done and (src, key) not in todo:
        open(LOG, 'a').write(key + '\n')
if args.limit:
    todo = todo[:args.limit]
print(f'{len(rows)} {args.set} with audio, {len(rows) - len(todo) if not args.limit else "?"} already uploaded, {len(todo)} to do now', flush=True)

started = time.time()
with tempfile.TemporaryDirectory() as tmp:
    for n, (src, key) in enumerate(todo, 1):
        print(f'[{n}/{len(todo)}] {key}', flush=True)
        if args.dry_run:
            continue
        out = pathlib.Path(tmp) / 'audio.m4a'
        try:
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(BACKUP / src), '-vn', '-c:a', 'aac', *ENCODE,
                            '-movflags', '+faststart', str(out)], check=True, timeout=1800)
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
            print('    skipped: the file could not be converted (damaged or unreadable)', flush=True)
            with open(FAILED, 'a') as log:
                log.write(f'{src}\n')
            continue
        for attempt in (1, 2, 3):  # Cloudflare uploads occasionally stall; give up after 15 minutes and retry
            try:
                subprocess.run(['npx', '--yes', 'wrangler', 'r2', 'object', 'put', f'{BUCKET}/{key}', '--file', str(out), '--remote',
                                '--content-type', 'audio/mp4', '--cache-control', 'public, max-age=31536000'],
                               check=True, stdout=subprocess.DEVNULL, timeout=900)
                break
            except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
                print(f'    upload attempt {attempt} failed', flush=True)
        else:
            out.unlink(missing_ok=True)
            continue
        out.unlink()
        with open(LOG, 'a') as log:
            log.write(key + '\n')
        mins = (time.time() - started) / 60
        print(f'    done ({mins:.0f} min so far)', flush=True)
print(f'Finished. Rebuild the pages so the new players appear: python3 tools/build_{args.set}.py')
