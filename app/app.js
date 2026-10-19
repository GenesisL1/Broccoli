/*
 * Broccoli — PubMed search with topic clusters.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * The search page: PubMed E-utilities → clustering (in a Web Worker when
 * possible) → a tree of topics you can zoom into. Zooming into a topic
 * clusters its records again, so every level has its own subtopics; a second
 * worker works ahead on the topics you are likely to open next. A plain
 * script, so the page also works when opened straight from disk.
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
  var NOTABLE_TYPES = ['Retracted Publication', 'Retraction of Publication', 'Preprint', 'Systematic Review', 'Meta-Analysis',
    'Review', 'Randomized Controlled Trial', 'Clinical Trial', 'Case Reports', 'Practice Guideline', 'Guideline', 'Editorial', 'Comment'];
  var EXAMPLES = [
    ['long covid cognitive symptoms', 34],
    ['HLA class II autoimmunity', 30],
    ['GLP-1 receptor agonists heart failure', 28],
    ['CRISPR off-target effects', 24],
    ['gut microbiome depression', 22],
    ['CAR-T cell therapy solid tumors', 20],
    ['antimicrobial resistance wastewater', 17],
    ['protein thermostability prediction', 15],
    ['senolytics healthy aging', 13],
    ['glymphatic system sleep', 11],
  ];

  var DEFAULTS = {
    retmax: 200,
    sort: 'relevance',
    algorithm: 'lingo',
    view: 'treemap',
    fromYear: '',
    toYear: '',
    filters: { abstracts: true, english: false, humans: false, free: false, reviews: false, trials: false },
    mesh: false,
    biomedical: true,
    stopwords: '',
    stoplabels: '',
    labelFormat: 'title',
    params: { lingo: {}, stc: {}, bkm: {} },
    apiKey: '',
    email: '',
    baseUrl: '',
    theme: 'system',
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function loadSettings() {
    var s = clone(DEFAULTS);
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        Object.keys(s).forEach(function (k) {
          if (saved[k] === undefined) return;
          if (k === 'filters' || k === 'params') s[k] = Object.assign(s[k], saved[k]);
          else s[k] = saved[k];
        });
      }
    } catch (e) { /* storage unavailable: defaults */ }
    if (!ALGORITHM_NAMES[s.algorithm]) s.algorithm = 'lingo';
    s.view = viewName(s.view) || DEFAULTS.view;
    return s;
  }

  function saveSettings() {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
  }

  var settings = loadSettings();
  var state = {
    query: '',
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

  function setBusy(busy) {
    $('search-button').disabled = busy;
    $('search-button').textContent = busy ? 'Searching…' : 'Search';
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

  // ---------------------------------------------------------------- PubMed

  function makeClient() {
    return new D.PubMedClient({
      apiKey: settings.apiKey.trim() || undefined,
      email: settings.email.trim() || undefined,
      baseUrl: settings.baseUrl.trim() || undefined,
      tool: 'broccoli',
    });
  }

  /** The PubMed query with the filters from Settings. */
  function buildTerm(query) {
    var f = settings.filters;
    var parts = [];
    if (f.abstracts) parts.push('hasabstract');
    if (f.english) parts.push('english[lang]');
    if (f.humans) parts.push('humans[mh]');
    if (f.free) parts.push('free full text[sb]');
    if (f.reviews) parts.push('review[pt]');
    if (f.trials) parts.push('clinical trial[pt]');
    return parts.length ? '(' + query + ') AND ' + parts.join(' AND ') : query;
  }

  function errorMessage(err) {
    if (err && err.network) {
      return 'Could not reach PubMed. Check your connection. If a firewall blocks NCBI, set a proxy address under Settings, NCBI access.';
    }
    if (err && err.status === 429) return 'NCBI is limiting requests from this address. Wait a minute, or add an NCBI API key in Settings.';
    if (err && /ESearch: /.test(err.message)) return 'PubMed could not read the query: ' + err.message.replace(/^ESearch: /, '');
    return (err && err.message) || String(err);
  }

  async function runSearch(rawQuery, options) {
    options = options || {};
    var query = String(rawQuery || '').trim();
    if (!query) {
      setStatus('Type something to search for, for example: long covid cognitive symptoms');
      $('q').focus();
      return;
    }
    if (state.controller) state.controller.abort();
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    state.controller = controller;
    var signal = controller ? controller.signal : undefined;
    var runId = ++state.runId;
    state.query = query;
    $('q').value = query;
    if (options.updateHash !== false) {
      state.focus = null;
      writeHash();
    }
    setBusy(true);
    setStatus('Searching PubMed…');
    setProgress(0.04);
    try {
      var client = makeClient();
      var search = await client.search(buildTerm(query), {
        retmax: settings.retmax,
        sort: settings.sort,
        mindate: settings.fromYear || undefined,
        maxdate: settings.toYear || undefined,
        signal: signal,
      });
      if (runId !== state.runId) return;
      if (!search.ids.length) {
        var suggestion = null;
        try { suggestion = await client.spell(query, { signal: signal }); } catch (e) { /* no suggestion */ }
        if (runId !== state.runId) return;
        showNoMatches(query, suggestion, search);
        return;
      }
      setStatus('Found ' + plural(search.count, 'record') + '. Fetching the first ' + fmt(search.ids.length) + '…');
      setProgress(0.08);
      var articles = await client.fetchArticles(search.ids, {
        signal: signal,
        onProgress: function (done, total) {
          if (runId !== state.runId) return;
          setProgress(0.08 + 0.62 * (total ? done / total : 1));
          if (done > 0) setStatus('Fetching records: ' + fmt(done) + ' of ' + fmt(total));
        },
      });
      if (runId !== state.runId) return;
      state.search = search;
      state.articles = articles;
      state.expanded = new Set();
      rebuildDocuments();
      await recluster({ animate: true, path: options.path || [], fresh: true });
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      if (runId !== state.runId) return;
      setProgress(null);
      setStatus(errorMessage(err), true);
    } finally {
      if (runId === state.runId) setBusy(false);
    }
  }

  function showNoMatches(query, suggestion, search) {
    setProgress(null);
    var html = 'No PubMed records match <b>' + esc(query) + '</b>';
    if (Object.values(settings.filters).some(Boolean) || settings.fromYear || settings.toYear) html += ' with the current filters';
    html += '.';
    if (search && search.phrasesNotFound && search.phrasesNotFound.length) {
      html += ' PubMed found nothing for: ' + search.phrasesNotFound.map(esc).join(', ') + '.';
    }
    if (suggestion) {
      html += ' <button type="button" class="btn" id="try-suggestion">Search for ' + esc(suggestion) + ' instead</button>';
    }
    setStatusHtml(html);
    var b = $('try-suggestion');
    if (b) b.addEventListener('click', function () { runSearch(suggestion); });
  }

  function rebuildDocuments() {
    state.documents = D.toDocuments(state.articles, { includeMesh: settings.mesh, includeKeywords: settings.mesh });
  }

  // ---------------------------------------------------------------- clustering

  function lines(text) {
    return String(text || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
  }

  function clusterOptions() {
    var wordFilters = lines(settings.stopwords);
    var labelFilters = lines(settings.stoplabels);
    return {
      algorithm: settings.algorithm,
      preset: 'abstracts',
      extras: settings.biomedical ? ['biomedical'] : [],
      queryHint: state.query,
      fields: settings.mesh ? ['title', 'abstract', 'terms'] : ['title', 'abstract'],
      titleField: 'title',
      parameters: algorithmParameters(state.documents.length, false),
      dictionaries: {
        wordFilters: wordFilters.length ? [{ glob: wordFilters }] : [],
        labelFilters: labelFilters.length ? [{ glob: labelFilters }] : [],
      },
      labelFormat: settings.labelFormat,
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
    var hint = [state.query];
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
    if (!state.documents.length) return;
    var job = ++state.clusterJob;
    var keepPath = options.path && options.path.length ? options.path : options.fresh ? [] : focusPath();
    setStatus('Grouping ' + plural(state.documents.length, 'record') + ' into topics…');
    setProgress(0.75);
    var opts = clusterOptions();
    opts.onProgress = function (stage) {
      if (job === state.clusterJob && STAGES[stage]) setStatus(STAGES[stage]);
    };
    var result;
    try {
      result = await clusterer.cluster(state.documents, opts);
    } catch (err) {
      if (job !== state.clusterJob) return;
      setProgress(null);
      setStatus('Clustering failed: ' + ((err && err.message) || err), true);
      return;
    }
    if (job !== state.clusterJob) return;
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
    else if (options.fresh) writeHash(true);
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
    var r = state.result, s = state.search;
    var topics = r.clusters.filter(function (c) { return !c.other; }).length;
    var seconds = (r.timings.total / 1000).toFixed(r.timings.total < 1000 ? 2 : 1);
    var shown = state.articles.length;
    var head = s && s.count > shown
      ? fmt(s.count) + ' records match. The first ' + fmt(shown) + ' are grouped'
      : plural(shown, 'record') + ' grouped';
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
      sub = plural(n, 'record') + ' from PubMed for “' + state.query + '”';
    } else if (f.other) {
      sub = plural(n, 'record') + ' the algorithm did not place in a ' + (f.depth > 1 ? 'subtopic of ' + f.parent.label : 'topic');
    } else {
      sub = plural(n, 'record') + (f.parent.parent ? ' in ' + f.parent.label : '');
      if (f.merged && f.merged.length) sub += '. Also covers ' + f.merged.join(', ');
    }
    $('records-sub').textContent = sub;
  }

  function citationHtml(a) {
    var j = a.journal || {};
    var parts = [];
    if (a.authorString) parts.push(esc(a.authorString.replace(/\.$/, '')) + '.');
    var src = j.isoAbbreviation || j.title;
    var where = '';
    if (src) where += '<i>' + esc(src.replace(/\.$/, '')) + '</i>. ';
    if (a.pubDate && a.pubDate.text) where += esc(a.pubDate.text);
    else if (a.year) where += a.year;
    if (j.volume) where += ';' + esc(j.volume) + (j.issue ? '(' + esc(j.issue) + ')' : '');
    if (j.pages) where += ':' + esc(j.pages);
    if (where) parts.push(where.trim() + '.');
    var types = NOTABLE_TYPES.filter(function (t) { return (a.publicationTypes || []).indexOf(t) >= 0; });
    var flagged = types.filter(function (t) { return /Retract/.test(t); });
    var normal = types.filter(function (t) { return !/Retract/.test(t); }).slice(0, 2);
    if (normal.length) parts.push(esc(normal.join(', ')) + '.');
    var ids = '<span class="ids">PMID: <a href="' + esc(a.url) + '" target="_blank" rel="noopener">' + esc(a.pmid) + '</a></span>';
    if (a.pmcid) ids += ' <span class="ids">Free full text: <a href="https://pmc.ncbi.nlm.nih.gov/articles/' + esc(a.pmcid) + '/" target="_blank" rel="noopener">' + esc(a.pmcid) + '</a></span>';
    if (a.doi) ids += ' <span class="ids">doi: <a href="https://doi.org/' + esc(a.doi) + '" target="_blank" rel="noopener">' + esc(a.doi) + '</a></span>';
    var html = parts.join(' ') + ' ' + ids;
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
    var expanded = state.expanded.has(a.pmid);
    var title = highlightMarkup(a.titleHtml || esc(a.title || '(no title)'), terms);
    var html = '<li class="record" data-doc="' + d + '">';
    html += '<h3><a href="' + esc(a.url) + '" target="_blank" rel="noopener">' + title + '</a></h3>';
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
        var mesh = (a.mesh || []).filter(function (m) { return !D.MESH_CHECK_TAGS.has(m.descriptor.toLowerCase()); });
        if (mesh.length) {
          html += '<p class="mesh">MeSH: ' + mesh.map(function (m) { return m.major || m.qualifiers.some(function (q) { return q.major; }) ? '<b>' + esc(m.descriptor) + '</b>' : esc(m.descriptor); }).join(', ') + '</p>';
        }
        if (a.keywords && a.keywords.length) html += '<p class="mesh">Keywords: ' + a.keywords.map(esc).join(', ') + '</p>';
      } else {
        html += '<p class="abstract clamped">' + excerpt(a.abstract, terms) + '</p>';
      }
    } else {
      html += '<p class="abstract"><i>No abstract in PubMed.</i></p>';
    }
    html += '<div class="record-foot">';
    if (a.abstract) {
      html += '<button type="button" class="btn btn-quiet" data-toggle="' + esc(a.pmid) + '" aria-expanded="' + expanded + '">' + (expanded ? 'Hide full abstract' : 'Show full abstract') + '</button>';
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
    add('PubMed query', s && s.queryTranslation);
    add('Records matched', s && fmt(s.count));
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
    if (a) state.expanded.add(a.pmid);
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
      var j = a.journal || {};
      return { title: a.title || '(no title)', meta: [j.isoAbbreviation || j.title, a.year].filter(Boolean).join(', ') };
    },
  });

  // ---------------------------------------------------------------- exports

  function selectedArticles() {
    return visibleDocs().map(function (d) { return state.articles[d]; }).filter(Boolean);
  }

  function exportName(ext) {
    var f = state.focus;
    return 'broccoli-' + slug(state.query) + (f && f.parent ? '-' + slug(f.label) : '') + '.' + ext;
  }

  function serializeTree(node) {
    var out = {
      label: node.label,
      size: node.size,
      pmids: node.docs.map(function (d) { return state.articles[d] && state.articles[d].pmid; }).filter(Boolean),
    };
    if (node.other) out.other = true;
    var kids = readyKids(node);
    if (kids.length) out.subtopics = kids.map(serializeTree);
    return out;
  }

  // ---------------------------------------------------------------- landing

  function renderExamplesList() {
    $('examples-list').innerHTML = EXAMPLES.map(function (e, i) {
      return '<li><button type="button" data-example="' + i + '">' + esc(e[0]) + '</button></li>';
    }).join('');
  }

  function renderLanding() {
    var svg = $('landing-florets');
    var figure = svg.parentNode;
    var width = Math.max(260, figure.clientWidth || 640);
    var compact = width < 560;
    var height = Math.round(Math.max(compact ? 300 : 360, Math.min(480, width * (compact ? 0.9 : 0.66))));
    var clusters = EXAMPLES.map(function (e, i) {
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
      onSelect: function (id) { runSearch(EXAMPLES[id][0]); },
    });
    // The buds of the examples are decoration: drop the counts.
    Array.prototype.forEach.call(svg.querySelectorAll('.count'), function (n) { n.remove(); });
    Array.prototype.forEach.call(svg.querySelectorAll('.floret'), function (g) {
      var id = +g.getAttribute('data-id');
      g.setAttribute('aria-label', 'Search for ' + EXAMPLES[id][0]);
      var t = g.querySelector('title');
      if (t) t.textContent = 'Search for ' + EXAMPLES[id][0];
    });
  }

  function showLanding() {
    state.runId++;
    state.clusterJob++;
    state.treeGen++;
    ahead.queue = [];
    if (state.controller) state.controller.abort();
    state.query = '';
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

  // the filters on, comma-separated ('' when none)
  function filterKey(filters) {
    filters = filters || settings.filters;
    return Object.keys(DEFAULTS.filters).filter(function (k) { return filters[k]; }).join(',');
  }

  function searchKey() {
    return [settings.retmax, settings.sort, settings.fromYear, settings.toYear, filterKey()].join('|');
  }

  function writeHash(replace) {
    var p = new URLSearchParams();
    p.set('q', state.query);
    if (settings.retmax !== DEFAULTS.retmax) p.set('n', settings.retmax);
    if (settings.sort !== DEFAULTS.sort) p.set('sort', settings.sort);
    if (settings.algorithm !== DEFAULTS.algorithm) p.set('a', settings.algorithm);
    if (settings.fromYear) p.set('from', settings.fromYear);
    if (settings.toYear) p.set('to', settings.toYear);
    // the filters, when not the defaults: a shared link finds the same records anywhere
    if (filterKey() !== filterKey(DEFAULTS.filters)) p.set('f', filterKey() || 'none');
    if (settings.view !== DEFAULTS.view) p.set('v', settings.view);
    var path = focusPath();
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
    if (!p.get('q')) return { q: null, path: [] };
    // A search link carries its whole state; anything it leaves out is the default.
    var n = parseInt(p.get('n'), 10);
    if (n > 0) settings.retmax = Math.min(2000, n);
    else settings.retmax = DEFAULTS.retmax;
    settings.sort = p.get('sort') === 'pub_date' ? 'pub_date' : 'relevance';
    settings.algorithm = ALGORITHM_NAMES[p.get('a')] ? p.get('a') : DEFAULTS.algorithm;
    settings.fromYear = p.get('from') || '';
    settings.toYear = p.get('to') || '';
    var on = {};
    (p.get('f') !== null ? p.get('f') : filterKey(DEFAULTS.filters)).split(',').forEach(function (k) { on[k.trim()] = true; });
    Object.keys(DEFAULTS.filters).forEach(function (k) { settings.filters[k] = !!on[k]; });
    if (viewName(p.get('v'))) settings.view = viewName(p.get('v'));
    var path = p.get('p') ? p.get('p').split('|').filter(Boolean) : [];
    return { q: p.get('q'), path: path };
  }

  function onHashChange() {
    // popstate and hashchange can both fire for one navigation.
    if (location.hash === lastHash) return;
    lastHash = location.hash;
    var before = searchKey(), algorithm = settings.algorithm, view = settings.view;
    var h = readHash();
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

  // ---------------------------------------------------------------- settings

  function applyTheme() {
    var root = document.documentElement;
    if (settings.theme === 'light' || settings.theme === 'dark') root.setAttribute('data-theme', settings.theme);
    else root.removeAttribute('data-theme');
    dark = Colors.isDark();
  }

  function themeChanged() {
    dark = Colors.isDark();
    if (!$('landing').hidden) renderLanding();
    if (!state.root) return;
    views.refresh();
    renderSidebar();
    renderCrumbs();
    renderRecords();
    if (settings.view === 'florets') renderFlorets(false);
  }

  function syncControls() {
    $('opt-retmax').value = String(settings.retmax);
    if ($('opt-retmax').value !== String(settings.retmax)) {
      var o = document.createElement('option');
      o.value = String(settings.retmax);
      o.textContent = fmt(settings.retmax);
      $('opt-retmax').appendChild(o);
      $('opt-retmax').value = String(settings.retmax);
    }
    $('opt-sort').value = settings.sort;
    Array.prototype.forEach.call($('opt-algorithm').querySelectorAll('button'), function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-algorithm') === settings.algorithm ? 'true' : 'false');
    });
    Array.prototype.forEach.call($('view-switch').querySelectorAll('button'), function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-view') === settings.view ? 'true' : 'false');
    });
    $('opt-from').value = settings.fromYear;
    $('opt-to').value = settings.toYear;
    $('f-abstracts').checked = settings.filters.abstracts;
    $('f-english').checked = settings.filters.english;
    $('f-humans').checked = settings.filters.humans;
    $('f-free').checked = settings.filters.free;
    $('f-reviews').checked = settings.filters.reviews;
    $('f-trials').checked = settings.filters.trials;
    $('opt-mesh').checked = settings.mesh;
    $('opt-biomedical').checked = settings.biomedical;
    $('opt-stopwords').value = settings.stopwords;
    $('opt-stoplabels').value = settings.stoplabels;
    $('opt-labelformat').value = settings.labelFormat;
    $('opt-apikey').value = settings.apiKey;
    $('opt-email').value = settings.email;
    $('opt-baseurl').value = settings.baseUrl;
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
    reclusterTimer = setTimeout(function () { if (state.documents.length) recluster(); }, 350);
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

  $('opt-algorithm').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-algorithm]');
    if (!b) return;
    settings.algorithm = b.getAttribute('data-algorithm');
    saveSettings();
    syncControls();
    if (state.documents.length) {
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
      var pmid = t.getAttribute('data-toggle');
      if (state.expanded.has(pmid)) state.expanded.delete(pmid); else state.expanded.add(pmid);
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

  $('copy-pmids').addEventListener('click', function () {
    var ids = selectedArticles().map(function (a) { return a.pmid; });
    copyText(ids.join('\n')).then(function () { toast('Copied ' + plural(ids.length, 'PMID')); }, function () { toast('Could not copy to the clipboard'); });
  });

  $('open-pubmed').addEventListener('click', function () {
    var ids = selectedArticles().map(function (a) { return a.pmid; }).slice(0, 200);
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
    if (b) runSearch(EXAMPLES[+b.getAttribute('data-example')][0]);
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
    download('broccoli-' + slug(state.query) + '.json', D.toJson(state.result, state.articles, {
      query: state.query,
      pubmedQuery: state.search && state.search.queryTranslation,
      matched: state.search && state.search.count,
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
  [['f-abstracts', 'abstracts'], ['f-english', 'english'], ['f-humans', 'humans'], ['f-free', 'free'], ['f-reviews', 'reviews'], ['f-trials', 'trials']].forEach(function (pair) {
    bindSetting(pair[0], function (el) { settings.filters[pair[1]] = el.checked; }, researchHint);
  });
  bindSetting('opt-mesh', function (el) { settings.mesh = el.checked; }, function () { if (state.articles.length) { rebuildDocuments(); scheduleRecluster(); } });
  bindSetting('opt-biomedical', function (el) { settings.biomedical = el.checked; }, scheduleRecluster);
  bindSetting('opt-stopwords', function (el) { settings.stopwords = el.value; }, scheduleRecluster);
  bindSetting('opt-stoplabels', function (el) { settings.stoplabels = el.value; }, scheduleRecluster);
  bindSetting('opt-labelformat', function (el) { settings.labelFormat = el.value; }, scheduleRecluster);
  bindSetting('opt-apikey', function (el) { settings.apiKey = el.value.trim(); });
  bindSetting('opt-email', function (el) { settings.email = el.value.trim(); });
  bindSetting('opt-baseurl', function (el) { settings.baseUrl = el.value.trim(); });
  bindSetting('opt-theme', function (el) { settings.theme = el.value; }, function () { applyTheme(); themeChanged(); });

  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onScheme = function () { if (settings.theme === 'system') themeChanged(); };
    if (mq.addEventListener) mq.addEventListener('change', onScheme); else if (mq.addListener) mq.addListener(onScheme);
  }

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
  syncControls();
  $('version-line').textContent = 'Broccoli ' + D.VERSION + ' · MIT License, Decentralized Science Labs LLC.';
  renderExamplesList();
  if (initial.q) runSearch(initial.q, { updateHash: false, path: initial.path });
  else renderLanding();

  // For automated checks and the console.
  window.BroccoliApp = {
    state: state, settings: settings, runSearch: runSearch, recluster: recluster, focusOn: focusOn,
    expand: expand, views: views, clusterer: clusterer, get helper() { return helper; },
  };
})();
