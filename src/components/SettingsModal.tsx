import React from 'react';
import './SettingsModal.css';

export interface FeedSettings {
  personalized: boolean;
  trending: boolean;
  random: boolean;
}

interface SettingsModalProps {
  isOpen: boolean;
  settings: FeedSettings;
  onSettingsChange: (newSettings: FeedSettings) => void;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  settings,
  onSettingsChange,
  onClose,
}) => {
  if (!isOpen) {
    return null;
  }

  const handleToggle = (type: keyof FeedSettings) => {
    onSettingsChange({
      ...settings,
      [type]: !settings[type],
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>Customize Your Feed</h2>
        <p>Toggle which types of recommendations you'd like to see.</p>
        
        <div className="setting-item">
          <label htmlFor="personalizedToggle">"Because you read..." (Personalized)</label>
          <input
            type="checkbox"
            id="personalizedToggle"
            checked={settings.personalized}
            onChange={() => handleToggle('personalized')}
          />
        </div>
        
        <div className="setting-item">
          <label htmlFor="trendingToggle">"Trending Today"</label>
          <input
            type="checkbox"
            id="trendingToggle"
            checked={settings.trending}
            onChange={() => handleToggle('trending')}
          />
        </div>
        
        <div className="setting-item">
          <label htmlFor="randomToggle">"Random Discovery"</label>
          <input
            type="checkbox"
            id="randomToggle"
            checked={settings.random}
            onChange={() => handleToggle('random')}
          />
        </div>
        
        <button onClick={onClose} className="close-button">Done</button>
      </div>
    </div>
  );
};

export default SettingsModal; 