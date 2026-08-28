# NEW WE-CARE COMPUTER ERP

Updated features:
- Quotation and Sales Bill: PC / Printer / CCTV category selector.
- Item list filters automatically by selected category.
- Brand selector filters item list and item rows can select a saved brand.
- Amount, GST and Grand Total calculate automatically.
- Purchase Bill: manual Bill Number field.
- PC / Printer / CCTV specific Terms & Conditions are added automatically based on selected items.
- Quotation print layout follows the supplied quotation reference.
- Sales Invoice print layout follows the supplied tax invoice reference, including HSN/SAC, GST%, CGST/SGST, taxable value, grand total and bank details.
- Inventory Item Master now includes HSN/SAC.
- Mobile responsive layout retained.


### Item + Brand selection update
- Item names remain independent from brands; duplicate item names are not required for each brand.
- In Quotation, Sales Bill and Purchase, select the Item first and then select any Brand from the brand master.
- Brand selection no longer filters the Item list.
- Item + Brand rates are stored separately and the rate auto-loads after brand selection; if no saved rate exists, the rate can be entered manually and is saved for future use.
- Sales Bill print layout remains unchanged.


Format update: Quotation print now follows the supplied reference JPEG layout, while Sales Bill uses a separate Tax Invoice layout. Purchase remains a separate Purchase Bill layout.


### Added CCTV Service Modules
- Delivery Challan: customer-wise dispatch/return/installation/service challan with product, brand, model, serial number and quantity.
- Product Warranty IN / OUT: customer-wise warranty/service intake and return tracking with serial, MAC address, IP address, warranty date, status and service notes.
- CCTV Project: customer-wise project register with camera/device, brand, camera model, serial number, MAC address, IP address, quantity and remarks, plus A4 print/PDF.
- Existing Quotation, Sales Bill and Purchase screens and their print formats are kept unchanged.


### Warranty item-wise update
- Warranty IN / OUT now uses the Item Master for item selection.
- Brand and Model auto-fill from the selected item.
- Category is stored with each warranty record.
- MAC Address is shown and saved only when the selected item is a CCTV camera.
- Warranty print shows the MAC column only for CCTV camera items.
