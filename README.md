# trips — trips.trevorcardozo.com

Family trip plans as installable web pages. Static HTML, one shared `styles.css`, no build step, no framework, no external requests. Not indexed (`noindex` meta + `robots.txt`), shared by link only.

## Structure

```
index.html            trip list
ile-dorleans/         Île d'Orléans + Sainte-Anne-de-Beaupré day loop (summer 2026)
styles.css            shared design (wine/cream print-guide register)
sw.js                 offline cache (bump CACHE version when content changes)
manifest.webmanifest  PWA — Add to Home Screen works on iOS/Android
icons/                generated PNGs
CNAME                 trips.trevorcardozo.com (GitHub Pages)
```

## Adding a trip

1. New folder `<trip-slug>/index.html` (copy an existing trip page, keep the `noindex` meta and relative links).
2. Card on `index.html`.
3. Add the folder's paths to `ASSETS` in `sw.js` and bump `CACHE`.

## Deploy

GitHub Pages from `main`, root. Porkbun DNS: CNAME `trips` → `tr3v0r86.github.io` (mirrors the `trevorcardozo-site` pattern).
