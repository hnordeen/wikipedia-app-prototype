import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { GameResult, DailyGame } from '../services/linkQuestService';
import { formatTitleForDisplay, formatTitleForUrl } from '../utils/titleUtils';
import './LinkQuestExplorePage.css';

// Calculate time until next game
function getTimeUntilNextGame(): string {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  
  const diff = tomorrow.getTime() - now.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

const LinkQuestExplorePage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [result, setResult] = useState<GameResult | null>(null);
  const [game, setGame] = useState<DailyGame | null>(null);
  const [streak, setStreak] = useState(0);
  const [countdown, setCountdown] = useState('');

  useEffect(() => {
    const state = location.state as { result: GameResult; game: DailyGame } | null;
    if (state) {
      setResult(state.result);
      setGame(state.game);
    } else {
      navigate('/games/linkquest');
    }
    
    // Get streak
    try {
      const stored = localStorage.getItem('linkQuest_streak');
      setStreak(stored ? parseInt(stored, 10) : 0);
    } catch {
      setStreak(0);
    }
    
    // Update countdown
    const updateCountdown = () => {
      setCountdown(getTimeUntilNextGame());
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    
    return () => clearInterval(interval);
  }, [location, navigate]);

  const handleArticleClick = (title: string) => {
    navigate(`/article/${formatTitleForUrl(title)}`);
  };

  if (!result || !game) {
    return (
      <div className="linkquest-explore-page">
        <div className="linkquest-loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="linkquest-explore-page">
      {/* Sticky Score Module */}
      <div className="linkquest-sticky-module">
        <div className="linkquest-sticky-score">
          <div className="linkquest-sticky-label">Today's Score</div>
          <div className="linkquest-sticky-value">{result.score}/{result.totalCards}</div>
        </div>
        <div className="linkquest-sticky-countdown">
          <div className="linkquest-sticky-label">Next game in</div>
          <div className="linkquest-sticky-time">{countdown}</div>
        </div>
        {streak > 0 && (
          <div className="linkquest-sticky-streak">
            🔥 {streak} day streak
          </div>
        )}
      </div>

      {/* Featured Article Section */}
      <section className="linkquest-explore-section">
        <h2 className="linkquest-section-header">Featured Article</h2>
        <div 
          className="linkquest-article-card linkquest-featured-article-card"
          onClick={() => handleArticleClick(game.featuredArticle.title)}
        >
          {game.featuredArticle.thumbnail && (
            <img 
              src={game.featuredArticle.thumbnail.url} 
              alt={game.featuredArticle.title}
              className="linkquest-article-image"
            />
          )}
          <div className="linkquest-article-content">
            <h3 className="linkquest-article-title">
              {formatTitleForDisplay(game.featuredArticle.title)}
            </h3>
            <p className="linkquest-article-lead">
              {game.featuredArticle.leadParagraph}
            </p>
            <button className="linkquest-read-button">Read Full Article →</button>
          </div>
        </div>
      </section>

      {/* Linked Articles Section */}
      {result.linkedArticles.length > 0 && (
        <section className="linkquest-explore-section">
          <h2 className="linkquest-section-header">
            Articles Linked in Today's Featured Article
          </h2>
          <div className="linkquest-articles-grid">
            {result.linkedArticles.map((card, index) => (
              <div
                key={`linked-${index}`}
                className="linkquest-article-card"
                onClick={() => handleArticleClick(card.title)}
              >
                {card.thumbnail && (
                  <img 
                    src={card.thumbnail.url} 
                    alt={card.title}
                    className="linkquest-article-image"
                  />
                )}
                <div className="linkquest-article-content">
                  <h3 className="linkquest-article-title">
                    {formatTitleForDisplay(card.title)}
                  </h3>
                  {card.description && (
                    <p className="linkquest-article-description">
                      {card.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Not Linked Articles Section */}
      {result.notLinkedArticles.length > 0 && (
        <section className="linkquest-explore-section">
          <h2 className="linkquest-section-header">Articles Not Linked</h2>
          <div className="linkquest-articles-grid">
            {result.notLinkedArticles.map((card, index) => (
              <div
                key={`notlinked-${index}`}
                className="linkquest-article-card linkquest-not-linked"
                onClick={() => handleArticleClick(card.title)}
              >
                {card.thumbnail && (
                  <img 
                    src={card.thumbnail.url} 
                    alt={card.title}
                    className="linkquest-article-image"
                  />
                )}
                <div className="linkquest-article-content">
                  <h3 className="linkquest-article-title">
                    {formatTitleForDisplay(card.title)}
                  </h3>
                  {card.description && (
                    <p className="linkquest-article-description">
                      {card.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default LinkQuestExplorePage;
