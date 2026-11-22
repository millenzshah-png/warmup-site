#!/usr/bin/env node
/**
 * Checks the built site in docs/. Run after tools/build.mjs.
 *
 *   node tools/check.mjs
 *
 * It reads the HTML the way a careful reviewer would: every link lands, every
 * picture exists at the size the page says, every control is named, and no
 * price or temperature appears that the fact sheet does not hold.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { facts } from '../src/facts.mjs';

const docs = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const problems = [];
const fail = (page, message) => problems.push(`${page}: ${message}`);
const exists = async (path) => stat(path).then((s) => s.isFile(), () => false);

const attr = (tag, name) => {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return match ? match[1] : null;
};
const tags = (html, name) => html.match(new RegExp(`<${name}(\\s[^>]*)?>`, 'g')) ?? [];
const visibleText = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
    .replace(/<\/?(?:a|b|strong|small|em|span|output)(?:\s[^>]*)?>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

/** Width and height stored inside a WebP file. */
async function webpSize(path) {
  const data = await readFile(path);
  if (data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WEBP') return null;
  const kind = data.toString('ascii', 12, 16);
  if (kind === 'VP8X') return { width: 1 + data.readUIntLE(24, 3), height: 1 + data.readUIntLE(27, 3) };
  if (kind === 'VP8 ') return { width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff };
  if (kind === 'VP8L') {
    const bits = data.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

const files = (await readdir(docs)).filter((name) => name.endsWith('.html')).sort();
if (files.length === 0) {
  console.error('docs/ has no pages. Run node tools/build.mjs first.');
  process.exit(1);
}
const pages = new Map();
for (const file of files) pages.set(file, await readFile(join(docs, file), 'utf8'));
const idsOf = (html) => [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const sitePath = new URL(facts.siteUrl).pathname;
// An address on the not-found page starts at the site root; everywhere else it is relative.
const local = (address) => (address.startsWith(sitePath) ? address.slice(sitePath.length) : address);

// $0 is the total an empty bag starts with.
const allowedPrices = new Set([0, facts.price, facts.orbitPrice, facts.customPrice, facts.sparePrice].map(String));
const allowedTemps = new Set([
  facts.targetMin, facts.targetMax, facts.panelLimit, facts.panelResume, ...facts.modes.map((mode) => mode.f), '93.0',
].map(String));
const navPages = { 'hoodie.html': 1, 'how-it-works.html': 1, 'app.html': 1, 'story.html': 1, 'help.html': 1 };
const titles = new Map();
const descriptions = new Map();

for (const [file, html] of pages) {
  // Document basics
  if (!html.startsWith('<!doctype html>')) fail(file, 'does not start with the doctype');
  if (!/<html lang="en">/.test(html)) fail(file, 'no lang on <html>');
  if (!/<meta name="viewport" content="width=device-width, initial-scale=1/.test(html)) fail(file, 'no viewport meta');
  const title = /<title>([^<]+)<\/title>/.exec(html)?.[1];
  if (!title) fail(file, 'no title');
  else if (titles.has(title)) fail(file, `same title as ${titles.get(title)}`);
  else titles.set(title, file);
  const description = /<meta name="description" content="([^"]+)">/.exec(html)?.[1];
  if (!description) fail(file, 'no description');
  else {
    if (file !== '404.html' && (description.length < 50 || description.length > 170)) fail(file, `description is ${description.length} characters`);
    if (descriptions.has(description)) fail(file, `same description as ${descriptions.get(description)}`);
    descriptions.set(description, file);
  }
  if (!/<link rel="canonical" href="https:\/\/[^"]+">/.test(html)) fail(file, 'no canonical link');
  // The not-found page is served from any depth, so nothing on it may be relative.
  if (file === '404.html') {
    if (/<base\b/.test(html)) fail(file, 'a <base> tag would send the skip link to the home page');
    for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
      if (!/^(?:[a-z]+:|#)/i.test(match[1]) && !match[1].startsWith(sitePath)) fail(file, `${match[1]} does not start at the site root`);
    }
  }

  // Leftovers
  if (html.includes('{{')) fail(file, 'an unfilled {{token}}');
  const text = visibleText(html);
  for (const bad of ['undefined', 'NaN', '[object', 'lorem', 'TODO', 'null']) {
    if (new RegExp(`\\b${bad.replace('[', '\\[')}\\b`, 'i').test(text)) fail(file, `the text contains "${bad}"`);
  }
  if (/[—–]/.test(text)) fail(file, 'a dash in the visible text');
  if (/\s[,.;:]\s/.test(text.replace(/\d\.\d/g, ''))) fail(file, 'a space before punctuation');

  // Headings
  const headings = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
  if (headings.filter((level) => level === 1).length !== 1) fail(file, `${headings.filter((level) => level === 1).length} h1 headings`);
  headings.reduce((previous, level) => {
    if (level > previous + 1) fail(file, `heading jumps from h${previous} to h${level}`);
    return level;
  }, 0);

  // Ids and the attributes that point at them
  const ids = idsOf(html);
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) fail(file, `id "${id}" is used twice`);
    seen.add(id);
  }
  for (const name of ['for', 'aria-controls', 'aria-labelledby', 'aria-describedby']) {
    for (const match of html.matchAll(new RegExp(`\\s${name}="([^"]+)"`, 'g'))) {
      for (const id of match[1].split(/\s+/)) if (!seen.has(id)) fail(file, `${name} points at missing id "${id}"`);
    }
  }
  for (const match of html.matchAll(/<use href="#([^"]+)"/g)) if (!seen.has(match[1])) fail(file, `icon "${match[1]}" is not in the sprite`);

  // Pictures
  const pictures = tags(html, 'img');
  if (file !== '404.html' && file !== 'help.html' && pictures.length < 3) fail(file, 'fewer than three pictures');
  for (const tag of pictures) {
    const source = local(attr(tag, 'src') ?? '');
    if (attr(tag, 'alt') === null) fail(file, `no alt on ${source}`);
    const width = Number(attr(tag, 'width'));
    const height = Number(attr(tag, 'height'));
    if (!width || !height) fail(file, `no width and height on ${source}`);
    if (!source || !(await exists(join(docs, source)))) {
      fail(file, `picture ${source} is missing`);
      continue;
    }
    const real = await webpSize(join(docs, source));
    if (real && (real.width !== width || real.height !== height)) fail(file, `${source} is ${real.width}x${real.height}, the page says ${width}x${height}`);
  }
  const eager = pictures.filter((tag) => attr(tag, 'fetchpriority') === 'high').length;
  if (eager > 1) fail(file, `${eager} pictures marked as the first to load`);

  // Links
  for (const match of html.matchAll(/<a\b[^>]*\btarget="_blank"[^>]*>[\s\S]*?<\/a>/g)) {
    if (!match[0].includes('(opens in a new tab)')) fail(file, 'a new-tab link does not say so for screen readers');
  }
  for (const tag of tags(html, 'a')) {
    const rawHref = attr(tag, 'href');
    const href = rawHref && !/^https?:/.test(rawHref) ? local(rawHref) : rawHref;
    if (!href) {
      fail(file, 'a link with no href');
      continue;
    }
    if (/^https?:/.test(href)) {
      if (!href.startsWith('https://')) fail(file, `${href} is not https`);
      if (attr(tag, 'target') === '_blank' && !/noopener/.test(attr(tag, 'rel') ?? '')) fail(file, `${href} opens a new tab without rel="noopener"`);
      if (attr(tag, 'target') !== '_blank') fail(file, `outside link ${href} should open a new tab`);
      continue;
    }
    if (/^(mailto|tel|javascript):/.test(href)) {
      fail(file, `${href} is not allowed`);
      continue;
    }
    const [pathAndQuery, fragment] = href.split('#');
    const path = pathAndQuery.split('?')[0];
    const targetFile = path === '' ? file : path;
    if (!pages.has(targetFile)) {
      fail(file, `link to missing page ${href}`);
      continue;
    }
    if (fragment && !idsOf(pages.get(targetFile)).includes(fragment)) fail(file, `link ${href} points at a missing section`);
    const query = pathAndQuery.split('?')[1];
    if (query) {
      const color = new URLSearchParams(query).get('color');
      if (!facts.colors.some((item) => item.id === color)) fail(file, `link ${href} names an unknown color`);
    }
  }

  // Stylesheets, scripts and fonts
  for (const match of html.matchAll(/<(?:link|script)[^>]+(?:href|src)="([^"]+)"/g)) {
    const target = local(match[1]);
    if (/^(https?:|data:)/.test(target)) continue;
    if (!(await exists(join(docs, target)))) fail(file, `${target} is missing`);
  }
  if (/<script[^>]+src="https?:/.test(html) || /<link[^>]+rel="stylesheet"[^>]+href="https?:/.test(html)) fail(file, 'loads code from another site');

  // Controls
  for (const tag of tags(html, 'button')) if (!attr(tag, 'type')) fail(file, 'a button with no type');
  for (const tag of tags(html, 'input')) if (!attr(tag, 'id')) fail(file, 'an input with no id');
  for (const tag of tags(html, 'button')) {
    if (/class="[^"]*icon-btn/.test(tag) && !attr(tag, 'aria-label')) fail(file, 'an icon button with no name');
  }

  if (/aria-pressed/.test(html)) fail(file, 'aria-pressed on a control that cannot be un-pressed');
  for (const match of html.matchAll(/<output[^>]*\sfor="([^"]+)"/g)) {
    if (file === 'hoodie.html' && /color-/.test(match[1])) fail(file, 'the total lists a color, which does not change the price');
  }

  // The header marks the page you are on, in the bar and in the menu
  const current = (html.match(/aria-current="page"/g) ?? []).length;
  const expected = navPages[file] ? 2 : 0;
  if (current !== expected) fail(file, `${current} links marked as the current page, expected ${expected}`);

  // Facts: no price or temperature the fact sheet does not hold
  for (const match of text.matchAll(/\$(\d{1,3}(?:,\d{3})*|\d+)/g)) if (!allowedPrices.has(match[1])) fail(file, `price $${match[1]} is not in the fact sheet`);
  for (const match of html.replace(/<script[\s\S]*?<\/script>/g, '').matchAll(/(\d+(?:\.\d+)?)(?:<span[^>]*>)?°F/g)) {
    if (!allowedTemps.has(match[1])) fail(file, `${match[1]}°F is not in the fact sheet`);
  }
}

