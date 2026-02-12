import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RabbitHole } from '../services/rabbitHoleService';
import { generateRabbitHoleImage, downloadRabbitHoleImage } from '../services/rabbitHoleImageGenerator';
import { formatTitleForDisplay, formatTitleForUrl } from '../utils/titleUtils';
import './RabbitHoleVisualization.css';

interface RabbitHoleVisualizationProps {
  rabbitHoles: RabbitHole[];
}

const RabbitHoleVisualization: React.FC<RabbitHoleVisualizationProps> = ({ rabbitHoles }) => {
  const navigate = useNavigate();
  const [generating, setGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [selectedHoleIndex, setSelectedHoleIndex] = useState<number | null>(null);

  const formatDuration = (ms: number): string => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  };

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - timestamp;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const handleArticleClick = (title: string) => {
    navigate(`/article/${formatTitleForUrl(title)}`);
  };

  const handleGenerateImage = async (hole: RabbitHole, index: number) => {
    if (generating) return;
    
    setGenerating(true);
    setSelectedHoleIndex(index);
    
    try {
      const imageDataUrl = await generateRabbitHoleImage(hole);
      setGeneratedImage(imageDataUrl);
    } catch (error) {
      console.error('Error generating image:', error);
      alert('Failed to generate image. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadImage = () => {
    if (!generatedImage || selectedHoleIndex === null) return;
    
    const hole = rabbitHoles[selectedHoleIndex];
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `rabbit-hole-${timestamp}.png`;
    
    downloadRabbitHoleImage(generatedImage, filename);
  };

  const handleClosePreview = () => {
    setGeneratedImage(null);
    setSelectedHoleIndex(null);
  };

  if (rabbitHoles.length === 0) {
    return (
      <div className="rabbit-hole-empty">
        <div className="rabbit-hole-empty-icon">🐰</div>
        <h3>No rabbit holes yet</h3>
        <p>Start reading articles to see your journey visualized here!</p>
      </div>
    );
  }

  return (
    <div className="rabbit-hole-visualization">
      <div className="rabbit-hole-header">
        <h2 className="rabbit-hole-title">Your Recent Rabbit Holes</h2>
        <p className="rabbit-hole-subtitle">
          Visualize your journey through Wikipedia articles
        </p>
      </div>

      <div className="rabbit-holes-list">
        {rabbitHoles.map((hole, holeIndex) => (
          <div key={hole.id} className="rabbit-hole-card">
            <div className="rabbit-hole-card-header">
              <div className="rabbit-hole-meta">
                <span className="rabbit-hole-time">{formatTime(hole.startTime)}</span>
                <span className="rabbit-hole-duration">{formatDuration(hole.duration)}</span>
                <span className="rabbit-hole-count">{hole.entries.length} articles</span>
              </div>
              <button
                className="rabbit-hole-generate-btn"
                onClick={() => handleGenerateImage(hole, holeIndex)}
                disabled={generating}
              >
                {generating && selectedHoleIndex === holeIndex ? (
                  <>
                    <span className="spinner"></span>
                    Generating...
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18px" height="18px">
                      <path d="M19 12h-2v3h-3v2h5v-5zM7 9h3V7H5v5h2V9zm14-6H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM5 19V5h14v14H5z"/>
                    </svg>
                    Generate Image
                  </>
                )}
              </button>
            </div>

            <div className="rabbit-hole-path">
              {hole.entries.map((entry, entryIndex) => {
                const isFirst = entryIndex === 0;
                const isLast = entryIndex === hole.entries.length - 1;
                const hasSource = entry.source && entryIndex > 0;

                return (
                  <React.Fragment key={`${entry.title}-${entry.timestamp}`}>
                    {!isFirst && (
                      <div className="rabbit-hole-connector">
                        <div className="rabbit-hole-line"></div>
                        <div className="rabbit-hole-arrow">↓</div>
                      </div>
                    )}
                    <div
                      className={`rabbit-hole-node ${isFirst ? 'start' : ''} ${isLast ? 'end' : ''}`}
                      onClick={() => handleArticleClick(entry.title)}
                      title={entry.title}
                    >
                      <div className="rabbit-hole-node-content">
                        <div className="rabbit-hole-node-title">
                          {formatTitleForDisplay(entry.title)}
                        </div>
                        {hasSource && (
                          <div className="rabbit-hole-node-source">
                            from {formatTitleForDisplay(entry.source!)}
                          </div>
                        )}
                      </div>
                      {isFirst && (
                        <div className="rabbit-hole-node-badge start-badge">Start</div>
                      )}
                      {isLast && (
                        <div className="rabbit-hole-node-badge end-badge">End</div>
                      )}
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {generatedImage && (
        <div className="rabbit-hole-preview-overlay" onClick={handleClosePreview}>
          <div className="rabbit-hole-preview" onClick={(e) => e.stopPropagation()}>
            <div className="rabbit-hole-preview-header">
              <h3>Generated Image (TikTok Format)</h3>
              <button className="rabbit-hole-preview-close" onClick={handleClosePreview}>
                ×
              </button>
            </div>
            <div className="rabbit-hole-preview-content">
              <img src={generatedImage} alt="Generated rabbit hole visualization" />
            </div>
            <div className="rabbit-hole-preview-footer">
              <button className="rabbit-hole-download-btn" onClick={handleDownloadImage}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20px" height="20px">
                  <path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2z"/>
                </svg>
                Download Image
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RabbitHoleVisualization;
