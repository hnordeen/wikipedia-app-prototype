import React from 'react';
import { SearchResult } from '../api/wikipedia';
import './SearchResultsDropdown.css';

interface SearchResultsDropdownProps {
  results: SearchResult[];
  onResultClick: (title: string) => void;
  isLoading: boolean;
}

const SearchResultsDropdown: React.FC<SearchResultsDropdownProps> = ({
  results,
  onResultClick,
  isLoading
}) => {
  if (!results.length && !isLoading) return null;

  return (
    <div className="search-dropdown">
      {isLoading ? (
        <div className="dropdown-loading">Searching...</div>
      ) : (
        results.map((result) => (
          <div
            key={result.pageid}
            className="dropdown-result"
            onClick={() => onResultClick(result.title)}
          >
            <div className="dropdown-content">
              <h4>{decodeURIComponent(result.title.replace(/_/g, ' '))}</h4>
              <div 
                className="dropdown-snippet"
                dangerouslySetInnerHTML={{ __html: result.snippet || '' }}
              />
            </div>
            {result.imagesLoading ? (
              <div className="dropdown-images-loading">
                <div className="image-skeleton"></div>
                <div className="image-skeleton"></div>
                <div className="image-skeleton"></div>
                <div className="image-skeleton"></div>
              </div>
            ) : result.images && result.images.length > 0 ? (
              <div className="dropdown-images">
                {result.images.map((image, index) => (
                  <div key={index} className="dropdown-image-container">
                    <img
                      src={image.url}
                      alt={image.description || result.title}
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
};

export default SearchResultsDropdown; 