// Run once: node download-assets.js
// Requires PIXELLAB_API_KEY in environment or .env file
const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const KEY = process.env.PIXELLAB_API_KEY;
if (!KEY) {
  console.error('Missing PIXELLAB_API_KEY. Set it in .env or environment.');
  process.exit(1);
}

const ASSETS_DIR = path.join(__dirname, 'assets');
if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR);

const MAP_OBJECTS = {
  'writing.png':      '916ce4df-f91d-4de1-8780-f35850003b77',
  'drawing.png':      '39e31a95-30b8-4ec1-8a03-9f638fd4595a',
  'deliberation.png': 'a4ba5af6-bc56-45ff-98fc-1a6533553253',
  'opinion.png':      'bc4b7573-3dbb-4ce9-bfb9-864bc6c65a58',
  'bioscanner.png':   '51f8c81b-c14f-4723-99fc-b8da015e0e10',
  'crisis.png':       '01ce751f-dbd6-438c-aa66-dbf36ff74a63',
  'checksum.png':     'cfdb9490-8f15-4583-9afd-50c5b7aca8f8',
  'quarantine.png':   '0a872b60-7b16-4533-91f2-18850a1dd083',
  'blackbox.png':     '4a4f4cf1-a9cd-45ba-8f00-8a6f0e810553',
  'pushbutton.png':   'ebbc0b5f-3319-432d-a822-528bdbc3b049',
};

const CHARACTERS = {
  'knight.png': 'https://backblaze.pixellab.ai/file/pixellab-characters/b3b53404-3d3a-4268-9eb3-f71905c50f2e/74d5e44a-35a0-46cd-acfa-a7a7d53cb285/rotations/south.png',
  'impostor.png': 'https://backblaze.pixellab.ai/file/pixellab-characters/b3b53404-3d3a-4268-9eb3-f71905c50f2e/73678f99-1104-47b5-8deb-5a974c3f86a5/rotations/south.png',
};

function download(url, dest, headers = {}) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const lib  = url.startsWith('https') ? https : http;
    lib.get(url, { headers }, res => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        file.close();
        return download(res.headers.location, dest, headers).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlink(dest, () => {});
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', err => { fs.unlink(dest, () => {}); reject(err); });
  });
}

async function main() {
  // Download character sprites (public CDN)
  for (const [name, url] of Object.entries(CHARACTERS)) {
    const dest = path.join(ASSETS_DIR, name);
    if (fs.existsSync(dest)) { console.log(`  skip ${name} (exists)`); continue; }
    process.stdout.write(`  downloading ${name}... `);
    try { await download(url, dest); console.log('ok'); }
    catch (e) { console.log(`FAILED: ${e.message}`); }
  }

  // Download map objects (need API key)
  for (const [name, id] of Object.entries(MAP_OBJECTS)) {
    const dest = path.join(ASSETS_DIR, name);
    if (fs.existsSync(dest)) { console.log(`  skip ${name} (exists)`); continue; }
    const url = `https://api.pixellab.ai/mcp/map-objects/${id}/download`;
    process.stdout.write(`  downloading ${name}... `);
    try {
      await download(url, dest, { Authorization: `Bearer ${KEY}` });
      console.log('ok');
    } catch (e) { console.log(`FAILED: ${e.message}`); }
  }

  console.log('\nDone. Assets saved to ./assets/');
}

main();
