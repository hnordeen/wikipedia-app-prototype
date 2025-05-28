import React from 'react';
import './SettingsModal.css';

export interface FeedSettings {
  personalized: boolean;
  trending: boolean;
  random: boolean;
}

interface SettingsModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  settings: FeedSettings;
  onSettingsChange: (newSettings: FeedSettings) => void;
  asPanel?: boolean;
  onBack?: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
  asPanel = false,
  onBack,
}) => {
  if (!asPanel && !isOpen) {
    return null;
  }

  const handleCheckboxChange = (key: keyof FeedSettings) => {
    onSettingsChange({
      ...settings,
      [key]: !settings[key],
    });
  };

  const content = (
    <>
      {asPanel && (
        <div className="s-modal-header panel-header">
          <h3>Customize Feed</h3>
          {onBack && <button onClick={onBack} className="s-modal-back-button panel-back-button">← Back</button>}
        </div>
      )}
      {!asPanel && (
        <div className="s-modal-header">
          <h2>Customize Feed</h2>
          {onClose && <button onClick={onClose} className="s-modal-close-button">&times;</button>}
        </div>
      )}
      <div className="s-modal-body">
        <p className="s-modal-description">
          Select the types of recommendations you'd like to see in your Explore feed.
        </p>
        {Object.keys(settings).map((key) => {
          const settingKey = key as keyof FeedSettings;
          let label = key.charAt(0).toUpperCase() + key.slice(1);
          if (key === 'personalized') label = 'Personalized (based on your history)';
          if (key === 'trending') label = 'Trending on Wikipedia';
          if (key === 'random') label = 'Random Discoveries';

          return (
            <div key={key} className="s-setting-item">
              <label htmlFor={key} className="s-checkbox-label">
                {label}
              </label>
              <input
                type="checkbox"
                id={key}
                checked={settings[settingKey]}
                onChange={() => handleCheckboxChange(settingKey)}
                className="s-checkbox"
              />
            </div>
          );
        })}
      </div>
      {!asPanel && onClose && (
         <div className="s-modal-footer">
            <button onClick={onClose} className="s-modal-done-button">Done</button>
        </div>
      )}
    </>
  );

  if (asPanel) {
    return <div className="s-modal-panel-content">{content}</div>;
  }

  return (
    <div className="s-modal-overlay">
      <div className="s-modal-content">
        {content}
      </div>
    </div>
  );
};

export default SettingsModal; 