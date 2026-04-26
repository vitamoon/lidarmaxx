#!/usr/bin/env node
/**
 * stamp-build.mjs <short-sha>
 *
 * Stamps the build hash into index.html in two places:
 *   1. The build pill in the top bar  (`<span id="build-hash">…</span>`)
 *   2. The cache-buster on every `?v=__BUILD__` URL.
 *
 * Asserts that both substitutions actually happened. We learned the
 * hard way that a "successful" sed step can silently no-op on a runner
 * with a different locale; this script fails loudly instead.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const sha = process.argv[2];
if (!sha || !/^[a-f0-9]{6,40}$/i.test(sha)) {
  console.error('usage: stamp-build.mjs <short-sha>');
  process.exit(2);
}

const here = dirname(fileURLToPath(import.meta.url));
const path = resolve(here, '..', 'index.html');
let src = readFileSync(path, 'utf8');

const before = src;

src = src.replace(/__BUILD__/g, sha);
src = src.replace(
  /<span id="build-hash">[^<]*<\/span>/,
  `<span id="build-hash">${sha}</span>`,
);

if (src === before) {
  console.error('stamp-build: nothing changed; expected __BUILD__ markers in index.html');
  process.exit(3);
}
if (src.includes('__BUILD__')) {
  console.error('stamp-build: residual __BUILD__ markers after substitution');
  process.exit(4);
}
if (!src.includes(`<span id="build-hash">${sha}</span>`)) {
  console.error('stamp-build: build-hash pill not stamped');
  process.exit(5);
}

writeFileSync(path, src);
console.log(`stamp-build: ok  sha=${sha}  bytes=${src.length}`);
