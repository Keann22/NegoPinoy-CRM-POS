import fs from 'fs';
import path from 'path';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyBTl4X5mahECnY44wGVkU6RPVN7hv1kAx0';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function extractFromImage(imagePath) {
  const mimeType = 'image/jpeg';
  const base64Data = fs.readFileSync(imagePath, { encoding: 'base64' });
  
  const prompt = `Extract the table data from this image. It is a procurement list. 
Extract each row into a JSON array of objects with the following keys:
- productName (string)
- neededQty (number)
- actualQtyBought (number or null if empty/crossed out)

Return ONLY valid JSON array. Do not wrap in markdown \`\`\`json.`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: base64Data } }
        ]
      }],
      generationConfig: {
        responseMimeType: "application/json",
      }
    })
  });
  
  const data = await response.json();
  if (data.error) {
    console.error(`Error processing ${imagePath}:`, data.error);
    return [];
  }
  
  try {
    const text = data.candidates[0].content.parts[0].text;
    return JSON.parse(text);
  } catch (e) {
    console.error(`Failed to parse JSON for ${imagePath}`, e);
    return [];
  }
}

async function extractFromPdf(pdfPath) {
  const mimeType = 'application/pdf';
  const base64Data = fs.readFileSync(pdfPath, { encoding: 'base64' });
  
  const prompt = `Extract the table data from this PDF. It is a procurement list. 
Extract each row into a JSON array of objects with the following keys:
- productName (string)
- neededQty (number)
- actualQtyBought (number or null if empty/crossed out)

Return ONLY valid JSON array. Do not wrap in markdown \`\`\`json.`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: base64Data } }
        ]
      }],
      generationConfig: {
        responseMimeType: "application/json",
      }
    })
  });
  
  const data = await response.json();
  if (data.error) {
    console.error(`Error processing ${pdfPath}:`, data.error);
    return [];
  }
  
  try {
    const text = data.candidates[0].content.parts[0].text;
    return JSON.parse(text);
  } catch (e) {
    console.error(`Failed to parse JSON for ${pdfPath}`);
    return [];
  }
}

async function main() {
  const baseDir = 'c:\\Users\\Keneth\\Documents\\NegoPinoy CRM POS\\Inventory for purchase';
  
  const june5Dir = path.join(baseDir, 'June 5');
  const june9Dir = path.join(baseDir, 'June 9');
  const currentDir = path.join(baseDir, 'Current');
  
  const june5Files = fs.readdirSync(june5Dir).filter(f => f.endsWith('.jpg')).map(f => path.join(june5Dir, f));
  const june9Files = fs.readdirSync(june9Dir).filter(f => f.endsWith('.jpg')).map(f => path.join(june9Dir, f));
  const pdfFile = path.join(currentDir, 'RetailFlow.pdf');
  
  console.log(`Found ${june5Files.length} June 5 files, ${june9Files.length} June 9 files, and 1 PDF.`);
  
  const results = {
    june5: [],
    june9: [],
    current: []
  };
  
  // Process June 5
  console.log("Processing June 5...");
  for (const file of june5Files) {
    const res = await extractFromImage(file);
    results.june5.push(...res);
    await sleep(4000); // 4 seconds delay to avoid rate limits
  }
  
  // Process June 9
  console.log("Processing June 9...");
  for (const file of june9Files) {
    const res = await extractFromImage(file);
    results.june9.push(...res);
    await sleep(4000);
  }
  
  // Process Current PDF
  console.log("Processing Current PDF...");
  const currentRes = await extractFromPdf(pdfFile);
  results.current.push(...currentRes);
  
  fs.writeFileSync('inventory_data.json', JSON.stringify(results, null, 2));
  console.log("Done. Saved to inventory_data.json");
}

main().catch(console.error);
