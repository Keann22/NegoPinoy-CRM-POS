import React from 'react';

export function PurchasedItemsTable({ items }: { items: any[] }) {
  if (!items || items.length === 0) return null;
  
  return (
    <div className="border rounded-lg overflow-hidden shadow-sm mt-12 border-emerald-200">
      <div className="px-4 py-3 border-b bg-emerald-50 flex justify-between items-center">
        <h2 className="text-xl font-bold text-emerald-800">Purchased & Expected to Receive</h2>
        <span className="text-emerald-600 text-sm font-semibold">{items.length} Items</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm min-w-[600px]">
          <thead>
            <tr className="bg-emerald-50/50 text-slate-500 text-sm border-b">
              <th className="p-3 text-left">Product</th>
              <th className="p-3 text-center">Batch / PO Note</th>
              <th className="p-3 text-center">Expected Qty</th>
              <th className="p-3 text-center">Unit Cost</th>
              <th className="p-3 text-right">Date Purchased</th>
            </tr>
          </thead>
          <tbody className="divide-y text-slate-700">
            {items.map((item: any) => (
              <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                <td className="p-3 font-medium">{item.productName}</td>
                <td className="p-3 text-center">
                  <span className="bg-emerald-100 text-emerald-800 px-2 py-1 rounded text-xs font-semibold">
                    {item.poNotes || 'Direct Purchase'}
                  </span>
                </td>
                <td className="p-3 text-center font-bold">{item.expectedQty}</td>
                <td className="p-3 text-center text-slate-500">₱{item.unitCost}</td>
                <td className="p-3 text-right text-xs text-slate-400">
                  {new Date(item.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
