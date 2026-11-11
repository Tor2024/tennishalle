// Round 2 — missed strings with their real bundle syntax
const p = 'C:/1-2/tennishalle/site/assets/site.js';
let b = await Bun.file(p).text();
const T = [
  // nav labels use label: syntax
  ['label:`Dashboard`', 'label:`Dashboard`'],
  ['label:`My account`', 'label:`Mein Konto`'],
  ['label:`Sign in`', 'label:`Anmelden`'],
  ['label:`My bookings`', 'label:`Meine Buchungen`'],
  ['label:`Book a court`', 'label:`Platz buchen`'],
  ['label:`Courts`', 'label:`Plätze`'],
  ['"aria-label":`Menu`', '"aria-label":`Menü`'],
  [',`View courts`]', ',`Plätze ansehen`]'],
  ['label:`Explore the courts`', 'label:`Plätze entdecken`'],
  ['name:`All venues`', 'name:`Alle Anlagen`'],
  ['label:`Reserve`', 'label:`Reservieren`'],
  ['label:`Back`', 'label:`Zurück`'],
  // stepper short labels
  ['$d=[`Venue`,`Court`,`Date`,`Time`,`Details`,`Review`]', '$d=[`Anlage`,`Platz`,`Datum`,`Zeit`,`Angaben`,`Prüfen`]'],
  // summary rows use [`X`, value] pairs
  ['[[`Venue`,', '[[`Anlage`,'],
  ['[`Court`,`${e.name} · ${e.environment', '[`Platz`,`${e.name} · ${e.environment'],
  ['[`Court`,`${e.court_name} · ${e.venue', '[`Platz`,`${e.court_name} · ${e.venue'],
  ['[`Date`,', '[`Datum`,'],
  ['[`Time`,', '[`Zeit`,'],
  ['[`Name`,', '[`Name`,'],
  ['[`Email`,', '[`E-Mail`,'],
  ['[`Phone`,', '[`Telefon`,'],
  ['[`Notes: `', '[`Anmerkungen: `'],
  // form labels as array children
  ['children:[`Full name`,', 'children:[`Vollständiger Name`,'],
  ['children:[`Phone`,', 'children:[`Telefon`,'],
  ['children:[`Email`,', 'children:[`E-Mail`,'],
  // misc
  ['children:`All venues`', 'children:`Alle Anlagen`'],
  ['children:`Filter by venue`', 'children:`Nach Anlage filtern`'],
  ['children:`Book court`', 'children:`Platz buchen`'],
  ['children:`Indoor, all-weather`', 'children:`Halle, ganzjährig`'],
  ['children:`Outdoor court`', 'children:`Außenplatz`'],
  ['children:`Availability`', 'children:`Verfügbarkeit`'],
  ['children:`Choose a venue`', 'children:`Anlage wählen`'],
  ['children:`Choose a court`', 'children:`Platz wählen`'],
  ['children:`Pick a start time`', 'children:`Startzeit wählen`'],
  ['children:`Your details`', 'children:`Deine Angaben`'],
  ['children:`Refresh`', 'children:`Aktualisieren`'],
  ['children:`Available`', 'children:`Verfügbar`'],
  ['children:`Booked or unavailable`', 'children:`Belegt oder nicht verfügbar`'],
  ['children:`Not chosen`', 'children:`Nicht gewählt`'],
  ['children:`Details`', 'children:`Angaben`'],
  ['children:`Review`', 'children:`Prüfen`'],
  ['children:`Booking steps`', 'children:`Buchungsschritte`'],
  ['children:`Review booking`', 'children:`Buchung prüfen`'],
  ['children:`Book another court`', 'children:`Weiteren Platz buchen`'],
  ['children:`Back to club`', 'children:`Zurück zum Verein`'],
  ['children:`Member`', 'children:`Mitglied`'],
  ['children:`Nothing here yet.`', 'children:`Noch nichts hier.`'],
  ['children:`Cancel booking`', 'children:`Buchung stornieren`'],
  ['children:`Cancelled`', 'children:`Storniert`'],
  ['children:`Completed`', 'children:`Abgeschlossen`'],
  ['children:`Create account`', 'children:`Konto erstellen`'],
  ['children:`Pending confirmation`', 'children:`Bestätigung ausstehend`'],
  ['children:`Pending confirmations`', 'children:`Ausstehende Bestätigungen`'],
  ['children:`Upcoming (7 days)`', 'children:`Kommend (7 Tage)`'],
  ['children:`Customer name`', 'children:`Kundenname`'],
  ['children:`Notes`', 'children:`Anmerkungen`'],
  ['children:`Initial status`', 'children:`Anfangsstatus`'],
  ['children:`Create booking`', 'children:`Buchung erstellen`'],
  ['children:`New booking`', 'children:`Neue Buchung`'],
  ['children:`Resurfacing`', 'children:`Sanierung`'],
  ['children:`From`', 'children:`Von`'],
  ['children:`Until`', 'children:`Bis`'],
  ['children:`Reason`', 'children:`Grund`'],
  ['children:`Block time`', 'children:`Zeit sperren`'],
  ['children:`Blocked`', 'children:`Gesperrt`'],
  ['children:`Checking access`', 'children:`Zugriff wird geprüft`'],
  ['children:`Customer`', 'children:`Kunde`'],
  ['children:`Type`', 'children:`Typ`'],
  ['children:`Guest`', 'children:`Gast`'],
  ['children:`Created`', 'children:`Erstellt`'],
  ['children:`Close`', 'children:`Schließen`'],
  ['children:`When`', 'children:`Wann`'],
  ['children:`Name`', 'children:`Name`'],
  ['children:`My account`', 'children:`Mein Konto`'],
  ['children:`Reserve`', 'children:`Reservieren`'],
  ['children:`Back`', 'children:`Zurück`'],
  ['children:`Continue`', 'children:`Weiter`'],
  // aria labels on slots
  ['verfuegbar', 'verfügbar'],
  ['belegt', 'belegt'],
  ['ariaLabel', 'ariaLabel'],
];
let applied = 0, missed = [];
for (const [a, r] of T) {
  if (a === r) continue;
  if (b.includes(a)) { b = b.split(a).join(r); applied++; }
  else missed.push(a);
}
await Bun.write(p, b);
console.log('applied:', applied, '/', T.length);
for (const m of missed) console.log('  MISS:', m.slice(0, 80));
