import fs from 'fs';
import path from 'path';

function walk(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  let results = [];
  for (const f of files) {
    if (f.name === 'node_modules' || f.name === '.next') continue;
    const p = path.join(dir, f.name);
    if (f.isDirectory()) {
      results = results.concat(walk(p));
    } else if (p.match(/\.(tsx?|jsx?)$/)) {
      const lines = fs.readFileSync(p, 'utf8').split('\n').length;
      if (lines > 150) results.push({ p, lines });
    }
  }
  return results;
}

const res = walk('./src');
res.sort((a, b) => b.lines - a.lines);
for (const r of res) {
  console.log(`${r.lines}\t${r.p}`);
}
