import { getFeaturedArticleTitles, pickDailyFeaturedTitle, getWikipediaPageSummary, getArticleContent, getArticleImages } from '../api/wikipedia';

// Check if a title is linked in the first paragraph of an article
function isTitleLinkedInFirstParagraph(htmlContent: string, titleToCheck: string): boolean {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');
  
  // Find the first paragraph
  const firstParagraph = doc.querySelector('p');
  if (!firstParagraph) {
    return false;
  }
  
  // Check all links in the first paragraph
  const links = firstParagraph.querySelectorAll('a[href^="/wiki/"]');
  for (const link of Array.from(links)) {
    const href = link.getAttribute('href');
    if (href) {
      const path = href.replace('/wiki/', '');
      // Filter out special pages
      if (!path.match(/^(File:|Template:|Category:|Help:|Portal:|Wikipedia:|Special:)/i)) {
        const title = decodeURIComponent(path).replace(/_/g, ' ');
        // Case-insensitive comparison
        if (title.toLowerCase() === titleToCheck.toLowerCase()) {
          return true;
        }
      }
    }
  }
  
  return false;
}

// Check if a title is linked anywhere in an article (excluding first paragraph)
function isTitleLinkedInArticle(htmlContent: string, titleToCheck: string, excludeFirstParagraph: boolean = true): boolean {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');
  
  // Get all paragraphs
  const paragraphs = doc.querySelectorAll('p');
  const startIndex = excludeFirstParagraph ? 1 : 0;
  
  for (let i = startIndex; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i];
    const links = paragraph.querySelectorAll('a[href^="/wiki/"]');
    
    for (const link of Array.from(links)) {
      const href = link.getAttribute('href');
      if (href) {
        const path = href.replace('/wiki/', '');
        // Filter out special pages
        if (!path.match(/^(File:|Template:|Category:|Help:|Portal:|Wikipedia:|Special:)/i)) {
          const title = decodeURIComponent(path).replace(/_/g, ' ');
          // Case-insensitive comparison
          if (title.toLowerCase() === titleToCheck.toLowerCase()) {
            return true;
          }
        }
      }
    }
  }
  
  return false;
}

export interface Connection {
  surroundingArticleId: number;
  connectingArticle: string;
  url: string;
  explanation: string;
  thumbnail?: string;
  featuredArticleExcerpt?: string;
  connectionArticleExcerpt?: string;
  featuredArticleSection?: string;
  connectionArticleSection?: string;
}

export interface SurroundingArticle {
  id: number;
  title: string;
  url: string;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  thumbnail?: string;
}

export interface KnowledgeWebPuzzle {
  puzzle_id: string;
  featured_article: {
    title: string;
    url: string;
    description: string;
    thumbnail?: string;
  };
  surrounding_articles: SurroundingArticle[];
  connections: Connection[];
  answer_pool: string[]; // 5 connection articles in random order
}

export interface KnowledgeWebGameState {
  puzzle_id: string;
  submissions: Array<{
    submission_number: number;
    timestamp: string;
    connections: Array<{
      surrounding_article_id: number;
      connecting_article: string;
    }>;
    results: Array<{
      surrounding_article_id: number;
      is_correct: boolean;
    }>;
  }>;
  current_connections: Array<{
    surrounding_article_id: number;
    connecting_article: string | null;
  }>;
  is_complete: boolean;
  final_score: number | null;
  perfect_first_attempt: boolean;
  attempts_remaining: number;
}

