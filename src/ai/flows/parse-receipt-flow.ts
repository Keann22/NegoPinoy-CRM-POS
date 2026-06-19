'use server';
/**
 * @fileOverview An AI-powered receipt parser.
 *
 * - parseReceipt - A function that parses items from a receipt image.
 * - ParseReceiptInput - The input type for the parseReceipt function.
 * - ParseReceiptOutput - The return type for the parseReceipt function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ParsedItemSchema = z.object({
    productName: z.string().describe('The name of the product found on the receipt.'),
    quantity: z.coerce.number().describe('The quantity of the product.'),
    unitCost: z.coerce.number().describe('The cost per unit of the product.'),
});

const ParseReceiptInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      "A photo of a receipt, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'"
    ),
});
export type ParseReceiptInput = z.infer<typeof ParseReceiptInputSchema>;

const ParseReceiptOutputSchema = z.object({
    items: z.array(ParsedItemSchema).describe('The list of items parsed from the receipt.')
});
export type ParseReceiptOutput = z.infer<typeof ParseReceiptOutputSchema>;

export async function parseReceipt(input: ParseReceiptInput): Promise<ParseReceiptOutput> {
  return parseReceiptFlow(input);
}

const prompt = ai.definePrompt({
  name: 'parseReceiptPrompt',
  input: {schema: ParseReceiptInputSchema},
  output: {schema: ParseReceiptOutputSchema},
  prompt: `You are an expert data entry specialist for a retail business. Your task is to accurately parse product information from a supplier receipt image.

For each line item on the receipt, extract the product name, the quantity, and the unit cost. Ignore any totals, taxes, or other fees.

For the 'quantity' and 'unitCost' fields, you MUST provide only a numeric value. Do not include any text, symbols, or units like 'pcs' or 'x'. If a value is unclear or missing, use a default of 1 for quantity and 0 for unitCost.

Return the data in the specified JSON format.

Receipt Image: {{media url=photoDataUri}}`,
});

const parseReceiptFlow = ai.defineFlow(
  {
    name: 'parseReceiptFlow',
    inputSchema: ParseReceiptInputSchema,
    outputSchema: ParseReceiptOutputSchema,
  },
  async (input: ParseReceiptInput) => {
    const {output} = await prompt(input);
    return output!;
  }
);
