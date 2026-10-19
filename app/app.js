/*
 * Broccoli — GenesisL1's search page: topic maps for search results.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * The search page: a search source (PubMed, Europe PMC, preprints, arXiv,
 * OpenAlex, Crossref, DOAJ, ClinicalTrials.gov, DataCite, INSPIRE-HEP,
 * Wikipedia, or any source registered with Broccoli.registerSource before
 * this script runs) → clustering (in a Web Worker when possible) → a tree of
 * topics you can zoom into. Zooming into a topic clusters its records again,
 * so every level has its own subtopics; a second worker works ahead on the
 * topics you are likely to open next. A plain script, so the page also
 * works when opened straight from disk.
 */
(function () {
  'use strict';

  var D = window.Broccoli;
  var Florets = window.BroccoliFlorets;
  var Views = window.BroccoliViews;
  var Colors = window.BroccoliColors;
  var $ = function (id) { return document.getElementById(id); };

  if (!D || !Florets || !Views || !Colors) {
    var s = $('status');
    if (s) { s.textContent = 'Part of the page did not load. Check that dist/ and app/ sit next to index.html.'; s.className = 'status-line error'; }
    return;
  }

  var PAGE = 50;
  var STORAGE_KEY = 'broccoli.settings.v1';
  var SUB_MIN = 8;      // smallest group that is clustered again
  var MAX_DEPTH = 6;
  var ALGORITHM_NAMES = { lingo: 'Lingo', stc: 'STC', bkm: 'bisecting k-means' };
  var VIEW_NAMES = { bubbles: 'Bubbles', treemap: 'Treemap', radial: 'Radial', florets: 'Florets' };
  // the florets map's id before 1.3, for old links and saved settings
  var OLD_VIEWS = { umbel: 'florets' };

  /** The map style by its id (null for one this page does not have). */
  function viewName(v) { v = OLD_VIEWS[v] || v; return VIEW_NAMES[v] ? v : null; }
  var LIMITS = [100, 200, 300, 500, 1000, 2000];

  // The sources this page can search: every registered source that answers
  // requests from web pages.
  var SOURCES = D.listSources().filter(function (s) { return s.browser; });

  /** A source by its id; PubMed (or the first source) for an unknown one. */
  function sourceOf(id) {
    return SOURCES.find(function (s) { return s.id === id; }) || SOURCES.find(function (s) { return s.id === 'pubmed'; }) || SOURCES[0];
  }

  var DEFAULTS = {
    source: sourceOf('pubmed').id,
    retmax: 1000,
    sort: 'relevance',
    algorithm: 'lingo',
    view: 'treemap',
    fromYear: '',
    toYear: '',
    filters: {},          // per source: { pubmed: { abstracts: true, … } }; missing ones are the source's defaults
    sourceSettings: {},   // per source: contact e-mail, proxy address, language
    mesh: false,
    biomedical: true,
    stopwords: '',
    stoplabels: '',
    labelFormat: 'title',
    params: { lingo: {}, stc: {}, bkm: {} },
    theme: 'system',
    settingsVersion: 2,
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function loadSettings() {
    var s = clone(DEFAULTS);
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        Object.keys(s).forEach(function (k) {
          if (saved[k] === undefined || saved[k] === null) return;
          if (k === 'params' || k === 'sourceSettings') s[k] = Object.assign(s[k], saved[k]);
          else if (k === 'filters') {
            // Before 1.4 the filters were PubMed's alone: { abstracts: true, english: false, … }.
            var flat = Object.keys(saved.filters).some(function (f) { return typeof saved.filters[f] === 'boolean'; });
            s.filters = flat ? { pubmed: saved.filters } : Object.assign(s.filters, saved.filters);
          } else s[k] = saved[k];
        });
        // …and so were the NCBI settings.
        if (saved.email || saved.baseUrl) {
          s.sourceSettings.pubmed = Object.assign({ email: saved.email || '', baseUrl: saved.baseUrl || '' }, s.sourceSettings.pubmed || {});
        }
        // Before 1.5.2 the page fetched 200 records by default; it now fetches 1,000.
        if (!saved.settingsVersion) {
          if (saved.retmax === 200) s.retmax = DEFAULTS.retmax;
          s.settingsVersion = DEFAULTS.settingsVersion;
        }
      }
    } catch (e) { /* storage unavailable: defaults */ }
    // The page asks for no API keys: forget any that an earlier version kept.
    ['pubmed', 'openalex'].forEach(function (id) { if (s.sourceSettings[id]) delete s.sourceSettings[id].apiKey; });
    if (!ALGORITHM_NAMES[s.algorithm]) s.algorithm = 'lingo';
    if (s.sort === 'pub_date') s.sort = 'date';  // PubMed's name for it before 1.4
    s.view = viewName(s.view) || DEFAULTS.view;
    s.source = sourceOf(s.source).id;
    return s;
  }

  function saveSettings() {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
  }

  var settings = loadSettings();

  // A page that embeds the search page in a frame can set its theme, without
  // touching the saved settings: with ?theme=light|dark|system in the frame's
  // address, or a message { type: 'broccoli:theme', theme: 'dark' }.
  var THEMES = { light: 1, dark: 1, system: 1 };
  var embedTheme = (function () {
    try {
      var t = new URLSearchParams(window.location.search).get('theme');
      return THEMES[t] ? t : null;
    } catch (e) { return null; }
  })();
  function themeSetting() { return embedTheme || settings.theme; }

  var state = {
    query: '',
    source: null,     // the source of the records on show
    language: 'en',   // the language they are clustered in
    search: null,
    articles: [],
    documents: [],
    result: null,
    root: null,
    focus: null,
    nodes: new Map(),
    treeGen: 0,
    shown: PAGE,
    expanded: new Set(),
    runId: 0,
    clusterJob: 0,
    pendingNext: null,   // a search's records while they are being grouped
    controller: null,
    lastSettingsOpener: null,
  };
  var clusterer = D.createClusterer();
  var helper = null;  // the second worker, for subtopics computed ahead of time
  var ahead = { queue: [], busy: false };

  // ---------------------------------------------------------------- helpers

  var fmt = function (n) { return Number(n).toLocaleString('en-US'); };
  var esc = D.escapeHtml;
  var plural = function (n, word) { return fmt(n) + ' ' + word + (n === 1 ? '' : 's'); };
  var real = function (n) { return !n.other; };

  function unescapeHtml(s) {
    return s.replace(/&(amp|lt|gt|quot|#39);/g, function (m, e) {
      return { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[e];
    });
  }

  /** Highlights label words inside safe inline HTML (<i>, <b>, <sup>…) without breaking its tags. */
  function highlightMarkup(safe, terms) {
    if (!terms || !terms.length || !safe) return safe || '';
    return safe.split(/(<\/?(?:i|b|u|sup|sub)>)/).map(function (part, i) {
      return i % 2 ? part : D.highlightHtml(unescapeHtml(part), terms);
    }).join('');
  }

  function slug(s) {
    return String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 48) || 'records';
  }

  function sentenceCase(label) {
    if (!label) return '';
    return label === label.toUpperCase() ? label.charAt(0) + label.slice(1).toLowerCase() : label;
  }

  var toastTimer = null;
  function toast(message) {
    var t = $('toast');
    t.textContent = message;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }

  function setStatus(text, isError) {
    var s = $('status');
    s.textContent = text || '';
    s.className = 'status-line' + (isError ? ' error' : '');
  }

  function setStatusHtml(html) {
    var s = $('status');
    s.innerHTML = html;
    s.className = 'status-line';
  }

  function setProgress(fraction) {
    var p = $('progress');
    if (fraction == null) { p.hidden = true; return; }
    p.hidden = false;
    p.firstElementChild.style.width = Math.round(Math.max(0, Math.min(1, fraction)) * 100) + '%';
  }

  // The button stays enabled while a search runs: a new query (or Enter again) replaces the running search.
  function setBusy(busy) {
    var b = $('search-button');
    b.classList.toggle('busy', busy);
    b.setAttribute('aria-busy', busy ? 'true' : 'false');
    b.textContent = busy ? 'Searching…' : 'Search';
  }

  function download(name, text, type) {
    var blob = new Blob([text], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy') ? resolve() : reject(new Error('copy failed')); } catch (e) { reject(e); }
      ta.remove();
    });
  }

  function reducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // ---------------------------------------------------------------- sources

  function currentSource() { return sourceOf(settings.source); }

  /** The source's filters as switched on in Settings (its defaults where untouched). */
  function filtersFor(src) {
    var saved = settings.filters[src.id] || {};
    var out = {};
    src.filters.forEach(function (f) { out[f.id] = saved[f.id] !== undefined ? !!saved[f.id] : f.default; });
    return out;
  }

  /** The source's own settings: keys, e-mail, proxy, language (shared with the source it takes them from). */
  function settingsFor(src) {
    var own = settings.sourceSettings[src.settingsFrom || src.id] || {};
    var out = {};
    var defs = (src.settings || []).concat(src.settingsFrom ? (sourceOf(src.settingsFrom).settings || []) : []);
    defs.forEach(function (d) {
      var v = own[d.id];
      if (typeof v === 'string') v = v.trim();
      if (v === undefined || v === '') v = d.default;
      if (v !== undefined && v !== '') out[d.id] = v;
    });
    return out;
  }

  function sortFor(src) {
    return src.sorts.some(function (o) { return o.id === settings.sort; }) ? settings.sort : src.sorts[0].id;
  }

  function limitFor(src) {
    return Math.min(settings.retmax, src.maxLimit);
  }

  /** The source the records on show came from. */
  function shownSource() { return state.source || currentSource(); }

  /** The API's own words about an error, from a JSON or text answer. */
  function apiDetail(err) {
    var raw = String((err && err.detail) || '');
    var msg = '';
    try {
      var j = JSON.parse(raw);
      var m = j.message || j.error || j.errors || j.detail || j.errMsg;
      if (Array.isArray(m)) m = m[0];
      if (m && typeof m === 'object') m = m.message || m.info || m.detail || m.title || '';
      msg = typeof m === 'string' ? m : '';
    } catch (e) {
      msg = raw.replace(/<[^>]*>/g, ' ');
    }
    msg = msg.replace(/\s+/g, ' ').trim();
    return msg.length > 180 ? msg.slice(0, 177) + '…' : msg;
  }

  function errorMessage(err, src) {
    var kind = err && err.kind;
    var name = src.name;
    var openalex = src.service === 'openalex';
    if (kind === 'network') {
      if (src.id === 'pubmed') return 'Could not reach PubMed. Check your connection. If a firewall blocks NCBI, set a proxy address under Settings, Access.';
      return 'Could not reach ' + name + '. Check your connection and try again.';
    }
    if (kind === 'timeout') return name + ' did not answer in time. Try again, or ask for fewer records.';
    if (kind === 'rate-limit') {
      if (src.id === 'pubmed') return 'NCBI is limiting requests from this address. Wait a minute and try again.';
      if (openalex) {
        return name + ' has reached its daily allowance of searches from this address (OpenAlex sets one for every address). ' +
          'It renews tomorrow; the other sources keep working.';
      }
      return name + ' is limiting requests from this address. Wait a minute and try again.';
    }
    if (kind === 'http' && (err.status === 401 || err.status === 403)) {
      return name + ' turned this search down (HTTP ' + err.status + '). Try again with fewer records, or search another source.';
    }
    if (kind === 'http' && err.status === 400) {
      var said = apiDetail(err);
      return name + ' could not run this search' + (said ? ': ' + said.replace(/\.$/, '') + '.' : '.') + (src.syntax ? ' ' + src.syntax : '');
    }
    return (err && err.message) || String(err);
  }

  async function runSearch(rawQuery, options) {
    options = options || {};
    var src = currentSource();
    var query = String(rawQuery || '').trim();
    if (!query) {
      setStatus('Type something to search for, for example: ' + ((src.examples[0] && src.examples[0].query) || src.placeholder || 'a topic'));
      $('q').focus();
      return;
    }
    if (state.controller) state.controller.abort();
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    state.controller = controller;
    var signal = controller ? controller.signal : undefined;
    var runId = ++state.runId;
    // A search still being grouped is dropped: its records must not replace this one's.
    state.pendingNext = null;
    state.clusterJob++;
    state.query = query;
    $('q').value = query;
    if (options.updateHash !== false) {
      state.focus = null;
      writeHash();
    }
    setBusy(true);
    setStatus('Searching ' + src.name + '…');
    setProgress(0.04);
    try {
      var result = await D.searchSource(src, query, {
        limit: limitFor(src),
        sort: sortFor(src),
        filters: filtersFor(src),
        from: settings.fromYear,
        to: settings.toYear,
        settings: settingsFor(src),
        signal: signal,
        onProgress: function (done, total) {
          if (runId !== state.runId) return;
          setProgress(0.06 + 0.66 * (total ? Math.min(1, done / total) : 0));
          if (done > 0) setStatus('Fetching records from ' + src.name + ': ' + fmt(done) + ' of ' + fmt(total));
        },
      });
      if (runId !== state.runId) return;
      if (!result.records.length) {
        keepShownSearch();
        showNoMatches(query, result, src);
        return;
      }
      // The new records replace the ones on show only once they are grouped, so the map and the list always match.
      await recluster({
        animate: true, path: options.path || [], fresh: true,
        next: {
          runId: runId,
          source: src,
          search: result,
          articles: result.records,
          documents: makeDocuments(result.records),
          language: result.language && D.listLanguages().some(function (l) { return l.code === result.language; }) ? result.language : 'en',
        },
      });
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      if (runId !== state.runId) return;
      keepShownSearch();
      setProgress(null);
      setStatus(errorMessage(err, src), true);
    } finally {
      if (runId === state.runId) setBusy(false);
    }
  }

  function showNoMatches(query, result, src) {
    setProgress(null);
    var html = 'No ' + esc(src.name) + ' records match <b>' + esc(query) + '</b>';
    var filters = filtersFor(src);
    var changed = src.filters.some(function (f) { return filters[f.id] !== f.default; });
    if (changed || (src.years && (settings.fromYear || settings.toYear))) html += ' with the current filters';
    html += '.';
    if (result && result.phrasesNotFound && result.phrasesNotFound.length) {
      html += ' PubMed found nothing for: ' + result.phrasesNotFound.map(esc).join(', ') + '.';
    }
    if (result && result.suggestion) {
      html += ' <button type="button" class="btn" id="try-suggestion">Search for ' + esc(result.suggestion) + ' instead</button>';
    }
    setStatusHtml(html);
    var b = $('try-suggestion');
    if (b) b.addEventListener('click', function () { runSearch(result.suggestion); });
  }

  function makeDocuments(records) {
    return D.toDocuments(records, { includeMesh: settings.mesh, includeKeywords: settings.mesh });
  }

  function rebuildDocuments() {
    state.documents = makeDocuments(state.articles);
  }

  /** The query of the records on show (the one typed may be newer, or may have failed). */
  function shownQuery() {
    return state.search ? state.search.query : state.query;
  }

  /** After a search that found nothing or failed, the records on show stay, and so does their query. */
  function keepShownSearch() {
    if (state.search && state.root) state.query = state.search.query;
  }

  // ---------------------------------------------------------------- clustering

  function lines(text) {
    return String(text || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
  }

  /** Options for clustering the records on show, or `next`, the records about to be. */
  function clusterOptions(next) {
    var wordFilters = lines(settings.stopwords);
    var labelFilters = lines(settings.stoplabels);
    var language = next ? next.language : state.language;
    var english = language === 'en';
    return {
      algorithm: settings.algorithm,
      preset: 'abstracts',
      language: language,
      extras: settings.biomedical && english ? ['biomedical'] : [],
      queryHint: next ? next.search.query : shownQuery(),
      fields: settings.mesh ? ['title', 'abstract', 'terms'] : ['title', 'abstract'],
      titleField: 'title',
      parameters: algorithmParameters((next ? next.documents : state.documents).length, false),
      dictionaries: {
        wordFilters: wordFilters.length ? [{ glob: wordFilters }] : [],
        labelFilters: labelFilters.length ? [{ glob: labelFilters }] : [],
      },
      // Other languages have their own way of writing labels unless asked otherwise.
      labelFormat: english || settings.labelFormat !== 'title' ? settings.labelFormat : undefined,
    };
  }

  /**
   * User overrides, plus defaults that suit the number of records: bisecting
   * k-means gets a cluster count, and subtopic levels ask for fewer groups.
   */
  function algorithmParameters(n, sub) {
    var p = Object.assign({}, settings.params[settings.algorithm] || {});
    if (settings.algorithm === 'bkm' && p.clusterCount === undefined) {
      p.clusterCount = sub
        ? Math.max(3, Math.min(12, Math.round(1.2 * Math.sqrt(n))))
        : Math.max(4, Math.min(30, Math.round(1.2 * Math.sqrt(n))));
    }
    if (sub && settings.algorithm === 'lingo' && p.desiredClusterCount === undefined) p.desiredClusterCount = 15;
    if (sub && settings.algorithm === 'stc' && p.maxClusters === undefined) p.maxClusters = 12;
    return p;
  }

  /** Options for clustering inside a topic: its own label words join the query, so they are not repeated as labels. */
  function subOptions(node) {
    var opts = clusterOptions();
    var hint = [shownQuery()];
    for (var n = node; n && n.parent; n = n.parent) if (!n.other) hint.push(n.label);
    opts.queryHint = hint.join(' ');
    opts.parameters = algorithmParameters(node.docs.length, true);
    return opts;
  }

  var STAGES = {
    tokenize: 'Reading the records…',
    phrases: 'Finding frequent phrases…',
    labels: 'Choosing label candidates…',
    matrix: 'Weighing terms…',
    factorization: 'Finding concepts…',
    baseClusters: 'Collecting shared phrases…',
    merge: 'Merging phrase groups…',
    clustering: 'Splitting into topics…',
  };

  async function recluster(options) {
    options = options || {};
    // Records of a search still being grouped are the ones to group again.
    var next = options.next || state.pendingNext;
    var docs = next ? next.documents : state.documents;
    if (!docs.length) return;
    var job = ++state.clusterJob;
    state.pendingNext = next || null;
    var keepPath = options.path && options.path.length ? options.path : options.fresh || next ? [] : focusPath();
    setStatus('Grouping ' + plural(docs.length, 'record') + ' into topics…');
    setProgress(0.75);
    var opts = clusterOptions(next);
    opts.onProgress = function (stage) {
      if (job === state.clusterJob && STAGES[stage]) setStatus(STAGES[stage]);
    };
    var result;
    try {
      result = await clusterer.cluster(docs, opts);
    } catch (err) {
      if (job !== state.clusterJob) return;
      state.pendingNext = null;
      setProgress(null);
      setStatus('Clustering failed: ' + ((err && err.message) || err), true);
      return;
    }
    if (job !== state.clusterJob) return;
    if (next && next.runId !== state.runId) return;  // a newer search has started since
    if (next) {
      state.pendingNext = null;
      state.source = next.source;
      state.search = next.search;
      state.articles = next.articles;
      state.documents = next.documents;
      state.language = next.language;
      state.expanded = new Set();
      renderRecordActions();
    }
    state.result = result;
    state.treeGen++;
    ahead.queue = [];
    state.root = buildTree(result);
    state.focus = state.root;
    state.shown = PAGE;
    showResults(!!options.animate && !reducedMotion());
    setProgress(null);
    setStatus(summaryText());
    lookAhead(readyKids(state.root), false);
    if (keepPath.length) followPath(keepPath, { animate: true, replace: true });
    else if (options.fresh || next) writeHash(true);
  }


  // ---------------------------------------------------------------- the topic tree

  function otherLabel(depth) {
    return depth <= 1 ? 'Not in any topic' : 'Not in any subtopic';
  }

  function makeNode(parent, cluster, index, docs) {
    var depth = parent ? parent.depth + 1 : 0;
    var node = {
      id: parent ? parent.id + '.' + index : 't',
      parent: parent,
      depth: depth,
      index: index,
      label: cluster.other ? otherLabel(depth) : cluster.label,
      labels: cluster.labels || [],
      merged: cluster.merged || [],
      other: !!cluster.other,
      size: docs.length,
      docs: docs,
      children: null,
      status: 'idle',
      pending: null,
    };
    state.nodes.set(node.id, node);
    return node;
  }

  function buildTree(result) {
    state.nodes = new Map();
    var all = state.documents.map(function (_, i) { return i; });
    var root = makeNode(null, { label: 'All records' }, 0, all);
    root.children = result.clusters.map(function (c, i) { return makeNode(root, c, i, c.documents.slice()); });
    root.status = root.children.length ? 'ready' : 'leaf';
    return root;
  }

  function readyKids(node) {
    return node && node.status === 'ready' && node.children ? node.children : [];
  }

  function focusPath() {
    var path = [];
    for (var n = state.focus; n && n.parent; n = n.parent) path.unshift(n.label);
    return path;
  }

  /**
   * Clusters a topic's records to find its subtopics. `urgent` uses the main
   * worker (someone is waiting); otherwise the helper worker.
   */
  function expand(node, urgent) {
    if (!node || node.status === 'ready' || node.status === 'leaf') return Promise.resolve(node);
    if (node.pending) return node.pending;
    if (node.docs.length < SUB_MIN || node.depth >= MAX_DEPTH) {
      node.status = 'leaf';
      node.children = [];
      treeChanged(node);
      return Promise.resolve(node);
    }
    var gen = state.treeGen;
    var worker = urgent || !helper ? clusterer : helper;
    var docs = node.docs.map(function (i) { return state.documents[i]; });
    node.status = 'pending';
    treeChanged(node);
    node.pending = worker.cluster(docs, subOptions(node)).then(function (res) {
      node.pending = null;
      if (gen !== state.treeGen) return node;
      var kids = [];
      res.clusters.forEach(function (c) {
        var mapped = c.documents.map(function (j) { return node.docs[j]; });
        if (!c.other && mapped.length >= node.docs.length) return;  // the whole group again
        kids.push({ cluster: c, docs: mapped });
      });
      if (kids.filter(function (k) { return !k.cluster.other; }).length < 2) {
        node.status = 'leaf';
        node.children = [];
      } else {
        node.children = kids.map(function (k, i) { return makeNode(node, k.cluster, i, k.docs); });
        node.status = 'ready';
      }
      treeChanged(node);
      return node;
    }, function (err) {
      node.pending = null;
      if (gen !== state.treeGen) return node;
      node.status = 'leaf';
      node.children = [];
      node.error = (err && err.message) || String(err);
      treeChanged(node);
      return node;
    });
    return node.pending;
  }

  /** Queues topics for the helper worker; `front` puts them first. */
  function lookAhead(nodes, front) {
    if (!helper && typeof Worker !== 'undefined') {
      helper = D.createClusterer();
      if (helper.mode !== 'worker') { helper.terminate(); helper = false; }
    }
    if (!helper || !nodes || !nodes.length) return;
    var wanted = nodes.filter(function (n) { return n.status === 'idle' && n.docs.length >= SUB_MIN && n.depth < MAX_DEPTH; });
    ahead.queue = ahead.queue.filter(function (n) { return wanted.indexOf(n) < 0; });
    ahead.queue = front ? wanted.concat(ahead.queue) : ahead.queue.concat(wanted);
    pump();
  }

  function pump() {
    if (ahead.busy || !helper) return;
    var next = null;
    while (ahead.queue.length && !next) {
      var n = ahead.queue.shift();
      if (n.status === 'idle' && state.nodes.get(n.id) === n) next = n;
    }
    if (!next) return;
    ahead.busy = true;
    var done = function () { ahead.busy = false; pump(); };
    expand(next, false).then(done, done);
  }

  var treeFrame = 0;
  var focusTouched = false;
  function treeChanged(node) {
    // Only the focused group's own result changes the panels; deeper results only change the map.
    if (node === state.focus) focusTouched = true;
    if (treeFrame) return;
    treeFrame = requestAnimationFrame(function () {
      treeFrame = 0;
      if (!state.root) return;
      views.update();
      if (focusTouched) {
        focusTouched = false;
        renderSidebar();
        renderStageNote();
        if (settings.view === 'florets') renderFlorets(true);
        scheduleRecords();
      }
      renderAbout();
    });
  }

  /** Zooms to a topic and, if needed, finds its subtopics. */
  function focusOn(node, opts) {
    opts = opts || {};
    if (!node || !state.root) return Promise.resolve(null);
    var changed = node !== state.focus;
    state.focus = node;
    state.shown = PAGE;
    if (changed) {
      // The canvas follows the focus even while the florets are shown, so switching views keeps the place.
      views.setFocus(node, { animate: settings.view !== 'florets' && opts.animate !== false });
      if (settings.view === 'florets') renderFlorets(opts.animate !== false);
      if (opts.updateHash !== false) writeHash(!!opts.replace);
    }
    // Start clustering first: small groups become leaves at once, so the panels below are right.
    var done = expand(node, true);
    renderSidebar();
    renderCrumbs();
    renderStageNote();
    renderRecordsHead();
    if (opts.scroll) { renderRecords(); scrollToRecords(); } else scheduleRecords();
    return done.then(function (n) {
      if (state.focus === node) lookAhead(readyKids(node), true);
      return n;
    });
  }

  async function followPath(labels, opts) {
    opts = opts || {};
    var gen = state.treeGen;
    var node = state.root;
    for (var i = 0; i < labels.length; i++) {
      await expand(node, true);
      if (gen !== state.treeGen) return;
      var next = readyKids(node).find(function (c) { return c.label === labels[i]; });
      if (!next) break;
      node = next;
    }
    if (gen !== state.treeGen) return;
    focusOn(node, { updateHash: opts.updateHash, replace: opts.replace, animate: opts.animate });
  }

  function summaryText() {
    var r = state.result, s = state.search, src = shownSource();
    var topics = r.clusters.filter(function (c) { return !c.other; }).length;
    var seconds = (r.timings.total / 1000).toFixed(r.timings.total < 1000 ? 2 : 1);
    var shown = state.articles.length;
    var head;
    if (s && s.total > shown && src.matchesAnyWord) {
      head = src.name + ' ranks ' + fmt(s.total) + ' records against these words. The best ' + fmt(shown) + ' are grouped';
    } else if (s && s.total > shown) {
      head = fmt(s.total) + ' records match. The first ' + fmt(shown) + ' are grouped';
    } else {
      head = plural(shown, 'record') + ' grouped';
    }
    return head + ' into ' + plural(topics, 'topic') + ' by ' + ALGORITHM_NAMES[r.algorithm] + ' in ' + seconds + ' s.';
  }

  // ---------------------------------------------------------------- colours

  var dark = Colors.isDark();

  // Swatches beside names are small marks: they wear the stronger tier of the
  // topic's hue (the maps' fills are too soft at that size).
  function hexOf(node) {
    return Colors.hex(Colors.markOf(node, dark));
  }

  /** A node's own mark colour (null for the whole search). */
  function ownHex(node) {
    return node.parent ? Colors.hex(Colors.markOf(node, dark)) : null;
  }

  /** The florets' colours: buds of the topic's mark, stems of it faded into the stage. */
  function floretColors(col) {
    return {
      fill: Colors.hex(col),
      stroke: Colors.hex(Colors.mix(col, dark ? Colors.WHITE : Colors.BLACK, dark ? 0.18 : 0.22)),
      ray: Colors.hex(Colors.mix(col, Colors.stage(dark), 0.45)),
    };
  }

  // ---------------------------------------------------------------- rendering

  function showResults(animate) {
    $('landing').hidden = true;
    $('results').hidden = false;
    applyView();
    views.setData(state.root, state.focus, { animate: animate });
    if (settings.view === 'florets') renderFlorets(animate);
    renderSidebar();
    renderCrumbs();
    renderStageNote();
    renderCaption();
    renderRecords();
    renderAbout();
  }

  function renderSidebar() {
    var f = state.focus;
    if (!f) return;
    var kids = readyKids(f);
    var topics = kids.filter(real);
    $('topics-title').textContent = f.parent ? 'Subtopics' : 'Topics';
    $('topics-count').textContent = kids.length ? plural(topics.length, f.parent ? 'subtopic' : 'topic') : '';
    var html = '';
    if (f.parent) {
      html += '<li><button type="button" class="is-up" data-node="' + esc(f.parent.id) + '" title="Zoom out to ' + esc(f.parent.label) + '">' +
        '<span class="mark" aria-hidden="true">‹</span><span class="topic-name">' + esc(f.parent.label) + '</span><span class="topic-count">' + fmt(f.parent.size) + '</span></button></li>';
    }
    html += '<li><button type="button" class="is-current" data-node="' + esc(f.id) + '" aria-current="true">' +
      '<span class="mark" aria-hidden="true">' + (f.parent ? '<span class="swatch" style="background:' + ownHex(f) + '"></span>' : '') + '</span>' +
      '<span class="topic-name">' + esc(f.label) + '</span><span class="topic-count">' + fmt(f.size) + '</span></button></li>';
    kids.forEach(function (c) {
      var title = c.label + (c.merged && c.merged.length ? '; also ' + c.merged.join(', ') : '');
      html += '<li><button type="button" class="is-child' + (c.other ? ' is-other' : '') + '" data-node="' + esc(c.id) + '" title="' + esc(title) + '">' +
        '<span class="mark" aria-hidden="true"><span class="swatch' + (c.other ? ' hatched' : '') + '" style="background:' + hexOf(c) + '"></span></span>' +
        '<span class="topic-name">' + esc(c.label) + '</span><span class="topic-count">' + fmt(c.size) + '</span></button></li>';
    });
    if (f.status === 'pending' || f.status === 'idle') {
      html += '<li class="topics-note"><span class="spinner" aria-hidden="true"></span>Finding subtopics in these ' + plural(f.size, 'record') + '…</li>';
    } else if (!kids.length) {
      html += '<li class="topics-note">' + (f.size < SUB_MIN ? 'Too few records to split further.' : 'No smaller topics stand out in these records.') + '</li>';
    }
    $('topic-list').innerHTML = html;
  }

  function renderCrumbs() {
    var path = [];
    for (var n = state.focus; n; n = n.parent) path.unshift(n);
    $('crumbs').innerHTML = path.map(function (node, i) {
      var sw = node.parent ? '<span class="swatch" style="background:' + ownHex(node) + '"></span>' : '';
      if (i === path.length - 1) return '<span class="crumb current" aria-current="location">' + sw + esc(node.label) + '</span>';
      return '<button type="button" class="crumb" data-node="' + esc(node.id) + '">' + sw + esc(node.label) + '</button><span class="crumb-sep" aria-hidden="true">›</span>';
    }).join('');
    $('stage-up').hidden = !state.focus.parent;
  }

  function renderStageNote() {
    var f = state.focus, note = $('stage-note');
    var busy = f.status === 'pending' || f.status === 'idle';
    note.textContent = busy ? 'Finding subtopics in ' + plural(f.size, 'record') + '…' : '';
    note.hidden = !busy;
    note.classList.toggle('busy', busy);
    renderCaption();
  }

  var CAPTIONS = {
    bubbles: 'Bubbles are topics, sized by their records; the beads along a bubble are its subtopics. Click a bubble to zoom in and cluster inside it; click the space between bubbles to zoom out.',
    treemap: 'Cells are topics, sized by their records, with their subtopics inside them. Click a cell to zoom in and cluster inside it.',
    radial: 'The inner ring holds the topics and the outer rings their subtopics. Click a segment to zoom in and cluster inside it; click the centre to zoom out.',
    florets: 'Each floret is a topic and each bud one record. Click one to zoom in and cluster inside it.',
  };

  var UNITS = { bubbles: 'circle', treemap: 'cell', radial: 'segment', florets: 'bud' };

  function renderCaption() {
    var f = state.focus;
    var text = CAPTIONS[settings.view];
    if (f && f.status === 'leaf' && f.parent) {
      text = (f.size < SUB_MIN ? 'Too few records to split further' : 'No smaller topics stand out here') +
        ', so each ' + UNITS[settings.view] + ' is one record' + (settings.view === 'florets' ? '.' : '; click one to read it below.');
    } else if (state.result && state.result.algorithm !== 'bkm') {
      text += ' A record can sit in several topics.';
    }
    $('map-caption').textContent = text;
  }

  // The height of the browser window with its toolbars showing, which does not
  // change while a phone's address bar slides in and out.
  var vhProbe = document.createElement('div');
  vhProbe.setAttribute('aria-hidden', 'true');
  vhProbe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:100vh;height:100svh;visibility:hidden;pointer-events:none';
  document.body.appendChild(vhProbe);

  function viewportHeight() {
    return vhProbe.offsetHeight || window.innerHeight || 800;
  }

  function stageHeight(width) {
    var vh = viewportHeight();
    if (mapExpanded) {
      var bar = document.querySelector('.map-figure .map-toolbar');
      var fig = $('map-figure');
      var cs = getComputedStyle(fig);
      var room = window.innerHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - (bar ? bar.offsetHeight + 10 : 50);
      return Math.round(Math.max(220, room));
    }
    // Phones held upright: a tall map, the whole width of the screen.
    if (width < 600) return Math.round(Math.max(330, Math.min(width * 1.2, vh - 150)));
    // Otherwise as large as fits on the screen below the toolbar.
    var ratio = vh > width ? 0.9 : 0.64;
    return Math.round(Math.max(300, Math.min(width * ratio, vh - 170, 1000)));
  }

  /** Slides the dark thumb of the map-style switch under the pressed button. */
  function placeThumb() {
    var sw = $('view-switch');
    var on = sw.querySelector('button[aria-pressed="true"]');
    var thumb = sw.querySelector('.seg-thumb');
    if (!on || !thumb || !on.offsetWidth) return;
    thumb.style.width = on.offsetWidth + 'px';
    thumb.style.transform = 'translateX(' + on.offsetLeft + 'px)';
    if (!sw.classList.contains('measured')) {
      // The first placement happens without sliding in from the edge.
      thumb.style.transition = 'none';
      sw.classList.add('measured');
      void thumb.offsetWidth;
      thumb.style.transition = '';
    }
  }

  function applyView() {
    var view = settings.view;
    Array.prototype.forEach.call($('view-switch').querySelectorAll('button'), function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-view') === view ? 'true' : 'false');
    });
    placeThumb();
    $('florets').toggleAttribute('hidden', view !== 'florets');  // an SVG element has no .hidden property
    $('stage').classList.toggle('is-florets', view === 'florets');
    views.setView(view);
    renderCaption();
  }

  function renderFlorets(animate) {
    var f = state.focus;
    if (!f) return;
    var kids = readyKids(f).filter(real);
    var shownAs = kids.length ? kids : [f];
    var width = Math.max(260, $('stage').clientWidth || 800);
    var height = stageHeight(width);
    $('florets').style.height = height + 'px';
    Florets.render($('florets'), {
      clusters: shownAs.map(function (n) { return { id: n.id, label: n.label, size: n.size, documents: n.docs }; }),
      selected: kids.length ? null : f.id,
      width: width,
      height: height,
      compact: width < 560,
      animate: animate && !reducedMotion(),
      ariaLabel: (kids.length ? 'Topics of ' : 'Records of ') + f.label,
      colorOf: function (c) {
        var n = state.nodes.get(c.id);
        if (!n) return null;
        return floretColors(Colors.markOf(n, dark));
      },
      onSelect: function (id) {
        var n = state.nodes.get(id);
        if (n && n !== state.focus) focusOn(n);
      },
    });
  }

  function visibleDocs() {
    return state.focus ? state.focus.docs : state.documents.map(function (_, i) { return i; });
  }

  /** Words to highlight: the labels on the way down to the focused topic. */
  function highlightTerms() {
    var terms = [];
    for (var n = state.focus; n && n.parent; n = n.parent) {
      if (n.other) continue;
      terms = terms.concat(n.labels.length ? n.labels : [n.label], n.merged || []);
    }
    return terms;
  }

  /** The topics shown in the records' "In:" line: the focus's subtopics, or its siblings when it has none. */
  function levelNodes() {
    var f = state.focus;
    var kids = readyKids(f).filter(real);
    if (kids.length) return kids;
    return f.parent ? readyKids(f.parent).filter(real) : [];
  }

  var recordTopics = new Map();
  var recordsTimer = 0;

  /**
   * Highlighting a page of records takes tens of milliseconds, so while the
   * map is zooming the list waits for the zoom to finish.
   */
  function scheduleRecords() {
    clearTimeout(recordsTimer);
    var wait = views.busyFor();
    $('records').classList.toggle('stale', wait > 0);
    if (wait <= 0) { renderRecords(); return; }
    recordsRun++; // a list still being filled in for the last topic stops here
    recordsTimer = setTimeout(function () { recordsTimer = 0; renderRecords(); }, wait + 40);
  }

  var recordsRun = 0;
  var listFocus = null; // the topic whose records are in the list
  var CHUNK = 8;
  // The rest of a list is filled in when the browser has nothing else to do.
  var whenIdle = window.requestIdleCallback
    ? function (fn) { window.requestIdleCallback(fn, { timeout: 250 }); }
    : function (fn) { setTimeout(fn, 0); };

  /**
   * Renders the list a few records at a time, so highlighting never holds up
   * a frame. `upTo` renders at least that many records at once (to reveal one);
   * `append` keeps the records already in the list and adds the rest.
   */
  function renderRecords(upTo, append) {
    var f = state.focus;
    if (!f) return;
    clearTimeout(recordsTimer);
    recordsTimer = 0;
    var run = ++recordsRun;
    $('records').classList.remove('stale');
    var docs = visibleDocs();
    var terms = highlightTerms();
    recordTopics = new Map();
    levelNodes().forEach(function (n) {
      n.docs.forEach(function (d) {
        var list = recordTopics.get(d);
        if (!list) recordTopics.set(d, (list = []));
        list.push(n);
      });
    });
    renderRecordsHead();
    var limit = Math.min(docs.length, state.shown);
    var list = $('records');
    var kept = append && listFocus === f ? list.querySelectorAll('li.record').length : 0;
    listFocus = f;
    var first = Math.min(limit, Math.max(kept + CHUNK, upTo || 0));
    var html = '';
    for (var i = kept; i < first; i++) html += renderRecord(docs[i], terms);
    if (kept) list.insertAdjacentHTML('beforeend', html);
    else list.innerHTML = docs.length ? html : '<li class="empty">No records here.</li>';
    var next = first;
    var more = function () {
      if (run !== recordsRun) return;
      var end = Math.min(limit, next + CHUNK), chunk = '';
      for (var k = next; k < end; k++) chunk += renderRecord(docs[k], terms);
      list.insertAdjacentHTML('beforeend', chunk);
      next = end;
      if (next < limit) whenIdle(more);
    };
    if (next < limit) whenIdle(more);
    var rest = docs.length - limit;
    $('more-wrap').hidden = rest <= 0;
    if (rest > 0) $('more').textContent = 'Show ' + fmt(Math.min(PAGE, rest)) + ' more of ' + fmt(rest);
  }

  function renderRecordsHead() {
    var f = state.focus;
    if (!f) return;
    var n = f.docs.length;
    $('records-title').textContent = f.parent ? f.label : 'All records';
    var sub;
    if (!f.parent) {
      sub = plural(n, 'record') + ' from ' + shownSource().name + ' for “' + shownQuery() + '”';
    } else if (f.other) {
      sub = plural(n, 'record') + ' the algorithm did not place in a ' + (f.depth > 1 ? 'subtopic of ' + f.parent.label : 'topic');
    } else {
      sub = plural(n, 'record') + (f.parent.parent ? ' in ' + f.parent.label : '');
      if (f.merged && f.merged.length) sub += '. Also covers ' + f.merged.join(', ');
    }
    $('records-sub').textContent = sub;
  }

  /** Where a record appeared: journal, preprint server, repository, sponsor… */
  function venueOf(a) {
    var j = a.journal || {};
    return j.isoAbbreviation || j.title || a.publisher || '';
  }

  function citationHtml(a) {
    var j = a.journal || {};
    var parts = [];
    if (a.authorString) parts.push(esc(a.authorString.replace(/\.$/, '')) + '.');
    var venue = venueOf(a);
    var where = '';
    if (venue) where += '<i>' + esc(venue.replace(/\.$/, '')) + '</i>. ';
    if (a.pubDate && a.pubDate.text) where += esc(a.pubDate.text);
    else if (a.year) where += a.year;
    if (j.volume) where += ';' + esc(j.volume) + (j.issue ? '(' + esc(j.issue) + ')' : '');
    if (j.pages) where += ':' + esc(j.pages);
    if (where) parts.push(where.trim().replace(/\.$/, '') + '.');
    var tags = a.tags && a.tags.length ? a.tags : D.notableTypes(a.publicationTypes);
    var flagged = tags.filter(function (t) { return /Retract/.test(t); });
    var normal = tags.filter(function (t) { return !/Retract/.test(t); }).slice(0, 3);
    if (normal.length) parts.push(esc(normal.join(', ')) + '.');
    var ids = (a.links || []).filter(function (l) { return D.safeUrl(l.url); }).map(function (l) {
      return '<span class="ids">' + esc(l.label) + ': <a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.text) + '</a></span>';
    }).join(' ');
    var html = parts.join(' ') + (ids ? ' ' + ids : '');
    if (flagged.length) html = '<b style="color:var(--danger)">' + esc(flagged.join(', ')) + '.</b> ' + html;
    return html;
  }

  /** Abstract excerpt that starts at the sentence holding the first highlighted word. */
  function excerpt(text, terms) {
    if (!terms.length) return D.highlightHtml(text, []);
    var prepared = D.prepareText(text);
    var spans = D.highlightSpans(prepared, terms);
    if (!spans.length || spans[0].start < 220) return D.highlightHtml(prepared, terms);
    var cut = prepared.lastIndexOf('. ', spans[0].start);
    var from = cut > 0 ? cut + 2 : Math.max(0, spans[0].start - 80);
    return '… ' + D.highlightHtml(prepared.slice(from), terms);
  }

  function renderRecord(d, terms) {
    var a = state.articles[d];
    if (!a) return '';
    var expanded = state.expanded.has(a.id);
    var title = highlightMarkup(a.titleHtml || esc(a.title || '(no title)'), terms);
    var html = '<li class="record" data-doc="' + d + '">';
    html += '<h3>' + (D.safeUrl(a.url) ? '<a href="' + esc(a.url) + '" target="_blank" rel="noopener">' + title + '</a>' : title) + '</h3>';
    html += '<p class="citation">' + citationHtml(a) + '</p>';
    if (a.abstract) {
      if (expanded) {
        html += '<div class="abstract">';
        if (a.abstractSections.length > 1 || (a.abstractSections[0] && a.abstractSections[0].label)) {
          a.abstractSections.forEach(function (s) {
            html += '<p class="abstract-section">' + (s.label ? '<b>' + esc(sentenceCase(s.label)) + '</b>' : '') + highlightMarkup(s.html, terms) + '</p>';
          });
        } else {
          html += '<p class="abstract-section">' + highlightMarkup(a.abstractSections[0] ? a.abstractSections[0].html : esc(a.abstract), terms) + '</p>';
        }
        html += '</div>';
        var mesh = (a.mesh || []).filter(function (m) { return m && m.descriptor && !D.MESH_CHECK_TAGS.has(m.descriptor.toLowerCase()); });
        if (mesh.length) {
          html += '<p class="mesh">MeSH: ' + mesh.map(function (m) { return m.major || (m.qualifiers || []).some(function (q) { return q.major; }) ? '<b>' + esc(m.descriptor) + '</b>' : esc(m.descriptor); }).join(', ') + '</p>';
        }
        if (a.keywords && a.keywords.length) html += '<p class="mesh">' + esc(shownSource().keywordsLabel || 'Keywords') + ': ' + a.keywords.map(esc).join(', ') + '</p>';
      } else {
        html += '<p class="abstract clamped">' + excerpt(a.abstract, terms) + '</p>';
      }
    } else {
      html += '<p class="abstract"><i>No abstract in ' + esc(shownSource().name) + '.</i></p>';
    }
    html += '<div class="record-foot">';
    if (a.abstract) {
      var whole = a.type === 'page' ? 'text' : a.type === 'trial' ? 'summary' : 'abstract';
      var more = a.abstractSections.length > 1 || (a.keywords && a.keywords.length) || (a.mesh && a.mesh.length) || a.abstract.length > 260;
      if (more) html += '<button type="button" class="btn btn-quiet" data-toggle="' + esc(a.id) + '" aria-expanded="' + expanded + '">' + (expanded ? 'Hide full ' + whole : 'Show full ' + whole) + '</button>';
    }
    var topics = recordTopics.get(d) || [];
    if (topics.length) {
      var f = state.focus;
      html += '<span class="in-topics">In: ' + topics.map(function (n) {
        var col = ownHex(n) || hexOf(n);
        return '<button type="button" data-node="' + esc(n.id) + '"' + (n === f ? ' aria-current="true"' : '') + '><span class="swatch" style="background:' + col + '"></span>' + esc(n.label) + '</button>';
      }).join(', ') + '</span>';
    }
    html += '</div></li>';
    return html;
  }

  function countComputed(node) {
    var n = 0;
    readyKids(node).forEach(function (c) { if (c.status === 'ready') n++; n += countComputed(c); });
    return n;
  }

  function renderAbout() {
    var r = state.result, s = state.search;
    if (!r) return;
    var rows = [];
    var add = function (k, v) { if (v !== undefined && v !== null && v !== '') rows.push('<dt>' + esc(k) + '</dt><dd>' + esc(String(v)) + '</dd>'); };
    var src = shownSource();
    add('Source', src.name);
    add(src.id === 'pubmed' ? 'PubMed query' : 'Query as run', s && s.queryTranslation);
    add(src.matchesAnyWord ? 'Records ranked' : 'Records matched', s && fmt(s.total));
    add('Requests to ' + src.name, s && s.requests ? fmt(s.requests) : null);
    add('Records clustered', fmt(state.documents.length));
    add('Algorithm', ALGORITHM_NAMES[r.algorithm] + (r.algorithm === 'lingo' ? ', ' + r.parameters.matrixReducer.factorizationFactory + ' factorization' : ''));
    add('Ran in', (clusterer.mode === 'worker' ? 'a background worker' : 'the page') + ', ' + r.timings.total + ' ms');
    var st = r.stats || {};
    add('Words and stems', st.words != null ? fmt(st.words) + ' words, ' + fmt(st.stems) + ' stems' : null);
    if (st.phrases) add('Frequent phrases', fmt(st.phrases));
    if (st.labelCandidates) add('Label candidates', fmt(st.labelCandidates));
    if (st.matrixRows) add('Term-document matrix', fmt(st.matrixRows) + ' terms × ' + fmt(state.documents.length) + ' records');
    if (st.baseVectors) add('Concepts', fmt(st.baseVectors));
    if (st.baseClusters) add('Base clusters', fmt(st.baseClusters));
    if (state.root) {
      var computed = countComputed(state.root);
      add('Topics split into subtopics', computed ? fmt(computed) + (helper ? ', some ahead of time in a second worker' : '') : 'none yet');
    }
    if (r.warnings && r.warnings.length) add('Parameter notes', r.warnings.join('; '));
    if (s && s.warnings && s.warnings.length) add('Notes from ' + src.name, s.warnings.join('; '));
    if (state.language !== 'en') add('Language', (D.listLanguages().find(function (l) { return l.code === state.language; }) || {}).name || state.language);
    add('Library', 'Broccoli ' + D.VERSION);
    $('about-list').innerHTML = rows.join('');
  }

  function scrollToRecords() {
    var head = $('records-title');
    var rect = head.getBoundingClientRect();
    if (rect.top > window.innerHeight || rect.top < 0) {
      head.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    }
  }

  /** Shows one record in the list: opens its abstract and scrolls to it. */
  function revealRecord(doc, node) {
    if (state.focus.docs.indexOf(doc) < 0 && node && node !== state.focus) {
      focusOn(node);
    }
    var docs = visibleDocs();
    var pos = docs.indexOf(doc);
    if (pos < 0) return;
    if (pos >= state.shown) state.shown = Math.ceil((pos + 1) / PAGE) * PAGE;
    var a = state.articles[doc];
    if (a) state.expanded.add(a.id);
    renderRecords(pos + 1);
    var li = $('records').querySelector('.record[data-doc="' + doc + '"]');
    if (li) {
      li.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
      li.classList.remove('flash');
      void li.offsetWidth;
      li.classList.add('flash');
    }
  }

  // ---------------------------------------------------------------- the maps

  var views = Views.create($('stage'), {
    height: stageHeight,
    unit: 'record',
    onFocus: function (node) { focusOn(node); },
    onUp: function () { if (state.focus && state.focus.parent) focusOn(state.focus.parent); },
    onRecord: function (doc, node) { revealRecord(doc, node); },
    recordInfo: function (doc) {
      var a = state.articles[doc];
      if (!a) return null;
      return { title: a.title || '(no title)', meta: [venueOf(a), a.year].filter(Boolean).join(', ') };
    },
  });

  // ---------------------------------------------------------------- exports

  function selectedArticles() {
    return visibleDocs().map(function (d) { return state.articles[d]; }).filter(Boolean);
  }

  function exportName(ext) {
    var f = state.focus;
    return 'broccoli-' + slug(shownQuery()) + (f && f.parent ? '-' + slug(f.label) : '') + '.' + ext;
  }

  function serializeTree(node) {
    var out = {
      label: node.label,
      size: node.size,
      ids: node.docs.map(function (d) { return state.articles[d] && state.articles[d].id; }).filter(Boolean),
    };
    if (shownSource().id === 'pubmed') out.pmids = out.ids;
    if (node.other) out.other = true;
    var kids = readyKids(node);
    if (kids.length) out.subtopics = kids.map(serializeTree);
    return out;
  }

  // ---------------------------------------------------------------- landing

  /** The current source's example searches: [query, size of its floret]. */
  function examples() {
    return currentSource().examples.map(function (e) { return [e.query, e.weight]; });
  }

  function renderExamplesList() {
    $('examples-list').innerHTML = examples().map(function (e, i) {
      return '<li><button type="button" data-example="' + i + '">' + esc(e[0]) + '</button></li>';
    }).join('');
  }

  function renderLanding() {
    var svg = $('landing-florets');
    var figure = svg.parentNode;
    var list = examples();
    figure.hidden = !list.length;  // a source of your own may come without examples
    var width = Math.max(260, figure.clientWidth || 640);
    var compact = width < 560;
    var height = Math.round(Math.max(compact ? 300 : 360, Math.min(480, width * (compact ? 0.9 : 0.66))));
    var clusters = list.map(function (e, i) {
      return { id: i, label: e[0], size: e[1], documents: [] };
    });
    Florets.render(svg, {
      clusters: clusters,
      selected: null,
      width: width,
      height: height,
      compact: compact,
      unit: 'search',
      ariaLabel: 'Example searches',
      colorOf: function (c) {
        return floretColors(Colors.markSlot(c.id, dark, false));
      },
      onSelect: function (id) { runSearch(list[id][0]); },
    });
    // The buds of the examples are decoration: drop the counts.
    Array.prototype.forEach.call(svg.querySelectorAll('.count'), function (n) { n.remove(); });
    Array.prototype.forEach.call(svg.querySelectorAll('.floret'), function (g) {
      var id = +g.getAttribute('data-id');
      g.setAttribute('aria-label', 'Search for ' + list[id][0]);
      var t = g.querySelector('title');
      if (t) t.textContent = 'Search for ' + list[id][0];
    });
  }

  function showLanding() {
    state.runId++;
    state.clusterJob++;
    state.treeGen++;
    ahead.queue = [];
    if (state.controller) state.controller.abort();
    state.query = '';
    state.source = null;
    state.search = null;
    state.pendingNext = null;
    state.result = null;
    state.root = null;
    state.focus = null;
    state.articles = [];
    state.documents = [];
    $('q').value = '';
    $('results').hidden = true;
    $('landing').hidden = false;
    setStatus('');
    setProgress(null);
    setBusy(false);
    renderLanding();
  }

  // ---------------------------------------------------------------- URL state

  // a source's filters that are on, comma-separated ('' when none)
  function filterKey(src, filters) {
    filters = filters || filtersFor(src);
    return src.filters.filter(function (f) { return filters[f.id]; }).map(function (f) { return f.id; }).join(',');
  }

  function defaultFilterKey(src) {
    return src.filters.filter(function (f) { return f.default; }).map(function (f) { return f.id; }).join(',');
  }

  function searchKey() {
    var src = currentSource();
    return [src.id, limitFor(src), sortFor(src), src.years ? settings.fromYear + '-' + settings.toYear : '', filterKey(src), settingsFor(src).lang || ''].join('|');
  }

  function writeHash(replace) {
    var src = currentSource();
    var p = new URLSearchParams();
    var path = focusPath();
    if (src.id !== DEFAULTS.source) p.set('s', src.id);
    // A path to a topic belongs to the records on show, so it travels with their query.
    p.set('q', path.length ? shownQuery() : state.query);
    if (settings.retmax !== DEFAULTS.retmax) p.set('n', settings.retmax);
    if (sortFor(src) !== 'relevance') p.set('sort', sortFor(src));
    if (settings.algorithm !== DEFAULTS.algorithm) p.set('a', settings.algorithm);
    if (src.years && settings.fromYear) p.set('from', settings.fromYear);
    if (src.years && settings.toYear) p.set('to', settings.toYear);
    // the filters, when not the defaults: a shared link finds the same records anywhere
    if (filterKey(src) !== defaultFilterKey(src)) p.set('f', filterKey(src) || 'none');
    var lang = settingsFor(src).lang;
    if (lang && lang !== 'en') p.set('lang', lang);
    if (settings.view !== DEFAULTS.view) p.set('v', settings.view);
    if (path.length) p.set('p', path.join('|'));
    var hash = '#' + p.toString();
    if (location.hash !== hash) {
      lastHash = hash;
      try {
        if (replace) history.replaceState(null, '', hash); else history.pushState(null, '', hash);
      } catch (e) { location.hash = hash; }
    }
  }

  var lastHash = location.hash;

  function readHash() {
    var p = new URLSearchParams(location.hash.replace(/^#/, ''));
    if (!p.get('q')) {
      // A link to a source alone (#s=arxiv) opens it, ready for a search.
      if (p.get('s') && SOURCES.some(function (x) { return x.id === p.get('s'); })) settings.source = p.get('s');
      return { q: null, path: [] };
    }
    // A search link carries its whole state; anything it leaves out is the default.
    settings.source = sourceOf(p.get('s') || DEFAULTS.source).id;
    var src = currentSource();
    var n = parseInt(p.get('n'), 10);
    if (n > 0) settings.retmax = Math.min(2000, n);
    else settings.retmax = DEFAULTS.retmax;
    var sort = p.get('sort') === 'pub_date' ? 'date' : p.get('sort');  // pub_date: PubMed links before 1.4
    settings.sort = src.sorts.some(function (o) { return o.id === sort; }) ? sort : 'relevance';
    settings.algorithm = ALGORITHM_NAMES[p.get('a')] ? p.get('a') : DEFAULTS.algorithm;
    settings.fromYear = p.get('from') || '';
    settings.toYear = p.get('to') || '';
    var on = {};
    (p.get('f') !== null ? p.get('f') : defaultFilterKey(src)).split(',').forEach(function (k) { on[k.trim()] = true; });
    settings.filters[src.id] = {};
    src.filters.forEach(function (f) { settings.filters[src.id][f.id] = !!on[f.id]; });
    if ((src.settings || []).some(function (d) { return d.id === 'lang'; })) {
      var own = settings.sourceSettings[src.id] = settings.sourceSettings[src.id] || {};
      own.lang = p.get('lang') || 'en';
    }
    if (viewName(p.get('v'))) settings.view = viewName(p.get('v'));
    var path = p.get('p') ? p.get('p').split('|').filter(Boolean) : [];
    return { q: p.get('q'), path: path };
  }

  function onHashChange() {
    // popstate and hashchange can both fire for one navigation.
    if (location.hash === lastHash) return;
    lastHash = location.hash;
    var before = searchKey(), algorithm = settings.algorithm, view = settings.view, source = settings.source;
    var h = readHash();
    if (settings.source !== source) applySource();
    syncControls();
    if (settings.view !== view) applyView();
    if (h.q && h.q === state.query && state.documents.length && searchKey() === before) {
      if (settings.algorithm !== algorithm) { recluster({ animate: true, path: h.path }); return; }
      // Only the place in the topics changed: zoom there.
      if (state.root) followPath(h.path, { updateHash: false, animate: true });
      return;
    }
    if (h.q) runSearch(h.q, { updateHash: false, path: h.path });
    else showLanding();
  }

  // ---------------------------------------------------------------- source tabs

  // Every tab is always in sight: the tabs wrap onto more lines where the
  // row is narrow, a group of sources (biomedicine, preprints…) at a time.
  function renderSourceTabs() {
    var groups = [];
    SOURCES.forEach(function (src) {
      var last = groups[groups.length - 1];
      if (!last || last.name !== src.group) groups.push(last = { name: src.group, html: '' });
      var on = src.id === settings.source;
      last.html += '<button type="button" role="tab" class="source-tab" id="tab-' + esc(src.id) + '" data-source="' + esc(src.id) + '" aria-selected="' + on + '"' +
        ' aria-controls="search-form" tabindex="' + (on ? 0 : -1) + '" title="' + esc(src.name + ': ' + src.description) + '">' + esc(src.shortName) + '</button>';
    });
    $('source-tabs').innerHTML = groups.map(function (g) { return '<span class="tab-group" role="presentation">' + g.html + '</span>'; }).join('');
  }

  /** Brings the page in line with the current source: tabs, placeholder, options, filters, notes. */
  function applySource() {
    var src = currentSource();
    Array.prototype.forEach.call($('source-tabs').querySelectorAll('[role="tab"]'), function (t) {
      var on = t.getAttribute('data-source') === src.id;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
    });
    // Phones have room for the example alone; the tab above says where it searches.
    $('q').placeholder = window.innerWidth < 600 && src.placeholder ? 'e.g. ' + src.placeholder : 'Search ' + src.name + (src.placeholder ? ', e.g. ' + src.placeholder : '');
    $('q-label').textContent = 'Search ' + src.name;
    $('opt-sort').innerHTML = src.sorts.map(function (o) { return '<option value="' + esc(o.id) + '">' + esc(o.label) + '</option>'; }).join('');
    $('opt-sort').disabled = src.sorts.length < 2;
    var limits = LIMITS.filter(function (n) { return n <= src.maxLimit; });
    if (limits.indexOf(src.maxLimit) < 0 && src.maxLimit < LIMITS[LIMITS.length - 1]) limits.push(src.maxLimit);
    $('opt-retmax').innerHTML = limits.map(function (n) { return '<option value="' + n + '">' + fmt(n) + '</option>'; }).join('');
    renderSourceNote();
    renderSourceFilters();
    renderSourceCredit();
    if (!$('landing').hidden) { renderLanding(); renderExamplesList(); }
  }

  function linkHtml(href, text) {
    return '<a href="' + esc(href) + '" target="_blank" rel="noopener">' + esc(text) + '</a>';
  }

  /** What the selected source is, how to query it, and where its API is documented. */
  function renderSourceNote() {
    var src = currentSource();
    var links = [src.homepage ? linkHtml(src.homepage, src.name) : '', src.docs ? linkHtml(src.docs, 'API') : '', src.terms ? linkHtml(src.terms, 'terms') : ''].filter(Boolean);
    $('source-name').textContent = src.name;
    $('source-about').textContent = src.description;
    $('source-syntax').innerHTML = esc(src.syntax || '') + (links.length ? ' <span class="source-links">' + links.join(' · ') + '</span>' : '');
  }

  function renderSourceCredit() {
    var src = currentSource();
    $('source-credit').innerHTML = 'Records come straight from ' + (src.homepage ? linkHtml(src.homepage, src.name) : esc(src.name)) +
      (src.docs ? ' through ' + linkHtml(src.docs, 'its API') : '') + ' to this page. ' + plural(SOURCES.length, 'source') + ' to choose from: ' +
      SOURCES.map(function (x) { return esc(x.name); }).join(', ') + '.';
  }

  function selectSource(id) {
    if (id === settings.source || !SOURCES.some(function (x) { return x.id === id; })) return;
    settings.source = id;
    saveSettings();
    applySource();
    syncControls();
    if (state.query) runSearch(state.query);
    else {
      try { history.replaceState(null, '', '#s=' + encodeURIComponent(id)); } catch (e) { /* ignore */ }
      lastHash = location.hash;
    }
  }

  // ---------------------------------------------------------------- filters and keys in Settings

  function renderSourceFilters() {
    var src = currentSource();
    $('filters-legend').textContent = 'Search filters: ' + src.name;
    $('years-row').hidden = !src.years;
    var on = filtersFor(src);
    var html = src.filters.map(function (f) {
      return '<label class="check"><input type="checkbox" data-filter="' + esc(f.id) + '"' + (on[f.id] ? ' checked' : '') + '><span>' +
        esc(f.label) + (f.help ? '<small>' + esc(f.help) + '</small>' : '') + '</span></label>';
    }).join('');
    var own = settingsFor(src);
    (src.settings || []).filter(function (d) { return d.type === 'select'; }).forEach(function (d) {
      html += '<label class="field"><span>' + esc(d.label) + '</span><select data-choice="' + esc(d.id) + '">' +
        (d.options || []).map(function (o) { return '<option value="' + esc(o.id) + '"' + (String(own[d.id]) === String(o.id) ? ' selected' : '') + '>' + esc(o.label) + '</option>'; }).join('') +
        '</select>' + (d.help ? '<small>' + esc(d.help) + '</small>' : '') + '</label>';
    });
    if (!html && !src.years) html = '<p class="hint">' + esc(src.name) + ' has no filters to set.</p>';
    $('source-filters').innerHTML = html;
  }

  /** Keys, contact e-mails and proxy addresses, for every source that takes them. */
  function renderAccess() {
    var html = '';
    SOURCES.forEach(function (src) {
      if (src.settingsFrom) return;
      var items = (src.settings || []).filter(function (d) { return d.type !== 'select'; });
      if (!items.length) return;
      var users = [src.name].concat(SOURCES.filter(function (x) { return x.settingsFrom === src.id; }).map(function (x) { return x.name; }));
      var own = settings.sourceSettings[src.id] || {};
      html += '<div class="access-group"><h3>' + esc(users.join(' and ')) + '</h3>';
      items.forEach(function (d) {
        var type = d.type === 'secret' ? 'password' : d.type === 'email' ? 'email' : d.type === 'url' ? 'url' : 'text';
        html += '<label class="field"><span>' + esc(d.label) + '</span><input type="' + type + '" data-access="' + esc(src.id) + '" data-key="' + esc(d.id) + '"' +
          ' value="' + esc(own[d.id] || '') + '"' + (d.placeholder ? ' placeholder="' + esc(d.placeholder) + '"' : '') +
          (type === 'email' ? ' autocomplete="email"' : ' autocomplete="off"') + ' spellcheck="false">' + (d.help ? '<small>' + esc(d.help) + '</small>' : '') + '</label>';
      });
      html += '</div>';
    });
    $('access').innerHTML = html;
  }

  /** The record buttons: what "Copy" copies, and whether "Open in PubMed" applies. */
  function renderRecordActions() {
    var recs = state.articles;
    var src = shownSource();
    var kind = copyKind(recs, src);
    $('copy-ids').textContent = 'Copy ' + kind.label;
    $('open-pubmed').hidden = !recs.some(function (a) { return a.pmid; });
  }

  function copyKind(recs, src) {
    if (recs.length && recs.every(function (a) { return a.pmid; })) return { label: 'PMIDs', of: function (a) { return a.pmid; } };
    if (src.idLabel === 'arXiv' || (recs.length && recs.every(function (a) { return a.arxiv; }))) return { label: 'arXiv IDs', of: function (a) { return a.arxiv || a.id; } };
    if (src.idLabel === 'NCT number') return { label: 'NCT numbers', of: function (a) { return a.id; } };
    if (recs.length && recs.every(function (a) { return a.doi; })) return { label: 'DOIs', of: function (a) { return a.doi; } };
    if (src.kinds.indexOf('page') >= 0) return { label: 'links', of: function (a) { return a.url; } };
    return { label: 'IDs', of: function (a) { return a.id; } };
  }

  // ---------------------------------------------------------------- settings

  function applyTheme() {
    var root = document.documentElement;
    var theme = themeSetting();
    if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
    else root.removeAttribute('data-theme');
    dark = Colors.isDark();
    syncThemeSwitch();
  }

  /** The header's light and dark switch shows the theme on screen. */
  function syncThemeSwitch() {
    var b = $('theme-switch');
    if (!b) return;
    var on = Colors.isDark();
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.title = on ? 'Switch to the light theme' : 'Switch to the dark theme';
  }

  /** Tells the page around the search page (a site that hosts it) which theme the reader picked. */
  function announceTheme() {
    try { window.dispatchEvent(new CustomEvent('broccoli:themechange', { detail: { theme: settings.theme } })); } catch (e) { /* old browser */ }
  }

  function themeChanged() {
    dark = Colors.isDark();
    syncThemeSwitch();
    if (!$('landing').hidden) renderLanding();
    if (!state.root) return;
    views.refresh();
    renderSidebar();
    renderCrumbs();
    renderRecords();
    if (settings.view === 'florets') renderFlorets(false);
  }

  function syncControls() {
    var src = currentSource();
    var limit = String(limitFor(src));
    $('opt-retmax').value = limit;
    if ($('opt-retmax').value !== limit) {
      var o = document.createElement('option');
      o.value = limit;
      o.textContent = fmt(+limit);
      $('opt-retmax').appendChild(o);
      $('opt-retmax').value = limit;
    }
    $('opt-sort').value = sortFor(src);
    Array.prototype.forEach.call($('opt-algorithm').querySelectorAll('button'), function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-algorithm') === settings.algorithm ? 'true' : 'false');
    });
    Array.prototype.forEach.call($('view-switch').querySelectorAll('button'), function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-view') === settings.view ? 'true' : 'false');
    });
    $('opt-from').value = settings.fromYear;
    $('opt-to').value = settings.toYear;
    renderSourceFilters();
    renderAccess();
    $('opt-mesh').checked = settings.mesh;
    $('opt-biomedical').checked = settings.biomedical;
    $('opt-stopwords').value = settings.stopwords;
    $('opt-stoplabels').value = settings.stoplabels;
    $('opt-labelformat').value = settings.labelFormat;
    $('opt-theme').value = settings.theme;
    buildParams();
  }

  function effectiveParams(algorithm) {
    var preset = (D.PRESETS.abstracts.parameters || {})[algorithm] || {};
    var own = Object.assign({}, settings.params[algorithm] || {});
    if (algorithm === 'bkm' && own.clusterCount === undefined && state.documents.length) {
      own.clusterCount = Math.max(4, Math.min(30, Math.round(1.2 * Math.sqrt(state.documents.length))));
    }
    return D.resolveParameters(algorithm, Object.assign({}, preset, own)).params;
  }

  function getPath(obj, path) {
    return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
  }

  function buildParams() {
    var algorithm = settings.algorithm;
    var info = D.listAlgorithms().find(function (a) { return a.id === algorithm; });
    var values = effectiveParams(algorithm);
    $('params-legend').textContent = info.name + ' parameters';
    $('params-hint').textContent = info.description + ' Changes regroup the current records at once.';
    var groups = [];
    info.attributes.forEach(function (a) {
      var g = groups.find(function (x) { return x.name === a.group; });
      if (!g) { g = { name: a.group, items: [] }; groups.push(g); }
      g.items.push(a);
    });
    var html = '';
    groups.forEach(function (g, gi) {
      html += '<details class="param-group"' + (gi === 0 ? ' open' : '') + '><summary>' + esc(g.name) + '</summary>';
      g.items.forEach(function (a) {
        var id = 'p-' + a.path.replace(/\./g, '-');
        var v = getPath(values, a.path);
        if (a.type === 'boolean') {
          html += '<label class="check"><input type="checkbox" id="' + id + '" data-path="' + a.path + '"' + (v ? ' checked' : '') + '><span>' +
            esc(a.label) + '<small>' + esc(a.description) + '</small></span></label>';
        } else if (a.type === 'enum') {
          html += '<label class="field"><span>' + esc(a.label) + '</span><select id="' + id + '" data-path="' + a.path + '">' +
            a.options.map(function (o) { return '<option' + (o === v ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') +
            '</select><small>' + esc(a.description) + '</small></label>';
        } else {
          html += '<label class="field"><span>' + esc(a.label) + '</span><input type="number" id="' + id + '" data-path="' + a.path + '" data-type="' + a.type + '"' +
            (a.min != null ? ' min="' + a.min + '"' : '') + (a.max != null ? ' max="' + a.max + '"' : '') +
            ' step="' + (a.step || (a.type === 'integer' ? 1 : 'any')) + '" value="' + esc(String(v)) + '"><small>' + esc(a.description) + '</small></label>';
        }
      });
      html += '</details>';
    });
    $('params').innerHTML = html;
  }

  var reclusterTimer = null;
  function scheduleRecluster() {
    clearTimeout(reclusterTimer);
    reclusterTimer = setTimeout(function () { if (state.documents.length || state.pendingNext) recluster(); }, 350);
  }

  function openSettings(opener) {
    state.lastSettingsOpener = opener || document.activeElement;
    $('settings').classList.add('open');
    $('scrim').hidden = false;
    setTimeout(function () { $('close-settings').focus(); }, 30);
  }

  function closeSettings() {
    $('settings').classList.remove('open');
    $('scrim').hidden = true;
    if (state.lastSettingsOpener && state.lastSettingsOpener.focus) state.lastSettingsOpener.focus();
  }

  // ---------------------------------------------------------------- events

  $('search-form').addEventListener('submit', function (e) {
    e.preventDefault();
    runSearch($('q').value);
  });

  $('home-link').addEventListener('click', function (e) {
    e.preventDefault();
    try { history.pushState(null, '', location.pathname + location.search); } catch (err) { location.hash = ''; }
    lastHash = location.hash;
    showLanding();
  });

  $('opt-retmax').addEventListener('change', function () {
    settings.retmax = parseInt(this.value, 10) || DEFAULTS.retmax;
    saveSettings();
    if (state.query) runSearch(state.query);
  });

  $('opt-sort').addEventListener('change', function () {
    settings.sort = this.value;
    saveSettings();
    if (state.query) runSearch(state.query);
  });

  $('source-tabs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-source]');
    if (b) selectSource(b.getAttribute('data-source'));
  });

  $('source-tabs').addEventListener('keydown', function (e) {
    var tabs = Array.prototype.slice.call(this.querySelectorAll('[role="tab"]'));
    var i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    var next = null;
    if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
    else if (e.key === 'ArrowLeft') next = tabs[(i + tabs.length - 1) % tabs.length];
    else if (e.key === 'Home') next = tabs[0];
    else if (e.key === 'End') next = tabs[tabs.length - 1];
    if (!next) return;
    e.preventDefault();
    tabs.forEach(function (t) { t.tabIndex = t === next ? 0 : -1; });
    next.focus();
  });

  $('opt-algorithm').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-algorithm]');
    if (!b) return;
    settings.algorithm = b.getAttribute('data-algorithm');
    saveSettings();
    syncControls();
    if (state.documents.length || state.pendingNext) {
      state.focus = state.root;
      writeHash();
      recluster({ animate: true, fresh: true });
    } else if (state.query) writeHash();
  });

  $('view-switch').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-view]');
    if (!b || b.getAttribute('data-view') === settings.view) return;
    settings.view = b.getAttribute('data-view');
    saveSettings();
    applyView();
    if (state.root) {
      if (settings.view === 'florets') renderFlorets(true);
      renderStageNote();
      writeHash(true);
    }
  });

  var navigate = function (e) {
    var b = e.target.closest('[data-node]');
    if (!b) return false;
    var node = state.nodes.get(b.getAttribute('data-node'));
    if (node && node !== state.focus) focusOn(node, { scroll: e.currentTarget === $('records') });
    return true;
  };

  $('topic-list').addEventListener('click', navigate);
  $('crumbs').addEventListener('click', navigate);

  $('stage-up').addEventListener('click', function () {
    if (state.focus && state.focus.parent) focusOn(state.focus.parent);
  });

  $('stage').addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && settings.view === 'florets' && state.focus && state.focus.parent) {
      e.preventDefault();
      focusOn(state.focus.parent);
    }
  });

  $('records').addEventListener('click', function (e) {
    var t = e.target.closest('button[data-toggle]');
    if (t) {
      var id = t.getAttribute('data-toggle');
      if (state.expanded.has(id)) state.expanded.delete(id); else state.expanded.add(id);
      var li = t.closest('.record');
      var d = +li.getAttribute('data-doc');
      li.outerHTML = renderRecord(d, highlightTerms());
      var again = $('records').querySelector('.record[data-doc="' + d + '"] button[data-toggle]');
      if (again) again.focus();
      return;
    }
    navigate(e);
  });

  $('more').addEventListener('click', function () {
    state.shown += PAGE;
    renderRecords(0, true);
  });

  $('copy-ids').addEventListener('click', function () {
    var recs = selectedArticles();
    var kind = copyKind(state.articles, shownSource());
    var ids = recs.map(kind.of).filter(Boolean);
    copyText(ids.join('\n')).then(function () {
      toast('Copied ' + fmt(ids.length) + ' ' + (ids.length === 1 ? kind.label.replace(/s$/, '') : kind.label));
    }, function () { toast('Could not copy to the clipboard'); });
  });

  $('open-pubmed').addEventListener('click', function () {
    var ids = selectedArticles().map(function (a) { return a.pmid; }).filter(Boolean).slice(0, 200);
    if (!ids.length) { toast('None of these records has a PMID'); return; }
    var term = ids.map(function (id) { return id + '[pmid]'; }).join(' OR ');
    window.open('https://pubmed.ncbi.nlm.nih.gov/?term=' + encodeURIComponent(term), '_blank', 'noopener');
  });

  $('export-menu').addEventListener('click', function (e) {
    if (e.target.closest('.menu-list button')) this.open = false;
  });
  document.addEventListener('click', function (e) {
    var menu = $('export-menu');
    if (menu.open && !menu.contains(e.target)) menu.open = false;
  });

  $('examples-list').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-example]');
    if (b) runSearch(examples()[+b.getAttribute('data-example')][0]);
  });

  $('export-ris').addEventListener('click', function () {
    download(exportName('ris'), D.toRis(selectedArticles()), 'application/x-research-info-systems');
  });

  $('export-bib').addEventListener('click', function () {
    download(exportName('bib'), D.toBibtex(selectedArticles()), 'application/x-bibtex');
  });

  $('export-csv').addEventListener('click', function () {
    var docs = visibleDocs();
    var articles = docs.map(function (d) { return state.articles[d]; });
    // toCsv expects topic document indices relative to the exported rows.
    var position = new Map(docs.map(function (d, i) { return [d, i]; }));
    var topics = levelNodes().map(function (n) {
      return { label: n.label, documents: n.docs.filter(function (d) { return position.has(d); }).map(function (d) { return position.get(d); }) };
    });
    download(exportName('csv'), '﻿' + D.toCsv(articles, topics), 'text/csv;charset=utf-8');
  });

  $('export-json').addEventListener('click', function () {
    download('broccoli-' + slug(shownQuery()) + '.json', D.toJson(state.result, state.articles, {
      source: shownSource().id,
      query: shownQuery(),
      sourceQuery: state.search && state.search.queryTranslation,
      matched: state.search && state.search.total,
      focus: focusPath(),
      topicTree: state.root ? serializeTree(state.root) : null,
    }), 'application/json');
  });

  // Settings drawer.
  $('open-settings').addEventListener('click', function () { openSettings(this); });
  $('close-settings').addEventListener('click', closeSettings);
  $('scrim').addEventListener('click', closeSettings);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && $('settings').classList.contains('open')) { closeSettings(); return; }
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      var tag = (document.activeElement && document.activeElement.tagName) || '';
      if (!/INPUT|TEXTAREA|SELECT/.test(tag)) { e.preventDefault(); $('q').focus(); $('q').select(); }
    }
  });

  var bindSetting = function (id, apply, after) {
    $(id).addEventListener('change', function () {
      apply(this);
      saveSettings();
      if (after) after();
    });
  };
  var researchHint = function () { if (state.query) toast('Applies to your next search'); };
  bindSetting('opt-from', function (el) { settings.fromYear = el.value.trim(); }, researchHint);
  bindSetting('opt-to', function (el) { settings.toYear = el.value.trim(); }, researchHint);

  $('source-filters').addEventListener('change', function (e) {
    var el = e.target;
    var src = currentSource();
    if (el.hasAttribute('data-filter')) {
      settings.filters[src.id] = Object.assign(filtersFor(src), settings.filters[src.id] || {});
      settings.filters[src.id][el.getAttribute('data-filter')] = el.checked;
    } else if (el.hasAttribute('data-choice')) {
      var key = src.settingsFrom || src.id;
      settings.sourceSettings[key] = settings.sourceSettings[key] || {};
      settings.sourceSettings[key][el.getAttribute('data-choice')] = el.value;
    } else return;
    saveSettings();
    researchHint();
  });

  $('access').addEventListener('change', function (e) {
    var el = e.target;
    var id = el.getAttribute('data-access');
    if (!id) return;
    settings.sourceSettings[id] = settings.sourceSettings[id] || {};
    settings.sourceSettings[id][el.getAttribute('data-key')] = el.value.trim();
    saveSettings();
  });
  bindSetting('opt-mesh', function (el) { settings.mesh = el.checked; }, function () {
    if (state.pendingNext) state.pendingNext.documents = makeDocuments(state.pendingNext.articles);
    if (state.articles.length || state.pendingNext) { rebuildDocuments(); scheduleRecluster(); }
  });
  bindSetting('opt-biomedical', function (el) { settings.biomedical = el.checked; }, scheduleRecluster);
  bindSetting('opt-stopwords', function (el) { settings.stopwords = el.value; }, scheduleRecluster);
  bindSetting('opt-stoplabels', function (el) { settings.stoplabels = el.value; }, scheduleRecluster);
  bindSetting('opt-labelformat', function (el) { settings.labelFormat = el.value; }, scheduleRecluster);
  // A theme picked in the settings wins over the embedding page's until it sends another.
  bindSetting('opt-theme', function (el) { settings.theme = el.value; embedTheme = null; }, function () { applyTheme(); themeChanged(); announceTheme(); });
  // The header's switch: light or dark, saved like the setting, and it too wins over the embedding page's.
  $('theme-switch').addEventListener('click', function () {
    settings.theme = Colors.isDark() ? 'light' : 'dark';
    embedTheme = null;
    saveSettings();
    $('opt-theme').value = settings.theme;
    applyTheme();
    themeChanged();
    announceTheme();
  });

  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onScheme = function () { if (themeSetting() === 'system') themeChanged(); };
    if (mq.addEventListener) mq.addEventListener('change', onScheme); else if (mq.addListener) mq.addListener(onScheme);
  }

  window.addEventListener('message', function (e) {
    var d = e.data;
    if (e.source !== window.parent || window.parent === window || !d || d.type !== 'broccoli:theme' || !THEMES[d.theme]) return;
    if (d.theme === embedTheme) return;
    embedTheme = d.theme;
    applyTheme();
    themeChanged();
  });

  $('params').addEventListener('change', function (e) {
    var el = e.target;
    var path = el.getAttribute('data-path');
    if (!path) return;
    var algo = settings.algorithm;
    var value = el.type === 'checkbox' ? el.checked : el.tagName === 'SELECT' ? el.value : Number(el.value);
    if (typeof value === 'number' && !Number.isFinite(value)) return;
    settings.params[algo] = settings.params[algo] || {};
    settings.params[algo][path] = value;
    saveSettings();
    scheduleRecluster();
  });

  $('reset-params').addEventListener('click', function () {
    settings.params[settings.algorithm] = {};
    saveSettings();
    buildParams();
    scheduleRecluster();
    toast(ALGORITHM_NAMES[settings.algorithm].replace(/^./, function (c) { return c.toUpperCase(); }) + ' parameters reset');
  });

  var resizeTimer = null;
  var lastSize = window.innerWidth + 'x' + viewportHeight();
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      // A phone's address bar sliding in and out changes only the window's height: nothing to redo.
      var size = window.innerWidth + 'x' + viewportHeight();
      if (size === lastSize && !mapExpanded) return;
      lastSize = size;
      placeThumb();
      if (!$('results').hidden && state.root) {
        views.refresh();
        if (settings.view === 'florets') renderFlorets(false);
      }
      if (!$('landing').hidden) renderLanding();
    }, 140);
  });

  // ---------------------------------------------------------------- the map on the whole screen

  var mapExpanded = false;

  function setExpanded(on) {
    if (on === mapExpanded) return;
    mapExpanded = on;
    $('map-figure').classList.toggle('expanded', on);
    document.body.classList.toggle('map-expanded', on);
    $('expand-map').setAttribute('aria-pressed', on ? 'true' : 'false');
    $('expand-map').setAttribute('title', on ? 'Back to the page' : 'Show the map on the whole screen');
    $('expand-map').setAttribute('aria-label', on ? 'Close full screen map' : 'Full screen map');
    placeThumb();
    views.refresh();
    if (settings.view === 'florets') renderFlorets(false);
    if (on) views.focusCanvas();
  }

  $('expand-map').addEventListener('click', function () { setExpanded(!mapExpanded); });

  document.addEventListener('keydown', function (e) {
    // Escape inside the map zooms out first; at the top it closes the full screen map.
    if (e.key === 'Escape' && mapExpanded && !e.defaultPrevented) { e.preventDefault(); setExpanded(false); }
  });

  window.addEventListener('popstate', onHashChange);
  window.addEventListener('hashchange', onHashChange);

  // Canvas text waits for the bundled fonts.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { placeThumb(); if (state.root) views.refresh(); });

  // ---------------------------------------------------------------- start

  applyTheme();
  var initial = readHash();
  renderSourceTabs();
  applySource();
  syncControls();
  $('version-line').textContent = 'Broccoli ' + D.VERSION + ' · a GenesisL1 project · MIT License, Decentralized Science Labs LLC.';
  renderExamplesList();
  if (initial.q) runSearch(initial.q, { updateHash: false, path: initial.path });
  else renderLanding();

  // For automated checks and the console.
  window.BroccoliApp = {
    state: state, settings: settings, runSearch: runSearch, recluster: recluster, focusOn: focusOn,
    expand: expand, views: views, clusterer: clusterer, get helper() { return helper; },
    selectSource: selectSource, sources: SOURCES,
  };
})();
