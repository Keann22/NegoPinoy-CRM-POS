'use client';

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useSupabase } from "@/lib/supabase/hooks";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { useUserProfile } from "@/hooks/useUserProfile";
import { Loader2 } from "lucide-react";
import { Input } from "../ui/input";

const bulkUploadSchema = z.object({
  csvFile: z
    .custom<FileList>()
    .refine((files) => files?.length === 1, "A single CSV file is required.")
    .transform((files) => files[0] as File)
    .refine(
      (file) => file.type === "text/csv",
      "The selected file must be a .csv file."
    ),
});

/**
 * Parses a CSV string into headers and rows, handling quoted fields with commas and newlines.
 * @param csvData The raw string data from a CSV file.
 * @returns An object with `headers` (an array of strings) and `rows` (an array of string arrays).
 */
const parseCsvDataRobustly = (csvData: string): { headers: string[], rows: string[][] } => {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let inQuotedField = false;
    
    // Normalize line endings to \n
    const data = csvData.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    for (let i = 0; i < data.length; i++) {
        const char = data[i];

        if (inQuotedField) {
            if (char === '"') {
                if (i + 1 < data.length && data[i + 1] === '"') {
                    // This is an escaped double quote (e.g., "The 24"" model")
                    currentField += '"';
                    i++; // Skip the next quote
                } else {
                    // This is the end of a quoted field
                    inQuotedField = false;
                }
            } else {
                // Character inside a quoted field
                currentField += char;
            }
        } else {
            if (char === '"') {
                // Start of a quoted field
                inQuotedField = true;
            } else if (char === ',') {
                // End of a field
                currentRow.push(currentField);
                currentField = '';
            } else if (char === '\n') {
                // End of a row
                currentRow.push(currentField);
                rows.push(currentRow);
                currentRow = [];
                currentField = '';
            } else {
                // Regular character
                currentField += char;
            }
        }
    }
    // Add the last field and row if the file doesn't end with a newline
    if (currentField || currentRow.length > 0) {
        currentRow.push(currentField);
        rows.push(currentRow);
    }
    
    const headers = rows.length > 0 ? rows.shift()!.map(h => h.trim()) : [];
    // Filter out any completely empty rows that might result from trailing newlines
    const dataRows = rows.filter(row => row.some(field => field.trim() !== ''));

    return { headers, rows: dataRows };
};


