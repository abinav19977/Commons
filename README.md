# Commons

A minimal business workspace with connected accounting, scoped to up to five company profiles per account. Modules cover customers, products, purchases, invoices, receipts, employees, accounting reports and reviewed Tally exchange.

**Release status:** TallyPrime 7.0 integration candidate. Full integration and production acceptance are unfinished. Read [the release gates](docs/TALLY_RELEASE_GATES.md) before using real accounting data.

## Development

The existing app uses React, Vinext, TypeScript, Cloudflare Workers, D1 and Drizzle. It retains the Sites deployment identity in `.openai/hosting.json`.

Prerequisites: Node.js 22.13 or later, npm, Linux with GNU timeout, curl and flock. Keep the existing package lock.

```sh
npm run install:ci
npm run dev
```

The app uses platform-issued authentication. A GitHub checkout is not a standalone replacement for the Sites authentication gateway. Do not deploy a public endpoint that trusts arbitrary client-supplied identity headers.

## Verification

```sh
npm run typecheck
npm run test:accounting
python -m unittest discover -s connector -p 'test_*.py'
npm run build
node --test tests/ui-components.test.mjs
```

Accounting/connector tests use in-memory SQLite and simulated Tally responses. They do not substitute for real TallyPrime 7.0 acceptance testing or independent accountant review.

## Windows connector

The source app is in `connector/`. The website's source ZIP requires Python 3.11+ on Windows.

The manually triggered **Build Windows connector** GitHub Actions workflow builds a portable executable folder and checks its packaged runtime. Once built, the receiving Windows PC does not need Python. Build artifacts are for acceptance testing; they are unsigned and are not an installer. See [connector instructions](connector/README.txt).

The connector communicates with Tally only at `127.0.0.1` and with the configured Commons HTTPS site. Keys are stored using Windows DPAPI; recovery state stays in the current Windows user's local application-data directory.

## Data and deployment

Schema: `db/schema.ts`. Applied migrations under `drizzle/` are append-only. Generate new migrations with `npm run db:generate` after a schema change. Never place customer data or secrets in the repository.

A GitHub source push does not update the live Sites app or migrate its database. Use the existing Sites deployment workflow for that.
