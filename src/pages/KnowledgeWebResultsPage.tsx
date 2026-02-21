import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { KnowledgeWebPuzzle, KnowledgeWebGameState, getLinkContextFromFeaturedArticle, getNodeMentionInConnector } from '../services/knowledgeWebService';
import { getArticleContent, getWikipediaPageSummary } from '../api/wikipedia';
import { formatTitleForUrl } from '../utils/titleUtils';
import './KnowledgeWebResultsPage.css';

const KnowledgeWebResultsPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [puzzle, setPuzzle] = useState<KnowledgeWebPuzzle | null>(null);
  const [gameState, setGameState] = useState<KnowledgeWebGameState | null>(null);
  const [featuredArticleContent, setFeaturedArticleContent] = useState<string | null>(null);
  const [featuredExtract, setFeaturedExtract] = useState<string | null>(null);
  const [linkSnippets, setLinkSnippets] = useState<Record<string, { html: string; sectionHeading?: string }>>({});
  const [connectorContexts, setConnectorContexts] = useState<Record<string, { html: string; sectionHeading?: string }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const state = location.state as { puzzle: KnowledgeWebPuzzle; gameState: KnowledgeWebGameState } | null;
    
    if (state && state.puzzle && state.gameState) {
      setPuzzle(state.puzzle);
      setGameState(state.gameState);
      
      // Fetch featured article content and extract
      const loadData = async () => {
        try {
          // Fetch featured article content
          const [content, summary] = await Promise.all([
            getArticleContent(state.puzzle.featured_article.title),
            getWikipediaPageSummary(state.puzzle.featured_article.title)
          ]);
          
          setFeaturedArticleContent(content);
          if (summary?.extract) {
            const paragraphs = summary.extract.split('\n\n').filter(p => p.trim().length > 0);
            const firstFewParagraphs = paragraphs.slice(0, 3).join('\n\n');
            const limitedExtract = firstFewParagraphs.length > 800 
              ? firstFewParagraphs.substring(0, 800).trim() + '...'
              : firstFewParagraphs;
            setFeaturedExtract(limitedExtract);
          }
          
          // Extract snippets for each connecting article from featured article
          const snippets: Record<string, { html: string; sectionHeading?: string }> = {};
          for (const connection of state.puzzle.connections) {
            const snippet = getLinkContextFromFeaturedArticle(content, connection.connectingArticle);
            if (snippet) {
              snippets[connection.connectingArticle] = snippet;
            }
          }
          setLinkSnippets(snippets);
          
          // Fetch connector article contents and find where node articles are mentioned
          const contexts: Record<string, { html: string; sectionHeading?: string }> = {};
          for (const connection of state.puzzle.connections) {
            const surroundingArticle = state.puzzle.surrounding_articles.find(
              a => a.id === connection.surroundingArticleId
            );
            if (surroundingArticle) {
              try {
                console.log(`[ResultsPage] Fetching connector content for: ${connection.connectingArticle}`);
                console.log(`[ResultsPage] Looking for node article: ${surroundingArticle.title}`);
                const connectorContent = await getArticleContent(connection.connectingArticle);
                console.log(`[ResultsPage] Got connector content, length: ${connectorContent.length}`);
                const context = getNodeMentionInConnector(connectorContent, surroundingArticle.title);
                if (context) {
                  console.log(`[ResultsPage] Found context for ${surroundingArticle.title} in ${connection.connectingArticle}`);
                  contexts[connection.connectingArticle] = context;
                } else {
                  console.warn(`[ResultsPage] No context found for ${surroundingArticle.title} in ${connection.connectingArticle}`);
                }
              } catch (error) {
                console.error(`Error fetching context for ${connection.connectingArticle}:`, error);
              }
            }
          }
          setConnectorContexts(contexts);
          
          setLoading(false);
        } catch (error) {
          console.error('Error loading results data:', error);
          setLoading(false);
        }
      };
      
      loadData();
    } else {
      // No state, redirect to game
      navigate('/games/knowledge-web');
    }
  }, [location, navigate]);

  if (loading || !puzzle || !gameState) {
    return (
      <div className="knowledge-web-results-page">
        <div className="knowledge-web-results-loading">Loading results...</div>
      </div>
    );
  }

  // Calculate score and attempts
  const lastSubmission = gameState.submissions[gameState.submissions.length - 1];
  const score = lastSubmission.results.filter(r => r.is_correct).length;
  const totalConnections = 4;
  const attempts = gameState.submissions.length;

  return (
    <div className="knowledge-web-results-page">
      {/* Close Button */}
      <button className="knowledge-web-results-close" onClick={() => navigate('/games')}>
        <i className="fas fa-times"></i>
      </button>

      <div className="knowledge-web-results-container">
        {/* Score Section */}
        <div className="knowledge-web-results-score-section">
          <h2 className="knowledge-web-results-title">Your Results</h2>
          <div className="knowledge-web-results-attempts">
            Completed in {attempts} {attempts === 1 ? 'try' : 'tries'}
          </div>
        </div>

        {/* Connections by Spoke */}
        <div className="knowledge-web-results-spokes">
          {puzzle.connections.map((connection, index) => {
            const surroundingArticle = puzzle.surrounding_articles.find(
              a => a.id === connection.surroundingArticleId
            );
            const result = lastSubmission.results.find(
              r => r.surrounding_article_id === connection.surroundingArticleId
            );
            const isCorrect = result?.is_correct || false;
            
            // Find which try this connection was answered correctly on
            let correctTry: number | null = null;
            for (let i = 0; i < gameState.submissions.length; i++) {
              const submission = gameState.submissions[i];
              const submissionResult = submission.results.find(
                r => r.surrounding_article_id === connection.surroundingArticleId
              );
              if (submissionResult?.is_correct) {
                correctTry = submission.submission_number;
                break;
              }
            }
            
            const snippet = linkSnippets[connection.connectingArticle];
            const context = connectorContexts[connection.connectingArticle];
            
            return (
              <div key={index} className="knowledge-web-results-spoke">
                <div className="knowledge-web-results-spoke-cards">
                  {/* Featured Article Card */}
                  <div 
                    className="knowledge-web-results-spoke-card"
                    onClick={() => navigate(`/article/${formatTitleForUrl(puzzle.featured_article.title)}`)}
                  >
                    {puzzle.featured_article.thumbnail ? (
                      <img 
                        src={puzzle.featured_article.thumbnail} 
                        alt={puzzle.featured_article.title}
                        className="knowledge-web-results-spoke-card-image"
                      />
                    ) : (
                      <div className="knowledge-web-results-spoke-card-no-image">
                        <i className="fas fa-link"></i>
                      </div>
                    )}
                    <div className="knowledge-web-results-spoke-card-title">
                      {puzzle.featured_article.title}
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="knowledge-web-results-spoke-arrow">
                    <i className="fas fa-arrow-right"></i>
                  </div>

                  {/* Connector Article Card */}
                  <div 
                    className="knowledge-web-results-spoke-card"
                    onClick={() => navigate(`/article/${formatTitleForUrl(connection.connectingArticle)}`)}
                  >
                    {connection.thumbnail ? (
                      <img 
                        src={connection.thumbnail} 
                        alt={connection.connectingArticle}
                        className="knowledge-web-results-spoke-card-image"
                      />
                    ) : (
                      <div className="knowledge-web-results-spoke-card-no-image">
                        <i className="fas fa-link"></i>
                      </div>
                    )}
                    <div className="knowledge-web-results-spoke-card-title">
                      {connection.connectingArticle}
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="knowledge-web-results-spoke-arrow">
                    <i className="fas fa-arrow-right"></i>
                  </div>

                  {/* Node Article Card */}
                  {surroundingArticle && (
                    <div 
                      className="knowledge-web-results-spoke-card"
                      onClick={() => navigate(`/article/${formatTitleForUrl(surroundingArticle.title)}`)}
                    >
                      {surroundingArticle.thumbnail ? (
                        <img 
                          src={surroundingArticle.thumbnail} 
                          alt={surroundingArticle.title}
                          className="knowledge-web-results-spoke-card-image"
                        />
                      ) : (
                        <div className="knowledge-web-results-spoke-card-no-image">
                          <i className="fas fa-link"></i>
                        </div>
                      )}
                      <div className="knowledge-web-results-spoke-card-title">
                        {surroundingArticle.title}
                      </div>
                    </div>
                  )}
                </div>

                {/* Try indicator */}
                {correctTry !== null && (
                  <div className="knowledge-web-results-spoke-try">
                    Correct on try {correctTry}
                  </div>
                )}

                {/* Snippets */}
                {(snippet || context) && (
                  <div className="knowledge-web-results-spoke-snippets">
                    {snippet && (
                      <div className="knowledge-web-results-spoke-snippet">
                        <div className="knowledge-web-results-spoke-snippet-label">
                          In {puzzle.featured_article.title}:
                        </div>
                        {snippet.sectionHeading && (
                          <div className="knowledge-web-results-spoke-snippet-section">
                            {snippet.sectionHeading}
                          </div>
                        )}
                        <div 
                          className="knowledge-web-results-spoke-snippet-content"
                          dangerouslySetInnerHTML={{ __html: (() => {
                            // Convert all non-highlighted links to plain text, keep only highlighted link
                            const parser = new DOMParser();
                            const doc = parser.parseFromString(snippet.html, 'text/html');
                            const links = doc.querySelectorAll('a');
                            links.forEach(link => {
                              const isHighlighted = link.getAttribute('data-highlight') === 'true';
                              if (!isHighlighted) {
                                // Convert to span (plain text)
                                const span = doc.createElement('span');
                                span.innerHTML = link.innerHTML;
                                Array.from(link.attributes).forEach(attr => {
                                  if (attr.name !== 'href' && attr.name !== 'data-highlight') {
                                    span.setAttribute(attr.name, attr.value);
                                  }
                                });
                                span.style.cssText = link.style.cssText;
                                link.parentNode?.replaceChild(span, link);
                              }
                            });
                            return doc.body.innerHTML;
                          })() }}
                        />
                      </div>
                    )}
                    {context && surroundingArticle && (
                      <div className="knowledge-web-results-spoke-snippet">
                        <div className="knowledge-web-results-spoke-snippet-label">
                          {connection.connectingArticle} mentions {surroundingArticle.title}:
                        </div>
                        {context.sectionHeading && (
                          <div className="knowledge-web-results-spoke-snippet-section">
                            {context.sectionHeading}
                          </div>
                        )}
                        <div 
                          className="knowledge-web-results-spoke-snippet-content"
                          dangerouslySetInnerHTML={{ __html: (() => {
                            // Convert all non-highlighted links to plain text, keep only highlighted link
                            const parser = new DOMParser();
                            const doc = parser.parseFromString(context.html, 'text/html');
                            const links = doc.querySelectorAll('a');
                            links.forEach(link => {
                              const isHighlighted = link.getAttribute('data-highlight') === 'true';
                              if (!isHighlighted) {
                                // Convert to span (plain text)
                                const span = doc.createElement('span');
                                span.innerHTML = link.innerHTML;
                                Array.from(link.attributes).forEach(attr => {
                                  if (attr.name !== 'href' && attr.name !== 'data-highlight') {
                                    span.setAttribute(attr.name, attr.value);
                                  }
                                });
                                span.style.cssText = link.style.cssText;
                                link.parentNode?.replaceChild(span, link);
                              }
                            });
                            return doc.body.innerHTML;
                          })() }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default KnowledgeWebResultsPage;
