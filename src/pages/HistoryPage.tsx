import React from 'react';
import { useNavigate } from 'react-router-dom';
import { formatTitleForDisplay, formatTitleForUrl } from '../utils/titleUtils';
import { useHistory } from '../hooks/useHistory';
import { getHistoryInsights } from '../services/historyService';
import './HistoryPage.css';

const HistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const { groupedHistory } = useHistory();
  const insights = getHistoryInsights();

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
          <div className="insight-label">({insights.mostActiveHour.count} articles)</div>
        </div>
      )}
    </div>
  );

  if (Object.keys(groupedHistory).length === 0) {
    return (
      <div className="history-page">
        <div className="history-header">
          <div className="header-content">
            <h1 className="history-title">Activity</h1>
          </div>
        </div>
        {renderDetailedInsights()}
        <div className="history-empty">
          <h2>No Activity</h2>
          <p>Articles you view will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="history-page">
      <div className="history-header">
        <div className="header-content">
          <h1 className="history-title">Activity</h1>
        </div>
      </div>
      {renderDetailedInsights()}
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
    </div>
  );
};

export default HistoryPage; 