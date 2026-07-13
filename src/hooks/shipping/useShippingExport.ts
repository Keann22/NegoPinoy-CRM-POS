import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { format } from 'date-fns';
import type { ShippingOrder } from '../useForShipping';

export const fixMetroManilaCity = (city: string) => {
    let c = city.trim();
    if (c.toUpperCase() === 'CITY OF MANILA') return 'Manila';
    if (c.toUpperCase().startsWith('CITY OF ')) {
        c = c.substring(8).trim() + ' City';
    }
    return c.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
};

export const formatBarangay = (brgy: string) => {
    return brgy.trim().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
};

export const mapToSPXAddress = (region: string, province: string, city: string, barangay: string) => {
  let spxRegion = region;
  let spxProvince = province;
  
  const r = (region || '').toUpperCase();
  const p = (province || '').toUpperCase();
  
  if (r.includes('NCR') || r.includes('NATIONAL CAPITAL')) {
      spxRegion = 'Metro Manila';
      spxProvince = 'Metro Manila';
  } else if (r.includes('CAR') || r.includes('REGION I') || r.includes('REGION II') || r.includes('REGION III') || r.includes('ILOCOS') || r.includes('CAGAYAN') || r.includes('CENTRAL LUZON')) {
      spxRegion = 'North Luzon';
  } else if (r.includes('REGION IV') || r.includes('REGION V') || r.includes('CALABARZON') || r.includes('MIMAROPA') || r.includes('BICOL') || p.includes('PALAWAN')) {
      spxRegion = 'South Luzon';
  } else if (r.includes('REGION VI') || r.includes('REGION VII') || r.includes('REGION VIII') || r.includes('WESTERN VISAYAS') || r.includes('CENTRAL VISAYAS') || r.includes('EASTERN VISAYAS')) {
      spxRegion = 'Visayas';
  } else if (r.includes('REGION IX') || r.includes('REGION X') || r.includes('REGION XI') || r.includes('REGION XII') || r.includes('REGION XIII') || r.includes('BARMM') || r.includes('MINDANAO')) {
      spxRegion = 'Mindanao';
  }
  
  return { spxRegion, spxProvince, spxCity: fixMetroManilaCity(city || ''), spxBarangay: formatBarangay(barangay || '') };
};

export function useShippingExport(orders: ShippingOrder[], setLoading: (val: boolean) => void) {
  const handleExportExcel = async () => {
    if (orders.length === 0) return;
    
    try {
      setLoading(true);
      
      const headers = [
        '*Order Number', '*Recipient Name', '*Recipient Phone', '*Detailed Address',
        'Region', 'Province', 'Town/City', 'Barangay', 'Postal Code',
        '*Item Name', '*Item Type', 'Item Quantity', 'Item Price',
        '*Parcel Weight (KG)', '*Parcel Length (CM)', '*Parcel Width (CM)', '*Parcel Height (CM)',
        'Customer Reference No.', '*Payment Method', 'Delivery Instruction',
        '*COD Collection (Y/N)', 'COD Amount', '*Parcel Value (PHP)'
      ];

      const rows: any[][] = [headers];

      orders.forEach(order => {
        const items = order.items.length > 0 ? order.items : [{ product_name: 'Item', quantity: 1, selling_price_at_sale: order.totalAmount, discount: 0 }];
        
        const codAmount = order.balanceDue || 0;
        const isCOD = codAmount > 0;
        
        const addr = order.shippingAddress || {};
        const detailedAddress = addr.address_line || addr.street_address || 'N/A';
        
        const { spxRegion, spxProvince, spxCity, spxBarangay } = mapToSPXAddress(addr.region || '', addr.province || '', addr.city || '', addr.barangay || '');

        if (order.boxesConfig && Array.isArray(order.boxesConfig) && order.boxesConfig.length > 1) {
            order.boxesConfig.forEach((box: any, index: number) => {
                const itemNames = (box.items || []).map((i: any) => `${i.quantity}x ${i.product_name}`).join(', ');
                const totalQuantity = (box.items || []).reduce((acc: number, i: any) => acc + (Number(i.quantity) || 1), 0);
                const consolidatedName = itemNames.length > 100 ? itemNames.substring(0, 97) + '...' : itemNames;
                const codAmount = box.cod_amount || 0;
                
                const rowData = [
                  `${order.orderId}-B${index + 1}`,
                  order.shippingName,
                  order.shippingPhone,
                  detailedAddress,
                  spxRegion,
                  spxProvince,
                  spxCity,
                  spxBarangay,
                  addr.postal_code || '0000',
                  consolidatedName || 'Assorted Items',
                  'General merchandise',
                  totalQuantity,
                  order.totalAmount,
                  box.weight || 1,
                  box.length || 10,
                  box.width || 10,
                  box.height || 10,
                  `ORDER #${order.orderId}-B${index + 1}`,
                  'Sender Pay',
                  order.deliveryInstructions || '',
                  codAmount > 0 ? 'Y' : 'N',
                  codAmount,
                  order.totalAmount
                ];
                rows.push(rowData);
            });
        } else {
            const itemNames = items.map((i: any) => `${i.quantity}x ${i.product_name}`).join(', ');
            const totalQuantity = items.reduce((acc: number, i: any) => acc + (Number(i.quantity) || 1), 0);
            const consolidatedName = itemNames.length > 100 ? itemNames.substring(0, 97) + '...' : itemNames;

            const rowData = [
              order.orderId,
              order.shippingName,
              order.shippingPhone,
              detailedAddress,
              spxRegion,
              spxProvince,
              spxCity,
              spxBarangay,
              addr.postal_code || '0000',
              consolidatedName,
              'General merchandise',
              totalQuantity,
              order.totalAmount,
              order.weight || 1,
              order.length || 10,
              order.width || 10,
              order.height || 10,
              `ORDER #${order.orderId}`,
              'Sender Pay',
              order.deliveryInstructions || '',
              isCOD ? 'Y' : 'N',
              codAmount,
              order.totalAmount
            ];
            
            rows.push(rowData);
        }
      });

      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
      
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `For_Shipping_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
      
    } catch (error) {
      console.error("Failed to generate Excel file:", error);
    } finally {
      setLoading(false);
    }
  };

  return { handleExportExcel };
}
