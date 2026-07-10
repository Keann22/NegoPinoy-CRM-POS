'use server';
/**
 * @fileOverview AI flow to audit agent proof screenshots.
 *
 * - auditProof - Analyzes an uploaded image to verify it is a valid
 *   Facebook/Meta Business Suite screenshot relevant to the claimed task.
 * - AuditProofInput - Input type
 * - AuditProofOutput - Return type
 *
 * Calls the OpenRouter REST API directly (instead of going through Genkit's
 * in-process `ai` client) because bundling Genkit's Google AI plugin into
 * the Next.js server crashes under Turbopack (see src/ai/genkit.ts). A
 * plain fetch() has no such bundling concerns.
 *
 * Uses OpenRouter instead of calling Gemini directly because the Gemini
 * free tier is unavailable for this account/region (all keys return
 * `generate_content_free_tier_requests limit: 0` regardless of project).
 * OpenRouter's free-tier vision models (`:free` suffix) aren't subject to
 * that restriction.
 */

import { z } from 'genkit';

const AuditProofInputSchema = z.object({
  photoUrl: z
    .string()
    .describe(
      'A public URL pointing to a screenshot uploaded by a sales agent as proof of their daily task.'
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

/**
 * Fetches the proof image server-side and converts it to a base64 data URI.
 * The vision model needs inline image data (remote image_url fetches are
 * unreliable on the free tier, returning empty 502s), while fetching it
 * server-to-server here avoids Vercel's ~4.5MB request body limit that a
 * client-side base64 upload would hit.
 */
async function fetchAsDataUri(imageUrl: string): Promise<string> {
  const res = await fetch(imageUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch proof image (${res.status}).`);
  }
  const mimeType = res.headers.get('content-type') || 'image/png';
  const buffer = Buffer.from(await res.arrayBuffer());
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

// Free-tier OpenRouter vision models are shared across all their users and
// can be slow or briefly rate-limited. Try a couple of candidates, each
// under its own hard timeout, before giving up (the caller falls back to a
// 'flagged' verdict for manual review rather than ever leaving this hanging
// past the platform's function-duration limit).
const CANDIDATE_MODELS = [
  process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
  'google/gemma-4-26b-a4b-it:free',
];
const MODEL_TIMEOUT_MS = 12_000;

async function callOneModel(model: string, apiKey: string, dataUri: string, taskType: string): Promise<AuditProofOutput> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: buildPrompt(taskType) },
              { type: 'image_url', image_url: { url: dataUri } },
            ],
          },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      throw new Error(`OpenRouter API request failed (${res.status}): ${bodyText.slice(0, 300)}`);
    }

    const json = await res.json();
    const text = json?.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error('OpenRouter API returned no content.');
    }

    const parsed = JSON.parse(text);
    return AuditProofOutputSchema.parse(parsed);
  } finally {
    clearTimeout(timeout);
  }
}

async function callOpenRouterVision(input: AuditProofInput): Promise<AuditProofOutput> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured.');
  }

  const dataUri = await fetchAsDataUri(input.photoUrl);

  let lastError: unknown;
  for (const model of CANDIDATE_MODELS) {
    try {
      return await callOneModel(model, apiKey, dataUri, input.taskType);
    } catch (err) {
      lastError = err;
      console.error(`auditProof: model ${model} failed, trying next candidate.`, err);
    }
  }
  throw lastError;
}

export async function auditProof(input: AuditProofInput): Promise<AuditProofOutput> {
  const parsedInput = AuditProofInputSchema.parse(input);
  try {
    return await callOpenRouterVision(parsedInput);
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
