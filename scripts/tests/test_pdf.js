const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

async function extractText(pdfPath, password) {
  try {
    const loadingTask = pdfjsLib.getDocument({
      url: pdfPath,
      password: password,
    });
    const pdfDocument = await loadingTask.promise;
    console.log(`Document loaded with ${pdfDocument.numPages} pages.`);
    
    let fullText = '';
    for (let i = 1; i <= pdfDocument.numPages; i++) {
      const page = await pdfDocument.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + '\n';
    }
    
    console.log('--- Extracted Text ---');
    console.log(fullText);
    console.log('----------------------');
  } catch (err) {
    console.error('Error parsing PDF:', err);
  }
}

extractText('./enc-0917186_1781347818613.pdf', 'ornos9554');
