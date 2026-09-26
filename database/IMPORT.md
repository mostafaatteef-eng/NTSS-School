# PostgreSQL migration

## Safe import contract
The importer accepts a JSON export per school and performs an atomic transaction. Google Sheets is not modified.

Expected top-level fields:

```json
{
  "schoolId": "BADR",
  "school": {"code":"BADR","name":"EbdA Badr","status":"ACTIVE"},
  "students": [],
  "employees": [],
  "academicYears": []
}
```

Run:

```bash
DATABASE_URL="postgresql://..." npm run db:import -- ./badr-export.json
```

The import is rolled back automatically if source and PostgreSQL row counts do not reconcile. Run each school separately. Authentication/users and attendance are deliberately not switched yet; they require dedicated migration and verification before production cutover.
