import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatTitleForDisplay, formatTitleForUrl } from '../utils/titleUtils';
import { useHistory } from '../hooks/useHistory';
import { getHistoryInsights, getHistory } from '../services/historyService';
import { getReminderStatus } from '../services/reminderService';
import { getRecentRabbitHoles } from '../services/rabbitHoleService';
import NavBar from '../components/NavBar';
import DonationModal from '../components/DonationModal';
import ShareSheet from '../components/ShareSheet';
import RabbitHoleVisualization from '../components/RabbitHoleVisualization';
import './HistoryPage.css';

const MIN_ARTICLES_FOR_DONATION_CTA = 5;
const ARTICLES_BETWEEN_INITIAL_PROMPTS = 100;
const LAST_INITIAL_PROMPT_COUNT_KEY = 'wikipediaAppLastInitialPromptArticleCount';
// Key for the explicit setting from MainSettingsModal
const SHOW_INITIAL_DONATION_PROMPT_SETTING_KEY = 'wikipediaAppShowInitialDonationPrompt'; 

const HistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const { groupedHistory } = useHistory();
  const insights = getHistoryInsights();
  const [isDonationModalOpen, setIsDonationModalOpen] = useState(false);
  const [isShareSheetOpen, setIsShareSheetOpen] = useState(false);
  const flatHistory = useMemo(() => {
    return Object.values(groupedHistory).flat().sort((a, b) => b.timestamp - a.timestamp);
  }, [groupedHistory]);
  const [rabbitHoles, setRabbitHoles] = useState(() => getRecentRabbitHoles(10));

  // Update rabbit holes when history changes (since tracking happens in ArticlePage)
  useEffect(() => {
    setRabbitHoles(getRecentRabbitHoles(10));
  }, [groupedHistory]);

  const totalArticlesInHistory = useMemo(() => {
    return Object.values(groupedHistory).reduce((sum, items) => sum + items.length, 0);
  }, [groupedHistory]);

  useEffect(() => {
    const reminderSettings = getReminderStatus();
    const remindersGloballyEnabled = reminderSettings ? reminderSettings.reminderEnabled : false;

    if (!remindersGloballyEnabled) {
      console.log("HISTORY_PAGE: Initial prompt skipped, reminders globally disabled.");
      return;
    }

    let explicitlyAllowFirstTimePrompt = false; // Default to false, requires explicit ON
    try {
      const storedAllowSetting = localStorage.getItem(SHOW_INITIAL_DONATION_PROMPT_SETTING_KEY);
      if (storedAllowSetting !== null) {
        explicitlyAllowFirstTimePrompt = JSON.parse(storedAllowSetting);
      }
    } catch (error) {
      console.error("HISTORY_PAGE: Error reading show initial prompt setting:", error);
    }

    if (totalArticlesInHistory >= MIN_ARTICLES_FOR_DONATION_CTA && !isDonationModalOpen) {
      if (explicitlyAllowFirstTimePrompt) {
        console.log("HISTORY_PAGE: Triggering donation reminder modal because 'Allow First-Time Prompt' setting is ON.");
        setIsDonationModalOpen(true);
      } else {
        // If explicit setting is OFF, fall back to 100-article interval logic
        console.log("HISTORY_PAGE: 'Allow First-Time Prompt' is OFF. Checking 100-article interval.");
        let lastPromptCount = 0;
        try {
          const storedCount = localStorage.getItem(LAST_INITIAL_PROMPT_COUNT_KEY);
          if (storedCount) {
            lastPromptCount = parseInt(storedCount, 10);
            if (isNaN(lastPromptCount)) lastPromptCount = 0;
          }
        } catch (error) {
          console.error("HISTORY_PAGE: Error reading last initial prompt article count:", error);
          lastPromptCount = 0;
        }

        if (totalArticlesInHistory >= lastPromptCount + ARTICLES_BETWEEN_INITIAL_PROMPTS) {
          console.log(`HISTORY_PAGE: Triggering donation reminder modal (interval). Total: ${totalArticlesInHistory}, LastPrompt: ${lastPromptCount}`);
          setIsDonationModalOpen(true);
        } else {
          console.log(`HISTORY_PAGE: Initial prompt criteria not met (interval). Total: ${totalArticlesInHistory}, LastPrompt: ${lastPromptCount}, Required > ${lastPromptCount + ARTICLES_BETWEEN_INITIAL_PROMPTS -1}`);
        }
      }
    }
  }, [totalArticlesInHistory, isDonationModalOpen]);

  const handleCloseDonationModal = () => {
    setIsDonationModalOpen(false);
    // Always update lastPromptCount, even if shown due to the explicit setting.
    // This means if the explicit setting is later turned OFF, the 100-article count starts from this point.
    try {
      localStorage.setItem(LAST_INITIAL_PROMPT_COUNT_KEY, totalArticlesInHistory.toString());
      console.log(`HISTORY_PAGE: Updated last initial prompt article count to ${totalArticlesInHistory}`);
    } catch (error) {
      console.error("HISTORY_PAGE: Error saving last initial prompt article count:", error);
    }
  };

  const handleArticleClick = (title: string) => {
    navigate(`/article/${formatTitleForUrl(title)}`);
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: 'numeric'
    });
  };

  const formatHour = (hour: number) => {
    return new Date(2020, 0, 1, hour).toLocaleTimeString(undefined, {
      hour: 'numeric',
      hour12: true
    });
  };

  const isToday = (dateString: string) => {
    const today = new Date().toLocaleDateString(undefined, {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
    return dateString === today;
  };

  const isYesterday = (dateString: string) => {
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString(undefined, {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
    return dateString === yesterday;
  };

  const formatDate = (dateString: string) => {
    if (isToday(dateString)) return 'Today';
    if (isYesterday(dateString)) return 'Yesterday';
    return dateString;
  };

  const renderDetailedInsights = () => (
    <div className="insights-grid">
      <div className="insight-card">
        <div className="insight-value">{insights.todayCount}</div>
        <div className="insight-label">Articles read today</div>
      </div>
      <div className="insight-card">
        <div className="insight-value">{insights.weeklyCount}</div>
        <div className="insight-label">Articles this week</div>
      </div>
      <div className="insight-card">
        <div className="insight-value">{insights.currentStreak.days}</div>
        <div className="insight-label">Day streak</div>
        {insights.currentStreak.days > 0 && (
          <div className={`streak-badge ${insights.currentStreak.ongoing ? '' : 'inactive'}`}>
            {insights.currentStreak.ongoing ? 'Active' : 'Ended'}
          </div>
        )}
      </div>
      {insights.mostActiveHour.count > 0 && (
        <div className="insight-card">
          <div className="most-active-hour">{formatHour(insights.mostActiveHour.hour)}</div>
          <div className="most-active-label">Most active reading time</div>
        </div>
      )}
    </div>
  );

  if (Object.keys(groupedHistory).length === 0) {
    return (
      <div className="history-page">
        <div className="title-container">
          <img src="https://upload.wikimedia.org/wikipedia/commons/1/10/Wikipedia-W-bold-in-square.svg" alt="Wikipedia Logo" className="page-logo" />
          <h1 className="page-title">Activity</h1>
        {flatHistory.length > 0 && (
          <button 
            className="history-share-button"
            onClick={() => setIsShareSheetOpen(true)}
            aria-label="Share your rabbit holes"
            title="Share your rabbit holes"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20px" height="20px">
              <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/>
            </svg>
            Share
          </button>
        )}
        </div>
        {renderDetailedInsights()}
        <div className="history-empty">
          <h2>No Activity</h2>
          <p>Articles you view will appear here</p>
        </div>
        <NavBar />
        <DonationModal 
          isOpen={isDonationModalOpen} 
          onClose={handleCloseDonationModal}
          articleCount={totalArticlesInHistory}
        />
      </div>
    );
  }

  return (
    <div className="history-page">
      <div className="title-container">
        <img src="https://upload.wikimedia.org/wikipedia/commons/1/10/Wikipedia-W-bold-in-square.svg" alt="Wikipedia Logo" className="page-logo" />
        <h1 className="page-title">Activity</h1>
        {flatHistory.length > 0 && (
          <button 
            className="history-share-button"
            onClick={() => setIsShareSheetOpen(true)}
            aria-label="Share your rabbit holes"
            title="Share your rabbit holes"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20px" height="20px">
              <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/>
            </svg>
            Share
          </button>
        )}
      </div>
      {renderDetailedInsights()}
      {rabbitHoles.length > 0 && (
        <div className="rabbit-hole-section">
          <RabbitHoleVisualization rabbitHoles={rabbitHoles} />
        </div>
      )}
      <div className="history-list">
        {Object.entries(groupedHistory).map(([date, items]) => (
          <div key={date} className="history-group">
            <h2 className="history-date-header">{formatDate(date)}</h2>
            {items.map((item) => (
              <div
                key={`${item.title}-${item.timestamp}`}
                className="history-item"
                onClick={() => handleArticleClick(item.title)}
              >
                <div className="history-item-content">
                  <h3>{formatTitleForDisplay(item.title)}</h3>
                  <p className="history-snippet">{item.snippet}</p>
                  <span className="history-date">{formatTime(item.timestamp)}</span>
                </div>
                {item.thumbnail && (
                  <div className="history-thumbnail">
                    <img
                      src={item.thumbnail.url}
                      alt={item.thumbnail.description || item.title}
                      loading="lazy"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
      <NavBar />
      <DonationModal 
        isOpen={isDonationModalOpen} 
        onClose={handleCloseDonationModal}
        articleCount={totalArticlesInHistory}
      />
      <ShareSheet
        isOpen={isShareSheetOpen}
        onClose={() => setIsShareSheetOpen(false)}
        history={flatHistory}
      />
    </div>
  );
};

export default HistoryPage; 