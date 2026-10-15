const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const { IDS, STORAGE_KEY } = require('../shanghai/guide.js');
const read = path => fs.readFileSync(require.resolve(path), 'utf8');
const html = read('../shanghai/index.html'), js = read('../shanghai/guide.js'), sw = read('../sw.js');

test('every Shanghai ID has one place view and one checkbox, in order; Amap links search 上海', () => {
  for (const id of IDS) assert(html.includes(`id="place-${id}"`) && html.includes(`id="place-${id}-title"`), id);
  assert.deepEqual([...html.matchAll(/data-id="([^"]+)"/g)].map(m => m[1]), IDS);
  assert.equal(new Set(IDS).size, 15);
  assert(!html.includes('<img '));
  for (const [, href] of html.matchAll(/href="(https:\/\/uri.amap.com\/search[^"]+)"/g)) {
    const url = new URL(href.replaceAll('&amp;', '&'));
    assert.equal(url.searchParams.get('city'), '上海'); assert(url.searchParams.get('keyword'));
  }
  for (const chapter of ['today', 'friday', 'earlier']) assert(html.includes(`id="${chapter}"`) && html.includes(`id="${chapter}-title"`) && html.includes(`href="#${chapter}"`));
  assert(html.includes('href="../hangzhou/"'));
});

test('Shanghai syncs to its own endpoint and key; the service worker caches and checks its files', () => {
  assert(js.includes("'https://trips-sync.elcportal.workers.dev/shanghai/state'"));
  assert.equal(STORAGE_KEY, 'shanghai-visits-v1');
  const assets = sw.match(/const ASSETS = \[([\s\S]*?)\]/)[1];
  for (const file of ['./shanghai/', './shanghai/index.html', './shanghai/guide.js']) assert(assets.includes(`'${file}'`), file);
  assert(sw.includes('CHECK_SHANGHAI_CACHE') && js.includes('CHECK_SHANGHAI_CACHE'));
  assert(js.includes(`'${sw.match(/const CACHE = '([^']+)'/)[1]}'`));
});
