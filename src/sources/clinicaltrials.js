/*
 * Broccoli — browser-native search results clustering.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * ClinicalTrials.gov: registered clinical studies from around the world,
 * through its API (version 2). A study's brief summary is its abstract;
 * its conditions, keywords and interventions are its subject terms.
 * https://clinicaltrials.gov/data-api/api
 */

import { buildUrl } from './http.js';
import { unescapeMarkdown } from './markup.js';
import { parseIsoDate } from './records.js';

export const CLINICALTRIALS_STUDIES = 'https://clinicaltrials.gov/api/v2/studies';

const FIELDS = ['NCTId', 'BriefTitle', 'OfficialTitle', 'Acronym', 'OverallStatus', 'StartDate', 'PrimaryCompletionDate',
  'CompletionDate', 'LeadSponsorName', 'BriefSummary', 'Condition', 'Keyword', 'Phase', 'StudyType', 'InterventionType',
  'InterventionName', 'EnrollmentCount', 'HasResults'];

const SORTS = { relevance: '@relevance', date: 'StartDate:desc' };

const STATUS = {
  RECRUITING: 'Recruiting', NOT_YET_RECRUITING: 'Not yet recruiting', ACTIVE_NOT_RECRUITING: 'Active, not recruiting',
  ENROLLING_BY_INVITATION: 'Enrolling by invitation', COMPLETED: 'Completed', SUSPENDED: 'Suspended', TERMINATED: 'Terminated',
  WITHDRAWN: 'Withdrawn', UNKNOWN: 'Unknown status', AVAILABLE: 'Available', NO_LONGER_AVAILABLE: 'No longer available',
  TEMPORARILY_NOT_AVAILABLE: 'Temporarily not available', APPROVED_FOR_MARKETING: 'Approved for marketing', WITHHELD: 'Withheld',
};

