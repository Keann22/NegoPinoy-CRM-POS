'use server';

/**
 * @fileOverview An AI-powered marketing recommendation generator.
 *
 * - generateMarketingRecommendations - A function that provides marketing content and product recommendations based on customer order history.
 * - GenerateMarketingRecommendationsInput - The input type for the generateMarketingRecommendations function.
 * - GenerateMarketingRecommendationsOutput - The return type for the generateMarketingRecommendations function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateMarketingRecommendationsInputSchema = z.object({
  customerOrderHistory: z
    .string()
    .describe('The recent order history of the customer.'),
});

export type GenerateMarketingRecommendationsInput = z.infer<
  typeof GenerateMarketingRecommendationsInputSchema
>;

const GenerateMarketingRecommendationsOutputSchema = z.object({
  marketingContentRecommendation: z
    .string()
    .describe('Recommended marketing content for the customer.'),
  productRecommendations: z
    .string()
    .describe('Recommended products for the customer.'),
});

export type GenerateMarketingRecommendationsOutput = z.infer<
  typeof GenerateMarketingRecommendationsOutputSchema
>;

export async function generateMarketingRecommendations(
  input: GenerateMarketingRecommendationsInput
): Promise<GenerateMarketingRecommendationsOutput> {
  return generateMarketingRecommendationsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateMarketingRecommendationsPrompt',
  input: {schema: GenerateMarketingRecommendationsInputSchema},
  output: {schema: GenerateMarketingRecommendationsOutputSchema},
  prompt: `You are an AI marketing assistant for a retail business. Based on the customer's order history, provide a marketing content recommendation and a list of products that they might be interested in.

Customer Order History: {{{customerOrderHistory}}}

Marketing Content Recommendation:
Product Recommendations: `,
});

const generateMarketingRecommendationsFlow = ai.defineFlow(
  {
    name: 'generateMarketingRecommendationsFlow',
    inputSchema: GenerateMarketingRecommendationsInputSchema,
    outputSchema: GenerateMarketingRecommendationsOutputSchema,
  },
  async (input: GenerateMarketingRecommendationsInput) => {
    const {output} = await prompt(input);
    return output!;
  }
);
