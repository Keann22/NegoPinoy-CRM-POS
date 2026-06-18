import ExcelJS from 'exceljs';

async function check() {
    const workbook = new ExcelJS.Workbook();
    try {
        await workbook.xlsx.readFile('C:\\Users\\Keneth\\Downloads\\account_transaction_list_7607b799d2a64a748fb2a4354d039163.xlsx');
        const worksheet = workbook.worksheets[0];
        
        worksheet.eachRow((row, rowNumber) => {
            const values = row.values;
            if (values.some(v => v && v.toString().includes('SPEPH063917236286') || v && v.toString().includes('SPEPH066595147086'))) {
                console.log(`Row ${rowNumber}:`, values);
            }
        });
    } catch (e) {
        console.error(e);
    }
}
check();
