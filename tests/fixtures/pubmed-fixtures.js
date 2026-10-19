/*
 * Hand-written E-utilities responses in the real NCBI formats, used by
 * the PubMed tests. The records are fictional.
 */

export const EFETCH_XML = `<?xml version="1.0" ?>
<!DOCTYPE PubmedArticleSet PUBLIC "-//NLM//DTD PubMedArticle, 1st January 2025//EN" "https://dtd.nlm.nih.gov/ncbi/pubmed/out/pubmed_250101.dtd">
<PubmedArticleSet>
<PubmedArticle>
    <MedlineCitation Status="MEDLINE" Owner="NLM" IndexingMethod="Automated">
        <PMID Version="1">39000001</PMID>
        <DateCompleted><Year>2024</Year><Month>08</Month><Day>03</Day></DateCompleted>
        <Article PubModel="Print-Electronic">
            <Journal>
                <ISSN IssnType="Electronic">1234-5678</ISSN>
                <JournalIssue CitedMedium="Internet">
                    <Volume>12</Volume>
                    <Issue>4</Issue>
                    <PubDate><Year>2024</Year><Month>Apr</Month><Day>15</Day></PubDate>
                </JournalIssue>
                <Title>Journal of Imaginary Immunology</Title>
                <ISOAbbreviation>J Imag Immunol</ISOAbbreviation>
            </Journal>
            <ArticleTitle>HLA class II <i>DRB1</i> alleles and CD4<sup>+</sup> T-cell responses in &lt;5-year-old children.</ArticleTitle>
            <Pagination><MedlinePgn>1116-22</MedlinePgn></Pagination>
            <ELocationID EIdType="doi" ValidYN="Y">10.1000/jii.2024.0001</ELocationID>
            <Abstract>
                <AbstractText Label="BACKGROUND" NlmCategory="BACKGROUND">HLA class II molecules present peptides to CD4<sup>+</sup> T cells.</AbstractText>
                <AbstractText Label="METHODS" NlmCategory="METHODS">We genotyped <i>HLA-DRB1</i> in 120 children &amp; measured IFN-&#947; responses.</AbstractText>
                <AbstractText Label="RESULTS" NlmCategory="RESULTS">Responses were higher in carriers (p&lt;0.05).</AbstractText>
                <AbstractText Label="CONCLUSIONS" NlmCategory="CONCLUSIONS">HLA class II alleles shape T-cell immunity.</AbstractText>
                <CopyrightInformation>© 2024 The Authors.</CopyrightInformation>
            </Abstract>
            <AuthorList CompleteYN="Y">
                <Author ValidYN="Y">
                    <LastName>Novak</LastName><ForeName>Anna B</ForeName><Initials>AB</Initials>
                    <Identifier Source="ORCID">https://orcid.org/0000-0001-2345-6789</Identifier>
                    <AffiliationInfo><Affiliation>Department of Imaginary Science, Example University, Paphos, Cyprus.</Affiliation></AffiliationInfo>
                </Author>
                <Author ValidYN="Y">
                    <LastName>Silva</LastName><ForeName>Jorge</ForeName><Initials>J</Initials>
                </Author>
                <Author ValidYN="Y">
                    <CollectiveName>Imaginary Cohort Consortium</CollectiveName>
                </Author>
                <Author ValidYN="Y">
                    <LastName>Okafor</LastName><ForeName>Chidi</ForeName><Initials>C</Initials>
                </Author>
            </AuthorList>
            <Language>eng</Language>
            <PublicationTypeList>
                <PublicationType UI="D016428">Journal Article</PublicationType>
                <PublicationType UI="D016449">Randomized Controlled Trial</PublicationType>
            </PublicationTypeList>
            <ArticleDate DateType="Electronic"><Year>2024</Year><Month>03</Month><Day>01</Day></ArticleDate>
        </Article>
        <MedlineJournalInfo><Country>Cyprus</Country><MedlineTA>J Imag Immunol</MedlineTA></MedlineJournalInfo>
        <CommentsCorrectionsList>
            <CommentsCorrections RefType="CommentIn"><RefSource>J Imag Immunol. 2024;12:200</RefSource><PMID Version="1">39000999</PMID></CommentsCorrections>
        </CommentsCorrectionsList>
        <MeshHeadingList>
            <MeshHeading><DescriptorName UI="D006801" MajorTopicYN="N">Humans</DescriptorName></MeshHeading>
            <MeshHeading><DescriptorName UI="D002675" MajorTopicYN="N">Child, Preschool</DescriptorName></MeshHeading>
            <MeshHeading>
                <DescriptorName UI="D006680" MajorTopicYN="N">HLA-DR Antigens</DescriptorName>
                <QualifierName UI="Q000235" MajorTopicYN="Y">genetics</QualifierName>
            </MeshHeading>
            <MeshHeading><DescriptorName UI="D015496" MajorTopicYN="Y">CD4-Positive T-Lymphocytes</DescriptorName></MeshHeading>
            <MeshHeading><DescriptorName UI="D003924" MajorTopicYN="N">Diabetes Mellitus, Type 2</DescriptorName></MeshHeading>
        </MeshHeadingList>
        <KeywordList Owner="NOTNLM"><Keyword MajorTopicYN="N">antigen presentation</Keyword><Keyword MajorTopicYN="N">pediatrics</Keyword></KeywordList>
    </MedlineCitation>
    <PubmedData>
        <History>
            <PubMedPubDate PubStatus="received"><Year>2023</Year><Month>11</Month><Day>2</Day></PubMedPubDate>
            <PubMedPubDate PubStatus="pubmed"><Year>2024</Year><Month>3</Month><Day>2</Day></PubMedPubDate>
        </History>
        <PublicationStatus>ppublish</PublicationStatus>
        <ArticleIdList>
            <ArticleId IdType="pubmed">39000001</ArticleId>
            <ArticleId IdType="pmc">PMC11000001</ArticleId>
            <ArticleId IdType="doi">10.1000/jii.2024.0001</ArticleId>
        </ArticleIdList>
        <ReferenceList>
            <Reference>
                <Citation>Earlier work. J Imag Immunol. 2020;8:1-10.</Citation>
                <ArticleIdList><ArticleId IdType="pubmed">31000001</ArticleId><ArticleId IdType="doi">10.1000/other</ArticleId></ArticleIdList>
            </Reference>
        </ReferenceList>
    </PubmedData>
</PubmedArticle>
<PubmedArticle>
    <MedlineCitation Status="PubMed-not-MEDLINE" Owner="NLM">
        <PMID Version="1">39000002</PMID>
        <Article PubModel="Print">
            <Journal>
                <JournalIssue CitedMedium="Print">
                    <Volume>7</Volume>
                    <PubDate><MedlineDate>2019 Nov-Dec</MedlineDate></PubDate>
                </JournalIssue>
                <Title>Revista Imaginaria</Title>
                <ISOAbbreviation>Rev Imag</ISOAbbreviation>
            </Journal>
            <ArticleTitle>[Vitamin D supplementation in older adults: a pilot study].</ArticleTitle>
            <Pagination><MedlinePgn>33-9</MedlinePgn></Pagination>
            <AuthorList CompleteYN="Y">
                <Author ValidYN="Y"><LastName>García</LastName><ForeName>María</ForeName><Initials>M</Initials></Author>
            </AuthorList>
            <Language>spa</Language>
            <PublicationTypeList><PublicationType UI="D016428">Journal Article</PublicationType></PublicationTypeList>
            <VernacularTitle>Suplementación con vitamina D en adultos mayores: estudio piloto.</VernacularTitle>
        </Article>
    </MedlineCitation>
    <PubmedData>
        <ArticleIdList><ArticleId IdType="pubmed">39000002</ArticleId></ArticleIdList>
    </PubmedData>
</PubmedArticle>
<PubmedBookArticle>
    <BookDocument>
        <PMID Version="1">39000003</PMID>
        <ArticleIdList><ArticleId IdType="bookaccession">NBK000001</ArticleId></ArticleIdList>
        <Book>
            <Publisher><PublisherName>Imaginary Press</PublisherName></Publisher>
            <BookTitle book="imagbook">Imaginary Reviews</BookTitle>
            <PubDate><Year>2022</Year><Month>01</Month></PubDate>
        </Book>
        <ArticleTitle book="imagbook" part="hla">HLA Typing Overview</ArticleTitle>
        <Language>eng</Language>
        <AuthorList Type="authors"><Author><LastName>Lee</LastName><ForeName>Min</ForeName><Initials>M</Initials></Author></AuthorList>
        <PublicationType UI="D016454">Review</PublicationType>
        <Abstract><AbstractText>An overview of HLA typing methods.</AbstractText></Abstract>
    </BookDocument>
    <PubmedBookData><ArticleIdList><ArticleId IdType="pubmed">39000003</ArticleId></ArticleIdList></PubmedBookData>
</PubmedBookArticle>
</PubmedArticleSet>
`;

