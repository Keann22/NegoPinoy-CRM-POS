import ExcelJS from 'exceljs';

async function check() {
    const workbook = new ExcelJS.Workbook();
    try {
        await workbook.xlsx.readFile('C:\\Users\\Keneth\\Downloads\\eba145638e0c4b20b29df9771d4758f9.xlsx');
        const worksheet = workbook.worksheets[0];
        
        let row1 = worksheet.getRow(1).values;
        let row2 = worksheet.getRow(2).values;
        let row3 = worksheet.getRow(3).values;
        
        console.log("Row 1:", row1);
        console.log("Row 2:", row2);
        console.log("Row 3:", row3);
        
    } catch (e) {
        console.error(e);
    }
}
check();
