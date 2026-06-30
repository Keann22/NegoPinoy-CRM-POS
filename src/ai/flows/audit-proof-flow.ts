'use server';
/**
 * @fileOverview AI flow to audit agent proof screenshots.
 *
 * - auditProof - Analyzes an uploaded image to verify it is a valid
 *   Facebook/Meta Business Suite screenshot relevant to the claimed task.
 * - AuditProofInput - Input type
 * - AuditProofOutput - Return type
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const AuditProofInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      "A screenshot uploaded by a sales agent as proof of their daily task, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'"
    ),
  taskType: z
    .string()
    .describe(
      "The task type the agent claims to have performed. One of: 'delete_inactive' (deleted inactive Facebook catalog items), 'add_product' (added a new product to the catalog), 'train_intent' (trained a chatbot intent), 'other'."
    ),
});
export type AuditProofInput = z.infer<typeof AuditProofInputSchema>;

const AuditProofOutputSchema = z.object({
  verdict: z
    .enum(['approved', 'rejected', 'flagged'])
    .describe(
      "The AI's verdict on the proof. 'approved' means the image is valid. 'rejected' means the image is clearly not a valid screenshot or does not match the claimed task. 'flagged' means the image looks suspicious (e.g., may be a duplicate, blurry, or shows incorrect content)."
    ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe('Confidence score of the verdict, from 0.0 (not confident) to 1.0 (very confident).'),
  feedback: z
    .string()
    .describe(
      'A short, clear explanation of the verdict in Filipino/English mixed language (Taglish) explaining why the image was approved, rejected, or flagged.'
    ),
  isFacebookScreenshot: z
    .boolean()
    .describe('Whether the image appears to be a screenshot from Facebook, Meta Business Suite, or Facebook Commerce Manager.'),
  matchesTaskType: z
    .boolean()
    .describe('Whether the content of the screenshot is consistent with the claimed task type.'),
});
export type AuditProofOutput = z.infer<typeof AuditProofOutputSchema>;

export async function auditProof(input: AuditProofInput): Promise<AuditProofOutput> {
  return auditProofFlow(input);
}

const prompt = ai.definePrompt({
  name: 'auditProofPrompt',
  input: { schema: AuditProofInputSchema },
  output: { schema: AuditProofOutputSchema },
  prompt: `You are an AI compliance auditor for NegosyantengPinoy.Ph, a Filipino e-commerce business.
Your job is to verify that sales agents are completing their daily Facebook catalog maintenance tasks.

The agent has uploaded a screenshot as proof. Analyze the image carefully.

Agent's claimed task: {{taskType}}

Task type definitions:
- delete_inactive: The agent deleted one or more inactive or out-of-stock items from the Facebook/Meta product catalog.
- add_product: The agent added a new product to the Facebook/Meta product catalog.
- train_intent: The agent trained or updated a chatbot intent in a Facebook chatbot or Messenger bot platform.
- other: Any other relevant business task on Facebook/Meta platforms.

Your analysis must determine:
1. Is this a screenshot from Facebook, Meta Business Suite, Facebook Commerce Manager, or a related Meta platform?
2. Does the content of the screenshot match the claimed task type?
3. Is there anything suspicious about the image?

Verdict rules:
- 'approved': The screenshot is clearly from a Meta/Facebook platform AND the content matches the claimed task type.
- 'rejected': The screenshot is NOT from Facebook/Meta, OR the content clearly does not match the task, OR the image is blank/empty/unreadable.
- 'flagged': The screenshot is from Facebook/Meta but the content is ambiguous, unclear, or does not clearly show task completion. Also flag if the image looks like it could be a cropped or manipulated screenshot.

Write your feedback in Taglish (Filipino-English mix) so it's easy for the agents to understand.

Screenshot image: {{media url=photoDataUri}}`,
});

const auditProofFlow = ai.defineFlow(
  {
    name: 'auditProofFlow',
    inputSchema: AuditProofInputSchema,
    outputSchema: AuditProofOutputSchema,
  },
  async (input: AuditProofInput) => {
    const { output } = await prompt(input);
    return output!;
  }
);
