// A static page that reloads itself when the files it is made of change.
//
// One HTTP server per address, a websocket server shared between them, and an
// fs watcher that broadcasts `reload` on any change under the project root.

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 5210);
const HOST = process.env.HOST || '127.0.0.1';

// Every connected page is told the boot id. A page holding a different one is
// looking at output from a server that has since restarted, so it reloads.
const BOOT_ID = String(process.pid) + '-' + String(Date.now());

// How often the server sends an application-level heartbeat. Ping frames alone
// are invisible to the browser's WebSocket API, so the client cannot use them
// to tell a live socket from one a proxy dropped on the floor.
const HEARTBEAT_MS = 20_000;

const IGNORED = new Set(['node_modules', '.git']);

// ---------------------------------------------------------------- the page

const CLIENT = `
(() => {
  const RELOAD_PATH = '/__reload';
  // If nothing arrives for this long the socket is assumed dead — an idle
  // timeout at a proxy closes the connection without telling either end.
  const SILENCE_MS = 60000;
  let bootId = null;
  let socket = null;
  let watchdog = null;
  let backoff = 500;

  const armWatchdog = () => {
    clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      console.warn('[reload] no heartbeat, reconnecting');
      if (socket) socket.close();
    }, SILENCE_MS);
  };

  const connect = () => {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(proto + '//' + location.host + RELOAD_PATH);

    socket.addEventListener('open', () => {
      backoff = 500;
      armWatchdog();
      console.info('[reload] connected');
    });

    socket.addEventListener('message', (event) => {
      armWatchdog();
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }

      if (msg.type === 'hello') {
        // A new boot id means the server restarted while we were away, and
        // whatever it now serves is not what is on screen.
        if (bootId !== null && bootId !== msg.bootId) location.reload();
        bootId = msg.bootId;
        return;
      }
      if (msg.type === 'reload') {
        console.info('[reload] changed:', msg.file);
        location.reload();
      }
      // 'ping' needs no handling — receiving it already re-armed the watchdog.
    });

    socket.addEventListener('close', () => {
      clearTimeout(watchdog);
      setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, 5000);
    });

    socket.addEventListener('error', () => socket.close());
  };

  connect();
})();
`;

const SHELL = (content) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>foldai-reload-demo</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0; padding: 3rem 1.5rem;
    font: 16px/1.6 ui-sans-serif, system-ui, -apple-system, sans-serif;
    max-width: 42rem; margin-inline: auto;
  }
  h1 { font-size: 1.6rem; line-height: 1.2; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9em; }
  .hint { opacity: .7; }
  footer { margin-top: 3rem; font-size: .8rem; opacity: .5; }
</style>
</head>
<body>
<main>
${content}
</main>
<footer>Served from content.html · live reload over websocket</footer>
<script>${CLIENT}</script>
</body>
</html>
`;

async function renderPage() {
  const content = await fsp.readFile(path.join(ROOT, 'content.html'), 'utf8');
  return SHELL(content);
}

// ------------------------------------------------------------ http + sockets

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.send(JSON.stringify({ type: 'hello', bootId: BOOT_ID }));
});

// Drop sockets that stopped answering, and give live ones something to hear so
// their own watchdog stays quiet.
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
    try { ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch {}
  }
}, HEARTBEAT_MS).unref();

function broadcastReload(file) {
  const payload = JSON.stringify({ type: 'reload', file });
  for (const ws of wss.clients) {
    if (ws.readyState === ws.OPEN) ws.send(payload);
  }
}

async function handleRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, bootId: BOOT_ID, clients: wss.clients.size }));
    return;
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    try {
      const html = await renderPage();
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.end(html);
    } catch (err) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('Failed to render content.html: ' + err.message);
    }
    return;
  }

  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('Not found');
}

function createServer() {
  const server = http.createServer(handleRequest);
  server.on('upgrade', (req, socket, head) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname !== '/__reload') { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });
  return server;
}

// Two explicit listeners. Never 0.0.0.0 — this is started on machines that sit
// on shared networks, and a wide bind there exposes the dev server to them.
const addresses = ['127.0.0.1'];
if (HOST !== '127.0.0.1' && HOST !== 'localhost') addresses.push(HOST);

for (const address of addresses) {
  const server = createServer();
  server.on('error', (err) => {
    console.error(`[server] cannot listen on ${address}:${PORT} — ${err.message}`);
    process.exit(1);
  });
  server.listen(PORT, address, () => {
    console.log(`[server] http://${address}:${PORT}`);
  });
}

// ------------------------------------------------------------------ watching

let timer = null;
fs.watch(ROOT, { recursive: true }, (_event, filename) => {
  if (!filename) return;
  const first = filename.split(path.sep)[0];
  if (IGNORED.has(first)) return;
  clearTimeout(timer);
  // Editors write in bursts; one save should be one reload.
  timer = setTimeout(() => {
    console.log(`[watch] ${filename} changed — reloading clients`);
    broadcastReload(filename);
  }, 60);
});

console.log(`[server] watching ${ROOT} · boot ${BOOT_ID}`);
