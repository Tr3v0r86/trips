# trips — trips.trevorcardozo.com

Family trip plans as installable web pages. Static HTML, one shared `styles.css`, no build step, no framework. Not indexed (`noindex` meta + `robots.txt`), shared by link only. One folder = one trip.

## Structure

```
index.html            trip list (one card per trip)
ile-dorleans/         Île d'Orléans + Sainte-Anne-de-Beaupré day loop (summer 2026)
hangzhou/             Hangzhou lake, neighbourhood, Hefang and Lingyin guide (October 2026)
styles.css            shared design (wine/cream print-guide register, 44px+ touch targets)
sw.js                 offline cache — bump CACHE version on ANY content change
manifest.webmanifest  PWA — Add to Home Screen works on iOS/Android
icons/                generated PNGs
sync-worker/          Cloudflare Worker + KV: shared live checklist state
CNAME                 trips.trevorcardozo.com (GitHub Pages custom domain)
```

## Adding a trip

1. New folder `<trip-slug>/index.html` — copy `ile-dorleans/index.html`, keep: `noindex` meta, relative links (`../styles.css`, `../sw.js`), the install-prompt block, the sync script.
2. In the sync script, change the endpoint path to the new slug: `https://trips-sync.elcportal.workers.dev/<trip-slug>/state` and the localStorage prefix (`iodo-` → `<slug>-`). The worker namespaces state per slug automatically — no worker redeploy needed.
3. Give each stop card a `data-stop` + checkbox `data-id` (unique within the trip).
4. Add a card to root `index.html`.
5. Add `./<trip-slug>/` + `./<trip-slug>/index.html` to `ASSETS` in `sw.js` and bump `CACHE` (`trips-vN+1`).
6. Commit, push — GitHub Pages deploys `main` automatically (~30s). If the build never starts: `gh api -X POST repos/Tr3v0r86/trips/pages/builds`.

## Sync worker

`sync-worker/worker.js` — GET/POST `/<trip>/state`, state = `{stopId: 1}` JSON per trip in KV. Deploy: `cd sync-worker && npx wrangler deploy` (Cloudflare account: trevorc@elc.ac.th / elcportal.workers.dev, KV namespace `TRIPS`). Clients are offline-first: localStorage paints instantly, worker polled every 5s. Fresh deploys can 1042 for ~60s (workers.dev propagation) — wait, don't debug.

Hangzhou persists visited flags and the latest pending intent together before sending. The dated guide uses `hangzhou-visits-v2`; it copies the v1 snapshot once only when v2 is absent. Existing v1 tabs can continue writing their old key without erasing current pending edits. Later v1 changes are not imported again; shared remote state still uses the same Hangzhou endpoint. Tabs merge current stored intents synchronously before writing; shared acknowledgement revisions prevent an older tab from restoring a completed intent. One queue per tab reads shared state and sends pending changes; only the matching local revision is acknowledged, so a newer tap survives an earlier request. Pending edits retry on reconnect, visibility and every 5s while visible. Storage/network failures are shown in the guide. The existing KV worker is eventually consistent and has a read/modify/write race. Simultaneous edits in multiple tabs or devices can arrive out of order; the client preserves pending offline edits but cannot guarantee instant agreement between phones.

Hangzhou offline readiness is confirmed by a message from the active v7 service worker checking every guide/photo cache entry. Maps, booking mini-programs and shared updates require internet. Image sources/licenses are shown next to each photograph and recorded in `hangzhou/images/credits.md`.

The Hangzhou guide uses three authored date hashes: `#today` (Mon 12 Oct), `#earlier` (Sun 11 Oct), and `#tomorrow` (Tue 13 Oct). These dates do not advance with the device clock. The previous four area hashes route to Earlier; all eleven original place IDs and their stored marks/pending edits are preserved. Six new `2026-10-12-*` IDs keep today’s visits separate; no earlier tick is migrated. JavaScript shows either a grouped place picker or one full place view; contextual Back returns to its owning picker and restores scroll. Direct place URLs and browser history work without a router dependency. Without JavaScript, all pickers and full place content remain readable. The active place’s original Amap/copy actions form its bottom dock, replacing the area navigation. Sources and whole credited reference photos use native disclosures; copy failure reveals selectable text in the detail body above the dock.

Run the mocked sync, navigation and cache-contract checks with `node --test tests/hangzhou.test.cjs`. They never call the production worker.

## Deploy

GitHub Pages from `main`, root. DNS: Porkbun CNAME `trips` → `tr3v0r86.github.io`, HTTPS enforced.

## Design rules (keep)

- Family incl. 70/80-year-olds: body ≥17px, every tap target ≥44px, high contrast, works one-handed in a car.
- No times in itineraries — order + check-off, not schedule.
- `[hidden]{display:none!important}` stays in styles.css (the `.btn` class otherwise overrides the hidden attribute).
- Each stop: why/do · hours · access · Maps button · collapsible story.
