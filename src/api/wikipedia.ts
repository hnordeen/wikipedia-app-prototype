const WIKIPEDIA_API_URL = 'https://en.wikipedia.org/w/api.php';

export interface SearchResult {
  title: string;
  snippet: string;
  pageid: number;
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