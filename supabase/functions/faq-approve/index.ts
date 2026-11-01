import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req: Request) => {
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