// Get UTC date key for daily games
export function getUtcDateKey(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Get game state from localStorage
export function getKnowledgeWebGameState(dateKey: string): KnowledgeWebGameState | null {
  try {
    const stored = localStorage.getItem(`knowledgeWeb_gameState_${dateKey}`);
    if (!stored) return null;
    return JSON.parse(stored) as KnowledgeWebGameState;
  } catch {
    return null;
  }
}

// Save game state to localStorage
export function saveKnowledgeWebGameState(dateKey: string, state: KnowledgeWebGameState): void {
  try {
    localStorage.setItem(`knowledgeWeb_gameState_${dateKey}`, JSON.stringify(state));
  } catch (error) {
    console.error('Error saving knowledge web game state:', error);
  }
}

// Generate a daily puzzle (placeholder - will need manual curation for prototype)
export async function generateDailyKnowledgeWebPuzzle(): Promise<KnowledgeWebPuzzle | null> {
  const dateKey = getUtcDateKey();
  
  // For prototype, we'll use a simple example puzzle
  // In production, this would fetch and generate from Featured Article
  const examplePuzzle: KnowledgeWebPuzzle = {
    puzzle_id: dateKey,
    featured_article: {
      title: 'Golden Gate Bridge',
      url: 'https://en.wikipedia.org/wiki/Golden_Gate_Bridge',
      description: 'Suspension bridge spanning the Golden Gate strait',
    },
    surrounding_articles: [
      { id: 1, title: 'San Francisco', url: 'https://en.wikipedia.org/wiki/San_Francisco', position: 'top-left' },
      { id: 2, title: 'Suspension Bridges', url: 'https://en.wikipedia.org/wiki/Suspension_bridge', position: 'top-right' },
      { id: 3, title: 'Art Deco Architecture', url: 'https://en.wikipedia.org/wiki/Art_Deco', position: 'bottom-right' },
      { id: 4, title: 'California Earthquakes', url: 'https://en.wikipedia.org/wiki/Earthquakes_in_California', position: 'bottom-left' },
    ],
    connections: [
      {
        surroundingArticleId: 1,
        connectingArticle: 'San Francisco Bay',
        url: 'https://en.wikipedia.org/wiki/San_Francisco_Bay',
        explanation: 'The Golden Gate Bridge spans the strait connecting San Francisco Bay and the Pacific Ocean.',
      },
      {
        surroundingArticleId: 2,
        connectingArticle: 'Joseph Strauss (engineer)',
        url: 'https://en.wikipedia.org/wiki/Joseph_Strauss_(engineer)',
        explanation: 'Joseph Strauss was the chief engineer who designed the Golden Gate Bridge.',
      },
      {
        surroundingArticleId: 3,
        connectingArticle: '1930s American Design',
        url: 'https://en.wikipedia.org/wiki/1930s',
        explanation: 'The Golden Gate Bridge was completed in 1937, during the Art Deco era.',
      },
      {
        surroundingArticleId: 4,
        connectingArticle: 'Seismic Retrofitting',
        url: 'https://en.wikipedia.org/wiki/Seismic_retrofit',
        explanation: 'The Golden Gate Bridge underwent seismic retrofitting to withstand California earthquakes.',
      },
    ],
    answer_pool: [
      'San Francisco Bay',
      'Joseph Strauss (engineer)',
      '1930s American Design',
      'Seismic Retrofitting',
    ],
  };

  // Fetch featured article content to check for connections (with timeout)
  let featuredArticleContent: string | null = null;
  try {
    const contentPromise = getArticleContent(examplePuzzle.featured_article.title);
    const timeoutPromise = new Promise<string>((_, reject) => 
      setTimeout(() => reject(new Error('Timeout')), 5000)
    );
    featuredArticleContent = await Promise.race([contentPromise, timeoutPromise]);
  } catch (error) {
    console.warn('Error or timeout fetching featured article content, proceeding without validation:', error);
  }

  // Helper function to extract links from HTML content (excluding first paragraph)
  const extractLinksFromContent = (htmlContent: string, excludeFirstParagraph: boolean = true): string[] => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    const links: string[] = [];
    const seen = new Set<string>();
    
    // Get all paragraphs or start from second paragraph if excluding first
    const paragraphs = doc.querySelectorAll('p');
    const startIndex = excludeFirstParagraph ? 1 : 0;
    
    for (let i = startIndex; i < paragraphs.length && links.length < 20; i++) {
      const paragraph = paragraphs[i];
      const paragraphLinks = paragraph.querySelectorAll('a[href^="/wiki/"]');
      
      for (const link of Array.from(paragraphLinks)) {
        const href = link.getAttribute('href');
        if (href) {
          const path = href.replace('/wiki/', '');
          // Filter out special pages
          if (!path.match(/^(File:|Template:|Category:|Help:|Portal:|Wikipedia:|Special:)/i)) {
            const title = decodeURIComponent(path).replace(/_/g, ' ');
            // Skip if already seen or if it's the featured article or a surrounding article
            if (!seen.has(title.toLowerCase()) && 
                title.toLowerCase() !== examplePuzzle.featured_article.title.toLowerCase() &&
                !examplePuzzle.surrounding_articles.some(a => a.title.toLowerCase() === title.toLowerCase())) {
              links.push(title);
              seen.add(title.toLowerCase());
            }
          }
        }
      }
    }
    
    return links;
  };
  
  // Helper function to find a replacement connection for a surrounding article
  const findReplacementConnection = async (
    surroundingArticle: SurroundingArticle,
    existingConnections: Connection[]
  ): Promise<Connection | null> => {
    try {
      // Extract potential connection articles from the featured article (excluding first paragraph)
      // These are the candidates since connecting articles must be linked in the featured article
      let candidateTitles: string[] = [];
      if (featuredArticleContent) {
        candidateTitles = extractLinksFromContent(featuredArticleContent, true);
      }
      
      // Limit the number of candidates we try to avoid long loading times
      const maxCandidatesToTry = 15;
      candidateTitles = candidateTitles.slice(0, maxCandidatesToTry);
      
      // Try each candidate until we find a valid one
      for (const candidateTitle of candidateTitles) {
        // Skip if already used
        if (existingConnections.some(c => c.connectingArticle.toLowerCase() === candidateTitle.toLowerCase())) {
          continue;
        }
        
        // Skip if candidate is the same as any surrounding article
        if (examplePuzzle.surrounding_articles.some(a => a.title.toLowerCase() === candidateTitle.toLowerCase())) {
          continue;
        }
        
        try {
          // Check if candidate is mentioned in featured article's first paragraph (should not be)
          if (featuredArticleContent && isTitleLinkedInFirstParagraph(featuredArticleContent, candidateTitle)) {
            continue;
          }
          
          // Check if candidate is linked in featured article (excluding first paragraph) - REQUIRED
          if (!featuredArticleContent || !isTitleLinkedInArticle(featuredArticleContent, candidateTitle, true)) {
            continue;
          }
          
          // Check if featured article is mentioned in candidate's first paragraph (should not be)
          const candidateContent = await getArticleContent(candidateTitle);
          if (isTitleLinkedInFirstParagraph(candidateContent, examplePuzzle.featured_article.title)) {
            continue;
          }
          
          // Check if surrounding article is linked in candidate article (excluding first paragraph) - REQUIRED
          if (!isTitleLinkedInArticle(candidateContent, surroundingArticle.title, true)) {
            continue;
          }
          
          // Found a valid replacement!
          return {
            surroundingArticleId: surroundingArticle.id,
            connectingArticle: candidateTitle,
            url: `https://en.wikipedia.org/wiki/${candidateTitle.replace(/ /g, '_')}`,
            explanation: `${candidateTitle} connects ${examplePuzzle.featured_article.title} to ${surroundingArticle.title}.`,
          };
        } catch (error) {
          // Try next candidate
          continue;
        }
      }
      
      return null;
    } catch (error) {
      console.error(`Error finding replacement connection for ${surroundingArticle.title}:`, error);
      return null;
    }
  };
  
  // Use original connections by default - validation is optional and non-blocking
  // If featured article content is available, do quick validation
  let validConnections: Connection[] = [];
  
  if (featuredArticleContent) {
    // Quick validation: check if connections are linked in featured article
    for (const connection of examplePuzzle.connections) {
      // Skip if connection is the same as a surrounding article
      if (examplePuzzle.surrounding_articles.some(a => a.title.toLowerCase() === connection.connectingArticle.toLowerCase())) {
        continue;
      }
      
      // Skip if mentioned in first paragraph
      if (isTitleLinkedInFirstParagraph(featuredArticleContent, connection.connectingArticle)) {
        continue;
      }
      
      // Check if linked in featured article (excluding first paragraph)
      if (isTitleLinkedInArticle(featuredArticleContent, connection.connectingArticle, true)) {
        validConnections.push(connection);
      }
    }
  }
  
  // If validation didn't find enough or no content available, use all originals
  if (validConnections.length < 4) {
    console.log(`Using ${examplePuzzle.connections.length} original connections (validation found ${validConnections.length})`);
    validConnections = [...examplePuzzle.connections];
  } else {
    // Ensure we have exactly 4
    validConnections = validConnections.slice(0, 4);
  }
  
  // Update puzzle with valid connections
  examplePuzzle.connections = validConnections.slice(0, 4);
  examplePuzzle.answer_pool = examplePuzzle.connections.map(c => c.connectingArticle);
  
  // Ensure we have exactly 4 (should be guaranteed by now, but double-check)
  if (examplePuzzle.answer_pool.length !== 4) {
    console.warn(`Answer pool has ${examplePuzzle.answer_pool.length} items, expected 4.`);
  }

  // Fetch images for all articles
  try {
    // Featured article image
    const featuredImages = await getArticleImages(examplePuzzle.featured_article.title, true);
    if (featuredImages.length > 0) {
      examplePuzzle.featured_article.thumbnail = featuredImages[0].url;
    }

    // Surrounding articles images
    const surroundingImagePromises = examplePuzzle.surrounding_articles.map(async (article) => {
      const images = await getArticleImages(article.title, true);
      return { article, thumbnail: images.length > 0 ? images[0].url : undefined };
    });
    const surroundingImages = await Promise.all(surroundingImagePromises);
    surroundingImages.forEach(({ article, thumbnail }) => {
      const foundArticle = examplePuzzle.surrounding_articles.find(a => a.id === article.id);
      if (foundArticle) {
        foundArticle.thumbnail = thumbnail;
      }
    });

    // Connecting articles images
    const connectionImagePromises = examplePuzzle.connections.map(async (connection) => {
      const images = await getArticleImages(connection.connectingArticle, true);
      return { connection, thumbnail: images.length > 0 ? images[0].url : undefined };
    });
    const connectionImages = await Promise.all(connectionImagePromises);
    connectionImages.forEach(({ connection, thumbnail }) => {
      const foundConnection = examplePuzzle.connections.find(c => c.surroundingArticleId === connection.surroundingArticleId);
      if (foundConnection) {
        foundConnection.thumbnail = thumbnail;
      }
    });
  } catch (error) {
    console.error('Error fetching images for knowledge web puzzle:', error);
    // Continue without images if fetch fails
  }

  // Shuffle answer pool
  const shuffled = [...examplePuzzle.answer_pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  examplePuzzle.answer_pool = shuffled;

  return examplePuzzle;
}

// Check if puzzle is complete
export function isPuzzleComplete(state: KnowledgeWebGameState): boolean {
  return state.is_complete || state.attempts_remaining === 0;
}

// Validate a submission
export function validateSubmission(
  puzzle: KnowledgeWebPuzzle,
  connections: Array<{ surrounding_article_id: number; connecting_article: string }>
): Array<{ surrounding_article_id: number; is_correct: boolean }> {
  return connections.map(conn => {
    const correctConnection = puzzle.connections.find(
      c => c.surroundingArticleId === conn.surrounding_article_id
    );
    return {
      surrounding_article_id: conn.surrounding_article_id,
      is_correct: correctConnection?.connectingArticle === conn.connecting_article,
    };
  });
}

// Calculate final score
export function calculateKnowledgeWebScore(state: KnowledgeWebGameState): number {
  if (state.submissions.length === 0) return 0;
  const lastSubmission = state.submissions[state.submissions.length - 1];
  return lastSubmission.results.filter(r => r.is_correct).length;
}
