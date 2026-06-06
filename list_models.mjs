import fs from 'fs';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function listModels() {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`);
  const data = await response.json();
  console.log(data.models.map(m => m.name).join('\n'));
}
listModels();
