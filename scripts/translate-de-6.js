// Round 6 — leftover strings seen on live pages
const p = 'C:/1-2/tennishalle/site/assets/site.js';
let b = await Bun.file(p).text();
const T = [
  ['`Scroll to courts`', '`Zu den Plätzen scrollen`'],
  ['`/ hour`', '`/ Stunde`'],
  ['` /h`', '` /Std.`'],
  ['`60 / 90 / 120 min sessions`', '`60 / 90 / 120 Min. Sitzungen`'],
  ['`Book up to 30 days ahead`', '`Buchbar bis 30 Tage im Voraus`'],
  ['`Cancel up to 24h before`', '`Stornierbar bis 24h vorher`'],
  ['`Live availability in 30-minute steps. Choose a court, a date and how long you want to play — you get a booking reference straight away.`', '`Live-Verfügbarkeit in 30-Minuten-Schritten. Platz, Datum und Dauer wählen — die Buchungsreferenz kommt sofort.`'],
  ['`Racket string detail`', '`Besaitung im Detail`'],
  ['`Racket detail`', '`Schläger-Detail`'],
  ['`Tennis ball on the baseline`', '`Tennisball auf der Grundlinie`'],
  ['`Baseline detail`', '`Grundlinie im Detail`'],
  ['`Tennis ball on a dark court`', '`Tennisball auf dunklem Platz`'],
  ['`DEUCE tennis ball opening frame`', '`DEUCE Tennisball Eröffnungsszene`'],
  ['`Overhead view of DEUCE tennis courts at dusk`', '`DEUCE Tennisplätze von oben in der Abenddämmerung`'],
  ['`DEUCE cinematic sequence: a racket strikes the tennis ball and the camera rises over three courts`', '`DEUCE Filmszene: Schläger trifft den Ball, Kamera steigt über drei Plätze`'],
  ['`Loading club data…`', '`Vereinsdaten werden geladen…`'],
  ['`Loading…`', '`Wird geladen…`'],
  ['children:`Courts`', 'children:`Plätze`'],
  ['`${e.name} tennis courts`', '`${e.name} Tennisplätze`'],
  ['`${e.name} tennis court`', '`${e.name} Tennisplatz`'],
  // step labels check
  ['`Choose a venue`', '`Anlage wählen`'],
  ['`Choose a court`', '`Platz wählen`'],
  ['`Date & duration`', '`Datum & Dauer`'],
  ['`Pick a start time`', '`Startzeit wählen`'],
  ['`Your details`', '`Deine Angaben`'],
  ['`Review & submit`', '`Prüfen & absenden`'],
  ['`Full name`', '`Vollständiger Name`'],
  ['`Booked or unavailable`', '`Belegt oder nicht verfügbar`'],
  ['`Available`', '`Verfügbar`'],
  ['`Not chosen`', '`Nicht gewählt`'],
  ['`Club time (`', '`Vereinszeit (`'],
  ['`Later date (up to `', '`Späteres Datum (bis zu `'],
  ['`No start times left for `', '`Keine Startzeiten mehr frei für `'],
  ['`View all `', '`Alle anzeigen `'],
  ['`Welcome `', '`Willkommen `'],
  ['`Your court `', '`Deine Platzzeit `'],
  ['`Within `', '`Innerhalb von `'],
  ['`Ref `', '`Ref. `'],
  ['`Sign out`', '`Abmelden`'],
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
