/*
 * Answers in the formats of the built-in sources' APIs, with invented
 * records (no real titles, people or identifiers beyond the formats).
 */

export const EUROPEPMC_PAGE1 = {
  version: '6.9',
  hitCount: 3,
  nextCursorMark: 'AoIIP4AAACgxMjM0NTY3',
  request: { queryString: 'senolytic', resultType: 'core', cursorMark: '*', pageSize: 2, sort: '', synonym: true },
  resultList: {
    result: [
      {
        id: '39100001', source: 'MED', pmid: '39100001', pmcid: 'PMC11100001', doi: '10.1000/aging.2025.0101',
        title: 'Senolytic clearance of <i>p16</i>-positive cells restores muscle repair in aged mice.',
        authorString: 'Novak A, Okafor C, Lindqvist E.',
        authorList: { author: [
          { fullName: 'Novak A', firstName: 'Anna', lastName: 'Novak', initials: 'A', authorId: { type: 'ORCID', value: '0000-0002-1111-2222' } },
          { fullName: 'Okafor C', firstName: 'Chidi', lastName: 'Okafor', initials: 'C' },
          { fullName: 'Lindqvist E', firstName: 'Elin', lastName: 'Lindqvist', initials: 'E' },
          { collectiveName: 'Muscle Ageing Consortium' },
        ] },
        journalInfo: {
          issue: '4', volume: '24', journalIssueId: 1, dateOfPublication: '2025 Apr', monthOfPublication: 4, yearOfPublication: 2025,
          printPublicationDate: '2025-04-01', journal: { title: 'Aging research letters', isoabbreviation: 'Aging Res Lett', medlineAbbreviation: 'Aging Res Lett', issn: '1234-5678' },
        },
        pubYear: '2025', pageInfo: 'e14101',
        abstractText: '<h4>Background</h4>Senescent cells accumulate in aged muscle &amp; impair repair.<h4>Methods</h4>We treated aged mice with a senolytic for <b>four</b> weeks.<h4>Results</h4>Clearance of p16<sup>+</sup> cells restored repair.',
        language: 'eng',
        pubTypeList: { pubType: ['Research Support, Non-U.S. Gov\'t', 'research-article', 'Journal Article'] },
        keywordList: { keyword: ['senolytics', 'muscle regeneration'] },
        meshHeadingList: { meshHeading: [
          { majorTopic_YN: 'N', descriptorName: 'Animals' },
          { majorTopic_YN: 'Y', descriptorName: 'Cellular Senescence', meshQualifierList: { meshQualifier: [{ abbreviation: 'DE', qualifierName: 'drug effects', majorTopic_YN: 'N' }] } },
          { majorTopic_YN: 'N', descriptorName: 'Muscle, Skeletal', meshQualifierList: { meshQualifier: [{ abbreviation: 'PH', qualifierName: 'physiology', majorTopic_YN: 'Y' }] } },
        ] },
        isOpenAccess: 'Y', inEPMC: 'Y', citedByCount: 12, firstPublicationDate: '2025-03-20',
      },
      {
        id: 'PPR900002', source: 'PPR', doi: '10.1101/2025.06.01.000002',
        title: 'A senolytic screen in human fibroblasts',
        authorString: 'Haddad R, Moreau J.',
        authorList: { author: [
          { fullName: 'Haddad R', firstName: 'Rania', lastName: 'Haddad', initials: 'R' },
          { fullName: 'Moreau J', firstName: 'Julien', lastName: 'Moreau', initials: 'J' },
        ] },
        pubYear: '2025',
        abstractText: 'We screened 1,200 compounds for senolytic activity.',
        pubTypeList: { pubType: 'Preprint' },
        bookOrReportDetails: { publisher: 'bioRxiv', yearOfPublication: 2025 },
        versionNumber: 2,
        isOpenAccess: 'Y', citedByCount: 0, firstPublicationDate: '2025-06-03',
      },
    ],
  },
};

