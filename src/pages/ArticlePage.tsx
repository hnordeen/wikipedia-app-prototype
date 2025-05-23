import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getArticleContent, getArticleImages, ArticleImage } from '../api/wikipedia';
import { addToHistory } from '../services/historyService';
import { formatTitleForDisplay, formatTitleForUrl } from '../utils/titleUtils';
import './ArticlePage.css';

const ArticlePage: React.FC = () => {
  const { title } = useParams<{ title: string }>();
  const navigate = useNavigate();
  const [content, setContent] = useState<string>('');
  const [heroImage, setHeroImage] = useState<ArticleImage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleBack = () => {
    navigate(-1);
  };

  useEffect(() => {
    const fetchArticle = async () => {
      if (!title) return;
      
      setLoading(true);
      setError(null);
      
      try {
        const [articleContent, articleImages] = await Promise.all([
          getArticleContent(title),
          getArticleImages(title)
        ]);

        // Process the HTML content to handle internal links
        const processedContent = processWikipediaContent(articleContent);
        setContent(processedContent);
        
        if (articleImages.length > 0) {
          setHeroImage(articleImages[0]);
        }

        // Add to history when successfully loaded
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = articleContent;
        const firstParagraph = tempDiv.querySelector('p')?.textContent || '';
        
        // Store the decoded title in history
        const displayTitle = formatTitleForDisplay(title);
        addToHistory(
          displayTitle,
          firstParagraph,
          articleImages[0]
        );
      } catch (err) {
        setError('Failed to load article');
        console.error('Error loading article:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchArticle();
  }, [title]);

  const processWikipediaContent = (htmlContent: string): string => {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;

    // Process internal links
    tempDiv.querySelectorAll('a').forEach(link => {
      const href = link.getAttribute('href');
      if (href?.startsWith('/wiki/')) {
        const articleTitle = href.replace('/wiki/', '');
        // Store the decoded title as the data attribute and update link text
        const displayTitle = formatTitleForDisplay(articleTitle);
        link.setAttribute('data-article', articleTitle);
        link.textContent = displayTitle; // Update the visible text
        link.removeAttribute('href');
        link.classList.add('wiki-link');
      }
    });

    // Remove edit links and other Wikipedia UI elements
    tempDiv.querySelectorAll('.mw-editsection').forEach(el => el.remove());
    
    return tempDiv.innerHTML;
  };

  const handleWikiLinkClick = (event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    const wikiLink = target.closest('.wiki-link');
    if (wikiLink) {
      const articleTitle = wikiLink.getAttribute('data-article');
      if (articleTitle) {
        navigate(`/article/${formatTitleForUrl(articleTitle)}`);
      }
    }
  };

  if (loading) {
    return (
      <div className="article-page">
        <div className="article-loading">Loading article...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="article-page">
        <div className="article-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="article-page">
      <button className="back-button" onClick={handleBack}>
        <svg viewBox="0 0 24 24" className="back-icon">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" fill="currentColor"/>
        </svg>
        Back
      </button>
      {heroImage ? (
        <div className="article-hero">
          <div className="hero-image-container">
            <img
              src={heroImage.url}
              alt={heroImage.description || 'Article hero image'}
              loading="eager"
            />
            <div className="hero-overlay">
              <h1 className="article-title">{formatTitleForDisplay(title || '')}</h1>
            </div>
          </div>
        </div>
      ) : (
        <div className="article-hero no-image">
          <h1 className="article-title">{formatTitleForDisplay(title || '')}</h1>
        </div>
      )}

      <article 
        className="article-content"
        onClick={handleWikiLinkClick}
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </div>
  );
};

export default ArticlePage; 