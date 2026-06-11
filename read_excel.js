const ExcelJS = require('exceljs');

async function main() {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile('eba145638e0c4b20b29df9771d4758f9.xlsx');
    const worksheet = workbook.worksheets[0];
    
    let rows = 0;
    worksheet.eachRow((row, rowNumber) => {
        if (rows < 5) {
            console.log(`Row ${rowNumber}:`, row.values);
        }
        rows++;
    });
}
main().catch(console.error);
