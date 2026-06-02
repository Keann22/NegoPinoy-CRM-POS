import * as z from "zod";

export type Supplier = { id: string; name: string; [key: string]: any; };

/**
 * Base schema with fields shared between add and edit product dialogs.
 */
export const productBaseSchema = z.object({
  name: z.string().min(1, "Product name is required"),
  sku: z.string().optional(),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  images: z.custom<File[]>().optional(),
  sellingPrice: z.coerce.number().min(0, "Selling price must be positive").optional().default(0),
  supplierPricing: z.array(z.object({
      supplierId: z.string(),
      supplierName: z.string(),
      unitCost: z.coerce.number().min(0)
  })).optional().default([]),
});

/**
 * Schema for adding a new product — extends base with stock and variation fields.
 */
export const addProductSchema = productBaseSchema.extend({
  quantityOnHand: z.coerce.number().int().min(0, "Stock must be a non-negative integer").optional().default(0),
  hasVariations: z.boolean().default(false),
  variations: z.array(z.object({
      nameSuffix: z.string().min(1, "Variation name is required"),
      sku: z.string().optional(),
      sellingPrice: z.coerce.number().min(0, "Price must be positive"),
      quantityOnHand: z.coerce.number().int().min(0, "Stock must be a non-negative integer"),
      images: z.custom<File[]>().optional(),
  })).optional().default([]),
});

/**
 * Schema for editing an existing product — extends base with a required selling price.
 */
export const editProductSchema = productBaseSchema.extend({
  sellingPrice: z.coerce.number().min(0, "Selling price must be positive"),
});

export type ProductBaseFormValues = z.infer<typeof productBaseSchema>;
export type AddProductFormValues = z.infer<typeof addProductSchema>;
export type EditProductFormValues = z.infer<typeof editProductSchema>;
