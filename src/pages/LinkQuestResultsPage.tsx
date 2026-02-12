import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { GameResult, DailyGame } from '../services/linkQuestService';
import { formatTitleForDisplay, formatTitleForUrl } from '../utils/titleUtils';
import './LinkQuestResultsPage.css';

const LinkQuestResultsPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [result, setResult] = useState<GameResult | null>(null);
  const [game, setGame] = useState<DailyGame | null>(null);
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    const state = location.state as { result: GameResult; game: DailyGame } | null;
    console.log('Results page - location.state:', state);
    if (state?.result) {
      console.log('Results page - pullQuoteSectionHeading:', state.result.pullQuoteSectionHeading);
    }
    if (state && state.result && state.game) {
      setResult(state.result);
      setGame(state.game);
      
      // Animate score counter
      const targetScore = state.result.score;
      const duration = 1000;
      const steps = 30;
      const increment = targetScore / steps;
      let current = 0;
      
      const timer = setInterval(() => {
        current += increment;
        if (current >= targetScore) {
          setAnimatedScore(targetScore);
          clearInterval(timer);
        } else {
          setAnimatedScore(Math.floor(current));
        }
      }, duration / steps);
      
      return () => clearInterval(timer);
    } else {
      // No state, redirect to game
      console.warn('Results page - no state, redirecting to game');
      navigate('/games/linkquest');
    }
  }, [location, navigate]);

  const handleShare = async () => {
    if (!result || !game) return;
    
    const shareText = `I scored ${result.score}/${result.totalCards} on today's LinkQuest! 🔗\n\nFeatured article: ${game.featuredArticle.title}\n\nPlay daily at [URL]`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'LinkQuest Results',
          text: shareText
        });
      } catch (error) {
        // User cancelled or error
        console.log('Share cancelled');
      }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(shareText);
        alert('Results copied to clipboard!');
      } catch (error) {
        console.error('Failed to copy:', error);
      }
    }
  };

  if (!result || !game) {
    return (
      <div className="linkquest-results-page">
        <div className="linkquest-loading">Loading results...</div>
      </div>
    );
  }

  return (
    <div className="linkquest-results-page">
      <div className="linkquest-results-container">
        {/* Score Summary */}
        <div className="linkquest-score-card">
          <div className="linkquest-score-large">
            {animatedScore}/{result.totalCards}
          </div>
          <div className="linkquest-score-label">Correct Answers</div>
          {result.hintsUsed > 0 && (
            <div className="linkquest-hints-used">
              {result.hintsUsed} hint{result.hintsUsed !== 1 ? 's' : ''} used
            </div>
          )}
        </div>

        {/* Featured Article Context */}
        <div className="linkquest-featured-card">
          <h3 className="linkquest-section-title">Today's Featured Article</h3>
          {game.featuredArticle.thumbnail && (
            <img 
              src={game.featuredArticle.thumbnail.url} 
              alt={game.featuredArticle.title}
              className="linkquest-featured-thumbnail"
            />
          )}
          <h4 className="linkquest-featured-name">
            {formatTitleForDisplay(game.featuredArticle.title)}
          </h4>
          {result.pullQuote && (() => {
            // Debug: log the section heading
            console.log('LinkQuestResultsPage - pullQuoteSectionHeading:', result.pullQuoteSectionHeading);
            console.log('LinkQuestResultsPage - full result object:', result);
            
            // Convert links to spans to prevent navigation, but keep strong highlight for the answered article
            const parser = new DOMParser();
            const doc = parser.parseFromString(result.pullQuote, 'text/html');
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
            
            // Debug: Check what we're getting
            const sectionHeading = result.pullQuoteSectionHeading;
            console.log('Rendering pull quote - sectionHeading:', sectionHeading, 'type:', typeof sectionHeading, 'trimmed:', sectionHeading?.trim());
            
            // Only render section heading if it exists and is not "Article Context"
            const shouldShowHeading = sectionHeading && 
                                     typeof sectionHeading === 'string' && 
                                     sectionHeading.trim().length > 0 &&
                                     sectionHeading.trim().toLowerCase() !== 'article context';
            
            return (
              <div className="linkquest-pull-quote">
                {shouldShowHeading ? (
                  <h4 className="linkquest-pull-quote-section">{sectionHeading.trim()}</h4>
                ) : null}
                <div 
                  className="linkquest-quote-text"
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
        </div>

        {/* Action Buttons */}
        <div className="linkquest-results-actions">
          <button 
            className="linkquest-share-btn"
            onClick={handleShare}
          >
            Share Results
          </button>
          <button 
            className="linkquest-explore-btn"
            onClick={() => navigate('/games/linkquest/explore', { state: { result, game } })}
          >
            Explore Articles
          </button>
        </div>
      </div>
    </div>
  );
};

export default LinkQuestResultsPage;
