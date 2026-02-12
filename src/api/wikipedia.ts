const WIKIPEDIA_API_URL = 'https://en.wikipedia.org/w/api.php';

export interface SearchResult {
  title: string;
  snippet?: string;
  pageid?: number;
  images?: ArticleImage[];
  imagesLoading?: boolean;
}

export interface ArticleImage {
  title: string;
  url: string;
  description: string;
}

export interface WikipediaPageSummary {
  title: string;
  extract: string;
  thumbnailUrl: string | null;
  description?: string; // Short description
}

export interface WikipediaSection {
  toclevel: number;
  line: string;
  anchor: string;
  number: string;
}

export const searchWikipedia = async (query: string): Promise<SearchResult[]> => {
  const params = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: query,
    format: 'json',
    origin: '*',
    srlimit: '10'
  });

  try {
    const response = await fetch(`${WIKIPEDIA_API_URL}?${params}`);
    const data = await response.json();
    const searchResults = data.query.search;

    // Return results immediately with imagesLoading state
    const initialResults = searchResults.map((result: any) => ({
      title: decodeURIComponent(result.title.replace(/_/g, ' ')),
      snippet: result.snippet,
      pageid: result.pageid,
      imagesLoading: true
    }));

    // Fetch images in parallel for all results
    const resultsWithImages = await Promise.all(
      initialResults.map(async (result: SearchResult) => {
        const images = await getArticleImages(result.title);
        return {
          ...result,
          images: images.slice(0, 4),
          imagesLoading: false
        };
      })
    );

    return resultsWithImages;
  } catch (error) {
    console.error('Error searching Wikipedia:', error);
    return [];
  }
};

export const getFeaturedArticleTitles = async (maxTitles: number = 2500): Promise<string[]> => {
  // Pull article links from Wikipedia:Featured_articles (namespace 0 only) and cache them.
  // Source page: https://en.wikipedia.org/wiki/Wikipedia:Featured_articles
  const CACHE_KEY = 'whatInTheWiki_featuredArticleTitles_v1';
  const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  try {
    const cachedRaw = localStorage.getItem(CACHE_KEY);
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw) as { timestamp: number; titles: string[] };
      if (Array.isArray(cached.titles) && Date.now() - cached.timestamp < CACHE_TTL_MS && cached.titles.length > 0) {
        return cached.titles;
      }
    }
  } catch {
    // ignore cache parse issues
  }

  let titles: string[] = [];
  let plcontinue: string | undefined;

  while (titles.length < maxTitles) {
    const params = new URLSearchParams({
      action: 'query',
      titles: 'Wikipedia:Featured_articles',
      prop: 'links',
      plnamespace: '0', // main/article namespace only
      pllimit: 'max',
      format: 'json',
      origin: '*',
    });
    if (plcontinue) params.set('plcontinue', plcontinue);

    const response = await fetch(`${WIKIPEDIA_API_URL}?${params}`);
    if (!response.ok) {
      console.error('API_FEATURED_LIST_ERROR: Failed to fetch featured article link list:', response.status, await response.text());
      break;
    }
    const data = await response.json();
    const pages = data?.query?.pages || {};
    const pageId = Object.keys(pages)[0];
    const links = pages?.[pageId]?.links || [];
    const newTitles = links
      .map((l: any) => l?.title)
      .filter((t: any) => typeof t === 'string' && t.length > 0);

    titles = [...titles, ...newTitles].slice(0, maxTitles);

    plcontinue = data?.continue?.plcontinue;
    if (!plcontinue) break;
  }

  // De-dupe while preserving order
  const seen = new Set<string>();
  const uniqueTitles = titles.filter(t => {
    if (seen.has(t)) return false;
    seen.add(t);
    return true;
  });

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), titles: uniqueTitles }));
  } catch {
    // ignore cache write issues
  }

  return uniqueTitles;
};

export const pickDailyFeaturedTitle = (titles: string[], date: Date = new Date()): string | null => {
  if (!titles || titles.length === 0) return null;
  // Deterministic daily pick based on UTC date (so it's consistent across timezones).
  const utcMidnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const dayIndex = Math.floor(utcMidnight / (24 * 60 * 60 * 1000));
  const idx = ((dayIndex % titles.length) + titles.length) % titles.length;
  return titles[idx];
};

/**
 * Fetch the featured article from Wikipedia's main page using Wikifeeds
 * (same approach as the Wikipedia iOS app)
 * @param date - The date to fetch the featured article for (defaults to today)
 * @returns The featured article title, or null if not found
 */
