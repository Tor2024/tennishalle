// Round 3 — remaining strings with exact bundle syntax
const p = 'C:/1-2/tennishalle/site/assets/site.js';
let b = await Bun.file(p).text();
const T = [
  // plain literal at end of expression
  ['}),`Available`', '}),`Verfügbar`'],
  [',`Booked or unavailable`', ',`Belegt oder nicht verfügbar`'],
  // aria-label Close
  ['"aria-label":`Close`', '"aria-label":`Schließen`'],
  // summary row labels
  ['[`When`', '[`Wann`'],
  ['[`Type`', '[`Typ`'],
  ['[`Customer`', '[`Kunde`'],
  ['[`From`', '[`Von`'],
  ['[`Until`', '[`Bis`'],
  ['[`Reason`', '[`Grund`'],
  ['[`Notes`', '[`Anmerkungen`'],
  // remaining plain literals
  ['children:`Refresh`', 'children:`Aktualisieren`'],
  ['children:`Details`', 'children:`Angaben`'],
  ['children:`Review`', 'children:`Prüfen`'],
  ['||`Blocked`', '||`Gesperrt`'],
];
let applied = 0, missed = [];
for (const [a, r] of T) {
  if (b.includes(a)) { b = b.split(a).join(r); applied++; }
  else missed.push(a);
}
await Bun.write(p, b);
console.log('applied:', applied);
for (const m of missed) console.log('  MISS:', m.slice(0, 80));
