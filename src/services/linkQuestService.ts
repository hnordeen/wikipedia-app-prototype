import { getFeaturedArticleFromMainPage, getFeaturedArticleTitles, pickDailyFeaturedTitle, getArticleContent, getArticleImages, getWikipediaPageSummary, getArticleExtract, getArticleShortDescription, SearchResult, ArticleImage } from '../api/wikipedia';
import { getMoreLikeArticles } from '../api/wikipedia';

export interface GameCard {
  title: string;
  description?: string;
  thumbnail?: ArticleImage;
  isLinked: boolean;
  linkContext?: string; // HTML snippet showing where it appears in featured article
  linkContextTitle?: string; // The title of the highlighted link in the context
  linkSectionHeading?: string; // The section heading where the link appears
}

export interface DailyGame {
  featuredArticle: {
    title: string;
    leadParagraph: string;
    thumbnail?: ArticleImage;
  };
  cards: GameCard[];
  dateKey: string;
  featuredArticleContentHtml: string; // Store HTML for link context rendering
}

export interface GameState {
  currentCardIndex: number;
  answers: boolean[]; // true = correct, false = incorrect
  hintsUsed: number;
  shuffleCount: number;
  isComplete: boolean;
}

export interface GameResult {
  score: number;
  totalCards: number;
  hintsUsed: number;
  featuredArticle: string;
  pullQuote?: string;
  pullQuoteSectionHeading?: string;
  linkedArticles: GameCard[];
  notLinkedArticles: GameCard[];
}

const GAME_STATE_KEY = 'linkQuest_gameState';
const STREAK_KEY = 'linkQuest_streak';
const LAST_PLAYED_KEY = 'linkQuest_lastPlayed';

// Get UTC date key for daily games
export function getUtcDateKey(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Extract links from HTML content, skipping the introduction section
function extractLinksFromContent(htmlContent: string): Set<string> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');
  
  // Find the first section heading (h2) to mark the end of the introduction
  const firstSectionHeading = doc.querySelector('h2');
  let introEndElement: Element | null = null;
  
  if (firstSectionHeading) {
    // Skip links that appear before the first section heading
    introEndElement = firstSectionHeading;
  } else {
    // If no h2, skip links from the first ~1000 characters of text
    // This is a fallback for articles without clear section structure
    const body = doc.body;
    if (body) {
      const allText = body.textContent || '';
      let charCount = 0;
      const walker = doc.createTreeWalker(body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while (node = walker.nextNode()) {
        if (node.nodeType === Node.TEXT_NODE) {
          charCount += (node.textContent || '').length;
          if (charCount > 1000) {
            introEndElement = node.parentElement;
            break;
          }
        }
      }
    }
  }
  
  const links = doc.querySelectorAll('a[href^="/wiki/"]');
  const linkTitles = new Set<string>();
  
  links.forEach(link => {
    // Skip links from infoboxes
    const infobox = link.closest('.infobox, .infobox_v2, .infobox_v3, table.infobox');
    if (infobox) {
      return;
    }
    
    // Skip links from references/citations
    const reference = link.closest('.reference, .mw-references-wrap, .reflist, .references, ol.references, ul.references, .cite_note, .citation');
    if (reference) {
      return;
    }
    
    // Skip links from navboxes
    const navbox = link.closest('.navbox, .vertical-navbox, .horizontal-navbox');
    if (navbox) {
      return;
    }
    
    // Skip links from image captions
    const imageCaption = link.closest('.thumbcaption, .gallerytext, .image, figcaption, .floatright, .floatleft, .thumb, .thumbinner, .thumbimage');
    if (imageCaption) {
      return;
    }
    
    // Skip links that appear before or at the introduction end
    if (introEndElement) {
      const position = link.compareDocumentPosition(introEndElement);
      // If link comes before introEndElement, skip it
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
        // Link is before intro end, skip it
        return;
      }
      // Otherwise, link is after intro end, include it
    }
    
    const href = link.getAttribute('href');
    if (href) {
      const path = href.replace('/wiki/', '');
      // Filter out special pages
      if (!path.match(/^(File:|Template:|Category:|Help:|Portal:|Wikipedia:|Special:)/i)) {
        const title = decodeURIComponent(path).replace(/_/g, ' ');
        linkTitles.add(title);
      }
    }
  });
  
  return linkTitles;
}

