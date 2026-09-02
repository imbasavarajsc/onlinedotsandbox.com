import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.join(__dirname, 'dist');
const PORT = 4321;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  let reqUrl = req.url || '/';
  if (reqUrl.includes('?')) reqUrl = reqUrl.split('?')[0];

  let filePath = path.join(DIST_DIR, reqUrl);
  let is404 = false;

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    const directHtml = `${filePath}.html`;
    if (fs.existsSync(directHtml)) {
      filePath = directHtml;
    } else {
      is404 = true;
      const custom404 = path.join(DIST_DIR, '404', 'index.html');
      const fallback404 = path.join(DIST_DIR, '404.html');
      if (fs.existsSync(custom404)) {
        filePath = custom404;
      } else if (fs.existsSync(fallback404)) {
        filePath = fallback404;
      } else {
        filePath = path.join(DIST_DIR, 'index.html');
      }
    }
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      const custom500 = path.join(DIST_DIR, '500', 'index.html');
      if (fs.existsSync(custom500)) {
        const error500 = fs.readFileSync(custom500);
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(error500);
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(is404 ? 404 : 200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
      });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Dots & Boxes server listening on http://localhost:${PORT}`);
});
