/*
 * Broccoli — GenesisL1's open-source search results clustering engine.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * Off-main-thread clustering. createClusterer() returns an object whose
 * cluster() method runs in a Web Worker when one can be started and falls
 * back to the calling thread otherwise, with the same promise-based API.
 *
 * The single-file builds (dist/broccoli.js, dist/broccoli.mjs) register their
 * own source so the worker can be started from a Blob URL with no extra
 * file (this also works when the page is opened from disk). When using the
 * ES modules in src/ directly, pass { workerUrl: 'src/worker-entry.js',
 * workerType: 'module' }.
 */

import { cluster, VERSION } from './engine.js';
import { isBuiltInLanguage } from '../text/language.js';

let bundleSource = null;

/** Called by the single-file builds with the source of their factory function. */
export function setBundleSource(source) {
  bundleSource = source;
}

/** Installs the message protocol inside a worker scope. */
export function installWorker(scope) {
  scope.onmessage = (event) => {
    const msg = event.data || {};
    if (msg.type !== 'cluster') return;
    const { id, documents, options } = msg;
    try {
      const result = cluster(documents, Object.assign({}, options, {
        onProgress: (stage, fraction) => scope.postMessage({ type: 'progress', id, stage, fraction }),
      }));
      scope.postMessage({ type: 'result', id, result });
    } catch (err) {
      scope.postMessage({ type: 'error', id, message: (err && err.message) || String(err) });
    }
  };
  scope.postMessage({ type: 'ready', version: VERSION });
}

function inlineCluster(documents, options) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(cluster(documents, options));
      } catch (err) {
        reject(err);
      }
    }, 0);
  });
}

/**
 * options = { worker: true | false (default true), workerUrl, workerType: 'classic' | 'module' }
 * Returns { mode, ready, cluster(documents, options) → Promise, terminate() }.
 */
export function createClusterer(options = {}) {
  let worker = null;
  let mode = 'inline';
  let nextId = 1;
  const pending = new Map();
  let readyResolve;
  const ready = new Promise((r) => { readyResolve = r; });

  const fallBack = (reason) => {
    if (worker) {
      try { worker.terminate(); } catch (e) { /* ignore */ }
    }
    worker = null;
    mode = 'inline';
    api.fallbackReason = reason;
    const jobs = [...pending.values()];
    pending.clear();
    for (const job of jobs) inlineCluster(job.documents, job.options).then(job.resolve, job.reject);
    readyResolve(mode);
  };

  const wantWorker = options.worker !== false && typeof Worker !== 'undefined';
  if (wantWorker) {
    try {
      if (options.workerUrl) {
        worker = new Worker(options.workerUrl, { type: options.workerType || 'classic' });
      } else if (bundleSource && typeof Blob !== 'undefined' && typeof URL !== 'undefined') {
        const code = 'var Broccoli = ' + bundleSource + '();\nBroccoli.installWorker(self);\n';
        const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
        worker = new Worker(url);
      }
    } catch (err) {
      worker = null;
    }
  }

  const api = {
    get mode() { return mode; },
    ready,
    fallbackReason: null,
    cluster(documents, clusterOptions = {}) {
      const { onProgress, ...rest } = clusterOptions;
      // A language registered on this page does not exist inside the worker.
      const language = clusterOptions.language || 'en';
      if (!worker || !isBuiltInLanguage(language)) return inlineCluster(documents, clusterOptions);
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject, onProgress, documents, options: clusterOptions });
        try {
          worker.postMessage({ type: 'cluster', id, documents, options: rest });
        } catch (err) {
          pending.delete(id);
          inlineCluster(documents, clusterOptions).then(resolve, reject);
        }
      });
    },
    terminate() {
      if (worker) worker.terminate();
      worker = null;
      for (const job of pending.values()) job.reject(new Error('Clusterer terminated'));
      pending.clear();
    },
  };

  if (worker) {
    mode = 'worker';
    worker.onmessage = (event) => {
      const msg = event.data || {};
      if (msg.type === 'ready') { readyResolve(mode); return; }
      const job = pending.get(msg.id);
      if (!job) return;
      if (msg.type === 'progress') {
        if (job.onProgress) job.onProgress(msg.stage, msg.fraction);
      } else if (msg.type === 'result') {
        pending.delete(msg.id);
        job.resolve(msg.result);
      } else if (msg.type === 'error') {
        pending.delete(msg.id);
        job.reject(new Error(msg.message));
      }
    };
    worker.onerror = (event) => {
      if (event && event.preventDefault) event.preventDefault();
      fallBack('Worker failed: ' + ((event && event.message) || 'unknown error'));
    };
  } else {
    readyResolve(mode);
  }
  return api;
}
