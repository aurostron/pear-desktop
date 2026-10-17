// Ground-truth probe for WebView2 runtime state over CDP.
//
// Usage: node tools/cdp-probe.mjs [port]
//
// Reports:
//   1. All CDP targets (page / service_worker / extension pages)
//   2. Execution contexts on the YouTube Music page (main + isolated worlds)
//   3. Better Lyrics DOM markers from the main world
//   4. Better Lyrics markers inside its own isolated world, if present
const port = Number(process.argv[2] || process.env.CDP_PORT || 9222);
const base = `http://127.0.0.1:${port}`;
const BL_ID = 'effdbpeggelllpfkjppbokhmmiinhlmg';

const r = await fetch(`${base}/json/list`);
if (!r.ok) {
  console.error(`no CDP endpoint: ${base}/json/list -> ${r.status}`);
  process.exit(2);
}
const targets = await r.json();

console.log(`== TARGETS (${targets.length}) ==`);
for (const t of targets) {
  console.log(`${t.type}\t${String(t.url).slice(0, 140)}`);
}

const blTargets = targets.filter((t) => String(t.url).includes(BL_ID));
console.log(`\n== BETTER LYRICS TARGETS: ${blTargets.length} ==`);
for (const t of blTargets) console.log(`${t.type}\t${t.url}`);

const pages = targets.filter(
  (t) => t.type === 'page' && String(t.url).includes('music.youtube.com'),
);
if (!pages.length) {
  console.log('\nno music.youtube.com page target found');
  process.exit(0);
}

const ws = new WebSocket(pages[0].webSocketDebuggerUrl);
let msgId = 0;
const pending = new Map();
const contexts = [];

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  } else if (msg.method === 'Runtime.executionContextCreated') {
    contexts.push(msg.params.context);
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

function sendTo(sessionId, method, params = {}) {
  return new Promise((resolve) => {
    const id = ++msgId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
}

async function evalIn(expression, contextId) {
  const res = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: false,
    ...(contextId ? { contextId } : {}),
  });
  if (res.result?.exceptionDetails) return { EXCEPTION: res.result.exceptionDetails.text };
  return res.result?.result?.value;
}

await send('Runtime.enable');
await new Promise((res) => setTimeout(res, 1500));

console.log(`\n== EXECUTION CONTEXTS (${contexts.length}) ==`);
for (const c of contexts) {
  console.log(
    `ctx ${c.id}\tname=${JSON.stringify(c.name)}\torigin=${c.origin}\tframe=${c.auxData?.frameId ?? ''}`,
  );
}

const mainProbe = await evalIn(`(() => ({
  href: location.href,
  readyState: document.readyState,
  blNodes: document.querySelectorAll('[class*="blyrics"]').length,
  blContainer: !!document.querySelector('.blyrics-container'),
  hasChromeRuntime: typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id,
}))()`);
console.log('\nMAIN WORLD:', JSON.stringify(mainProbe));

const extContexts = contexts.filter(
  (c) =>
    (typeof c.name === 'string' && c.name.includes(BL_ID)) ||
    (typeof c.origin === 'string' && c.origin.includes(BL_ID)),
);
console.log(`\n== BL ISOLATED WORLDS: ${extContexts.length} ==`);
for (const c of extContexts) {
  const v = await evalIn(
    `(() => ({
      href: location.href,
      runtimeId: (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) || null,
      getUrlOk: (() => { try { return chrome.runtime.getURL('manifest.json'); } catch (e) { return 'ERR ' + e.message; } })(),
      extBase: typeof window.__EXTJS_EXTENSION_BASE__ !== 'undefined' ? String(window.__EXTJS_EXTENSION_BASE__) : null,
    }))()`,
    c.id,
  );
  console.log(`ctx ${c.id}:`, JSON.stringify(v));
}

// Attach to every BL target (service worker etc.) and poke it.
for (const t of blTargets) {
  if (t.type !== 'service_worker' && t.type !== 'worker' && t.type !== 'background_page') continue;
  const attached = await send('Target.attachToTarget', { targetId: t.id, flatten: true });
  const sessionId = attached.result?.sessionId;
  if (!sessionId) {
    console.log(`\nSW ${t.type}: attach failed`, JSON.stringify(attached.error ?? {}));
    continue;
  }
  const swProbe = await sendTo(
    sessionId,
    'Runtime.evaluate',
    {
      expression: `typeof chrome === 'object' && !!chrome.runtime && !!chrome.runtime.id ? 'alive:' + chrome.runtime.id : 'no chrome.runtime'`,
      returnByValue: true,
    },
  );
  console.log(`\nSW ${t.type} ${t.url}:`, JSON.stringify(swProbe.result?.result?.value ?? swProbe.result));
}

ws.close();
process.exit(0);
