import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { facts } from '../src/facts.mjs';

const core = createRequire(import.meta.url)('../src/js/core.js');

// The same shape tools/build.mjs hands to the browser.
const catalog = {
  price: facts.price,
  maxQuantity: facts.maxQuantity,
  sizes: facts.sizes,
  colors: facts.colors.map(({ id, name, image }) => ({ id, name, image })),
  prints: facts.prints.map(({ id, name, price }) => ({ id, name, price })),
  power: facts.power.map(({ id, bagName, price }) => ({ id, name: bagName, price })),
  targetMin: facts.targetMin,
  targetMax: facts.targetMax,
  modes: facts.modes.map(({ name, f, text }) => ({ name, f, text })),
  ownMode: facts.ownMode,
};
const base = { color: 'black', print: 'none', size: 'M', power: 'standard' };

test('the plain hoodie costs the base price', () => {
  assert.equal(core.unitPrice(catalog, base), 149);
});

test('every option adds exactly its own price', () => {
  assert.equal(core.unitPrice(catalog, { ...base, print: 'orbit' }), 169);
  assert.equal(core.unitPrice(catalog, { ...base, print: 'custom' }), 179);
  assert.equal(core.unitPrice(catalog, { ...base, power: 'spare' }), 184);
  assert.equal(core.unitPrice(catalog, { ...base, print: 'orbit', power: 'spare' }), 204);
  assert.equal(core.unitPrice(catalog, { ...base, print: 'custom', power: 'spare' }), 214);
});

test('color and size never change the price', () => {
  for (const color of catalog.colors) {
    for (const size of catalog.sizes) {
      assert.equal(core.unitPrice(catalog, { ...base, color: color.id, size }), 149);
    }
  }
});

test('an unknown option is refused, not priced', () => {
  assert.throws(() => core.unitPrice(catalog, { ...base, print: 'gold' }));
  assert.throws(() => core.addToBag(catalog, [], { ...base, color: 'rust' }));
  assert.throws(() => core.addToBag(catalog, [], { ...base, size: 'XXXL' }));
});

test('adding the same hoodie twice makes one line of two', () => {
  let bag = core.addToBag(catalog, [], base);
  bag = core.addToBag(catalog, bag, base);
  assert.equal(bag.length, 1);
  assert.equal(bag[0].quantity, 2);
  assert.equal(core.bagCount(bag), 2);
  assert.equal(core.bagTotal(catalog, bag), 298);
});

test('a different size or color is its own line', () => {
  let bag = core.addToBag(catalog, [], base);
  bag = core.addToBag(catalog, bag, { ...base, size: 'L' });
  bag = core.addToBag(catalog, bag, { ...base, color: 'bone' });
  assert.equal(bag.length, 3);
  assert.equal(core.bagTotal(catalog, bag), 447);
});

test('adding never changes the bag it was given', () => {
  const before = core.addToBag(catalog, [], base);
  const copy = JSON.parse(JSON.stringify(before));
  core.addToBag(catalog, before, base);
  core.setQuantity(catalog, before, 0, 5);
  assert.deepEqual(before, copy);
});

test('a line stops at the most the store allows', () => {
  let bag = [];
  for (let i = 0; i < 20; i += 1) bag = core.addToBag(catalog, bag, base);
  assert.equal(bag[0].quantity, facts.maxQuantity);
  assert.equal(core.setQuantity(catalog, bag, 0, 500)[0].quantity, facts.maxQuantity);
});

test('adding to a full line changes nothing, so the page can say so', () => {
  let bag = [];
  for (let i = 0; i < facts.maxQuantity; i += 1) bag = core.addToBag(catalog, bag, base);
  const before = core.bagCount(bag);
  const after = core.bagCount(core.addToBag(catalog, bag, base));
  assert.equal(before, facts.maxQuantity);
  assert.equal(after, before);
});

test('a bag saved by an older version of the site is dropped, not misread', () => {
  const old = [{ color: 'black', back: 'plain', size: 'M', power: 'standard', quantity: 2 }];
  assert.deepEqual(core.sanitizeBag(catalog, old), []);
});