export const getFeaturedArticleFromMainPage = async (date: Date = new Date()): Promise<string | null> => {
  try {
    // Format date as YYYY/MM/DD for the Wikifeeds API
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    
    // Wikipedia REST API endpoint for featured content (same as Wikipedia iOS app uses)
    // The endpoint is: https://en.wikipedia.org/api/rest_v1/feed/featured/YYYY/MM/DD
    const url = `https://en.wikipedia.org/api/rest_v1/feed/featured/${year}/${month}/${day}`;
    
    console.log('API_WIKIFEEDS: Fetching from:', url);
    
    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error('API_WIKIFEEDS_ERROR: Failed to fetch featured article from main page:', response.status, response.statusText, errorText);
      return null;
    }
    
    const data = await response.json();
    return extractFeaturedTitle(data);
  } catch (error) {
    console.error('API_WIKIFEEDS_ERROR: Error fetching featured article from Wikifeeds:', error);
    return null;
  }
};

/**
 * Helper function to extract the featured article title from Wikifeeds response
 */
function extractFeaturedTitle(data: any): string | null {
  try {
    // The featured article is in the 'tfa' (Today's Featured Article) field
    const tfa = data?.tfa;
    if (!tfa) {
      console.error('API_WIKIFEEDS_ERROR: TFA field not found in response. Available keys:', Object.keys(data || {}));
      return null;
    }
    
    console.log('API_WIKIFEEDS: TFA data structure:', {
      hasContentUrls: !!tfa.content_urls,
      hasTitle: !!tfa.title,
      hasNormalizedTitle: !!tfa.normalizedtitle,
      hasDisplayTitle: !!tfa.displaytitle
    });
    
    // Try multiple ways to extract the title
    // Method 1: From content_urls (most reliable)
    if (tfa.content_urls?.desktop?.page) {
      const pageUrl = tfa.content_urls.desktop.page;
      const titleMatch = pageUrl.match(/\/wiki\/(.+)$/);
      if (titleMatch && titleMatch[1]) {
        // Decode the title (replace underscores with spaces, decode URI)
        const title = decodeURIComponent(titleMatch[1].replace(/_/g, ' '));
        console.log('API_WIKIFEEDS: Extracted title from content_urls:', title);
        return title;
      }
    }
    
    // Method 2: Direct title field
    if (tfa.title) {
      console.log('API_WIKIFEEDS: Using direct title field:', tfa.title);
      return tfa.title;
    }
    
    // Method 3: From normalized title
    if (tfa.normalizedtitle) {
      console.log('API_WIKIFEEDS: Using normalizedtitle:', tfa.normalizedtitle);
      return tfa.normalizedtitle;
    }
    
    // Method 4: From displaytitle (HTML might need cleaning)
    if (tfa.displaytitle) {
      // Remove HTML tags if present
      const cleanTitle = tfa.displaytitle.replace(/<[^>]*>/g, '').trim();
      if (cleanTitle) {
        console.log('API_WIKIFEEDS: Using displaytitle (cleaned):', cleanTitle);
        return cleanTitle;
      }
    }
    
    console.error('API_WIKIFEEDS_ERROR: Could not extract featured article title from response. TFA structure:', JSON.stringify(tfa, null, 2));
    return null;
  } catch (error) {
    console.error('API_WIKIFEEDS_ERROR: Error extracting title:', error);
    return null;
  }
}

export const getWikipediaPageSummary = async (title: string): Promise<WikipediaPageSummary | null> => {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;
    const response = await fetch(url);
    if (!response.ok) {
      console.error('API_SUMMARY_ERROR: Failed to fetch page summary:', response.status, await response.text());
      return null;
    }
    const data = await response.json();
    return {
      title: data?.title || title,
      extract: data?.extract || '',
      thumbnailUrl: data?.thumbnail?.source || null,
      description: data?.description || undefined, // Short description from Wikipedia
    };
  } catch (error) {
    console.error('API_SUMMARY_CATCH_ERROR:', error);
    return null;
  }
};

export const getWikipediaPageCategories = async (title: string, limit: number = 50): Promise<string[]> => {
  const params = new URLSearchParams({
    action: 'query',
    prop: 'categories',
    titles: title,
    clshow: '!hidden',
    cllimit: 'max',
    format: 'json',
    origin: '*',
    redirects: '1',
  });

  try {
    const response = await fetch(`${WIKIPEDIA_API_URL}?${params}`);
    if (!response.ok) {
      console.error('API_CATEGORIES_ERROR:', response.status, await response.text());
      return [];
    }
    const data = await response.json();
    const pages = data?.query?.pages || {};
    const pageId = Object.keys(pages)[0];
    const categories = pages?.[pageId]?.categories || [];
    const names = categories
      .map((c: any) => (typeof c?.title === 'string' ? c.title : ''))
      .filter(Boolean)
      .map((t: string) => t.replace(/^Category:/, ''));

    return names.slice(0, limit);
  } catch (error) {
    console.error('API_CATEGORIES_CATCH_ERROR:', error);
    return [];
  }
};

