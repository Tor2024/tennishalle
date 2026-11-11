const p = 'C:/1-2/tennishalle/site/assets/site.js';
let b = await Bun.file(p).text();
const T = [
  ['`Court`', '`Platz`'],  // summary row leftover ("Court" label in reservation panel)
  ['`Booking steps`', '`Buchungsschritte`'],
  ['`STEP `', '`SCHRITT `'],
  ['`Europe/Berlin`', '`Europe/Berlin`'], // no-op, keep TZ
  ['`Your reservation`', '`Deine Reservierung`'],
  ['`DEINE RESERVIERUNG`', '`DEINE RESERVIERUNG`'],
  ['`Tennisplätze ${e.name}`', '`${e.name} Tennisplätze`'],
  ['`Tennisplatz ${e.name}`', '`${e.name} Tennisplatz`'],
  ['`undefined Rebound Ace Tennisplatz`', '`undefined Rebound Ace Tennisplatz`'],
];
let applied = 0, missed = [];
for (const [a, r] of T) {
  if (a === r) continue;
  const n = b.split(a).length - 1;
  if (n > 0) { b = b.split(a).join(r); applied += n; }
  else missed.push(a);
}
await Bun.write(p, b);
console.log('applied:', applied);
for (const m of missed) console.log('  MISS:', m);
