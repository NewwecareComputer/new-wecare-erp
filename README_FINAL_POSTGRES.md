# NEW WE-CARE ERP — FINAL LIVE POSTGRESQL

## What this version does
- PostgreSQL is the single source of truth.
- ERP business data is NOT loaded from browser localStorage.
- PC/mobile users see the same live data.
- Saves use optimistic revision protection.
- Client checks for server changes every 5 seconds.
- `data/initial-data.json` is used only to initialize a completely empty database.

## Important existing-data note
The source backup supplied with this build contains 38 products and 6 quotations. It does not contain the claimed 49 products / 9 quotations. Do not fabricate the missing records. To preserve a browser's 49/9 live data, export that browser's ERP JSON and use the one-time `/api/import` endpoint with `ERP_IMPORT_KEY` before normal use.

## Render
1. Create a PostgreSQL database.
2. Set DATABASE_URL on the Web Service.
3. Set ERP_IMPORT_KEY to a private random value.
4. Deploy.
5. Open `/api/health`; it must show `database: postgresql`.
6. Open ERP and hard-refresh.

Never expose ERP_IMPORT_KEY to users.
