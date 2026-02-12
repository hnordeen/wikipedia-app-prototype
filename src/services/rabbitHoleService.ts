export interface RabbitHoleEntry {
  title: string;
  timestamp: number;
  source?: string; // The article title that led to this one (if navigated from another article)
}

export interface RabbitHole {
  id: string;
  entries: RabbitHoleEntry[];
  startTime: number;
  endTime: number;
  duration: number; // in milliseconds
}

const RABBIT_HOLE_KEY = 'wikipedia_rabbit_holes';
const RABBIT_HOLE_TIMEOUT = 30 * 60 * 1000; // 30 minutes - if gap between articles is longer, start new rabbit hole

// Get all rabbit holes from sessionStorage
export const getRabbitHoles = (): RabbitHole[] => {
  try {
    const stored = sessionStorage.getItem(RABBIT_HOLE_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (error) {
    console.error('Error reading rabbit holes:', error);
    return [];
  }
};

// Save rabbit holes to sessionStorage
const saveRabbitHoles = (holes: RabbitHole[]) => {
  try {
    sessionStorage.setItem(RABBIT_HOLE_KEY, JSON.stringify(holes));
  } catch (error) {
    console.error('Error saving rabbit holes:', error);
  }
};

// Add an article view to the current rabbit hole or start a new one
export const trackArticleView = (title: string, sourceTitle?: string) => {
  const now = Date.now();
  const holes = getRabbitHoles();
  
  // If no holes exist, create the first one
  if (holes.length === 0) {
    const newHole: RabbitHole = {
      id: `hole-${now}`,
      entries: [{
        title,
        timestamp: now,
        source: sourceTitle
      }],
      startTime: now,
      endTime: now,
      duration: 0
    };
    saveRabbitHoles([newHole]);
    return;
  }

  // Get the most recent rabbit hole
  const lastHole = holes[holes.length - 1];
  const timeSinceLastEntry = now - lastHole.endTime;

  // If within timeout window, add to existing rabbit hole
  if (timeSinceLastEntry <= RABBIT_HOLE_TIMEOUT) {
    lastHole.entries.push({
      title,
      timestamp: now,
      source: sourceTitle
    });
    lastHole.endTime = now;
    lastHole.duration = lastHole.endTime - lastHole.startTime;
  } else {
    // Start a new rabbit hole
    const newHole: RabbitHole = {
      id: `hole-${now}`,
      entries: [{
        title,
        timestamp: now,
        source: sourceTitle
      }],
      startTime: now,
      endTime: now,
      duration: 0
    };
    holes.push(newHole);
  }

  // Keep only the last 50 rabbit holes to prevent storage bloat
  const trimmedHoles = holes.slice(-50);
  saveRabbitHoles(trimmedHoles);
};

// Get recent rabbit holes (last N)
export const getRecentRabbitHoles = (limit: number = 10): RabbitHole[] => {
  const holes = getRabbitHoles();
  return holes.slice(-limit).reverse(); // Most recent first
};

// Clear all rabbit holes (useful for testing or reset)
export const clearRabbitHoles = () => {
  sessionStorage.removeItem(RABBIT_HOLE_KEY);
};
