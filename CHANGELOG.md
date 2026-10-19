# Changes

## 1.3.0

Search page:

- **An organic treemap**, now the default map. Each topic is a convex cell of
  a weighted power diagram whose area is its share of the records, the
  weights solved by Newton's method and the sites relaxed towards their
  cells' centroids, which rounds the cells into organic shapes (Voronoi
  treemaps, after Balzer and Deussen). Subtopics, once known, are cells
  inside their topic's cell; a topic without subtopics shows one dot per
  record, and a group too small to split shows its records as a honeycomb.
  Shapes morph from one zoom level to the next, each subtopic growing from
  the place it had inside its topic. Should a power diagram not resolve, the
  map falls back on squarified rectangles.
- **Florets**: the fourth map shows a head of broccoli from above. Each topic
  is a floret on a stem from the centre and each record a bud on Vogel's
  sunflower spiral. Links and saved settings that name the map's old id
  (`umbel`) open it.
- **New colours**: eight matte hues in a fixed order (blue, apricot, teal,
  lavender, sage, rose, sky, sand), made for a white surface and a
  near-black one. Each hue has tiers computed in OKLCH: a soft fill, a
  lighter top for its gradient, an edge for outlines, a dark ink of the same
  hue for the names on it (at least 6.9:1 on the eight fills) and a stronger
  mark for small marks such as beads, buds and the swatches beside topic
  names. Beyond eight topics the hues return a step darker, then a step
  lighter.
- The filters are part of a shared link (`f=`, when they differ from the
  defaults), so a link finds the same records anywhere, and changing them
  through the address fetches again.
- A new look for the page itself, in Broccoli's greens.

Library:

- The presets are `default` and `abstracts`.
- The maps' font can be set with `window.BroccoliFont`, and
  `BroccoliViews.voronoiTreemap()` lays out cells in any convex polygon.
- Comments and parameter descriptions were rewritten to describe what the
  code does, and the notices credit the papers each part is built on.

## 1.2.0

Search page:

- The map spans the full width of the results and is as tall as the screen
  allows. The topic list and the records moved below it. A new button shows
  the map on the whole screen; Escape or the button brings the page back.
- **Bubbles**, rebuilt: topics are packed to fill the whole map instead of
  one big circle, so they are much larger, with softly lit colours and
  shadows. Beads along the bottom of a bubble show its subtopics in their own
  colours. Zooming into a bubble turns it into the background while its
  subtopics spread out of it over the map; zooming out reverses it. A topic
  too small to split shows its records as bubbles titled with the articles.
  Click between the bubbles to zoom out.
- The map style switch slides between its buttons, and one canvas map
  dissolves into the next.
- Phones: the map runs edge to edge, the style switch fills the width (icons
  only below 345 pixels), the path above the map scrolls sideways, and
  nothing scrolls the page sideways down to 320 pixels. The map keeps its
  size while the address bar slides in and out.
- The florets map: larger florets and labels on large maps; a label that has
  no room beside its floret moves under or over it.
- Hatching on groups outside any topic is drawn as a pattern, which makes
  zooming smoother.

## 1.1.0

Search page:

- Three new maps next to the florets: **Bubbles** (topics as packed circles),
  **Treemap** (squarified tiles) and **Radial** (rings around the current
  group). They are drawn on a canvas and every change is animated: zooms
  follow a smooth path, and shapes grow, shrink and fade into place. The
  buttons above the map switch between them, and the choice is kept in the
  address.
- **Zoom and cluster again**: click a topic, on the map or in the list, and
  the map zooms into it while its records are clustered into subtopics. This
  works at every level, as deep as the records allow, and a group too small
  to split shows its records one by one. A second Web Worker clusters the
  topics you are likely to open next, so most zooms are instant. Zoom out
  with the path above the map, the Zoom out button, Escape or the browser's
  back button.
- New colours, checked for colour-blind separation and contrast in light and
  dark mode. Subtopics wear tints of their topic's hue, and groups outside
  any topic are grey and hatched.
- Keyboard on the map: the arrow keys move between topics, Enter zooms in,
  Escape zooms out. A screen reader hears each topic's name and size.
- The record list, the exports and the copied PMIDs follow the topic you
  zoomed into, at any level. The JSON export also saves every level of topics
  explored so far.
- The record list fills in while the browser is idle, so it never holds up an
  animation. "Show more" adds records below the list instead of redrawing it.

Library:

- Lingo has a new parameter, `clusterBuilder.labelGeneralization` (Broccoli's
  own addition, off by default). When a shorter phrase inside a cluster's
  label scores almost as well and covers at least twice the documents, the
  cluster takes the shorter label, so "Breast Cancer" is no longer lost to
  "Breast Cancer Screening". The `abstracts` preset turns it on at 0.85.
- The biomedical word list no longer lets generic study verbs ("treated",
  "randomized", "administered", "evaluated" and similar) become labels on
  their own.

## 1.0.0

First release: Lingo, STC and bisecting k-means in JavaScript, eight Snowball
stemmers, the PubMed E-utilities client, the Web Worker clusterer and the
search page with its map of florets.