// Get context snippet where a link appears (returns HTML with links preserved)
function getLinkContext(htmlContent: string, linkTitle: string): { html: string; highlightedLinkTitle: string; sectionHeading?: string } | undefined {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');
  const links = doc.querySelectorAll('a[href^="/wiki/"]');
  
  for (const link of Array.from(links)) {
    const href = link.getAttribute('href');
    if (href) {
      const path = href.replace('/wiki/', '');
      const title = decodeURIComponent(path).replace(/_/g, ' ');
      
      if (title.toLowerCase() === linkTitle.toLowerCase()) {
        // Skip if link is in infobox or references
        const infobox = link.closest('.infobox, .infobox_v2, .infobox_v3, table.infobox');
        if (infobox) {
          continue;
        }
        
        const reference = link.closest('.reference, .mw-references-wrap, .reflist, .references, ol.references, ul.references, .cite_note, .citation');
        if (reference) {
          continue;
        }
        
        // Skip links from image captions
        const imageCaption = link.closest('.thumbcaption, .gallerytext, .image, figcaption, .floatright, .floatleft, .thumb, .thumbinner, .thumbimage');
        if (imageCaption) {
          continue;
        }
        
        // Find the section heading for this link
        let sectionHeading: string | undefined;
        let currentElement: Element | null = link.parentElement;
        
        // Walk up the DOM to find the nearest section heading (h2, h3, etc.)
        while (currentElement && currentElement !== doc.body) {
          if (currentElement.tagName && ['H2', 'H3', 'H4', 'H5', 'H6'].includes(currentElement.tagName)) {
            sectionHeading = currentElement.textContent?.trim() || undefined;
            break;
          }
          currentElement = currentElement.parentElement;
        }
        // Get parent paragraph or section
        let parent = link.parentElement;
        while (parent && !['P', 'LI', 'TD'].includes(parent.tagName)) {
          parent = parent.parentElement;
        }
        
        if (parent) {
          try {
            // Clone the parent to preserve HTML structure
            const parentClone = parent.cloneNode(true) as HTMLElement;
            
            // Get text content to find the link position
            const fullText = parent.textContent || '';
            const linkText = link.textContent || '';
            
            if (!fullText || !linkText) {
              continue; // Skip if no text content
            }
            
            const linkIndex = fullText.indexOf(linkText);
            
            if (linkIndex === -1 || linkIndex >= fullText.length) {
              continue; // Skip if link not found in text
            }
            
            if (linkIndex !== -1) {
            // Find sentence boundaries before the link (go back to find 2-3 sentences)
            let startPos = linkIndex;
            let sentenceCount = 0;
            const maxCharsBefore = 300; // Maximum characters to look back
            const minCharsBefore = 100; // Minimum to ensure we get at least some context
            const searchStart = Math.max(0, linkIndex - maxCharsBefore);
            
            // Go backwards from the link to find sentence boundaries
            for (let i = linkIndex - 1; i >= searchStart && sentenceCount < 3; i--) {
              if (i < 0 || i >= fullText.length) break; // Safety check
              
              const char = fullText[i];
              // Check for sentence endings: period, exclamation, question mark followed by space or newline
              // Skip ellipses (multiple periods)
              if ((char === '.' || char === '!' || char === '?') && 
                  (i === 0 || fullText[i - 1] !== '.' || (i >= 2 && fullText[i - 2] !== '.'))) {
                // Check if followed by space, newline, or end of text
                if (i === fullText.length - 1 || (i + 1 < fullText.length && /\s/.test(fullText[i + 1]))) {
                  sentenceCount++;
                  if (sentenceCount >= 2) {
                    // Found 2 sentences before, start from after this sentence
                    startPos = i + 1;
                    // Skip any whitespace
                    while (startPos < linkIndex && startPos < fullText.length && /\s/.test(fullText[startPos])) {
                      startPos++;
                    }
                    break;
                  }
                }
              }
            }
            
            // If we didn't find enough sentences, use a minimum character count
            if (linkIndex - startPos < minCharsBefore) {
              startPos = Math.max(0, linkIndex - minCharsBefore);
            }
            
            // Ensure startPos is valid
            startPos = Math.max(0, Math.min(startPos, fullText.length));
            
            // Include text after the link (450 chars, ending at sentence boundary)
            const charsAfter = 450;
            let endPos = Math.min(fullText.length, linkIndex + linkText.length + charsAfter);
            
            // Try to end at a sentence boundary
            for (let i = endPos; i < Math.min(fullText.length, endPos + 50); i++) {
              if (i < 0 || i >= fullText.length) break; // Safety check
              
              const char = fullText[i];
              if ((char === '.' || char === '!' || char === '?') && 
                  (i === 0 || fullText[i - 1] !== '.' || (i >= 2 && fullText[i - 2] !== '.'))) {
                if (i === fullText.length - 1 || (i + 1 < fullText.length && /\s/.test(fullText[i + 1]))) {
                  endPos = i + 1;
                  break;
                }
              }
            }
            
            // Ensure endPos is valid and greater than startPos
            endPos = Math.max(startPos + 1, Math.min(endPos, fullText.length));
            
            // Use Range API to extract the snippet with HTML preserved
            const range = doc.createRange();
            
            // Find text nodes that contain our snippet boundaries
            const walker = doc.createTreeWalker(
              parentClone,
              NodeFilter.SHOW_TEXT
            );
            
            let currentTextPos = 0;
            let startNode: Text | null = null;
            let endNode: Text | null = null;
            let startOffset = 0;
            let endOffset = 0;
            
            let node: Node | null;
            while (node = walker.nextNode()) {
              if (node.nodeType === Node.TEXT_NODE) {
                const textNode = node as Text;
                const textLength = textNode.textContent?.length || 0;
                
                if (startNode === null && currentTextPos + textLength >= startPos) {
                  startNode = textNode;
                  startOffset = startPos - currentTextPos;
                }
                
                if (currentTextPos + textLength >= endPos) {
                  endNode = textNode;
                  endOffset = endPos - currentTextPos;
                  break;
                }
                
                currentTextPos += textLength;
              }
            }
            
            // Create snippet container
            const snippetContainer = doc.createElement('div');
            
            if (startNode && endNode) {
              // Set range to extract the snippet
              range.setStart(startNode, Math.max(0, startOffset));
              range.setEnd(endNode, Math.min(endNode.textContent?.length || 0, endOffset));
              snippetContainer.appendChild(range.cloneContents());
            } else {
              // Fallback: use full parent clone
              snippetContainer.appendChild(parentClone.cloneNode(true));
            }
            
            // Find and mark the target link for highlighting
            const targetLinks = snippetContainer.querySelectorAll('a[href^="/wiki/"]');
            targetLinks.forEach((l) => {
              const lHref = l.getAttribute('href');
              if (lHref) {
                const lPath = lHref.replace('/wiki/', '');
                const lTitle = decodeURIComponent(lPath).replace(/_/g, ' ');
                if (lTitle.toLowerCase() === linkTitle.toLowerCase()) {
                  l.setAttribute('data-highlight', 'true');
                  l.setAttribute('data-link-title', title);
                }
              }
            });
            
            // Get HTML with all links preserved
            let html = snippetContainer.innerHTML.trim();
            
            // Add ellipsis if needed
            if (startPos > 0) {
              html = '... ' + html;
            }
            if (endPos < fullText.length) {
              html = html + ' ...';
            }
            
            return {
              html,
              highlightedLinkTitle: title, // Use the article title from href, not link text
              sectionHeading
            };
          }
          } catch (error) {
            // If there's an error extracting context, skip this link and continue
            console.warn('Error extracting link context:', error);
            continue;
          }
        }
      }
    }
  }
  
  return undefined;
}

