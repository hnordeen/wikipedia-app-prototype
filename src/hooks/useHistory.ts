import { useState, useEffect } from 'react';
import { getHistory, HistoryItem, HISTORY_EVENTS } from '../services/historyService';

interface GroupedHistory {
  [key: string]: HistoryItem[];
}

export const useHistory = () => {
  const [groupedHistory, setGroupedHistory] = useState<GroupedHistory>({});
  const [weeklyCount, setWeeklyCount] = useState<number>(0);

  const updateHistory = () => {
    const history = getHistory();
    
    // Calculate weekly count
    const now = new Date();
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    const weeklyArticles = history.filter(item => {
      const itemDate = new Date(item.timestamp);
      return itemDate >= startOfWeek;
    });
    setWeeklyCount(weeklyArticles.length);

    // Group by date
    const grouped = history.reduce((acc: GroupedHistory, item) => {
      const date = new Date(item.timestamp);
      const key = date.toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
      
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(item);
      return acc;
    }, {});
    
    setGroupedHistory(grouped);
  };

  // Initial load
  useEffect(() => {
    updateHistory();

    // Listen for history updates
    window.addEventListener(HISTORY_EVENTS.UPDATE, updateHistory);

    // Cleanup
    return () => {
      window.removeEventListener(HISTORY_EVENTS.UPDATE, updateHistory);
    };
  }, []);

  return {
    groupedHistory,
    weeklyCount,
    updateHistory
  };
}; 