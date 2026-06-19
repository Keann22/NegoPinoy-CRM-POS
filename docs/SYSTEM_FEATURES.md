# NegoPinoy CRM POS — Core Features & Specifications

This document logs exactly **what the system should do**. Whenever you are refactoring or decoupling components, check this list to ensure no critical business logic or workflow is accidentally removed or broken.

---

## 1. Inventory & Products
*   **Stock Tracking Logic**: The system explicitly calculates and displays **Physical**, **Available**, and **Reserved** stock.
*   **Stock Reservation**: When an order is placed, stock is "Reserved" until fulfilled. The system has a "Stale Reservations" report and a click-to-view reserved stock dialog.
*   **Parent/Child Variants**: Products can have parent-child variations.
*   **Archiving**: Products cannot be hard-deleted if they have foreign key relations; they must be gracefully "Archived" and hidden from active lists and procurement searches.
*   **Historical Overrides**: Inventory deductions are ignored for historical orders placed before June 2026.

## 2. Procurement & Suppliers
*   **Procurement Sheet**: Automatically calculates what needs to be restocked based on reserved stock minus physical stock. Negative stock is strictly filtered.
*   **Supplier Catalog**: Tracks supplier product codes (vendor part numbers) and unit costs.
*   **Ad-Hoc / Staff Drafts**: Staff can add ad-hoc items to the procurement sheet. When receiving bulk drafts, quantities are merged rather than overwritten to preserve existing stock.
*   **Pending Costs (Receipts)**: Items received go to "Pending Costs". Users can edit quantities using an inline toggle (pencil icon) to prevent accidental edits, and can delete pending costs to revert mistaken receipts.
*   **Printable Checklist**: The procurement list can be converted into a printable checklist showing supplier codes.
*   **Procurement Issues**: An advanced system allows tracing issues back to specific orders, includes an internal chat, and shows exactly who reported the issue.

## 3. Orders & POS
*   **Dynamic Pricing**: Products have separate "Cash Price" and "Installment Price" fields.
*   **First-Timer Installment Logic**: Toggling the "first-timer installment" checkbox retroactively re-prices order items in the cart.
*   **Printing**: Supports reprinting single isolated orders, and checkbox selection for mass printing. Print layouts are optimized with large QR codes and minimal empty space.
*   **Share Receipt**: Generates a shareable receipt/invoice that includes the customer's full address.

## 4. Shipping & Packing (Packer Workflow)
*   **QR Scanning**: Packers use a dedicated Packer App (mobile/tablet friendly) with QR scanning.
*   **Dimension Tracking & Split Boxes**: Packers can track dimensions and split large orders into multiple boxes. The system tracks the contents of each split box.
*   **Waybills & COD**: The waybill summary accurately calculates the COD Amount, explicitly including the Shipping Fee breakdown.
*   **Courier Sync (SPX)**: Uploading an SPX Excel file dynamically parses columns, maps addresses, and groups split tracking numbers via the local order UUID.
*   **Revert Flow**: Packed orders can be safely reverted back to pending if a mistake was made.
*   **Notifications**: In-app bell and desktop notifications are triggered for packed orders.

## 5. Accounting & Cashflow
*   **Expenses & Recurring**: Supports encoding one-time and recurring expenses with date filtering (defaults to the current month).
*   **Smart Pre-fill**: Encoding costs from procurement automatically pre-fills the past supplier and unit cost.
*   **Cross-linking**: Order numbers mentioned in expenses are clickable and navigate directly to the order details.
*   **SPX Remittance**: Tracks SPX remittance reports for accounting reconciliations.

## 6. OCR & AI Integrations
*   **Receipt Parsing**: Uses Google Cloud Vision and `pdf-parse` (on the serverless backend) to extract data from uploaded images and PDFs.
*   **Amount Extraction**: Specifically extracts shipping fee breakdowns and total amounts from receipts to automate data entry.

## 7. Role-Based Access
*   **Inventory Role**: Has a specialized Inventory Dashboard focusing on stock levels, pending costs, and procurement issues.
*   **Sales/Admin Roles**: Have specific visibility filters (e.g., hiding unit costs from non-management roles).

---
*When decoupling large components (like `OrderDialog` or `ProductDialog`), cross-reference the logic being moved with this list to ensure these micro-features are preserved in the new components.*