// Generate daily game
export const generateDailyGame = async (): Promise<DailyGame | null> => {
  try {
    const dateKey = getUtcDateKey(new Date());
    const today = new Date();
    
    // Get today's featured article from Wikipedia's main page using Wikifeeds
    // (same approach as the Wikipedia iOS app)
    let featuredTitle = await getFeaturedArticleFromMainPage(today);
    
    // Fallback to the old method if Wikifeeds fails
    if (!featuredTitle) {
      console.warn('Wikifeeds failed, falling back to featured articles list');
      const featuredTitles = await getFeaturedArticleTitles(2500);
      featuredTitle = pickDailyFeaturedTitle(featuredTitles, today);
    }
    
    if (!featuredTitle) {
      console.error('Failed to get featured article from both Wikifeeds and featured articles list');
      return null;
    }
    
    console.log('Using featured article:', featuredTitle);
    
    // Fetch featured article content and metadata
    // Prioritize infobox images for the featured article (main article)
    const [contentHtml, summary, thumbnail] = await Promise.all([
      getArticleContent(featuredTitle),
      getWikipediaPageSummary(featuredTitle),
      getArticleImages(featuredTitle, true).then(images => images[0]) // prioritizeInfobox = true
    ]);
    
    // Extract all linked articles
    const linkedTitles = extractLinksFromContent(contentHtml);
    const linkedTitlesArray = Array.from(linkedTitles);
    
    if (linkedTitlesArray.length < 5) {
      console.error('Featured article has too few links');
      return null;
    }
    
    // Get 5-7 linked articles (with images preferred)
    // IMPORTANT: Never use the featured article itself as a card
    const linkedCandidates: GameCard[] = [];
    for (const title of linkedTitlesArray) {
      if (linkedCandidates.length >= 7) break;
      
      // Skip if this is the featured article (case-insensitive comparison)
      if (title.toLowerCase() === featuredTitle.toLowerCase()) {
        continue;
      }
      
      try {
        const [images, shortDesc] = await Promise.all([
          getArticleImages(title),
          getArticleShortDescription(title)
        ]);
        
        // Only include articles that have images
        if (!images || images.length === 0 || !images[0]) {
          continue;
        }
        
        const context = getLinkContext(contentHtml, title);
        
        linkedCandidates.push({
          title,
          description: shortDesc || undefined,
          thumbnail: images[0],
          isLinked: true,
          linkContext: context ? context.html : undefined,
          linkContextTitle: context ? context.highlightedLinkTitle : undefined,
          linkSectionHeading: context ? context.sectionHeading : undefined
        });
      } catch (error) {
        // Silently skip articles that fail to load (rate limiting, missing data, etc.)
        // Only log if it's a critical error
        if (error instanceof Error && !error.message.includes('429') && !error.message.includes('rate limit')) {
          console.warn(`Warning: Could not fetch data for ${title}:`, error.message);
        }
      }
    }
    
    // Get 3-5 not-linked articles (plausible but not actually linked)
    const notLinkedCandidates: GameCard[] = [];
    
    // Try to get similar articles that aren't linked
    try {
      const similar = await getMoreLikeArticles(featuredTitle.replace(/ /g, '_'), 20);
      for (const result of similar) {
        if (notLinkedCandidates.length >= 5) break;
        if (linkedTitles.has(result.title)) continue; // Skip if actually linked
        // Skip if this is the featured article itself
        if (result.title.toLowerCase() === featuredTitle.toLowerCase()) continue;
        
        // Only include articles that have images
        if (!result.images || result.images.length === 0 || !result.images[0]) {
          continue;
        }
        
        notLinkedCandidates.push({
          title: result.title,
          description: result.snippet,
          thumbnail: result.images[0],
          isLinked: false
        });
      }
    } catch (error) {
      // Silently handle errors when fetching similar articles
      if (error instanceof Error && !error.message.includes('429') && !error.message.includes('rate limit')) {
        console.warn('Warning: Could not fetch similar articles:', error.message);
      }
    }
    
    // Note: We rely on search results for not-linked candidates
    // If we don't have enough, we'll use what we have (minimum 3 required)
    
    // Combine and shuffle cards (5-7 linked, 3-5 not linked)
    const linkedCount = Math.min(7, Math.max(5, linkedCandidates.length));
    const notLinkedCount = 10 - linkedCount;
    
    const selectedLinked = linkedCandidates.slice(0, linkedCount);
    const selectedNotLinked = notLinkedCandidates.slice(0, notLinkedCount);
    
    const allCards = [...selectedLinked, ...selectedNotLinked];
    shuffleArray(allCards);
    
    return {
      featuredArticle: {
        title: featuredTitle,
        leadParagraph: summary?.extract?.split('\n\n')[0] || '',
        thumbnail
      },
      cards: allCards,
      dateKey,
      featuredArticleContentHtml: contentHtml
    };
  } catch (error) {
    console.error('Error generating daily game:', error);
    return null;
  }
};


