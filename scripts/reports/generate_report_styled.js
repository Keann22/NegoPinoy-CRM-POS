const fs = require('fs');

const css = `
<style>
body {
  font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.6;
  color: #333;
  max-width: 1200px;
  margin: 0 auto;
  padding: 40px 20px;
  background-color: #f4f7f6;
}
h1 { 
  color: #2c3e50; 
  border-bottom: 3px solid #3498db; 
  padding-bottom: 15px; 
  font-size: 2.5em;
}
h2 { 
  color: #2980b9; 
  margin-top: 40px; 
  border-bottom: 1px solid #bdc3c7;
  padding-bottom: 10px;
}
h3 { color: #e67e22; }
table {
  width: 100%;
  border-collapse: collapse;
  margin: 25px 0;
  background-color: #fff;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
}
th, td {
  padding: 15px 20px;
  text-align: left;
}
th {
  background-color: #2c3e50;
  color: #ffffff;
  font-weight: 600;
  font-size: 1.1em;
}
tr { border-bottom: 1px solid #dddddd; }
tr:nth-child(even) { background-color: #f8f9fa; }
tr:last-child { border-bottom: 2px solid #2c3e50; }
tr:hover { background-color: #e2e6ea; transition: 0.2s; }
td:first-child { font-weight: bold; color: #34495e; width: 40%; }
ul {
  background-color: #fff;
  padding: 20px 40px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}
li { margin-bottom: 10px; }
</style>
`;

const htmlPath = 'C:\\\\Users\\\\Keneth\\\\Documents\\\\NegoPinoy CRM POS\\\\inventory_discrepancy_report.html';
let htmlContent = fs.readFileSync(htmlPath, 'utf8');

if (!htmlContent.includes('<style>')) {
  htmlContent = css + htmlContent;
  fs.writeFileSync(htmlPath, htmlContent);
}
console.log('Styled!');
