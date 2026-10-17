// Drives the running app over CDP: opens a track, switches to the Lyrics tab,
// probes for Better Lyrics DOM markers, and saves a screenshot.
//
// Usage: node tools/cdp-lyrics-check.mjs [videoId] [outPng]
import { writeFileSync } from 'node:fs';

const videoId = process.argv[2] || 'dQw4w9WgXcQ';
const outPng = process.argv[3] || `${process.env.TEMP}\\pear-lyrics-check.png`;
const base = 'http://127.0.0.1:9222';

const targets = await (await fetch(`${base}/json/list`)).json();
const page = targets.find(
  (t) => t.type === 'page' && String(t.url).includes('music.youtube.com'),
);
if (!page) {
  console.error('no YTM page target');
  process.exit(2);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
let loadResolve = null;

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  } else if (msg.method === 'Page.loadEventFired' && loadResolve) {
    loadResolve();
    loadResolve = null;
  }
});
await new Promise((res, rej) => {
  ws.addEventListener('open', res);
  ws.addEventListener('error', rej);
});

function send(method, params = {}) {
  return new Promise((resolve) => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function evaluate(expression) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true });
  if (res.result?.exceptionDetails) return { EXCEPTION: res.result.exceptionDetails.text };
  return res.result?.result?.value;
}

await send('Page.enable');
await send('Runtime.enable');

const url = `https://music.youtube.com/watch?v=${videoId}`;
console.log(`navigating to ${url}`);
await send('Page.navigate', { url });
await Promise.race([new Promise((r) => (loadResolve = r)), sleep(30000)]);
await sleep(9000);

const tabInfo = await evaluate(`(() => {
  const tabs = [...document.querySelectorAll('ytmusic-player-page tp-yt-paper-tab')];
  const names = tabs.map((t) => (t.textContent || '').trim());
  const lyrics = tabs.find((t) => /lyric/i.test(t.textContent || ''));
  if (!lyrics) return { clicked: false, tabs: names };
  lyrics.click();
  return { clicked: true, tabs: names };
})()`);
console.log('lyrics tab:', JSON.stringify(tabInfo));
await sleep(8000);

const probe = await evaluate(`(() => {
  const classes = new Set();
  for (const el of document.querySelectorAll('[class*="blyrics"]')) {
    for (const c of el.classList) if (c.includes('blyrics')) classes.add(c);
  }
  return {
    href: location.href,
    blNodeCount: document.querySelectorAll('[class*="blyrics"]').length,
    blClasses: [...classes].slice(0, 25),
    container: !!document.querySelector('.blyrics-container'),
    songTitle: document.querySelector('ytmusic-player-bar .title')?.textContent ?? null,
  };
})()`);
console.log('DOM probe:', JSON.stringify(probe, null, 2));

const shot = await send('Page.captureScreenshot', { format: 'png' });
if (shot.result?.data) {
  writeFileSync(outPng, Buffer.from(shot.result.data, 'base64'));
  console.log(`screenshot: ${outPng}`);
} else {
  console.log('screenshot failed:', JSON.stringify(shot.error ?? shot));
}

ws.close();
process.exit(0);
