#!/usr/bin/env node
/**
 * Builds the site from src/ into docs/, which GitHub Pages serves.
 *
 *   node tools/build.mjs
 *
 * Each file in src/pages is a page body with a small header block. The build
 * wraps it in the shared layout, fills {{tokens}} from src/facts.mjs and
 * writes plain HTML. There are no dependencies and nothing runs in the
 * browser to assemble a page.
 */
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { facts } from '../src/facts.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const out = join(root, 'docs');

const read = (path) => readFile(join(src, path), 'utf8');
const escapeHtml = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const priceLabel = (price) => (price > 0 ? `+$${price}` : 'Included');
const check = '<span class="row__mark"><svg class="icon" aria-hidden="true"><use href="#i-check"/></svg></span>';

/* ---------- Fragments rendered from the facts ---------- */

const optionRows = (name, options) =>
  options
    .map((option, index) => {
      const detail = option.detail ? `<small>${escapeHtml(option.detail)}</small>` : '';
      return `<label class="row"><input type="radio" id="${name}-${option.id}" name="${name}" value="${option.id}"${index === 0 ? ' checked' : ''}>${check}<span class="row__text"><b>${escapeHtml(option.name)}</b>${detail}</span><span class="row__price">${priceLabel(option.price)}</span></label>`;
    })
    .join('\n            ');

const html = {
  modeChips: facts.modes
    .map((mode) => `<button type="button" class="chip" data-target="${mode.f}"${mode.f === facts.targetDefault ? ' aria-current="true"' : ''}>${mode.name} <span>${mode.f}°F</span></button>`)
    .join('\n            '),

  runtimeRows: facts.runtime
    .map((row) => {
      const width = ((row.minutes / facts.runtime[0].minutes) * 100).toFixed(1);
      return `<div style="--w:${width}%"><dt>${row.level}</dt><dd><span class="runtime__bar"></span><span class="runtime__time">${row.time}</span></dd></div>`;
    })
    .join('\n              '),

  swatches: facts.colors
    .map((color, index) => `<label class="swatch"><input type="radio" id="color-${color.id}" name="color" value="${color.id}"${index === 0 ? ' checked' : ''}><span class="swatch__chip" style="--sw:${color.swatch}"></span><span class="sr">${color.name}</span></label>`)
    .join('\n            '),

  printRows: optionRows('print', facts.prints),
  powerRows: optionRows('power', facts.power),

  sizeOptions: facts.sizes
    .map((size) => `<label class="size"><input type="radio" id="size-${size.toLowerCase()}" name="size" value="${size}"${size === 'M' ? ' checked' : ''}><span>${size}</span></label>`)
    .join('\n            '),

  colorWall: [...facts.colors]
    .reverse()
    .map((color) => `<a class="wall__item" href="hoodie.html?color=${color.id}"><span class="studio" data-color="${color.id}"><img src="${color.image}" width="${color.width}" height="${color.height}" loading="lazy" alt="${color.name} Warmup hoodie, front view"></span><span class="wall__name">${color.name}</span></a>`)
    .join('\n        '),

  modeList: [...facts.modes]
    .sort((a, b) => ['auto', 'sick', 'commute', 'outdoor', 'sleep'].indexOf(a.id) - ['auto', 'sick', 'commute', 'outdoor', 'sleep'].indexOf(b.id))
    .map((mode) => `<div class="mode"><dt><span class="mode__temp">${mode.f}<span>°F</span></span><span class="mode__name">${mode.name}</span></dt><dd>${escapeHtml(mode.detail)}</dd></div>`)
    .join('\n          '),

  sizeRange: `${facts.sizes[0]} to ${facts.sizes.at(-1)}`,
};

/* ---------- Tokens ---------- */

const lookup = (scope, path) =>
  path.split('.').reduce((value, key) => (value === undefined || value === null ? undefined : value[key]), scope);

function fill(template, scope, where) {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, path) => {
    const value = lookup(scope, path);
    if (value === undefined || typeof value === 'object') throw new Error(`${where}: nothing to fill ${match} with`);
    return String(value);
  });
}

async function expandPartials(template) {
  const names = [...template.matchAll(/\{\{>\s*([\w-]+)\s*\}\}/g)].map((m) => m[1]);
  let result = template;
  for (const name of new Set(names)) {
    const partial = await expandPartials(await read(`partials/${name}.html`));
    result = result.replaceAll(new RegExp(`\\{\\{>\\s*${name}\\s*\\}\\}`, 'g'), partial.trimEnd());
  }
  return result;
}

