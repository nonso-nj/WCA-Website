// Emails the church a copy of each form submission (Plan a visit, Prayer & care).
// Uses Cloudflare Email Routing's send_email binding, which can only send to addresses
// that have been verified under Email > Email Routing > Destination addresses.
// The submission is always saved to the admin Inbox first, so a failed email never loses anything.
import { EmailMessage } from 'cloudflare:email';
import { SITE_URL } from './util.js';

const FROM = 'website@winnipegchristianassembly.com';
const FROM_NAME = 'WCA website';
const TO = 'winnipegchristianassembly@gmail.com';
const BCC = ['thefellowshipinwinnipeg@gmail.com']; // receives a copy, not shown in the message headers

const TITLES = { visit: 'Plan a visit', prayer: 'Prayer & care request' };
const LABELS = {
  first_name: 'First name', last_name: 'Last name', email: 'Email', phone: 'Phone', heard: 'How they heard about us',
  topic: 'Topic', meet: 'Would like to meet', message: 'Message', need: 'Kind of need', request: 'Request',
  contact: 'Preferred contact', consent: 'Agreed to be contacted',
};

const oneLine = s => String(s ?? '').replace(/[\r\n]+/g, ' ').trim();
const b64 = s => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/.{1,76}/g, '$&\r\n').trimEnd();
};
const encodedWord = s => `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(s)))}?=`;

export async function emailSubmission(env, kind, data) {
  if (!env.EMAIL) return;
  const title = TITLES[kind] || 'Form';
  const who = oneLine([data.first_name, data.last_name].filter(Boolean).join(' ')) || 'Someone';
  const lines = Object.keys(LABELS).filter(k => data[k] !== undefined && data[k] !== '')
    .map(k => `${LABELS[k]}: ${data[k] === true ? 'Yes' : data[k] === false ? 'No' : data[k]}`);
  const text = `${title}\r\n\r\n${lines.join('\r\n\r\n')}\r\n\r\n--\r\nSent from the ${SITE_URL.replace('https://', '')} website. `
    + `It is also saved in the admin Inbox: ${SITE_URL}/admin/\r\n`;

  const headers = [
    `From: ${encodedWord(FROM_NAME)} <${FROM}>`,
    `To: ${TO}`,
    `Subject: ${encodedWord(`${title}: ${who}`)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@winnipegchristianassembly.com>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
  ];
  // Replying to the email goes straight to the person who filled in the form
  if (data.email && /^[^\s<>@,;]+@[^\s<>@,;]+$/.test(data.email)) headers.splice(2, 0, `Reply-To: ${oneLine(data.email)}`);
  const raw = `${headers.join('\r\n')}\r\n\r\n${b64(text)}\r\n`;

  // One send per recipient: the first is the "To", the rest are blind copies (same message, other envelope address).
  for (const rcpt of [TO, ...BCC]) {
    try {
      await env.EMAIL.send(new EmailMessage(FROM, rcpt, raw));
    } catch (e) {
      console.error(`Form email to ${rcpt} failed:`, e && e.message);
    }
  }
}
