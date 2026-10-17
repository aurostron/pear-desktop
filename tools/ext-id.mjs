// Derives the Chrome extension id from the manifest's "key" public key.
// Chrome maps the first 128 bits of SHA-256(pubkey DER) to a-p.
//
// The built manifest uses the plain "key" field; the upstream source manifest
// spells it "chrome:key". Accept either.
import fs from 'node:fs';
import crypto from 'node:crypto';

  const manifestPath = process.argv[2] || 'vendor/extensions/better-lyrics/manifest.json';
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const b64 = manifest.key || manifest['chrome:key'] || manifest['chromium:key'];
if (!b64) {
  console.error('no key / chrome:key in manifest');
  process.exit(1);
}

const der = Buffer.from(b64, 'base64');
const hash = crypto.createHash('sha256').update(der).digest();

let id = '';
for (let i = 0; i < 16; i++) {
  id += String.fromCharCode(97 + (hash[i] >> 4));
  id += String.fromCharCode(97 + (hash[i] & 0x0f));
}

console.log('name    :', manifest.name);
console.log('version :', manifest.version);
console.log('id      :', id);
console.log('origin  :', `chrome-extension://${id}/`);

const page = manifest.options_ui?.page;
if (page) {
  console.log('options :', `chrome-extension://${id}/${page}`);
}

const sw = manifest.background?.service_worker;
if (sw) {
  console.log('sw      :', `chrome-extension://${id}/${sw}`);
}