export const EUROPEPMC_PAGE2 = {
  version: '6.9',
  hitCount: 3,
  nextCursorMark: 'AoIIP4AAACgxMjM0NTY4',
  resultList: {
    result: [
      {
        id: '39100003', source: 'MED', pmid: '39100003', title: 'Review: senescence and frailty.',
        authorList: { author: [{ fullName: 'Ito K', firstName: 'Kenji', lastName: 'Ito', initials: 'K' }] },
        journalInfo: { volume: '9', yearOfPublication: 2024, dateOfPublication: '2024', journal: { title: 'Gerontology notes', isoabbreviation: 'Gerontol Notes' } },
        pubYear: '2024', abstractText: 'A review of senescence in frailty.',
        pubTypeList: { pubType: ['Review', 'Journal Article'] }, isOpenAccess: 'N',
      },
    ],
  },
};

export const OPENALEX_WORKS = {
  meta: { count: 2, db_response_time_ms: 21, page: null, per_page: 100, next_cursor: null, groups_count: null },
  results: [
    {
      id: 'https://openalex.org/W4400000001',
      doi: 'https://doi.org/10.1000/heat.2024.77',
      display_name: 'Urban heat islands and night-time <i>mortality</i>',
      publication_year: 2024,
      publication_date: '2024-07-15',
      type: 'article',
      authorships: [
        { author_position: 'first', author: { id: 'https://openalex.org/A1', display_name: 'Maria de la Cruz', orcid: 'https://orcid.org/0000-0003-3333-4444' } },
        { author_position: 'last', author: { id: 'https://openalex.org/A2', display_name: 'Tomas Berg' } },
      ],
      primary_location: {
        is_oa: true, landing_page_url: 'https://journal.example.org/heat77', pdf_url: null,
        source: { id: 'https://openalex.org/S1', display_name: 'Journal of Urban Climate Studies', issn_l: '2345-6789', type: 'journal' },
        version: 'publishedVersion',
      },
      biblio: { volume: '12', issue: '3', first_page: '101', last_page: '115' },
      abstract_inverted_index: { Urban: [0], heat: [1, 6], islands: [2], raise: [3], night: [4], temperatures: [5], 'stress.': [7] },
      keywords: [{ id: 'https://openalex.org/keywords/urban-heat-island', display_name: 'Urban Heat Island', score: 0.6 }],
      mesh: [
        { descriptor_ui: 'D000001', descriptor_name: 'Hot Temperature', qualifier_ui: '', qualifier_name: null, is_major_topic: true },
        { descriptor_ui: 'D000001', descriptor_name: 'Hot Temperature', qualifier_ui: 'Q1', qualifier_name: 'adverse effects', is_major_topic: false },
      ],
      ids: { openalex: 'https://openalex.org/W4400000001', doi: 'https://doi.org/10.1000/heat.2024.77', pmid: 'https://pubmed.ncbi.nlm.nih.gov/39200001', pmcid: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11200001' },
      cited_by_count: 41,
      open_access: { is_oa: true, oa_status: 'gold', oa_url: 'https://journal.example.org/heat77.pdf', any_repository_has_fulltext: true },
      language: 'en',
      is_retracted: false,
    },
    {
      id: 'https://openalex.org/W4400000002',
      doi: 'https://doi.org/10.48550/arxiv.2501.01234',
      display_name: 'Graph neural networks for street-level temperature',
      publication_year: 2025,
      publication_date: '2025-01-03',
      type: 'preprint',
      authorships: [{ author: { display_name: 'Lena Vogt' } }],
      primary_location: {
        landing_page_url: 'http://arxiv.org/abs/2501.01234', pdf_url: 'http://arxiv.org/pdf/2501.01234',
        source: { display_name: 'arXiv (Cornell University)', type: 'repository' }, version: 'submittedVersion',
      },
      locations: [{ landing_page_url: 'http://arxiv.org/abs/2501.01234v2', source: { display_name: 'arXiv (Cornell University)' } }],
      biblio: {},
      abstract_inverted_index: { We: [0], map: [1], street: [2], temperature: [3] },
      keywords: [], mesh: [], ids: { openalex: 'https://openalex.org/W4400000002' },
      cited_by_count: 2,
      open_access: { is_oa: true, oa_url: 'http://arxiv.org/pdf/2501.01234' },
      language: 'en',
      is_retracted: true,
    },
  ],
  group_by: [],
};

export const CROSSREF_WORKS = {
  status: 'ok',
  'message-type': 'work-list',
  'message-version': '1.0.0',
  message: {
    facets: {},
    'total-results': 48211,
    'next-cursor': 'DnF1ZXJ5VGhlbkZldGNoBgAAAAAAAA',
    items: [
      {
        DOI: '10.1000/OCEAN.2023.15',
        title: ['Ocean acidification and <i>small-scale</i> fisheries'],
        author: [
          { given: 'Ana', family: 'Ferreira', sequence: 'first', affiliation: [], ORCID: 'https://orcid.org/0000-0001-5555-6666' },
          { name: 'Coastal Futures Network', sequence: 'additional', affiliation: [] },
        ],
        abstract: '<jats:title>Abstract</jats:title><jats:sec><jats:title>Background</jats:title><jats:p>Acidification threatens shellfish harvests.</jats:p></jats:sec><jats:sec><jats:title>Findings</jats:title><jats:p>Catches fell by 12&#x2009;% in <jats:italic>two</jats:italic> regions.</jats:p></jats:sec>',
        'container-title': ['Marine Policy Review'],
        'short-container-title': ['Mar Policy Rev'],
        issued: { 'date-parts': [[2023, 9, 4]] },
        type: 'journal-article',
        subject: ['Oceanography', 'Fisheries'],
        volume: '58', issue: '2', page: '210-224',
        URL: 'https://doi.org/10.1000/ocean.2023.15',
        'is-referenced-by-count': 17,
        publisher: 'Example Academic Press',
      },
      {
        DOI: '10.1101/2024.02.02.000777',
        title: ['Shell growth under low pH: a preprint'],
        author: [{ given: 'Kai', family: 'Nakamura', sequence: 'first', affiliation: [] }],
        posted: { 'date-parts': [[2024, 2, 2]] },
        issued: { 'date-parts': [[2024, 2]] },
        type: 'posted-content',
        URL: 'https://doi.org/10.1101/2024.02.02.000777',
        'is-referenced-by-count': 0,
        publisher: 'Cold Spring Harbor Laboratory',
        'group-title': 'Ecology',
      },
    ],
    'items-per-page': 200,
    query: { 'start-index': 0, 'search-terms': 'ocean acidification fisheries' },
  },
};

export const DOAJ_ARTICLES = {
  timestamp: '2026-10-01T10:00:00.000000Z',
  page: 1,
  pageSize: 100,
  query: 'mangrove',
  total: 1,
  results: [
    {
      id: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
      created_date: '2025-05-10T08:00:00Z',
      last_updated: '2025-05-12T08:00:00Z',
      bibjson: {
        title: 'Community mangrove restoration in two estuaries',
        year: '2025', month: '5',
        abstract: '<p>Mangrove cover recovered by a third after replanting.</p>',
        author: [{ name: 'Siti Rahmawati', affiliation: 'Example University', orcid_id: 'https://orcid.org/0000-0002-7777-8888' }, { name: 'Joao Silva' }],
        journal: { title: 'Coastal Ecology Open', volume: '7', number: '1', start_page: '33', end_page: '47', publisher: 'Open Coast Press', language: ['EN', 'ID'], country: 'ID' },
        identifier: [{ type: 'doi', id: '10.1000/ceo.2025.33' }, { type: 'eissn', id: '3456-7890' }],
        link: [{ type: 'fulltext', url: 'https://coastal-ecology.example.org/article/33', content_type: 'HTML' }],
        keywords: ['mangroves', 'restoration'],
        subject: [{ scheme: 'LCC', term: 'Ecology', code: 'QH540-549.5' }],
      },
    },
  ],
  next: 'https://doaj.org/api/search/articles/mangrove?page=2&pageSize=100',
};

export const CTGOV_STUDIES = {
  totalCount: 2,
  studies: [
    {
      protocolSection: {
        identificationModule: { nctId: 'NCT09000001', briefTitle: 'Psilocybin for Treatment-Resistant Depression', officialTitle: 'A Randomized Trial of Psilocybin Therapy', acronym: 'PSY-TRD' },
        statusModule: { overallStatus: 'RECRUITING', startDateStruct: { date: '2024-03', type: 'ACTUAL' }, completionDateStruct: { date: '2027-12', type: 'ESTIMATED' } },
        sponsorCollaboratorsModule: { leadSponsor: { name: 'Example University Hospital', class: 'OTHER' } },
        descriptionModule: { briefSummary: 'This study tests whether psilocybin\\-assisted therapy reduces depression scores at 6 weeks.' },
        conditionsModule: { conditions: ['Treatment Resistant Depression'], keywords: ['psychedelic'] },
        designModule: { studyType: 'INTERVENTIONAL', phases: ['PHASE2'], enrollmentInfo: { count: 120, type: 'ESTIMATED' } },
        armsInterventionsModule: { interventions: [{ type: 'DRUG', name: 'Psilocybin' }, { type: 'BEHAVIORAL', name: 'Psychological support' }] },
      },
      hasResults: false,
    },
    {
      protocolSection: {
        identificationModule: { nctId: 'NCT09000002', briefTitle: 'Registry of Psychedelic Therapy Outcomes' },
        statusModule: { overallStatus: 'ACTIVE_NOT_RECRUITING', startDateStruct: { date: '2021-11-15' } },
        descriptionModule: { briefSummary: 'An observational registry.' },
        conditionsModule: { conditions: ['Depression'] },
        designModule: { studyType: 'OBSERVATIONAL', phases: ['NA'] },
      },
      hasResults: true,
    },
  ],
};

export const DATACITE_DOIS = {
  data: [
    {
      id: '10.5281/zenodo.9000001',
      type: 'dois',
      attributes: {
        doi: '10.5281/zenodo.9000001',
        creators: [
          { name: 'Okonkwo, Ada', nameType: 'Personal', givenName: 'Ada', familyName: 'Okonkwo', nameIdentifiers: [{ nameIdentifier: 'https://orcid.org/0000-0001-9999-0000', nameIdentifierScheme: 'ORCID' }] },
          { name: 'Example Sequencing Facility', nameType: 'Organizational' },
        ],
        titles: [{ title: 'Single-cell RNA-seq of example kidney organoids' }, { title: 'Raw counts', titleType: 'Subtitle' }],
        publisher: 'Zenodo',
        container: {},
        publicationYear: 2025,
        subjects: [{ subject: 'FOS: Biological sciences' }, { subject: 'single-cell transcriptomics' }],
        types: { ris: 'DATA', bibtex: 'misc', citeproc: 'dataset', schemaOrg: 'Dataset', resourceTypeGeneral: 'Dataset' },
        version: 'v1.2',
        descriptions: [{ description: 'Count matrices for 40,000 cells.', descriptionType: 'Abstract' }],
        url: 'https://zenodo.org/records/9000001',
        citationCount: 3,
      },
      relationships: { client: { data: { id: 'cern.zenodo', type: 'clients' } } },
    },
    {
      id: '10.5061/dryad.example2',
      type: 'dois',
      attributes: {
        doi: '10.5061/DRYAD.EXAMPLE2',
        creators: [{ name: 'Larsen, Mette' }],
        titles: [{ title: 'scRNA pipeline' }],
        publisher: { name: 'Dryad' },
        publicationYear: '2023',
        types: { resourceTypeGeneral: 'Software' },
        descriptions: [{ description: '<p>Scripts for the analysis.</p>', descriptionType: 'Methods' }],
        url: 'https://datadryad.org/dataset/doi:10.5061/dryad.example2',
      },
    },
  ],
  meta: { total: 2, totalPages: 1, page: 1 },
  links: { self: 'https://api.datacite.org/dois?query=single-cell' },
};

export const INSPIRE_LITERATURE = {
  hits: {
    hits: [
      {
        id: '2900001',
        created: '2025-01-10T00:00:00+00:00',
        metadata: {
          control_number: 2900001,
          titles: [{ title: 'A search for light dark matter with a cryogenic detector', source: 'arXiv' }],
          abstracts: [{ value: 'We report limits on dark matter–nucleon scattering below 1 GeV.', source: 'arXiv' }],
          authors: [{ full_name: 'Rossi, Giulia' }, { full_name: 'Weber, Jonas' }],
          collaborations: [{ value: 'EXAMPLE' }],
          arxiv_eprints: [{ value: '2501.05555', categories: ['hep-ex', 'astro-ph.CO'] }],
          dois: [{ value: '10.1000/prd.2025.0555' }],
          publication_info: [{ journal_title: 'Phys.Rev.D', journal_volume: '111', year: 2025, artid: '052001' }],
          earliest_date: '2025-01-08',
          keywords: [{ value: 'dark matter: direct detection', schema: 'INSPIRE' }, { value: '95.35.+d', schema: 'PACS' }],
          citation_count: 9,
          document_type: ['article'],
        },
      },
      {
        id: '2900002',
        metadata: {
          control_number: 2900002,
          titles: [{ title: 'Axion-like particles at future colliders' }],
          abstracts: [{ value: 'A study of ALP production.' }],
          authors: [{ full_name: 'Chen, Wei' }],
          arxiv_eprints: [{ value: '2509.07777', categories: ['hep-ph'] }],
          earliest_date: '2025-09-12',
          citation_count: 0,
          document_type: ['article'],
        },
      },
    ],
    total: 2,
  },
  links: { self: 'https://inspirehep.net/api/literature?q=dark%20matter&size=200&page=1' },
};

export const WIKIPEDIA_SEARCH = {
  batchcomplete: true,
  continue: { sroffset: 2, continue: '-||' },
  query: {
    searchinfo: { totalhits: 2 },
    search: [
      { ns: 0, title: 'Renaissance architecture', pageid: 10001, wordcount: 9000, snippet: '<span class="searchmatch">Renaissance</span> <span class="searchmatch">architecture</span> is the style of the period &quot;between&quot; the early 15th and 17th centuries', timestamp: '2026-08-01T12:00:00Z' },
      { ns: 0, title: 'Palazzo Example/Garden', pageid: 10002, wordcount: 800, snippet: 'A villa in the <span class="searchmatch">Renaissance</span> style', timestamp: '2026-07-01T12:00:00Z' },
    ],
  },
};

export const ARXIV_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <link href="http://arxiv.org/api/query?search_query%3Dall%3Agraph&amp;id_list%3D&amp;start%3D0&amp;max_results%3D2" rel="self" type="application/atom+xml"/>
  <title type="html">ArXiv Query: search_query=all:graph&amp;id_list=&amp;start=0&amp;max_results=2</title>
  <id>http://arxiv.org/api/example</id>
  <updated>2026-10-01T00:00:00-04:00</updated>
  <opensearch:totalResults xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">57</opensearch:totalResults>
  <opensearch:startIndex xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">0</opensearch:startIndex>
  <opensearch:itemsPerPage xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">2</opensearch:itemsPerPage>
  <entry>
    <id>http://arxiv.org/abs/2502.00001v2</id>
    <updated>2025-02-10T18:00:00Z</updated>
    <published>2025-02-01T18:00:00Z</published>
    <title>Message passing on
      sparse graphs</title>
    <summary>  We study message passing &amp; its limits on sparse graphs.
    </summary>
    <author><name>Priya Raman</name></author>
    <author><name>Ludwig van Example</name></author>
    <arxiv:doi xmlns:arxiv="http://arxiv.org/schemas/atom">10.1000/jml.2025.1</arxiv:doi>
    <link title="doi" href="http://dx.doi.org/10.1000/jml.2025.1" rel="related"/>
    <arxiv:comment xmlns:arxiv="http://arxiv.org/schemas/atom">12 pages</arxiv:comment>
    <arxiv:journal_ref xmlns:arxiv="http://arxiv.org/schemas/atom">J. Mach. Learn. Example 3 (2025) 1-12</arxiv:journal_ref>
    <link href="http://arxiv.org/abs/2502.00001v2" rel="alternate" type="text/html"/>
    <link title="pdf" href="http://arxiv.org/pdf/2502.00001v2" rel="related" type="application/pdf"/>
    <arxiv:primary_category xmlns:arxiv="http://arxiv.org/schemas/atom" term="cs.LG" scheme="http://arxiv.org/schemas/atom"/>
    <category term="cs.LG" scheme="http://arxiv.org/schemas/atom"/>
    <category term="stat.ML" scheme="http://arxiv.org/schemas/atom"/>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/hep-th/9901001v1</id>
    <published>1999-01-01T00:00:00Z</published>
    <title>An old-style identifier</title>
    <summary>Text.</summary>
    <author><name>A. Example</name></author>
    <arxiv:primary_category xmlns:arxiv="http://arxiv.org/schemas/atom" term="hep-th" scheme="http://arxiv.org/schemas/atom"/>
  </entry>
</feed>`;

export const ARXIV_ERROR_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <opensearch:totalResults xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">1</opensearch:totalResults>
  <entry>
    <id>http://arxiv.org/api/errors#incorrect_id_format_for_1234</id>
    <title>Error</title>
    <summary>incorrect id format for 1234</summary>
  </entry>
</feed>`;
