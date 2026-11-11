const p = 'C:/1-2/tennishalle/site/assets/site.js';
let b = await Bun.file(p).text();
const T = [
  ['`01 — The hit`', '`01 — Der Schlag`'],
  ['`02 — The rally`', '`02 — Der Ballwechsel`'],
  ['`03 — The view`', '`03 — Der Blick`'],
  ['`60 / 90 / 120 min sessions`', '`60 / 90 / 120 min`'],
  ['`Book Platz', '`Platz buchen: '], // aria? check below
  ['`Check availability for ', '`Verfügbarkeit prüfen: '],
  ['`Book ${', '`Buchen: ${'],
  ['`Reserve ${', '`Reservieren: ${'],
];
let applied = 0, missed = [];
for (const [a, r] of T) {
  const n = b.split(a).length - 1;
  if (n > 0) { b = b.split(a).join(r); applied += n; }
  else missed.push(a);
}
await Bun.write(p, b);
console.log('applied:', applied);
for (const m of missed) console.log('  MISS:', m);