// Shuffle array
function shuffleArray<T>(array: T[]): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// Get current game state
export const getGameState = (dateKey: string): GameState | null => {
  try {
    const stored = localStorage.getItem(`${GAME_STATE_KEY}_${dateKey}`);
    if (!stored) return null;
    return JSON.parse(stored);
  } catch {
    return null;
  }
};

// Save game state
export const saveGameState = (dateKey: string, state: GameState): void => {
  try {
    localStorage.setItem(`${GAME_STATE_KEY}_${dateKey}`, JSON.stringify(state));
  } catch (error) {
    console.error('Error saving game state:', error);
  }
};

// Get streak
export const getStreak = (): number => {
  try {
    const stored = localStorage.getItem(STREAK_KEY);
    return stored ? parseInt(stored, 10) : 0;
  } catch {
    return 0;
  }
};

// Update streak
export const updateStreak = (): number => {
  const today = getUtcDateKey(new Date());
  const lastPlayed = localStorage.getItem(LAST_PLAYED_KEY);
  const currentStreak = getStreak();
  
  if (lastPlayed === today) {
    // Already played today, return current streak
    return currentStreak;
  }
  
  const yesterday = getUtcDateKey(new Date(Date.now() - 86400000));
  
  if (lastPlayed === yesterday) {
    // Continued streak
    const newStreak = currentStreak + 1;
    localStorage.setItem(STREAK_KEY, newStreak.toString());
    localStorage.setItem(LAST_PLAYED_KEY, today);
    return newStreak;
  } else if (!lastPlayed || lastPlayed < yesterday) {
    // Streak broken or first time
    localStorage.setItem(STREAK_KEY, '1');
    localStorage.setItem(LAST_PLAYED_KEY, today);
    return 1;
  }
  
  return currentStreak;
};

