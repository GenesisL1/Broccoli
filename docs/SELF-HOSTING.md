<!-- SPDX-License-Identifier: MIT · Copyright (c) 2026 Decentralized Science Labs LLC -->
# Self-hosting

The search page of Broccoli, GenesisL1's search results clustering engine,
is a static page: a few files that any web server, static host or IPFS
gateway can serve. There is no server-side code to run and nothing to build.
The visitors' browsers call the search APIs directly, and none of them needs
a key. genesisl1.com serves it this way at
[genesisl1.com/broccoli/search/](https://genesisl1.com/broccoli/search/).

- [What to publish](#what-to-publish)
- [Static hosts](#static-hosts)
- [nginx](#nginx)
- [Caching and updates](#caching-and-updates)
- [Content Security Policy](#content-security-policy)
- [The E-utilities proxy](#the-e-utilities-proxy)
- [A proxy for arXiv's API](#a-proxy-for-arxivs-api)
- [Versions](#versions)

## What to publish

| Path | Needed | What it is |
|---|---|---|
| `index.html` | yes | the search page |
| `app/` | yes | its script, styles, colours, maps and fonts |
| `dist/broccoli.js` | yes | the library, which the page loads |
| `LICENSE` | yes | the MIT License, which asks to keep the notice with copies |
| `dist/broccoli.mjs` | no | the library as an ES module, for your own pages |
| `server/eutils-proxy.php` | no | the [E-utilities proxy](#the-e-utilities-proxy), on a server with PHP |
| `examples/` | no | small example pages (their inline scripts need a looser policy than the [one below](#content-security-policy)) |

`src/`, `tests/`, `tools/` and `docs/` are for development. All the page's
addresses are relative, so it works in any folder of a site, such as
`/broccoli/`.

```sh
mkdir -p /var/www/broccoli/dist
cp -r index.html app LICENSE /var/www/broccoli/
cp dist/broccoli.js dist/broccoli.mjs /var/www/broccoli/dist/
```

## Static hosts

- **GitHub Pages.** In a fork's Settings, Pages, deploy from the `main`
  branch and the root folder. The page is then served at
  `https://<owner>.github.io/Broccoli/`.
- **Netlify, Cloudflare Pages, S3 and the like.** Upload the files above, or
  point the host at the repository with no build command and the root as
  the folder to publish.
- **IPFS.** Add the folder and open it through any gateway. The relative
  addresses work under a gateway's path, and the state of a search lives
  after `#` in the address, which never reaches the gateway.
- **From disk.** `index.html` opened from a folder works too; only Chrome
  blocks the page's own fonts on `file://` pages and uses system fonts.

## nginx

A complete server block for the page on its own host name. It serves only
the files, sends the security headers described below, and tells browsers
to check the page's code on each visit:

```nginx
server {
    listen 80;
    server_name broccoli.example.org;
    root /var/www/broccoli;
    index index.html;
    charset utf-8;

    # The search page calls the sources' APIs from the browser: only they may be reached.
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; worker-src blob:; connect-src https://eutils.ncbi.nlm.nih.gov https://www.ebi.ac.uk https://clinicaltrials.gov https://api.openalex.org https://api.crossref.org https://doaj.org https://api.datacite.org https://inspirehep.net https://*.wikipedia.org; frame-ancestors 'self'; base-uri 'none'; form-action 'self'" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location / {
        try_files $uri $uri/ =404;
        expires -1;                      # Cache-Control: no-cache; browsers revalidate
    }
    location /app/fonts/ {
        expires 30d;
    }
    location ~ \.mjs$ {
        default_type text/javascript;    # ES modules need a JavaScript type
        expires -1;
    }
}
```

Add TLS the way you do for your other sites (with Certbot, for example),
and reload with `nginx -t && systemctl reload nginx`.

Notes:

- `expires` sets `Cache-Control` without an `add_header` of its own, so the
  security headers of the `server` block still apply in every `location`.
  An `add_header` inside a `location` would replace them all there.
- Older versions of nginx, 1.24 among them, have no `.mjs` in their list of
  types; the last `location` gives ES modules the type browsers require.
- The page is at the root of the host here. For a folder of a larger site,
  copy the files into that folder (`/var/www/html/broccoli/`) and put the
  same headers and `expires` lines in a `location /broccoli/` block.
- To let other sites show the page in a frame, list them in
  `frame-ancestors` (`frame-ancestors 'self' https://partner.example`).

## Caching and updates

`index.html`, the scripts in `app/` and `dist/broccoli.js` belong together:
a new version changes them at once. Serve them so browsers revalidate on
each visit (`Cache-Control: no-cache`, as above); with ETags or modification
dates, an unchanged file costs a `304` answer and no download. The fonts in
`app/fonts/` rarely change and can be cached for weeks.

When you update, copy all of `index.html`, `app/` and `dist/` together, and
keep `LICENSE`.

## Content Security Policy

The policy in the nginx example allows exactly what the page uses:

| Directive | Why |
|---|---|
| `default-src 'self'` | everything else comes from your own site |
| `script-src 'self'` | the page has no inline scripts and uses no `eval` |
| `style-src 'self' 'unsafe-inline'` | the page sets colours on elements with inline styles (the topic swatches) |
| `img-src 'self' data:` | the page's icon is a `data:` image |
| `font-src 'self'` | the fonts are bundled in `app/fonts/` |
| `worker-src blob:` | the clustering worker starts from the library's own code, as a `blob:` script; without it the page clusters on its main thread, more slowly |
| `connect-src …` | the APIs of the built-in sources, below |
| `frame-ancestors 'self'` | who may show the page in a frame |
| `base-uri 'none'; form-action 'self'` | hardening |

The sources' addresses:

| Source | Address |
|---|---|
| PubMed | `https://eutils.ncbi.nlm.nih.gov` |
| Europe PMC, Preprints | `https://www.ebi.ac.uk` |
| ClinicalTrials.gov | `https://clinicaltrials.gov` |
| OpenAlex, arXiv | `https://api.openalex.org` |
| Crossref | `https://api.crossref.org` |
| DOAJ | `https://doaj.org` |
| DataCite | `https://api.datacite.org` |
| INSPIRE-HEP | `https://inspirehep.net` |
| Wikipedia | `https://*.wikipedia.org` (one host for each language) |

Add the address of any source you register yourself, and `'self'` (or the
proxy's address) if you use a proxy.

## The E-utilities proxy

You do not need a proxy: the page talks to NCBI directly, at NCBI's rate for
callers without a key (three requests a second for each visitor). The proxy,
`server/eutils-proxy.php`, helps when you want

- every visitor to get NCBI's higher limit, with one NCBI API key that stays
  on your server, or
- to serve visitors whose networks block requests to NCBI.

It forwards only the E-utilities and databases on its allow list, adds your
key on the server (a key sent by a browser is ignored) and removes it from
NCBI's error messages, spaces the requests of all visitors to stay within
NCBI's limit (a request that would wait more than 10 seconds gets HTTP 429,
which the page retries), and by default answers only pages of its own site.

**Setup** (PHP 7.4 or newer, with the curl extension or `allow_url_fopen`):

1. Copy `server/eutils-proxy.php` to your server, next to the page or
   elsewhere.
2. Set the options at the top of the file, or the matching environment
   variables:

   | Option | Default | Meaning |
   |---|---|---|
   | `BROCCOLI_API_KEY` | none | your NCBI API key, from your [NCBI account settings](https://www.ncbi.nlm.nih.gov/account/settings/) |
   | `BROCCOLI_EMAIL` | none | a contact e-mail sent to NCBI, as its usage policy asks |
   | `BROCCOLI_TOOL` | `broccoli` | the tool name sent to NCBI |
   | `BROCCOLI_ALLOWED_ORIGINS` | `self` | pages that may use the proxy: `self`, a list of origins such as `https://example.org`, or `*` for any site |
   | `BROCCOLI_RATE` | 9 with a key, 3 without | requests a second for the whole server |
   | `BROCCOLI_UPSTREAM` | NCBI | the upstream address (change only for testing) |

3. With nginx and PHP-FPM, pass the file to PHP (the socket's name depends
   on your PHP version):

   ```nginx
   location = /server/eutils-proxy.php {
       include snippets/fastcgi-php.conf;
       fastcgi_pass unix:/run/php/php8.3-fpm.sock;
   }
   ```

4. Point the page at it: in Settings, Access, set "E-utilities address" to
   `https://your.site/server/eutils-proxy.php?u=`. In code, pass it as the
   PubMed source's `settings.baseUrl`, or to
   `new Broccoli.PubMedClient({ baseUrl })`.

To make the proxy the default for every visitor of your copy of the page,
give the PubMed source a default address in a small script of your own,
such as `site.js`, and load it in `index.html` just after the library (a
file rather than an inline script, so the Content Security Policy above
still holds):

```html
<script src="dist/broccoli.js"></script>
<script src="site.js"></script>
```

```js
// site.js: this site's E-utilities proxy, unless a visitor sets another address.
(function () {
  var proxy = 'https://your.site/server/eutils-proxy.php?u=';
  var pubmed = Broccoli.getSource('pubmed');
  Broccoli.registerSource(Object.assign({}, pubmed, {
    settings: pubmed.settings.map(function (s) {
      return s.id === 'baseUrl' ? Object.assign({}, s, { default: proxy, placeholder: proxy }) : s;
    }),
  }));
})();
```

Keep the key out of version control, and keep NCBI's
[usage guidelines](https://www.ncbi.nlm.nih.gov/books/NBK25497/) in mind.
To try the proxy locally, run `php -S localhost:8000` in the project folder,
open http://localhost:8000/, and set the E-utilities address to
`http://localhost:8000/server/eutils-proxy.php?u=`.

## A proxy for arXiv's API

arXiv's own API does not answer web pages, which is why the arXiv tab reads
arXiv's papers from OpenAlex. To use arXiv's API itself from a page, run a
proxy that forwards `GET` requests to `https://export.arxiv.org/api/query`
with their query string, adds an `Access-Control-Allow-Origin` header for
your site, and sends at most one request every three seconds; then use the
`arxiv-api` source with `settings.baseUrl` set to the proxy's address
([SOURCES.md](SOURCES.md#arxiv-api-arxiv-api)). The checklist in
[Writing a source](SOURCES.md#an-api-that-needs-a-secret-key) applies.

## Versions

Releases are git tags (`v1.5.1`), and [CHANGELOG.md](../CHANGELOG.md) says
what each one changed. To stay on one, check out its tag, or load the library
from jsDelivr at that tag:
`https://cdn.jsdelivr.net/gh/GenesisL1/Broccoli@v1.5.1/dist/broccoli.js`.
`python3 tools/build.py --check` confirms that `dist/` matches `src/` in a
copy you changed, and `python3 tools/run_tests.py` runs the tests.
