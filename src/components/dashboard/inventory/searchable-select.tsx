import { useState } from "react";

export type AuditProduct = {
  id: string;
  name: string;
  variant_name: string | null;
  stock_level: number;
};

export function SearchableSelect({ 
  allProducts, 
  value, 
  onChange, 
  getDisplayName, 
  disabled 
}: { 
  allProducts: AuditProduct[], 
  value: string, 
  onChange: (id: string) => void, 
  getDisplayName: (p: AuditProduct) => string, 
  disabled?: boolean 
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const selectedProduct = allProducts.find(p => p.id === value);

  if (!isEditing || disabled) {
    return (
      <div 
        className={`w-full p-2 border rounded-md text-sm truncate ${disabled ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : 'bg-white cursor-pointer hover:border-indigo-400'}`}
        onClick={() => {
          if (!disabled) {
            setIsEditing(true);
            setSearchTerm('');
          }
        }}
      >
        {selectedProduct ? getDisplayName(selectedProduct) : <span className="text-slate-400">Click to search product...</span>}
      </div>
    );
  }

  const filtered = allProducts.filter(p => getDisplayName(p).toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 50);

  return (
    <div className="relative w-full">
      <input 
        autoFocus
        type="text" 
        className="w-full p-2 border border-indigo-500 rounded-md outline-none text-sm shadow-sm"
        placeholder="Type to search..."
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
        onBlur={() => setTimeout(() => setIsEditing(false), 300)}
      />
      <div className="absolute z-10 w-full mt-1 bg-white border shadow-lg max-h-60 overflow-y-auto rounded-md">
        <div 
           className="p-2 text-sm hover:bg-slate-100 cursor-pointer text-slate-500"
           onPointerDown={(e) => { e.preventDefault(); onChange(''); setIsEditing(false); }}
        >
          -- Clear Selection --
        </div>
        {filtered.map(p => (
          <div 
            key={p.id} 
            className="p-2 text-sm hover:bg-indigo-50 cursor-pointer border-t"
            onPointerDown={(e) => {
              e.preventDefault();
              onChange(p.id);
              setIsEditing(false);
            }}
          >
            {getDisplayName(p)}
          </div>
        ))}
        {filtered.length === 0 && <div className="p-2 text-sm text-slate-500">No products found.</div>}
      </div>
    </div>
  );
}
