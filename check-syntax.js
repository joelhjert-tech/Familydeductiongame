const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function runCheck(file, source) {
  const temp = path.join(__dirname, `.check-${file.replace(/[^a-z0-9]/gi, '-')}.js`);
  fs.writeFileSync(temp, source);
  const result = spawnSync(process.execPath, ['--check', temp], { stdio: 'inherit' });
  fs.unlinkSync(temp);
  if (result.status !== 0) process.exit(result.status || 1);
}

runCheck('server.js', fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8'));

for (const file of ['index.html', 'host.html']) {
  const html = fs.readFileSync(path.join(__dirname, file), 'utf8');
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1])
    .filter(source => source.trim());

  scripts.forEach((source, index) => runCheck(`${file}-${index}`, source));
}

console.log('Syntax checks passed.');
