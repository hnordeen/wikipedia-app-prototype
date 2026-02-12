import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { generateDailyGame, getGameState, saveGameState, GameCard, DailyGame, GameState, calculateResult, getUtcDateKey } from '../services/linkQuestService';
import { formatTitleForDisplay, formatTitleForUrl, decodeHtmlEntities } from '../utils/titleUtils';
import './LinkQuestPage.css';

const LinkQuestPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [game, setGame] = useState<DailyGame | null>(null);
  const [gameState, setGameState] = useState<GameState>({
    currentCardIndex: 0,
    answers: [],
    hintsUsed: 0,
    shuffleCount: 0,
    isComplete: false
  });
  const [showLeadExpanded, setShowLeadExpanded] = useState(false);
  const [showFeedback, setShowFeedback] = useState<{ correct: boolean; linkContext?: string; linkContextTitle?: string; linkSectionHeading?: string; isComplete?: boolean; cardTitle?: string; isLinked?: boolean } | null>(null);
  const feedbackRef = useRef<{ correct: boolean; linkContext?: string; linkContextTitle?: string; linkSectionHeading?: string; isComplete?: boolean; cardTitle?: string; isLinked?: boolean } | null>(null);
  const [isSwipingAway, setIsSwipingAway] = useState(false);
  const [previewNextCard, setPreviewNextCard] = useState<GameCard | null>(null);
  const [isShuffling, setIsShuffling] = useState(false);
  
  const cardRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const cardOffsetX = useRef<number>(0);
  const cardOffsetY = useRef<number>(0);
  const isDragging = useRef<boolean>(false);

  const dateKeyUTC = getUtcDateKey();
  
  // Use refs to store mouse handlers for cleanup
  const mouseMoveHandlerRef = useRef<((e: MouseEvent) => void) | null>(null);
  const mouseUpHandlerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const loadGame = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Check for existing game state
        const existingState = getGameState(dateKeyUTC);
        if (existingState && existingState.isComplete) {
          // Game already completed, go to results
          const dailyGame = await generateDailyGame();
          if (dailyGame) {
            const result = calculateResult(dailyGame, existingState);
            navigate('/games/linkquest/results', { state: { result, game: dailyGame } });
            return;
          }
        }
        
        // Load or generate new game
        const dailyGame = await generateDailyGame();
        if (!dailyGame) {
          setError('Failed to load today\'s game. Please try again.');
          setLoading(false);
          return;
        }
        
        setGame(dailyGame);
        
        // Restore state if exists
        if (existingState) {
          setGameState(existingState);
        }
        
        setLoading(false);
      } catch (err) {
        console.error('Error loading game:', err);
        setError('Failed to load game. Please try again.');
        setLoading(false);
      }
    };
    
    loadGame();
    
    // Cleanup on unmount
    return () => {
      if (mouseMoveHandlerRef.current) {
        document.removeEventListener('mousemove', mouseMoveHandlerRef.current);
      }
      if (mouseUpHandlerRef.current) {
        document.removeEventListener('mouseup', mouseUpHandlerRef.current);
      }
    };
  }, [dateKeyUTC, navigate]);

  // Reset card position when currentCard changes (new card is ready)
  useEffect(() => {
    if (cardRef.current && !showFeedback && !isSwipingAway) {
      // Reset any transforms/opacity from previous swipes
      cardRef.current.style.transition = '';
      cardRef.current.style.transform = '';
      cardRef.current.style.opacity = '1';
    }
  }, [gameState.currentCardIndex, showFeedback, isSwipingAway]);

  const currentCard = game?.cards[gameState.currentCardIndex];
  // Get next card based on current index (before it advances)
  const nextCardIndex = gameState.currentCardIndex + 1;
  const nextCard = game && nextCardIndex < game.cards.length 
    ? game.cards[nextCardIndex] 
    : null;

  const handleSwipe = useCallback((isLinked: boolean) => {
    if (!game || !currentCard || showFeedback || isSwipingAway) {
      console.log('handleSwipe blocked:', { game: !!game, currentCard: !!currentCard, showFeedback, isSwipingAway });
      return;
    }
    
    console.log('handleSwipe called:', { isLinked, currentCardTitle: currentCard.title, currentIndex: gameState.currentCardIndex });
    
    // Capture current card data before state update
    const cardBeingSwiped = currentCard;
    const currentIndex = gameState.currentCardIndex;
    
    const isCorrect = isLinked === cardBeingSwiped.isLinked;
    const newAnswers = [...gameState.answers];
    newAnswers[currentIndex] = isCorrect;
    
    // Calculate if this will complete the game (but don't advance index yet)
    const willBeComplete = currentIndex + 1 >= game.cards.length;
    
    // Prepare feedback data BEFORE state update
    const feedbackData = {
      correct: isCorrect,
      linkContext: cardBeingSwiped.isLinked ? cardBeingSwiped.linkContext : undefined,
      linkContextTitle: cardBeingSwiped.isLinked ? cardBeingSwiped.linkContextTitle : undefined,
      linkSectionHeading: cardBeingSwiped.isLinked ? cardBeingSwiped.linkSectionHeading : undefined,
      isComplete: willBeComplete,
      cardTitle: cardBeingSwiped.title,
      isLinked: cardBeingSwiped.isLinked
    };
    
    // Store feedback data in ref immediately
    feedbackRef.current = feedbackData;
    
    // Set feedback state immediately (but will be hidden during animation)
    setShowFeedback(feedbackData);
    
    // Animate card away first
    setIsSwipingAway(true);
    
    if (cardRef.current) {
      // Animate card off screen
      const direction = isLinked ? 1 : -1;
      const screenWidth = window.innerWidth;
      cardRef.current.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
      cardRef.current.style.transform = `translate(${direction * screenWidth}px, 0) rotate(${direction * 30}deg)`;
      cardRef.current.style.opacity = '0';
    }
    
    // Advance card index and save state AFTER setting up feedback
    const newState: GameState = {
      ...gameState,
      answers: newAnswers,
      currentCardIndex: currentIndex + 1,
      isComplete: willBeComplete
    };
    
    // Save state immediately so it's available when dismissing feedback
    setGameState(newState);
    saveGameState(dateKeyUTC, newState);
    
    // After card animation completes, reset swipe state
    setTimeout(() => {
      console.log('Card animation complete, showing feedback');
      setIsSwipingAway(false);
      setPreviewNextCard(null);
      
      // Reset card position for next card (only if not complete)
      if (cardRef.current && !willBeComplete) {
        cardRef.current.style.transition = '';
        cardRef.current.style.transform = '';
        cardRef.current.style.opacity = '1';
      }
    }, 300);
  }, [game, currentCard, gameState, showFeedback, isSwipingAway, dateKeyUTC]);

  const handleShuffle = () => {
    if (!game || showFeedback || isSwipingAway) return;
    
    // Trigger card animation
    setIsShuffling(true);
    
    // Shuffle remaining cards
    const remainingCards = game.cards.slice(gameState.currentCardIndex);
    const shuffled = [...remainingCards];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    const newCards = [
      ...game.cards.slice(0, gameState.currentCardIndex),
      ...shuffled
    ];
    
    // Update cards after a short delay to allow animation to start
    setTimeout(() => {
      setGame({ ...game, cards: newCards });
    }, 50);
    
    const newState = {
      ...gameState,
      shuffleCount: gameState.shuffleCount + 1
    };
    setGameState(newState);
    saveGameState(dateKeyUTC, newState);
    
    // Reset animation after it completes
    setTimeout(() => {
      setIsShuffling(false);
    }, 600);
  };


  // Touch handlers for swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    if (showFeedback || isSwipingAway || !cardRef.current) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isDragging.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (showFeedback || isSwipingAway || !cardRef.current || !currentCard) return;
    
    const touchX = e.touches[0].clientX;
    const touchY = e.touches[0].clientY;
    const deltaX = touchX - touchStartX.current;
    const deltaY = touchY - touchStartY.current;
    
    if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
      isDragging.current = true;
      cardOffsetX.current = deltaX;
      cardOffsetY.current = deltaY;
      
      if (cardRef.current) {
        const rotation = deltaX * 0.1;
        cardRef.current.style.transform = `translate(${deltaX}px, ${deltaY}px) rotate(${rotation}deg)`;
        cardRef.current.style.opacity = String(1 - Math.abs(deltaX) / 300);
      }
    }
  };

  const handleTouchEnd = () => {
    if (showFeedback || isSwipingAway || !cardRef.current || !currentCard) return;
    
    const threshold = 100;
    
    if (Math.abs(cardOffsetX.current) > threshold && isDragging.current) {
      // Swipe detected
      if (cardOffsetX.current > 0) {
        handleSwipe(true); // Swipe right = linked
      } else {
        handleSwipe(false); // Swipe left = not linked
      }
    } else {
      // Reset card position
      if (cardRef.current) {
        cardRef.current.style.transform = '';
        cardRef.current.style.opacity = '1';
      }
    }
    
    cardOffsetX.current = 0;
    cardOffsetY.current = 0;
    isDragging.current = false;
  };

  // Mouse handlers for desktop
  const handleMouseMoveGlobal = useCallback((e: MouseEvent) => {
    if (showFeedback || isSwipingAway || !cardRef.current || !currentCard) return;
    
    const deltaX = e.clientX - touchStartX.current;
    const deltaY = e.clientY - touchStartY.current;
    
    if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
      isDragging.current = true;
      cardOffsetX.current = deltaX;
      cardOffsetY.current = deltaY;
      
      if (cardRef.current) {
        const rotation = deltaX * 0.1;
        cardRef.current.style.transform = `translate(${deltaX}px, ${deltaY}px) rotate(${rotation}deg)`;
        cardRef.current.style.opacity = String(1 - Math.abs(deltaX) / 300);
      }
    }
  }, [showFeedback, isSwipingAway, currentCard]);

  const handleMouseUpGlobal = useCallback(() => {
    if (showFeedback || isSwipingAway || !cardRef.current || !currentCard) {
      if (mouseMoveHandlerRef.current) {
        document.removeEventListener('mousemove', mouseMoveHandlerRef.current);
      }
      if (mouseUpHandlerRef.current) {
        document.removeEventListener('mouseup', mouseUpHandlerRef.current);
      }
      return;
    }
    
    const threshold = 100;
    
    if (Math.abs(cardOffsetX.current) > threshold && isDragging.current) {
      if (cardOffsetX.current > 0) {
        handleSwipe(true);
      } else {
        handleSwipe(false);
      }
    } else {
      if (cardRef.current) {
        cardRef.current.style.transform = '';
        cardRef.current.style.opacity = '1';
      }
    }
    
    cardOffsetX.current = 0;
    cardOffsetY.current = 0;
    isDragging.current = false;
    
    if (mouseMoveHandlerRef.current) {
      document.removeEventListener('mousemove', mouseMoveHandlerRef.current);
    }
    if (mouseUpHandlerRef.current) {
      document.removeEventListener('mouseup', mouseUpHandlerRef.current);
    }
  }, [showFeedback, isSwipingAway, currentCard, handleSwipe, gameState]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (showFeedback || isSwipingAway || !cardRef.current) return;
    e.preventDefault();
    touchStartX.current = e.clientX;
    touchStartY.current = e.clientY;
    isDragging.current = false;
    
    // Store handlers in refs
    mouseMoveHandlerRef.current = handleMouseMoveGlobal;
    mouseUpHandlerRef.current = handleMouseUpGlobal;
    
    // Add global mouse move/up listeners
    document.addEventListener('mousemove', handleMouseMoveGlobal);
    document.addEventListener('mouseup', handleMouseUpGlobal);
  }, [showFeedback, isSwipingAway, handleMouseMoveGlobal, handleMouseUpGlobal]);

  if (loading) {
    return (
      <div className="linkquest-page">
        <div className="linkquest-loading">Loading today's game...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="linkquest-page">
        <div className="linkquest-error">
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  if (!game) {
    return null;
  }
  
  // If showing feedback or swiping away, we can render even without currentCard (it might be the last card)
  if (!showFeedback && !feedbackRef.current && !isSwipingAway && !currentCard) {
    return null;
  }

  return (
    <div className="linkquest-page">
      {/* Header */}
      <header className="linkquest-header">
        <button className="linkquest-back" onClick={() => navigate('/games')}>
          <i className="fas fa-chevron-left"></i> Back to Games
        </button>
        <div className="linkquest-header-content">
          <div>
            <h1 className="linkquest-title">LinkQuest</h1>
            <p className="linkquest-subtitle">guess whether articles are hyperlinked within today's article.</p>
          </div>
        </div>
      </header>

      {/* Featured Article Header */}
      <div className="linkquest-featured">
        <div className="linkquest-featured-main">
          {game.featuredArticle.thumbnail && (
            <img 
              src={game.featuredArticle.thumbnail.url} 
              alt={game.featuredArticle.title}
              className="linkquest-featured-image"
            />
          )}
          <div className="linkquest-featured-content">
            <h2 className="linkquest-featured-title">
              {formatTitleForDisplay(game.featuredArticle.title)}
            </h2>
            {game.featuredArticle.leadParagraph && (
              <p className="linkquest-featured-description">
                {game.featuredArticle.leadParagraph}
              </p>
            )}
          </div>
        </div>
        {game.featuredArticle.leadParagraph && (
          <button 
            className="linkquest-read-lead-btn"
            onClick={() => setShowLeadExpanded(!showLeadExpanded)}
            title={showLeadExpanded ? "Collapse" : "Read full lead paragraph"}
            aria-expanded={showLeadExpanded}
          >
            <i className={`fas ${showLeadExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
          </button>
        )}
        <div className={`linkquest-lead-expanded ${showLeadExpanded ? 'expanded' : ''}`}>
          {game.featuredArticle.leadParagraph && (
            <p>{game.featuredArticle.leadParagraph}</p>
          )}
        </div>
      </div>

      {/* Linking Icon */}
      {currentCard && (
        <div className="linkquest-linking-icon">
          {(() => {
            // Check if current card has been answered
            const cardAnswer = gameState.answers[gameState.currentCardIndex];
            if (cardAnswer !== undefined) {
              // Card has been answered - show linked/unlinked icon
              const isLinked = currentCard.isLinked;
              return <i className={`fas ${isLinked ? 'fa-link' : 'fa-unlink'}`}></i>;
            } else {
              // Card not answered yet - show question mark
              return (
                <>
                  <i className="fas fa-link"></i>
                  <span className="linkquest-question-mark">?</span>
                </>
              );
            }
          })()}
        </div>
      )}

      {/* Card Zone */}
      <div className="linkquest-card-zone">
        {/* Card container */}
        <div className="linkquest-card-container">
          {/* Pre-render all remaining cards in stack for fast loading */}
          {!showFeedback && !feedbackRef.current && game && (() => {
            // Generate rotation jitter for each card
            const getRotation = (index: number) => {
              // Use a simple hash function based on index to get consistent but varied rotations
              const seed = index * 7 + gameState.currentCardIndex * 13;
              const rotation = (seed % 15 - 7) * 0.8; // -5.6 to 5.6 degrees
              return rotation;
            };
            
            const remainingCards = game.cards.slice(gameState.currentCardIndex + 1, gameState.currentCardIndex + 11);
            
            return (
              <div className={`linkquest-card-stack ${isShuffling ? 'shuffling' : ''}`}>
                {remainingCards.map((card, i) => {
                  const rotation = getRotation(i);
                  const isNextCard = i === 0 && isSwipingAway;
                  return (
                    <div 
                      key={`${gameState.currentCardIndex + 1 + i}-${card.title}`}
                      className={`linkquest-stack-card ${isNextCard ? 'linkquest-next-card-preview' : ''}`}
                      style={{ 
                        zIndex: isNextCard ? 999 : -1 - i,
                        transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                        opacity: isNextCard ? 1 : 0.6,
                        display: isNextCard ? 'block' : 'none'
                      }}
                    >
                      <div className="linkquest-card-main">
                        {card.thumbnail ? (
                          <img 
                            src={card.thumbnail.url} 
                            alt={card.title}
                            className="linkquest-card-image"
                          />
                        ) : (
                          <div className="linkquest-card-placeholder">
                            <div className="linkquest-skeleton-wikipedia">
                              <div className="skeleton-image"></div>
                              <div className="skeleton-content">
                                <div className="skeleton-line skeleton-title"></div>
                                <div className="skeleton-line skeleton-text"></div>
                                <div className="skeleton-line skeleton-text short"></div>
                              </div>
                            </div>
                          </div>
                        )}
                        <div className="linkquest-card-content">
                          <h3 className="linkquest-card-title">
                            {formatTitleForDisplay(card.title)}
                          </h3>
                          {card.description && (
                            <p className="linkquest-card-subtitle">
                              {decodeHtmlEntities(card.description)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
          
          {(showFeedback || feedbackRef.current) ? (() => {
          const feedback = showFeedback || feedbackRef.current;
          if (!feedback) return null;
          
          return (
            <div className={`linkquest-feedback ${feedback.isLinked ? 'linked' : 'not-linked'}`}>
              {/* First: Large icon + heading */}
              <div className="linkquest-feedback-main-status">
                <div className="linkquest-feedback-icon">
                  <i className={`fas ${feedback.isLinked ? 'fa-link' : 'fa-unlink'}`}></i>
                </div>
                <h3 className="linkquest-feedback-heading">
                  {feedback.isLinked ? 'Linked!' : 'Not linked'}
                </h3>
              </div>
              
              {/* Second: Confirmation subtext */}
              <div className="linkquest-feedback-confirmation">
                {feedback.cardTitle && (feedback.isLinked 
                  ? `The ${formatTitleForDisplay(feedback.cardTitle)} article is currently linked within the ${formatTitleForDisplay(game.featuredArticle.title)} article.`
                  : `The ${formatTitleForDisplay(feedback.cardTitle)} article is not currently linked within the ${formatTitleForDisplay(game.featuredArticle.title)} article!`
                )}
              </div>
              
              {/* Third: Your answer indicator */}
              <div className="linkquest-feedback-answer-status">
                <i className={`fas ${feedback.correct ? 'fa-check' : 'fa-times'}`}></i>
                <span>Your guess was {feedback.correct ? 'correct' : 'incorrect'}</span>
              </div>
              {feedback.linkContext && (() => {
                // Convert all links to spans to prevent navigation, but keep strong highlight for the answered article
                const parser = new DOMParser();
                const doc = parser.parseFromString(feedback.linkContext, 'text/html');
                
                // Convert all links to spans
                const links = doc.querySelectorAll('a');
                links.forEach(link => {
                  const span = doc.createElement('span');
                  span.innerHTML = link.innerHTML;
                  // Copy all attributes except href
                  Array.from(link.attributes).forEach(attr => {
                    if (attr.name !== 'href') {
                      span.setAttribute(attr.name, attr.value);
                    }
                  });
                  // Copy inline styles
                  span.style.cssText = link.style.cssText;
                  // Add class to maintain highlight styling if this was the highlighted link
                  if (link.getAttribute('data-highlight') === 'true') {
                    span.classList.add('linkquest-highlighted-answer');
                  }
                  link.parentNode?.replaceChild(span, link);
                });
                const sanitizedHtml = doc.body.innerHTML;
                
                return (
                  <div className="linkquest-link-context">
                    {feedback.linkSectionHeading ? (
                      <p className="linkquest-context-section">{feedback.linkSectionHeading}</p>
                    ) : (
                      <p className="linkquest-context-section">Article Context</p>
                    )}
                    <div 
                      className="linkquest-context-text"
                      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        return false;
                      }}
                    />
                  </div>
                );
              })()}
              <button 
                className="linkquest-feedback-dismiss"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  
                  const feedbackData = feedbackRef.current || showFeedback;
                  if (!feedbackData) return;
                  
                  const wasComplete = feedbackData.isComplete;
                  
                  // Clear feedback state
                  feedbackRef.current = null;
                  setShowFeedback(null);
                  
                  // Reset card position for next card (if not complete)
                  if (!wasComplete && cardRef.current) {
                    cardRef.current.style.transition = '';
                    cardRef.current.style.transform = '';
                    cardRef.current.style.opacity = '1';
                  }
                  
                  // If game is complete, navigate to results
                  if (wasComplete && game) {
                    // Get the latest game state - try localStorage first, then use current state
                    const latestState = getGameState(dateKeyUTC);
                    const stateToUse = latestState && latestState.isComplete ? latestState : gameState;
                    
                    // Double check the state is actually complete
                    if (stateToUse.isComplete) {
                      const result = calculateResult(game, stateToUse);
                      console.log('Navigating to results with:', { result, game, stateToUse });
                      navigate('/games/linkquest/results', { state: { result, game } });
                    } else {
                      console.warn('Game state not complete:', stateToUse);
                    }
                  }
                }}
              >
                Continue
              </button>
            </div>
          );
        })() : currentCard ? (
          <div
            ref={cardRef}
            className={`linkquest-card ${isShuffling ? 'shuffling' : ''}`}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleMouseDown}
          >
            <div className="linkquest-card-main">
              {currentCard.thumbnail ? (
                <img 
                  src={currentCard.thumbnail.url} 
                  alt={currentCard.title}
                  className="linkquest-card-image"
                />
              ) : (
                <div className="linkquest-card-placeholder">
                  <div className="linkquest-skeleton-wikipedia">
                    <div className="skeleton-image"></div>
                    <div className="skeleton-content">
                      <div className="skeleton-line skeleton-title"></div>
                      <div className="skeleton-line skeleton-text"></div>
                      <div className="skeleton-line skeleton-text short"></div>
                    </div>
                  </div>
                </div>
              )}
              <div className="linkquest-card-content">
                <h3 className="linkquest-card-title">
                  {formatTitleForDisplay(currentCard.title)}
                </h3>
                {currentCard.description && (
                  <p className="linkquest-card-subtitle">
                    {decodeHtmlEntities(currentCard.description)}
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : null}
        </div>
        
        {/* Shuffle and Score below stack */}
        {!showFeedback && game && (
          <div className="linkquest-actions">
            <div className="linkquest-score-tracker">
              {gameState.currentCardIndex}/{game.cards.length} links guessed
            </div>
            <button 
              className="linkquest-action-btn linkquest-shuffle"
              onClick={handleShuffle}
              title="Shuffle remaining cards"
              disabled={isShuffling}
            >
              🔀 Shuffle
            </button>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      {!(showFeedback || feedbackRef.current) && (
        <div className="linkquest-action-buttons">
          <button 
            className="linkquest-action-button linkquest-not-linked-btn"
            onClick={() => handleSwipe(false)}
          >
            <i className="fas fa-unlink"></i> Not Linked
          </button>
          <button 
            className="linkquest-action-button linkquest-linked-btn"
            onClick={() => handleSwipe(true)}
          >
            <i className="fas fa-link"></i> Linked
          </button>
        </div>
      )}
    </div>
  );
};

export default LinkQuestPage;
