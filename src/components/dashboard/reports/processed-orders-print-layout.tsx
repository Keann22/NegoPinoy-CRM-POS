import { format, isValid } from 'date-fns';
import { QRCodeCanvas } from 'qrcode.react';
import { Order } from '@/hooks/useProcessedOrders';

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
      <div className="border-2 border-black flex flex-col">
          <div className="flex border-b-2 border-black">
              <div className="flex-1 flex flex-col border-r-2 border-black">
                  {/* Header Section */}
                  <div className="flex border-b-2 border-black items-center">
                      <div className="flex-1 p-2 border-r-2 border-black">
                          <div className="font-bold">Negosyanteng Pinoy PH</div>
                          <div className="text-xs">http://facebook.com/NegoPinoyPH</div>
                      </div>
                      <div className="flex-1 p-2 text-xs">
                          <div className="font-bold text-base">Order #{order.id.substring(0, 7).toUpperCase()}</div>
                          <div>Created At: {order.orderDate && isValid(new Date(order.orderDate)) ? format(new Date(order.orderDate), 'MM/dd/yyyy') : '—'}</div>
                      </div>
                  </div>
                  
                  {/* Recipient Section */}
                  <div className="flex flex-col p-2">
                      <div className="flex">
                          <span className="mr-1">Recipient:</span>
                          <div className="flex-1">
                              <div className="font-bold">{order.customerName}</div>
                          </div>
                      </div>
                      {order.customerMobile && (
                          <div className="text-xs mt-1">
                              <span className="font-semibold">Contact: </span>{order.customerMobile}
                          </div>
                      )}
                      {order.customerAddress && (
                          <div className="text-xs">
                              <span className="font-semibold">Address: </span>{order.customerAddress}
                          </div>
                      )}
                  </div>
              </div>
              <div className="p-2 flex justify-center items-center w-[166px]">
                  <QRCodeCanvas value={order.id} size={150} />
              </div>
          </div>
          
          {/* Items Table */}
          <div className="min-h-[120px] pb-2">
              <table className="w-full text-xs">
                  <thead>
                      <tr className="border-b-2 border-black text-left">
                          <th className="py-1 px-2 font-normal w-8">#</th>
                          <th className="py-1 px-2 font-normal">Product</th>
                          <th className="py-1 px-2 font-normal text-right w-12">Qty</th>
                          <th className="py-1 px-2 font-normal text-right w-24">Amount</th>
                      </tr>
                  </thead>
                  <tbody>
                      {(order.items ?? []).map((item, i) => (
                          <tr key={item.id}>
                              <td className="py-1 px-2 align-top">{i + 1}</td>
                              <td className="py-1 px-2 align-top">{item.productName}</td>
                              <td className="py-1 px-2 align-top text-right">{item.quantity}</td>
                              <td className="py-1 px-2 align-top text-right whitespace-nowrap font-semibold">
                                  ₱ {(item.sellingPriceAtSale ?? 0) * item.quantity}
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
          
          {/* Footer Section */}
          <div className="flex border-t-2 border-black">
              <div className="w-2/3 p-2 border-r-2 border-black text-xs whitespace-pre-wrap min-h-[70px]">
                  <div className="font-bold uppercase mb-1">{order.paymentType}</div>
                  {order.shippingDetails && (
                      <div>
                          <span className="font-semibold">Notes: </span>
                          <span>{order.shippingDetails}</span>
                      </div>
                  )}
                  {order.salesPersonName && (
                      <div className="mt-1 text-gray-500">Processed by: <span className="font-semibold text-black">{order.salesPersonName}</span></div>
                  )}
              </div>
              <div className="w-1/3 p-2 text-sm flex items-center">
                  <div>Collection (COD): <span className="font-bold whitespace-nowrap">₱ {order.totalAmount}</span></div>
              </div>
          </div>
      </div>
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
