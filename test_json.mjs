import fs from 'fs';
const data = JSON.parse(fs.readFileSync('./src/lib/philippine-address-data.json', 'utf8'));
console.log(Object.keys(data).slice(0, 5));
