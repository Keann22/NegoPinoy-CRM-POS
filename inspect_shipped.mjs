import xlsx from 'xlsx';
const wb = xlsx.readFile('spx shipped/2cdee0b6c9c34b15915dbcc398dc62a7.xlsx');
const sheet = wb.Sheets[wb.SheetNames[0]];
console.log(xlsx.utils.sheet_to_json(sheet, {header: 1}).slice(0, 5));
