import { format, isValid } from 'date-fns';
import { Order } from '@/hooks/useProcessedOrders';
import { OrderFormPrint } from '@/components/dashboard/orders/order-form-print';

export function ProcessedOrdersPrintLayout({
  orders,
  selectedOrderIds,
  activeTab
}: {
  orders: Order[];
  selectedOrderIds: Set<string>;
  activeTab: 'to-print' | 'printed';
}) {
  const printOrders = selectedOrderIds.size > 0 ? orders.filter(o => selectedOrderIds.has(o.id)) : orders;

  return (
    <div id="print-area" className="hidden print:block w-full bg-white printable-area">
      {activeTab === 'to-print' && (
      <div className="mb-8">
          <div className="flex justify-between items-center mb-4 border-b-2 border-black pb-2">
              <h1 className="text-2xl font-bold uppercase">Order Batch Summary</h1>
              <div className="text-right text-sm">
                  <p>Date Printed: {format(new Date(), 'PPPP p')}</p>
                  <p>Total Orders: {printOrders.length}</p>
              </div>
          </div>
          <table className="w-full border-collapse border border-black">
              <thead>
                  <tr className="bg-gray-100">
                      <th className="border border-black px-2 py-1 text-left text-xs uppercase w-[15%]">Order ID</th>
                      <th className="border border-black px-2 py-1 text-left text-xs uppercase w-[25%]">Customer Name</th>
                      <th className="border border-black px-2 py-1 text-left text-xs uppercase w-[15%]">Status</th>
                      <th className="border border-black px-2 py-1 text-left text-xs uppercase w-[45%]">Notes / Shipping Details</th>
                  </tr>
              </thead>
              <tbody>
                  {printOrders.map(order => (
                      <tr key={order.id}>
                          <td className="border border-black px-2 py-1 text-sm font-mono">{order.id.substring(0, 7).toUpperCase()}</td>
                          <td className="border border-black px-2 py-1 text-sm font-bold">{order.customerName}</td>
                          <td className="border border-black px-2 py-1 text-xs font-semibold">{order.orderStatus}</td>
                          <td className="border border-black px-2 py-1 text-xs">{order.shippingDetails || '—'}</td>
                      </tr>
                  ))}
              </tbody>
          </table>
          <div className="page-break-after" />
      </div>
      )}

      <div className="font-sans text-sm pb-10">
          {printOrders.map((order, idx, arr) => (
  <div key={order.id} className="mb-4 break-inside-avoid">
      <OrderFormPrint order={order} />
      {/* Dashed separator between orders, except after the last one */}
      {idx < arr.length - 1 && (
          <div className="mt-4 border-b-[3px] border-dashed border-gray-600 w-full" />
      )}
  </div>
))}
      </div>
    </div>
  );
}
