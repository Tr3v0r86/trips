'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createVisitSync, STORAGE_KEY, IDS } = require('../hangzhou/guide.js');
const response = state => ({ ok: true, json: async () => ({ ...state }) });
function memory() {
  const data = new Map();
  return { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
}
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
const tick = () => new Promise(resolve => setImmediate(resolve));

test('offline taps persist latest flags and pending intents; reload/reconnect flushes them', async () => {
  const storage = memory(); let connected = false, remote = {}, calls = 0;
  const request = async (_, options) => { calls++; if (options.method === 'POST') { const { id, v } = JSON.parse(options.body); if (v) remote[id] = 1; else delete remote[id]; } return response(remote); };
  let client = createVisitSync({ storage, request, online: () => connected });
  client.set('beishan', true); client.set('room', true); client.set('room', false);
  assert.equal(calls, 0);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).pending.room.v, false);
  client = createVisitSync({ storage, request, online: () => connected });
  assert.deepEqual(client.snapshot().visits, { beishan: 1 });
  connected = true; await client.flush();
  assert.deepEqual(remote, { beishan: 1 }); assert.deepEqual(client.snapshot().pending, {});
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY)).pending, {});
});

test('newer tap during in-flight POST survives older acknowledgement; one queue only', async () => {
  const post = deferred(); let posts = 0, active = 0, peak = 0, remote = {};
  const client = createVisitSync({ storage: memory(), online: () => true, request: async (_, options) => {
    active++; peak = Math.max(peak, active);
    if (options.method === 'POST') {
      posts++; const { id, v } = JSON.parse(options.body);
      if (posts === 1) await post.promise;
      if (v) remote[id] = 1; else delete remote[id];
    }
    active--; return response(remote);
  } });
  client.set('luckin', true); await tick();
  client.set('luckin', false); client.set('luckin', true); client.set('luckin', false);
  assert.equal(client.snapshot().pending.luckin.v, false);
  post.resolve(); await client.flush();
  assert.equal(posts, 2); assert.equal(peak, 1);
  assert.deepEqual(client.snapshot().visits, {}); assert.deepEqual(client.snapshot().pending, {});
});

test('failed POST retains intent across reload and succeeds on retry', async () => {
  const storage = memory(); let fail = true, remote = {}, lastStatus;
  const request = async (_, options) => {
    if (options.method === 'POST') { if (fail) throw new Error('network'); const { id, v } = JSON.parse(options.body); if (v) remote[id] = 1; }
    return response(remote);
  };
  let client = createVisitSync({ storage, request, online: () => true, status: text => { lastStatus = text; } });
  client.set('yongfu', true); await client.flush();
  assert.equal(client.snapshot().pending.yongfu.v, true); assert.match(lastStatus, /sharing pending/);
  client = createVisitSync({ storage, request, online: () => true }); fail = false; await client.flush();
  assert.equal(remote.yongfu, 1); assert.deepEqual(client.snapshot().pending, {});
});

test('stale GET cannot overwrite a pending edit made during the read', async () => {
  const get = deferred(); let remote = { beishan: 1 };
  const client = createVisitSync({ storage: memory(), online: () => true, request: async (_, options) => {
    if (options.method === 'GET') return get.promise;
    const { id, v } = JSON.parse(options.body); if (v) remote[id] = 1; else delete remote[id]; return response(remote);
  } });
  const flush = client.flush(); client.set('beishan', false); client.set('longjing', true);
  get.resolve(response({ beishan: 1 })); await flush;
  assert.deepEqual(client.snapshot().visits, { longjing: 1 });
});

test('remote changes reach this phone when no local intent is pending', async () => {
  let remote = { imperial: 1 };
  const client = createVisitSync({ storage: memory(), online: () => true, request: async () => response(remote) });
  await client.flush(); assert.deepEqual(client.snapshot().visits, remote);
  remote = { room: 1 }; await client.flush(); assert.deepEqual(client.snapshot().visits, remote);
});

test('storage errors preserve in-memory taps and truthfully report reload risk', async () => {
  let text;
  const client = createVisitSync({ storage: { getItem() { throw Error('blocked'); }, setItem() { throw Error('full'); } }, online: () => false, request: async () => { throw Error('must not call'); }, status: value => { text = value; } });
  client.set('guozhuang', true);
  assert.equal(client.snapshot().visits.guozhuang, 1); assert.equal(client.snapshot().pending.guozhuang.v, true);
  assert.match(text, /may be lost on reload/);
});

