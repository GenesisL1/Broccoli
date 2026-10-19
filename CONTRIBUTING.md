# Contributing to Broccoli

Broccoli is a GenesisL1 in-house open-source search results clustering
engine, maintained by Decentralized Science Labs for the GenesisL1
ecosystem. Bug reports, ideas and pull requests are welcome.

## Ground rules

- **No dependencies and no build toolchain.** The library is plain
  JavaScript modules in `src/`, the search page plain scripts in `app/`.
  There is no npm and no Node.js toolchain; the tools are Python 3 scripts.
- **ES2019.** Broccoli runs in browsers from 2020 on, so `src/` uses no
  syntax newer than ES2019: no optional chaining (`?.`), no nullish
  coalescing (`??`). `app/` keeps the older style of its files (`var`,
  functions): follow the file you are editing.
- **`dist/` is built from `src/`.** After changing `src/`, run
  `python3 tools/build.py` and commit `dist/` with it. CI runs
  `python3 tools/build.py --check` and fails if they differ.
- **The search page stays static.** It works from `file://` and from any
  static host, with relative addresses and no server.
- **Requests stay simple.** Sources make CORS "simple" requests (GET, no
  custom headers), so browsers send them without a preflight, and they keep
  to each API's published rate limits.
- **No keys for readers.** A built-in source must work for every visitor
  without an API key or an account.
- **Docs follow the code.** A change in behaviour updates the README or
  `docs/`, and `CHANGELOG.md`.

## Getting started

```sh
git clone https://github.com/GenesisL1/Broccoli.git
cd Broccoli
python3 tools/serve.py          # http://localhost:8000/
```

The search page is at http://localhost:8000/, the tests for `src/` at
http://localhost:8000/tests/ and for the single-file build at
http://localhost:8000/tests/dist.html. `php -S localhost:8000` works too, and
also runs the E-utilities proxy in `server/`.

## Running the tests

```sh
python3 tools/run_tests.py --system     # in the browser you have; needs only Python
python3 tools/run_tests.py              # headless, with Playwright for Python if installed
```

Both run the suite against `src/` and `dist/` and print a summary. For
headless runs, install Playwright for Python in a virtual environment
(`pip install playwright && python -m playwright install chromium`); its
package brings its own driver, and nothing comes from npm. GitHub Actions
runs the build check and the headless tests on every push and pull request.

The tests never touch the network. Sources are tested with a fake `fetch`
and saved answers in each API's own format (`tests/fixtures/`). The harness
(`tests/harness.js`) is a small runner with `group`, `test`, `assert`,
`assertEqual`, `assertDeepEqual`, `assertRejects` and `assertThrows`; the
tests are grouped by area in `tests/test-*.js`.

## Code layout

| Path | What is there |
|---|---|
| `src/text/` | tokenizer, stemmers, stop lists, label highlighting |
| `src/preprocessing/` | words, stems, phrases, label candidates |
| `src/matrix/` | dense and sparse matrices, eigensolver, SVD, NMF, k-means |
| `src/algorithms/` | Lingo, STC, bisecting k-means |
| `src/engine/` | parameters, presets, the clustering engine and its worker |
| `src/sources/` | the source interface, requests, records, markup and the built-in sources |
| `src/pubmed/` | the E-utilities client, XML parser, PubMed records, exports |
| `app/` | the search page: `app.js` (sources, search, topic tree, panels), `views.js` (canvas maps), `florets.js` (SVG map), `colors.js` (palette) |
| `tools/` | `build.py` (bundles `src/` into `dist/`), `serve.py`, `run_tests.py` |

`tools/build.py` understands the module syntax `src/` uses: named imports
and exports, `import * as`, `export … from` and `export *`. It refuses
default exports, dynamic `import()`, `import.meta` and circular imports.

Each source file begins with the same header:

```js
/*
 * Broccoli — GenesisL1's open-source search results clustering engine.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * What this file does, in a few sentences.
 */
```

## Adding a built-in source

A built-in source has to answer requests from web pages (CORS) without a
key, allow this use in its terms, and publish its rate limits.

1. Write `src/sources/<name>.js`: the source definition and the function
   that reads one of its records ([Writing a source](docs/SOURCES.md#writing-a-source)
   describes both). Keep the API's limits in `pageSize`, `maxLimit` and
   `rateLimit`, and set `service` if it shares an API with another source.
2. Register it in `src/sources/builtin.js`, where the order is the order of
   the tabs, and export it from `src/index.js`.
3. Save a trimmed real answer in `tests/fixtures/sources-fixtures.js`, and
   test in `tests/test-sources.js` the request it makes (parameters, sorts,
   filters, years), its paging, the records it returns, and its errors.
4. Run `python3 tools/build.py` and the tests.
5. Document it: the table in the README, a section in `docs/SOURCES.md`, its
   address in the Content Security Policy in `docs/SELF-HOSTING.md`, its
   filters in `docs/SEARCH-PAGE.md`, and its credit in `NOTICE.md`.

## Adding a language

`registerLanguage()` adds a language on one page. A built-in language needs
a stemmer checked against the Snowball reference vocabulary for that
language, stop words and stop labels, a label style and the name of the
"Other topics" group, with tests in `tests/test-text.js`. See the Languages
section of the README.

## Pull requests

- Keep each pull request to one change, and say what it changes and how you
  tested it.
- For changes to the search page, include screenshots in the light and dark
  themes, and at phone width.
- Add tests for fixed bugs and new behaviour, and update the docs and
  `CHANGELOG.md`.
- By contributing, you agree that your contribution is released under the
  project's MIT License.

## Reporting problems

Open an issue with the address of the search page, which holds the whole
search (source, query, records, order, algorithm, filters, map, topic), what
you expected and what happened, and your browser. For security problems,
follow [SECURITY.md](SECURITY.md) instead.
