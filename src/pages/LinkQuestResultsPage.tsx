import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { GameResult, DailyGame } from '../services/linkQuestService';
import { formatTitleForDisplay, formatTitleForUrl, decodeHtmlEntities } from '../utils/titleUtils';
import { getArticleExtract } from '../api/wikipedia';
import './LinkQuestResultsPage.css';

const LinkQuestResultsPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [result, setResult] = useState<GameResult | null>(null);
  const [game, setGame] = useState<DailyGame | null>(null);
  const [animatedScore, setAnimatedScore] = useState(0);
  const [unlinkedExtracts, setUnlinkedExtracts] = useState<Record<string, string>>({});

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
      
      // Fetch extracts for unlinked articles
      if (state.result.allNotLinkedArticles && state.result.allNotLinkedArticles.length > 0) {
        const fetchExtracts = async () => {
          const extracts: Record<string, string> = {};
          for (const { card } of state.result.allNotLinkedArticles) {
            try {
              const extract = await getArticleExtract(card.title);
              if (extract) {
                extracts[card.title] = extract;
              }
            } catch (error) {
              console.error(`Failed to fetch extract for ${card.title}:`, error);
            }
          }
          setUnlinkedExtracts(extracts);
        };
        fetchExtracts();
      }
      
      return () => clearInterval(timer);
    } else {
      // No state, redirect to game
      console.warn('Results page - no state, redirecting to game');
      navigate('/games/linkquest');
    }
  }, [location, navigate]);

  const handleShare = async () => {
    if (!result || !game) return;
    
    const shareText = `I scored ${result.score}/${result.totalCards} on today's Linked! 🔗\n\nFeatured article: ${game.featuredArticle.title}\n\nPlay daily at [URL]`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Linked Results',
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

  // Build answer map from result data
  const answerMap = new Map<string, boolean>();
  if (result.allLinkedArticles) {
    result.allLinkedArticles.forEach(({ card, wasCorrect }) => {
      answerMap.set(card.title, wasCorrect);
    });
  }
  if (result.allNotLinkedArticles) {
    result.allNotLinkedArticles.forEach(({ card, wasCorrect }) => {
      answerMap.set(card.title, wasCorrect);
    });
  }

  return (
    <div className="linkquest-results-page">
      {/* Close Button */}
      <button className="linkquest-results-close" onClick={() => navigate('/games')}>
        <i className="fas fa-times"></i>
      </button>

      <div className="linkquest-results-container">
        {/* 1. Score Tracker and Share - matching game style */}
        <div className="linkquest-results-score-section">
          <div className="linkquest-results-score-header">
            <h2 className="linkquest-results-title">Your Results</h2>
            <div className="linkquest-results-score-tracker">
              {game.cards.map((card, index) => {
                const wasCorrect = answerMap.get(card.title) ?? false;
                return (
                  <div
                    key={index}
                    className={`linkquest-results-score-dot ${
                      wasCorrect
                        ? 'linkquest-results-score-correct'
                        : 'linkquest-results-score-incorrect'
                    }`}
                  >
                    <i className={`fas ${wasCorrect ? 'fa-check' : 'fa-times'}`}></i>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="linkquest-results-score-text">
            {animatedScore}/{result.totalCards} Correct
          </div>
        </div>

        {/* 3. Today's Featured Article (same format as gameplay screen) */}
        <div className="linkquest-featured-section">
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
          </div>
        </div>

        {/* 4. Linked Articles - Show all with correctness indicators */}
        {result.allLinkedArticles && result.allLinkedArticles.length > 0 && (
          <div className="linkquest-linked-articles-section">
            <h3 className="linkquest-section-title">Linked Articles</h3>
            <div className="linkquest-linked-articles-list">
              {result.allLinkedArticles.map(({ card, wasCorrect }, index) => (
                <div key={index} className="linkquest-linked-article-card">
                  {card.thumbnail && (
                    <img 
                      src={card.thumbnail.url} 
                      alt={card.title}
                      className="linkquest-linked-article-image"
                    />
                  )}
                  <div className="linkquest-linked-article-content">
                    <h4 className="linkquest-linked-article-title">
                      {formatTitleForDisplay(card.title)}
                    </h4>
                    <div className={`linkquest-answer-status ${wasCorrect ? 'correct' : 'incorrect'}`}>
                      <i className={`fas ${wasCorrect ? 'fa-check' : 'fa-times'}`}></i>
                      <span>You got this {wasCorrect ? 'correct' : 'incorrect'}</span>
                    </div>
                    {card.linkContext && (() => {
                      // Convert links to spans, but highlight the answered article
                      const parser = new DOMParser();
                      const doc = parser.parseFromString(card.linkContext, 'text/html');
                      const links = doc.querySelectorAll('a');
                      links.forEach(link => {
                        const span = doc.createElement('span');
                        span.innerHTML = link.innerHTML;
                        Array.from(link.attributes).forEach(attr => {
                          if (attr.name !== 'href') {
                            span.setAttribute(attr.name, attr.value);
                          }
                        });
                        span.style.cssText = link.style.cssText;
                        if (link.getAttribute('data-highlight') === 'true') {
                          span.classList.add('linkquest-highlighted-answer');
                        }
                        link.parentNode?.replaceChild(span, link);
                      });
                      const sanitizedHtml = doc.body.innerHTML;
                      
                      return (
                        <>
                          <div className="linkquest-snippet-source">
                            From the {formatTitleForDisplay(game.featuredArticle.title)} article
                          </div>
                          <div 
                            className="linkquest-linked-article-snippet"
                            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              return false;
                            }}
                          />
                        </>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 5. Unlinked Articles */}
        {result.allNotLinkedArticles && result.allNotLinkedArticles.length > 0 && (
          <div className="linkquest-unlinked-articles-section">
            <h3 className="linkquest-section-title">Not Linked Articles</h3>
            <div className="linkquest-unlinked-articles-list">
              {result.allNotLinkedArticles.map(({ card, wasCorrect }, index) => (
                <div key={index} className="linkquest-unlinked-article-card">
                  {card.thumbnail && (
                    <img 
                      src={card.thumbnail.url} 
                      alt={card.title}
                      className="linkquest-unlinked-article-image"
                    />
                  )}
                  <div className="linkquest-unlinked-article-content">
                    <h4 className="linkquest-unlinked-article-title">
                      {formatTitleForDisplay(card.title)}
                    </h4>
                    <div className={`linkquest-answer-status ${wasCorrect ? 'correct' : 'incorrect'}`}>
                      <i className={`fas ${wasCorrect ? 'fa-check' : 'fa-times'}`}></i>
                      <span>You got this {wasCorrect ? 'correct' : 'incorrect'}</span>
                    </div>
                    {unlinkedExtracts[card.title] ? (
                      <p className="linkquest-unlinked-article-snippet">
                        {unlinkedExtracts[card.title]}
                      </p>
                    ) : card.description ? (
                      <p className="linkquest-unlinked-article-snippet">
                        {decodeHtmlEntities(card.description)}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LinkQuestResultsPage;
