#!/usr/bin/env python3
"""Convert the matched sermon audio to speech-quality AAC and upload it to Cloudflare R2.

One file at a time: convert to a temporary file, upload with rclone, delete the temporary file.
Files already in the bucket are skipped, so the script can be stopped and run again safely.

Setup (once):
  brew install rclone
  rclone config        # create a remote of type "s3", provider "Cloudflare", with your own R2 access key

Usage:
  python3 tools/upload_sermon_audio.py <remote:bucket>            e.g.  wca-r2:wca-media
  python3 tools/upload_sermon_audio.py <remote:bucket> --dry-run  (list what would be uploaded)

Reads content/sermons/audio-upload.csv (written by tools/build_sermons.py). The backup drive must be connected
(WCA_BACKUP, default /Volumes/Seagate/thefellowshipinwinnipeg.com).
"""
import csv
import os
import pathlib
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
BACKUP = pathlib.Path(os.environ.get('WCA_BACKUP', '/Volumes/Seagate/thefellowshipinwinnipeg.com'))
BITRATE = '64k'  # mono AAC; clear for speech, about 29 MB per hour

if len(sys.argv) < 2:
    sys.exit(__doc__)
dest = sys.argv[1].rstrip('/')
dry = '--dry-run' in sys.argv
if not BACKUP.is_dir():
    sys.exit(f'Backup drive not found at {BACKUP}')

rows = list(csv.reader(open(ROOT / 'content' / 'sermons' / 'audio-upload.csv')))[1:]
listing = subprocess.run(['rclone', 'lsf', '-R', '--files-only', f'{dest}/sermons'], capture_output=True, text=True)
existing = {f'sermons/{line.strip()}' for line in listing.stdout.splitlines() if line.strip()}
todo = [(src, key) for src, key in rows if key not in existing]
print(f'{len(rows)} sermons with audio, {len(existing)} already uploaded, {len(todo)} to go')

with tempfile.TemporaryDirectory() as tmp:
    for n, (src, key) in enumerate(todo, 1):
        source = BACKUP / src
        print(f'[{n}/{len(todo)}] {key}')
        if dry:
            continue
        out = pathlib.Path(tmp) / 'audio.m4a'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(source), '-vn', '-ac', '1', '-c:a', 'aac', '-b:a', BITRATE,
                        '-movflags', '+faststart', str(out)], check=True)
        subprocess.run(['rclone', 'copyto', str(out), f'{dest}/{key}', '--header-upload', 'Content-Type: audio/mp4',
                        '--header-upload', 'Cache-Control: public, max-age=31536000'], check=True)
        out.unlink()
print('Done. Rebuild the pages with the public URL, e.g.:\n  WCA_MEDIA_BASE=https://media.example.org python3 tools/build_sermons.py')
