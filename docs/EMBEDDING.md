<!-- SPDX-License-Identifier: MIT · Copyright (c) 2026 Decentralized Science Labs LLC -->
# Embedding Broccoli

Broccoli, GenesisL1's search results clustering engine, fits into a site in
three ways, from the least work to the most:

1. [Links that open a search](#links-that-open-a-search) on the search page.
2. [The search page in a frame](#the-search-page-in-a-frame) on a page of
   your own.
3. [The library on your page](#the-library-on-your-page), with your own
   interface, and if you like [the maps](#the-maps-on-your-page) too.

For the first two you need the search page on a web server;
[SELF-HOSTING.md](SELF-HOSTING.md) explains how to publish it. The examples
below assume it is at `/broccoli/` on your site.

## Links that open a search

The search page reads its search from the address, after `#`
([every parameter](SEARCH-PAGE.md#links-that-open-a-search)), so any link
can open a search and its map:

```html
<a href="/broccoli/#s=clinicaltrials&q=psilocybin+depression&f=recruiting">Recruiting psilocybin trials, as a map</a>
```

To turn your own search box into one that opens Broccoli:

```html
<form id="map-search">
  <input name="q" placeholder="Search PubMed" required>
  <button>Show as a map</button>
</form>
<script>
  document.getElementById('map-search').addEventListener('submit', function (e) {
    e.preventDefault();
    var q = new FormData(e.target).get('q');
    location.href = '/broccoli/#' + new URLSearchParams({ s: 'pubmed', q: q, v: 'treemap' });
  });
</script>
```

`URLSearchParams` encodes the query the way the page reads it. A link with a
query carries the whole search: what it leaves out is the default, not the
reader's own settings, so everyone who opens it gets the same records.

Links are the simplest way in, and the roomiest: the search page gets a
whole tab. [genesisl1.com/broccoli.html](https://genesisl1.com/broccoli.html)
works this way: its example searches and "Try" buttons open its copy of the
search page in a new tab (`target="_blank" rel="noopener"`), adding
`?theme=light` or `?theme=dark` when the reader picked a theme on the site.

## The search page in a frame

```html
<iframe src="/broccoli/?theme=light#s=preprints&q=protein+language+models"
        title="Broccoli: topic maps for search results"
        style="display: block; width: 100%; height: 85vh; border: 0"
        allow="clipboard-write" loading="lazy"></iframe>
```

- **Size.** The page fills its frame: the map takes the full width and as
  much of the height as the frame allows. Give the frame most of a screen's
  height; on phones, 85 to 90 percent of the viewport works well.
- **Theme.** The page follows the reader's saved setting, or the system.
  A page that frames it can set the theme for the visit without touching the
  reader's settings: with `?theme=light`, `dark` or `system` in the frame's
  address, or with a message from the framing page whenever its own theme
  changes:

  ```js
  var frame = document.querySelector('iframe');
  function broccoliTheme(theme) {   // 'light', 'dark' or 'system'
    frame.contentWindow.postMessage({ type: 'broccoli:theme', theme: theme }, '*');
  }
  frame.addEventListener('load', function () { broccoliTheme(document.documentElement.dataset.theme || 'system'); });
  ```

  The page accepts the message only from the window that frames it. A theme
  the reader picks in the page's settings wins until the framing page sends
  another.
- **Another search.** Set the frame's address to a new link, such as
  `frame.src = '/broccoli/?theme=light#s=arxiv&q=' + encodeURIComponent(q)`;
  the page reads the address and runs the search.
- **Permissions.** `allow="clipboard-write"` lets the Copy button work in the
  frame. Exports are downloads, and the record links open new tabs; if you
  add a `sandbox` attribute, allow both, along with scripts and the page's
  own storage: `sandbox="allow-scripts allow-same-origin allow-downloads
  allow-popups allow-popups-to-escape-sandbox"`.
- **Storage.** The page keeps its settings in the local storage of the site
  it is served from, so a frame from your own site shares them with the page
  opened directly there.
- **Links out of the frame.** Use `target="_top"` for links in your own copy
  of the page that should replace the framing page, as the page's GenesisL1
  links do.

If your site adds a cookie notice or analytics, keep them on the framing
page: let it ask and count, and leave the framed search page without a
notice of its own.

## The library on your page

The library is one script with no dependencies. Load it from your own copy
of `dist/`, or from jsDelivr, pinned to a release tag:

```html
<script src="https://cdn.jsdelivr.net/gh/GenesisL1/Broccoli@v1.5.1/dist/broccoli.js"></script>
```

```js
import * as Broccoli from 'https://cdn.jsdelivr.net/gh/GenesisL1/Broccoli@v1.5.1/dist/broccoli.mjs';
```

A file at a tag never changes, so you can add Subresource Integrity: compute
the hash of the file you load with
`openssl dgst -sha384 -binary broccoli.js | openssl base64 -A` and put it in
`integrity="sha384-…" crossorigin="anonymous"`.

Search a source, cluster the records, and show the topics your way:

```html
<ul id="topics"></ul>
<script src="https://cdn.jsdelivr.net/gh/GenesisL1/Broccoli@v1.5.1/dist/broccoli.js"></script>
<script>
  (async function () {
    var res = await Broccoli.searchSource('pubmed', 'senolytics healthy aging', { limit: 300 });
    var docs = Broccoli.toDocuments(res.records, { includeMesh: true });
    var clusterer = Broccoli.createClusterer();          // a Web Worker when possible
    var result = await clusterer.cluster(docs, { preset: 'abstracts', queryHint: res.query, fields: ['title', 'abstract', 'terms'] });
    document.getElementById('topics').innerHTML = result.clusters.map(function (c) {
      return '<li>' + Broccoli.escapeHtml(c.label) + ' (' + c.size + ')</li>';
    }).join('');
  })();
</script>
```

- `searchSource` keeps to the source's rate limit, retries, and reports
  progress through `onProgress(done, total)`; pass an `AbortSignal` as
  `signal` to cancel. [SOURCES.md](SOURCES.md) describes every source and
  how to add your own.
- `createClusterer()` starts its worker from the library's own code, so it
  needs no extra file and works from a CDN and on `file://` pages. Under a
  Content Security Policy, allow `worker-src blob:`; without it the clusterer
  runs on the page's own thread instead (`clusterer.mode` says which).
- `cluster(documents, options)` also runs directly, on the page's thread,
  for small sets. The README lists its options and its result.
- The exports (`toRis`, `toBibtex`, `toCsv`, `toJson`) take records from any
  source.

The single-file build also loads as a CommonJS module, and `searchSource`
works anywhere `fetch` does; there, the `arxiv-api` source reads arXiv's own
API without a proxy.

## The maps on your page

The search page's maps are plain scripts too, and
[`examples/map.html`](../examples/map.html) is a complete page that clusters
36 search results and draws them, with zooming. It loads, in order:

```html
<script src="dist/broccoli.js"></script>
<script src="app/colors.js"></script>   <!-- BroccoliColors: the palette, light and dark -->
<script src="app/views.js"></script>    <!-- BroccoliViews: the treemap, bubbles and radial maps -->
```

`app/florets.js` (`BroccoliFlorets`) draws the florets map in SVG; the
search page shows how to use it.

`BroccoliViews.create(stage, options)` adds a canvas to `stage`, an element
with `position: relative`, and returns the map. The options are:

| Option | Meaning |
|---|---|
| `height(width)` | the map's height for a width, in CSS pixels |
| `unit` | what a record is called in the map's labels and tooltips (`'record'`) |
| `onFocus(node)` | the reader clicked a topic, or pressed Enter on it |
| `onUp()` | the reader asked to zoom out: Escape, or a click on the background |
| `onRecord(doc, node)` | the reader clicked a record of a topic too small to split |
| `recordInfo(doc)` | `{ title, meta }` for a record's tooltip and shape |

The map takes a **tree of topics**. Each node is
`{ id, parent, depth, index, label, other, size, docs, children, status }`:
`docs` are indices into your documents, `other` marks the records no topic
took, and `status` is `'idle'` (not clustered yet), `'pending'` (being
clustered), `'ready'` (it has `children`) or `'leaf'` (too few records to
split: the map shows them one by one). The map's methods:

| Method | Does |
|---|---|
| `setData(root, focus, { animate })` | shows a new tree, focused on one of its nodes |
| `setFocus(node, { animate })` | zooms to a node |
| `update()` | redraws after nodes changed, such as a topic's children arriving |
| `setView(view)` | `'treemap'`, `'bubbles'` or `'radial'` |
| `refresh()` | the stage's size or the page's theme changed |
| `focusCanvas()` | moves the keyboard focus to the map |

The map reads the theme from `data-theme` on the page's root element, or
from the system when there is none; call `refresh()` when it changes. The
labels use Inter when the page has it, or the system's sans serif; set
`window.BroccoliFont` before loading `views.js` to choose another. The canvas, its tooltip (`.views-tip`) and a hidden live region
for screen readers (`.visually-hidden`) need a few lines of CSS, which
`examples/map.html` has.

`app/app.js` is the full example: how the search page builds the tree,
clusters a topic's records when it is opened and ahead of time in a second
worker, and keeps the map, the topic list and the address in step.
