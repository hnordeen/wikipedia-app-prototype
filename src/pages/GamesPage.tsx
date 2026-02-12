import React from 'react';
import { useNavigate } from 'react-router-dom';
import './GamesPage.css';

const GamesPage: React.FC = () => {
  const navigate = useNavigate();

  const handleResetLinkQuest = () => {
    // Clear game state for today
    const dateKeyUTC = (() => {
      const d = new Date();
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    })();
    
    try {
      localStorage.removeItem(`linkQuest_gameState_${dateKeyUTC}`);
      // Navigate to game
      navigate('/games/linkquest');
    } catch (error) {
      console.error('Error resetting game:', error);
      navigate('/games/linkquest');
    }
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
            <h2 className="game-card-title">LinkQuest</h2>
            <span className="game-badge">Daily</span>
          </div>
          <p className="game-card-description">
            Swipe to guess which articles are linked in today's featured Wikipedia article. Test your knowledge and build your streak!
          </p>
          <div className="game-card-actions">
            <button
              className="game-card-button game-card-button-primary"
              onClick={() => navigate('/games/linkquest')}
            >
              Play
            </button>
            <button
              className="game-card-button game-card-button-secondary"
              onClick={handleResetLinkQuest}
            >
              Reset / Play Again
            </button>
          </div>
        </article>
      </section>
    </div>
  );
};

export default GamesPage;

