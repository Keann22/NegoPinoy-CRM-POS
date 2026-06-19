const ExcelJS = require('exceljs');

async function test() {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile('eba145638e0c4b20b29df9771d4758f9.xlsx');
    const worksheet = workbook.worksheets[0];
    
      let trackingCol = -1;
      let refCol = -1;
      let pickupTimeCol = 10;
      let paymentRoleCol = 32;
      let codAmountCol = 38;
      let estShippingFeeCol = 42;
      let foundHeaders = false;

      let orderUpdates = {};

      worksheet.eachRow((row, rowNumber) => {
          if (!foundHeaders) {
              row.eachCell((cell, colNumber) => {
                  const val = cell.value?.toString().toLowerCase().trim() || '';
                  if (val === 'tracking number' || val === 'tracking no.') trackingCol = colNumber;
                  else if (val.includes('customer reference') || val === 'order number') refCol = colNumber;
                  else if (val.includes('pickup time')) pickupTimeCol = colNumber;
                  else if (val.includes('payment role')) paymentRoleCol = colNumber;
                  else if (val.includes('cod amount')) codAmountCol = colNumber;
                  else if (val.includes('shipping fee') || val.includes('est. shipping')) estShippingFeeCol = colNumber;
              });
              
              if (trackingCol !== -1 && refCol !== -1) {
                  foundHeaders = true;
              }
              return; // skip header row
          }
          
          if (!foundHeaders) return; // skip pre-header rows
          
          // Use default column 1 if dynamic fails, though it shouldn't
          const tCol = trackingCol !== -1 ? trackingCol : 1;
          const rCol = refCol !== -1 ? refCol : 3;
          
          const trackingNo = row.getCell(tCol).value?.toString().trim() || '';
          if (!trackingNo || trackingNo.toLowerCase().includes('tracking number')) return;
          
          const rawCustRef = row.getCell(rCol).value?.toString().trim() || ''; 
          console.log(`Row ${rowNumber}: tCol=${tCol} rCol=${rCol} Tracking=${trackingNo} Ref=${rawCustRef}`);
          
          let rawPrefix = '';
          const orderIdMatch = rawCustRef.match(/ORDER\s*#?\s*([A-Za-z0-9-]+)/i);
          if (orderIdMatch && orderIdMatch[1]) {
              rawPrefix = orderIdMatch[1].toLowerCase();
          } else if (rawCustRef.match(/^[a-f0-9]{8}(?:-b\d+)?$/i)) {
              rawPrefix = rawCustRef.toLowerCase();
          }
          
          if (rawPrefix) {
              const orderIdPrefix = rawPrefix.replace(/-b\d+$/i, '');
              console.log(`Parsed orderIdPrefix = ${orderIdPrefix}`);
          }
      });
      console.log(`Headers found: trackingCol=${trackingCol}, refCol=${refCol}`);
}
test().catch(console.error);
