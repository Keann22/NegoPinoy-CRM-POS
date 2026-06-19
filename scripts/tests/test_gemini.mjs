import fs from 'fs';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function testGemini() {
  const prompt = `Extract address parts from: "40 rosas st.batasan hills qc 1126" into JSON.`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    })
  });
  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
}
testGemini();
