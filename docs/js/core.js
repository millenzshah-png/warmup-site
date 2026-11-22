/*
 * Warmup store logic with no page in it: prices, the bag and the colour of
 * the temperature number. The browser loads it as WarmupCore; the tests load
 * the same file in Node.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WarmupCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const find = (list, id) => list.find((item) => item.id === id);
  const money = (amount) => `$${Number(amount).toLocaleString('en-US')}`;
  const plural = (count) => `${count} ${count === 1 ? 'item' : 'items'}`;

  /** True when every part of a bag line names something the store sells. */
  function validLine(catalog, line) {
    return Boolean(
      line && typeof line === 'object' &&
      find(catalog.colors, line.color) && find(catalog.prints, line.print) && find(catalog.power, line.power) &&
      catalog.sizes.includes(line.size) &&
      Number.isInteger(line.quantity) && line.quantity >= 1 && line.quantity <= catalog.maxQuantity,
    );
  }

  /** Whatever was saved, reduced to the lines the store can still sell. */
  function sanitizeBag(catalog, saved) {
    if (!Array.isArray(saved)) return [];
    const bag = [];
    for (const line of saved) {
      if (!validLine(catalog, line)) continue;
      const clean = { color: line.color, print: line.print, size: line.size, power: line.power, quantity: line.quantity };
      const existing = bag.find((other) => sameConfig(other, clean));
      if (existing) existing.quantity = Math.min(existing.quantity + clean.quantity, catalog.maxQuantity);
      else bag.push(clean);
    }
    return bag;
  }

  function sameConfig(a, b) {
    return a.color === b.color && a.print === b.print && a.size === b.size && a.power === b.power;
  }

  /** The price of one hoodie as configured. */
  function unitPrice(catalog, config) {
    const print = find(catalog.prints, config.print);
    const power = find(catalog.power, config.power);
    if (!print || !power) throw new Error('Unknown option');
    return catalog.price + print.price + power.price;
  }

  /** A new bag with one more of this hoodie in it. */
  function addToBag(catalog, bag, config) {
    const line = { color: config.color, print: config.print, size: config.size, power: config.power, quantity: 1 };
    if (!validLine(catalog, line)) throw new Error('Unknown option');
    const next = bag.map((other) => ({ ...other }));
    const existing = next.find((other) => sameConfig(other, line));
    if (existing) existing.quantity = Math.min(existing.quantity + 1, catalog.maxQuantity);
    else next.push(line);
    return next;
  }

  /** A new bag with the line at this position set to a quantity. Zero removes it. */
  function setQuantity(catalog, bag, index, quantity) {
    const next = bag.map((other) => ({ ...other }));
    if (!next[index]) return next;
    if (quantity < 1) next.splice(index, 1);
    else next[index].quantity = Math.min(Math.floor(quantity), catalog.maxQuantity);
    return next;
  }

  const bagCount = (bag) => bag.reduce((sum, line) => sum + line.quantity, 0);
  const bagTotal = (catalog, bag) => bag.reduce((sum, line) => sum + unitPrice(catalog, line) * line.quantity, 0);

  /** "Bone, size M", "Orbit back print", "Two snap-in cells" */
  function describeLine(catalog, line) {
    return [
      `${find(catalog.colors, line.color).name}, size ${line.size}`,
      find(catalog.prints, line.print).name,
      find(catalog.power, line.power).name,
    ];
  }

  /** Where a temperature sits on the scale, from 0 at the lowest to 1 at the highest. */
  function heatFraction(catalog, f) {
    const t = (f - catalog.targetMin) / (catalog.targetMax - catalog.targetMin);
    return Math.min(1, Math.max(0, t));
  }

  // Cool at the bottom of the scale, bone at Sleep, ember through the middle, yellow at the top.
  const HEAT_STOPS = [
    [0, [110, 160, 255]],
    [0.27, [230, 225, 216]],
    [0.45, [255, 138, 74]],
    [0.73, [255, 106, 43]],
    [1, [255, 200, 87]],
  ];

  /** The colour of the big temperature number, as "rgb(r g b)". */
  function heatColor(t) {
    const at = Math.min(1, Math.max(0, t));
    for (let i = 1; i < HEAT_STOPS.length; i += 1) {
      const [t1, c1] = HEAT_STOPS[i];
      const [t0, c0] = HEAT_STOPS[i - 1];
      if (at <= t1) {
        const k = (at - t0) / (t1 - t0);
        return `rgb(${c0.map((v, j) => Math.round(v + (c1[j] - v) * k)).join(' ')})`;
      }
    }
    return `rgb(${HEAT_STOPS[HEAT_STOPS.length - 1][1].join(' ')})`;
  }

  /** The built-in mode at this temperature, or the "your own mode" entry. */
  function modeFor(catalog, f) {
    return catalog.modes.find((mode) => mode.f === f) || catalog.ownMode;
  }

  return {
    money, plural, validLine, sanitizeBag, sameConfig, unitPrice, addToBag, setQuantity,
    bagCount, bagTotal, describeLine, heatFraction, heatColor, modeFor,
  };
});
