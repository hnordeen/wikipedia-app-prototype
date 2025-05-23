import { ArticleImage } from '../api/wikipedia';

export interface HistoryItem {
  title: string;
  snippet: string;
  timestamp: number;
  thumbnail?: ArticleImage;
}

export interface HistoryInsights {
  weeklyCount: number;
  todayCount: number;
  mostActiveHour: {
    hour: number;
    count: number;
  };
  longestStreak: {
    days: number;
    endDate: Date;
  };
  currentStreak: {
    days: number;
    ongoing: boolean;
  };
}

const HISTORY_KEY = 'wikipedia_history';

// Create a custom event for history updates
const HISTORY_UPDATE_EVENT = 'wikipedia_history_update';

export const addToHistory = (title: string, snippet: string, thumbnail?: ArticleImage) => {
  const history = getHistory();
  
  // Remove existing entry if present (to update it)
  const filteredHistory = history.filter(item => item.title !== title);
  
  // Add new entry at the beginning
  const newHistory = [{
    title,
    snippet,
    thumbnail,
    timestamp: Date.now()
  }, ...filteredHistory];

  // Keep only the last 100 items
  const trimmedHistory = newHistory.slice(0, 100);
  
  localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmedHistory));

  // Dispatch event to notify listeners of the update
  window.dispatchEvent(new CustomEvent(HISTORY_UPDATE_EVENT));
};

export const getHistory = (): HistoryItem[] => {
  const historyString = localStorage.getItem(HISTORY_KEY);
  if (!historyString) return [];
  
  try {
    return JSON.parse(historyString);
  } catch (error) {
    console.error('Error parsing history:', error);
    return [];
  }
};

export const clearHistory = () => {
  localStorage.removeItem(HISTORY_KEY);
  // Dispatch event to notify listeners of the update
  window.dispatchEvent(new CustomEvent(HISTORY_UPDATE_EVENT));
};

export const getHistoryInsights = (): HistoryInsights => {
  const history = getHistory();
  const now = new Date();
  
  // Calculate weekly count
  const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  const weeklyArticles = history.filter(item => new Date(item.timestamp) >= startOfWeek);
  
  // Calculate today's count
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayArticles = history.filter(item => new Date(item.timestamp) >= startOfToday);
  
  // Find most active hour
  const hourCounts = new Array(24).fill(0);
  history.forEach(item => {
    const hour = new Date(item.timestamp).getHours();
    hourCounts[hour]++;
  });
  const mostActiveHour = hourCounts.reduce(
    (max, count, hour) => (count > max.count ? { hour, count } : max),
    { hour: 0, count: 0 }
  );
  
  // Calculate streaks
  const dateSet = new Set();
  history.forEach(item => {
    const date = new Date(item.timestamp);
    dateSet.add(date.toDateString());
  });
  
  let currentStreak = 0;
  let currentDate = new Date();
  let isOngoing = true;
  
  // Check current streak
  while (dateSet.has(currentDate.toDateString())) {
    currentStreak++;
    currentDate.setDate(currentDate.getDate() - 1);
  }
  
  if (!dateSet.has(new Date().toDateString())) {
    isOngoing = false;
    currentStreak = 0;
  }
  
  // Find longest streak
  const dates = Array.from(dateSet).map(d => new Date(d as string));
  dates.sort((a, b) => b.getTime() - a.getTime());
  
  let streak = 1;
  let maxStreak = 1;
  let endDate = dates[0];
  
  for (let i = 1; i < dates.length; i++) {
    const diff = Math.round((dates[i-1].getTime() - dates[i].getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 1) {
      streak++;
      if (streak > maxStreak) {
        maxStreak = streak;
        endDate = dates[i-1];
      }
    } else {
      streak = 1;
    }
  }

  return {
    weeklyCount: weeklyArticles.length,
    todayCount: todayArticles.length,
    mostActiveHour,
    longestStreak: {
      days: maxStreak,
      endDate: endDate || new Date()
    },
    currentStreak: {
      days: currentStreak,
      ongoing: isOngoing
    }
  };
};

// Export the event name for listeners
export const HISTORY_EVENTS = {
  UPDATE: HISTORY_UPDATE_EVENT
}; 