function parsePage(text, file) {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!match) throw new Error(`${file}: missing the header block`);
  const meta = {};
  for (const line of match[1].split('\n')) {
    const at = line.indexOf(':');
    if (at === -1) throw new Error(`${file}: bad header line "${line}"`);
    meta[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  for (const key of ['title', 'description', 'key']) if (!meta[key]) throw new Error(`${file}: header needs "${key}"`);
  return { meta, body: match[2].trim() };
}

/** Says, for screen readers, that a link opens a new tab. */
function markNewTabLinks(document) {
  return document.replace(/(<a\b[^>]*\btarget="_blank"[^>]*>)([\s\S]*?)(<\/a>)/g, (match, open, inside, close) =>
    `${open}${inside}<span class="sr"> (opens in a new tab)</span>${close}`);
}

/** Rewrites every relative address in a page so it starts at the site root. In-page #links stay as they are. */
function fromSiteRoot(document, basePath) {
  return document.replace(/\b(href|src)="([^"]+)"/g, (match, name, value) =>
    /^(?:[a-z]+:|\/|#)/i.test(value) ? match : `${name}="${basePath}${value}"`);
}

/* ---------- Build ---------- */

const NAV_KEYS = ['hoodie', 'how', 'app', 'story', 'help'];

async function build() {
  await rm(out, { recursive: true, force: true });
  await mkdir(join(out, 'js'), { recursive: true });

  const layout = await expandPartials(await read('partials/layout.html'));
  const files = (await readdir(join(src, 'pages'))).filter((name) => name.endsWith('.html')).sort();

  for (const file of files) {
    const { meta, body } = parsePage(await read(`pages/${file}`), file);
    const current = Object.fromEntries(NAV_KEYS.map((key) => [key, meta.key === key ? ' aria-current="page"' : '']));
    const page = {
      ...meta,
      file,
      description: escapeHtml(meta.description),
      title: escapeHtml(meta.title),
      canonical: facts.siteUrl + (file === 'index.html' ? '' : file),
      robots: file === '404.html' ? '<meta name="robots" content="noindex">\n' : '',
    };
    const scope = { ...facts, html, page, current };
    const content = fill(await expandPartials(body), scope, file);
    let document = fill(layout, { ...scope, content }, `layout for ${file}`);
    document = markNewTabLinks(document);
    // The not-found page can be served from any depth, so everything it loads or links starts at the site root.
    if (file === '404.html') document = fromSiteRoot(document, new URL(facts.siteUrl).pathname);
    await writeFile(join(out, file), document);
  }

  // The same facts for the browser scripts.
  const client = {
    price: facts.price,
    maxQuantity: facts.maxQuantity,
    guarantee: facts.guarantee,
    sizes: facts.sizes,
    colors: facts.colors.map(({ id, name, image }) => ({ id, name, image })),
    prints: facts.prints.map(({ id, name, price }) => ({ id, name, price })),
    power: facts.power.map(({ id, bagName, price }) => ({ id, name: bagName, price })),
    targetMin: facts.targetMin,
    targetMax: facts.targetMax,
    modes: facts.modes.map(({ name, f, text }) => ({ name, f, text })),
    ownMode: facts.ownMode,
  };
  await writeFile(join(out, 'js', 'facts.js'), `/* Written by tools/build.mjs from src/facts.mjs. */\nwindow.WARMUP = ${JSON.stringify(client, null, 2)};\n`);

  for (const dir of ['css', 'img', 'fonts']) await cp(join(src, dir), join(out, dir), { recursive: true });
  for (const file of await readdir(join(src, 'js'))) await cp(join(src, 'js', file), join(out, 'js', file));
  await writeFile(join(out, '.nojekyll'), '');

  const listed = files.filter((file) => file !== '404.html');
  const urls = listed.map((file) => `  <url><loc>${facts.siteUrl}${file === 'index.html' ? '' : file}</loc></url>`).join('\n');
  await writeFile(join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
  await writeFile(join(out, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${facts.siteUrl}sitemap.xml\n`);

  console.log(`Built ${files.length} pages into docs/: ${files.join(', ')}`);
}

build().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
