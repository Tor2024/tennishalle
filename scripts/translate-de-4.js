const p = 'C:/1-2/tennishalle/site/assets/site.js';
let b = await Bun.file(p).text();
const T = [
  ['}),`Refresh`', '}),`Aktualisieren`'],
  ['`Review & submit`', '`Prüfen & absenden`'], // may already be done
  ['nextLabel:`Review ', 'nextLabel:`Prüfen '],
];
let applied = 0, missed = [];
for (const [a, r] of T) {
  if (b.includes(a)) { b = b.split(a).join(r); applied++; }
  else missed.push(a);
}
await Bun.write(p, b);
console.log('applied:', applied);
for (const m of missed) console.log('MISS:', m);
