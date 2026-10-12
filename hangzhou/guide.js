/* Public family checklist. Only place IDs and visited flags leave this page. */
(function (root) {
  'use strict';
  const ENDPOINT = 'https://trips-sync.elcportal.workers.dev/hangzhou/state';
  const STORAGE_KEY = 'hangzhou-visits-v2';
  const LEGACY_STORAGE_KEY = 'hangzhou-visits-v1';
  const IDS = ['luckin', 'beishan', 'yanggong', 'guozhuang', 'haier', 'room', 'hefang-street', 'imperial', 'lingyin', 'yongfu', 'longjing', '2026-10-12-lingyin', '2026-10-12-yongfu', '2026-10-12-longjing', '2026-10-12-room', '2026-10-12-xiaohe', '2026-10-12-qiaoxi'];

  function createVisitSync({ storage, request, online, render = () => {}, status = () => {} }) {
    let visits = {}, pending = {}, acknowledged = {}, revision = 0, busy = null, storageOK = true, connected = false;
    const clean = value => Object.fromEntries(IDS.filter(id => value && value[id]).map(id => [id, 1]));
    function paintPending() {
      for (const [id, item] of Object.entries(pending)) {
        if (item.v) visits[id] = 1; else delete visits[id];
      }
    }
    function readSharedStorage(adoptVisits = false, initialRaw) {
      try {
        const raw = initialRaw === undefined ? storage.getItem(STORAGE_KEY) : initialRaw;
        const saved = JSON.parse(raw || '{}');
        if (adoptVisits && saved.visits) visits = clean(saved.visits);
        if (Number.isSafeInteger(saved.revision)) revision = Math.max(revision, saved.revision);
        for (const id of IDS) {
          const ack = saved.acknowledged && saved.acknowledged[id];
          if (Number.isSafeInteger(ack)) acknowledged[id] = Math.max(acknowledged[id] || 0, ack);
          const item = saved.pending && saved.pending[id];
          if (item && typeof item.v === 'boolean' && Number.isSafeInteger(item.rev)) {
            revision = Math.max(revision, item.rev);
            if (!pending[id] || item.rev > pending[id].rev) pending[id] = { v: item.v, rev: item.rev };
          }
          // Persisted acknowledgement revisions stop another tab resurrecting an older intent.
          if (pending[id] && pending[id].rev <= (acknowledged[id] || 0)) delete pending[id];
        }
        paintPending();
        return saved;
      } catch (_) { storageOK = false; return {}; }
    }
    // Snapshot v1 once; older open guides can keep writing v1 without truncating v2.
    let initialRaw;
    try {
      initialRaw = storage.getItem(STORAGE_KEY);
      if (initialRaw === null) {
        initialRaw = storage.getItem(LEGACY_STORAGE_KEY) || '{}';
        storage.setItem(STORAGE_KEY, initialRaw);
      }
    } catch (_) { storageOK = false; }
    readSharedStorage(true, initialRaw);
    function report() {
      if (!storageOK) status('Phone storage unavailable — visits may be lost on reload. Keep this page open.');
      else if (Object.keys(pending).length) status(online() ? 'Saved on this phone · sharing pending; retrying automatically.' : 'Saved on this phone · will share when connected.');
      else if (!online()) status('Saved on this phone · offline; shared updates need internet.');
      else status(connected ? 'Shared visits checked · updates may take time between phones.' : 'Saved on this phone · shared updates unavailable; retrying.');
    }
    function persist() {
      // Merge the latest stored pending edits before saving this tab's snapshot.
      readSharedStorage();
      try { storage.setItem(STORAGE_KEY, JSON.stringify({ visits, pending, acknowledged, revision })); storageOK = true; }
      catch (_) { storageOK = false; }
      render({ ...visits }); report();
    }
    function merge(remote, requestRevision) {
      if (!remote || typeof remote !== 'object' || Array.isArray(remote)) throw new Error('Invalid shared state');
      const saved = readSharedStorage();
      visits = clean(remote);
      // A different tab may complete an edit while this older request is in flight.
      for (const id of IDS) {
        const ack = saved.acknowledged && saved.acknowledged[id];
        if (Number.isSafeInteger(ack) && ack > requestRevision) {
          if (saved.visits && saved.visits[id]) visits[id] = 1; else delete visits[id];
        }
      }
      paintPending();
    }
    async function response(method, body) {
      const res = await request(ENDPOINT, { method, cache: 'no-store', ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}) });
      if (!res.ok) throw new Error('Shared update failed');
      const remote = await res.json();
      if (!remote || typeof remote !== 'object' || Array.isArray(remote)) throw new Error('Invalid shared state');
      return remote;
    }
    function flush() {
      if (busy) return busy;
      readSharedStorage(true);
      render({ ...visits });
      if (!online()) { report(); return Promise.resolve(); }
      // GET and POST share one queue. Pending local intent always overrides a remote read.
      busy = (async () => {
        try {
          const readRevision = revision;
          merge(await response('GET'), readRevision); connected = true; persist();
          while (online() && Object.keys(pending).length) {
            readSharedStorage();
            if (!Object.keys(pending).length) break;
            const id = Object.keys(pending)[0];
            const intent = { ...pending[id] };
            const remote = await response('POST', { id, v: intent.v ? 1 : 0 });
            // A later tap on this stop must survive this request's acknowledgement.
            acknowledged[id] = Math.max(acknowledged[id] || 0, intent.rev);
            if (pending[id] && pending[id].rev === intent.rev) delete pending[id];
            merge(remote, intent.rev); connected = true; persist();
          }
        } catch (_) { connected = false; report(); }
        finally { busy = null; }
      })();
      return busy;
    }
    function set(id, value) {
      if (!IDS.includes(id)) return;
      readSharedStorage(true);
      pending[id] = { v: !!value, rev: ++revision };
      if (value) visits[id] = 1; else delete visits[id];
      persist(); // Both the painted value and latest intent survive reload before any request.
      void flush();
    }
    render({ ...visits }); report();
    return { set, flush, snapshot: () => JSON.parse(JSON.stringify({ visits, pending, revision })) };
  }

  function createAreaNavigation({ areas, links, places = [], readHash, listen, readScroll = () => 0, route = () => {}, scroll = () => {} }) {
    const ids = areas.map(area => area.id);
    const aliases = { lake: 'earlier', neighbourhood: 'earlier', hefang: 'earlier', temple: 'earlier' };
    const fallback = ids[0];
    const positions = {};
    let selected = fallback, selectedPlace = null;
    function apply(move = false) {
      const hash = readHash().replace(/^#/, '');
      const place = places.find(item => item.id === hash);
      const id = place ? place.area : ids.includes(hash) ? hash : ids.includes(aliases[hash]) ? aliases[hash] : hash === 'main' ? selected : fallback;
      const placeId = place ? place.id : hash === 'main' ? selectedPlace : null;
      if (move && !selectedPlace) positions[selected] = readScroll();
      const returning = !!selectedPlace && !placeId;
      selected = id; selectedPlace = placeId;
      areas.forEach(area => { area.hidden = area.id !== id || !!placeId; });
      places.forEach(item => { item.hidden = item.id !== placeId; });
      links.forEach(link => {
        if (link.getAttribute('href') === `#${id}`) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
      route({ area: id, place: placeId });
      if (move) scroll(id, hash === 'main', placeId, returning ? positions[id] || 0 : 0);
      return id;
    }
    apply();
    listen(() => apply(true));
    return { apply };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { createVisitSync, createAreaNavigation, STORAGE_KEY, LEGACY_STORAGE_KEY, IDS };
  if (!root.document) return;
  const document = root.document;
  const navigation = document.querySelector('.section-nav');
  const placeViews = [...document.querySelectorAll('.place-view')];
  document.body.classList.add('enhanced');
  const sizeNavigation = () => {
    const dock = navigation.hidden ? placeViews.find(view => !view.hidden)?.querySelector('.actions') : navigation;
    if (dock) document.documentElement.style.setProperty('--nav-height', `${dock.getBoundingClientRect().height}px`);
  };
  root.addEventListener('resize', sizeNavigation);
  if (root.ResizeObserver) {
    const observer = new root.ResizeObserver(sizeNavigation);
    observer.observe(navigation);
    placeViews.forEach(view => observer.observe(view.querySelector('.actions')));
  }
  createAreaNavigation({
    areas: [...document.querySelectorAll('.chapter')],
    places: placeViews.map(view => ({ id: view.id, area: view.dataset.area, get hidden() { return view.hidden; }, set hidden(value) { view.hidden = value; } })),
    links: [...navigation.querySelectorAll('a')],
    readHash: () => root.location.hash,
    readScroll: () => root.scrollY,
    listen: callback => root.addEventListener('hashchange', callback),
    route: state => { navigation.hidden = !!state.place; sizeNavigation(); },
    scroll: (id, skipToMain, placeId, restoredPosition) => {
      document.getElementById('guide-info').open = false;
      const target = document.getElementById(skipToMain ? 'main' : placeId ? `${placeId}-title` : `${id}-title`);
      target.focus({ preventScroll: true });
      root.scrollTo({ top: skipToMain ? Math.max(0, target.offsetTop - 16) : placeId ? 0 : restoredPosition, behavior: 'instant' });
    }
  });
  const checkboxes = [...document.querySelectorAll('input[data-id]')];
  const sync = createVisitSync({
    storage: { getItem: key => root.localStorage.getItem(key), setItem: (key, value) => root.localStorage.setItem(key, value) },
    online: () => root.navigator.onLine !== false,
    request: async (url, options) => {
      const controller = new AbortController();
      const timeout = root.setTimeout(() => controller.abort(), 10000);
      try { return await root.fetch(url, { ...options, signal: controller.signal }); }
      finally { root.clearTimeout(timeout); }
    },
    render: visits => {
      checkboxes.forEach(cb => { cb.checked = !!visits[cb.dataset.id]; cb.closest('.place-card').classList.toggle('visited', cb.checked); });
      const count = Object.keys(visits).length;
      document.getElementById('visit-count').textContent = count ? `${count} ${count === 1 ? 'stop' : 'stops'} marked visited` : 'No stops marked visited';
    },
    status: text => {
      document.getElementById('sync-status').textContent = text;
    }
  });
  checkboxes.forEach(cb => { cb.disabled = false; cb.addEventListener('change', () => sync.set(cb.dataset.id, cb.checked)); });
  root.addEventListener('online', () => void sync.flush());
  root.addEventListener('offline', () => void sync.flush());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void sync.flush(); });
  root.setInterval(() => { if (!document.hidden) void sync.flush(); }, 5000);
  void sync.flush();

  const copyStatus = document.getElementById('copy-status');
  let copyTimer;
  document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
    const text = button.dataset.copy;
    const container = button.closest('.place-view')?.querySelector('.copy-fallback-slot') || button.closest('.reservation, .food-helper, .utility');
    const previous = container.querySelector('.manual-copy');
    try {
      if (!root.navigator.clipboard) throw new Error('Clipboard unavailable');
      await root.navigator.clipboard.writeText(text);
      if (previous) previous.remove();
      copyStatus.textContent = `Copied: ${text}`;
    } catch (_) {
      const fallback = previous || document.getElementById('manual-copy-template').content.firstElementChild.cloneNode(true);
      if (!previous) container.append(fallback);
      const area = fallback.querySelector('textarea');
      area.value = text; area.focus({ preventScroll: true }); area.select();
      fallback.scrollIntoView({ block: 'nearest' });
      copyStatus.textContent = 'Select the text here, then use Copy.';
    }
    root.clearTimeout(copyTimer);
    copyTimer = root.setTimeout(() => { copyStatus.textContent = ''; }, 5000);
  }));

  let installPrompt;
  const installButton = document.getElementById('install-button');
  root.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; installButton.hidden = false; });
  installButton.addEventListener('click', async () => {
    if (!installPrompt) return;
    await installPrompt.prompt(); await installPrompt.userChoice;
    installPrompt = null; installButton.hidden = true;
  });

  const offlineStatus = document.getElementById('offline-status');
  function offlineMessage(text) {
    offlineStatus.textContent = text;
    document.getElementById('offline-indicator').textContent = text.startsWith('Available offline') ? 'Guide saved offline' : text.startsWith('Checking') ? 'Checking offline save…' : 'Offline save not confirmed';
  }
  let cacheCheck = 0;
  async function confirmOffline() {
    const controller = root.navigator.serviceWorker.controller;
    if (!controller) return;
    const check = ++cacheCheck;
    try {
      const result = await new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        const timer = root.setTimeout(() => { channel.port1.close(); reject(new Error('No cache confirmation')); }, 5000);
        channel.port1.onmessage = event => { root.clearTimeout(timer); channel.port1.close(); resolve(event.data); };
        controller.postMessage({ type: 'CHECK_HANGZHOU_CACHE' }, [channel.port2]);
      });
      if (check !== cacheCheck) return;
      offlineMessage(result && result.cached && result.cache === 'trips-v7' ? 'Available offline · guide + photos saved.' : 'Offline guide not ready · connect and reload to save it.');
    } catch (_) { if (check === cacheCheck) offlineMessage('Offline availability unconfirmed · connect and reload.'); }
  }
  if ('serviceWorker' in root.navigator) {
    root.navigator.serviceWorker.addEventListener('controllerchange', () => void confirmOffline());
    root.navigator.serviceWorker.register('../sw.js').then(() => root.navigator.serviceWorker.ready).then(() => {
      offlineMessage('Offline availability unconfirmed · connect and reload.');
      return confirmOffline();
    }).catch(() => { offlineMessage('Offline guide unavailable in this browser.'); });
    void confirmOffline();
  } else offlineMessage('Offline guide unavailable in this browser.');
})(typeof window !== 'undefined' ? window : globalThis);