function words(code) {
  const s = String(code || '').toLowerCase().replace(/_/g, ' ');
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

/** "PHASE2" → "Phase 2", "EARLY_PHASE1" → "Early phase 1" */
export function phaseLabel(code) {
  const m = /^(EARLY_)?PHASE(\d)$/.exec(String(code || ''));
  if (!m) return null;
  return (m[1] ? 'Early phase ' : 'Phase ') + m[2];
}

/** One ClinicalTrials.gov study as a record. */
export function trialRecord(study) {
  const p = study.protocolSection || {};
  const idm = p.identificationModule || {};
  const sm = p.statusModule || {};
  const dm = p.descriptionModule || {};
  const cm = p.conditionsModule || {};
  const des = p.designModule || {};
  const aim = p.armsInterventionsModule || {};
  const spm = p.sponsorCollaboratorsModule || {};
  const nct = idm.nctId || '';
  const startText = (sm.startDateStruct && sm.startDateStruct.date) || '';
  const start = parseIsoDate(startText);
  const phases = (des.phases || []).map(phaseLabel).filter(Boolean);
  const status = STATUS[sm.overallStatus] || words(sm.overallStatus);
  const interventions = (aim.interventions || []).map((i) => i && i.name).filter(Boolean);
  const url = 'https://clinicaltrials.gov/study/' + nct;
  const sponsor = (spm.leadSponsor && spm.leadSponsor.name) || null;
  const tags = [];
  if (phases.length) tags.push(phases.join('/'));
  if (status) tags.push(status);
  if (des.studyType && des.studyType !== 'INTERVENTIONAL') tags.push(words(des.studyType));
  if (study.hasResults) tags.push('Has results');
  return {
    source: 'clinicaltrials',
    id: nct,
    type: 'trial',
    title: idm.briefTitle || idm.officialTitle || nct,
    abstract: unescapeMarkdown(dm.briefSummary || '').replace(/\s+/g, ' ').trim(),
    authors: [],
    authorString: '',
    journal: { title: sponsor },
    publisher: sponsor,
    year: start ? start.year : null,
    pubDate: start ? Object.assign({}, start, { text: 'Started ' + [start.year, start.month ? start.text.split(' ')[1] : null].filter(Boolean).reverse().join(' ') }) : null,
    url,
    links: [{ label: 'ClinicalTrials.gov', text: nct, url }],
    keywords: (cm.conditions || []).concat(cm.keywords || [], interventions),
    publicationTypes: [words(des.studyType)].filter(Boolean),
    tags,
    extra: {
      officialTitle: idm.officialTitle || null,
      acronym: idm.acronym || null,
      status: sm.overallStatus || null,
      phases: des.phases || [],
      studyType: des.studyType || null,
      enrollment: des.enrollmentInfo && des.enrollmentInfo.count != null ? des.enrollmentInfo.count : null,
      conditions: cm.conditions || [],
      interventions: (aim.interventions || []).map((i) => ({ type: i.type || null, name: i.name || null })),
      sponsor,
      start: startText || null,
      completion: (sm.completionDateStruct && sm.completionDateStruct.date) || null,
      hasResults: !!study.hasResults,
    },
  };
}

/** The filter.advanced expression (Essie syntax) for years and study type. */
export function trialsAdvancedFilter(req) {
  const parts = [];
  if (req.from || req.to) {
    parts.push('AREA[StartDate]RANGE[' + (req.from ? req.from + '-01-01' : 'MIN') + ',' + (req.to ? req.to + '-12-31' : 'MAX') + ']');
  }
  if ((req.filters || {}).interventional) parts.push('AREA[StudyType]INTERVENTIONAL');
  return parts.join(' AND ');
}

export const clinicalTrialsSource = {
  id: 'clinicaltrials',
  name: 'ClinicalTrials.gov',
  shortName: 'Trials',
  description: 'Clinical studies registered at ClinicalTrials.gov, from around the world: what is tested, in whom, by whom, and how far each study has got.',
  homepage: 'https://clinicaltrials.gov/',
  docs: 'https://clinicaltrials.gov/data-api/api',
  terms: 'https://clinicaltrials.gov/about-site/terms-conditions',
  group: 'Biomedicine',
  kinds: ['trial'],
  idLabel: 'NCT number',
  syntax: 'Essie syntax: AND, OR, NOT, "quoted phrases", and AREA[Field] expressions.',
  placeholder: 'psilocybin depression',
  examples: [
    ['psilocybin depression', 30], ['GLP-1 obesity adolescents', 27], ['CAR-T lymphoma', 25], ['long covid treatment', 22],
    ['digital therapeutics insomnia', 19], ['Alzheimer disease amyloid', 17], ['microbiome transplant', 15], ['gene therapy hemophilia', 13],
    ['exercise cancer survivors', 11],
  ],
  sorts: [{ id: 'relevance', label: 'Best match' }, { id: 'date', label: 'Latest start' }],
  filters: [
    { id: 'interventional', label: 'Interventional studies only', help: 'Leaves out observational studies and registries.' },
    { id: 'recruiting', label: 'Recruiting or soon recruiting' },
    { id: 'results', label: 'Only studies with posted results' },
  ],
  keywordsLabel: 'Conditions, keywords and interventions',
  years: true,
  biomedical: true,
  maxLimit: 2000,
  defaultLimit: 200,
  pageSize: 200,
  rateLimit: 3,

  async fetchPage(req, page) {
    const f = req.filters || {};
    const url = buildUrl(CLINICALTRIALS_STUDIES, {
      'query.term': req.query,
      'filter.advanced': trialsAdvancedFilter(req) || undefined,
      'filter.overallStatus': f.recruiting ? 'RECRUITING,NOT_YET_RECRUITING' : undefined,
      aggFilters: f.results ? 'results:with' : undefined,
      fields: FIELDS.join(','),
      sort: SORTS[req.sort],
      pageSize: page.size,
      pageToken: page.cursor || undefined,
      countTotal: page.page === 1 ? 'true' : undefined,
      format: 'json',
    });
    const json = await req.request.json(url, { signal: req.signal });
    const studies = json.studies || [];
    return {
      total: json.totalCount != null ? json.totalCount : null,
      records: studies.map(trialRecord),
      cursor: studies.length && json.nextPageToken ? json.nextPageToken : null,
    };
  },
};
