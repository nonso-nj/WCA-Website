#!/usr/bin/env python3
"""Create (or reset) a WCA Admin account from this Mac. Use it for the first owner account, or if every owner
is locked out. Everyone else can be added from the admin's Editors page.

  python3 tools/create_admin_user.py --owner --care-team

You type the password here; only a salted hash (PBKDF2-SHA256, the same as the site uses) is stored.
"""
import argparse
import getpass
import hashlib
import os
import subprocess
import sys

ITERATIONS = 100000  # must match worker/src/auth.js

ap = argparse.ArgumentParser()
ap.add_argument('--owner', action='store_true', help='can add and remove editors')
ap.add_argument('--care-team', action='store_true', help='can read prayer and pastoral care requests')
args = ap.parse_args()

email = input('Email: ').strip().lower()
name = input('Name (optional): ').strip()
if '@' not in email:
    sys.exit('That does not look like an email address.')
password = getpass.getpass('Password (at least 10 characters, not shown): ')
if len(password) < 10:
    sys.exit('Please use at least 10 characters.')
if getpass.getpass('Type it again: ') != password:
    sys.exit('The two passwords did not match.')

salt = os.urandom(16)
digest = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, ITERATIONS, dklen=32)
q = lambda s: "'" + s.replace("'", "''") + "'"
sql = (f"INSERT INTO users (email, name, password_hash, salt, is_owner, care_team) VALUES "
       f"({q(email)}, {q(name)}, {q(digest.hex())}, {q(salt.hex())}, {int(args.owner)}, {int(args.care_team)}) "
       f"ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, salt = excluded.salt, "
       f"name = CASE WHEN excluded.name != '' THEN excluded.name ELSE users.name END, "
       f"is_owner = MAX(users.is_owner, excluded.is_owner), care_team = MAX(users.care_team, excluded.care_team);")
subprocess.run(['npx', '--yes', 'wrangler', 'd1', 'execute', 'wca-db', '--remote', '--command', sql],
               check=True, stdout=subprocess.DEVNULL)
print(f'Done. {email} can now sign in at /admin' + (' as an owner' if args.owner else '') + (' (care team)' if args.care_team else '') + '.')
