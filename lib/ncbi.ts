/**
 * NCBI E-utilities API integration for fetching paper metadata and content
 */

interface PaperMetadata {
  pmid: string;
  title: string;
  abstract?: string;
  authors: string[];
  journal?: string;
  pubDate?: string;
  doi?: string;
  isOpenAccess: boolean;
  fullText?: string;
}

/**
 * Fetch paper metadata from PubMed by PMID
 */
export async function fetchByPMID(pmid: string): Promise<PaperMetadata> {
  const baseUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi';
  const params = new URLSearchParams({
    db: 'pubmed',
    id: pmid,
    retmode: 'xml',
    tool: 'FHIRLitPersonalize',
    email: 'contact@example.com'
  });

  const response = await fetch(`${baseUrl}?${params}`);
  if (!response.ok) {
    throw new Error(`NCBI API error: ${response.status}`);
  }

  const xmlText = await response.text();
  return parseArticleXML(xmlText, pmid);
}

/**
 * Convert DOI to PMID and fetch metadata
 */
export async function fetchByDOI(doi: string): Promise<PaperMetadata> {
  // First, search for the PMID using the DOI
  const searchUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi';
  const searchParams = new URLSearchParams({
    db: 'pubmed',
    term: `${doi}[doi]`,
    retmode: 'json',
    tool: 'FHIRLitPersonalize',
    email: 'contact@example.com'
  });

  const searchResponse = await fetch(`${searchUrl}?${searchParams}`);
  if (!searchResponse.ok) {
    throw new Error(`NCBI search error: ${searchResponse.status}`);
  }

  const searchResult = await searchResponse.json();
  const pmids = searchResult.esearchresult?.idlist;

  if (!pmids || pmids.length === 0) {
    throw new Error(`No PubMed article found for DOI: ${doi}`);
  }

  return fetchByPMID(pmids[0]);
}

/**
 * Try to fetch full text from PMC if available
 */
export async function fetchFullTextFromPMC(pmid: string): Promise<string | null> {
  try {
    // First check if paper is in PMC
    const linkUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/elink.fcgi';
    const linkParams = new URLSearchParams({
      dbfrom: 'pubmed',
      db: 'pmc',
      id: pmid,
      retmode: 'json',
      tool: 'FHIRLitPersonalize',
      email: 'contact@example.com'
    });

    const linkResponse = await fetch(`${linkUrl}?${linkParams}`);
    if (!linkResponse.ok) return null;

    const linkResult = await linkResponse.json();
    const pmcLinks = linkResult.linksets?.[0]?.linksetdbs?.find(
      (db: any) => db.dbto === 'pmc'
    );

    if (!pmcLinks?.links?.[0]) return null;

    const pmcid = pmcLinks.links[0];

    // Fetch full text from PMC
    const pmcUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi';
    const pmcParams = new URLSearchParams({
      db: 'pmc',
      id: pmcid,
      rettype: 'full',
      retmode: 'text',
      tool: 'FHIRLitPersonalize',
      email: 'contact@example.com'
    });

    const pmcResponse = await fetch(`${pmcUrl}?${pmcParams}`);
    if (!pmcResponse.ok) return null;

    return await pmcResponse.text();
  } catch (error) {
    console.error('Error fetching full text from PMC:', error);
    return null;
  }
}

/**
 * Parse article metadata from NCBI efetch XML response
 */
function parseArticleXML(xmlText: string, pmid: string): PaperMetadata {
  // Extract title
  const titleMatch = xmlText.match(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/);
  const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : '';

  // Extract abstract
  const abstractTexts: string[] = [];
  const abstractRegex = /<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g;
  let abstractMatch;
  while ((abstractMatch = abstractRegex.exec(xmlText)) !== null) {
    const text = abstractMatch[1]
      .replace(/<[^>]*>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .trim();
    if (text) abstractTexts.push(text);
  }
  const abstract = abstractTexts.join(' ');

  // Extract authors
  const authors: string[] = [];
  const authorRegex = /<Author[^>]*>[\s\S]*?<\/Author>/g;
  let authorMatch;
  while ((authorMatch = authorRegex.exec(xmlText)) !== null) {
    const authorXml = authorMatch[0];
    const lastNameMatch = authorXml.match(/<LastName>(.*?)<\/LastName>/);
    const firstNameMatch = authorXml.match(/<ForeName>(.*?)<\/ForeName>/);
    if (lastNameMatch) {
      const lastName = lastNameMatch[1];
      const firstName = firstNameMatch ? firstNameMatch[1] : '';
      authors.push(firstName ? `${firstName} ${lastName}` : lastName);
    }
  }

  // Extract journal
  const journalMatch = xmlText.match(/<Title>(.*?)<\/Title>/);
  const journal = journalMatch ? journalMatch[1].trim() : undefined;

  // Extract publication date
  const pubDateMatch = xmlText.match(/<PubDate>[\s\S]*?<\/PubDate>/);
  let pubDate: string | undefined;
  if (pubDateMatch) {
    const yearMatch = pubDateMatch[0].match(/<Year>(\d+)<\/Year>/);
    const monthMatch = pubDateMatch[0].match(/<Month>(\w+)<\/Month>/);
    pubDate = yearMatch ? (monthMatch ? `${monthMatch[1]} ${yearMatch[1]}` : yearMatch[1]) : undefined;
  }

  // Extract DOI
  const doiMatch = xmlText.match(/<ArticleId IdType="doi">(.*?)<\/ArticleId>/);
  const doi = doiMatch ? doiMatch[1] : undefined;

  // Check if open access (simplified check)
  const isOpenAccess = xmlText.includes('open access') ||
                       xmlText.includes('PMC') ||
                       xmlText.includes('pmc');

  return {
    pmid,
    title,
    abstract,
    authors,
    journal,
    pubDate,
    doi,
    isOpenAccess,
  };
}
