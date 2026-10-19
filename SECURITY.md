# Security

Broccoli is a GenesisL1 in-house open-source search results clustering
engine, maintained by Decentralized Science Labs. Thank you for helping keep
it and its users safe.

## Reporting a vulnerability

Please do not open a public issue. Write to
[mikhail.fedorov@genesisl1.com](mailto:mikhail.fedorov@genesisl1.com) with:

- what the problem is and what an attacker could do with it;
- how to reproduce it: the version or commit, the page address, a sample
  record or answer from a source if one is involved;
- whether you would like to be credited when the fix is released.

You will get an answer as soon as possible. Fixes go into the next release,
with a note in [CHANGELOG.md](CHANGELOG.md).

## Supported versions

The latest release (the newest `v*` tag) and the `main` branch.

## How Broccoli is built to be safe

- **Records are untrusted.** Everything a source returns is treated as
  data. Titles and abstracts are reduced to plain text, or to HTML that can
  hold nothing but `<i>`, `<b>`, `<u>`, `<sup>` and `<sub>`; everything else
  on the page is escaped. Links are kept only when they are `http` or
  `https`.
- **Exports are inert.** A CSV cell that a spreadsheet would read as a
  formula is kept as text.
- **No server.** The search page is static. Searches go from the browser to
  the sources; settings stay in the browser's local storage and are sent
  only to the service they belong to.
- **Embedding.** The search page takes theme messages only from the window
  that frames it, and only the values `light`, `dark` and `system`.
- **The E-utilities proxy** (`server/eutils-proxy.php`) forwards only the
  E-utilities and databases on its allow list to one fixed upstream, adds the
  NCBI key on the server and removes it from error messages, ignores keys
  sent by browsers, limits the size of request bodies, refuses web pages
  from origins it is not configured for (requests from outside a browser
  carry no origin and cannot be told apart this way), and spaces requests
  to stay within NCBI's limits.

## Scope

In scope: cross-site scripting or injection through source data, exports or
the page address; ways to make the page send data anywhere other than the
source a reader chose; weaknesses of the E-utilities proxy, such as use as an
open proxy or a leaked key.

Out of scope: the search APIs themselves (report those to their operators),
and the load a reader can put on a source from their own browser.
