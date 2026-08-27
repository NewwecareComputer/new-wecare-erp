# NEW WE-CARE ERP — MOBILE + MULTI-USER

This version changes ERP storage from browser-only `localStorage` to a shared server API.

## What is fixed

- PC + mobile can use the same ERP database.
- Same Wi-Fi: open the ERP using the PC's LAN IP, e.g. `http://192.168.1.10:3000`.
- Different Wi-Fi / different locations: deploy this package to a public server such as Render and open the HTTPS URL on every PC/mobile.
- Data is shared between users because quotations, sales, purchases, customers, suppliers and inventory are stored on the server.
- The browser still keeps a local cache, but the server is the shared source.
- Other open devices check for server changes about every 5 seconds when the user is not typing in a form.

## Same Wi-Fi setup (Windows PC)

1. Install Node.js LTS on the PC that will act as the ERP server.
2. Extract this ZIP.
3. Open Command Prompt in the extracted folder.
4. Run:
   `npm install`
5. Run:
   `npm start`
6. On the same PC open:
   `http://localhost:3000`
7. Find the PC IPv4 address with `ipconfig`.
8. On the mobile/other PC connected to the same Wi-Fi open:
   `http://YOUR-PC-IP:3000`
   Example: `http://192.168.1.10:3000`
9. If Windows Firewall asks, allow Node.js on the Private network.

Important: do NOT use `file:///.../index.html` on mobile. The ERP must be opened through the Node server URL.

## Different Wi-Fi / anywhere setup

Deploy the whole extracted folder to a Node-compatible hosting service. The app listens on `0.0.0.0` and uses the platform's `PORT`.

For Render:
- Create a new Web Service.
- Upload/connect this project.
- Build Command: `npm install`
- Start Command: `npm start`
- After deployment, open the generated HTTPS URL on all PCs and mobiles.

## Important database note

The included backend stores shared data in `data/erp-data.json`.

For a permanent production cloud deployment, use persistent storage/database. Some cloud services can replace the server filesystem during redeploy/restart. If using Render's normal ephemeral filesystem, the ERP can work for multi-user access but you should add a persistent disk or migrate the data layer to PostgreSQL before relying on it as the only permanent backup.

## Multi-user behavior

This is shared-data ERP, not separate browser data. If User A saves a quotation, User B's open ERP will detect the new server revision and refresh the current page when it is safe to do so.

For best results:
- Give each user their own browser/device.
- Do not edit the same quotation/sales bill simultaneously from two devices.
- Use Export Backup regularly.