export const getWikipediaPageSections = async (title: string): Promise<WikipediaSection[]> => {
  const params = new URLSearchParams({
    action: 'parse',
    page: title,
    prop: 'sections',
    format: 'json',
    origin: '*',
    redirects: '1',
  });

  try {
    const response = await fetch(`${WIKIPEDIA_API_URL}?${params}`);
    if (!response.ok) {
      console.error('API_SECTIONS_ERROR:', response.status, await response.text());
      return [];
    }
    const data = await response.json();
    const sections = data?.parse?.sections || [];
    return sections.map((s: any) => ({
      toclevel: Number(s?.toclevel ?? 0),
      line: String(s?.line ?? ''),
      anchor: String(s?.anchor ?? ''),
      number: String(s?.number ?? ''),
    }));
  } catch (error) {
    console.error('API_SECTIONS_CATCH_ERROR:', error);
    return [];
  }
};

export const getArticleImages = async (title: string, prioritizeInfobox: boolean = false): Promise<ArticleImage[]> => {
  try {
    let infoboxImages: string[] = [];
    
    // Only fetch article content if we need to prioritize infobox images
    // This avoids rate limiting when fetching images for many articles
    if (prioritizeInfobox) {
      try {
        const contentHtml = await getArticleContent(title);
        const parser = new DOMParser();
        const doc = parser.parseFromString(contentHtml, 'text/html');
        
        // Find images in infoboxes (prioritize these)
        const infoboxes = doc.querySelectorAll('.infobox, .infobox_v2, .infobox_v3, table.infobox');
        infoboxes.forEach(infobox => {
          // Look for image links in infobox (they're usually wrapped in <a> tags)
          const imageLinks = infobox.querySelectorAll('a[href*="/wiki/File:"]');
          imageLinks.forEach(link => {
            const href = link.getAttribute('href');
            if (href) {
              // Extract "File:Example.jpg" from "/wiki/File:Example.jpg"
              const match = href.match(/\/wiki\/(File:[^#]+)/);
              if (match) {
                const fileTitle = decodeURIComponent(match[1]);
                if (!infoboxImages.includes(fileTitle)) {
                  infoboxImages.push(fileTitle);
                }
              }
            }
          });
          
          // Also check img tags directly (fallback)
          const imgs = infobox.querySelectorAll('img');
          imgs.forEach(img => {
            // Check if parent is a link to a file
            const parentLink = img.closest('a[href*="/wiki/File:"]');
            if (parentLink) {
              const href = parentLink.getAttribute('href');
              if (href) {
                const match = href.match(/\/wiki\/(File:[^#]+)/);
                if (match) {
                  const fileTitle = decodeURIComponent(match[1]);
                  if (!infoboxImages.includes(fileTitle)) {
                    infoboxImages.push(fileTitle);
                  }
                }
              }
            }
          });
        });
      } catch (error) {
        // If fetching content fails (rate limit, etc.), just continue without infobox prioritization
        // This prevents one failure from breaking the entire image fetch
      }
    }
    
    // Get all images from the API
    const params = new URLSearchParams({
      action: 'query',
      prop: 'images|imageinfo',
      titles: title,
      imlimit: prioritizeInfobox ? '10' : '4', // Get more images if prioritizing infobox
      iiprop: 'url|extmetadata',
      format: 'json',
      origin: '*'
    });

    const response = await fetch(`${WIKIPEDIA_API_URL}?${params}`);
    const data = await response.json();
    const pages = data.query.pages;
    const pageId = Object.keys(pages)[0];
    const images = pages[pageId].images || [];

    // Filter and prioritize: infobox images first, then others
    const imageList = images.filter((img: any) => img.title.toLowerCase().match(/\.(jpg|jpeg|png|gif)$/));
    
    let finalImageList: any[];
    if (prioritizeInfobox && infoboxImages.length > 0) {
      // Separate infobox images from others
      const infoboxImageTitles = new Set(infoboxImages.map(img => img.toLowerCase()));
      const prioritizedImages: any[] = [];
      const otherImages: any[] = [];
      
      imageList.forEach((img: any) => {
        if (infoboxImageTitles.has(img.title.toLowerCase())) {
          prioritizedImages.push(img);
        } else {
          otherImages.push(img);
        }
      });
      
      // Combine: infobox images first, then others
      finalImageList = [...prioritizedImages, ...otherImages].slice(0, 4);
    } else {
      // No prioritization, just take first images
      finalImageList = imageList.slice(0, 4);
    }

    // Get image URLs and metadata
    const imagePromises = finalImageList.map(async (img: any) => {
      const imageInfoParams = new URLSearchParams({
        action: 'query',
        prop: 'imageinfo',
        titles: img.title,
        iiprop: 'url|extmetadata',
        format: 'json',
        origin: '*'
      });

      const imageResponse = await fetch(`${WIKIPEDIA_API_URL}?${imageInfoParams}`);
      const imageData = await imageResponse.json();
      const imagePages = imageData.query.pages;
      const imagePageId = Object.keys(imagePages)[0];
      const imageInfo = imagePages[imagePageId].imageinfo?.[0];

      if (!imageInfo) return null;

      return {
        title: img.title,
        url: imageInfo.url,
        description: imageInfo.extmetadata?.ImageDescription?.value || ''
      };
    });

    const results = await Promise.all(imagePromises);
    return results.filter((img): img is ArticleImage => img !== null);
  } catch (error) {
    // Silently handle rate limit errors to avoid console spam
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      return [];
    }
    console.error('Error fetching article images:', error);
    return [];
  }
};

export const getArticleContent = async (title: string): Promise<string> => {
  const params = new URLSearchParams({
    action: 'parse',
    page: title,
    format: 'json',
    prop: 'text',
    origin: '*',
    disableeditsection: '1',
    mobileformat: '1'
  });

  try {
    const response = await fetch(`${WIKIPEDIA_API_URL}?${params}`);
    const data = await response.json();
    return data.parse.text['*'] || 'No content found.';
  } catch (error) {
    console.error('Error fetching article:', error);
    return 'Error loading article content.';
  }
};

export const getMoreLikeArticles = async (title: string, limit: number = 2): Promise<SearchResult[]> => {
  const params = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: `morelike:${title}`,
    format: 'json',
    origin: '*',
    srlimit: limit.toString(),
    srprop: 'snippet', // Include snippet for context
  });

  try {
    const response = await fetch(`${WIKIPEDIA_API_URL}?${params}`);
    const data = await response.json();
    const searchResults = data.query.search;

    if (!searchResults || searchResults.length === 0) {
      return [];
    }

    // Map to SearchResult and fetch images
    const initialResults = searchResults.map((result: any) => ({
      title: decodeURIComponent(result.title.replace(/_/g, ' ')),
      snippet: result.snippet,
      pageid: result.pageid,
      imagesLoading: true,
    }));

    const resultsWithImages = await Promise.all(
      initialResults.map(async (result: SearchResult) => {
        // Ensure result.title is encoded correctly for getArticleImages if it contains spaces or special chars
        const images = await getArticleImages(result.title.replace(/ /g, '_')); 
        return {
          ...result,
          images: images.slice(0, 1), // Get just one image for recommendations
          imagesLoading: false,
        };
      })
    );
    return resultsWithImages;
  } catch (error) {
    console.error(`Error fetching more like articles for "${title}":`, error);
    return [];
  }
};

const WIKIMEDIA_TRENDING_API_URL = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/top';

export const getTrendingArticles = async (limit: number = 10): Promise<SearchResult[]> => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const year = yesterday.getFullYear();
  const month = (yesterday.getMonth() + 1).toString().padStart(2, '0');
  const day = yesterday.getDate().toString().padStart(2, '0');

  const project = 'en.wikipedia.org';
  const access = 'all-access';
  const trendingUrl = `${WIKIMEDIA_TRENDING_API_URL}/${project}/${access}/${year}/${month}/${day}`;
  console.log("API_TRENDING: Fetching from:", trendingUrl);

  try {
    const response = await fetch(trendingUrl);
    const rawDataText = await response.text();
    if (!response.ok) {
      console.error('API_TRENDING_ERROR: Failed to fetch trending articles list:', response.status, rawDataText);
      return [];
    }
    const data = JSON.parse(rawDataText);
    const topArticlesRaw = data?.items?.[0]?.articles || [];
    console.log("API_TRENDING: Raw top articles from API:", topArticlesRaw.length);

    if (topArticlesRaw.length === 0) return [];

    // Take top N (e.g., 25) to have a good pool before further processing and image filtering
    const initialTitles = topArticlesRaw.slice(0, 25).map((article: any) => article.article.replace(/_/g, ' '));
    if (initialTitles.length === 0) return [];

    // Fetch page IDs and extracts for these titles in a batch
    const titlesForQuery = initialTitles.join('|');
    const detailsParams = new URLSearchParams({
      action: 'query',
      prop: 'extracts|info', // Get extracts and basic info (which includes pageid)
      exintro: 'true',
      explaintext: 'true',
      titles: titlesForQuery,
      format: 'json',
      origin: '*',
      redirects: '1', // Resolve redirects to get to the canonical pageid/title
    });

    const detailsResponse = await fetch(`${WIKIPEDIA_API_URL}?${detailsParams}`);
    if (!detailsResponse.ok) {
      console.error('API_TRENDING_ERROR: Failed to fetch details (pageid/extract) for trending articles:', detailsResponse.status, await detailsResponse.text());
      return [];
    }
    const detailsData = await detailsResponse.json();
    const pagesWithDetails = detailsData?.query?.pages || {};
    console.log("API_TRENDING: Fetched details for articles.");

    const articlesWithDetails: SearchResult[] = Object.values(pagesWithDetails).map((page: any) => ({
      title: page.title,
      pageid: page.pageid,
      snippet: page.extract,
      imagesLoading: true,
    }));

    // Now fetch images for these constructed SearchResult objects
    const resultsWithImagesPromises = articlesWithDetails.map(async (article) => {
      if (!article.title) return null; // Should not happen if page object is valid
      const images = await getArticleImages(article.title.replace(/ /g, '_'));
      return {
        ...article,
        images: images.slice(0, 1), // Carousel only needs one
        imagesLoading: false,
      };
    });

    const processedResultsWithNulls = await Promise.all(resultsWithImagesPromises);
    const processedResults = processedResultsWithNulls.filter(Boolean) as SearchResult[]; // Remove nulls

    // Filter out articles that didn't get an image
    const finalResults = processedResults.filter(result => result.images && result.images.length > 0 && result.images[0].url);
    console.log("API_TRENDING: Processed trending articles with images:", finalResults.length);

    return finalResults.slice(0, limit); // Return the desired number of results

  } catch (error) {
    console.error('API_TRENDING_CATCH_ERROR: Error fetching/processing trending articles:', error);
    return [];
  }
};

export const getRandomArticles = async (count: number = 3): Promise<SearchResult[]> => {
  const fetchCount = count + 5; // Fetch more to increase chances of getting some with images after filtering
  const params = new URLSearchParams({
    action: 'query',
    list: 'random',
    rnnamespace: '0',
    rnlimit: fetchCount.toString(),
    format: 'json',
    origin: '*',
  });

  try {
    const response = await fetch(`${WIKIPEDIA_API_URL}?${params}`);
    if (!response.ok) {
      console.error('API_RANDOM_ERROR: Failed to fetch random article titles:', response.status, await response.text());
      return [];
    }
    const data = await response.json();
    const randomArticlesInfo = data?.query?.random || [];

    if (randomArticlesInfo.length === 0) {
      console.log("API_RANDOM: No random articles returned from initial fetch.");
      return [];
    }
    console.log("API_RANDOM: Fetched initial random articles info:", randomArticlesInfo.length);

    // Get pageids for fetching extracts
    const pageIds = randomArticlesInfo.map((article: any) => article.id).join('|');
    if (!pageIds) return [];

    const extractParams = new URLSearchParams({
      action: 'query',
      prop: 'extracts',
      exintro: 'true',
      explaintext: 'true',
      pageids: pageIds,
      format: 'json',
      origin: '*',
    });

    const extractsResponse = await fetch(`${WIKIPEDIA_API_URL}?${extractParams}`);
    if (!extractsResponse.ok) {
      console.error('API_RANDOM_ERROR: Failed to fetch extracts for random articles:', extractsResponse.status, await extractsResponse.text());
      return []; // Or handle differently, maybe proceed without snippets
    }
    const extractsData = await extractsResponse.json();
    const pagesWithExtracts = extractsData?.query?.pages || {};
    console.log("API_RANDOM: Fetched extracts for articles.");

    const articlesWithDetails: SearchResult[] = randomArticlesInfo.map((article: any) => {
      const pageExtract = pagesWithExtracts[article.id];
      return {
        title: article.title, // Already have title
        pageid: article.id,   // Already have pageid
        snippet: pageExtract?.extract, // Get snippet from extract query
        imagesLoading: true, // Will fetch images next
      };
    });

    // Now fetch images for these constructed SearchResult objects
    const resultsWithImagesPromises = articlesWithDetails.map(async (article) => {
      const images = await getArticleImages(article.title.replace(/ /g, '_')); // Use existing getArticleImages
      return {
        ...article,
        images: images.slice(0, 1), // Carousel only needs one
        imagesLoading: false,
      };
    });

    const processedResults = await Promise.all(resultsWithImagesPromises);
    
    // Filter out articles that didn't get an image
    const finalResults = processedResults.filter(result => result.images && result.images.length > 0 && result.images[0].url);
    console.log("API_RANDOM: Processed random articles with images:", finalResults.length);
    
    return finalResults.slice(0, count); // Return the exact number of results requested

  } catch (error) {
    console.error('API_RANDOM_CATCH_ERROR: Error fetching or processing random articles:', error);
    return [];
  }
};

export interface DidYouKnowEntry {
  fact: string;
  linkedArticleTitle: string | null;
  // We might add image/snippet for the linked article here later if fetched directly in getDidYouKnowFacts
}

export const getDidYouKnowFacts = async (limit: number = 8): Promise<DidYouKnowEntry[]> => {
  const params = new URLSearchParams({
    action: 'parse',
    page: 'Template:Did you know',
    prop: 'text',
    format: 'json',
    origin: '*'
  });

  try {
    console.log("API_DYK: Fetching from:", `${WIKIPEDIA_API_URL}?${params}`);
    const response = await fetch(`${WIKIPEDIA_API_URL}?${params}`);
    if (!response.ok) {
      console.error('API_DYK_ERROR: Failed to fetch Did You Know template content:', response.status, await response.text());
      return [];
    }
    const data = await response.json();
    const htmlContent = data.parse.text['*'];

    if (!htmlContent) {
      console.error('API_DYK_ERROR: No HTML content found in parse result for DYK.');
      return [];
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    const listItems = doc.querySelectorAll('ul > li');

    const processedFacts: DidYouKnowEntry[] = [];
    const adminKeywords = [
        'archive', 'nominate an article', 'start a new article', 'statistics',
        'rules', 'guidelines', 'queues', 'next update', 'current time',
        'verify', 'reset', 'purge', 'edit', 'history', 'prep area'
    ];
    const veryShortExactMatches = ['v', 't', 'e'];

    listItems.forEach(item => {
      if (processedFacts.length >= limit) return; // Stop processing if we've already found enough

      let rawText = (item.textContent || '').trim();

      if (!rawText.startsWith('... ')) {
        if (veryShortExactMatches.includes(rawText.toLowerCase())) {
            return;
        }
        if (adminKeywords.some(keyword => rawText.toLowerCase().includes(keyword) && rawText.length < 30)) {
            return;
        }
        return;
      }

      let factCandidate = rawText.substring(4).trim();
      factCandidate = factCandidate.replace(/\s*\(pictured\)/ig, '')
                                   .replace(/\s*\(listen\)/ig, '')
                                   .trim();

      if (adminKeywords.some(keyword => factCandidate.toLowerCase().includes(keyword))) {
        if (factCandidate.length < 50) { 
             return;
        }
      }

      if (veryShortExactMatches.includes(factCandidate.toLowerCase()) && factCandidate.length <= 1) {
          return;
      }
      
      if (factCandidate.length < 15) { 
        return;
      }

      // Attempt to find the primary linked article (usually the first bolded link)
      let linkedArticleTitle: string | null = null;
      const firstBoldLink = item.querySelector('b a[href^="/wiki/"]');
      if (firstBoldLink) {
        const href = firstBoldLink.getAttribute('href');
        if (href) {
          const path = href.substring('/wiki/'.length);
          // Check if it's not a special page like File: or Template:
          if (!path.match(/^(File:|Template:|Category:|Help:|Portal:|Wikipedia:|Special:)/i)) {
             linkedArticleTitle = decodeURIComponent(path).replace(/_/g, ' ');
          }
        }
      }

      processedFacts.push({ fact: factCandidate, linkedArticleTitle });
    });
    
    console.log(`API_DYK: Extracted ${processedFacts.length} facts after filtering. Requested limit: ${limit}`, processedFacts);
    // The forEach loop already respects the limit, so this slice might be redundant if logic is correct
    // but it's a good safeguard to ensure we don't return more than requested.
    return processedFacts.slice(0, limit); 

  } catch (error) {
    console.error('Error fetching or parsing Did You Know facts:', error);
    return [];
  }
};

export const getArticleExtract = async (title: string): Promise<string | null> => {
  const params = new URLSearchParams({
    action: 'query',
    prop: 'extracts',
    titles: title,
    exintro: 'true',      // Get only content before the first section
    explaintext: 'true',  // Get plain text, not HTML
    format: 'json',
    origin: '*'
  });

  try {
    const response = await fetch(`${WIKIPEDIA_API_URL}?${params}`);
    if (!response.ok) {
      console.error(`API_EXTRACT_ERROR: Failed to fetch extract for "${title}":`, response.status, await response.text());
      return null;
    }
    const data = await response.json();
    const pages = data.query.pages;
    const pageId = Object.keys(pages)[0];

    if (pageId === '-1') { // Page doesn't exist
      console.warn(`API_EXTRACT_WARN: Page "${title}" not found for extract.`);
      return null;
    }
    
    const extract = pages[pageId].extract;
    if (extract) {
      // Truncate if too long for a card preview
      const maxLength = 150; // Max characters for the snippet
      return extract.length > maxLength ? extract.substring(0, maxLength) + '...' : extract;
    }
    return null;
  } catch (error) {
    console.error(`Error fetching article extract for "${title}":`, error);
    return null;
  }
};

// Get short description from Wikipedia REST API
export const getArticleShortDescription = async (title: string): Promise<string | null> => {
  try {
    // Use MediaWiki API with prop=description to get short description directly
    // This is more reliable than the REST API summary endpoint
    // Prefer local descriptions (from {{SHORTDESC:...}} template) over Wikidata
    const normalizedTitle = title.trim().replace(/ /g, '_');
    
    // Try local first, then fallback to central (Wikidata)
    for (const source of ['local', 'central'] as const) {
      const params = new URLSearchParams({
        action: 'query',
        prop: 'description',
        titles: normalizedTitle,
        descprefersource: source,
        format: 'json',
        origin: '*'
      });
      
      const url = `https://en.wikipedia.org/w/api.php?${params}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        if (source === 'local') {
          // Try central if local fails
          continue;
        }
        // Only log errors for non-rate-limit issues
        if (response.status !== 429) {
          console.warn(`API_SHORT_DESC_WARNING: Failed to fetch short description for "${title}":`, response.status);
        }
        return null;
      }
      
      const data = await response.json();
      
      // Debug: log API response for troubleshooting
      if (title.toLowerCase().includes('teratophoneus') || title.toLowerCase().includes('albertavenator')) {
        // Debug logging only for specific problematic articles
        if (title.toLowerCase().includes('teratophoneus') || title.toLowerCase().includes('albertavenator')) {
          console.log(`[SHORT_DESC_DEBUG] API Response for "${title}" (${source}):`, data);
        }
      }
      
      // The API returns descriptions in the pages object
      const pages = data?.query?.pages;
      if (!pages) {
        if (title.toLowerCase().includes('teratophoneus') || title.toLowerCase().includes('albertavenator')) {
          if (title.toLowerCase().includes('teratophoneus') || title.toLowerCase().includes('albertavenator')) {
            console.log(`[SHORT_DESC_DEBUG] No pages in response`);
          }
        }
        if (source === 'local') continue;
        return null;
      }
      
      // Find the page (key is the page ID)
      const page = Object.values(pages)[0] as any;
      if (!page) {
        if (title.toLowerCase().includes('teratophoneus') || title.toLowerCase().includes('albertavenator')) {
          if (title.toLowerCase().includes('teratophoneus') || title.toLowerCase().includes('albertavenator')) {
            console.log(`[SHORT_DESC_DEBUG] No page found in pages object`);
          }
        }
        if (source === 'local') continue;
        return null;
      }
      
      // Check for missing page error
      if (page.missing !== undefined) {
        if (title.toLowerCase().includes('teratophoneus') || title.toLowerCase().includes('albertavenator')) {
          if (title.toLowerCase().includes('teratophoneus') || title.toLowerCase().includes('albertavenator')) {
            console.log(`[SHORT_DESC_DEBUG] Page is missing`);
          }
        }
        if (source === 'local') continue;
        return null;
      }
      
      // Get the description field
      const description = page?.description;
      
      // Debug logging for troubleshooting (only for specific articles)
      if (title.toLowerCase().includes('albertavenator') || title.toLowerCase().includes('teratophoneus')) {
        console.log(`[SHORT_DESC_DEBUG] Title: "${title}", Source: ${source}`, {
          page,
          description,
          descriptionType: typeof description,
          hasDescription: !!description
        });
      }
      
      // Only return if it exists, is a string, and is not empty
      if (description && 
          typeof description === 'string') {
        const trimmedDesc = description.trim();
        
        // Must have content
        if (trimmedDesc.length === 0) {
          if (title.toLowerCase().includes('albertavenator') || title.toLowerCase().includes('teratophoneus')) {
            console.log(`[SHORT_DESC_DEBUG] Empty after trim`);
          }
          if (source === 'local') continue;
          return null;
        }
        
        // The API description is plain text but may contain HTML tags that should be interpreted as plain text
        // Remove any HTML tags for display
        const textOnly = trimmedDesc.replace(/<[^>]*>/g, '').trim();
        
        if (textOnly.length === 0) {
          if (title.toLowerCase().includes('albertavenator') || title.toLowerCase().includes('teratophoneus')) {
            console.log(`[SHORT_DESC_DEBUG] Empty after HTML tag removal`);
          }
          if (source === 'local') continue;
          return null;
        }
        
        // Debug: log what we got
        if (title.toLowerCase().includes('albertavenator') || title.toLowerCase().includes('teratophoneus')) {
          console.log(`[SHORT_DESC_DEBUG] Processing description from ${source}: "${textOnly}" (${textOnly.length} chars)`);
        }
        
        // Short descriptions are typically very short (usually 40-80 characters, max 100)
        // According to Wikipedia guidelines, they should be about 40 characters
        if (textOnly.length > 100) {
          if (title.toLowerCase().includes('albertavenator') || title.toLowerCase().includes('teratophoneus')) {
            console.log(`[SHORT_DESC_DEBUG] REJECTED - Too long: ${textOnly.length} chars - "${textOnly}"`);
          }
          if (source === 'local') continue;
          return null;
        }
        
        // Check if it looks like a full sentence (multiple clauses, complex structure)
        // Short descriptions are usually simple phrases, not full sentences
        const sentenceCount = (textOnly.match(/[.!?]/g) || []).length;
        if (sentenceCount > 1) {
          // Multiple sentences - definitely not a short description
          if (title.toLowerCase().includes('albertavenator') || title.toLowerCase().includes('teratophoneus')) {
            console.log(`[SHORT_DESC_DEBUG] REJECTED - Multiple sentences: ${sentenceCount} - "${textOnly}"`);
          }
          if (source === 'local') continue;
          return null;
        }
        
        // Check for common patterns that indicate it's not a short description
        // If it has multiple commas or semicolons, it's likely too complex
        const commaCount = (textOnly.match(/,/g) || []).length;
        if (commaCount > 2) {
          // Too many clauses - likely not a short description
          if (title.toLowerCase().includes('albertavenator') || title.toLowerCase().includes('teratophoneus')) {
            console.log(`[SHORT_DESC_DEBUG] REJECTED - Too many commas: ${commaCount} - "${textOnly}"`);
          }
          if (source === 'local') continue;
          return null;
        }
        
        // If it ends with a period and is longer than 60 chars, it might be a sentence
        // Short descriptions rarely end with periods unless they're very short
        if (textOnly.endsWith('.') && textOnly.length > 60) {
          if (title.toLowerCase().includes('albertavenator') || title.toLowerCase().includes('teratophoneus')) {
            console.log(`[SHORT_DESC_DEBUG] REJECTED - Ends with period and too long - "${textOnly}"`);
          }
          if (source === 'local') continue;
          return null;
        }
        
        if (title.toLowerCase().includes('albertavenator') || title.toLowerCase().includes('teratophoneus')) {
          console.log(`[SHORT_DESC_DEBUG] ✓ ACCEPTED from ${source}: "${textOnly}"`, {
            length: textOnly.length,
            sentenceCount,
            commaCount,
            endsWithPeriod: textOnly.endsWith('.')
          });
        }
        
        return textOnly;
      }
      
      // If no description found and we're on local, try central
      if (source === 'local') {
        if (title.toLowerCase().includes('albertavenator') || title.toLowerCase().includes('teratophoneus')) {
          console.log(`[SHORT_DESC_DEBUG] No description in local, trying central`);
        }
        continue;
      }
    }
    
    // If we get here, neither local nor central worked
    if (title.toLowerCase().includes('albertavenator') || title.toLowerCase().includes('teratophoneus')) {
      console.log(`[SHORT_DESC_DEBUG] No description found in local or central sources`);
    }
    
    return null;
  } catch (error) {
    console.error(`Error fetching short description for "${title}":`, error);
    return null;
  }
}; 