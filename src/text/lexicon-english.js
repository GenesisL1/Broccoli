/*
 * Broccoli — browser-native search results clustering.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * English lexical resources, compiled for Broccoli:
 *  - STOPWORDS: function words and other words that should never start or
 *    end a cluster label (they may appear inside one: "quality of life").
 *  - STOPLABELS: regular expressions for whole labels that make poor
 *    cluster names.
 *  - BIOMEDICAL_*: optional extras for scientific abstracts (used by the
 *    PubMed integration, can be switched off).
 */

export const STOPWORDS = `
a about above according across actually after afterwards again against ago ahead al albeit all
almost alone along already also although always am amid amidst among amongst an and another any
anybody anyhow anyone anything anyway anyways anywhere apart appear appears approximately are
aren't around as aside at away b back be became because become becomes becoming been before
beforehand behind being below beside besides between beyond both brief but by c ca can can't
cannot cant certain certainly cf co com could couldn't d did didn't do does doesn't doing don't
done down due during e each eg e.g. eight eighteen eighth eighty either eleven else elsewhere
enough especially et etc even ever every everybody everyone everything everywhere ex exactly
except f far few fewer fifteen fifth fifty first five for former formerly forth forty four
fourteen fourth from further furthermore g get gets getting given gives go goes going gone got
gotten h had hadn't hardly has hasn't have haven't having he he'd he'll he's hence her here
here's hereafter hereby herein hereupon hers herself hi him himself his hither how how's however
hundred i i'd i'll i'm i've ie i.e. if ii iii in inasmuch inc indeed instead into inward is
isn't it it'd it'll it's its itself iv j just k kind kinds l last lately later latter latterly
least less lest let let's like likely ll ltd m made mainly make makes making many may maybe me
meanwhile merely might mightn't million mine more moreover most mostly mr mrs ms much must
mustn't my myself n namely nd near nearly necessarily need needn't neither never nevertheless
next nine nineteen ninety ninth no nobody non none nonetheless noone nor not nothing now nowhere
o of off often oh ok okay on once one ones oneself only onto or other others otherwise ought
our ours ourselves out outside over overall own p particularly per perhaps please plus possibly
presumably probably q quite r rather rd re really regarding relatively respectively s said
same saw say says second secondly see seeing seem seemed seeming seems seen self selves
seven seventeen seventh seventy several shall shan't she she'd she'll she's should shouldn't
since six sixteen sixth sixty so some somebody somehow someone something sometime sometimes
somewhat somewhere soon st still such sup sure t take taken taking ten tenth than that that's
thats the their theirs them themselves then thence there there's thereafter thereby therefore
therein thereof theres thereupon these they they'd they'll they're they've third thirteen
thirty this thorough thoroughly those though thousand three thrice through throughout thru thus
till to together too took toward towards twelve twenty twice two u un under underneath unless
unlike unlikely until unto up upon us use used uses using usually v various versus very via viz vs
w want wants was wasn't way we we'd we'll we're we've well went were weren't what what's
whatever when when's whence whenever where where's whereafter whereas whereby wherein whereupon
wherever whether which while whilst whither who who's whoever whole whom whose why why's will
with within without won't would wouldn't x y yes yet you you'd you'll you're you've your yours
yourself yourselves z zero
`.trim().split(/\s+/);

/**
 * Whole-label filters (case-insensitive). A candidate label is rejected when
 * its lower-cased text matches any of these.
 */
