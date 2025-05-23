import React, { useState, useEffect, useRef, TouchEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getArticleContent, getArticleImages, ArticleImage } from '../api/wikipedia';
import { addToHistory } from '../services/historyService';
import { formatTitleForDisplay, formatTitleForUrl } from '../utils/titleUtils';
import NavBar from '../components/NavBar';
import './ArticlePage.css';

const SWIPE_BACK_THRESHOLD = 75;
const SWIPE_MAX_VERTICAL_THRESHOLD = 50;

const ArticlePage: React.FC = () => {
  const { title } = useParams<{ title: string }>();
  const navigate = useNavigate();
  const [content, setContent] = useState<string>('');
  const [heroImage, setHeroImage] = useState<ArticleImage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const touchStartXRef = useRef<number>(0);
  const touchEndXRef = useRef<number>(0);
  const touchStartYRef = useRef<number>(0);
  const touchEndYRef = useRef<number>(0);
  const isSwipingRef = useRef<boolean>(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [title]);

  const handleBack = () => {
    navigate(-1);
  };

  const handleTouchStart = (e: TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
    isSwipingRef.current = true;
  };

  const handleTouchMove = (e: TouchEvent) => {
    touchEndXRef.current = e.touches[0].clientX;
    touchEndYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = () => {
    if (!isSwipingRef.current || touchStartXRef.current === 0 || touchEndXRef.current === 0) {
      isSwipingRef.current = false;
      return;
    }

    const diffX = touchEndXRef.current - touchStartXRef.current;
    const diffY = touchEndYRef.current - touchStartYRef.current;

    if (diffX > SWIPE_BACK_THRESHOLD && Math.abs(diffY) < SWIPE_MAX_VERTICAL_THRESHOLD) {
      console.log("Swipe back detected!");
      navigate(-1); 
    }
    
    touchStartXRef.current = 0;
    touchEndXRef.current = 0;
    touchStartYRef.current = 0;
    touchEndYRef.current = 0;
    isSwipingRef.current = false;
  };

  useEffect(() => {
    const fetchArticle = async () => {
      if (!title) return;
      
      setLoading(true);
      setError(null);
      setHeroImage(null);
      setContent('');
      
      try {
        const [articleContent, articleImages] = await Promise.all([
          getArticleContent(title),
          getArticleImages(title)
        ]);

        const processedContent = processWikipediaContent(articleContent);
        setContent(processedContent);
        
        if (articleImages.length > 0) {
          setHeroImage(articleImages[0]);
        }

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = articleContent;
        const firstParagraph = tempDiv.querySelector('p')?.textContent || '';
        
        const displayTitle = formatTitleForDisplay(title);
        addToHistory(
          displayTitle,
          firstParagraph,
          articleImages.length > 0 ? articleImages[0] : undefined
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

    tempDiv.querySelectorAll('a').forEach(link => {
      const href = link.getAttribute('href');
      if (href?.startsWith('/wiki/')) {
        const articleTitle = href.replace('/wiki/', '');
        const displayTitle = formatTitleForDisplay(articleTitle);
        link.setAttribute('data-article', articleTitle);
        link.textContent = displayTitle;
        link.removeAttribute('href');
        link.classList.add('wiki-link');
      } else if (href && (href.startsWith('#') || link.getAttribute('rel') === 'nofollow')) {
        // Keep internal anchor links or external nofollow links as they are, or handle differently
        // For now, let them be, or remove them if they cause issues
      } else if (href) {
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');
      }
    });

    tempDiv.querySelectorAll('.mw-editsection').forEach(el => el.remove());
    
    return tempDiv.innerHTML;
  };

  const handleWikiLinkClick = (event: React.MouseEvent) => {
    if (isSwipingRef.current) {
      event.preventDefault();
      return;
    }
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
      <div className="article-page" /*onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}*/>
        <div className="article-loading">Loading article...</div>
        <NavBar />
      </div>
    );
  }

  if (error) {
    return (
      <div className="article-page" /*onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}*/>
        <div className="article-error">{error}</div>
        <NavBar />
      </div>
    );
  }

  return (
    <div className="article-page" /*onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}*/>
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
      <NavBar />
    </div>
  );
};

export default ArticlePage; 