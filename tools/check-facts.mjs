#!/usr/bin/env node
/**
 * Compares src/facts.mjs with the Warmup app's own source of truth.
 *
 *   node tools/check-facts.mjs [path to the warmup-app repo]
 *
 * The app repo is expected next to this one. When it is not there the check
 * says so and passes, so the site can still be built on its own.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { facts } from '../src/facts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(process.argv[2] ?? join(here, '..', '..', 'warmup-app'));
const read = (path) => readFile(join(app, path), 'utf8');

let spec, catalog, modes, shop, types;
try {
  [spec, catalog, modes, shop, types] = await Promise.all([
    read('src/core/spec.ts'), read('src/core/shop/catalog.ts'), read('src/core/modes.ts'),
    read('src/ui/screens/Shop.tsx'), read('src/core/types.ts'),
  ]);
} catch (error) {
  const appIsThere = await readFile(join(app, 'package.json'), 'utf8').then(() => true, () => false);
  if (appIsThere) {
    console.error(`The app is at ${app} but a file the check reads is missing: ${error.message}`);
    process.exit(1);
  }
  console.log(`Skipped: no Warmup app source at ${app}.`);
  process.exit(0);
}

const problems = [];
let checked = 0;
const same = (label, mine, theirs) => {
  checked += 1;
  if (String(mine) !== String(theirs)) problems.push(`${label}: the site says ${mine}, the app says ${theirs}`);
};
const constant = (source, name) => {
  const match = new RegExp(`export const ${name}(?::[^=]+)? = ([^;]+);`).exec(source);
  if (!match) throw new Error(`Could not find ${name} in the app`);
  return match[1].trim();
};
// "5 * 60", "25 / 6" and plain numbers only.
const number = (expression) => {
  if (!/^[\d\s.*/+-]+$/.test(expression)) throw new Error(`Not a plain number: ${expression}`);
  return Function(`"use strict"; return (${expression});`)();
};
const num = (name) => number(constant(spec, name));

same('lowest target', facts.targetMin, num('TARGET_MIN_F'));
same('highest target', facts.targetMax, num('TARGET_MAX_F'));
same('default target', facts.targetDefault, num('TARGET_DEFAULT_F'));
same('panel cut-off', facts.panelLimit, num('PANEL_LIMIT_F'));
same('panel resume', facts.panelResume, num('PANEL_RESUME_F'));
same('panel hard limit', facts.panelHardLimit, num('PANEL_HARD_LIMIT_F'));
same('cut-offs before a lock', facts.tripsBeforeLock, num('TRIPS_BEFORE_LOCKOUT'));
same('lock window in minutes', facts.tripWindowMin, num('TRIP_WINDOW_S') / 60);
same('cell capacity', facts.cellMah, num('CELL_CAPACITY_MAH').toLocaleString('en-US'));
same('cell weight', facts.cellG, num('CELL_MASS_G'));
same('cell charge cycles', facts.cellCycles, num('CELL_RATED_CYCLES'));
same('dock power', facts.dockW, num('DOCK_POWER_W'));
same('low battery warning', facts.lowBatteryPct, Math.round(num('LOW_BATTERY_FRACTION') * 100));
same('battery reserve', facts.reservePct, Math.round(num('BATTERY_RESERVE_FRACTION') * 100));
same('ease indoors after', facts.easeIndoorsMin, num('EASE_INDOORS_AFTER_S') / 60);
same('auto-off when still', facts.stillAutoOffMin, num('STILL_AUTO_OFF_S') / 60);

const runtime = /RUNTIME_FROM_FULL_H[^=]*= \[([^\]]+)\]/.exec(spec)[1].split(',').map((part) => Math.round(number(part.trim()) * 60));
facts.runtime.forEach((row, index) => same(`runtime on ${row.level}`, row.minutes, runtime[index]));

const garment = /export const GARMENT = \{([\s\S]*?)\}/.exec(spec)[1];
same('weight', facts.weightG, /weightG: (\d+)/.exec(garment)[1]);
same('fabric', facts.fabric, /fabric: '([^']+)'/.exec(garment)[1]);
same('rated washes', facts.washes, /ratedWashes: (\d+)/.exec(garment)[1]);
same('heat zones', facts.zones, /zones: (\d+)/.exec(garment)[1]);

same('hoodie price', facts.price, number(constant(catalog, 'BASE_PRICE_USD')));
const optionPrice = (id) => new RegExp(`id: '${id}',[\\s\\S]*?priceUsd: (\\d+)`).exec(catalog)[1];
same('Orbit print price', facts.orbitPrice, optionPrice('orbit'));
same('custom design price', facts.customPrice, optionPrice('custom'));
same('spare cells price', facts.sparePrice, optionPrice('spare'));
same('guarantee', facts.guarantee, /const GUARANTEE = '([^']+)'/.exec(shop)[1]);
same('sizes', facts.sizes.join(' '), /HOODIE_SIZES[^=]*= \[([^\]]+)\]/.exec(types)[1].replace(/['\s]/g, '').split(',').join(' '));

for (const mode of facts.modes) {
  const block = new RegExp(`id: '${mode.id}',[\\s\\S]*?\\}\\)`).exec(modes)?.[0];
  if (!block) {
    problems.push(`mode ${mode.id}: not in the app`);
    continue;
  }
  const field = (name) => new RegExp(`${name}: ([^\\n]+),`).exec(block)?.[1].trim();
  const text = (name) => field(name)?.replace(/^'|'$/g, '');
  same(`${mode.name} name`, mode.name, text('name'));
  same(`${mode.name} target`, mode.f, field('targetF') === 'TARGET_DEFAULT_F' ? num('TARGET_DEFAULT_F') : field('targetF'));
  checked += 1;
  if (mode.text !== text('description') && mode.text !== text('blurb')) problems.push(`${mode.name} wording: "${mode.text}" is neither of the app's two lines`);
}
const modeField = (id, name) => new RegExp(`id: '${id}',[\\s\\S]*?${name}: ([^\\n,]+),`).exec(modes)[1].trim();
same('Sick switches off after (minutes)', 120, modeField('sick', 'autoOffMin'));
same('Commute switches off after (minutes)', 90, modeField('commute', 'autoOffMin'));
same('Sleep fades out over (minutes)', 30, modeField('sleep', 'fadeOutMin'));

if (problems.length) {
  console.error(`${problems.length} fact${problems.length === 1 ? '' : 's'} differ from the app:\n` + problems.map((line) => `  ${line}`).join('\n'));
  process.exit(1);
}
console.log(`Checked ${checked} facts against the app at ${app}: all match.`);