// The stylesheet's own files
const css = await readFile(join(docs, 'css', 'fonts.css'), 'utf8');
for (const match of css.matchAll(/url\("([^"]+)"\)/g)) {
  if (!(await exists(join(docs, 'css', match[1])))) fail('css/fonts.css', `${match[1]} is missing`);
}
const siteCss = await readFile(join(docs, 'css', 'site.css'), 'utf8');
if ((siteCss.match(/\{/g) ?? []).length !== (siteCss.match(/\}/g) ?? []).length) fail('css/site.css', 'unbalanced braces');
if (/(?:^|[\s:(,])(?:purple|violet|lavender)\b/i.test(siteCss)) fail('css/site.css', 'a violet colour');

// Every page is reachable from the header or footer, and the extras exist
const home = pages.get('index.html') ?? '';
for (const file of files) {
  if (file === '404.html' || file === 'index.html') continue;
  if (!home.includes(`href="${file}"`)) fail('index.html', `no link to ${file}`);
}
for (const extra of ['sitemap.xml', 'robots.txt', '.nojekyll', 'js/facts.js', 'js/core.js', 'js/site.js', 'img/share.jpg']) {
  if (!(await exists(join(docs, extra)))) fail('docs', `${extra} is missing`);
}

if (problems.length) {
  console.error(`${problems.length} problem${problems.length === 1 ? '' : 's'}:\n` + problems.map((line) => `  ${line}`).join('\n'));
  process.exit(1);
}
console.log(`Checked ${files.length} pages: links, pictures, headings, ids, controls and facts all hold.`);
