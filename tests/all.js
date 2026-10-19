/* Imports every test file; the runner pages call runAll(). */
import './test-text.js';
import './test-core.js';
import './test-preprocessing.js';
import './test-algorithms.js';
import './test-pubmed.js';
import './test-sources.js';
import './test-worker.js';
import './test-views.js';

export { runAll } from './harness.js';
