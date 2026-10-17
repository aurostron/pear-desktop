// Create a new CDP target (window) at a URL via the browser-level Target domain.
//
// Usage: node tools/cdp-target.mjs <url>
const port = process.env.CDP_PORT || 9222;
const url = process.argv[2];
if (!url) {
  console.error('usage: node tools/cdp-target.mjs <url>');
  process.exit(2);
}

const r = await fetch(`http://127.0.0.1:${port}/json/version`);
const { webSocketDebuggerUrl } = await r.json();

const ws = new WebSocket(webSocketDebuggerUrl);
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

const created = await send('Target.createTarget', { url });
console.log('createTarget:', JSON.stringify(created.result ?? created.error));

await new Promise((res) => setTimeout(res, 2500));

const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
console.log('\ntargets now:');
for (const t of list) {
  console.log(`${t.type}\t${String(t.url).slice(0, 160)}`);
}

ws.close();
process.exit(0);
