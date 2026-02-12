import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getGameState, getUtcDateKey, generateDailyGame, calculateResult } from '../services/linkQuestService';
import './GamesPage.css';

const GamesPage: React.FC = () => {
  const navigate = useNavigate();
  const [isGameComplete, setIsGameComplete] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);

  useEffect(() => {
    const checkGameStatus = () => {
      const dateKeyUTC = getUtcDateKey();
      const gameState = getGameState(dateKeyUTC);
      
      // Check if game has been played (has any answers or has been started)
      const hasStarted = gameState && (
        gameState.answers.length > 0 || 
        gameState.currentCardIndex > 0 ||
        gameState.isComplete
      );
      setHasPlayed(hasStarted || false);
      
      if (gameState && gameState.isComplete) {
        setIsGameComplete(true);
      } else {
        setIsGameComplete(false);
      }
    };

    checkGameStatus();
  }, []);

  const handleResetLinkQuest = () => {
    // Clear game state for today
    const dateKeyUTC = getUtcDateKey();
    
    try {
      localStorage.removeItem(`linkQuest_gameState_${dateKeyUTC}`);
      setIsGameComplete(false);
      setHasPlayed(false);
      // Navigate to game
      navigate('/games/linkquest');
    } catch (error) {
      console.error('Error resetting game:', error);
      navigate('/games/linkquest');
    }
  };

  const handlePlayOrViewResults = async () => {
    if (isGameComplete) {
      // Generate game data for results page when user clicks
      try {
        const dateKeyUTC = getUtcDateKey();
        const gameState = getGameState(dateKeyUTC);
        if (gameState && gameState.isComplete) {
          const dailyGame = await generateDailyGame();
          if (dailyGame) {
            const result = calculateResult(dailyGame, gameState);
            navigate('/games/linkquest/results', { state: { result, game: dailyGame } });
            return;
          }
        }
      } catch (error) {
        console.error('Error generating game data:', error);
        // Fallback: just navigate to game
        navigate('/games/linkquest');
        return;
      }
    }
    // Navigate to game
    navigate('/games/linkquest');
  };

  return (
    <div className="games-page">
      <header className="games-header">
        <h1 className="games-title">Games</h1>
        <p className="games-subtitle">
          Experimental ways to explore Wikipedia through play.
        </p>
      </header>

      <section className="games-grid">
        <article className="game-card">
          <div className="game-card-header">
            <h2 className="game-card-title">
              <i className="fas fa-link"></i> Linked
            </h2>
            <span className="game-badge">Daily</span>
          </div>
          <p className="game-card-description">
            Swipe to guess which articles are linked in today's featured Wikipedia article. Test your knowledge or learn something new!
          </p>
          <div className="game-card-actions">
            <button
              className="game-card-button game-card-button-primary"
              onClick={handlePlayOrViewResults}
            >
              {isGameComplete ? 'Admire results' : 'Play'}
            </button>
            {hasPlayed && (
              <button
                className="game-card-button game-card-button-secondary"
                onClick={handleResetLinkQuest}
              >
                Reset / Play Again
              </button>
            )}
          </div>
        </article>
      </section>
    </div>
  );
};

export default GamesPage;

