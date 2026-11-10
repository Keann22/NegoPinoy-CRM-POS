import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { collectsItemCod } from "@/lib/services/shipping/courier-cod";

interface VerifyShippingBoxesProps {
  boxes: any[];
  paymentType: string;
  boxCodAmounts: Record<string, string>;
  onBoxCodChange: (boxId: string, amount: string) => void;
}

export function VerifyShippingBoxes({
  boxes,
  paymentType,
  boxCodAmounts,
  onBoxCodChange,
}: VerifyShippingBoxesProps) {
  const isCod = collectsItemCod(paymentType);

  return (
    <div className="space-y-3 col-span-2 border p-3 rounded-md bg-slate-50">
      <Label className="text-base font-semibold">Amount to Collect on Delivery (Multi-Box COD)</Label>
      <p className="text-xs text-muted-foreground mb-2">
        {isCod
          ? 'Assign how much COD the courier should collect per box.'
          : 'Items already paid: the courier collects nothing for the items.'}
      </p>
      {boxes.map((box: any) => (
        <div key={box.id} className="flex flex-col gap-2 bg-white p-3 rounded border">
          <div className="flex items-center gap-3">
            <Label className="w-24 text-sm font-semibold">{box.name}: ₱</Label>
            <Input
              type="number"
              disabled={!isCod}
              value={isCod ? (boxCodAmounts[box.id] || '') : '0'}
              onChange={(e) => onBoxCodChange(box.id, e.target.value)}
            />
          </div>
          <div className="text-xs text-muted-foreground">
            <span className="font-semibold block mb-1">Contents:</span>
            <ul className="list-disc pl-4">
              {box.items && box.items.length > 0 ? (
                box.items.map((item: any, idx: number) => (
                  <li key={idx}>
                    {item.quantity}x {item.product_name}
                  </li>
                ))
              ) : (
                <li>Empty box</li>
              )}
            </ul>
          </div>
        </div>
      ))}
    </div>
  );
}
