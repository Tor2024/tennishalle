const p = 'C:/1-2/tennishalle/site/assets/site.js';
let b = await Bun.file(p).text();
const T = [
  ['` / hour`', '` / Stunde`'],
  ['`Book up to ${n.booking_window_days} days ahead`', '`Buchbar bis ${n.booking_window_days} Tage im Voraus`'],
  ['`Cancel up to ${n.member_cancel_cutoff_hours}h before`', '`Stornierbar bis ${n.member_cancel_cutoff_hours}h vorher`'],
  ['`60 / 90 / 120 min sessions`', '`60 / 90 / 120 min`'],
  ['`Welcome `', '`Willkommen `'],
  ['`View all `', '`Alle anzeigen `'],
  ['`Full name`', '`Vollständiger Name`'],
  ['`Booked or unavailable`', '`Belegt oder nicht verfügbar`'],
  ['`Available`', '`Verfügbar`'],
  ['`Not chosen`', '`Nicht gewählt`'],
  ['`Club time (`', '`Vereinszeit (`'],
  ['`Later date (up to `', '`Späteres Datum (bis zu `'],
  ['`No start times left for `', '`Keine Startzeiten mehr frei für `'],
  ['`Your court `', '`Deine Platzzeit `'],
  ['`Within `', '`Innerhalb von `'],
  ['`${e.name} tennis courts`', '`${e.name} Tennisplätze`'],
  ['`${e.name} tennis court`', '`${e.name} Tennisplatz`'],
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