// Calculate game result
export const calculateResult = (game: DailyGame, state: GameState): GameResult => {
  const score = state.answers.filter((correct, index) => {
    const card = game.cards[index];
    return correct === card.isLinked;
  }).length;
  
  const linkedArticles: GameCard[] = [];
  const notLinkedArticles: GameCard[] = [];
  
  game.cards.forEach((card, index) => {
    const wasCorrect = state.answers[index] === card.isLinked;
    if (wasCorrect && card.isLinked) {
      linkedArticles.push(card);
    } else if (!card.isLinked) {
      notLinkedArticles.push(card);
    }
  });
  
  // Find a pull quote (sentence with a correctly guessed link)
  let pullQuote: string | undefined;
  let pullQuoteSectionHeading: string | undefined;
  for (let i = 0; i < game.cards.length; i++) {
    const card = game.cards[i];
    const wasCorrect = state.answers[i] === card.isLinked;
    if (wasCorrect && card.isLinked && card.linkContext) {
      pullQuote = card.linkContext;
      pullQuoteSectionHeading = card.linkSectionHeading;
      console.log('calculateResult - Found pull quote from card:', {
        cardTitle: card.title,
        hasLinkContext: !!card.linkContext,
        linkSectionHeading: card.linkSectionHeading
      });
      break;
    }
  }
  
  return {
    score,
    totalCards: game.cards.length,
    hintsUsed: state.hintsUsed,
    featuredArticle: game.featuredArticle.title,
    pullQuote,
    pullQuoteSectionHeading,
    linkedArticles,
    notLinkedArticles
  };
};
