// Capture a screenshot of the first CDP page target matching a URL substring.
//
// Usage: node tools/cdp-shot.mjs <out.png> [match]
//   match defaults to $CDP_MATCH or "music.youtube.com"
const port = process.env.CDP_PORT || 9222;
const out = process.argv[2];
const match = process.argv[3] || process.env.CDP_MATCH || 'music.youtube.com';
if (!out) {
  console.error('usage: node tools/cdp-shot.mjs <out.png> [url-substring]');
  process.exit(2);
}

const r = await fetch(`http://127.0.0.1:${port}/json/list`);
if (!r.ok) {
  console.error(`no CDP endpoint on port ${port}`);
  process.exit(2);
}
const targets = await r.json();
const page = targets.find((t) => t.type === 'page' && String(t.url).includes(match));
if (!page) {
  console.error(`no page target matching "${match}" found`);
  process.exit(2);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
let msgId = 0;
const pending = new Map();

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});

await new Promise((res, rej) => {
  ws.addEventListener('open', res);
  ws.addEventListener('error', rej);
});

function send(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++msgId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

const shot = await send('Page.captureScreenshot', { format: 'png' });
const data = shot.result?.data;
if (!data) {
  console.error('capture failed:', JSON.stringify(shot.error ?? shot));
  process.exit(1);
}
const fs = await import('node:fs');
fs.writeFileSync(out, Buffer.from(data, 'base64'));
console.log(`saved ${out} (${Buffer.from(data, 'base64').length} bytes) from ${page.url}`);

ws.close();
process.exit(0);
