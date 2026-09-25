# Kova

Personal health and productivity app: fuel, vitals, sleep, training and a
work OS in one installable web app.

| Part | Where |
|---|---|
| App (single-file PWA) | `index.html`, `sw.js`, `manifest.webmanifest` |
| Server (`/api/*`, Netlify Functions) | `netlify/functions/api.mjs` → `server/` |
| Firebase security rules | `database.rules.json`, `storage.rules` |
| Tests + CI | `test/`, `.github/workflows/` |

- **Setting it up** (GitHub → Netlify, Firebase, Google Analytics, linked
  accounts, watches): see [SETUP.md](SETUP.md).
- **Product grades by pillar and what to build next:** see
  [docs/SCORECARD.md](docs/SCORECARD.md).

```bash
npm install && npm test && npm run check
```
