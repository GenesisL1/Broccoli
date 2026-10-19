/*
 * A small synthetic corpus with four known topics, written for the tests.
 * Sentences come from templates with random variations (seeded), so the
 * topic phrases recur while the words around them change, as in real text.
 */

import D from './target.js';

const TOPICS = {
  physics: {
    titles: [
      '{Fast|Accurate|Parallel} Monte Carlo simulation of particle transport {in water|in tissue|in detectors}',
      'Variance reduction for Monte Carlo simulation of radiation dose',
      'Radiation dose {estimates|maps|calculations} from Monte Carlo simulation',
    ],
    sentences: [
      '{We use|Here we apply|This work employs} Monte Carlo simulation to {model|estimate|study} particle transport {through tissue|in water|in shielding}.',
      '{Variance reduction|Importance sampling} {speeds up|accelerates} the Monte Carlo simulation {considerably|by an order of magnitude}.',
      'The radiation dose was {computed|estimated|tallied} for {photon|electron|proton} beams.',
      'Particle transport {in heterogeneous media|near interfaces|in voxel phantoms} remains {challenging|slow}.',
      'Simulated radiation dose {distributions|profiles} {agree|match} with {measurements|film data}.',
    ],
  },
  genomics: {
    titles: [
      'Gene expression {profiling|atlas|dynamics} with RNA sequencing',
      'Differential expression analysis of RNA sequencing data {in yeast|in mice|in human tissues}',
      'Transcription factors {controlling|shaping} gene expression',
    ],
    sentences: [
      'Gene expression was {measured|quantified|profiled} by RNA sequencing in {three tissues|liver samples|cell lines}.',
      'Differential expression analysis {identified|revealed} {hundreds of|many} regulated genes.',
      'Transcription factors {bind promoters|recruit cofactors} and {regulate|control} gene expression.',
      'RNA sequencing reads were {aligned|mapped} to the {reference genome|transcriptome} {before|prior to} differential expression testing.',
      '{Several|Multiple} transcription factors showed {tissue specific|stage specific} gene expression.',
    ],
  },
  vision: {
    titles: [
      'Convolutional neural networks for image classification {on mobile devices|in medicine|at scale}',
      'Deep learning {models|methods} for {medical|satellite} image classification',
      'Training data {augmentation|selection} for convolutional neural networks',
    ],
    sentences: [
      'Convolutional neural networks {achieve|reach} {strong|high} image classification accuracy.',
      'Deep learning {requires|needs} {large amounts of|plenty of} labeled training data.',
      'We {augment|enlarge} the training data with {rotations|crops|color jitter} for image classification.',
      'Deep learning {models|systems} built from convolutional neural networks {transfer well|generalize} across datasets.',
      'Image classification errors {drop|fall} as training data {grows|increases}.',
    ],
  },
  hypertension: {
    titles: [
      'Blood pressure control with antihypertensive drugs {in older adults|in primary care}',
      'A randomized trial of hypertension treatment {targets|strategies}',
      'Antihypertensive drugs and blood pressure {variability|response}',
    ],
    sentences: [
      'Blood pressure {fell|decreased} after {twelve|eight|six} weeks of antihypertensive drugs.',
      'In this randomized trial hypertension treatment {reduced|lowered} {cardiovascular events|strokes}.',
      'Antihypertensive drugs were {titrated|adjusted} to reach the blood pressure target.',
      'Adherence to hypertension treatment was {monitored|recorded} {throughout|during} the randomized trial.',
      '{Systolic|Diastolic} blood pressure {decreased|dropped} more with {combination|dual} antihypertensive drugs.',
    ],
  },
};

const FILLER_WORDS = ['overall', 'cohort', 'sites', 'season', 'protocol', 'budget', 'region', 'archive', 'sample',
  'volunteers', 'laboratory', 'workflow', 'scanner', 'software', 'interview', 'baseline', 'calendar', 'cluster'];

function expand(template, rnd) {
  return template.replace(/\{([^}]*)\}/g, (_, alts) => {
    const options = alts.split('|');
    return options[Math.floor(rnd() * options.length)];
  });
}

/** Returns { documents: [{ id, title, snippet }], truth: string[] } with `perTopic` documents per topic. */
export function syntheticCorpus(perTopic = 15, seed = 2026) {
  const rnd = D.createRandom(seed);
  const documents = [];
  const truth = [];
  const names = Object.keys(TOPICS);
  for (let i = 0; i < perTopic; i++) {
    for (const name of names) {
      const t = TOPICS[name];
      const picks = [];
      while (picks.length < 3) {
        const k = Math.floor(rnd() * t.sentences.length);
        if (!picks.includes(k)) picks.push(k);
      }
      // Noise: a common word, a number and a (practically) unique code word.
      const code = Array.from({ length: 6 }, () => 'bcdfghjklmnpqrstvwxz'[Math.floor(rnd() * 20)]).join('');
      const filler = 'See ' + FILLER_WORDS[Math.floor(rnd() * FILLER_WORDS.length)] + ' record ' + code + ' (' +
        (10 + Math.floor(rnd() * 90)) + ').';
      documents.push({
        id: name + '-' + i,
        title: expand(t.titles[Math.floor(rnd() * t.titles.length)], rnd),
        snippet: picks.map((k) => expand(t.sentences[k], rnd)).join(' ') + ' ' + filler,
      });
      truth.push(name);
    }
  }
  return { documents, truth };
}

/** Weighted purity of non-"other" clusters. */
export function purity(clusters, truth) {
  let correct = 0, total = 0;
  for (const c of clusters) {
    if (c.other) continue;
    const counts = {};
    for (const d of c.documents) counts[truth[d]] = (counts[truth[d]] || 0) + 1;
    correct += Math.max(...Object.values(counts));
    total += c.documents.length;
  }
  return total ? correct / total : 0;
}

/** Topics that have a cluster of at least minSize documents that is at least minPurity pure. */
export function recoveredTopics(clusters, truth, minSize = 5, minPurity = 0.8) {
  const found = new Set();
  for (const c of clusters) {
    if (c.other || c.documents.length < minSize) continue;
    const counts = {};
    for (const d of c.documents) counts[truth[d]] = (counts[truth[d]] || 0) + 1;
    const [topic, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (n / c.documents.length >= minPurity) found.add(topic);
  }
  return found;
}
