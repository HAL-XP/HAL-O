// Standalone Node.js HTTPS proxy for PWA — bypasses Electron firewall block
// Forwards all HTTP/HTTPS + WebSocket traffic from 0.0.0.0:19401 → 127.0.0.1:19400
// HTTPS required for getUserMedia (mic access) on mobile Chrome
const https = require('https');
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');

const LISTEN_PORT = 19401;
const TARGET = { host: '127.0.0.1', port: 19400 };

// Load self-signed cert
const certsDir = path.join(__dirname, 'certs');
const options = {
  key: fs.readFileSync(path.join(certsDir, 'key.pem')),
  cert: fs.readFileSync(path.join(certsDir, 'cert.pem')),
};

const server = https.createServer(options, (req, res) => {
  const opts = {
    hostname: TARGET.host,
    port: TARGET.port,
    path: req.url,
    method: req.method,
    headers: req.headers,
  };
  const proxy = http.request(opts, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });
  proxy.on('error', () => { res.writeHead(502); res.end('Proxy error'); });
  req.pipe(proxy, { end: true });
});

// WebSocket upgrade passthrough
server.on('upgrade', (req, socket, head) => {
  const target = net.connect(TARGET.port, TARGET.host, () => {
    const headers = [`${req.method} ${req.url} HTTP/1.1`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      headers.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i+1]}`);
    }
    target.write(headers.join('\r\n') + '\r\n\r\n');
    if (head.length > 0) target.write(head);
    socket.pipe(target);
    target.pipe(socket);
  });
  target.on('error', () => socket.destroy());
  socket.on('error', () => target.destroy());
});

server.listen(LISTEN_PORT, '0.0.0.0', () => {
  console.log(`[PWA-Proxy] HTTPS https://0.0.0.0:${LISTEN_PORT} → http://${TARGET.host}:${TARGET.port}`);
  console.log(`[PWA-Proxy] Open on phone: https://192.168.1.160:${LISTEN_PORT}`);
  console.log(`[PWA-Proxy] Accept the self-signed cert warning once, then mic works.`);
});
