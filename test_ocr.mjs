import Tesseract from 'tesseract.js';

async function testOcr() {
  const url = 'https://sgkjdtwqqbrpmrfukhja.supabase.co/storage/v1/object/public/proof_of_payment/go7phl2qbzu_1780375707953.png';
  try {
    const { data: { text } } = await Tesseract.recognize(url, 'eng');
    console.log('--- RAW OCR TEXT ---');
    console.log(text);
    console.log('--------------------');
    
    const cleanedText = text.replace(/\s+/g, '');
    const refRegex = /\d{13}/g;
    let match;
    let refs = [];
    while ((match = refRegex.exec(cleanedText)) !== null) {
      refs.push(match[0]);
    }
    
    console.log('Matches found:', refs);
  } catch (err) {
    console.error('OCR Error:', err);
  }
}

testOcr();