export const STOPLABELS = [
  // Lone generic qualifiers.
  '^(?:other|others|new|recent|current|various|several|many|more|most|some|all|any|each|every|' +
    'further|related|general|similar|different|important|possible|common|main|major|minor|key|' +
    'high|higher|low|lower|large|small|good|better|best|great|little|big|long|short|full|real|' +
    'true|old|young|early|late|final|total|single|multiple|specific|particular|special|local|' +
    'whole|entire|overall|additional|available|following|previous|present|recently|current)$',
  // Labels opening with a comparative or vague quantifier.
  '^(?:more|less|other|another|further|additional|many|several|various|certain|numerous) ',
  // Web and publishing boilerplate.
  '^(?:click|read|see|view|download|visit|learn|find|search|subscribe|sign|log|contact|share|' +
    'print|email|follow|join) ',
  '\\b(?:all rights reserved|copyright|privacy policy|terms of use|terms of service|click here|' +
    'read more|learn more|home page|web site|website|cookie policy)\\b',
  '^(?:home|page|pages|site|online|free|info|information|news|blog|link|links|website|welcome)$',
  // Honorifics and fragments.
  '^(?:mr|mrs|ms|dr|prof|sir|st)\\b',
];

/**
 * Extra stop words for scientific abstracts: reporting verbs and discourse
 * markers that carry no topic ("we found", "results suggest").
 */
export const BIOMEDICAL_STOPWORDS = `
aim aimed aiming aims assess assessed assessing assesses background conclude concluded concludes
conclusion conclusions conduct conducted demonstrate demonstrated demonstrates demonstrating
describe described describes determine determined determines evaluate evaluated evaluates
evaluating examine examined examines examining explore explored explores finding findings found
identify identified identifies indicate indicated indicates indicating introduction investigate
investigated investigates investigating method methods objective objectives observe observed
observes obtain obtained perform performed performing present presented presents propose proposed
proposes provide provided provides purpose report reported reports result resulted results
reveal revealed reveals show showed showing shown shows suggest suggested suggesting suggests
compare compared compares comparing significant significantly receive received receives receiving
randomly whereas additionally moreover furthermore thereby approximately respectively
increase increased increases increasing decrease decreased decreases decreasing reduce reduced
reduces reducing improve improved improves improving improvement improvements associated
assigned enrolled completed ratio ratios interval intervals mean means median relative
`.trim().split(/\s+/);

/**
 * Extra label filters for scientific abstracts: lone generic nouns and
 * statistical or methodological boilerplate that recurs in every abstract.
 */
