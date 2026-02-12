import { getFeaturedArticleFromMainPage, getFeaturedArticleTitles, pickDailyFeaturedTitle, getArticleContent, getArticleImages, getWikipediaPageSummary, getArticleExtract, getArticleShortDescription, SearchResult, ArticleImage } from '../api/wikipedia';
import { getMoreLikeArticles } from '../api/wikipedia';

export interface GameCard {
  title: string;
  description?: string;
  thumbnail?: ArticleImage;
  extract?: string; // First paragraph for articles without images
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
  skippedIndices: number[]; // indices of cards that were skipped
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
  allLinkedArticles: Array<{ card: GameCard; wasCorrect: boolean }>; // All linked articles with correctness
  allNotLinkedArticles: Array<{ card: GameCard; wasCorrect: boolean }>; // All not-linked articles with correctness
}

const GAME_STATE_KEY = 'linkQuest_gameState';
const GAME_DATA_KEY = 'linkQuest_gameData';
const STREAK_KEY = 'linkQuest_streak';
const LAST_PLAYED_KEY = 'linkQuest_lastPlayed';

// Get UTC date key for daily games
export function getUtcDateKey(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Extract links from the first section (introduction) only
function extractLinksFromFirstSection(htmlContent: string): Set<string> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');
  
  // Find the first section heading (h2) to mark the end of the introduction
  const firstSectionHeading = doc.querySelector('h2');
  let introEndElement: Element | null = null;
  
  if (firstSectionHeading) {
    introEndElement = firstSectionHeading;
  } else {
    // If no h2, use first ~1000 characters of text as fallback
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
    
    // Only include links that appear BEFORE or AT the introduction end (first section only)
    if (introEndElement) {
      const position = link.compareDocumentPosition(introEndElement);
      // If link comes after introEndElement, skip it (we only want first section)
      if (position & Node.DOCUMENT_POSITION_PRECEDING) {
        // Link is after intro end, skip it
        return;
      }
      // Otherwise, link is before or at intro end, include it
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

// Get cached daily game if it exists for today
export const getCachedDailyGame = (dateKey: string): DailyGame | null => {
  try {
    const cached = localStorage.getItem(`${GAME_DATA_KEY}_${dateKey}`);
    if (cached) {
      const game = JSON.parse(cached);
      // Verify it's for the correct date
      if (game.dateKey === dateKey) {
        return game;
      }
    }
    return null;
  } catch {
    return null;
  }
};

// Clear cached daily game (useful for forcing regeneration)
export const clearCachedDailyGame = (dateKey?: string): void => {
  try {
    const keyToClear = dateKey || getUtcDateKey(new Date());
    localStorage.removeItem(`${GAME_DATA_KEY}_${keyToClear}`);
    console.log('Cleared cached game for', keyToClear);
  } catch (error) {
    console.error('Error clearing cached game:', error);
  }
};

// Cache daily game
const cacheDailyGame = (dateKey: string, game: DailyGame): void => {
  try {
    localStorage.setItem(`${GAME_DATA_KEY}_${dateKey}`, JSON.stringify(game));
  } catch (error) {
    console.error('Error caching game data:', error);
  }
};

// Generate daily game
export const generateDailyGame = async (forceRegenerate: boolean = false): Promise<DailyGame | null> => {
  try {
    const dateKey = getUtcDateKey(new Date());
    
    // Check if we already have a cached game for today (unless forcing regeneration)
    if (!forceRegenerate) {
      const cachedGame = getCachedDailyGame(dateKey);
      if (cachedGame) {
        console.log('Using cached game for', dateKey);
        return cachedGame;
      }
    } else {
      // Clear cache if forcing regeneration
      clearCachedDailyGame(dateKey);
    }
    
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
    
    // Extract all linked articles (from sections after the first section)
    const linkedTitles = extractLinksFromContent(contentHtml);
    // Also extract links from first section to exclude them from not-linked candidates
    const firstSectionLinks = extractLinksFromFirstSection(contentHtml);
    const linkedTitlesArray = Array.from(linkedTitles);
    
    if (linkedTitlesArray.length < 5) {
      console.error('Featured article has too few links');
      return null;
    }
    
    // Sort linked titles deterministically (alphabetically) so everyone gets the same candidates
    linkedTitlesArray.sort();
    
    // Get 3 linked articles (with images preferred)
    // IMPORTANT: Never use the featured article itself as a card
    // IMPORTANT: Never use "Main page" as a card
    const linkedCandidates: GameCard[] = [];
    for (const title of linkedTitlesArray) {
      if (linkedCandidates.length >= 4) break; // Get up to 4 to ensure we have enough after filtering
      
      // Skip if this is the featured article (case-insensitive comparison)
      if (title.toLowerCase() === featuredTitle.toLowerCase()) {
        continue;
      }
      
      // Skip "Main page" articles
      if (title.toLowerCase() === 'main page' || title.toLowerCase().includes('main page')) {
        continue;
      }
      
      try {
        const [images, shortDesc, summary] = await Promise.all([
          getArticleImages(title),
          getArticleShortDescription(title),
          getWikipediaPageSummary(title).catch(() => null) // Fallback if short desc fails
        ]);
        
        // Include articles with or without images
        // If no image, we'll use extract instead
        const hasImage = images && images.length > 0 && images[0];
        
        // Get description with fallbacks: short description -> extract from summary -> undefined
        let description: string | undefined = undefined;
        let extract: string | undefined = undefined;
        
        if (shortDesc) {
          description = shortDesc;
        } else if (summary?.extract) {
          // Use first sentence or first 120 characters of extract as fallback
          const fullExtract = summary.extract;
          const firstSentence = fullExtract.split(/[.!?]\s+/)[0];
          description = firstSentence.length > 0 && firstSentence.length <= 150 
            ? firstSentence 
            : fullExtract.substring(0, 120).trim() + (fullExtract.length > 120 ? '...' : '');
        }
        
        // If no image, get more of the first paragraph for the extract
        if (!hasImage && summary?.extract) {
          // Get first paragraph (up to 300 characters) for cards without images
          const fullExtract = summary.extract;
          const firstParagraph = fullExtract.split('\n\n')[0] || fullExtract;
          extract = firstParagraph.length > 300 
            ? firstParagraph.substring(0, 300).trim() + '...' 
            : firstParagraph;
        }
        
        const context = getLinkContext(contentHtml, title);
        
        linkedCandidates.push({
          title,
          description,
          thumbnail: hasImage ? images[0] : undefined,
          extract,
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
    
    // Get 2-3 not-linked articles (plausible but not actually linked)
    const notLinkedCandidates: GameCard[] = [];
    
    // Try to get similar articles that aren't linked
    try {
      const similar = await getMoreLikeArticles(featuredTitle.replace(/ /g, '_'), 20);
      for (const result of similar) {
        if (notLinkedCandidates.length >= 3) break;
        if (linkedTitles.has(result.title)) continue; // Skip if actually linked in later sections
        // Skip if this article appears in the first section (introduction)
        if (firstSectionLinks.has(result.title)) continue; // Don't use as distractor if linked in intro
        // Skip if this is the featured article itself
        if (result.title.toLowerCase() === featuredTitle.toLowerCase()) continue;
        // Skip "Main page" articles
        if (result.title.toLowerCase() === 'main page' || result.title.toLowerCase().includes('main page')) continue;
        
        // Include articles with or without images
        const hasImage = result.images && result.images.length > 0 && result.images[0];
        
        // Get description with fallbacks: snippet from search -> short description -> extract
        let description: string | undefined = result.snippet;
        let extract: string | undefined = undefined;
        
        // If no snippet, try to get short description or extract
        if (!description || description.trim().length === 0) {
          try {
            const shortDesc = await getArticleShortDescription(result.title);
            if (shortDesc) {
              description = shortDesc;
            } else {
              // Last resort: get extract
              const summary = await getWikipediaPageSummary(result.title).catch(() => null);
              if (summary?.extract) {
                const fullExtract = summary.extract;
                const firstSentence = fullExtract.split(/[.!?]\s+/)[0];
                description = firstSentence.length > 0 && firstSentence.length <= 150 
                  ? firstSentence 
                  : fullExtract.substring(0, 120).trim() + (fullExtract.length > 120 ? '...' : '');
              }
            }
          } catch (error) {
            // If all fallbacks fail, use snippet (even if empty) or undefined
            description = result.snippet || undefined;
          }
        }
        
        // If no image, get more of the first paragraph for the extract
        if (!hasImage) {
          try {
            const summary = await getWikipediaPageSummary(result.title).catch(() => null);
            if (summary?.extract) {
              // Get first paragraph (up to 300 characters) for cards without images
              const fullExtract = summary.extract;
              const firstParagraph = fullExtract.split('\n\n')[0] || fullExtract;
              extract = firstParagraph.length > 300 
                ? firstParagraph.substring(0, 300).trim() + '...' 
                : firstParagraph;
            }
          } catch (error) {
            // If extract fetch fails, leave extract undefined
          }
        }
        
        notLinkedCandidates.push({
          title: result.title,
          description,
          thumbnail: hasImage && result.images ? result.images[0] : undefined,
          extract,
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
    
    // Ensure we have exactly 6 cards (3 linked, 3 not-linked)
    const targetLinkedCount = 3; // Always 3 linked
    const targetNotLinkedCount = 3; // Always 3 not-linked = 6 total
    
    // Sort candidates deterministically by title (alphabetically) before selecting
    // This ensures the same cards are selected for everyone on the same day
    linkedCandidates.sort((a, b) => a.title.localeCompare(b.title));
    notLinkedCandidates.sort((a, b) => a.title.localeCompare(b.title));
    
    // Take exactly the number we need
    const selectedLinked = linkedCandidates.slice(0, Math.min(targetLinkedCount, linkedCandidates.length));
    const selectedNotLinked = notLinkedCandidates.slice(0, Math.min(targetNotLinkedCount, notLinkedCandidates.length));
    
    // If we don't have enough cards, we can't generate a valid game
    if (selectedLinked.length < targetLinkedCount || selectedNotLinked.length < targetNotLinkedCount) {
      console.error(`Not enough cards: ${selectedLinked.length} linked, ${selectedNotLinked.length} not-linked (need ${targetLinkedCount} and ${targetNotLinkedCount})`);
      return null;
    }
    
    // Combine cards (exactly 6 total)
    const allCards = [...selectedLinked, ...selectedNotLinked];
    
    // Use deterministic shuffle based on date
    const seed = getSeedFromDate(dateKey);
    shuffleArray(allCards, seed);
    
    const game: DailyGame = {
      featuredArticle: {
        title: featuredTitle,
        leadParagraph: summary?.extract?.split('\n\n')[0] || '',
        thumbnail
      },
      cards: allCards,
      dateKey,
      featuredArticleContentHtml: contentHtml
    };
    
    // Cache the game so it doesn't regenerate throughout the day
    cacheDailyGame(dateKey, game);
    
    return game;
  } catch (error) {
    console.error('Error generating daily game:', error);
    return null;
  }
};


// Seeded random number generator for deterministic shuffling
function seededRandom(seed: number): () => number {
  let value = seed;
  return function() {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

// Create seed from date string (deterministic for same date)
function getSeedFromDate(dateKey: string): number {
  let hash = 0;
  for (let i = 0; i < dateKey.length; i++) {
    const char = dateKey.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

// Shuffle array deterministically using seeded random
function shuffleArray<T>(array: T[], seed: number): void {
  const random = seededRandom(seed);
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
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
  const allLinkedArticles: Array<{ card: GameCard; wasCorrect: boolean }> = [];
  const allNotLinkedArticles: Array<{ card: GameCard; wasCorrect: boolean }> = [];
  
  game.cards.forEach((card, index) => {
    const wasCorrect = state.answers[index] === card.isLinked;
    if (card.isLinked) {
      // All linked articles
      allLinkedArticles.push({ card, wasCorrect });
      if (wasCorrect) {
        linkedArticles.push(card);
      }
    } else {
      // All not-linked articles
      allNotLinkedArticles.push({ card, wasCorrect });
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
    notLinkedArticles,
    allLinkedArticles,
    allNotLinkedArticles
  };
};
