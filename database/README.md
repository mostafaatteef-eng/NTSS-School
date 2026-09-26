# PostgreSQL Migration

This directory starts the staged migration away from Google Sheets as the runtime database.

Google Sheets remains the rollback/source dataset until row counts and sampled records are reconciled. The React browser must never connect directly to PostgreSQL; a server-side API owns `DATABASE_URL`.

Server-only environment variable:

```
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/ntss
```

Never expose this through a `VITE_*` variable.

Next: add the Node/Express API with compatible login/session endpoints, then a one-way importer and reconciliation report before switching production reads.
