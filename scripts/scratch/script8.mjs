import ExcelJS from 'exceljs';

async function check() {
    const workbook = new ExcelJS.Workbook();
    try {
        await workbook.xlsx.readFile('C:\\Users\\Keneth\\Downloads\\a8abb2810b2a41268c17dcc30c908a32.xlsx');
        const worksheet = workbook.worksheets[0];
        
        worksheet.eachRow((row, rowNumber) => {
            const values = row.values;
            if (values.some(v => v && v.toString().includes('SPEPH066297056206'))) {
                console.log(`Row ${rowNumber}:`, values);
            }
        });
        
    } catch (e) {
        console.error(e);
    }
}
check();
