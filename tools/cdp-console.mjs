// Reload the YouTube Music page over CDP and capture console + exceptions live.
// Usage: node tools/cdp-console.mjs
const base = 'http://127.0.0.1:9222';

const r = await fetch(`${base}/json/list`);
const targets = await r.json();
const page = targets.find((t) => t.type === 'page' && String(t.url).includes('music.youtube.com'));
if (!page) {
  console.error('no ytm page target');
  process.exit(2);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
let msgId = 0;
const pending = new Map();
const events = [];

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
    return;
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    const text = msg.params.args
      .map((a) => (a.value !== undefined ? String(a.value) : a.description ?? a.type))
      .join(' ');
    events.push(`[console.${msg.params.type}] ${text}`);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    events.push(`[EXCEPTION] ${d.text} ${d.exception?.description ?? ''} @${d.url ?? ''}:${d.lineNumber ?? ''}`);
  } else if (msg.method === 'Log.entryAdded') {
    const e = msg.params.entry;
    events.push(`[log.${e.level}] ${e.text} @${e.url ?? ''}:${e.lineNumber ?? ''}`);
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

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
events.push('--- reloading page, capturing 10s ---');
await send('Page.reload');

await new Promise((res) => setTimeout(res, 10000));

const probe = await send('Runtime.evaluate', {
  expression: `(async () => {
    const out = [];
    out.push('style count: ' + document.querySelectorAll('style#tauri-custom-font').length);
    out.push('controls: ' + !!document.getElementById('tauri-window-controls'));
    const nav = document.querySelector('ytmusic-nav-bar');
    out.push('navbar: ' + !!nav);
    let ticks = 0;
    const h = setInterval(() => ticks++, 200);
    await new Promise((r) => setTimeout(r, 1100));
    clearInterval(h);
    out.push('page intervals alive: ' + ticks);
    return out.join('\\n');
  })()`,
  returnByValue: true,
  awaitPromise: true,
});

console.log(events.join('\n'));
console.log('\n--- end state ---');
console.log(probe.result?.result?.value ?? JSON.stringify(probe.result));
ws.close();
process.exit(0);
