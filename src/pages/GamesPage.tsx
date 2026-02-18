import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getGameState, getUtcDateKey, generateDailyGame, calculateResult } from '../services/linkQuestService';
import { getKnowledgeWebGameState, getUtcDateKey as getKnowledgeWebUtcDateKey } from '../services/knowledgeWebService';
import './GamesPage.css';

const GamesPage: React.FC = () => {
  const navigate = useNavigate();
  const [isLinkQuestComplete, setIsLinkQuestComplete] = useState(false);
  const [hasPlayedLinkQuest, setHasPlayedLinkQuest] = useState(false);
  const [isKnowledgeWebComplete, setIsKnowledgeWebComplete] = useState(false);
  const [hasPlayedKnowledgeWeb, setHasPlayedKnowledgeWeb] = useState(false);

  useEffect(() => {
    const checkGameStatus = () => {
      // Check LinkQuest status
      const dateKeyUTC = getUtcDateKey();
      const linkQuestState = getGameState(dateKeyUTC);
      
      const hasStartedLinkQuest = linkQuestState && (
        linkQuestState.answers.length > 0 || 
        linkQuestState.currentCardIndex > 0 ||
        linkQuestState.isComplete
      );
      setHasPlayedLinkQuest(hasStartedLinkQuest || false);
      
      if (linkQuestState && linkQuestState.isComplete) {
        setIsLinkQuestComplete(true);
      } else {
        setIsLinkQuestComplete(false);
      }

      // Check Knowledge Web status
      const knowledgeWebDateKey = getKnowledgeWebUtcDateKey();
      const knowledgeWebState = getKnowledgeWebGameState(knowledgeWebDateKey);
      
      const hasStartedKnowledgeWeb = knowledgeWebState && (
        knowledgeWebState.current_connections.some(conn => conn.connecting_article !== null) ||
        knowledgeWebState.submissions.length > 0 ||
        knowledgeWebState.is_complete
      );
      setHasPlayedKnowledgeWeb(hasStartedKnowledgeWeb || false);
      
      if (knowledgeWebState && knowledgeWebState.is_complete) {
        setIsKnowledgeWebComplete(true);
      } else {
        setIsKnowledgeWebComplete(false);
      }
    };

    checkGameStatus();
  }, []);

  const handleResetLinkQuest = () => {
    // Clear game state for today
    const dateKeyUTC = getUtcDateKey();
    
    try {
      localStorage.removeItem(`linkQuest_gameState_${dateKeyUTC}`);
      setIsLinkQuestComplete(false);
      setHasPlayedLinkQuest(false);
      // Navigate to game
      navigate('/games/linkquest');
    } catch (error) {
      console.error('Error resetting game:', error);
      navigate('/games/linkquest');
    }
  };

  const handlePlayOrViewResults = async () => {
    if (isLinkQuestComplete) {
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

  const handleResetKnowledgeWeb = () => {
    // Clear game state for today
    const dateKeyUTC = getKnowledgeWebUtcDateKey();
    
    try {
      localStorage.removeItem(`knowledgeWeb_gameState_${dateKeyUTC}`);
      setIsKnowledgeWebComplete(false);
      setHasPlayedKnowledgeWeb(false);
      // Navigate to game
      navigate('/games/knowledge-web');
    } catch (error) {
      console.error('Error resetting knowledge web game:', error);
      navigate('/games/knowledge-web');
    }
  };

  const handlePlayOrViewKnowledgeWeb = () => {
    if (isKnowledgeWebComplete) {
      // Navigate to results if complete (results page not implemented yet, so just go to game)
      navigate('/games/knowledge-web');
    } else {
      navigate('/games/knowledge-web');
    }
  };

  return (
    <div className="games-page">
      <div className="title-container">
        <img src="https://upload.wikimedia.org/wikipedia/commons/1/10/Wikipedia-W-bold-in-square.svg" alt="Wikipedia Logo" className="page-logo" />
        <h1 className="page-title">Games</h1>
      </div>
      <p className="games-subtitle">
        Experimental ways to explore Wikipedia through play.
      </p>

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
              {isLinkQuestComplete ? 'Admire results' : 'Play'}
            </button>
            {hasPlayedLinkQuest && (
              <button
                className="game-card-button game-card-button-secondary"
                onClick={handleResetLinkQuest}
              >
                Reset / Play Again
              </button>
            )}
          </div>
        </article>

        <article className="game-card game-card-knowledge-web">
          <div className="game-card-header">
            <h2 className="game-card-title">
              <i className="fas fa-project-diagram"></i> Knowledge Web
            </h2>
            <span className="game-badge">Daily</span>
          </div>
          <p className="game-card-description">
            Complete the knowledge web by matching articles to fill in the missing connections between today's featured article and related topics.
          </p>
          <div className="game-card-actions">
            <button
              className="game-card-button game-card-button-primary"
              onClick={handlePlayOrViewKnowledgeWeb}
            >
              {isKnowledgeWebComplete ? 'View Results' : 'Play'}
            </button>
            {hasPlayedKnowledgeWeb && (
              <button
                className="game-card-button game-card-button-secondary"
                onClick={handleResetKnowledgeWeb}
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

