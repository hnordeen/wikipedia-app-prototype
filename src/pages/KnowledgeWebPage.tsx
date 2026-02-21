import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  generateDailyKnowledgeWebPuzzle,
  getKnowledgeWebGameState,
  saveKnowledgeWebGameState,
  validateSubmission,
  calculateKnowledgeWebScore,
  getUtcDateKey,
  cleanupOldKnowledgeWebGameStates,
  KnowledgeWebPuzzle,
  KnowledgeWebGameState,
} from '../services/knowledgeWebService';
import { getArticleExtract, getArticleShortDescription } from '../api/wikipedia';
import './KnowledgeWebPage.css';

const KnowledgeWebPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [puzzle, setPuzzle] = useState<KnowledgeWebPuzzle | null>(null);
  const [gameState, setGameState] = useState<KnowledgeWebGameState | null>(null);
  const [draggedArticle, setDraggedArticle] = useState<string | null>(null);
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);
  const [touchDragging, setTouchDragging] = useState(false);
  const [draggedFromSlot, setDraggedFromSlot] = useState<number | null>(null); // Track which slot we're dragging from
  const touchStartRef = useRef<{ x: number; y: number; article: string; fromSlot?: number } | null>(null);
  const draggedElementRef = useRef<HTMLElement | null>(null);
  const isDraggingRef = useRef<boolean>(false); // Track dragging state immediately (not async)
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null); // Position of dragged item during touch drag
  const [showSplash, setShowSplash] = useState(true);
  const [previewArticle, setPreviewArticle] = useState<string | null>(null);
  const [previewExtract, setPreviewExtract] = useState<string | null>(null);
  const [previewDescription, setPreviewDescription] = useState<string | null>(null);
  const [previewPosition, setPreviewPosition] = useState<{ x: number; y: number } | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const previewLoadingRef = useRef<boolean>(false);
  const extractCacheRef = useRef<Map<string, string | null>>(new Map());
  const descriptionCacheRef = useRef<Map<string, string | null>>(new Map());

  const dateKey = getUtcDateKey();

  // Preload extracts for all articles in the puzzle
  const preloadAllExtracts = useCallback(async (puzzle: KnowledgeWebPuzzle) => {
    const articlesToLoad: string[] = [
      puzzle.featured_article.title,
      ...puzzle.surrounding_articles.map(a => a.title),
      ...puzzle.connections.map(c => c.connectingArticle),
    ];

    console.log(`[Preload] Preloading extracts for ${articlesToLoad.length} articles:`, articlesToLoad);

    // Load all extracts and descriptions in parallel
    const extractPromises = articlesToLoad.map(async (article) => {
      // Check what's already cached
      const hasExtract = extractCacheRef.current.has(article);
      const hasDescription = descriptionCacheRef.current.has(article);
      
      // Skip if both are already cached
      if (hasExtract && hasDescription) {
        console.log(`[Preload] Already cached: "${article}"`);
        return;
      }
      
      try {
        // Load only what's missing in parallel
        const promises: Promise<any>[] = [];
        if (!hasExtract) {
          promises.push(getArticleExtract(article).then(extract => ({ type: 'extract', value: extract })));
        }
        if (!hasDescription) {
          promises.push(getArticleShortDescription(article).then(description => ({ type: 'description', value: description })));
        }
        
        if (promises.length === 0) {
          return; // Both already cached
        }
        
        const results = await Promise.all(promises);
        
        results.forEach((result) => {
          if (result.type === 'extract') {
            const extract = result.value;
            if (extract) {
              console.log(`[Preload] Successfully loaded extract for "${article}" (${extract.length} chars)`);
              extractCacheRef.current.set(article, extract);
            } else {
              console.warn(`[Preload] No extract returned for "${article}"`);
              extractCacheRef.current.set(article, null);
            }
          } else if (result.type === 'description') {
            const description = result.value;
            if (description) {
              console.log(`[Preload] Successfully loaded description for "${article}"`);
              descriptionCacheRef.current.set(article, description);
            } else {
              console.warn(`[Preload] No description returned for "${article}"`);
              descriptionCacheRef.current.set(article, null);
            }
          }
        });
      } catch (error) {
        console.error(`[Preload] Error preloading extract/description for "${article}":`, error);
        if (!hasExtract) {
          extractCacheRef.current.set(article, null);
        }
        if (!hasDescription) {
          descriptionCacheRef.current.set(article, null);
        }
      }
    });

    // Don't await - let it load in background
    Promise.all(extractPromises).then(() => {
      console.log(`[Preload] Finished preloading all extracts`);
    }).catch(err => {
      console.error('[Preload] Error preloading extracts:', err);
    });
  }, []);

  useEffect(() => {
    const loadGame = async () => {
      setLoading(true);
      setError(null);

      try {
        // Clean up old game states from previous days
        cleanupOldKnowledgeWebGameStates(dateKey);
        
        // Check for existing game state for today
        const existingState = getKnowledgeWebGameState(dateKey);
        
        // Generate or load puzzle
        const dailyPuzzle = await generateDailyKnowledgeWebPuzzle();
        if (!dailyPuzzle) {
          setError("Couldn't load today's puzzle. The featured article may not have enough connections. Please try again later.");
          setLoading(false);
          return;
        }

        setPuzzle(dailyPuzzle);

        // Initialize or restore game state
        if (existingState && existingState.puzzle_id === dateKey) {
          setGameState(existingState);
          // Skip splash if game is in progress
          if (existingState.current_connections.some(conn => conn.connecting_article !== null) || existingState.submissions.length > 0) {
            setShowSplash(false);
          }
        } else {
          const initialState: KnowledgeWebGameState = {
            puzzle_id: dateKey,
            submissions: [],
            current_connections: dailyPuzzle.surrounding_articles.map(article => ({
              surrounding_article_id: article.id,
              connecting_article: null,
            })),
            is_complete: false,
            final_score: null,
            perfect_first_attempt: false,
            attempts_remaining: 999, // Unlimited tries
          };
          setGameState(initialState);
          saveKnowledgeWebGameState(dateKey, initialState);
        }

        // Preload extracts for all articles in the puzzle
        preloadAllExtracts(dailyPuzzle);

        setLoading(false);
      } catch (err) {
        console.error('Error loading knowledge web game:', err);
        const errorMessage = err instanceof Error ? err.message : "Couldn't load today's puzzle. Please try again.";
        setError(errorMessage);
        setLoading(false);
      }
    };

    loadGame();
  }, [dateKey, preloadAllExtracts]);

  const handleDragStart = (article: string) => {
    // Cancel any pending long press timers
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    setDraggedArticle(article);
    // Hide preview when dragging starts
    handlePreviewEnd();
  };

  const handleDragEnd = () => {
    setDraggedArticle(null);
    setHoveredSlot(null);
  };

  const loadPreviewExtract = useCallback((article: string) => {
    // Normalize the article title - use exact title from puzzle data
    // This ensures we use the actual article title, not any link text variations
    let exactTitle = article;
    if (puzzle) {
      // Check if it's the featured article
      if (article === puzzle.featured_article.title || 
          article.toLowerCase() === puzzle.featured_article.title.toLowerCase()) {
        exactTitle = puzzle.featured_article.title;
      } else {
        // Check if it's a surrounding article
        const surroundingArticle = puzzle.surrounding_articles.find(
          a => a.title === article || a.title.toLowerCase() === article.toLowerCase()
        );
        if (surroundingArticle) {
          exactTitle = surroundingArticle.title;
        } else {
          // Check if it's a connection article
          const connectionInfo = puzzle.connections.find(
            c => c.connectingArticle === article || c.connectingArticle.toLowerCase() === article.toLowerCase()
          );
          if (connectionInfo) {
            exactTitle = connectionInfo.connectingArticle;
          } else {
            // If we can't find it, log a warning but still use the original title
            console.warn(`[Preview] Could not find exact title for "${article}" in puzzle data, using as-is`);
          }
        }
      }
    }
    
    console.log(`[Preview] Loading extract for article: "${article}" -> normalized to: "${exactTitle}"`);
    
    // If we couldn't normalize, use the original title
    const titleToUse = exactTitle || article;
    if (!titleToUse || titleToUse.trim() === '') {
      console.error(`[Preview] Invalid article title: "${article}"`);
      return;
    }
    
    // Check cache first using the title we'll use
    const cachedExtract = extractCacheRef.current.get(titleToUse);
    const cachedDescription = descriptionCacheRef.current.get(titleToUse);
    
    // Use cached values immediately if available
    if (cachedExtract !== undefined) {
      setPreviewExtract(cachedExtract);
    }
    if (cachedDescription !== undefined) {
      setPreviewDescription(cachedDescription);
    }
    
    // If both are cached, we're done
    if (cachedExtract !== undefined && cachedDescription !== undefined) {
      console.log(`[Preview] Found cached extract and description for "${titleToUse}"`);
      return;
    }

    // If not in cache, load what's missing (shouldn't happen if preload worked, but fallback)
    if (previewLoadingRef.current) {
      console.log(`[Preview] Already loading extract, skipping`);
      return;
    }
    previewLoadingRef.current = true;
    console.log(`[Preview] Fetching missing data from API for "${titleToUse}"`);
    
    // Load only what's missing in parallel
    const promises: Promise<any>[] = [];
    if (cachedExtract === undefined) {
      promises.push(getArticleExtract(titleToUse).then(extract => ({ type: 'extract', value: extract })));
    }
    if (cachedDescription === undefined) {
      promises.push(getArticleShortDescription(titleToUse).then(description => ({ type: 'description', value: description })));
    }
    
    Promise.all(promises)
      .then((results) => {
        results.forEach((result) => {
          if (result.type === 'extract') {
            const extract = result.value;
            if (extract) {
              console.log(`[Preview] Successfully loaded extract for "${titleToUse}" (${extract.length} chars)`);
              extractCacheRef.current.set(titleToUse, extract);
              setPreviewExtract(extract);
            } else {
              console.warn(`[Preview] No extract returned for "${titleToUse}" - API returned null`);
              extractCacheRef.current.set(titleToUse, null);
              setPreviewExtract(null);
            }
          } else if (result.type === 'description') {
            const description = result.value;
            if (description) {
              console.log(`[Preview] Successfully loaded description for "${titleToUse}"`);
              descriptionCacheRef.current.set(titleToUse, description);
              setPreviewDescription(description);
            } else {
              console.warn(`[Preview] No description returned for "${titleToUse}" - API returned null`);
              descriptionCacheRef.current.set(titleToUse, null);
              setPreviewDescription(null);
            }
          }
        });
      })
      .catch((error) => {
        console.error(`[Preview] Error loading extract/description for "${titleToUse}":`, error);
        console.error(`[Preview] Error details:`, error instanceof Error ? error.message : String(error));
        if (cachedExtract === undefined) {
          extractCacheRef.current.set(titleToUse, null);
          setPreviewExtract(null);
        }
        if (cachedDescription === undefined) {
          descriptionCacheRef.current.set(titleToUse, null);
          setPreviewDescription(null);
        }
      })
      .finally(() => {
        previewLoadingRef.current = false;
      });
  }, [puzzle]);

  const handlePreviewStart = useCallback((e: React.MouseEvent | React.TouchEvent, article: string) => {
    // Don't show preview if we're currently dragging or about to drag
    if (draggedArticle || touchDragging || isDraggingRef.current) {
      console.log(`[Preview] Skipping preview for "${article}" - dragging active`);
      return;
    }
    
    // Don't show preview if this is a mouse event and we're in the middle of a drag operation
    if ('clientX' in e && draggedArticle) {
      console.log(`[Preview] Skipping preview for "${article}" - mouse drag active`);
      return;
    }
    
    console.log(`[Preview] Starting preview for article: "${article}"`);
    
    // Safety check: ensure currentTarget exists
    if (!e.currentTarget) {
      return;
    }
    
    // Get mouse/touch position
    let mouseX: number, mouseY: number;
    if ('touches' in e && e.touches.length > 0) {
      // Touch event
      mouseX = e.touches[0].clientX;
      mouseY = e.touches[0].clientY;
    } else if ('clientX' in e) {
      // Mouse event
      mouseX = e.clientX;
      mouseY = e.clientY;
    } else {
      // Fallback to element center
      let rect: DOMRect;
      try {
        rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        mouseX = rect.left + rect.width / 2;
        mouseY = rect.top + rect.height / 2;
      } catch (error) {
        console.warn('Could not get bounding rect for preview:', error);
        return;
      }
    }
    
    const previewCardWidth = 280;
    const previewCardHeight = 300; // Approximate height
    const margin = 12;
    const offset = 16; // Offset from cursor/tap position
    
    // Get viewport dimensions
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Start with position near the cursor/tap (offset to the right and below)
    let x = mouseX + offset;
    let y = mouseY + offset;
    
    // Adjust horizontal position to keep in viewport
    // Prefer showing to the right, but if not enough space, show to the left
    if (x + previewCardWidth > viewportWidth - margin) {
      // Not enough space on right, show to the left of cursor
      x = mouseX - previewCardWidth - offset;
      // If still doesn't fit, align to right edge
      if (x < margin) {
        x = viewportWidth - previewCardWidth - margin;
      }
    } else if (x < margin) {
      // Not enough space on left, align to left edge
      x = margin;
    }
    
    // Adjust vertical position to keep in viewport
    // Prefer showing below, but if not enough space, show above
    if (y + previewCardHeight > viewportHeight - margin) {
      // Not enough space below, show above cursor
      y = mouseY - previewCardHeight - offset;
      // If still doesn't fit, align to bottom edge
      if (y < margin) {
        y = viewportHeight - previewCardHeight - margin;
      }
    } else if (y < margin) {
      // Not enough space above, align to top edge
      y = margin;
    }
    
    // Final check: ensure it's fully within viewport
    x = Math.max(margin, Math.min(x, viewportWidth - previewCardWidth - margin));
    y = Math.max(margin, Math.min(y, viewportHeight - previewCardHeight - margin));
    
    setPreviewPosition({ x, y });
    setPreviewArticle(article);
    // Load extract (will use cache if available)
    loadPreviewExtract(article);
  }, [loadPreviewExtract, draggedArticle, touchDragging]);

  const handlePreviewEnd = useCallback(() => {
    setPreviewArticle(null);
    setPreviewExtract(null);
    setPreviewDescription(null);
    setPreviewPosition(null);
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleTouchTap = useCallback((e: React.TouchEvent, article: string) => {
    // Show preview immediately on tap
    e.stopPropagation();
    console.log(`[TouchTap] Tapped on article: "${article}"`);
    // Normalize the article title to match puzzle data
    let exactTitle = article;
    if (puzzle) {
      // Check if it's the featured article
      if (article === puzzle.featured_article.title || 
          article.toLowerCase() === puzzle.featured_article.title.toLowerCase()) {
        exactTitle = puzzle.featured_article.title;
      } else {
        // Check if it's a surrounding article
        const surroundingArticle = puzzle.surrounding_articles.find(
          a => a.title === article || a.title.toLowerCase() === article.toLowerCase()
        );
        if (surroundingArticle) {
          exactTitle = surroundingArticle.title;
        } else {
          // Check if it's a connection article
          const connectionInfo = puzzle.connections.find(
            c => c.connectingArticle === article || c.connectingArticle.toLowerCase() === article.toLowerCase()
          );
          if (connectionInfo) {
            exactTitle = connectionInfo.connectingArticle;
          }
        }
      }
    }
    if (exactTitle !== article) {
      console.log(`[TouchTap] Normalized "${article}" to "${exactTitle}"`);
    }
    handlePreviewStart(e, exactTitle);
  }, [handlePreviewStart, puzzle]);

  const handleLongPressEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleDrop = useCallback((surroundingArticleId: number, sourceSurroundingArticleId?: number) => {
    if (!draggedArticle || !gameState || !puzzle) return;

    // If dragging from one slot to another (sourceSurroundingArticleId is provided)
    if (sourceSurroundingArticleId !== undefined) {
      const updatedConnections = gameState.current_connections.map(conn => {
        if (conn.surrounding_article_id === surroundingArticleId) {
          // Target slot: place the dragged article here
          return { ...conn, connecting_article: draggedArticle };
        } else if (conn.surrounding_article_id === sourceSurroundingArticleId) {
          // Source slot: get the article that was in the target slot (if any) and put it here
          const targetConnection = gameState.current_connections.find(c => c.surrounding_article_id === surroundingArticleId);
          return { ...conn, connecting_article: targetConnection?.connecting_article || null };
        }
        return conn;
      });

      const newState: KnowledgeWebGameState = {
        ...gameState,
        current_connections: updatedConnections,
      };

      setGameState(newState);
      saveKnowledgeWebGameState(dateKey, newState);
      setDraggedArticle(null);
      setHoveredSlot(null);
      return;
    }

    // Original behavior: dragging from answer bank
    const updatedConnections = gameState.current_connections.map(conn => {
      if (conn.surrounding_article_id === surroundingArticleId) {
        return { ...conn, connecting_article: draggedArticle };
      }
      return conn;
    });

    const newState: KnowledgeWebGameState = {
      ...gameState,
      current_connections: updatedConnections,
    };

    setGameState(newState);
    saveKnowledgeWebGameState(dateKey, newState);
    setDraggedArticle(null);
    setHoveredSlot(null);
  }, [draggedArticle, gameState, puzzle, dateKey]);

  // Touch handlers for mobile
  const handleTouchStart = (e: React.TouchEvent, article: string, fromSlot?: number) => {
    // Hide preview when dragging starts
    handlePreviewEnd();
    const touch = e.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      article: article,
      fromSlot: fromSlot
    };
    // Reset dragging state
    isDraggingRef.current = false;
    draggedElementRef.current = e.currentTarget as HTMLElement;
    // Don't prevent default - allow scrolling to work
  };

  useEffect(() => {
    const handleTouchMoveGlobal = (e: TouchEvent) => {
      if (!touchStartRef.current) return;
      
      const touch = e.touches[0];
      const deltaX = Math.abs(touch.clientX - touchStartRef.current.x);
      const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);
      
      // Determine if user is dragging vs scrolling
      // If moving mostly vertically or moving away from pool area, it's a drag
      // If moving mostly horizontally within pool area, it's scrolling
      const isVerticalMovement = deltaY > deltaX;
      const isSignificantMovement = deltaX > 15 || deltaY > 15;
      
      // Check if we're still in the pool area (horizontal scrolling)
      const element = document.elementFromPoint(touch.clientX, touch.clientY);
      const isInPoolArea = element?.closest('.knowledge-web-pool-items');
      const isHorizontalScroll = !isVerticalMovement && isInPoolArea && deltaX > 5 && deltaY < 10;
      
      // If it's a horizontal scroll within the pool, don't interfere
      if (isHorizontalScroll && !touchDragging) {
        return; // Allow native scrolling
      }
      
      // Otherwise, treat as drag if there's significant movement
      if (isSignificantMovement && !touchDragging) {
        // Hide preview when drag is detected
        handlePreviewEnd();
        setPreviewArticle(null);
        setPreviewExtract(null);
        setPreviewPosition(null);
        // Start dragging
        setDraggedArticle(touchStartRef.current.article);
        setDraggedFromSlot(touchStartRef.current.fromSlot || null);
        setTouchDragging(true);
        isDraggingRef.current = true;
        if (draggedElementRef.current) {
          draggedElementRef.current.classList.add('touching');
        }
        // Cancel long press
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
      }
      
      if (touchDragging) {
        // Prevent default to stop scrolling when dragging
        e.preventDefault();
        
        // Update drag position for visual feedback
        setDragPosition({ x: touch.clientX, y: touch.clientY });
        
        // Find if we're over a connection slot
        const connectionSlot = element?.closest('.knowledge-web-connection-slot');
        if (connectionSlot) {
          const slotWrapper = connectionSlot.closest('.knowledge-web-connection-slot-wrapper');
          if (slotWrapper) {
            const slotId = slotWrapper.getAttribute('data-slot-id');
            if (slotId) {
              const targetSlotId = parseInt(slotId);
              // Don't highlight the slot we're dragging from
              if (targetSlotId !== touchStartRef.current?.fromSlot) {
                setHoveredSlot(targetSlotId);
              }
            }
          }
        } else {
          setHoveredSlot(null);
        }
      }
    };

    const handleTouchEndGlobal = (e: TouchEvent) => {
      if (!touchStartRef.current) return;
      
      const touch = e.changedTouches[0];
      const element = document.elementFromPoint(touch.clientX, touch.clientY);
      
      // Find if we're over a connection slot
      const connectionSlot = element?.closest('.knowledge-web-connection-slot');
      if (connectionSlot) {
        const slotWrapper = connectionSlot.closest('.knowledge-web-connection-slot-wrapper');
        if (slotWrapper) {
          const slotId = slotWrapper.getAttribute('data-slot-id');
          if (slotId) {
            const surroundingArticleId = parseInt(slotId);
            // Don't allow dropping on the same slot we're dragging from
            if (surroundingArticleId === touchStartRef.current?.fromSlot) {
              touchStartRef.current = null;
              setTouchDragging(false);
              setDraggedArticle(null);
              setDraggedFromSlot(null);
              setHoveredSlot(null);
              setDragPosition(null); // Clear drag position
              if (draggedElementRef.current) {
                draggedElementRef.current.classList.remove('touching');
              }
              draggedElementRef.current = null;
              return;
            }
            // Check if locked using current gameState
            let isLocked = false;
            if (gameState && gameState.submissions.length > 0) {
              const lastSubmission = gameState.submissions[gameState.submissions.length - 1];
              const result = lastSubmission.results.find(r => r.surrounding_article_id === surroundingArticleId);
              isLocked = result?.is_correct || false;
            }
            if (!isLocked) {
              handleDrop(surroundingArticleId, touchStartRef.current?.fromSlot);
            }
          }
        }
      }
      
      touchStartRef.current = null;
      setTouchDragging(false);
      setDraggedArticle(null);
      setDraggedFromSlot(null);
      setHoveredSlot(null);
      setDragPosition(null); // Clear drag position
      if (draggedElementRef.current) {
        draggedElementRef.current.classList.remove('touching');
      }
      draggedElementRef.current = null;
    };

    document.addEventListener('touchmove', handleTouchMoveGlobal, { passive: false });
    document.addEventListener('touchend', handleTouchEndGlobal);
    document.addEventListener('touchcancel', handleTouchEndGlobal);

    // Always add listeners - they'll check touchStartRef internally
    document.addEventListener('touchmove', handleTouchMoveGlobal, { passive: false });
    document.addEventListener('touchend', handleTouchEndGlobal);
    document.addEventListener('touchcancel', handleTouchEndGlobal);

    return () => {
      document.removeEventListener('touchmove', handleTouchMoveGlobal);
      document.removeEventListener('touchend', handleTouchEndGlobal);
      document.removeEventListener('touchcancel', handleTouchEndGlobal);
    };
  }, [touchDragging, handleDrop, gameState]);

  const handleRemoveConnection = (surroundingArticleId: number) => {
    if (!gameState) return;

    const updatedConnections = gameState.current_connections.map(conn => {
      if (conn.surrounding_article_id === surroundingArticleId) {
        return { ...conn, connecting_article: null };
      }
      return conn;
    });

    const newState: KnowledgeWebGameState = {
      ...gameState,
      current_connections: updatedConnections,
    };

    setGameState(newState);
    saveKnowledgeWebGameState(dateKey, newState);
  };

  const isConnectionLocked = useCallback((surroundingArticleId: number): boolean => {
    if (!gameState || gameState.submissions.length === 0) return false;
    const lastSubmission = gameState.submissions[gameState.submissions.length - 1];
    const result = lastSubmission.results.find(r => r.surrounding_article_id === surroundingArticleId);
    return result?.is_correct || false;
  }, [gameState]);

  const handleSubmit = () => {
    if (!gameState || !puzzle) return;

    // Check if all connections are filled
    const allFilled = gameState.current_connections.every(conn => conn.connecting_article !== null);
    if (!allFilled) {
      alert('Please fill all 4 connections before submitting.');
      return;
    }

    // Validate submission
    const results = validateSubmission(
      puzzle,
      gameState.current_connections.map(conn => ({
        surrounding_article_id: conn.surrounding_article_id,
        connecting_article: conn.connecting_article!,
      }))
    );

    const submissionNumber = gameState.submissions.length + 1;
    const isPerfect = results.every(r => r.is_correct);
    const isFirstAttempt = submissionNumber === 1;

    const newSubmission = {
      submission_number: submissionNumber,
      timestamp: new Date().toISOString(),
      connections: gameState.current_connections.map(conn => ({
        surrounding_article_id: conn.surrounding_article_id,
        connecting_article: conn.connecting_article!,
      })),
      results,
    };

    const updatedState: KnowledgeWebGameState = {
      ...gameState,
      submissions: [...gameState.submissions, newSubmission],
      attempts_remaining: gameState.attempts_remaining - 1, // Still decrement for tracking, but won't end game
      is_complete: isPerfect, // Only complete when all answers are correct
      final_score: isPerfect ? results.filter(r => r.is_correct).length : null,
      perfect_first_attempt: isFirstAttempt && isPerfect,
    };

    // Lock correct connections
    if (!isPerfect) {
      updatedState.current_connections = updatedState.current_connections.map(conn => {
        const result = results.find(r => r.surrounding_article_id === conn.surrounding_article_id);
        if (result?.is_correct) {
          return conn; // Keep correct connections locked
        }
        // Reset incorrect connections
        return { ...conn, connecting_article: null };
      });
    }

    setGameState(updatedState);
    saveKnowledgeWebGameState(dateKey, updatedState);

    // Navigate to results if all answers are correct
    if (isPerfect) {
      navigate('/games/knowledge-web/results', { state: { puzzle, gameState: updatedState } });
    }
  };

  const getAvailableArticles = (): string[] => {
    if (!puzzle || !gameState) return [];

    const usedArticles = gameState.current_connections
      .filter(conn => conn.connecting_article !== null)
      .map(conn => conn.connecting_article!);

    return puzzle.answer_pool.filter(article => !usedArticles.includes(article));
  };

  const getConnectionForSlot = (surroundingArticleId: number): string | null => {
    if (!gameState) return null;
    const conn = gameState.current_connections.find(c => c.surrounding_article_id === surroundingArticleId);
    return conn?.connecting_article || null;
  };

  if (loading) {
    return (
      <div className="knowledge-web-page">
        <div className="knowledge-web-loading">Loading today's knowledge web...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="knowledge-web-page">
        <div className="knowledge-web-error">
          <div className="knowledge-web-error-title">Couldn't load the game</div>
          <div className="knowledge-web-error-body">{error}</div>
          <button className="knowledge-web-primary-btn" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!puzzle || !gameState) {
    return null;
  }

  const allFilled = gameState.current_connections.every(conn => conn.connecting_article !== null);
  const availableArticles = getAvailableArticles();
  const attempts = gameState.submissions.length;
  
  // Check if all current connections are correct
  const allCorrect = gameState.submissions.length > 0 && (() => {
    const lastSubmission = gameState.submissions[gameState.submissions.length - 1];
    return lastSubmission.results.every(r => r.is_correct);
  })();
  
  // Show button if all filled and not all correct (or no submissions yet)
  const showCheckButton = allFilled && (!allCorrect || gameState.submissions.length === 0);

  // Splash screen
  if (showSplash) {
    return (
      <div className="knowledge-web-splash">
        <div className="knowledge-web-splash-content">
          <h1 className="knowledge-web-splash-title">Knowledge Web</h1>
          <div className="knowledge-web-splash-instructions">
            <h3 className="knowledge-web-splash-instructions-title">How to Play</h3>
            <ol className="knowledge-web-splash-instructions-list">
              <li>Complete the knowledge web by matching articles to fill in the missing connections</li>
              <li>Drag articles from the pool to the connection slots along each spoke</li>
              <li>Each connection links the featured article to a surrounding topic</li>
              <li>Fill all 4 connections, then check your answers</li>
            </ol>
          </div>
          <button 
            className="knowledge-web-splash-start-btn"
            onClick={() => setShowSplash(false)}
          >
            Start Puzzle
          </button>
        </div>
      </div>
    );
  }

  // Fullscreen game view
  return (
    <div className="knowledge-web-page knowledge-web-immersive">
      <button 
        className="knowledge-web-close"
        onClick={() => navigate('/games')}
        title="Close"
      >
        <i className="fas fa-times"></i>
      </button>
      {attempts > 0 && (
        <div className="knowledge-web-attempts-counter">
          Try {attempts}
        </div>
      )}
      <div 
        className="knowledge-web-visualization"
        onClick={(e) => {
          // Close preview if clicking outside the preview card
          // Cards have their own onClick handlers that will handle showing/closing preview
          const target = e.target as HTMLElement;
          if (!target.closest('.knowledge-web-preview-card')) {
            handlePreviewEnd();
          }
        }}
      >
          {/* Center Node */}
          <div className="knowledge-web-center">
            <div 
              className={`knowledge-web-center-node ${!puzzle.featured_article.thumbnail ? 'no-image' : ''}`}
              onTouchStart={(e) => {
                handleTouchTap(e, puzzle.featured_article.title);
              }}
              onTouchEnd={handlePreviewEnd}
              onTouchCancel={handlePreviewEnd}
              onClick={(e) => {
                e.stopPropagation();
                if (previewArticle === puzzle.featured_article.title) {
                  handlePreviewEnd();
                } else {
                  handlePreviewStart(e, puzzle.featured_article.title);
                }
              }}
            >
              {puzzle.featured_article.thumbnail && (
                <img 
                  src={puzzle.featured_article.thumbnail} 
                  alt={puzzle.featured_article.title}
                  className="knowledge-web-node-image"
                />
              )}
              <div className="knowledge-web-center-node-content">
                <div className="knowledge-web-node-title">{puzzle.featured_article.title}</div>
                {puzzle.featured_article.description && (
                  <div className="knowledge-web-center-node-description">{puzzle.featured_article.description}</div>
                )}
              </div>
            </div>
          </div>

          {/* Spokes with connecting articles and surrounding articles */}
          {puzzle.surrounding_articles.map((article, index) => {
            const connection = getConnectionForSlot(article.id);
            const isLocked = isConnectionLocked(article.id);
            const isHovered = hoveredSlot === article.id;
            
            // Get connection article info for image - find by the actual connecting article title, not the slot
            const connectionInfo = connection 
              ? puzzle.connections.find(c => c.connectingArticle === connection)
              : puzzle.connections.find(c => c.surroundingArticleId === article.id);
            
            // Debug: log if connectionInfo is missing when we have a connection
            if (connection && !connectionInfo) {
              console.warn(`[KnowledgeWeb] Could not find connectionInfo for connection: "${connection}"`);
            }
            
            // Position nodes in corners
            const centerX = 50;
            const centerY = 50;
            const connectionRadius = 20; // Percentage from center for connection slot (reduced from 22)
            const surroundingRadius = 35; // Percentage from center for surrounding article (reduced from 42)
            
            // Calculate positions based on corner
            let connectionX: number, connectionY: number;
            let surroundingX: number, surroundingY: number;
            let lineEndX: number, lineEndY: number;
            
            if (article.position === 'top-left') {
              connectionX = centerX - connectionRadius;
              connectionY = centerY - connectionRadius;
              surroundingX = centerX - surroundingRadius;
              surroundingY = centerY - surroundingRadius;
              lineEndX = centerX - surroundingRadius;
              lineEndY = centerY - surroundingRadius;
            } else if (article.position === 'top-right') {
              connectionX = centerX + connectionRadius;
              connectionY = centerY - connectionRadius;
              surroundingX = centerX + surroundingRadius;
              surroundingY = centerY - surroundingRadius;
              lineEndX = centerX + surroundingRadius;
              lineEndY = centerY - surroundingRadius;
            } else if (article.position === 'bottom-left') {
              connectionX = centerX - connectionRadius;
              connectionY = centerY + connectionRadius;
              surroundingX = centerX - surroundingRadius;
              surroundingY = centerY + surroundingRadius;
              lineEndX = centerX - surroundingRadius;
              lineEndY = centerY + surroundingRadius;
            } else { // bottom-right
              connectionX = centerX + connectionRadius;
              connectionY = centerY + connectionRadius;
              surroundingX = centerX + surroundingRadius;
              surroundingY = centerY + surroundingRadius;
              lineEndX = centerX + surroundingRadius;
              lineEndY = centerY + surroundingRadius;
            }

            return (
              <div key={article.id} className="knowledge-web-spoke">
                {/* SVG line for the spoke */}
                <svg className="knowledge-web-spoke-line">
                  <line
                    x1={`${centerX}%`}
                    y1={`${centerY}%`}
                    x2={`${lineEndX}%`}
                    y2={`${lineEndY}%`}
                    stroke="#d1d5db"
                    strokeWidth="2"
                  />
                </svg>

                {/* Connecting article slot (midway along spoke) */}
                <div
                  className="knowledge-web-connection-slot-wrapper"
                  data-slot-id={article.id.toString()}
                  style={{
                    left: `${connectionX}%`,
                    top: `${connectionY}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <div
                    className={`knowledge-web-connection-slot ${connection ? 'filled' : ''} ${isLocked ? 'locked' : ''} ${isHovered ? 'hovered' : ''} ${connection && !connectionInfo?.thumbnail ? 'no-image' : ''}`}
                    draggable={connection !== null && !isLocked}
                    onDragStart={(e) => {
                      if (connection && !isLocked) {
                        handlePreviewEnd(); // Hide preview when dragging starts
                        setDraggedArticle(connection);
                        setDraggedFromSlot(article.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }
                    }}
                    onDragEnd={() => {
                      setDraggedArticle(null);
                      setDraggedFromSlot(null);
                      setHoveredSlot(null);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (!isLocked) setHoveredSlot(article.id);
                    }}
                    onDragLeave={() => setHoveredSlot(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (!isLocked) {
                        handleDrop(article.id, draggedFromSlot || undefined);
                      }
                    }}
                    onTouchStart={(e) => {
                      if (connection && !isLocked) {
                        handleTouchStart(e, connection, article.id);
                      }
                      // Show preview on tap
                      if (connection) {
                        handleTouchTap(e, connection);
                      }
                    }}
                    onTouchEnd={handlePreviewEnd}
                    onTouchCancel={handlePreviewEnd}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (connection) {
                        if (previewArticle === connection) {
                          handlePreviewEnd();
                        } else {
                          handlePreviewStart(e, connection);
                        }
                      }
                    }}
                  >
                    {connection ? (
                      <>
                        {connectionInfo?.thumbnail && (
                          <img 
                            src={connectionInfo.thumbnail} 
                            alt={connection}
                            className="knowledge-web-connection-image"
                          />
                        )}
                        <span className="knowledge-web-connection-text">{connectionInfo?.connectingArticle || connection}</span>
                      </>
                    ) : (
                      <span className="knowledge-web-placeholder">
                        <i className="fas fa-link"></i>?
                      </span>
                    )}
                  </div>
                </div>

                {/* Surrounding article (at end of spoke) */}
                <div
                  className="knowledge-web-surrounding-node-wrapper"
                  style={{
                    left: `${surroundingX}%`,
                    top: `${surroundingY}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <div 
                    className={`knowledge-web-surrounding-node ${!article.thumbnail ? 'no-image' : ''}`}
                    onTouchStart={(e) => {
                      e.stopPropagation();
                      handleTouchTap(e, article.title);
                    }}
                    onTouchEnd={(e) => {
                      e.stopPropagation();
                      handlePreviewEnd();
                    }}
                    onTouchCancel={(e) => {
                      e.stopPropagation();
                      handlePreviewEnd();
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (previewArticle === article.title) {
                        handlePreviewEnd();
                      } else {
                        handlePreviewStart(e, article.title);
                      }
                    }}
                  >
                    {article.thumbnail && (
                      <img 
                        src={article.thumbnail} 
                        alt={article.title}
                        className="knowledge-web-node-image"
                      />
                    )}
                    <div className="knowledge-web-node-title">{article.title}</div>
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      <div className="knowledge-web-pool">
        <h3 className="knowledge-web-pool-title">Available Connections:</h3>
          <div className="knowledge-web-pool-items">
            {availableArticles.map(article => {
              const connectionInfo = puzzle.connections.find(c => c.connectingArticle === article);
              return (
                <div
                  key={article}
                  className={`knowledge-web-pool-item ${!connectionInfo?.thumbnail ? 'no-image' : ''}`}
                  draggable
                  onDragStart={() => handleDragStart(article)}
                  onDragEnd={handleDragEnd}
                  onTouchStart={(e) => {
                    // Don't stop propagation - allow container scrolling
                    handleTouchStart(e, article);
                    // Show preview on tap
                    handleTouchTap(e, article);
                  }}
                  onTouchEnd={(e) => {
                    // Clean up if not dragging
                    if (!touchDragging && touchStartRef.current) {
                      handlePreviewEnd();
                      touchStartRef.current = null;
                    }
                  }}
                  onTouchCancel={(e) => {
                    // Clean up if not dragging
                    if (!touchDragging && touchStartRef.current) {
                      handlePreviewEnd();
                      touchStartRef.current = null;
                    }
                  }}
                  onContextMenu={(e) => {
                    // Prevent context menu on long press
                    e.preventDefault();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (previewArticle === article) {
                      handlePreviewEnd();
                    } else {
                      handlePreviewStart(e, article);
                    }
                  }}
                >
                  {connectionInfo?.thumbnail && (
                    <img
                      src={connectionInfo.thumbnail}
                      alt={article}
                      className="knowledge-web-pool-item-image"
                    />
                  )}
                  <span className="knowledge-web-pool-item-text">{connectionInfo?.connectingArticle || article}</span>
                </div>
              );
            })}
          </div>
      </div>

      {/* Fixed submit button at bottom - visible when all filled and not all correct */}
      {showCheckButton && (
        <div className="knowledge-web-submit-container">
          <button
            className="knowledge-web-submit-btn"
            onClick={handleSubmit}
          >
            {gameState.submissions.length === 0 ? 'Check Answers' : 'Check Again'}
          </button>
        </div>
      )}

      {/* Drag indicator for mobile touch drag */}
      {touchDragging && draggedArticle && dragPosition && puzzle && (
        <div
          className="knowledge-web-drag-indicator"
          style={{
            left: `${dragPosition.x}px`,
            top: `${dragPosition.y}px`,
          }}
        >
          {(() => {
            // Find thumbnail - could be from connections (pool) or from a filled slot
            let thumbnail: string | undefined;
            const connectionInfo = puzzle.connections.find(c => c.connectingArticle === draggedArticle);
            thumbnail = connectionInfo?.thumbnail;
            
            return (
              <>
                {thumbnail ? (
                  <>
                    <img
                      src={thumbnail}
                      alt={draggedArticle}
                      className="knowledge-web-drag-indicator-image"
                    />
                    <span className="knowledge-web-drag-indicator-text">{connectionInfo?.connectingArticle || draggedArticle}</span>
                  </>
                ) : (
                  <span className="knowledge-web-drag-indicator-text">{connectionInfo?.connectingArticle || draggedArticle}</span>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Preview card */}
      {previewArticle && previewPosition && (
        <div
          className="knowledge-web-preview-card"
          style={{
            left: `${previewPosition.x}px`,
            top: `${previewPosition.y}px`,
          }}
          onMouseEnter={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {(() => {
            let thumbnail: string | undefined;
            
            // Check if it's the featured article (case-insensitive)
            if (previewArticle === puzzle.featured_article.title || 
                previewArticle.toLowerCase() === puzzle.featured_article.title.toLowerCase()) {
              thumbnail = puzzle.featured_article.thumbnail;
            } else {
              // Check if it's a surrounding article (case-insensitive)
              const surroundingArticle = puzzle.surrounding_articles.find(
                a => a.title === previewArticle || a.title.toLowerCase() === previewArticle.toLowerCase()
              );
              if (surroundingArticle) {
                thumbnail = surroundingArticle.thumbnail;
              } else {
                // Otherwise it's a connection article (case-insensitive)
                const connectionInfo = puzzle.connections.find(
                  c => c.connectingArticle === previewArticle || c.connectingArticle.toLowerCase() === previewArticle.toLowerCase()
                );
                thumbnail = connectionInfo?.thumbnail;
              }
            }
            
            return (
              <>
                {thumbnail && (
                  <img
                    src={thumbnail}
                    alt={previewArticle}
                    className="knowledge-web-preview-image"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePreviewEnd();
                    }}
                    onTouchStart={(e) => {
                      e.stopPropagation();
                      handlePreviewEnd();
                    }}
                    style={{ cursor: 'pointer' }}
                  />
                )}
                <h3 className="knowledge-web-preview-title">{previewArticle}</h3>
                {previewDescription && (
                  <p className="knowledge-web-preview-description">{previewDescription}</p>
                )}
                {previewExtract ? (
                  <p className="knowledge-web-preview-extract">{previewExtract}</p>
                ) : previewDescription ? null : (
                  <p className="knowledge-web-preview-loading">Loading...</p>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
};

export default KnowledgeWebPage;
