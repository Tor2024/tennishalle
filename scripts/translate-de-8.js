const p = 'C:/1-2/tennishalle/site/assets/site.js';
let b = await Bun.file(p).text();
const T = [
  ['` Book as a guest or with your member account — you get a booking reference straight away.`', '` Buche als Gast oder mit deinem Mitgliederkonto — die Buchungsreferenz kommt sofort.`'],
  ['` to keep a history of your bookings.`', '` um einen Verlauf deiner Buchungen zu behalten.`'],
  ['` court`', '` Platz'],
  ['` in Bookings `', '` in Buchungen `'],
  ['`${C.name} tennis court`', '`${C.name} Tennisplatz`'],
  ['`${e.name} ${e.environment} ${e.surface} tennis court`', '`${e.name} ${e.environment} ${e.surface} Tennisplatz`'],
  ['`). Nothing is charged online. You pay the court fee at the club.`', '`). Es wird nichts online abgebucht. Die Platzgebühr zahlst du im Verein.`'],
  ['`${e.court_name} · ${e.venue_name}`', '`${e.court_name} · ${e.venue_name}`'],
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
