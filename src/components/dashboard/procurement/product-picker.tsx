"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";

export interface ProductPickerProps {
  label: string;
  onSelect: (p: { id: string; name: string }) => void;
  onAddNew: (term: string) => void;
}

/** Local product search + "add new" picker (no react-hook-form dependency). */
export function ProductPicker({ label, onSelect, onAddNew }: ProductPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; sku?: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handler = setTimeout(async () => {
      if (search.trim().length < 2) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const supabase = createClient();
        let query = supabase.from("products").select("id, name, sku").not("name", "ilike", "[DELETED]%");
        search
          .split(" ")
          .filter((w) => w.trim() !== "")
          .forEach((w) => {
            query = query.or(`name.ilike.%${w}%,variant_name.ilike.%${w}%`);
          });
        const { data } = await query.limit(10);
        setResults(data || []);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [search, open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-start font-normal text-left truncate">
          {label || "Search product..."}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search products..." value={search} onValueChange={setSearch} />
          <CommandList>
            {loading && <CommandItem disabled>Searching...</CommandItem>}
            {!loading && results.length > 0 && (
              <CommandGroup>
                {results.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={p.id}
                    onSelect={() => {
                      onSelect({ id: p.id, name: p.name });
                      setOpen(false);
                    }}
                  >
                    {p.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {!loading && search.trim().length > 1 && (
              <>
                {results.length > 0 && <CommandSeparator />}
                <CommandItem
                  value={`${search}-add-new`}
                  className="text-primary cursor-pointer"
                  onSelect={() => {
                    onAddNew(search.trim());
                    setOpen(false);
                  }}
                >
                  + Add &quot;{search.trim()}&quot; as new product
                </CommandItem>
              </>
            )}
            <CommandEmpty>{search.trim().length < 2 ? "Type to search products." : "No products found."}</CommandEmpty>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
