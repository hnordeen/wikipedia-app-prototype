import React, { useState, useMemo } from 'react';
import { HistoryItem } from '../services/historyService';
import { RabbitHole, RabbitHoleEntry } from '../services/rabbitHoleService';
import { generateRabbitHoleImage, downloadRabbitHoleImage } from '../services/rabbitHoleImageGenerator';
import { formatTitleForDisplay, formatTitleForUrl } from '../utils/titleUtils';
import './ShareSheet.css';

interface ShareSheetProps {
  isOpen: boolean;
  onClose: () => void;
  history: HistoryItem[];
}

const ShareSheet: React.FC<ShareSheetProps> = ({ isOpen, onClose, history }) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);

  // Get recent articles (last 20 for selection)
  const recentArticles = useMemo(() => {
    return history.slice(0, 20);
  }, [history]);

  const toggleSelection = (item: HistoryItem) => {
    const id = `${item.title}-${item.timestamp}`;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    const allIds = new Set(recentArticles.map(item => `${item.title}-${item.timestamp}`));
    setSelectedIds(allIds);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const selectedArticles = useMemo(() => {
    return recentArticles.filter(item => 
      selectedIds.has(`${item.title}-${item.timestamp}`)
    );
  }, [recentArticles, selectedIds]);

  const handleGenerateImage = async () => {
    if (selectedArticles.length === 0 || generating) return;

    setGenerating(true);

    try {
      // Convert selected articles to a RabbitHole format
      const entries: RabbitHoleEntry[] = selectedArticles.map((item, index) => ({
        title: item.title,
        timestamp: item.timestamp,
        source: index > 0 ? selectedArticles[index - 1].title : undefined
      }));

      const rabbitHole: RabbitHole = {
        id: `share-${Date.now()}`,
        entries,
        startTime: entries[0]?.timestamp || Date.now(),
        endTime: entries[entries.length - 1]?.timestamp || Date.now(),
        duration: (entries[entries.length - 1]?.timestamp || Date.now()) - (entries[0]?.timestamp || Date.now())
      };

      // Generate the image
      const imageDataUrl = await generateRabbitHoleImage(rabbitHole);
      const timestamp = new Date().toISOString().slice(0, 10);
      const filename = `rabbit-hole-${timestamp}.png`;
      
      // Try to use Web Share API if available (for mobile sharing)
      if (navigator.share && navigator.canShare) {
        try {
          // Convert data URL to blob for sharing
          const response = await fetch(imageDataUrl);
          const blob = await response.blob();
          const file = new File([blob], filename, { type: 'image/png' });
          
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: 'My Wikipedia Rabbit Hole',
              text: 'Check out my Wikipedia rabbit hole journey!'
            });
            return; // Exit early if share was successful
          }
        } catch (shareError) {
          // If sharing fails or is cancelled, fall through to download
          console.log('Share cancelled or failed, downloading instead');
        }
      }
      
      // Fallback to download
      downloadRabbitHoleImage(imageDataUrl, filename);
    } catch (error) {
      console.error('Error generating image:', error);
      alert('Failed to generate image. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: 'numeric'
    });
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="share-sheet-overlay" onClick={onClose}>
      <div className="share-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="share-sheet-header">
          <h2 className="share-sheet-title">Share Your Rabbit Holes</h2>
          <button className="share-sheet-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="share-sheet-content">
          {recentArticles.length === 0 ? (
            <div className="share-sheet-empty">
              <p>No articles to share yet. Start reading to build your rabbit hole!</p>
            </div>
          ) : (
            <>
              <div className="share-sheet-actions">
                <button 
                  className="share-sheet-action-btn" 
                  onClick={selectAll}
                  disabled={selectedIds.size === recentArticles.length}
                >
                  Select All
                </button>
                <button 
                  className="share-sheet-action-btn" 
                  onClick={clearSelection}
                  disabled={selectedIds.size === 0}
                >
                  Clear
                </button>
                <span className="share-sheet-count">
                  {selectedIds.size} {selectedIds.size === 1 ? 'article' : 'articles'} selected
                </span>
              </div>

              <div className="share-sheet-list">
                {recentArticles.map((item) => {
                  const id = `${item.title}-${item.timestamp}`;
                  const isSelected = selectedIds.has(id);
                  return (
                    <div
                      key={id}
                      className={`share-sheet-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => toggleSelection(item)}
                    >
                      <div className="share-sheet-item-checkbox">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelection(item)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <div className="share-sheet-item-content">
                        <h3 className="share-sheet-item-title">
                          {formatTitleForDisplay(item.title)}
                        </h3>
                        {item.snippet && (
                          <p className="share-sheet-item-snippet">{item.snippet}</p>
                        )}
                        <div className="share-sheet-item-meta">
                          <span>{formatDate(item.timestamp)}</span>
                          <span>•</span>
                          <span>{formatTime(item.timestamp)}</span>
                        </div>
                      </div>
                      {item.thumbnail && (
                        <div className="share-sheet-item-thumbnail">
                          <img
                            src={item.thumbnail.url}
                            alt={item.thumbnail.description || item.title}
                            loading="lazy"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="share-sheet-footer">
                <button
                  className="share-sheet-generate-btn"
                  onClick={handleGenerateImage}
                  disabled={selectedArticles.length === 0 || generating}
                >
                  {generating ? (
                    <>
                      <span className="spinner"></span>
                      Generating...
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20px" height="20px">
                        <path d="M19 12h-2v3h-3v2h5v-5zM7 9h3V7H5v5h2V9zm14-6H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM5 19V5h14v14H5z"/>
                      </svg>
                      Generate Shareable Image
                    </>
                  )}
                </button>
                {selectedArticles.length > 0 && (
                  <p className="share-sheet-footer-note">
                    Creates a TikTok-style image you can download or share to social media
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ShareSheet;
