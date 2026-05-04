// Tiny zero-dependency static file server for the LAN launcher.
// Usage: node server.js [port] [webRoot]
const http = require('http');
const fs = require('fs');
const path = require('path');

const port = parseInt(process.argv[2] || '8073', 10);
const webRoot = path.resolve(process.argv[3] || path.join(__dirname, '..', 'src'));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.mp3':  'audio/mpeg',
  '.ico':  'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt':  'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url.endsWith('/')) url += 'index.html';
  const file = path.normalize(path.join(webRoot, url));
  if (!file.startsWith(webRoot)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('forbidden');
  }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404 not found');
    }
    const ext = path.extname(file).toLowerCase();
    const type = TYPES[ext] || 'application/octet-stream';
    fs.readFile(file, (err2, data) => {
      if (err2) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        return res.end('500 read error');
      }
      res.writeHead(200, {
        'Content-Type': type,
        'Service-Worker-Allowed': '/',
        'Cache-Control': 'no-cache',
      });
      res.end(data);
    });
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`serving ${webRoot} on 0.0.0.0:${port}`);
});

// Clean shutdown on Ctrl+C / parent close
function shutdown() {
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
