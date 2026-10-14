import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const files = new Map([
  ['/', ['index.html', 'text/html']],
  ...['app.js', 'engine.js', 'worker.js', 'tile-art.js'].map(f => [`/${f}`, [f, 'text/javascript']]),
  ['/styles.css', ['styles.css', 'text/css']],
]);
const port = Number(process.env.PORT || 5174);
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/favicon.ico') { res.writeHead(204).end(); return; }
  const file = files.get(path);
  if (!file) { res.writeHead(404).end('Not found'); return; }
  try {
    const body = await readFile(new URL(`./dist/${file[0]}`, import.meta.url));
    res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8`, 'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(500).end('Could not read application file.'); }
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Qwirkle Analyzer → http://127.0.0.1:${port}`));
