const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3001;
const SYNC_DIR = path.join(__dirname, 'sync-data');

try { fs.mkdirSync(SYNC_DIR, { recursive: true }); } catch(e) {}

function readCode(code) {
  try { return fs.readFileSync(path.join(SYNC_DIR, code + '.json'), 'utf-8'); }
  catch(e) { return null; }
}
function writeCode(code, data) {
  fs.writeFileSync(path.join(SYNC_DIR, code + '.json'), data, 'utf-8');
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  const url = new URL(req.url, 'http://localhost:' + PORT);
  
  if (url.pathname === '/sync/save' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const code = url.searchParams.get('code');
      if (!code || code.length !== 4) { res.writeHead(400); res.end('Invalid code'); return; }
      writeCode(code, body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  if (url.pathname === '/sync/load' && req.method === 'GET') {
    const code = url.searchParams.get('code');
    if (!code || code.length !== 4) { res.writeHead(400); res.end('Invalid code'); return; }
    const data = readCode(code);
    if (!data) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(data);
    return;
  }

  res.writeHead(404); res.end('Not found');
});
server.listen(PORT, () => console.log('Sync server on port ' + PORT));
