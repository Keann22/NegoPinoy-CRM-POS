import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Locked 2026-11-01: this function runs with full database power, so it only answers
// callers that send the x-negopinoy-key header matching the INTERNAL_FUNCTION_KEY
// secret. While that secret is not set, every call is refused (the function is off).
// To switch it back on: set the secret in Supabase and send the header from the caller.
function isAllowedCaller(req: Request): boolean {
  const key = Deno.env.get("INTERNAL_FUNCTION_KEY");
  return !!key && req.headers.get("x-negopinoy-key") === key;
}

Deno.serve(async (req: Request) => {
  if (!isAllowedCaller(req)) {
    return new Response(JSON.stringify({ error: "Not allowed" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const { id, question, answer } = await req.json();
  if (!question || !answer) {
    return new Response(JSON.stringify({ error: "question and answer required" }), { status: 400 });
  }

  try {
    // 1. Generate embedding via Gemini
    const embRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${Deno.env.get("GEMINI_API_KEY")}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/text-embedding-004",
          content: { parts: [{ text: `${question}\n${answer}` }] },
          taskType: "RETRIEVAL_DOCUMENT",
          outputDimensionality: 768,
        }),
      }
    );
    const embData = await embRes.json();
    const embedding = embData.embedding?.values ?? null;

    // 2. Upsert into gold_standard_knowledge
    await supabase.from("gold_standard_knowledge").insert({
      question,
      answer,
      content: `${question}\n${answer}`,
      embedding: embedding ? JSON.stringify(embedding) : null,
      is_verified: true,
    });

    // 3. Mark pending_faq as verified (if id provided)
    if (id) {
      await supabase.from("pending_faqs").update({ status: "verified" }).eq("id", id);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err) {
    console.error("faq-approve error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
