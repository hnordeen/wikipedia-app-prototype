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

export const getArticleImages = async (title: string): Promise<ArticleImage[]> => {
  const params = new URLSearchParams({
    action: 'query',
    prop: 'images|imageinfo',
    titles: title,
    imlimit: '4', // Reduced from 10 to 4 since we only show 4 images
    iiprop: 'url|extmetadata',
    format: 'json',
    origin: '*'
  });

  try {
    const response = await fetch(`${WIKIPEDIA_API_URL}?${params}`);
    const data = await response.json();
    const pages = data.query.pages;
    const pageId = Object.keys(pages)[0];
    const images = pages[pageId].images || [];

    // Filter out non-image files and get image URLs
    const imagePromises = images
      .filter((img: any) => img.title.toLowerCase().match(/\.(jpg|jpeg|png|gif)$/))
      .map(async (img: any) => {
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
        const imageInfo = imagePages[imagePageId].imageinfo[0];

        return {
          title: img.title,
          url: imageInfo.url,
          description: imageInfo.extmetadata?.ImageDescription?.value || ''
        };
      });

    return Promise.all(imagePromises);
  } catch (error) {
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