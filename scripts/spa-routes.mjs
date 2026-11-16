// Copies dist/index.html into per-route directories so SPA routes
// (/book, /sign-in, /account, /admin) are served as static files —
// no rewrites needed (filesystem takes precedence on Vercel).
// Per-route SEO: unique title/description/canonical/og per route;
// account + admin get robots noindex.
import { mkdirSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs'

const BASE = 'https://tennishalle.vercel.app'

const routes = {
  book: {
    title: 'Platz buchen | TENNISHALLE',
    description: 'Tennisplatz online buchen: Datum wählen, freie 30-Minuten-Slots anklicken, Buchungsreferenz kommt sofort. Halle & Außenplätze.',
    path: '/book',
    index: true,
  },
  'sign-in': {
    title: 'Anmelden & Konto erstellen | TENNISHALLE',
    description: 'Mitgliederkonto für TENNISHALLE: Buchungen verwalten, Plätze reservieren. Anmeldung oder kostenloses Konto erstellen.',
    path: '/sign-in',
    index: true,
  },
  account: {
    title: 'Mein Konto | TENNISHALLE',
    description: 'Deine Buchungen im Überblick.',
    path: '/account',
    index: false,
  },
  admin: {
    title: 'Admin | TENNISHALLE',
    description: 'Vereins-Dashboard.',
    path: '/admin',
    index: false,
  },
}

const html = readFileSync('dist/index.html', 'utf8')

copyFileSync('dist/index.html', 'dist/index.html.bak')

for (const [route, cfg] of Object.entries(routes)) {
  let out = html
  out = out.replace(/<title>.*?<\/title>/s, `<title>${cfg.title}</title>`)
  out = out.replace(
    /<meta name="description" content=".*?" \/>/s,
    `<meta name="description" content="${cfg.description}" />`
  )
  out = out.replace(
    /<link rel="canonical" href=".*?" \/>/s,
    `<link rel="canonical" href="${BASE}${cfg.path}" />`
  )
  out = out.replace(/<meta property="og:url" content=".*?" \/>/s, `<meta property="og:url" content="${BASE}${cfg.path}" />`)
  out = out.replace(/<meta property="og:title" content=".*?" \/>/s, `<meta property="og:title" content="${cfg.title}" />`)
  out = out.replace(/<meta property="og:description" content=".*?" \/>/s, `<meta property="og:description" content="${cfg.description}" />`)
  out = out.replace(
    /<meta name="twitter:title" content=".*?" \/>/s,
    `<meta name="twitter:title" content="${cfg.title}" />`
  )
  out = out.replace(
    /<meta name="twitter:description" content=".*?" \/>/s,
    `<meta name="twitter:description" content="${cfg.description}" />`
  )
  if (!cfg.index) {
    out = out.replace(
      /<meta name="robots" content=".*?" \/>/s,
      '<meta name="robots" content="noindex, nofollow" />'
    )
  }
  mkdirSync(`dist/${route}`, { recursive: true })
  writeFileSync(`dist/${route}/index.html`, out)
}
console.log('spa-routes: wrote book/sign-in/account/admin with per-route meta')
