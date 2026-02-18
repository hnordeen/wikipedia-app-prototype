import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  generateDailyKnowledgeWebPuzzle,
  getKnowledgeWebGameState,
  saveKnowledgeWebGameState,
  validateSubmission,
  calculateKnowledgeWebScore,
  getUtcDateKey,
  KnowledgeWebPuzzle,
  KnowledgeWebGameState,
} from '../services/knowledgeWebService';
import { getArticleExtract } from '../api/wikipedia';
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
  const [showSplash, setShowSplash] = useState(true);
  const [previewArticle, setPreviewArticle] = useState<string | null>(null);
  const [previewExtract, setPreviewExtract] = useState<string | null>(null);
  const [previewPosition, setPreviewPosition] = useState<{ x: number; y: number } | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const previewLoadingRef = useRef<boolean>(false);
  const extractCacheRef = useRef<Map<string, string | null>>(new Map());

  const dateKey = getUtcDateKey();

  // Preload extracts for all articles in the puzzle
  const preloadAllExtracts = useCallback(async (puzzle: KnowledgeWebPuzzle) => {
    const articlesToLoad: string[] = [
      puzzle.featured_article.title,
      ...puzzle.surrounding_articles.map(a => a.title),
      ...puzzle.connections.map(c => c.connectingArticle),
    ];

    // Load all extracts in parallel
    const extractPromises = articlesToLoad.map(async (article) => {
      // Skip if already cached
      if (extractCacheRef.current.has(article)) {
        return;
      }
      try {
        const extract = await getArticleExtract(article);
        extractCacheRef.current.set(article, extract);
      } catch (error) {
        console.error(`Error preloading extract for "${article}":`, error);
        extractCacheRef.current.set(article, null);
      }
    });

    // Don't await - let it load in background
    Promise.all(extractPromises).catch(err => {
      console.error('Error preloading extracts:', err);
    });
  }, []);

  useEffect(() => {
    const loadGame = async () => {
      setLoading(true);
      setError(null);

      try {
        // Check for existing game state
        const existingState = getKnowledgeWebGameState(dateKey);
        
        // Generate or load puzzle
        const dailyPuzzle = await generateDailyKnowledgeWebPuzzle();
        if (!dailyPuzzle) {
          setError("Couldn't load today's puzzle. Please try again.");
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
            attempts_remaining: 3,
          };
          setGameState(initialState);
          saveKnowledgeWebGameState(dateKey, initialState);
        }

        // Preload extracts for all articles in the puzzle
        preloadAllExtracts(dailyPuzzle);

        setLoading(false);
      } catch (err) {
        console.error('Error loading knowledge web game:', err);
        setError("Couldn't load today's puzzle. Please try again.");
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
    // Check cache first
    const cachedExtract = extractCacheRef.current.get(article);
    if (cachedExtract !== undefined) {
      setPreviewExtract(cachedExtract);
      return;
    }

    // If not in cache, load it (shouldn't happen if preload worked, but fallback)
    if (previewLoadingRef.current) return;
    previewLoadingRef.current = true;
    getArticleExtract(article)
      .then((extract) => {
        extractCacheRef.current.set(article, extract);
        setPreviewExtract(extract);
      })
      .catch((error) => {
        console.error('Error loading preview extract:', error);
        extractCacheRef.current.set(article, null);
        setPreviewExtract(null);
      })
      .finally(() => {
        previewLoadingRef.current = false;
      });
  }, []);

  const handlePreviewStart = useCallback((e: React.MouseEvent | React.TouchEvent, article: string) => {
    // Don't show preview if we're currently dragging
    if (draggedArticle || touchDragging) {
      return;
    }
    
    // Safety check: ensure currentTarget exists
    if (!e.currentTarget) {
      return;
    }
    
    let rect: DOMRect;
    try {
      rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    } catch (error) {
      // Element might have been removed from DOM
      console.warn('Could not get bounding rect for preview:', error);
      return;
    }
    
    const previewCardWidth = 280;
    const previewCardHeight = 300; // Approximate height
    const margin = 12;
    
    // Calculate initial position (centered above the element)
    let x = rect.left + rect.width / 2;
    let y = rect.top;
    
    // Get viewport dimensions
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Adjust horizontal position to keep in viewport
    if (x - previewCardWidth / 2 < margin) {
      x = previewCardWidth / 2 + margin;
    } else if (x + previewCardWidth / 2 > viewportWidth - margin) {
      x = viewportWidth - previewCardWidth / 2 - margin;
    }
    
    // Adjust vertical position to keep in viewport
    // If there's not enough space above, show below instead
    if (y - previewCardHeight - margin < 0) {
      y = rect.bottom + margin;
    } else {
      y = rect.top - margin;
    }
    
    // If still doesn't fit below, show above but adjust
    if (y + previewCardHeight > viewportHeight - margin) {
      y = viewportHeight - previewCardHeight - margin;
    }
    
    setPreviewPosition({ x, y });
    setPreviewArticle(article);
    // Load extract (will use cache if available)
    loadPreviewExtract(article);
  }, [loadPreviewExtract, draggedArticle, touchDragging]);

  const handlePreviewEnd = useCallback(() => {
    setPreviewArticle(null);
    setPreviewExtract(null);
    setPreviewPosition(null);
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleLongPressStart = useCallback((e: React.TouchEvent, article: string) => {
    // Don't prevent default - allow scrolling
    e.stopPropagation();
    longPressTimerRef.current = setTimeout(() => {
      handlePreviewStart(e, article);
    }, 500); // 500ms for long press
  }, [handlePreviewStart]);

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
    setDraggedArticle(article);
    setDraggedFromSlot(fromSlot || null);
    setTouchDragging(true);
    draggedElementRef.current = e.currentTarget as HTMLElement;
    if (draggedElementRef.current) {
      draggedElementRef.current.classList.add('touching');
    }
    e.preventDefault();
  };

  useEffect(() => {
    if (!touchDragging) return;

    const handleTouchMoveGlobal = (e: TouchEvent) => {
      if (!touchStartRef.current) return;
      
      // Cancel long press if user moves finger (they're dragging, not long pressing)
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      
      const touch = e.touches[0];
      const element = document.elementFromPoint(touch.clientX, touch.clientY);
      
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
      
      e.preventDefault();
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
      if (draggedElementRef.current) {
        draggedElementRef.current.classList.remove('touching');
      }
      draggedElementRef.current = null;
    };

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
      attempts_remaining: gameState.attempts_remaining - 1,
      is_complete: isPerfect || gameState.attempts_remaining === 1,
      final_score: isPerfect || gameState.attempts_remaining === 1 ? results.filter(r => r.is_correct).length : null,
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

    // Navigate to results if complete
    if (updatedState.is_complete) {
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
              <li>You have 3 attempts to get them all correct</li>
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
      <div className="knowledge-web-visualization">
          {/* Center Node */}
          <div className="knowledge-web-center">
            <div 
              className={`knowledge-web-center-node ${!puzzle.featured_article.thumbnail ? 'no-image' : ''}`}
              onTouchStart={(e) => {
                handleLongPressStart(e, puzzle.featured_article.title);
              }}
              onTouchEnd={handleLongPressEnd}
              onTouchCancel={handleLongPressEnd}
              onMouseEnter={(e) => handlePreviewStart(e, puzzle.featured_article.title)}
              onMouseLeave={handlePreviewEnd}
            >
              {puzzle.featured_article.thumbnail && (
                <img 
                  src={puzzle.featured_article.thumbnail} 
                  alt={puzzle.featured_article.title}
                  className="knowledge-web-node-image"
                />
              )}
              <div className="knowledge-web-node-title">{puzzle.featured_article.title}</div>
            </div>
          </div>

          {/* Spokes with connecting articles and surrounding articles */}
          {puzzle.surrounding_articles.map((article, index) => {
            const connection = getConnectionForSlot(article.id);
            const isLocked = isConnectionLocked(article.id);
            const isHovered = hoveredSlot === article.id;
            
            // Get connection article info for image
            const connectionInfo = puzzle.connections.find(c => c.surroundingArticleId === article.id);
            
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
                      // Start long press for preview
                      if (connection) {
                        handleLongPressStart(e, connection);
                      }
                    }}
                    onTouchEnd={handleLongPressEnd}
                    onTouchCancel={handleLongPressEnd}
                    onMouseEnter={(e) => {
                      if (connection) {
                        handlePreviewStart(e, connection);
                      }
                    }}
                    onMouseLeave={handlePreviewEnd}
                    onClick={() => {
                      if (connection && !isLocked) {
                        handleRemoveConnection(article.id);
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
                        <span className="knowledge-web-connection-text">{connection}</span>
                        {!isLocked && <button className="knowledge-web-remove-btn" onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveConnection(article.id);
                        }}>×</button>}
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
                      handleLongPressStart(e, article.title);
                    }}
                    onTouchEnd={(e) => {
                      e.stopPropagation();
                      handleLongPressEnd();
                    }}
                    onTouchCancel={(e) => {
                      e.stopPropagation();
                      handleLongPressEnd();
                    }}
                    onTouchMove={(e) => {
                      // Cancel long press if user moves (they're not trying to preview)
                      e.stopPropagation();
                      handleLongPressEnd();
                    }}
                    onMouseEnter={(e) => {
                      e.stopPropagation();
                      handlePreviewStart(e, article.title);
                    }}
                    onMouseLeave={(e) => {
                      e.stopPropagation();
                      handlePreviewEnd();
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
                    // Start long press timer for preview
                    handleLongPressStart(e, article);
                    // Also prepare for drag (but drag will be handled by global touchmove)
                  }}
                  onTouchEnd={(e) => {
                    handleLongPressEnd();
                  }}
                  onTouchCancel={handleLongPressEnd}
                  onContextMenu={(e) => {
                    // Prevent context menu on long press
                    e.preventDefault();
                  }}
                  onMouseEnter={(e) => handlePreviewStart(e, article)}
                  onMouseLeave={handlePreviewEnd}
                >
                  {connectionInfo?.thumbnail && (
                    <img
                      src={connectionInfo.thumbnail}
                      alt={article}
                      className="knowledge-web-pool-item-image"
                    />
                  )}
                  <span className="knowledge-web-pool-item-text">{article}</span>
                </div>
              );
            })}
          </div>
      </div>

      {/* Fixed submit button at bottom - only visible when all filled */}
      {allFilled && !gameState.is_complete && (
        <div className="knowledge-web-submit-container">
          <button
            className="knowledge-web-submit-btn"
            onClick={handleSubmit}
          >
            {gameState.submissions.length === 0 ? 'Check Answers' : 'Submit Again'}
          </button>
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
        >
          {(() => {
            let thumbnail: string | undefined;
            
            // Check if it's the featured article
            if (previewArticle === puzzle.featured_article.title) {
              thumbnail = puzzle.featured_article.thumbnail;
            } else {
              // Check if it's a surrounding article
              const surroundingArticle = puzzle.surrounding_articles.find(a => a.title === previewArticle);
              if (surroundingArticle) {
                thumbnail = surroundingArticle.thumbnail;
              } else {
                // Otherwise it's a connection article
                const connectionInfo = puzzle.connections.find(c => c.connectingArticle === previewArticle);
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
                  />
                )}
                <h3 className="knowledge-web-preview-title">{previewArticle}</h3>
                {previewExtract ? (
                  <p className="knowledge-web-preview-extract">{previewExtract}</p>
                ) : (
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