test('setting a quantity of zero removes the line', () => {
  let bag = core.addToBag(catalog, [], base);
  bag = core.addToBag(catalog, bag, { ...base, print: 'orbit' });
  bag = core.setQuantity(catalog, bag, 0, 0);
  assert.equal(bag.length, 1);
  assert.equal(bag[0].print, 'orbit');
  assert.deepEqual(core.setQuantity(catalog, bag, 7, 3), bag);
});

test('the mixed bag from the browser check adds up', () => {
  let bag = core.addToBag(catalog, [], { color: 'heather', print: 'orbit', size: 'M', power: 'spare' });
  bag = core.addToBag(catalog, bag, { color: 'bone', print: 'none', size: 'M', power: 'standard' });
  bag = core.addToBag(catalog, bag, { color: 'bone', print: 'none', size: 'M', power: 'standard' });
  assert.equal(core.bagCount(bag), 3);
  assert.equal(core.bagTotal(catalog, bag), 502);
  assert.equal(core.money(core.bagTotal(catalog, bag)), '$502');
});

test('a saved bag is cleaned before it is trusted', () => {
  const saved = [
    { ...base, quantity: 2 },
    { ...base, quantity: 3 },
    { ...base, color: 'rust', quantity: 1 },
    { ...base, quantity: 0 },
    { ...base, quantity: 1.5 },
    { ...base, quantity: 99 },
    { ...base, size: 'M', quantity: 1, extra: '<script>' },
    null,
    'hoodie',
  ];
  const bag = core.sanitizeBag(catalog, saved);
  assert.equal(bag.length, 1);
  assert.equal(bag[0].quantity, 6);
  assert.deepEqual(Object.keys(bag[0]).sort(), ['color', 'power', 'print', 'quantity', 'size']);
  assert.deepEqual(core.sanitizeBag(catalog, 'nonsense'), []);
  assert.deepEqual(core.sanitizeBag(catalog, null), []);
});

test('a bag line reads the way the bag shows it', () => {
  assert.deepEqual(core.describeLine(catalog, { ...base, color: 'bone', print: 'orbit', power: 'spare', quantity: 1 }), [
    'Bone, size M',
    'Orbit back print',
    'Two cells and a spare pair',
  ]);
});

test('money and counts are written for people', () => {
  assert.equal(core.money(149), '$149');
  assert.equal(core.money(1341), '$1,341');
  assert.equal(core.plural(1), '1 item');
  assert.equal(core.plural(3), '3 items');
});

test('each built-in mode is found at its own temperature', () => {
  for (const mode of facts.modes) assert.equal(core.modeFor(catalog, mode.f).name, mode.name);
  assert.equal(core.modeFor(catalog, 93).name, 'Auto');
  assert.equal(core.modeFor(catalog, 89).name, 'Your own mode');
  assert.equal(core.modeFor(catalog, 99).name, 'Your own mode');
});

test('the scale runs from 0 at 88°F to 1 at 99°F', () => {
  assert.equal(core.heatFraction(catalog, 88), 0);
  assert.equal(core.heatFraction(catalog, 99), 1);
  assert.ok(Math.abs(core.heatFraction(catalog, 93) - 5 / 11) < 1e-9);
  assert.equal(core.heatFraction(catalog, 40), 0);
  assert.equal(core.heatFraction(catalog, 140), 1);
});

test('the number is cool at the bottom, ember in the middle and yellow at the top', () => {
  assert.equal(core.heatColor(0), 'rgb(110 160 255)');
  assert.equal(core.heatColor(0.73), 'rgb(255 106 43)');
  assert.equal(core.heatColor(1), 'rgb(255 200 87)');
  assert.equal(core.heatColor(-3), 'rgb(110 160 255)');
  assert.equal(core.heatColor(7), 'rgb(255 200 87)');
  for (let i = 0; i <= 110; i += 1) assert.match(core.heatColor(i / 110), /^rgb\(\d{1,3} \d{1,3} \d{1,3}\)$/);
});

test('no step on the scale is violet', () => {
  // Violet would mean red and blue both well above green.
  for (let f = facts.targetMin; f <= facts.targetMax; f += 1) {
    const [r, g, b] = core.heatColor(core.heatFraction(catalog, f)).match(/\d+/g).map(Number);
    assert.ok(!(r > g + 25 && b > g + 25), `${f}°F is rgb(${r} ${g} ${b})`);
  }
});