export const EFETCH_ERROR_XML = `<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE eFetchResult PUBLIC "-//NLM//DTD efetch 20131226//EN" "https://eutils.ncbi.nlm.nih.gov/eutils/dtd/20131226/efetch.dtd">
<eFetchResult>
	<ERROR>Cannot retrieve history data. query_key: 1, WebEnv: MCID_0000</ERROR>
</eFetchResult>
`;

export const ESEARCH_JSON = JSON.stringify({
  header: { type: 'esearch', version: '0.3' },
  esearchresult: {
    count: '1234',
    retmax: '3',
    retstart: '0',
    querykey: '1',
    webenv: 'MCID_IMAGINARY',
    idlist: ['39000001', '39000002', '39000003'],
    translationset: [{ from: 'hla', to: '"hla"[All Fields]' }],
    querytranslation: '"hla"[All Fields] AND "children"[All Fields]',
    warninglist: { phrasesignored: ['the'], quotedphrasesnotfound: [], outputmessages: [] },
  },
});

export const ESEARCH_ERROR_JSON = JSON.stringify({
  header: { type: 'esearch', version: '0.3' },
  esearchresult: { ERROR: 'Invalid query' },
});

export const ESEARCH_XML = `<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE eSearchResult PUBLIC "-//NLM//DTD esearch 20060628//EN" "https://eutils.ncbi.nlm.nih.gov/eutils/dtd/20060628/esearch.dtd">
<eSearchResult><Count>2</Count><RetMax>2</RetMax><RetStart>0</RetStart><IdList>
<Id>39000001</Id>
<Id>39000002</Id>
</IdList><TranslationSet/><QueryTranslation>hla[All Fields]</QueryTranslation></eSearchResult>
`;

export const ESPELL_XML = `<?xml version="1.0"?>
<!DOCTYPE eSpellResult PUBLIC "-//NLM//DTD eSpellResult, 23 November 2004//EN" "https://www.ncbi.nlm.nih.gov/entrez/query/DTD/eSpell.dtd">
<eSpellResult>
	<Database>pubmed</Database>
	<Query>astma childrn</Query>
	<CorrectedQuery>asthma children</CorrectedQuery>
	<SpelledQuery><Replaced>asthma</Replaced> <Replaced>children</Replaced></SpelledQuery>
	<ERROR/>
</eSpellResult>
`;
