import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { searchWikipedia, SearchResult } from '../api/wikipedia';
import SearchBar from '../components/SearchBar';
import FunFacts from '../components/FunFacts';
import './SearchPage.css';

const SearchPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const query = searchParams.get('q');
    if (query) {
      handleSearch(query);
    }
  }, [searchParams]);

  const handleSearch = async (query: string) => {
    setLoading(true);
    try {
      const searchResults = await searchWikipedia(query);
      setResults(searchResults);
    } catch (error) {
      console.error('Error searching:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="search-page">
      <h1 className="search-title">Search</h1>
      <SearchBar />
      <div className="search-results">
        {loading ? (
          <div className="loading">Searching...</div>
        ) : results.length > 0 ? (
          results.map((result) => (
            <div key={result.pageid} className="search-result">
              <h2>{decodeURIComponent(result.title.replace(/_/g, ' '))}</h2>
              <div 
                className="snippet"
                dangerouslySetInnerHTML={{ __html: result.snippet || '' }}
              />
              {result.images && result.images.length > 0 && (
                <div className="result-images">
                  {result.images.map((image, index) => (
                    <div key={index} className="image-container">
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
          ))
        ) : searchParams.get('q') ? (
          <div className="no-results">No results found</div>
        ) : (
          <FunFacts />
        )}
      </div>
    </div>
  );
};

export default SearchPage; 