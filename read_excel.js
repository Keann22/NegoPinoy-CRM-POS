const xlsx = require('xlsx');
const workbook = xlsx.readFile('mass_order_creation_template_ph_multi_item_V2.xlsx');
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
console.log("Sheet names:", workbook.SheetNames);
console.log("First few rows:");
for (let i = 0; i < Math.min(5, data.length); i++) {
  console.log(`Row ${i + 1}:`, data[i]);
}
