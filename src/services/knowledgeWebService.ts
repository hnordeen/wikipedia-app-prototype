import { getFeaturedArticleTitles, pickDailyFeaturedTitle, getWikipediaPageSummary, getArticleContent, getArticleImages, getFeaturedArticleFromMainPage, getArticleShortDescription } from '../api/wikipedia';

// Helper function to get link context snippet from featured article (similar to LinkQuest)
export function getLinkContextFromFeaturedArticle(
  featuredArticleContent: string,
  connectingArticleTitle: string
): { html: string; sectionHeading?: string } | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(featuredArticleContent, 'text/html');
  const links = doc.querySelectorAll('a[href^="/wiki/"]');
  
  for (const link of Array.from(links)) {
    const href = link.getAttribute('href');
    if (href) {
      const path = href.replace('/wiki/', '');
      // Filter out special pages
      if (path.match(/^(File:|Template:|Category:|Help:|Portal:|Wikipedia:|Special:)/i)) {
        continue;
      }
      const title = decodeURIComponent(path).replace(/_/g, ' ');
      
      if (title.toLowerCase() === connectingArticleTitle.toLowerCase()) {
        // Skip if link is in infobox or references
        const infobox = link.closest('.infobox, .infobox_v2, .infobox_v3, table.infobox');
        if (infobox) continue;
        
        const reference = link.closest('.reference, .mw-references-wrap, .reflist, .references, ol.references, ul.references, .cite_note, .citation');
        if (reference) continue;
        
        // Skip links from image captions
        const imageCaption = link.closest('.thumbcaption, .gallerytext, .image, figcaption, .floatright, .floatleft, .thumb, .thumbinner, .thumbimage');
        if (imageCaption) continue;
        
        // Skip links from first paragraph
        const firstParagraph = doc.querySelector('p');
        if (firstParagraph && firstParagraph.contains(link)) {
          continue;
        }
        
        // Find section heading
        let sectionHeading: string | undefined;
        let currentElement: Element | null = link.parentElement;
        while (currentElement && currentElement !== doc.body) {
          if (currentElement.tagName && ['H2', 'H3', 'H4', 'H5', 'H6'].includes(currentElement.tagName)) {
            sectionHeading = currentElement.textContent?.trim() || undefined;
            break;
          }
          currentElement = currentElement.parentElement;
        }
        
        // Get parent paragraph
        let parent = link.parentElement;
        while (parent && !['P', 'LI', 'TD'].includes(parent.tagName)) {
          parent = parent.parentElement;
        }
        
        if (parent) {
          try {
            const parentClone = parent.cloneNode(true) as HTMLElement;
            const fullText = parent.textContent || '';
            const linkText = link.textContent || '';
            const linkIndex = fullText.indexOf(linkText);
            
            if (linkIndex === -1) continue;
            
            // Extract snippet around the link (similar to LinkQuest logic)
            const maxCharsBefore = 200;
            const maxCharsAfter = 300;
            let startPos = Math.max(0, linkIndex - maxCharsBefore);
            let endPos = Math.min(fullText.length, linkIndex + linkText.length + maxCharsAfter);
            
            // Try to end at sentence boundary
            for (let i = endPos; i < Math.min(fullText.length, endPos + 50); i++) {
              const char = fullText[i];
              if ((char === '.' || char === '!' || char === '?') && 
                  (i === 0 || fullText[i - 1] !== '.')) {
                if (i === fullText.length - 1 || (i + 1 < fullText.length && /\s/.test(fullText[i + 1]))) {
                  endPos = i + 1;
                  break;
                }
              }
            }
            
            // Use Range API to extract snippet
            const range = doc.createRange();
            const walker = doc.createTreeWalker(parentClone, NodeFilter.SHOW_TEXT);
            
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
            
            const snippetContainer = doc.createElement('div');
            
            if (startNode && endNode) {
              range.setStart(startNode, Math.max(0, startOffset));
              range.setEnd(endNode, Math.min(endNode.textContent?.length || 0, endOffset));
              snippetContainer.appendChild(range.cloneContents());
            } else {
              snippetContainer.appendChild(parentClone.cloneNode(true));
            }
            
            // Mark the target link for highlighting
            const targetLinks = snippetContainer.querySelectorAll('a[href^="/wiki/"]');
            targetLinks.forEach((l) => {
              const lHref = l.getAttribute('href');
              if (lHref) {
                const lPath = lHref.replace('/wiki/', '');
                if (!lPath.match(/^(File:|Template:|Category:|Help:|Portal:|Wikipedia:|Special:)/i)) {
                  const lTitle = decodeURIComponent(lPath).replace(/_/g, ' ');
                  if (lTitle.toLowerCase() === connectingArticleTitle.toLowerCase()) {
                    l.setAttribute('data-highlight', 'true');
                  }
                }
              }
            });
            
            let html = snippetContainer.innerHTML.trim();
            if (startPos > 0) html = '... ' + html;
            if (endPos < fullText.length) html = html + ' ...';
            
            return { html, sectionHeading };
          } catch (error) {
            console.warn('Error extracting link context:', error);
            continue;
          }
        }
      }
    }
  }
  
  return null;
}

