// Copies dist/index.html into per-route directories so SPA routes
// (/book, /sign-in, /account, /admin) are served as static files —
// no rewrites needed (filesystem takes precedence on Vercel).
import { mkdirSync, copyFileSync } from 'node:fs'

for (const route of ['book', 'sign-in', 'account', 'admin']) {
  mkdirSync(`dist/${route}`, { recursive: true })
  copyFileSync('dist/index.html', `dist/${route}/index.html`)
}
console.log('spa-routes: copied index.html into book/sign-in/account/admin')
