<!-- SPDX-License-Identifier: MIT · Copyright (c) 2026 Decentralized Science Labs LLC -->
# Questions

Short answers, with links to the longer ones.

### What is Broccoli?

Broccoli is a GenesisL1 in-house open-source search results clustering
engine. It takes the records a search returns, groups them into topics
named in the records' own words, and draws the topics as a zoomable map, all
in your browser. Click a topic and it opens into subtopics of its own, up to
six levels deep.

### How is it related to GenesisL1?

Decentralized Science Labs develops Broccoli for the GenesisL1 ecosystem.
genesisl1.com presents it at
[genesisl1.com/broccoli.html](https://genesisl1.com/broccoli.html) and runs
its search page at [genesisl1.com/broccoli/search/](https://genesisl1.com/broccoli/search/),
and GL1X, the GenesisL1 explorer, uses it to map the literature of the
molecular structures on the chain. See [GENESISL1.md](GENESISL1.md).

### Is it free? Do I need an account or an API key?

It is free and open source under the MIT License. There is no account and
nothing to install, and none of the eleven sources on the search page needs
an API key. Code can still pass a free key of its own to PubMed or OpenAlex
for heavy use; the search page never asks for one.

### Why did OpenAlex or arXiv stop answering for the day?

OpenAlex gives every address a daily allowance of searches without a key:
about a hundred requests, which is some ten searches of 1,000 records, the
search page's default, or fifty of 200. The
arXiv tab reads arXiv's papers from OpenAlex and shares the allowance. When
it is spent, the page says so; it renews the next day, and the other
sources keep working. [SOURCES.md](SOURCES.md#openalex-openalex) has the
details.

### Why does the arXiv tab use OpenAlex?

arXiv's own API does not send the headers a web page needs to read it, so a
page cannot call it directly. OpenAlex indexes arXiv's papers and can be
called from a page. arXiv's own API is still there for servers and proxies,
as the `arxiv-api` source.

### Where do my searches go? Is anything logged?

From your browser straight to the source you pick, or to a proxy you set up.
Broccoli has no server, so it has nothing to log: the clustering runs on
your device, and your settings stay in your browser. Each source receives
your request like any visit to its site. A site that hosts the page may add
services of its own: genesisl1.com, for example, runs Google Analytics once
a visitor accepts its cookie notice, as its
[privacy policy](https://genesisl1.com/privacy.html) says.

### How does it find and name the topics? Is it AI?

With one of three published algorithms: Lingo, Suffix Tree Clustering or
bisecting k-means. There are no embeddings and no language model. Topics
come from the words and phrases the records share, so every label is made of
words from the records, highlighted where they occur. [GUIDE.md](GUIDE.md)
explains each step.

### Why do the topics change when I change the settings?

Each source, number of records, order and algorithm gives other topics. The
source decides which records come back and in what order; more records give
finer topics; Lingo, STC and k-means look for different kinds of groups.
With the same records and settings, the topics are always the same.

### How many records can it map?

Up to 2,000 a search on the search page, and up to 10,000 from PubMed in
code. Clustering a few hundred records takes a moment in a background
worker, and About this result says how long; fetching them usually takes
longer, because each source sets its own pace.

### Which languages does it understand?

English, German, French, Spanish, Italian, Portuguese, Dutch and Russian,
with stemmers checked word for word against Snowball's reference
vocabularies. Other languages that put spaces between words work without
stemming. Chinese, Japanese and Thai would need a word segmenter, which
Broccoli does not have.

### Can I use Broccoli on my own site, or with my own data?

Yes. Link to a search, show the search page in a frame, or use the library,
which is one script with no dependencies: add your own search with
`registerSource` or `jsonSource`, or call `cluster()` on any text records.
See [EMBEDDING.md](EMBEDDING.md) and [SELF-HOSTING.md](SELF-HOSTING.md).

### Can it search Google?

Not directly. Google's Custom Search JSON API, the usual way to put Google
results into a program, is closed to new customers and due to shut down on
1 January 2027, so the open general search here is Wikipedia. A web search
API that needs a secret key plugs in through a small proxy of your own.

### Does it work offline?

The page and the clustering do: open `index.html` from disk and cluster your
own documents with `cluster()`, or see `examples/basic.html`. Searching needs
the network, because the records come from the sources' APIs.

### Which browsers does it run in?

Current Chrome, Edge, Firefox and Safari, on computers and phones: anything
from 2020 on with ES2019, Unicode regular expressions and the canvas.

### Is it a tool for systematic reviews, or medical advice?

Neither. Broccoli is a reading aid: it shows what a set of search results
is made of. It indexes and ranks nothing itself, and nothing it shows is
medical advice.

### How do I cite it?

With [CITATION.cff](../CITATION.cff); GitHub's "Cite this repository" button
reads it.

### How do I report a problem or suggest a change?

Open an issue on [GitHub](https://github.com/GenesisL1/Broccoli/issues) with
the page's address, which holds the whole search, and what you expected.
Report security problems privately, as [SECURITY.md](../SECURITY.md)
describes. [CONTRIBUTING.md](../CONTRIBUTING.md) explains how to propose a
change.

### Why "Broccoli"?

A head of broccoli is a cluster of florets, and every floret a cluster of
smaller ones; in Romanesco the same spiral repeats at every scale. Broccoli
reads a result set the same way: topics that open into subtopics, which
open again.