// Helper function to get context where node article is mentioned in connector article
export function getNodeMentionInConnector(
  connectorArticleContent: string,
  nodeArticleTitle: string
): { html: string; sectionHeading?: string } | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(connectorArticleContent, 'text/html');
  
  // Normalize the node article title for comparison
  const normalizedNodeTitle = nodeArticleTitle.toLowerCase().trim();
  console.log(`[getNodeMentionInConnector] Looking for node article: "${nodeArticleTitle}" (normalized: "${normalizedNodeTitle}")`);
  
  // Get all links in the document
  const links = doc.querySelectorAll('a[href^="/wiki/"]');
  console.log(`[getNodeMentionInConnector] Found ${links.length} total links in connector article`);
  
  // Find the first paragraph to exclude it
  const firstParagraph = doc.querySelector('p');
  
  // Debug: log first few link titles to see what we're working with
  const sampleLinks: string[] = [];
  for (let i = 0; i < Math.min(10, links.length); i++) {
    const href = links[i].getAttribute('href');
    if (href) {
      const path = href.replace('/wiki/', '');
      if (!path.match(/^(File:|Template:|Category:|Help:|Portal:|Wikipedia:|Special:)/i)) {
        try {
          let title = decodeURIComponent(path).replace(/_/g, ' ');
          sampleLinks.push(title);
        } catch (e) {
          sampleLinks.push(path);
        }
      }
    }
  }
  console.log(`[getNodeMentionInConnector] Sample link titles:`, sampleLinks);
  
  for (const link of Array.from(links)) {
    const href = link.getAttribute('href');
    if (!href) continue;
    
    const path = href.replace('/wiki/', '');
    // Skip special pages
    if (path.match(/^(File:|Template:|Category:|Help:|Portal:|Wikipedia:|Special:)/i)) {
      continue;
    }
    
    // Decode and normalize the title from the href
    let title = path;
    try {
      title = decodeURIComponent(path);
    } catch (e) {
      // Use the path as-is if decoding fails
      title = path;
    }
    title = title.replace(/_/g, ' ');
    const normalizedLinkTitle = title.toLowerCase().trim();
    
    // Check if this link matches the node article title (case-insensitive)
    // Also check if the link text matches (sometimes the href and display text differ)
    const linkText = (link.textContent || '').toLowerCase().trim();
    
    // More flexible matching: exact match, or one contains the other, or they're very similar
    // Also handle plural forms (e.g., "Mongol" vs "Mongols")
    const linkMatches = 
      normalizedLinkTitle === normalizedNodeTitle || 
      linkText === normalizedNodeTitle ||
      normalizedLinkTitle === normalizedNodeTitle + 's' ||
      normalizedLinkTitle + 's' === normalizedNodeTitle ||
      normalizedLinkTitle === normalizedNodeTitle.slice(0, -1) || // Handle plural removal
      normalizedNodeTitle === normalizedLinkTitle.slice(0, -1) ||
      (normalizedLinkTitle.length > 3 && normalizedNodeTitle.length > 3 && 
       (normalizedLinkTitle.includes(normalizedNodeTitle) || normalizedNodeTitle.includes(normalizedLinkTitle)));
    
    if (!linkMatches) {
      continue;
    }
    
    console.log(`[getNodeMentionInConnector] Found matching link: href="${href}", title="${title}", linkText="${link.textContent}"`);
    
    // Skip if in first paragraph
    if (firstParagraph && firstParagraph.contains(link)) {
      continue;
    }
    
    // Skip if in infobox/references/navigation boxes
    const infobox = link.closest('.infobox, .infobox_v2, .infobox_v3, table.infobox, .navbox, .vertical-navbox');
    if (infobox) continue;
    
    const reference = link.closest('.reference, .mw-references-wrap, .reflist, .references, ol.references, ul.references, .cite_note, .citation, .mw-cite-backlink');
    if (reference) continue;
    
    const imageCaption = link.closest('.thumbcaption, .gallerytext, .image, figcaption, .floatright, .floatleft, .thumb, .thumbinner, .thumbimage, .gallery');
    if (imageCaption) continue;
    
    // Skip navigation and metadata sections
    const navSection = link.closest('#toc, .toc, .navbox, .vertical-navbox, .horizontal-navbox, .metadata, .hatnote');
    if (navSection) continue;
    
    // Find section heading by looking up the DOM tree
    let sectionHeading: string | undefined;
    let currentElement: Element | null = link.parentElement;
    while (currentElement && currentElement !== doc.body) {
      if (currentElement.tagName && ['H2', 'H3', 'H4', 'H5', 'H6'].includes(currentElement.tagName)) {
        sectionHeading = currentElement.textContent?.trim() || undefined;
        break;
      }
      currentElement = currentElement.parentElement;
    }
    
    // Get parent element that contains the link (paragraph, list item, table cell, etc.)
    let parent: Element | null = link.parentElement;
    while (parent && parent !== doc.body) {
      const tagName = parent.tagName;
      // Look for body text containers
      if (['P', 'LI', 'TD', 'DD', 'DT'].includes(tagName)) {
        break;
      }
      // Also check for divs that might contain body text (but not special sections)
      if (tagName === 'DIV') {
        const classList = parent.classList;
        // Skip if it's a special div
        if (!classList.contains('infobox') && 
            !classList.contains('reference') && 
            !classList.contains('thumb') &&
            !classList.contains('navbox')) {
          // Check if this div contains substantial text content
          const textContent = parent.textContent || '';
          if (textContent.length > 50) {
            break;
          }
        }
      }
      parent = parent.parentElement;
    }
    
    if (!parent || parent === doc.body) {
      continue;
    }
    
    try {
      const parentClone = parent.cloneNode(true) as HTMLElement;
      const fullText = parent.textContent || '';
      const linkText = link.textContent || '';
      
      // Find the link text in the full text (handle cases where link text might differ)
      let linkIndex = fullText.indexOf(linkText);
      if (linkIndex === -1) {
        // Try to find by looking for the link's position in the cloned element
        const clonedLink = parentClone.querySelector(`a[href="${href}"]`);
        if (clonedLink) {
          const beforeLink = parentClone.cloneNode(true) as HTMLElement;
          const linkInClone = beforeLink.querySelector(`a[href="${href}"]`);
          if (linkInClone) {
            linkInClone.remove();
            linkIndex = beforeLink.textContent?.length || 0;
          }
        }
      }
      
      if (linkIndex === -1) {
        // If we still can't find it, use the full parent content
        linkIndex = 0;
      }
      
      const maxCharsBefore = 200;
      const maxCharsAfter = 300;
      let startPos = Math.max(0, linkIndex - maxCharsBefore);
      let endPos = Math.min(fullText.length, linkIndex + linkText.length + maxCharsAfter);
      
      // Try to end at sentence boundary
      for (let i = endPos; i < Math.min(fullText.length, endPos + 50); i++) {
        const char = fullText[i];
        if ((char === '.' || char === '!' || char === '?') && 
            (i === 0 || fullText[i - 1] !== '.')) {
          if (i === fullText.length - 1 || (i + 1 < fullText.length && /\s/.test(fullText[i + 1]))) {
            endPos = i + 1;
            break;
          }
        }
      }
      
      const range = doc.createRange();
      const walker = doc.createTreeWalker(parentClone, NodeFilter.SHOW_TEXT);
      
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
            startOffset = Math.max(0, startPos - currentTextPos);
          }
          
          if (currentTextPos + textLength >= endPos) {
            endNode = textNode;
            endOffset = Math.min(textLength, endPos - currentTextPos);
            break;
          }
          
          currentTextPos += textLength;
        }
      }
      
      const snippetContainer = doc.createElement('div');
      
      if (startNode && endNode) {
        try {
          range.setStart(startNode, startOffset);
          range.setEnd(endNode, endOffset);
          snippetContainer.appendChild(range.cloneContents());
        } catch (e) {
          // Fallback: use the full parent clone
          snippetContainer.appendChild(parentClone.cloneNode(true));
        }
      } else {
        snippetContainer.appendChild(parentClone.cloneNode(true));
      }
      
      // Mark the node article link for highlighting
      const targetLinks = snippetContainer.querySelectorAll('a[href^="/wiki/"]');
      targetLinks.forEach((l) => {
        const lHref = l.getAttribute('href');
        if (lHref) {
          const lPath = lHref.replace('/wiki/', '');
          if (!lPath.match(/^(File:|Template:|Category:|Help:|Portal:|Wikipedia:|Special:)/i)) {
            let lTitle = lPath;
            try {
              lTitle = decodeURIComponent(lPath);
            } catch (e) {
              // Use as-is
            }
            lTitle = lTitle.replace(/_/g, ' ');
            if (lTitle.toLowerCase().trim() === normalizedNodeTitle) {
              l.setAttribute('data-highlight', 'true');
            }
          }
        }
      });
      
      let html = snippetContainer.innerHTML.trim();
      if (startPos > 0) html = '... ' + html;
      if (endPos < fullText.length) html = html + ' ...';
      
      return { html, sectionHeading };
    } catch (error) {
      console.warn('Error extracting node mention context:', error);
      continue;
    }
  }
  
  return null;
}

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

