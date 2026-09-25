#!/usr/bin/env node
// Local dev server: rebuilds index.html on content changes, serves static files, and runs api/ask.js
// with the same (req, res) shape Vercel uses. Usage: node scripts/dev.js [port]
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || process.env.PORT || 3000);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

// Load .env without overriding variables already set in the shell. Values are never printed.
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  });
}

function build() {
  try { execFileSync(process.execPath, [path.join(ROOT, 'build.js')], { stdio: 'inherit' }); }
  catch { console.error('build failed; serving the previous index.html'); }
}
build();
let pending = null;
['data', 'src'].forEach((dir) => fs.watch(path.join(ROOT, dir), () => { clearTimeout(pending); pending = setTimeout(build, 150); }));
['render.js', 'mark.svg'].forEach((f) => fs.watch(path.join(ROOT, 'assets', f), () => { clearTimeout(pending); pending = setTimeout(build, 150); }));

const ask = require('../api/ask.js');

function withVercelHelpers(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => {
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(obj));
    return res;
  };
  return res;
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/ask') {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 16384) req.destroy(); });
    req.on('end', () => {
      try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = {}; }
      Promise.resolve(ask(req, withVercelHelpers(res))).catch(() => { res.statusCode = 500; res.end(); });
    });
    return;
  }
  const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT) || /[\\/](\.env|\.git)/.test(file)) { res.statusCode = 403; return res.end('Forbidden'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.statusCode = 404; return res.end('Not found'); }
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.end(buf);
  });
}).listen(PORT, () => {
  console.log(`JAY.OS dev server on http://localhost:${PORT}  (LLM ${process.env.GROQ_API_KEY ? 'enabled' : 'disabled: no GROQ_API_KEY'})`);
});
