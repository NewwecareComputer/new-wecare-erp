# Render + PostgreSQL shared ERP setup

This version stores the ERP's main data in PostgreSQL so all computers using the Render URL can see the same live Products, Customers, Suppliers, Quotations, Sales Bills, Purchases, Delivery Challans, Warranty records and CCTV Projects.

## Render setup
1. Create a Render PostgreSQL database.
2. Open the ERP Web Service -> Environment.
3. Add `DATABASE_URL` and paste the PostgreSQL **Internal Database URL**.
4. Redeploy the Web Service.
5. On first Admin login, if the PostgreSQL ERP data table is empty, the app migrates the current browser's saved ERP data (if present) into PostgreSQL. If no browser data exists, the bundled ERP backup is used.
6. After migration, PostgreSQL becomes the shared source of truth for the Render deployment.

## Login / permissions
- Admin: full ERP access.
- Staff: separate Staff Dashboard + Delivery Challan only.
- Staff can create, edit, delete and print Delivery Challans, but cannot write Products, Customers, Sales, Quotation, Purchase, Warranty or CCTV Project data.
- User passwords are bcrypt-hashed in PostgreSQL.

## Important
Before using the live Render ERP for the first time, log in as Admin from the computer that contains the latest correct ERP data. This performs the first migration into PostgreSQL when the shared database is empty.

Default accounts:
- Admin: `admin / admin123`
- Staff: `staff / staff123`

Change the default passwords after first login.
