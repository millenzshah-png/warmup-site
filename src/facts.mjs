/**
 * Every product fact the site states, in one place.
 *
 * Pages use these through {{tokens}} and the browser scripts read the same
 * object, so a number can only ever be changed here. tools/check-facts.mjs
 * compares this file with the Warmup app's own spec when the app repo sits
 * next to this one.
 */
export const facts = {
  siteUrl: 'https://millenzshah-png.github.io/warmup-site/',
  appUrl: 'https://millenzshah-png.github.io/warmup-app/',
  year: 2026,

  // Store
  price: 149,
  orbitPrice: 20,
  customPrice: 30,
  sparePrice: 35,
  maxQuantity: 9,
  guarantee: 'Free shipping, 30-day returns and a 2-year warranty on the heating and cells.',
  sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  colors: [
    { id: 'black', name: 'Black', swatch: '#1D1D1F', image: 'img/hoodie-black.webp', width: 1104, height: 1180 },
    { id: 'heather', name: 'Heather', swatch: '#9A9A9E', image: 'img/hoodie-heather.webp', width: 1109, height: 1180 },
    { id: 'bone', name: 'Bone', swatch: '#E8E2D4', image: 'img/hoodie-bone.webp', width: 1109, height: 1180 },
  ],
  prints: [
    { id: 'none', name: 'No extra print', detail: '', price: 0 },
    { id: 'orbit', name: 'Orbit back print', detail: 'Line-art print on the back', price: 20 },
    { id: 'custom', name: 'Your design', detail: 'Upload after checkout', price: 30 },
  ],
  power: [
    { id: 'standard', name: 'Two snap-in cells', bagName: 'Two snap-in cells', detail: 'Enough for a school day on Low', price: 0 },
    { id: 'spare', name: 'Add a spare cell pair', bagName: 'Two cells and a spare pair', detail: 'A second pair to swap in when the first runs down', price: 35 },
  ],

  // Heating
  targetMin: 88,
  targetMax: 99,
  targetDefault: 93,
  panelLimit: 113,
  panelResume: 105,
  panelHardLimit: 122,
  tripsBeforeLock: 3,
  tripWindowMin: 10,
  zones: 3,
  stillAutoOffMin: 30,
  easeIndoorsMin: 5,
  modes: [
    { id: 'sleep', name: 'Sleep', f: 91, text: 'Low, even heat that fades out over 30 minutes.', detail: 'Low, even heat while you settle. It fades out on its own and switches off.' },
    { id: 'auto', name: 'Auto', f: 93, text: 'Holds a comfortable skin temperature using the collar sensor.', detail: 'Reads the collar sensor every few seconds and pulses heat to keep you level.' },
    { id: 'sick', name: 'Sick', f: 95, text: 'Gentle, steady warmth for chills. The hoodie ramps up slowly and never spikes.', detail: 'Gentle, steady warmth for chills. It ramps up slowly and switches off after 2 hours. Comfort, not treatment: see a doctor if a fever lasts more than two days.' },
    { id: 'commute', name: 'Commute', f: 96, text: 'Preheats before you leave, then eases off indoors.', detail: 'Warm by the time you step out. Once you have been still indoors for five minutes it drops to Low, and it switches off after 90 minutes.' },
    { id: 'outdoor', name: 'Outdoor', f: 97, text: 'Tracks the outside temperature from your phone.', detail: 'Uses the outside temperature from your phone. The colder it is out there, the closer it holds to your target.' },
  ],
  ownMode: { name: 'Your own mode', text: 'Save this temperature as a mode of your own, next to the five built in.' },

  // Cells
  cellMah: '2,500',
  cellG: 50,
  cellCycles: 500,
  dockW: 18,
  chargeTime: 'about 1 hour per cell',
  lowBatteryPct: 20,
  reservePct: 3,
  runtime: [
    { level: 'Low', time: '6 h 30 min', minutes: 390 },
    { level: 'Medium', time: '4 h 10 min', minutes: 250 },
    { level: 'High', time: '2 h 50 min', minutes: 170 },
  ],

  // Garment
  weightG: 640,
  fabric: '320 gsm cotton-poly fleece',
  washes: 50,
  preheatOptions: '5, 10, 15 or 20 minutes',
};
