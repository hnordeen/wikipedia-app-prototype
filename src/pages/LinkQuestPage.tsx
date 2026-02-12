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
    skippedIndices: [],
    hintsUsed: 0,
    shuffleCount: 0,
    isComplete: false
  });
  const [showLeadExpanded, setShowLeadExpanded] = useState(false);
  const [showFeedback, setShowFeedback] = useState<{ correct: boolean; linkContext?: string; linkContextTitle?: string; linkSectionHeading?: string; isComplete?: boolean; cardTitle?: string; isLinked?: boolean; answerToCommit?: boolean } | null>(null);
  const feedbackRef = useRef<{ correct: boolean; linkContext?: string; linkContextTitle?: string; linkSectionHeading?: string; isComplete?: boolean; cardTitle?: string; isLinked?: boolean; answerToCommit?: boolean } | null>(null);
  const [isSwipingAway, setIsSwipingAway] = useState(false);
  const [previewNextCard, setPreviewNextCard] = useState<GameCard | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const cardRef = useRef<HTMLDivElement>(null);
  const cardHeightRef = useRef<number | null>(null);
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const cardOffsetX = useRef<number>(0);
  const cardOffsetY = useRef<number>(0);
  const isDraggingRef = useRef<boolean>(false);

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

  // Measure and set consistent card height
  useEffect(() => {
    if (cardRef.current && currentCard && !showFeedback && !isSwipingAway) {
      // Use a small delay to ensure content is rendered
      const timeoutId = setTimeout(() => {
        if (cardRef.current) {
          const card = cardRef.current;
          // Temporarily remove height constraint to measure natural height
          const originalHeight = card.style.height;
          card.style.height = 'auto';
          
          // Measure the natural height
          const naturalHeight = card.offsetHeight;
          
          // If we have a stored height, use the maximum of stored and current
          // This ensures all cards match the tallest card in the session
          if (cardHeightRef.current === null || naturalHeight > cardHeightRef.current) {
            cardHeightRef.current = naturalHeight;
          }
          
          // Set all cards to the same height (tallest card) using CSS variable
          // This applies to both current card and stack cards
          const cardContainer = card.closest('.linkquest-card-container');
          if (cardContainer) {
            (cardContainer as HTMLElement).style.setProperty('--card-height', `${cardHeightRef.current}px`);
          }
          
          // Also set directly on the card
          card.style.height = `${cardHeightRef.current}px`;
        }
      }, 50);
      
      return () => clearTimeout(timeoutId);
    }
  }, [currentCard, showFeedback, isSwipingAway]);
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
    
    // Create new answers array and commit immediately (no feedback screen)
    const newAnswers = [...gameState.answers];
    newAnswers[currentIndex] = isCorrect;
    
    // Remove from skipped indices if it was skipped
    const newSkippedIndices = gameState.skippedIndices.filter(idx => idx !== currentIndex);
    
    // Calculate if this will complete the game (all cards answered, no skipped cards)
    const totalAnswered = newAnswers.filter(a => a !== undefined).length;
    const willBeComplete = totalAnswered >= game.cards.length && newSkippedIndices.length === 0;
    
    // Calculate next index (but don't update state yet - wait for animation)
    let nextIndex = currentIndex + 1;
    if (nextIndex >= game.cards.length && newSkippedIndices.length > 0) {
      // Find the first skipped card that hasn't been answered
      const firstSkipped = newSkippedIndices.find(idx => newAnswers[idx] === undefined);
      if (firstSkipped !== undefined) {
        nextIndex = firstSkipped;
      }
    }
    
    // Animate card away first - keep current card visible during animation
    setIsSwipingAway(true);
    
    if (cardRef.current) {
      // Animate card off screen
      const direction = isLinked ? 1 : -1;
      const screenWidth = window.innerWidth;
      cardRef.current.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
      cardRef.current.style.transform = `translate(${direction * screenWidth}px, 0) rotate(${direction * 30}deg)`;
      cardRef.current.style.opacity = '0';
    }
    
    // Save answer immediately but DON'T update currentCardIndex yet
    const partialState: GameState = {
      ...gameState,
      skippedIndices: newSkippedIndices,
      answers: newAnswers, // Commit answer immediately
      // Keep currentCardIndex the same for now
      isComplete: false // Will be updated after animation
    };
    
    // Save partial state (without card index update)
    saveGameState(dateKeyUTC, partialState);
    
    // After card animation completes, update card index and check if game is complete
    setTimeout(() => {
      setIsSwipingAway(false);
      setPreviewNextCard(null);
      
      // Now update the card index
      const finalState: GameState = {
        ...partialState,
        currentCardIndex: nextIndex,
        isComplete: willBeComplete
      };
      
      setGameState(finalState);
      saveGameState(dateKeyUTC, finalState);
      
      // If game is complete, navigate to results immediately
      if (willBeComplete) {
        const result = calculateResult(game, finalState);
        navigate('/games/linkquest/results', { state: { result, game } });
        return;
      }
      
      // Reset card position for next card
      if (cardRef.current) {
        cardRef.current.style.transition = '';
        cardRef.current.style.transform = '';
        cardRef.current.style.opacity = '1';
      }
    }, 300);
  }, [game, currentCard, gameState, showFeedback, isSwipingAway, dateKeyUTC, navigate]);

  const handleSkip = useCallback(() => {
    if (!game || !currentCard || showFeedback || isSwipingAway) {
      return;
    }
    
    const currentIndex = gameState.currentCardIndex;
    
    // Mark this card as skipped
    const newSkippedIndices = [...gameState.skippedIndices];
    if (!newSkippedIndices.includes(currentIndex)) {
      newSkippedIndices.push(currentIndex);
    }
    
    // Advance to next card
    let nextIndex = currentIndex + 1;
    
    // If we've gone through all cards, loop back to first skipped card that hasn't been answered
    if (nextIndex >= game.cards.length) {
      if (newSkippedIndices.length > 0) {
        // Find the first skipped card that hasn't been answered yet
        const firstSkipped = newSkippedIndices.find(idx => gameState.answers[idx] === undefined);
        if (firstSkipped !== undefined) {
          nextIndex = firstSkipped;
        } else {
          // All skipped cards have been answered, game is complete
          nextIndex = game.cards.length; // Keep at end
        }
      }
    }
    
    // Calculate completion: all cards must be answered (no skipped cards remaining)
    const totalAnswered = gameState.answers.filter(a => a !== undefined).length;
    const willBeComplete = totalAnswered >= game.cards.length && newSkippedIndices.length === 0;
    
    const newState: GameState = {
      ...gameState,
      skippedIndices: newSkippedIndices,
      currentCardIndex: nextIndex,
      isComplete: willBeComplete
    };
    
    setGameState(newState);
    saveGameState(dateKeyUTC, newState);
    
    // If game is complete, navigate to results
    if (willBeComplete && game) {
      setTimeout(() => {
        const result = calculateResult(game, newState);
        navigate('/games/linkquest/results', { state: { result, game } });
      }, 300);
      return;
    }
    
    // Animate card away (simple fade out)
    if (cardRef.current) {
      cardRef.current.style.transition = 'opacity 0.3s ease';
      cardRef.current.style.opacity = '0';
      
      setTimeout(() => {
        if (cardRef.current) {
          cardRef.current.style.transition = '';
          cardRef.current.style.opacity = '1';
        }
      }, 300);
    }
  }, [game, currentCard, gameState, showFeedback, isSwipingAway, dateKeyUTC, navigate]);

  // Touch handlers for swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    if (showFeedback || isSwipingAway || !cardRef.current) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isDraggingRef.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (showFeedback || isSwipingAway || !cardRef.current || !currentCard) return;
    
    const touchX = e.touches[0].clientX;
    const touchY = e.touches[0].clientY;
    const deltaX = touchX - touchStartX.current;
    const deltaY = touchY - touchStartY.current;
    
    if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
      if (!isDraggingRef.current) {
        isDraggingRef.current = true;
        setIsDragging(true);
      }
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
    
    if (Math.abs(cardOffsetX.current) > threshold && isDraggingRef.current) {
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
    isDraggingRef.current = false;
    setIsDragging(false);
  };

  // Mouse handlers for desktop
  const handleMouseMoveGlobal = useCallback((e: MouseEvent) => {
    if (showFeedback || isSwipingAway || !cardRef.current || !currentCard) return;
    
    const deltaX = e.clientX - touchStartX.current;
    const deltaY = e.clientY - touchStartY.current;
    
    if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
      if (!isDraggingRef.current) {
        isDraggingRef.current = true;
        setIsDragging(true);
      }
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
    
    if (Math.abs(cardOffsetX.current) > threshold && isDraggingRef.current) {
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
    isDraggingRef.current = false;
    setIsDragging(false);
    
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
    isDraggingRef.current = false;
    setIsDragging(false);
    
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
        <div className="linkquest-header-content">
          <div>
            <h1 className="linkquest-title">Linked</h1>
            <p className="linkquest-subtitle">Guess whether articles are hyperlinked within today's article.</p>
          </div>
        </div>
        <button className="linkquest-close" onClick={() => navigate('/games')}>
          <i className="fas fa-times"></i>
        </button>
      </header>

      {/* Featured Article Header */}
      <div className="linkquest-featured">
        <div className="linkquest-featured-badge">Featured article</div>
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
          <>
            <button 
              className="linkquest-read-lead-btn"
              onClick={() => setShowLeadExpanded(!showLeadExpanded)}
              title={showLeadExpanded ? "Collapse" : "Read full lead paragraph"}
              aria-expanded={showLeadExpanded}
            >
              <i className={`fas ${showLeadExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
            </button>
            <div className={`linkquest-lead-expanded ${showLeadExpanded ? 'expanded' : ''}`}>
              <p>{game.featuredArticle.leadParagraph}</p>
            </div>
          </>
        )}
      </div>

      {/* Linking Icon */}
      {currentCard && (
        <div className="linkquest-linking-icon">
          {(() => {
            // If feedback is showing, display the answer status
            if (showFeedback || feedbackRef.current) {
              const feedback = showFeedback || feedbackRef.current;
              if (feedback && feedback.isLinked !== undefined) {
                // Show answer status: blue link if linked, red unlink if not linked
                return (
                  <i className={`fas ${feedback.isLinked ? 'fa-link' : 'fa-unlink'} ${feedback.isLinked ? 'linkquest-icon-linked' : 'linkquest-icon-not-linked'}`}></i>
                );
              }
            }
            // Before answering: show grey link icon
            return <i className="fas fa-link linkquest-icon-pending"></i>;
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
              <div className="linkquest-card-stack">
                {remainingCards.map((card, i) => {
                  const rotation = getRotation(i);
                  const isNextCard = i === 0 && (isDragging || isSwipingAway);
                  // Show next card preview while dragging or swiping current card
                  const shouldShow = isNextCard;
                  return (
                    <div 
                      key={`${gameState.currentCardIndex + 1 + i}-${card.title}`}
                      className={`linkquest-stack-card ${isNextCard ? 'linkquest-next-card-preview' : ''}`}
                      style={{ 
                        zIndex: isNextCard ? 999 : -1 - i,
                        transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                        opacity: shouldShow ? 1 : 0.6,
                        display: shouldShow ? 'block' : 'none'
                      }}
                    >
                      <div className="linkquest-card-main">
                        {card.thumbnail && (
                          <img 
                            src={card.thumbnail.url} 
                            alt={card.title}
                            className="linkquest-card-image"
                          />
                        )}
                        <div className="linkquest-card-content">
                          <h3 className="linkquest-card-title">
                            {formatTitleForDisplay(card.title, false)}
                          </h3>
                          {card.description && (
                            <p className="linkquest-card-subtitle">
                              {decodeHtmlEntities(card.description)}
                            </p>
                          )}
                          {!card.thumbnail && card.extract && (
                            <p className="linkquest-card-extract">
                              {decodeHtmlEntities(card.extract)}
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
          
          {(showFeedback && !isSwipingAway) ? (() => {
          const feedback = showFeedback;
          if (!feedback) return null;
          
          return (
            <div className={`linkquest-feedback ${feedback.isLinked ? 'linked' : 'not-linked'}`}>
              {/* First: Heading only (icon removed - shown below featured article) */}
              <div className="linkquest-feedback-main-status">
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
              <div className={`linkquest-feedback-answer-status ${feedback.correct ? 'correct' : 'incorrect'}`}>
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
                  
                  const wasComplete = feedbackData.isComplete ?? false;
                  const answerToCommit = feedbackData.answerToCommit;
                  
                  // Now commit the answer to the game state
                  if (answerToCommit !== undefined && game) {
                    const previousIndex = gameState.currentCardIndex - 1; // The card we just answered
                    const newAnswers = [...gameState.answers];
                    newAnswers[previousIndex] = answerToCommit;
                    
                    const updatedState: GameState = {
                      ...gameState,
                      answers: newAnswers,
                      isComplete: wasComplete
                    };
                    
                    setGameState(updatedState);
                    saveGameState(dateKeyUTC, updatedState);
                  }
                  
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
            className="linkquest-card"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleMouseDown}
          >
            <div className="linkquest-card-main">
              {currentCard.thumbnail && (
                <img 
                  src={currentCard.thumbnail.url} 
                  alt={currentCard.title}
                  className="linkquest-card-image"
                />
              )}
              <div className="linkquest-card-content">
                <h3 className="linkquest-card-title">
                  {formatTitleForDisplay(currentCard.title, false)}
                </h3>
                {currentCard.description && (
                  <p className="linkquest-card-subtitle">
                    {decodeHtmlEntities(currentCard.description)}
                  </p>
                )}
                {!currentCard.thumbnail && currentCard.extract && (
                  <p className="linkquest-card-extract">
                    {decodeHtmlEntities(currentCard.extract)}
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : null}
        </div>
        
        {/* Skip button under card */}
        {currentCard && !showFeedback && !feedbackRef.current && !isSwipingAway && (
          <button 
            className="linkquest-skip-button"
            onClick={handleSkip}
          >
            Skip for now
          </button>
        )}
        
        {/* Score tracker */}
        {!showFeedback && game && (
          <div className="linkquest-actions">
            <div className="linkquest-score-tracker">
              {Array.from({ length: game.cards.length }, (_, i) => {
                const answer = gameState.answers[i];
                if (answer === true) {
                  // Correct answer - green checkmark
                  return (
                    <div key={i} className="linkquest-score-dot linkquest-score-correct">
                      <i className="fas fa-check"></i>
                    </div>
                  );
                } else if (answer === false) {
                  // Incorrect answer - red X
                  return (
                    <div key={i} className="linkquest-score-dot linkquest-score-incorrect">
                      <i className="fas fa-times"></i>
                    </div>
                  );
                } else {
                  // Not answered yet - empty dot
                  return (
                    <div key={i} className="linkquest-score-dot linkquest-score-empty">
                    </div>
                  );
                }
              })}
            </div>
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
