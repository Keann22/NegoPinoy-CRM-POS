import { format, isValid } from 'date-fns';
import { QRCodeCanvas } from 'qrcode.react';
import type { Order } from '@/hooks/useProcessedOrders';
import type { OrderItemChange } from '@/types/order-changes';

const manilaStamp = (d: Date) =>
  d.toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * One printed order form (what pickers and packers work from). A reprint passes
 * `reprint`: the form says it replaces the earlier copy, and when the order was
 * changed, new / more lines are marked and removed lines are listed struck out.
 */
export function OrderFormPrint({
  order,
  reprint,
}: {
  order: Order;
  reprint?: { changes?: OrderItemChange[] };
}) {
  const changes = reprint?.changes || [];
  const changeOf = (productId?: string) => changes.find((c) => c.product_id === productId);
  const removed = changes.filter((c) => c.after === 0);

  return (
    <div className="border-2 border-black flex flex-col">
      {reprint && (
        <div className="border-b-2 border-black px-2 py-1 text-xs font-bold uppercase flex justify-between">
          <span>{changes.length > 0 ? '★ Updated order: replaces the earlier copy' : 'Reprint'}</span>
          <span>Printed {manilaStamp(new Date())}</span>
        </div>
      )}
      <div className="flex border-b-2 border-black">
        <div className="flex-1 flex flex-col border-r-2 border-black">
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
          <div className="flex flex-col p-2">
            <div className="flex">
              <span className="mr-1">Recipient:</span>
              <div className="flex-1 font-bold">{order.customerName}</div>
            </div>
            {order.customerMobile && (
              <div className="text-xs mt-1"><span className="font-semibold">Contact: </span>{order.customerMobile}</div>
            )}
            {order.customerAddress && (
              <div className="text-xs"><span className="font-semibold">Address: </span>{order.customerAddress}</div>
            )}
          </div>
        </div>
        <div className="p-2 flex justify-center items-center w-[166px]">
          <QRCodeCanvas value={order.id} size={150} />
        </div>
      </div>

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
            {(order.items ?? []).map((item, i) => {
              const c = changeOf(item.productId);
              const tag = !c ? null : c.before === 0 ? 'NEW' : c.after > c.before ? `+${c.after - c.before} MORE` : `WAS ${c.before}`;
              return (
                <tr key={item.id} className={tag ? 'font-bold' : undefined}>
                  <td className="py-1 px-2 align-top">{i + 1}</td>
                  <td className="py-1 px-2 align-top">
                    {item.productName}
                    {tag && <span className="ml-1 border border-black px-1 text-[10px]">{tag}</span>}
                  </td>
                  <td className="py-1 px-2 align-top text-right">{item.quantity}</td>
                  <td className="py-1 px-2 align-top text-right whitespace-nowrap font-semibold">
                    ₱ {(item.sellingPriceAtSale ?? 0) * item.quantity}
                  </td>
                </tr>
              );
            })}
            {removed.map((c) => (
              <tr key={`removed-${c.product_id}`}>
                <td className="py-1 px-2 align-top">✕</td>
                <td className="py-1 px-2 align-top line-through">{c.name}</td>
                <td className="py-1 px-2 align-top text-right line-through">{c.before}</td>
                <td className="py-1 px-2 align-top text-right text-[10px] font-bold">REMOVED: don&apos;t pack</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex border-t-2 border-black">
        <div className="w-2/3 p-2 border-r-2 border-black text-xs whitespace-pre-wrap min-h-[70px]">
          <div className="font-bold uppercase mb-1">{order.paymentType}</div>
          {order.shippingDetails && (
            <div><span className="font-semibold">Notes: </span><span>{order.shippingDetails}</span></div>
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
  );
}
