#!/usr/bin/env node
/**
 * Serves docs/ the way GitHub Pages does: under the site's own path, with
 * 404.html for anything missing.
 *
 *   node tools/serve.mjs          then open http://localhost:5180/warmup-site/
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { facts } from '../src/facts.mjs';

const docs = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const base = new URL(facts.siteUrl).pathname;
const port = Number(process.env.PORT ?? process.argv[2] ?? 5180);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
};

async function fileFor(pathname) {
  if (!pathname.startsWith(base)) return null;
  const relative = normalize(decodeURIComponent(pathname.slice(base.length))).replace(/^(\.\.[/\\])+/, '');
  let path = join(docs, relative);
  if (!path.startsWith(docs)) return null;
  try {
    if ((await stat(path)).isDirectory()) path = join(path, 'index.html');
    await stat(path);
    return path;
  } catch {
    return null;
  }
}

createServer(async (request, response) => {
  const { pathname } = new URL(request.url, 'http://localhost');
  if (pathname === '/') {
    response.writeHead(302, { Location: base });
    response.end();
    return;
  }
  const path = await fileFor(pathname);
  const target = path ?? join(docs, '404.html');
  try {
    const body = await readFile(target);
    response.writeHead(path ? 200 : 404, { 'Content-Type': TYPES[extname(target)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end('Not found. Run node tools/build.mjs first.');
  }
}).listen(port, '127.0.0.1', () => console.log(`http://localhost:${port}${base}`));
