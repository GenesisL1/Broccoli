<!-- SPDX-License-Identifier: MIT · Copyright (c) 2026 Decentralized Science Labs LLC -->
# Broccoli and GenesisL1

**Broccoli is a GenesisL1 in-house open-source search results clustering
engine.** Decentralized Science Labs develops it for the GenesisL1
ecosystem and publishes it under the MIT License, so that anyone can read,
run and build on it.

## GenesisL1

[GenesisL1](https://genesisl1.com) is a public Layer 1 for verifiable data,
models, applications and open infrastructure: a Cosmos SDK chain with an EVM
(chain id 29, coin L1). Its idea is that a digital result should be
something anyone can check: the same input gives the same result, on every
node and on every replay. The [ecosystem](https://genesisl1.com/ecosystem.html)
puts that idea to work:

- **MolNFT** tokenizes molecular structures (the Protein Data Bank and
  predicted structures) as portable, citable objects, and complete PDB
  structures can be rebuilt from the chain's state.
- **GenesisL1 Forest (GL1F)** turns machine-learning models into NFTs whose
  exact bytes live on chain, with inference that runs inside smart contracts.
- **CIPNFT** keeps encrypted intellectual property on chain, with
  decryption rights that can be transferred.
- **GenesisL1 Chess** runs a neural network's policy inside the EVM.
- **[GL1X](https://gl1x.com)**, the GenesisL1 explorer, indexes all of it,
  with research tools for the molecular records and an MCP server for AI
  agents.
- Staking, governance and bridge apps, and the
  [Insights](https://genesisl1.com/insights/) articles, at genesisl1.com.

Biomedical research and bioinformatics are among GenesisL1's deepest uses,
but the chain is built for any field that needs durable provenance and
replayable computation.

## Where Broccoli fits

Verifiable data is only half of research; the other half is reading what is
known about it. A molecular structure on the chain comes with a literature
of hundreds or thousands of papers, and a search returns them as a list.
Broccoli turns that list into a map of named topics, in the reader's own
browser, so the shape of a field shows before the first paper is opened. It
does the same for any search: preprints, clinical trials, datasets,
physics, Wikipedia, or a search engine of your own.

## Where it runs

- **[genesisl1.com/broccoli.html](https://genesisl1.com/broccoli.html)**
  presents Broccoli in the site's own look, and the search page from this
  repository runs at [genesisl1.com/broccoli/search/](https://genesisl1.com/broccoli/search/),
  with a tab for every source; every "Try" link on the page opens it in a
  new tab.
- **[GL1X PubMed search](https://gl1x.com/bio/pubmed)**: the explorer's
  PubMed search runs Broccoli in the browser to cluster up to 2,000 records
  into a zoomable map, with its own light and dark themes. PubMed is reached
  through the explorer's E-utilities pass-through, with the server's NCBI
  key and rate. Every structure the explorer lists links to its literature:
  by its PDB ID, and by its title, which GL1X digests into the important words
  and widens until PubMed finds records. GL1X documents its use of Broccoli at
  [gl1x.com/docs/broccoli](https://gl1x.com/docs/broccoli) and its PubMed
  search at [gl1x.com/docs/pubmed](https://gl1x.com/docs/pubmed).
- **AI agents** connected to GL1X's MCP server at `gl1x.com/mcp` reach the
  same PubMed records with its `pubmed_search` tool: a query in PubMed's
  syntax, a structure's title, or PMIDs to read, with the MeSH headings the
  records share.

## Shared principles

Broccoli is built the way GenesisL1 is:

- **Reproducible.** Every random step draws from a seeded generator, so the
  same records with the same settings always give the same topics and the
  same map. A link to a search carries the whole search, so it gives
  everyone the same records.
- **Traceable.** Broccoli is lexical, with no embeddings and no language
  model: every label is made of words from the records, highlighted where
  they occur. Nothing is summarised or invented.
- **Open.** The code is MIT-licensed, every method is implemented from its
  published description, and [NOTICE.md](../NOTICE.md) credits each paper and
  data source.
- **Direct.** The clustering runs on the reader's device. Searches go from
  the browser to the source; no Broccoli server stands in between, and no
  source needs an account or a key.

## Names, credits and citation

Broccoli is © 2026 Decentralized Science Labs LLC, released under the MIT
License. "GenesisL1", "GL1X", "MolNFT", "GL1F" and "Broccoli" name projects
of the GenesisL1 ecosystem; the license covers the code and grants no rights
to names or marks. To cite Broccoli, use [CITATION.cff](../CITATION.cff)
(GitHub's "Cite this repository" reads it).

- GenesisL1: [genesisl1.com](https://genesisl1.com) ·
  [ecosystem](https://genesisl1.com/ecosystem.html) ·
  [GitHub](https://github.com/GenesisL1)
- Broccoli: [genesisl1.com/broccoli.html](https://genesisl1.com/broccoli.html) ·
  [search page](https://genesisl1.com/broccoli/search/) ·
  [source](https://github.com/GenesisL1/Broccoli)
- GL1X: [gl1x.com](https://gl1x.com) ·
  [PubMed search](https://gl1x.com/bio/pubmed)
