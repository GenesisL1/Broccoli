/*
 * Broccoli — browser-native search results clustering.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * Module worker entry for the unbundled sources:
 *   Broccoli.createClusterer({ workerUrl: 'src/worker-entry.js', workerType: 'module' })
 * (The single-file builds in dist/ need no worker file.)
 */

import { installWorker } from './engine/worker.js';

installWorker(self);