export const BIOMEDICAL_STOPLABELS = [
  '^(?:study|studies|patient|patients|result|results|data|analysis|analyses|effect|effects|group|' +
    'groups|treatment|treatments|case|cases|subject|subjects|participant|participants|outcome|' +
    'outcomes|method|methods|conclusion|conclusions|background|objective|objectives|aim|aims|' +
    'purpose|finding|findings|evidence|trial|trials|risk|factor|factors|level|levels|role|model|' +
    'models|approach|system|systems|research|disease|diseases|association|associations|change|' +
    'changes|year|years|month|months|week|weeks|day|days|time|times|rate|rates|number|value|values|' +
    'sample|samples|control|controls|response|responses|mechanism|mechanisms|function|functions|' +
    'expression|activity|cell|cells|individuals|people|population|age|use|impact|increase|' +
    'decrease|difference|differences|review|literature|health|care|intervention|interventions|' +
    'cohort|test|tests|measure|measures|score|scores|period|baseline|follow-up|significance|therapy|' +
    'therapies|efficacy|effectiveness|safety|tolerability|primary|secondary|event|events|treated|untreated|' +
    'administered|randomized|randomised|allocated|included|performed|measured|evaluated|given)$',
  '^(?:statistically significant|significant(?:ly)? (?:difference|differences|increase|decrease|' +
    'reduction|improvement|association|higher|lower|increased|decreased|reduced|improved|associated)|' +
    'no significant (?:difference|differences)|confidence intervals?|odds ratios?|hazard ratios?|' +
    'relative risks?|risk ratios?|standard deviations?|p values?|mean age|median age|baseline ' +
    'characteristics|primary (?:outcome|outcomes|endpoint|endpoints)|secondary (?:outcome|outcomes|' +
    'endpoint|endpoints)|(?:present|current|this|our|previous|prior|further|future|recent) ' +
    '(?:study|studies|research|work|findings|data|analysis|review)|study (?:design|population|' +
    'period|group|groups|participants|subjects)|control groups?|clinical practice|further ' +
    'investigation|large number|wide range|high levels?|low levels?|important role|key role|' +
    'crucial role|new insights?|novel insights?|years old|years of age|time points?)$',
  '^(?:et al|ci|hr|rr|sd|se|sem|iqr|vs|aor|irr)\\b',
  // "Patients with X", "Women undergoing Y": the population, not the topic.
  '^(?:patients?|subjects?|participants?|individuals|persons?|people|women|men|children|adults|' +
    'infants|adolescents|users|survivors|smokers|volunteers|groups?|cases|controls) (?:with|in|of|' +
    'on|at|from|who|undergoing|receiving|treated|taking|having|were|was|are|is|had|have)\\b',
  // Trailing arm or population nouns: "Aspirin Group", "Stroke Patients".
  ' (?:patients?|groups?|subjects|participants|arms?|cohorts?)$',
  // "Increase in X", "Treatment of X", "Risk of X": the topic is X.
  '^(?:increases?|increased|decreases?|decreased|reductions?|reduced|improvements?|improved|' +
    'improving|changes?|effects?|effectiveness|efficacy|impact|role|use|treatments?|management|' +
    'risks?|levels?|rates?|prevalence|incidence|patterns|severity|onset|presence|benefits?|' +
    'outcomes?|response|responses|interventions?|strategies|strategy|programs?|evaluation|' +
    'assessment) (?:in|of|on|for|with|to|among|by|after|during)\\b',
  // Trial-report boilerplate.
  '^(?:double-blind|single-blind|placebo-controlled|open-label|end ?points?|primary end ?points?|' +
    'secondary end ?points?|efficacy and safety|safety and efficacy|safety and tolerability|' +
    'trial registration|registration number|clinical trial registration|unique identifier|' +
    'clinicaltrials gov|clinicaltrials|identifier|intention-to-treat|' +
    'intention to treat|per protocol|sample size|power calculation|informed consent|written ' +
    'informed consent|ethics committee|institutional review board|adverse events|serious adverse ' +
    'events|treatment-emergent adverse events)$',
  // An adjective alone or at the end is a cut-off phrase: "Treatment of Acute".
  '(?:^| )(?:acute|chronic|severe|mild|moderate|advanced|primary|secondary|clinical|novel|human|' +
    'metastatic|recurrent|refractory|invasive|malignant|benign|congenital|systemic|topical|oral|' +
    'intravenous|partial|overall|early|late|elderly|adverse|serious|randomized|randomised|' +
    'controlled|placebo-controlled|double-blind|multicenter|multicentre)$',
  // Units and time spans at either end: "Mm Hg", "Mg to Placebo", "Weeks Treatment".
  '^(?:mg|ml|kg|g|mcg|µg|ug|mmol|mol|mm|cm|nm|hg|iu|units?|doses?|days?|weeks?|months?|years?|' +
    'hours?|h|min|minutes?|seconds?|times?)\\b',
  '\\b(?:mg|ml|kg|mcg|µg|ug|mmol|mm|cm|hg|iu|mg/kg|mg/dl|mmol/l)$',
  // Pairs of generic qualifiers: "High and Low".
  '^(?:high|low|higher|lower|short|long|early|late|small|large|young|old|older|younger|first|' +
    'second|single|multiple|new|old)(?: (?:and|or|to|vs|versus|than) (?:high|low|higher|lower|' +
    'short|long|early|late|small|large|young|old|older|younger|first|second|single|multiple|new))?$',
  // Clauses built around a reporting verb: "Studies evaluated the Pharmacokinetics".
  '\\b(?:evaluated|assessed|examined|investigated|compared|measured|determined|showed|found|' +
    'reported|observed|conducted|performed|included|enrolled|received|assigned|demonstrated|' +
    'suggested|indicated|revealed|occurred|occurring|than)\\b',
  // Clause fragments: "Patients were Randomized", "Groups did not Differ".
  '\\b(?:was|were|is|are|be|been|being|did|does|do|has|have|had|not|no)\\b',
];
