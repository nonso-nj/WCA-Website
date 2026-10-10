// Writes canonical links, share-preview tags and (on the home page) the church's structured data into the static
// pages in redesign/. Run after changing SITE_URL in worker/src/util.js or a page's <title> or description:
//   node tools/seo_static.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { seoTags, churchData } from '../worker/src/util.js';

const PAGES = ['index', 'visit', 'who-we-are', 'teaching', 'bible-study', 'church-life', 'missions', 'care', 'operations'];
const unesc = s => s.replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/&quot;/g, '"');

for (const name of PAGES) {
  const file = new URL(`../redesign/${name}.html`, import.meta.url);
  let html = readFileSync(file, 'utf8');
  const title = unesc(html.match(/<title>([^<]*)<\/title>/)[1]);
  const description = unesc(html.match(/<meta name="description" content="([^"]*)">/)[1]);
  const tags = seoTags({ title, description, path: name === 'index' ? '/' : `/${name}`, data: name === 'index' ? churchData() : null });
  html = html.includes('<!-- seo -->')
    ? html.replace(/<!-- seo -->[\s\S]*?<!-- \/seo -->/, tags)
    : html.replace(/(<meta name="description" content="[^"]*">)/, `$1\n  ${tags}`);
  writeFileSync(file, html);
  console.log(`${name}.html: ${title}`);
}
