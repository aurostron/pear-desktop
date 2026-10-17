// Evaluate an expression in the main world of the YouTube Music page over CDP.
//
// Usage:
//   node tools/cdp-eval.mjs ipc            -> run the built-in Tauri IPC diagnostic
//   node tools/cdp-eval.mjs "<expression>" -> evaluate arbitrary JS (awaitPromise on)
//
// Requires the app running with WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222
const port = Number(process.argv[2] === 'ipc' || !process.argv[2] ? 9222 : process.env.CDP_PORT || 9222);
const arg = process.argv[2] === 'ipc' || !process.argv[2] ? 'ipc' : process.argv.slice(2).join(' ');
const base = `http://127.0.0.1:${port}`;

const IPC_PRESET = `(async () => {
  const out = {
    url: location.href,
    internals: typeof window.__TAURI_INTERNALS__,
    invokeFn: typeof (window.__TAURI_INTERNALS__?.invoke),
    tauriGlobal: typeof window.__TAURI__,
    ipcProp: typeof (window.__TAURI_INTERNALS__?.ipc),
    ipcKeys: window.__TAURI_INTERNALS__?.ipc ? Object.keys(window.__TAURI_INTERNALS__.ipc) : null,
    chromeWebview: !!(window.chrome && window.chrome.webview && typeof window.chrome.webview.postMessage === 'function'),
    internalsKeys: window.__TAURI_INTERNALS__ ? Object.keys(window.__TAURI_INTERNALS__) : null,
  };
  if (typeof window.__TAURI_INTERNALS__?.invoke === 'function') {
    try {
      const r = await window.__TAURI_INTERNALS__.invoke('diag_log', { kind: 'page', msg: 'cdp-eval ipc preset' });
      out.invokeDiag = 'ok:' + JSON.stringify(r ?? null);
    } catch (e) {
      out.invokeDiag = 'err:' + String((e && (e.message || e)) ?? e);
    }
  }
  return out;
})()`;

const expression = arg === 'ipc' ? IPC_PRESET : arg;

const r = await fetch(`${base}/json/list`);
if (!r.ok) {
  console.error(`no CDP endpoint: ${base}/json/list -> ${r.status}`);
  process.exit(2);
}
const targets = await r.json();
const match = process.env.CDP_MATCH || 'music.youtube.com';
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

const res = await send('Runtime.evaluate', {
  expression,
  returnByValue: true,
  awaitPromise: true,
});

if (res.result?.exceptionDetails) {
  console.log('EXCEPTION:', res.result.exceptionDetails.text);
  console.log(res.result.exceptionDetails.exception?.description ?? '');
} else {
  const v = res.result?.result?.value;
  console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 2));
}

ws.close();
process.exit(0);
