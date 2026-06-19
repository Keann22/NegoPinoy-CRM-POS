# Changelog & Refactoring History

This file serves as a master list of changes, feature additions, and decoupling efforts made to the NegoPinoy CRM POS application. Use this document as a reference when planning further refactoring or trying to recall past architectural decisions.

## Recent Changes & Features (June 16 - June 19, 2026)

### Inventory & Procurement
* **Procurement Sheet Unit Costs:** Added a unit cost column to the procurement sheet and updated it system-wide.
* **Bulk Receive Workflow:** Improved bulk receiving for staff drafts. Merging staff draft quantities now prevents overwriting existing stock logic. Added individual save buttons to pending purchase rows.
* **Procurement Search:** Implemented logic to hide deleted/archived products and received staff drafts from the procurement search and sheet. Prevented duplicate variant names in the procurement sheet.
* **Pending Purchase Cancellation:** Added a cancel button for pending purchase order items.
* **Procurement Issues System:** Built an advanced procurement issues system with order tracing, chat, and visibility into who reported the issue. Added these issues to the Inventory Dashboard.
* **Product Archiving:** Handled foreign key violations by safely archiving products instead of hard deleting them. Archived products are now hidden from the products list.

### OCR & PDF Processing
* **Vercel Build & Worker Fixes:** Switched from `pdfjs-dist` to `pdf-parse` to resolve Vercel web worker build errors. Implemented dynamic imports to bypass indexing bugs.
* **OCR Extraction:** Fixed OCR extraction failing on Vercel (previously due to Tesseract issues) and added amount extraction capabilities.

### Dashboard & UI Fixes
* **Receipts:** Added customer addresses to the share receipt invoice and fixed rendering/loading issues.
* **Mobile Enhancements:** Fixed stale session infinite loops on mobile and managed the mobile menu Sheet state to prevent React hydration/unmount crashes.
* **Dashboard Logic:** Resolved infinite loading skeletons on the dashboard for users with no matching roles. Added a specific Inventory Dashboard view for users with the Inventory role.

## Decoupling & Refactoring Notes
*(Add your recent decoupling efforts here to keep track of what was separated and how features were impacted.)*

* **Order/Product Dialogs:** The `OrderDialog` and `ProductDialog` components in `src/components/dashboard/` are currently large and flagged for Phase 2 refactoring to decouple business logic from UI.

---
*Note: Whenever significant structural changes are made, update this file so you don't lose track of the essential functions that were modified.*