test('HTTP failures and malformed responses preserve pending intent', async () => {
  for (const res of [{ ok: false }, { ok: true, json: async () => [] }]) {
    const client = createVisitSync({ storage: memory(), online: () => true, request: async () => res });
    client.set('lingyin', true); await client.flush(); assert.equal(client.snapshot().pending.lingyin.v, true);
  }
});

test('active v6 worker confirms complete guide cache and rejects missing images', async () => {
  let callbacks = {}, missing = false, assets;
  const context = {
    URL, Promise,
    caches: { open: async () => ({ match: async path => missing && path.endsWith('lingyin.jpg') ? undefined : {}, addAll: async paths => { assets = paths; } }) },
    self: { location: { origin: 'https://example.com' }, addEventListener: (type, callback) => { callbacks[type] = callback; }, skipWaiting: async () => {} }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../sw.js'), 'utf8'), context);
  let operation; callbacks.install({ waitUntil: p => { operation = p; } }); await operation;
  assert(assets.includes('./hangzhou/')); assert(assets.includes('./hangzhou/index.html'));
  for (const incomplete of [false, true]) {
    missing = incomplete; let reply;
    callbacks.message({ data: { type: 'CHECK_HANGZHOU_CACHE' }, ports: [{ postMessage: value => { reply = value; } }], waitUntil: p => { operation = p; } });
    await operation; assert.equal(reply.cache, 'trips-v6'); assert.equal(reply.cached, !incomplete);
  }
  let intercepted = false;
  callbacks.fetch({ request: { method: 'GET', url: 'https://trips-sync.elcportal.workers.dev/hangzhou/state' }, respondWith: () => { intercepted = true; } });
  assert.equal(intercepted, false);
});

test('public markup has exactly the supported IDs, four native anchors and encoded Amap queries', () => {
  const html = fs.readFileSync(require.resolve('../hangzhou/index.html'), 'utf8');
  assert.deepEqual([...html.matchAll(/data-id="([^"]+)"/g)].map(match => match[1]), IDS);
  for (const section of ['lake', 'neighbourhood', 'hefang', 'temple']) assert(html.includes(`href="#${section}"`) && html.includes(`id="${section}"`));
  const maps = [...html.matchAll(/href="(https:\/\/uri.amap.com\/search[^\"]+)"/g)];
  assert.equal(maps.length, 11);
  for (const [, href] of maps) { const url = new URL(href.replaceAll('&amp;', '&')); assert.equal(url.searchParams.get('city'), '杭州'); assert(url.searchParams.get('keyword')); }
  assert.equal([...html.matchAll(/<img /g)].length, 3);
  assert(html.includes('UNBOOKED / UNVERIFIED'));
});

test('two offline tabs preserve each other’s latest edits through saves, polls and reload', async () => {
  const storage = memory(); let connected = false;
  const blockedPost = async (_, options) => {
    if (options.method === 'POST') throw Error('network unavailable');
    return response({});
  };
  const options = { storage, online: () => connected, request: blockedPost };
  const first = createVisitSync(options), second = createVisitSync(options);
  first.set('beishan', true); second.set('hefang-street', true);
  let reload = createVisitSync(options);
  assert.deepEqual(reload.snapshot().visits, { beishan: 1, 'hefang-street': 1 });
  // A background read from either old tab must retain both pending writes.
  connected = true; await first.flush(); await second.flush();
  reload = createVisitSync(options);
  assert.deepEqual(reload.snapshot().visits, { beishan: 1, 'hefang-street': 1 });
  assert.equal(Object.keys(reload.snapshot().pending).length, 2);
  connected = false;
  first.set('beishan', false); second.set('beishan', true); first.set('room', true);
  reload = createVisitSync(options);
  assert.equal(reload.snapshot().visits.beishan, 1);
  assert.equal(reload.snapshot().pending.beishan.v, true);
  assert.equal(reload.snapshot().visits.room, 1);
});

test('a tab’s acknowledgements prevent an older tab resending completed pending edits', async () => {
  const storage = memory(); let connected = false, remote = {}, posts = 0;
  const request = async (_, options) => {
    if (options.method === 'POST') { posts++; const { id, v } = JSON.parse(options.body); if (v) remote[id] = 1; else delete remote[id]; }
    return response(remote);
  };
  const options = { storage, online: () => connected, request };
  const first = createVisitSync(options), second = createVisitSync(options);
  first.set('beishan', true); second.set('hefang-street', true);
  connected = true; await second.flush(); await first.flush();
  assert.equal(posts, 2);
  assert.deepEqual(first.snapshot().pending, {});
  assert.deepEqual(first.snapshot().visits, { beishan: 1, 'hefang-street': 1 });
});

test('an old GET cannot erase a newer edit acknowledged in another tab', async () => {
  const storage = memory(), oldRead = deferred(); let remote = {};
  const first = createVisitSync({ storage, online: () => true, request: async () => oldRead.promise });
  const read = first.flush();
  const second = createVisitSync({ storage, online: () => true, request: async (_, options) => {
    if (options.method === 'POST') { const { id, v } = JSON.parse(options.body); if (v) remote[id] = 1; else delete remote[id]; }
    return response(remote);
  } });
  second.set('beishan', true); await second.flush();
  oldRead.resolve(response({})); await read;
  assert.equal(first.snapshot().visits.beishan, 1);
  assert.equal(createVisitSync({ storage, online: () => false, request: async () => response({}) }).snapshot().visits.beishan, 1);
});

test('native area hashes select one area, keep current link, and follow back/forward and reload', () => {
  const { createAreaNavigation } = require('../hangzhou/guide.js');
  const ids = ['lake', 'neighbourhood', 'hefang', 'temple'];
  const areas = ids.map(id => ({ id, hidden: false }));
  const links = ids.map(id => ({ values: { href: `#${id}` }, getAttribute(key) { return this.values[key]; }, setAttribute(key, value) { this.values[key] = value; }, removeAttribute(key) { delete this.values[key]; } }));
  let hash = '', onHashChange, scrolled, skipped;
  createAreaNavigation({ areas, links, readHash: () => hash, listen: callback => { onHashChange = callback; }, scroll: (id, skipToMain) => { scrolled = id; skipped = skipToMain; } });
  function assertArea(id) {
    assert.deepEqual(areas.filter(area => !area.hidden).map(area => area.id), [id]);
    assert.deepEqual(links.filter(link => link.values['aria-current']).map(link => link.values.href), [`#${id}`]);
  }
  assertArea('lake');
  // The browser owns the history; hashchange drives each navigation, back and forward.
  for (const next of ['#hefang', '#temple', '#hefang', '#temple']) { hash = next; onHashChange(); assertArea(next.slice(1)); assert.equal(scrolled, next.slice(1)); }
  hash = '#main'; onHashChange(); assertArea('temple'); assert.equal(skipped, true);
  const initialSkipAreas = ids.map(id => ({ id, hidden: false }));
  createAreaNavigation({ areas: initialSkipAreas, links, readHash: () => '#main', listen: () => {} });
  assert.deepEqual(initialSkipAreas.filter(area => !area.hidden).map(area => area.id), ['lake']);
  const reloadAreas = ids.map(id => ({ id, hidden: false }));
  createAreaNavigation({ areas: reloadAreas, links, readHash: () => '#temple', listen: () => {} });
  assert.deepEqual(reloadAreas.filter(area => !area.hidden).map(area => area.id), ['temple']);
  hash = '#unknown'; onHashChange(); assertArea('lake');
});

test('no-JS markup keeps every picker and full place readable, with native anchors and secondary sources', () => {
  const html = fs.readFileSync(require.resolve('../hangzhou/index.html'), 'utf8');
  assert(!/<(?:section|article)[^>]+hidden/.test(html));
  assert(!html.includes('role="tab"'));
  assert(!html.includes('of 11 visited'));
  assert(!html.includes('class="hero"'));
  const lake = html.match(/<section id="lake".*?<\/section>/s)[0];
  assert(lake.indexOf('href="#place-luckin"') < lake.indexOf('<figure'));
  assert(lake.indexOf('Bikes: separate lanes only') < lake.indexOf('href="#place-luckin"'));
  for (const article of html.matchAll(/<article.*?<\/article>/gs)) {
    assert(article[0].includes('class="detail-body"'));
    assert(article[0].includes('class="visit"'));
    assert(article[0].includes('class="copy-fallback-slot"'));
    assert(article[0].includes('class="actions"'));
  }
  const css = fs.readFileSync(require.resolve('../hangzhou/guide.css'), 'utf8');
  assert(css.includes('.section-nav{position:fixed;bottom:0'));
  assert(css.includes('padding-bottom:env(safe-area-inset-bottom)'));
  assert(css.includes('.enhanced .place-view:not([hidden]) .actions{position:fixed'));
});

function routeFixture(initialHash = '') {
  const { createAreaNavigation } = require('../hangzhou/guide.js');
  const html = fs.readFileSync(require.resolve('../hangzhou/index.html'), 'utf8');
  const areaIDs = ['lake', 'neighbourhood', 'hefang', 'temple'];
  const areas = areaIDs.map(id => ({ id, hidden: false }));
  const places = [...html.matchAll(/<article id="([^"]+)"[^>]*data-area="([^"]+)"/g)].map(match => ({ id: match[1], area: match[2], hidden: false }));
  const links = areaIDs.map(id => ({ values: { href: `#${id}` }, getAttribute(key) { return this.values[key]; }, setAttribute(key, value) { this.values[key] = value; }, removeAttribute(key) { delete this.values[key]; } }));
  let hash = initialHash, change, position = 0, lastScroll, route;
  createAreaNavigation({ areas, places, links, readHash: () => hash, listen: callback => { change = callback; }, readScroll: () => position, route: value => { route = value; }, scroll: (...args) => { lastScroll = args; } });
  return { areas, places, links, get route() { return route; }, get lastScroll() { return lastScroll; }, go(next, scrollY = 0) { position = scrollY; hash = next; change(); } };
}

test('every place opens alone with its owning area and correct native map/copy actions', () => {
  const html = fs.readFileSync(require.resolve('../hangzhou/index.html'), 'utf8');
  const fixture = routeFixture();
  assert.equal(fixture.places.length, IDS.length);
  for (const place of fixture.places) {
    fixture.go(`#${place.id}`, 80);
    assert.deepEqual(fixture.places.filter(item => !item.hidden).map(item => item.id), [place.id]);
    assert(fixture.areas.every(area => area.hidden));
    assert.deepEqual(fixture.route, { area: place.area, place: place.id });
    const body = html.match(new RegExp(`<article id="${place.id}"[\\s\\S]*?</article>`))[0];
    assert(body.includes(`href="#${place.area}"`));
    assert(body.includes('https://uri.amap.com/search?keyword='));
    assert(body.includes('data-copy="'));
    assert.equal([...body.matchAll(/type="checkbox"/g)].length, 1);
    assert.equal([...body.matchAll(/https:\/\/uri.amap.com\/search/g)].length, 1);
  }
});

test('detail back restores the picker scroll, history changes keep ownership, and direct/reloaded places are safe', () => {
  const fixture = routeFixture('#hefang');
  fixture.go('#place-imperial', 164);
  assert.deepEqual(fixture.route, { area: 'hefang', place: 'place-imperial' });
  fixture.go('#hefang');
  assert.equal(fixture.lastScroll[3], 164);
  assert.deepEqual(fixture.areas.filter(area => !area.hidden).map(area => area.id), ['hefang']);
  fixture.go('#place-imperial'); // browser Forward
  assert.deepEqual(fixture.places.filter(place => !place.hidden).map(place => place.id), ['place-imperial']);
  fixture.go('#main'); assert.equal(fixture.route.place, 'place-imperial');
  for (const id of IDS) {
    const direct = routeFixture(`#place-${id}`);
    const selected = direct.places.find(place => !place.hidden);
    assert.equal(selected.id, `place-${id}`);
    direct.go(`#${selected.area}`); // contextual Back has a valid owner even without prior history
    assert.equal(direct.route.place, null);
    assert.equal(direct.route.area, selected.area);
    assert.equal(direct.lastScroll[3], 0);
  }
  fixture.go('#place-unknown'); assert.deepEqual(fixture.route, { area: 'lake', place: null });
});
