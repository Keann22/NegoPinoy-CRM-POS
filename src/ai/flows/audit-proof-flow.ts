'use server';
/**
 * @fileOverview AI flow to audit agent proof screenshots.
 *
 * - auditProof - Analyzes an uploaded image to verify it is a valid
 *   Facebook/Meta Business Suite screenshot relevant to the claimed task.
 * - AuditProofInput - Input type
 * - AuditProofOutput - Return type
 *
 * Calls the Gemini REST API directly (instead of going through Genkit's
 * in-process `ai` client) because bundling Genkit's Google AI plugin into
 * the Next.js server crashes under Turbopack (see src/ai/genkit.ts). A
 * plain fetch() has no such bundling concerns.
 */

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

const RESPONSE_JSON_SCHEMA = {
  type: 'OBJECT',
  properties: {
    verdict: { type: 'STRING', enum: ['approved', 'rejected', 'flagged'] },
    confidence: { type: 'NUMBER' },
    feedback: { type: 'STRING' },
    isFacebookScreenshot: { type: 'BOOLEAN' },
    matchesTaskType: { type: 'BOOLEAN' },
  },
  required: ['verdict', 'confidence', 'feedback', 'isFacebookScreenshot', 'matchesTaskType'],
};

function buildPrompt(taskType: string): string {
  return `You are an AI compliance auditor for NegosyantengPinoy.Ph, a Filipino e-commerce business.
Your job is to verify that sales agents are completing their daily Facebook catalog maintenance tasks.

The agent has uploaded a screenshot as proof. Analyze the image carefully.

Agent's claimed task: ${taskType}

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

Respond with JSON only, matching this shape: { verdict, confidence, feedback, isFacebookScreenshot, matchesTaskType }.`;
}

function parseDataUri(photoDataUri: string): { mimeType: string; data: string } {
  const match = /^data:([^;]+);base64,([\s\S]*)$/.exec(photoDataUri);
  if (!match) {
    throw new Error('photoDataUri is not a valid base64 data URI.');
  }
  return { mimeType: match[1], data: match[2] };
}

async function callGeminiVision(input: AuditProofInput): Promise<AuditProofOutput> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const { mimeType, data } = parseDataUri(input.photoDataUri);

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: buildPrompt(input.taskType) },
              { inline_data: { mime_type: mimeType, data } },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_JSON_SCHEMA,
        },
      }),
    }
  );

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    throw new Error(`Gemini API request failed (${res.status}): ${bodyText.slice(0, 300)}`);
  }

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini API returned no content.');
  }

  const parsed = JSON.parse(text);
  return AuditProofOutputSchema.parse(parsed);
}

export async function auditProof(input: AuditProofInput): Promise<AuditProofOutput> {
  const parsedInput = AuditProofInputSchema.parse(input);
  try {
    return await callGeminiVision(parsedInput);
  } catch (err) {
    console.error('auditProof: AI call failed, falling back to flagged verdict.', err);
    // Fail safe: flag for human review instead of leaving the log stuck as
    // 'pending' forever or throwing (which would abort the status update).
    return {
      verdict: 'flagged',
      confidence: 0,
      feedback:
        'Hindi ma-verify ng AI ang proof mo dahil sa technical error. Mano-mano munang i-rereview ng admin. (AI audit failed due to a technical error.)',
      isFacebookScreenshot: false,
      matchesTaskType: false,
    };
  }
}
