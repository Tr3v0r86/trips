# trips — trips.trevorcardozo.com

Family trip plans as installable web pages. Static HTML, one shared `styles.css`, no build step, no framework. Not indexed (`noindex` meta + `robots.txt`), shared by link only. One folder = one trip.

## Structure

```
index.html            trip list (one card per trip)
ile-dorleans/         Île d'Orléans + Sainte-Anne-de-Beaupré day loop (summer 2026)
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

## Deploy

GitHub Pages from `main`, root. DNS: Porkbun CNAME `trips` → `tr3v0r86.github.io`, HTTPS enforced.

## Design rules (keep)

- Family incl. 70/80-year-olds: body ≥17px, every tap target ≥44px, high contrast, works one-handed in a car.
- No times in itineraries — order + check-off, not schedule.
- `[hidden]{display:none!important}` stays in styles.css (the `.btn` class otherwise overrides the hidden attribute).
- Each stop: why/do · hours · access · Maps button · collapsible story.