// Clean up old game states from localStorage (keep only today's state)
export function cleanupOldKnowledgeWebGameStates(currentDateKey: string): void {
  try {
    const keysToRemove: string[] = [];
    
    // Iterate through all localStorage keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('knowledgeWeb_gameState_')) {
        const storedDateKey = key.replace('knowledgeWeb_gameState_', '');
        // Remove if it's not today's date key
        if (storedDateKey !== currentDateKey) {
          keysToRemove.push(key);
        }
      }
    }
    
    // Remove old keys
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
      console.log(`Cleaned up old Knowledge Web game state: ${key}`);
    });
    
    if (keysToRemove.length > 0) {
      console.log(`Cleaned up ${keysToRemove.length} old Knowledge Web game state(s)`);
    }
  } catch (error) {
    console.error('Error cleaning up old Knowledge Web game states:', error);
  }
}

// Get game state from localStorage
export function getKnowledgeWebGameState(dateKey: string): KnowledgeWebGameState | null {
  try {
    const stored = localStorage.getItem(`knowledgeWeb_gameState_${dateKey}`);
    if (!stored) return null;
    const state = JSON.parse(stored) as KnowledgeWebGameState;
    // Double-check that the puzzle_id matches the dateKey (safety check)
    if (state.puzzle_id !== dateKey) {
      console.warn(`Game state puzzle_id (${state.puzzle_id}) doesn't match dateKey (${dateKey}), ignoring old state`);
      // Remove the mismatched state
      localStorage.removeItem(`knowledgeWeb_gameState_${dateKey}`);
      return null;
    }
    return state;
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

// Helper function to extract links from HTML content (excluding first paragraph and filtering out unwanted elements)
function extractLinksFromContent(htmlContent: string, excludeFirstParagraph: boolean = true): string[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');
  const links: string[] = [];
  const seen = new Set<string>();
  
  // Find the first section heading (h2) to mark the end of the introduction
  const firstSectionHeading = doc.querySelector('h2');
  let introEndElement: Element | null = firstSectionHeading;
  
  // Get all links
  const allLinks = doc.querySelectorAll('a[href^="/wiki/"]');
  
  for (const link of Array.from(allLinks)) {
    // Skip links from infoboxes
    const infobox = link.closest('.infobox, .infobox_v2, .infobox_v3, table.infobox');
    if (infobox) continue;
    
    // Skip links from references/citations
    const reference = link.closest('.reference, .mw-references-wrap, .reflist, .references, ol.references, ul.references, .cite_note, .citation');
    if (reference) continue;
    
    // Skip links from navboxes
    const navbox = link.closest('.navbox, .vertical-navbox, .horizontal-navbox');
    if (navbox) continue;
    
    // Skip links from image captions
    const imageCaption = link.closest('.thumbcaption, .gallerytext, .image, figcaption, .floatright, .floatleft, .thumb, .thumbinner, .thumbimage');
    if (imageCaption) continue;
    
    // Skip links that appear before or at the introduction end if excluding first paragraph
    if (excludeFirstParagraph && introEndElement) {
      const position = link.compareDocumentPosition(introEndElement);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
        // Link is before intro end, skip it
        continue;
      }
    }
    
    const href = link.getAttribute('href');
    if (href) {
      const path = href.replace('/wiki/', '');
      // Filter out special pages
      if (!path.match(/^(File:|Template:|Category:|Help:|Portal:|Wikipedia:|Special:)/i)) {
        const title = decodeURIComponent(path).replace(/_/g, ' ');
        // Skip if already seen
        if (!seen.has(title.toLowerCase())) {
          links.push(title);
          seen.add(title.toLowerCase());
        }
      }
    }
  }
  
  return links;
}

// Generate a daily puzzle
export async function generateDailyKnowledgeWebPuzzle(): Promise<KnowledgeWebPuzzle | null> {
  try {
    const dateKey = getUtcDateKey();
    const today = new Date();
    
    // Get today's featured article from Wikipedia's main page using Wikifeeds
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
  
  console.log('Using featured article for Knowledge Web:', featuredTitle);
  
  // Fetch featured article summary for description
  let featuredDescription = '';
  try {
    const summary = await getWikipediaPageSummary(featuredTitle);
    // Prefer official short description, then first paragraph of extract, then try dedicated short description API
    if (summary?.description) {
      featuredDescription = summary.description;
    } else if (summary?.extract) {
      // Fallback to first paragraph of extract
      featuredDescription = summary.extract.split('\n\n')[0] || '';
    } else {
      // Try dedicated short description API as last resort
      const shortDesc = await getArticleShortDescription(featuredTitle);
      if (shortDesc) {
        featuredDescription = shortDesc;
      }
    }
  } catch (error) {
    console.warn('Error fetching featured article summary:', error);
    // Try dedicated short description API as fallback
    try {
      const shortDesc = await getArticleShortDescription(featuredTitle);
      if (shortDesc) {
        featuredDescription = shortDesc;
      }
    } catch (fallbackError) {
      console.warn('Error fetching short description as fallback:', fallbackError);
    }
  }
  
  // Fetch featured article content
  let featuredArticleContent: string | null = null;
  try {
    const contentPromise = getArticleContent(featuredTitle);
    const timeoutPromise = new Promise<string>((_, reject) => 
      setTimeout(() => reject(new Error('Timeout')), 10000)
    );
    featuredArticleContent = await Promise.race([contentPromise, timeoutPromise]);
  } catch (error) {
    console.error('Error or timeout fetching featured article content:', error);
    return null;
  }
  
  if (!featuredArticleContent) {
    console.error('Failed to fetch featured article content');
    return null;
  }
  
  // Extract links from featured article (excluding first paragraph)
  const allLinks = extractLinksFromContent(featuredArticleContent, true);
  console.log(`Found ${allLinks.length} links in featured article (excluding first paragraph)`);
  
  // Extract links from first paragraph only
  const parser = new DOMParser();
  const doc = parser.parseFromString(featuredArticleContent, 'text/html');
  const firstParagraph = doc.querySelector('p');
  const firstParagraphLinkSet = new Set<string>();
  
  if (firstParagraph) {
    const firstParaLinks = firstParagraph.querySelectorAll('a[href^="/wiki/"]');
    for (const link of Array.from(firstParaLinks)) {
      const href = link.getAttribute('href');
      if (href) {
        const path = href.replace('/wiki/', '');
        if (!path.match(/^(File:|Template:|Category:|Help:|Portal:|Wikipedia:|Special:)/i)) {
          const title = decodeURIComponent(path).replace(/_/g, ' ');
          firstParagraphLinkSet.add(title.toLowerCase());
        }
      }
    }
  }
  
  console.log(`Found ${firstParagraphLinkSet.size} links in first paragraph`);
  
  // Candidate surrounding articles: links that are NOT in the first paragraph
  // (allLinks already excludes first paragraph, but double-check)
  const surroundingCandidates = allLinks.filter(link => 
    !firstParagraphLinkSet.has(link.toLowerCase())
  );
  
  console.log(`Found ${surroundingCandidates.length} candidate surrounding articles`);
  
  if (surroundingCandidates.length < 4) {
    console.error('Not enough candidate surrounding articles');
    return null;
  }
  
  // Select 4 surrounding articles (try to get diverse ones)
  const positions: Array<'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'> = 
    ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
  const selectedSurrounding: SurroundingArticle[] = [];
  const usedTitles = new Set<string>();
  
  for (let i = 0; i < 4 && i < surroundingCandidates.length; i++) {
    const candidate = surroundingCandidates[i];
    if (!usedTitles.has(candidate.toLowerCase())) {
      selectedSurrounding.push({
        id: i + 1,
        title: candidate,
        url: `https://en.wikipedia.org/wiki/${candidate.replace(/ /g, '_')}`,
        position: positions[i],
      });
      usedTitles.add(candidate.toLowerCase());
    }
  }
  
  if (selectedSurrounding.length < 4) {
    console.error('Could not select 4 surrounding articles');
    return null;
  }
  
  console.log('Selected surrounding articles:', selectedSurrounding.map(a => a.title));
  
  // Now find connecting articles for each surrounding article
  // A connecting article must:
  // 1. Be linked in the featured article (not in first paragraph)
  // 2. Link to the surrounding article (not in first paragraph)
  // 3. Not mention the featured article in its first paragraph
  // 4. Not be the same as any surrounding article
  
  const connections: Connection[] = [];
  const usedConnectingTitles = new Set<string>();
  
  // Get all potential connecting articles from featured article links
  const connectingCandidates = allLinks.filter(link => 
    !firstParagraphLinkSet.has(link.toLowerCase()) &&
    !usedTitles.has(link.toLowerCase()) // Not a surrounding article
  );
  
  console.log(`Found ${connectingCandidates.length} candidate connecting articles`);
  
  if (connectingCandidates.length < 4) {
    console.error(`Not enough candidate connecting articles (found ${connectingCandidates.length}, need at least 4)`);
    return null;
  }
  
  for (const surroundingArticle of selectedSurrounding) {
    let foundConnection: Connection | null = null;
    let attempts = 0;
    const maxAttempts = Math.min(connectingCandidates.length, 30); // Try up to 30 candidates
    
    // Try each candidate connecting article
    for (const candidateTitle of connectingCandidates) {
      attempts++;
      if (attempts > maxAttempts) {
        console.warn(`Reached max attempts (${maxAttempts}) for ${surroundingArticle.title}`);
        break;
      }
      if (usedConnectingTitles.has(candidateTitle.toLowerCase())) {
        continue; // Already used as a connection
      }
      
      if (candidateTitle.toLowerCase() === surroundingArticle.title.toLowerCase()) {
        continue; // Can't connect to itself
      }
      
      try {
        // Fetch the candidate article's content
        const candidateContentPromise = getArticleContent(candidateTitle);
        const timeoutPromise = new Promise<string>((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 8000) // Increased timeout
        );
        const candidateContent = await Promise.race([candidateContentPromise, timeoutPromise]);
        
        // Check if featured article is mentioned in candidate's first paragraph (should NOT be)
        if (isTitleLinkedInFirstParagraph(candidateContent, featuredTitle)) {
          continue;
        }
        
        // Check if surrounding article is linked in candidate article (excluding first paragraph) - REQUIRED
        // But also check if it's mentioned anywhere in the article as a fallback
        const isLinkedInArticle = isTitleLinkedInArticle(candidateContent, surroundingArticle.title, true);
        // Also check if mentioned in first paragraph (weaker connection but acceptable)
        const isMentionedInFirstParagraph = isTitleLinkedInFirstParagraph(candidateContent, surroundingArticle.title);
        
        if (!isLinkedInArticle && !isMentionedInFirstParagraph) {
          continue;
        }
        
        // Found a valid connection!
        foundConnection = {
          surroundingArticleId: surroundingArticle.id,
          connectingArticle: candidateTitle,
          url: `https://en.wikipedia.org/wiki/${candidateTitle.replace(/ /g, '_')}`,
          explanation: `${candidateTitle} connects ${featuredTitle} to ${surroundingArticle.title}.`,
        };
        
        usedConnectingTitles.add(candidateTitle.toLowerCase());
        break; // Found one, move to next surrounding article
      } catch (error) {
        // Try next candidate
        continue;
      }
    }
    
    if (foundConnection) {
      connections.push(foundConnection);
      console.log(`Found connection for ${surroundingArticle.title}: ${foundConnection.connectingArticle}`);
    } else {
      console.warn(`Could not find connection for ${surroundingArticle.title}`);
    }
  }
  
  // If we don't have 4 connections, try to find replacements
  if (connections.length < 4) {
    console.log(`Only found ${connections.length} connections, trying to find replacements...`);
    
    // For each missing connection, try to find a replacement
    for (let i = connections.length; i < 4; i++) {
      const surroundingArticle = selectedSurrounding[i];
      let attempts = 0;
      const maxAttempts = Math.min(connectingCandidates.length, 30);
      
      // Try more candidates
      for (const candidateTitle of connectingCandidates) {
        attempts++;
        if (attempts > maxAttempts) {
          console.warn(`Reached max attempts (${maxAttempts}) for replacement connection for ${surroundingArticle.title}`);
          break;
        }
        if (usedConnectingTitles.has(candidateTitle.toLowerCase())) {
          continue;
        }
        
        if (candidateTitle.toLowerCase() === surroundingArticle.title.toLowerCase()) {
          continue;
        }
        
        try {
          const candidateContentPromise = getArticleContent(candidateTitle);
          const timeoutPromise = new Promise<string>((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 8000) // Increased timeout
          );
          const candidateContent = await Promise.race([candidateContentPromise, timeoutPromise]);
          
          if (isTitleLinkedInFirstParagraph(candidateContent, featuredTitle)) {
            continue;
          }
          
          // More lenient: check if linked anywhere or mentioned in first paragraph
          const isLinkedInArticle = isTitleLinkedInArticle(candidateContent, surroundingArticle.title, true);
          const isMentionedInFirstParagraph = isTitleLinkedInFirstParagraph(candidateContent, surroundingArticle.title);
          
          if (!isLinkedInArticle && !isMentionedInFirstParagraph) {
            continue;
          }
          
          const newConnection: Connection = {
            surroundingArticleId: surroundingArticle.id,
            connectingArticle: candidateTitle,
            url: `https://en.wikipedia.org/wiki/${candidateTitle.replace(/ /g, '_')}`,
            explanation: `${candidateTitle} connects ${featuredTitle} to ${surroundingArticle.title}.`,
          };
          
          connections.push(newConnection);
          usedConnectingTitles.add(candidateTitle.toLowerCase());
          console.log(`Found replacement connection for ${surroundingArticle.title}: ${candidateTitle}`);
          break;
        } catch (error) {
          continue;
        }
      }
    }
  }
  
  if (connections.length < 4) {
    console.error(`Could not find 4 valid connections (found ${connections.length})`);
    console.error('This may happen if the featured article has limited links or connections are too strict.');
    console.error('Attempting to use less strict validation...');
    
    // Try a fallback: use connections that are linked in featured article, even if they don't link to surrounding articles
    // This is less ideal but ensures the game can load
    if (connections.length < 4 && featuredArticleContent) {
      const fallbackConnections: Connection[] = [];
      const usedConnectingTitlesFallback = new Set(connections.map(c => c.connectingArticle.toLowerCase()));
      const missingSurroundingIds = selectedSurrounding
        .filter(sa => !connections.find(c => c.surroundingArticleId === sa.id))
        .map(sa => sa.id);
      
      // For each missing surrounding article, try to find any valid connection
      for (const surroundingArticle of selectedSurrounding) {
        if (connections.find(c => c.surroundingArticleId === surroundingArticle.id)) {
          continue; // Already have a connection for this
        }
        
        // Try to find any connection that's linked in featured article
        for (const candidateTitle of connectingCandidates) {
          if (usedConnectingTitlesFallback.has(candidateTitle.toLowerCase())) {
            continue;
          }
          
          if (candidateTitle.toLowerCase() === surroundingArticle.title.toLowerCase()) {
            continue;
          }
          
          // Less strict: just check if it's linked in featured article (not in first paragraph)
          if (isTitleLinkedInFirstParagraph(featuredArticleContent, candidateTitle)) {
            continue;
          }
          
          if (!isTitleLinkedInArticle(featuredArticleContent, candidateTitle, true)) {
            continue;
          }
          
          // Found a fallback connection (just needs to be linked in featured article)
          const fallbackConnection: Connection = {
            surroundingArticleId: surroundingArticle.id,
            connectingArticle: candidateTitle,
            url: `https://en.wikipedia.org/wiki/${candidateTitle.replace(/ /g, '_')}`,
            explanation: `${candidateTitle} connects ${featuredTitle} to ${surroundingArticle.title}.`,
          };
          
          fallbackConnections.push(fallbackConnection);
          usedConnectingTitlesFallback.add(candidateTitle.toLowerCase());
          break; // Found one for this surrounding article
        }
      }
      
      if (connections.length + fallbackConnections.length >= 4) {
        connections.push(...fallbackConnections.slice(0, 4 - connections.length));
        console.log(`Using ${fallbackConnections.length} fallback connections to reach 4 total`);
      }
    }
    
    // If we still don't have 4 connections, we can't create a valid puzzle
    if (connections.length < 4) {
      console.error('Puzzle generation failed: Not enough valid connections found even with fallback.');
      return null;
    }
  }
  
  // Create the puzzle
  const puzzle: KnowledgeWebPuzzle = {
    puzzle_id: dateKey,
    featured_article: {
      title: featuredTitle,
      url: `https://en.wikipedia.org/wiki/${featuredTitle.replace(/ /g, '_')}`,
      description: featuredDescription || `Article about ${featuredTitle}`,
    },
    surrounding_articles: selectedSurrounding,
    connections: connections.slice(0, 4), // Ensure exactly 4
    answer_pool: connections.slice(0, 4).map(c => c.connectingArticle),
  };
  
  // Ensure we have exactly 4 connections
  if (puzzle.connections.length !== 4) {
    console.error(`Puzzle has ${puzzle.connections.length} connections, expected 4.`);
    return null;
  }

  // Fetch images for all articles
  try {
    // Featured article image
    const featuredImages = await getArticleImages(puzzle.featured_article.title, true);
    if (featuredImages.length > 0) {
      puzzle.featured_article.thumbnail = featuredImages[0].url;
    }

    // Surrounding articles images
    const surroundingImagePromises = puzzle.surrounding_articles.map(async (article) => {
      const images = await getArticleImages(article.title, true);
      return { article, thumbnail: images.length > 0 ? images[0].url : undefined };
    });
    const surroundingImages = await Promise.all(surroundingImagePromises);
    surroundingImages.forEach(({ article, thumbnail }) => {
      const foundArticle = puzzle.surrounding_articles.find(a => a.id === article.id);
      if (foundArticle) {
        foundArticle.thumbnail = thumbnail;
      }
    });

    // Connecting articles images
    const connectionImagePromises = puzzle.connections.map(async (connection) => {
      const images = await getArticleImages(connection.connectingArticle, true);
      return { connection, thumbnail: images.length > 0 ? images[0].url : undefined };
    });
    const connectionImages = await Promise.all(connectionImagePromises);
    connectionImages.forEach(({ connection, thumbnail }) => {
      const foundConnection = puzzle.connections.find(c => c.surroundingArticleId === connection.surroundingArticleId);
      if (foundConnection) {
        foundConnection.thumbnail = thumbnail;
      }
    });
  } catch (error) {
    console.error('Error fetching images for knowledge web puzzle:', error);
    // Continue without images if fetch fails
  }

  // Shuffle answer pool
  const shuffled = [...puzzle.answer_pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  puzzle.answer_pool = shuffled;

  return puzzle;
  } catch (error) {
    console.error('Error generating Knowledge Web puzzle:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message, error.stack);
    }
    return null;
  }
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
