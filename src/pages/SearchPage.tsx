import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { searchWikipedia, SearchResult, getDidYouKnowFacts, DidYouKnowEntry, getArticleImages, getArticleExtract } from '../api/wikipedia';
import SearchBar from '../components/SearchBar';
import { getPreloadedDykData, initiateDykPreload } from '../services/preloadService';
import './SearchPage.css';

interface DykFactWithArticle extends DidYouKnowEntry {
  articleDetails?: SearchResult;
  loadingArticle?: boolean;
}

// Helper function to shuffle an array (Fisher-Yates shuffle)
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

const SearchPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const [didYouKnowFacts, setDidYouKnowFacts] = useState<DykFactWithArticle[]>([]);
  const [loadingDyk, setLoadingDyk] = useState(true); 
  const [errorDyk, setErrorDyk] = useState<string | null>(null);
  const fetchedDykRef = useRef(false);

  useEffect(() => {
    const query = searchParams.get('q');
    if (query) {
      handleSearch(query);
    } else {
      setResults([]); 
      const { facts: preloadedFacts, isLoading: isPreloadLoading, error: preloadError } = getPreloadedDykData();

      if (preloadedFacts && preloadedFacts.length > 0) {
        console.log("SEARCH_PAGE: Using preloaded DYK facts.", preloadedFacts);
        const selectedFactsEntries = shuffleArray(preloadedFacts).slice(0, 2);
        const factsWithLoadingState: DykFactWithArticle[] = selectedFactsEntries.map(factEntry => ({
          ...factEntry,
          loadingArticle: !!factEntry.linkedArticleTitle,
        }));
        setDidYouKnowFacts(factsWithLoadingState);
        setLoadingDyk(false);
        fetchedDykRef.current = true;
        fetchArticleDetailsForDyk(factsWithLoadingState); 
      } else if (isPreloadLoading) {
        console.log("SEARCH_PAGE: DYK preload in progress, waiting...");
        setLoadingDyk(true); 
        const dykPromise = getDidYouKnowFacts(8);
        if (dykPromise) {
            dykPromise.then(freshFacts => {
                if (!fetchedDykRef.current) {
                    console.log("SEARCH_PAGE: Preload was slow, fetched DYK directly after waiting.");
                    processAndSetDykFacts(freshFacts);
                }
            }).catch(err => {
                if (!fetchedDykRef.current) {
                    console.error('SEARCH_PAGE: Error fetching DYK after waiting for slow preload:', err);
                    setErrorDyk("Failed to load 'Did you know...' facts.");
                    setLoadingDyk(false);
                }
            });
        } else {
            initiateDykPreload();
        }
      } else if (preloadError || (preloadedFacts && preloadedFacts.length === 0)) {
        console.log("SEARCH_PAGE: Preload finished with error or no facts. Attempting direct fetch.", preloadError);
        if (!fetchedDykRef.current) directFetchDykData();
      } else if (!fetchedDykRef.current) {
          directFetchDykData();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const processAndSetDykFacts = (factsEntries: DidYouKnowEntry[]) => {
    if (factsEntries.length === 0) {
      console.log("SEARCH_PAGE: No DYK facts returned from API/processing.");
      setDidYouKnowFacts([]);
    } else {
      const selectedFactsEntries = shuffleArray(factsEntries).slice(0, 2);
      if (selectedFactsEntries.length === 0) {
        console.log("SEARCH_PAGE: No DYK facts selected after shuffle.");
        setDidYouKnowFacts([]);
      } else {
        const factsWithLoadingState: DykFactWithArticle[] = selectedFactsEntries.map(factEntry => ({
          ...factEntry,
          loadingArticle: !!factEntry.linkedArticleTitle,
        }));
        setDidYouKnowFacts(factsWithLoadingState);
        fetchArticleDetailsForDyk(factsWithLoadingState);
      }
    }
    setLoadingDyk(false);
    fetchedDykRef.current = true;
  };

  const fetchArticleDetailsForDyk = (factsToProcess: DykFactWithArticle[]) => {
    factsToProcess.forEach(async (factWithLoading) => {
      if (factWithLoading.linkedArticleTitle) {
        try {
          const articleTitle = factWithLoading.linkedArticleTitle;
          const [images, snippetText] = await Promise.all([
            getArticleImages(articleTitle.replace(/ /g, '_')),
            getArticleExtract(articleTitle)
          ]);
          
          const articleDetail: SearchResult = {
              title: articleTitle,
              pageid: 0, 
              snippet: snippetText === null ? undefined : snippetText,
              images: images.slice(0,1), 
              imagesLoading: false,
          };

          setDidYouKnowFacts(prevFacts => {
            const currentFacts = [...prevFacts];
            const factIndexToUpdate = currentFacts.findIndex(f => f.fact === factWithLoading.fact && f.linkedArticleTitle === factWithLoading.linkedArticleTitle);
            if (factIndexToUpdate !== -1) {
                currentFacts[factIndexToUpdate] = {
                    ...currentFacts[factIndexToUpdate],
                    articleDetails: articleDetail,
                    loadingArticle: false,
                };
                return currentFacts;
            }
            return prevFacts;
          });
        } catch (articleError) {
          console.error(`Error fetching details for DYK linked article ${factWithLoading.linkedArticleTitle}:`, articleError);
          setDidYouKnowFacts(prevFacts => {
            const currentFacts = [...prevFacts];
            const factIndexToUpdate = currentFacts.findIndex(f => f.fact === factWithLoading.fact && f.linkedArticleTitle === factWithLoading.linkedArticleTitle);
            if (factIndexToUpdate !== -1) {
                currentFacts[factIndexToUpdate] = { ...currentFacts[factIndexToUpdate], loadingArticle: false, articleDetails: undefined };
                return currentFacts;
            }
            return prevFacts;
          });
        }
      }
    });
  };

  const directFetchDykData = async () => {
    if (fetchedDykRef.current) return;
    console.log("SEARCH_PAGE: No query, performing direct fetch for DYK facts.");
    setLoadingDyk(true);
    setErrorDyk(null);
    try {
      const allFactsEntries = await getDidYouKnowFacts(8);
      processAndSetDykFacts(allFactsEntries);
    } catch (err) {
      console.error('Error fetching Did You Know facts directly:', err);
      setErrorDyk("Failed to load 'Did you know...' facts.");
      setDidYouKnowFacts([]);
    } finally {
      setLoadingDyk(false);
    }
  };

  const handleSearch = async (query: string) => {
    setLoading(true);
    setDidYouKnowFacts([]); 
    fetchedDykRef.current = false;
    try {
      const searchResults = await searchWikipedia(query);
      setResults(searchResults);
    } catch (error) {
      console.error('Error searching:', error);
      setResults([]); 
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="search-page">
      <div className="title-container">
        <img src="https://upload.wikimedia.org/wikipedia/commons/1/10/Wikipedia-W-bold-in-square.svg" alt="Wikipedia Logo" className="page-logo" />
        <h1 className="page-title">Search</h1>
      </div>
      <SearchBar />
      <div className="search-results">
        {loading ? (
          <div className="loading">Searching...</div>
        ) : results.length > 0 ? (
          results.map((result) => {
            const articleLink = `/article/${encodeURIComponent(result.title.replace(/ /g, '_'))}`;

            return (
              <div key={result.pageid || result.title} className="search-result">
                <h2><Link to={articleLink}>{result.title}</Link></h2>
                <div 
                  className="snippet"
                  dangerouslySetInnerHTML={{ __html: result.snippet || '' }}
                />
                {result.images && result.images.length > 0 && (
                  <div className="result-images">
                    {result.images.map((image, index_image) => (
                      <div key={index_image} className="image-container">
                        <img
                          src={image.url}
                          alt={image.description || result.title}
                          loading="lazy"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        ) : searchParams.get('q') ? (
          <div className="no-results">No results found for "{searchParams.get('q')}".</div>
        ) : (
          <div className="did-you-know-cards-container">
            {loadingDyk && <div className="loading">Loading interesting facts...</div>}
            {errorDyk && <div className="error-message">{errorDyk}</div>}
            {!loadingDyk && !errorDyk && didYouKnowFacts.length > 0 && (
              didYouKnowFacts.map((entry, index_entry) => (
                <div key={index_entry} className="dyk-individual-card">
                  <h4 className="dyk-card-title">Did you know...</h4>
                  <p className="dyk-fact-text">{entry.fact}</p>
                  {entry.loadingArticle && <div className="loading-article-dyk">Loading article details...</div>}
                  {entry.articleDetails && (
                    <Link to={`/article/${encodeURIComponent(entry.articleDetails.title.replace(/ /g, '_'))}`} className="dyk-article-card">
                      {entry.articleDetails.images && entry.articleDetails.images.length > 0 && (
                        <img src={entry.articleDetails.images[0].url} alt={entry.articleDetails.title} className="dyk-article-image" />
                      )}
                      <div className="dyk-article-info">
                        <h4>{entry.articleDetails.title}</h4>
                        {entry.articleDetails.snippet && <p className="dyk-article-snippet">{entry.articleDetails.snippet}</p>}
                      </div>
                    </Link>
                  )}
                </div>
              ))
            )}
            {!loadingDyk && !errorDyk && didYouKnowFacts.length === 0 && !searchParams.get('q') && (
              <div className="no-facts">No new facts found right now. Try exploring or searching!</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchPage; 