import assert from 'node:assert/strict';
import { test } from 'node:test';
import { facts } from '../src/facts.mjs';

test('the option prices match the named prices', () => {
  const price = (list, id) => list.find((item) => item.id === id).price;
  assert.equal(price(facts.prints, 'none'), 0);
  assert.equal(price(facts.prints, 'orbit'), facts.orbitPrice);
  assert.equal(price(facts.prints, 'custom'), facts.customPrice);
  assert.equal(price(facts.power, 'standard'), 0);
  assert.equal(price(facts.power, 'spare'), facts.sparePrice);
});

test('every mode sits inside the range the hoodie can hold', () => {
  assert.equal(facts.modes.length, 5);
  for (const mode of facts.modes) {
    assert.ok(mode.f >= facts.targetMin && mode.f <= facts.targetMax, mode.name);
  }
  assert.equal(new Set(facts.modes.map((mode) => mode.f)).size, 5);
  assert.equal(facts.modes.find((mode) => mode.id === 'auto').f, facts.targetDefault);
});

test('the runtime wording matches its minutes', () => {
  for (const row of facts.runtime) {
    const [, hours, minutes] = /^(\d+) h (\d+) min$/.exec(row.time);
    assert.equal(Number(hours) * 60 + Number(minutes), row.minutes, row.level);
  }
  assert.ok(facts.runtime[0].minutes > facts.runtime[1].minutes && facts.runtime[1].minutes > facts.runtime[2].minutes);
});

test('the guarantee says what the help page spells out', () => {
  assert.match(facts.guarantee, /Free shipping/);
  assert.match(facts.guarantee, /30-day returns/);
  assert.match(facts.guarantee, /2-year warranty/);
});

test('a panel resumes below the temperature it cuts off at', () => {
  assert.ok(facts.panelResume < facts.panelLimit);
  assert.ok(facts.targetMax < facts.panelResume);
});

test('ids are unique and every color has its photo size', () => {
  for (const list of [facts.colors, facts.prints, facts.power, facts.modes]) {
    assert.equal(new Set(list.map((item) => item.id)).size, list.length);
  }
  for (const color of facts.colors) {
    assert.match(color.image, /^img\/hoodie-[a-z]+\.webp$/);
    assert.ok(color.width > 0 && color.height > 0);
  }
});