export function BulkUploadProductsDialog() {
  const [open, setOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const supabase = useSupabase();
  const { toast } = useToast();
  const { userProfile } = useUserProfile();

  const canViewCostPrice = userProfile && (userProfile.roles?.includes('Owner') || userProfile.roles?.includes('Admin'));

  const form = useForm<z.infer<typeof bulkUploadSchema>>({
    resolver: zodResolver(bulkUploadSchema),
  });

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      form.reset();
    }
    setOpen(isOpen);
  }

  const processCsvData = async (csvData: string) => {
    const { headers, rows: dataRows } = parseCsvDataRobustly(csvData);

    if (dataRows.length === 0) {
      toast({
        variant: "destructive",
        title: "Invalid CSV Data",
        description: "Your CSV file must include a header row and at least one product row.",
      });
      setIsUploading(false);
      return;
    }
    
    if (!headers.includes('name')) {
        toast({
            variant: "destructive",
            title: "Invalid CSV Header",
            description: `The required column 'name' is missing from your CSV file.`,
        });
        setIsUploading(false);
        return;
    }

    const headerMap = headers.reduce((acc, header, index) => {
        acc[header.trim()] = index;
        return acc;
    }, {} as {[key: string]: number});

    if (!supabase) return;

    const { data: existingProductsData, error: fetchError } = await supabase
        .from('products')
        .select('sku');

    if (fetchError) {
        toast({
            variant: "destructive",
            title: "Error fetching existing SKUs",
            description: "Failed to validate products against existing ones.",
        });
        setIsUploading(false);
        return;
    }

    const existingSkus = new Set(existingProductsData?.map((p: any) => p.sku) || []);

    const uploadPromises: Promise<void>[] = [];
    let successfulUploads = 0;
    let skippedCount = 0;

    for (const row of dataRows) {
        const name = row[headerMap['name']]?.trim();

        if (!name) {
            console.warn(`Skipping row because name is missing: ${row.join(',')}`);
            skippedCount++;
            continue;
        }

        let sku = row[headerMap['sku']]?.trim();
        
        if (!sku) {
            const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
            sku = `${slug.substring(0, 30)}-${Date.now()}`;
        }

        if (existingSkus.has(sku)) {
            console.warn(`Skipping duplicate SKU: ${sku}`);
            skippedCount++;
            continue;
        }
        
        existingSkus.add(sku);

        const quantityOnHand = parseInt(row[headerMap['stock']]?.trim(), 10) || 0;
        const sellingPrice = parseFloat(row[headerMap['sellingPrice']]?.trim() || row[headerMap['price']]?.trim()) || 0;
        const initialUnitCost = canViewCostPrice ? (parseFloat(row[headerMap['costPrice']]?.trim()) || 0) : 0;
        const description = row[headerMap['description']]?.trim() || '';
        const categoryId = row[headerMap['categoryId']]?.trim() || 'Uncategorized';

        const productData = {
            name,
            sku,
            description,
            category_id: categoryId,
            selling_price: sellingPrice,
            stock_level: quantityOnHand,
        };

        const uploadPromise = (async () => {
            try {
                const { data: newProductData, error: insertError } = await supabase
                    .from('products')
                    .insert(productData)
                    .select('id')
                    .single();

                if (insertError) {
                    console.error(`Failed to upload product with SKU ${sku}:`, insertError);
                    return;
                }

                if (newProductData && quantityOnHand > 0) {
                    const movementError = await supabase
                        .from('inventory_movements')
                        .insert({
                            product_id: newProductData.id,
                            quantity_change: quantityOnHand,
                            movement_type: 'initial_stock',
                            reason: 'Bulk upload',
                            cost_price_at_movement: initialUnitCost,
                        });

                    if (movementError.error) {
                        console.error(`Failed to upload movement for SKU ${sku}:`, movementError.error);
                    }
                }
                successfulUploads++;
            } catch (err) {
                console.error(`Unexpected error for product SKU ${sku}:`, err);
            }
        })();
        
        uploadPromises.push(uploadPromise);
    }

    await Promise.all(uploadPromises);
    
    setIsUploading(false);
    handleOpenChange(false);

    let description = `${successfulUploads} products were uploaded.`;
    if (skippedCount > 0) {
        description += ` ${skippedCount} products were skipped due to missing names or duplicate SKUs. Check console for details.`;
    }

    toast({
      title: "Bulk Upload Complete",
      description: description,
    });
  }

  async function onSubmit(values: z.infer<typeof bulkUploadSchema>) {
    setIsUploading(true);
    toast({
      title: "Processing Bulk Upload...",
      description: "Please wait while we process your product data.",
    });

    const file = values.csvFile;
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const content = e.target?.result as string;
      processCsvData(content);
    };

    reader.onerror = () => {
      toast({
        variant: "destructive",
        title: "File Read Error",
        description: "Could not read the contents of the uploaded file.",
      });
      setIsUploading(false);
    };

    reader.readAsText(file);
  }
  
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">Bulk Upload</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk Upload Products</DialogTitle>
          <DialogDescription>
            Upload a CSV file with your products. The only required column is <strong>name</strong>. Other supported columns are: sku, description, categoryId, sellingPrice (or price), costPrice, and stock. Suppliers must be assigned manually after upload.
          </DialogDescription>
          <div className="text-xs text-muted-foreground bg-muted p-2 rounded-md space-y-1">
            <p>If 'sku' is not provided, a unique one will be generated from the product name.</p>
            <p>Fields with commas or line breaks should be wrapped in double quotes (e.g., "This is a, description").</p>
          </div>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
             <FormField
                control={form.control}
                name="csvFile"
                render={({ field: { onChange, onBlur, name, ref } }) => (
                  <FormItem>
                    <FormLabel>CSV File</FormLabel>
                    <FormControl>
                      <Input
                        type="file"
                        accept=".csv"
                        onChange={(e) => onChange(e.target.files)}
                        onBlur={onBlur}
                        name={name}
                        ref={ref}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isUploading}>Cancel</Button>
              <Button type="submit" disabled={isUploading}>
                {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Upload Products
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
