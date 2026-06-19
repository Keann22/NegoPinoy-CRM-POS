const fs = require('fs');
const data = JSON.parse(fs.readFileSync('src/lib/philippine-address-data.json', 'utf8'));
console.log("Keys in data:", Object.keys(data).slice(0, 10));
console.log("Structure of first region:", JSON.stringify(data[Object.keys(data)[0]], null, 2).slice(0, 500));
