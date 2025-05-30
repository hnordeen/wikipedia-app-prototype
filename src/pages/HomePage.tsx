import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getHistory, HistoryItem, HISTORY_EVENTS } from '../services/historyService';
import { getMoreLikeArticles, SearchResult, getTrendingArticles, getRandomArticles } from '../api/wikipedia';
import RecommendationCarousel from '../components/RecommendationCarousel';
import { useNavigate } from 'react-router-dom';
import SettingsModal, { FeedSettings } from '../components/SettingsModal';
import MainSettingsModal from '../components/MainSettingsModal';
import './HomePage.css';

// Updated RecommendationItem interface
export interface RecommendationItem {
  recommendation: SearchResult;
  reasonText: string; // This will hold "Trending Today" or "Because you read: ..."
}

const INITIAL_LOAD_COUNT = 12; // How many items to load initially
const FETCH_MORE_COUNT = 5;  // How many new items to fetch when loading more
let fetchCycleIdCounter = 0; // For unique fetch cycle logging

const SESSION_STORAGE_KEY = 'homePageFeedState';
const FEED_SETTINGS_KEY = 'homePageFeedSettings'; // localStorage key for settings

interface StoredFeedState {
  recommendations: RecommendationItem[];
  displayedIds: number[]; // Store Set as Array for JSON compatibility
  carouselIndex: number;
  timestamp: number;
}

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [rawHistory, setRawHistory] = useState<HistoryItem[]>(getHistory());
  // Single state for all recommendations
  const [allRecommendations, setAllRecommendations] = useState<RecommendationItem[]>([]); 
  const [loadingRecommendations, setLoadingRecommendations] = useState<boolean>(true);
  const isFetchingMoreRef = useRef<boolean>(false); // Using ref for immediate check
  const [displayedPageIds, setDisplayedPageIds] = useState<Set<number>>(new Set()); // Track displayed articles
  const initialFetchCalledRef = useRef(false); // To prevent double initial fetch in strict mode
  const [carouselCurrentIndex, setCarouselCurrentIndex] = useState<number>(0); // For lifted state
  const homePageRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  // State for settings modal
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [isMainSettingsModalOpen, setIsMainSettingsModalOpen] = useState(false);
  const [feedSettings, setFeedSettings] = useState<FeedSettings>(() => {
    const storedSettings = localStorage.getItem(FEED_SETTINGS_KEY);
    if (storedSettings) {
      try {
        return JSON.parse(storedSettings);
      } catch (e) {
        console.error("Failed to parse stored feed settings:", e);
        // Fallback to default if parsing fails
      }
    }
    return { personalized: true, trending: true, random: true }; // Default settings
  });

  // Save settings to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(FEED_SETTINGS_KEY, JSON.stringify(feedSettings));
      console.log("EFFECT_SETTINGS: Saved feed settings to localStorage", feedSettings);
    } catch (error) {
      console.error("EFFECT_SETTINGS_ERROR: Failed to save feed settings:", error);
    }
  }, [feedSettings]);

  const handleOpenSettingsModal = () => setIsSettingsModalOpen(true);
  const handleCloseSettingsModal = () => setIsSettingsModalOpen(false);
  
  const handleSettingsChange = (newSettings: FeedSettings) => {
    console.log("SETTINGS_CHANGE: Settings updated. Resetting UI, useEffect will trigger re-fetch.", newSettings);
    
    setFeedSettings(newSettings); // This will trigger the useEffect dependent on feedSettings

    // Clear current recommendations & related state immediately for UI responsiveness.
    // The useEffect will then handle fetching new data based on newSettings.
    setAllRecommendations([]);
    setDisplayedPageIds(new Set());
    setCarouselCurrentIndex(0);
    isFetchingMoreRef.current = false; // Reset fetching flag
    
    // Ensure the useEffect doesn't skip fetching in development if it's guarded by initialFetchCalledRef.
    // A settings change essentially makes the next fetch feel like a new "initial" scenario for that set of settings.
    if (process.env.NODE_ENV === 'development') {
      initialFetchCalledRef.current = false;
    }
  };

  // Load state from sessionStorage on initial mount
  useEffect(() => {
    try {
      const storedStateRaw = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (storedStateRaw) {
        const storedState: StoredFeedState = JSON.parse(storedStateRaw);
        // Optional: Check timestamp to invalidate if too old (e.g., > 1 hour)
        const oneHour = 60 * 60 * 1000;
        if (Date.now() - storedState.timestamp < oneHour) {
          console.log("EFFECT_INIT: Restoring state from sessionStorage");
          setAllRecommendations(storedState.recommendations);
          setDisplayedPageIds(new Set(storedState.displayedIds));
          setCarouselCurrentIndex(storedState.carouselIndex);
          setLoadingRecommendations(false); // We have data, no initial load visual needed
          initialFetchCalledRef.current = true; // Mark as fetched since we restored
          return; // Skip initial fetch if restored successfully
        }
        console.log("EFFECT_INIT: Stored state is too old, ignoring.");
      }
    } catch (error) {
      console.error("EFFECT_INIT_ERROR: Failed to parse stored state:", error);
    }
    // If no valid stored state, proceed to initial fetch logic (handled by rawHistory effect)
  }, []); // Empty dependency array: run only once on mount

  // Save state to sessionStorage when component unmounts or before page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (allRecommendations.length > 0) { // Only save if there's something to save
        const stateToStore: StoredFeedState = {
          recommendations: allRecommendations,
          displayedIds: Array.from(displayedPageIds),
          carouselIndex: carouselCurrentIndex,
          timestamp: Date.now(),
        };
        try {
          sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(stateToStore));
          console.log("EFFECT_UNLOAD: Saved feed state to sessionStorage");
        } catch (error) {
          console.error("EFFECT_UNLOAD_ERROR: Failed to save state:", error);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Also save on component unmount (e.g., navigating away within SPA)
      handleBeforeUnload(); 
    };
  }, [allRecommendations, displayedPageIds, carouselCurrentIndex]); // Re-run if these change to save latest

  const handleHistoryUpdate = useCallback(() => {
    console.log("HISTORY_UPDATE: History changed. Clearing stored state and resetting.");
    sessionStorage.removeItem(SESSION_STORAGE_KEY); // Clear stored state if history changes
    setRawHistory(getHistory());
    initialFetchCalledRef.current = false;
    isFetchingMoreRef.current = false; 
    setCarouselCurrentIndex(0);
    // The rawHistory useEffect will trigger a fresh fetch
  }, []);

  useEffect(() => {
    window.addEventListener(HISTORY_EVENTS.UPDATE, handleHistoryUpdate);
    return () => {
      window.removeEventListener(HISTORY_EVENTS.UPDATE, handleHistoryUpdate);
    };
  }, [handleHistoryUpdate]);

  // Main function to fetch recommendations
  const fetchAndProcessRecommendations = useCallback(async (isInitial: boolean, currentGlobalIdsAtCallTime: Set<number>, currentSettings?: FeedSettings) => {
    const settingsToUse = currentSettings || feedSettings; 
    const currentFetchCycleId = ++fetchCycleIdCounter;
    console.log(`FETCH_PROCESS [ID: ${currentFetchCycleId}]: Called. isInitial: ${isInitial}, Settings Used:`, JSON.stringify(settingsToUse), `currentGlobalIdsAtCallTime size: ${currentGlobalIdsAtCallTime.size}`);
    
    if (isInitial) {
      setLoadingRecommendations(true);
      isFetchingMoreRef.current = false;
    } else {
      if (isFetchingMoreRef.current) {
        console.log(`FETCH_PROCESS [ID: ${currentFetchCycleId}]: Already fetching more (ref check), returning.`);
        return;
      }
      isFetchingMoreRef.current = true;
    }

    // Use a copy of the passed global IDs for filtering this specific batch to avoid issues with state updates during async operations
    const idsToFilterAgainstThisBatch = new Set(currentGlobalIdsAtCallTime);
    console.log(`FETCH_PROCESS [ID: ${currentFetchCycleId}]: IDs to filter this batch against (size ${idsToFilterAgainstThisBatch.size}):`, Array.from(idsToFilterAgainstThisBatch));

    let personalizedRecs: RecommendationItem[] = [];
    let trendingRecs: RecommendationItem[] = [];
    let randomRecs: RecommendationItem[] = [];

    // Fetch Personalized
    if (settingsToUse.personalized && isInitial && rawHistory.length > 0) {
      const recentUniqueTitles = rawHistory.slice().sort((a,b) => b.timestamp - a.timestamp).map(item => item.title).filter((v,i,s) => s.indexOf(v)===i).slice(0,4);
      console.log(`FETCH_PROCESS [ID: ${currentFetchCycleId}]: Personalized seed titles:`, recentUniqueTitles);
      if (recentUniqueTitles.length > 0) {
        try {
          const personalizedPromises = recentUniqueTitles.map(async (sourceTitle) => {
            const recs = await getMoreLikeArticles(sourceTitle.replace(/ /g, '_'), 5);
            console.log(`FETCH_PROCESS [ID: ${currentFetchCycleId}]: Raw personalized for ${sourceTitle} (count: ${recs.length}):`, recs.map(r => r.pageid));
            return recs.map(rec => ({ recommendation: rec, reasonText: `Because you read: ${sourceTitle}` }));
          });
          const personalizedArrays = await Promise.all(personalizedPromises); // Array of arrays of RecommendationItem
          
          // Round-robin approach to interleave personalized recommendations by source
          let roundRobinPersonalized: RecommendationItem[] = [];
          const tempDisplayedIdsInBatch = new Set<number>(); // Track pageids added in this personalized batch

          if (personalizedArrays.length > 0) {
            const maxLength = Math.max(...personalizedArrays.map(arr => arr.length));
            for (let i = 0; i < maxLength; i++) {
              for (const sourceArray of personalizedArrays) {
                if (sourceArray[i]) {
                  const item = sourceArray[i];
                  const pageid = item.recommendation.pageid;
                  if ( pageid &&
                       item.recommendation.images?.[0]?.url && 
                       !rawHistory.some(h => h.title === item.recommendation.title) && // Not in direct history
                       !idsToFilterAgainstThisBatch.has(pageid) && // Not in globally displayed IDs for this fetch cycle
                       !tempDisplayedIdsInBatch.has(pageid) // Not already added from another source in this batch
                  ) {
                    roundRobinPersonalized.push(item);
                    tempDisplayedIdsInBatch.add(pageid); 
                  }
                }
              }
            }
          }
          personalizedRecs = roundRobinPersonalized;
          console.log(`FETCH_PROCESS [ID: ${currentFetchCycleId}]: Filtered & interleaved personalized items (pageids):`, personalizedRecs.map(p => p.recommendation.pageid));
        } catch (error) { console.error(`FETCH_PROCESS_ERROR [ID: ${currentFetchCycleId}]: Personalized recs:`, error); }
      }
    } else if (isInitial) {
        console.log(`FETCH_PROCESS [ID: ${currentFetchCycleId}]: Personalized recs skipped (settings or no history).`);
    }

    // Fetch Trending
    if (settingsToUse.trending) {
      try {
        // Fetch more than needed to increase chance of getting new ones after filtering
        const trendingApiResults = await getTrendingArticles(isInitial ? Math.floor(INITIAL_LOAD_COUNT * 0.3) + 5 : FETCH_MORE_COUNT + 5); 
        console.log(`FETCH_PROCESS [ID: ${currentFetchCycleId}]: Raw trending API results (count: ${trendingApiResults.length}, pageids):`, trendingApiResults.map(t => t.pageid));
        trendingRecs = trendingApiResults
          .filter(rec => rec.pageid && !idsToFilterAgainstThisBatch.has(rec.pageid))
          .map(rec => ({ recommendation: rec, reasonText: "Trending Today" }));
        console.log(`FETCH_PROCESS [ID: ${currentFetchCycleId}]: Filtered trending items (pageids):`, trendingRecs.map(t => t.recommendation.pageid));
      } catch (error) { console.error(`FETCH_PROCESS_ERROR [ID: ${currentFetchCycleId}]: Trending recs:`, error); }
    } else {
      console.log(`FETCH_PROCESS [ID: ${currentFetchCycleId}]: Trending recs skipped (settings).`);
    }

    // Fetch Random
    if (settingsToUse.random) {
      try {
        const randomApiResults = await getRandomArticles(isInitial ? Math.floor(INITIAL_LOAD_COUNT * 0.2) + 5 : FETCH_MORE_COUNT + 5);
        console.log(`FETCH_PROCESS [ID: ${currentFetchCycleId}]: Raw random API results (count: ${randomApiResults.length}, pageids):`, randomApiResults.map(r => r.pageid));
        randomRecs = randomApiResults
          .filter(rec => rec.pageid && !idsToFilterAgainstThisBatch.has(rec.pageid))
          .map(rec => ({ recommendation: rec, reasonText: "Random Discovery" }));
        console.log(`FETCH_PROCESS [ID: ${currentFetchCycleId}]: Filtered random items (pageids):`, randomRecs.map(r => r.recommendation.pageid));
      } catch (error) { console.error(`FETCH_PROCESS_ERROR [ID: ${currentFetchCycleId}]: Random recs:`, error); }
    } else {
      console.log(`FETCH_PROCESS [ID: ${currentFetchCycleId}]: Random recs skipped (settings).`);
    }
    
    console.log(`FETCH_PROCESS [ID: ${currentFetchCycleId}]: Intermediate recs counts - Personalized: ${personalizedRecs.length}, Trending: ${trendingRecs.length}, Random: ${randomRecs.length}`);

    let newItems: RecommendationItem[] = [];
    if (isInitial) {
      newItems = [
        ...personalizedRecs.slice(0, Math.floor(INITIAL_LOAD_COUNT * 0.5)),
        ...trendingRecs.slice(0, Math.floor(INITIAL_LOAD_COUNT * 0.3)),
        ...randomRecs.slice(0, Math.floor(INITIAL_LOAD_COUNT * 0.2))
      ];
    } else {
      newItems = [
        ...trendingRecs.slice(0, Math.ceil(FETCH_MORE_COUNT * 0.5)), // Prioritize new content
        ...randomRecs.slice(0, Math.floor(FETCH_MORE_COUNT * 0.5))
      ];
    }
    console.log(`FETCH_PROCESS [ID: ${currentFetchCycleId}]: Combined newItems before final unique filter (count: ${newItems.length}, pageids):`, newItems.map(i => i.recommendation.pageid));

    const trulyNewItems = newItems.filter((item, index, self) =>
      item.recommendation.pageid &&
      !idsToFilterAgainstThisBatch.has(item.recommendation.pageid) && 
      index === self.findIndex(r => r.recommendation.pageid === item.recommendation.pageid)
    );
    console.log(`FETCH_PROCESS [ID: ${currentFetchCycleId}]: Truly new items to add (count: ${trulyNewItems.length}, titles):`, trulyNewItems.map(i => ({ title: i.recommendation.title, pageid: i.recommendation.pageid, reason: i.reasonText })));
    
    if (trulyNewItems.length > 0) {
      setDisplayedPageIds(prevGlobalIds => {
        const updatedGlobalIds = new Set(prevGlobalIds);
        trulyNewItems.forEach(item => { if (item.recommendation.pageid) updatedGlobalIds.add(item.recommendation.pageid); });
        console.log(`FETCH_PROCESS_SETTER [ID: ${currentFetchCycleId}]: Updated global displayedPageIds. Old size: ${prevGlobalIds.size}, New items added to set: ${trulyNewItems.filter(item => !prevGlobalIds.has(item.recommendation.pageid!)).length}, New global size: ${updatedGlobalIds.size}`);
        return updatedGlobalIds;
      });

      if (isInitial) {
        // For an initial load (or a load treated as initial due to settings change),
        // directly set the recommendations to the newly fetched and filtered items.
        // The useEffect hook is responsible for clearing allRecommendations before this.
        const finalRecommendations = [...trulyNewItems].sort(() => 0.5 - Math.random()); // Shuffle
        console.log(`FETCH_PROCESS_SETTER [ID: ${currentFetchCycleId}]: isInitial=true. Directly setting recommendations. Count: ${finalRecommendations.length}`);
        setAllRecommendations(finalRecommendations);
      } else {
        // For "load more" (not initial)
        setAllRecommendations(prevRecs => {
          console.log(`FETCH_PROCESS_SETTER [ID: ${currentFetchCycleId}]: Load more. prevRecs.length: ${prevRecs.length}, trulyNewItems for this batch: ${trulyNewItems.length}`);
          const prevRecsPageIds = new Set(prevRecs.map(pr => pr.recommendation.pageid).filter(pid => pid !== undefined) as number[]);
          const actuallyNewToAdd = trulyNewItems.filter(newItem => 
            !newItem.recommendation.pageid || !prevRecsPageIds.has(newItem.recommendation.pageid)
          );

          if (actuallyNewToAdd.length < trulyNewItems.length) {
            console.warn(`FETCH_PROCESS_SETTER [ID: ${currentFetchCycleId}]: Load more - Filtered out ${trulyNewItems.length - actuallyNewToAdd.length} items from trulyNewItems because their pageIDs were already in prevRecs (load more context).`);
          }

          const combined = [...prevRecs, ...actuallyNewToAdd];
          // Potentially re-sort or just append and sort differently if needed for load more.
          // For now, maintaing previous sort order for existing, append new, then shuffle all.
          const finalRecommendations = combined.sort(() => 0.5 - Math.random()); 
          console.log(`FETCH_PROCESS_SETTER [ID: ${currentFetchCycleId}]: Load more - Prev recs: ${prevRecs.length}, Filtered New to Add: ${actuallyNewToAdd.length}, Final Combined: ${finalRecommendations.length}`);
          
          // Duplicate check (optional but good)
          const pageidCounts = finalRecommendations.reduce((acc, item) => {
            const pid = item.recommendation.pageid;
            if (pid) { acc[pid] = (acc[pid] || 0) + 1; }
            return acc;
          }, {} as Record<number, number>);
          const duplicatesInFinal = Object.entries(pageidCounts).filter(([_pid, count]) => count > 1);
          if (duplicatesInFinal.length > 0) {
            console.warn(`FETCH_PROCESS_SETTER_WARN [ID: ${currentFetchCycleId}]: Load more - Duplicates by pageID in finalRecommendations!`, JSON.stringify(duplicatesInFinal));
          }
          return finalRecommendations;
        });
      }
    } else if (isInitial) {
        // If it's an initial load and no new items were found (e.g., all filtered out by other criteria before this stage)
        setAllRecommendations([]); 
        console.log(`FETCH_PROCESS [ID: ${currentFetchCycleId}]: Initial load, but trulyNewItems was empty. Setting empty recommendations.`);
    }

    if (isInitial) setLoadingRecommendations(false);
    if (!isInitial) {
        isFetchingMoreRef.current = false;
    }
    console.log(`FETCH_PROCESS [ID: ${currentFetchCycleId}]: Finished. isFetchingMoreRef.current is now: ${isFetchingMoreRef.current}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawHistory, feedSettings]); // Add feedSettings as a dependency

  // Effect for initial data load & history changes
  useEffect(() => {
    console.log("EFFECT_INIT_OR_SETTINGS_CHANGE: Running. Current feedSettings:", JSON.stringify(feedSettings), "Raw history length:", rawHistory.length);
    
    setDisplayedPageIds(new Set());
    setAllRecommendations([]);                   
    isFetchingMoreRef.current = false; // Ensure fetching isn't blocked from a previous aborted/more load.
    setCarouselCurrentIndex(0); 
    
    fetchAndProcessRecommendations(true, new Set(), feedSettings); // feedSettings from state is up-to-date here
    
    if (process.env.NODE_ENV === 'development' && !initialFetchCalledRef.current) {
        initialFetchCalledRef.current = true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawHistory, feedSettings]); // Re-run if feedSettings (or rawHistory) change

  const handleCarouselIndexChange = (newIndex: number) => {
    setCarouselCurrentIndex(newIndex);
  };

  // Effect for Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (allRecommendations.length === 0) return;

      let newIndex = carouselCurrentIndex;
      let navigationAction = false;

      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        newIndex = Math.min(carouselCurrentIndex + 1, allRecommendations.length - 1);
        navigationAction = true;
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        newIndex = Math.max(carouselCurrentIndex - 1, 0);
        navigationAction = true;
      } else if (event.key === 'Enter') {
        const currentItem = allRecommendations[carouselCurrentIndex];
        if (currentItem && currentItem.recommendation && currentItem.recommendation.title) {
          navigate(`/article/${encodeURIComponent(currentItem.recommendation.title.replace(/ /g, '_'))}`);
        }
        return; // Don't change index or prevent default for Enter if it's for navigation
      }

      if (navigationAction && newIndex !== carouselCurrentIndex) {
        handleCarouselIndexChange(newIndex);
        event.preventDefault(); // Prevent default scroll on arrow keys if we handled it
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [carouselCurrentIndex, allRecommendations, handleCarouselIndexChange, navigate]);

  // Effect for Mouse Wheel Scroll
  useEffect(() => {
    const homeElement = homePageRef.current;
    if (!homeElement) return;

    const handleWheel = (event: WheelEvent) => {
      if (allRecommendations.length === 0) return;

      event.preventDefault(); // Prevent default page scroll
      let newIndex = carouselCurrentIndex;
      if (event.deltaY > 0) { // Scrolling down
        newIndex = Math.min(carouselCurrentIndex + 1, allRecommendations.length - 1);
      } else if (event.deltaY < 0) { // Scrolling up
        newIndex = Math.max(carouselCurrentIndex - 1, 0);
      }

      if (newIndex !== carouselCurrentIndex) {
        handleCarouselIndexChange(newIndex);
      }
    };

    homeElement.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      homeElement.removeEventListener('wheel', handleWheel);
    };
  }, [carouselCurrentIndex, allRecommendations, handleCarouselIndexChange]);

  // Effect for Touch Swipe
  useEffect(() => {
    const homeElement = homePageRef.current;
    if (!homeElement) return;

    const handleTouchStart = (event: TouchEvent) => {
      if (allRecommendations.length === 0) return;
      touchStartX.current = event.touches[0].clientX;
      touchStartY.current = event.touches[0].clientY;
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (touchStartX.current === null || touchStartY.current === null || allRecommendations.length === 0) {
        return;
      }

      const touchEndX = event.touches[0].clientX;
      const touchEndY = event.touches[0].clientY;
      const deltaX = touchEndX - touchStartX.current;
      const deltaY = touchEndY - touchStartY.current;
      let newIndex = carouselCurrentIndex;
      let swiped = false;

      // Prioritize horizontal swipe for carousel, but allow vertical if dominant and intended
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 30) { // Horizontal swipe
        if (deltaX < 0) { // Swiping left (next)
          newIndex = Math.min(carouselCurrentIndex + 1, allRecommendations.length - 1);
        } else { // Swiping right (previous)
          newIndex = Math.max(carouselCurrentIndex - 1, 0);
        }
        swiped = true;
      } else if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 30) { // Vertical swipe (user asked for swipe down)
        if (deltaY > 0) { // Swiping down (next)
          newIndex = Math.min(carouselCurrentIndex + 1, allRecommendations.length - 1);
        } else { // Swiping up (previous)
          newIndex = Math.max(carouselCurrentIndex - 1, 0);
        }
        swiped = true;
      }

      if (swiped && newIndex !== carouselCurrentIndex) {
        handleCarouselIndexChange(newIndex);
        event.preventDefault(); // Prevent scroll/other actions if swipe was handled
      }
      // Reset after a swipe is detected and processed or if it's a very small movement (not a swipe)
      if (swiped || (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5)) { 
        touchStartX.current = null;
        touchStartY.current = null;
      }
    };

    homeElement.addEventListener('touchstart', handleTouchStart, { passive: true });
    homeElement.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      homeElement.removeEventListener('touchstart', handleTouchStart);
      homeElement.removeEventListener('touchmove', handleTouchMove);
    };
  }, [carouselCurrentIndex, allRecommendations, handleCarouselIndexChange]);

  const handleOnNearEnd = useCallback(() => {
    // Pass a NEW COPY of the current displayedPageIds to fetchAndProcessRecommendations
    // This ensures the fetch operation uses the IDs known at the moment it's called.
    const currentGlobalIdsForFetchMore = new Set(displayedPageIds);
    console.log(`CALLBACK_NEAR_END: Triggered. Current recs: ${allRecommendations.length}, Current global IDs for next fetch: ${currentGlobalIdsForFetchMore.size}`);
    fetchAndProcessRecommendations(false, currentGlobalIdsForFetchMore, feedSettings);
  }, [fetchAndProcessRecommendations, displayedPageIds, allRecommendations.length, feedSettings]);

  console.log("RENDER: LoadingStates:", {loadingRecommendations, isFetchingMore: isFetchingMoreRef.current});
  console.log("RENDER: Recommendations count:", allRecommendations.length, "CarouselIndex:", carouselCurrentIndex);

  const openMainSettingsModal = () => {
    setIsMainSettingsModalOpen(true);
  };

  const closeMainSettingsModal = () => {
    setIsMainSettingsModalOpen(false);
  };

  const openFeedSettingsModal = () => {
    setIsSettingsModalOpen(true);
  };

  const closeFeedSettingsModal = () => {
    setIsSettingsModalOpen(false);
  };

  const handleNavigateToFeedSettings = () => {
    closeMainSettingsModal();
    openFeedSettingsModal();
  };

  // Renamed from handleOpenSettingsModal to be more specific
  const handleReasonClickToOpenFeedSettings = () => {
    openFeedSettingsModal();
  };

  return (
    <div ref={homePageRef} className="home-page">
      <div className="title-container">
        <img src="https://upload.wikimedia.org/wikipedia/commons/1/10/Wikipedia-W-bold-in-square.svg" alt="Wikipedia Logo" className="explore-logo" />
        <h1 className="explore-title">Explore</h1>
        <button onClick={openMainSettingsModal} className="main-settings-button" aria-label="Open settings">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24px" height="24px">
            <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.23 C14.34,2.01,14.13,1.86,13.89,1.86h-3.78c-0.24,0-0.45,0.15-0.5,0.37L9.22,4.65C8.63,4.89,8.1,5.21,7.6,5.59L5.21,4.63 C4.99,4.56,4.74,4.62,4.62,4.84l-1.92,3.32C2.58,8.39,2.64,8.66,2.82,8.8l2.03,1.58C4.8,10.7,4.78,11.02,4.78,11.34 c0,0.32,0.02,0.64,0.07,0.94l-2.03,1.58c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22 l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.39,2.42c0.05,0.22,0.26,0.37,0.5,0.37h3.78c0.24,0,0.45-0.15,0.5-0.37l0.39-2.42 c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96c0.22,0.08,0.47,0.02,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61 L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
          </svg>
        </button>
      </div>
      {loadingRecommendations && allRecommendations.length === 0 && (
        <div className="home-loading">Curating your feed...</div>
      )}
      {(allRecommendations.length > 0 || !loadingRecommendations) && (
        <div className="recommendation-stream">
          <RecommendationCarousel 
            recommendations={allRecommendations} 
            onNearEnd={handleOnNearEnd}
            currentIndex={carouselCurrentIndex} 
            onCurrentIndexChange={handleCarouselIndexChange} 
            onReasonClick={handleReasonClickToOpenFeedSettings}
          />
        </div>
      )}

      {/* Settings Modal */} 
      <SettingsModal 
        isOpen={isSettingsModalOpen}
        settings={feedSettings}
        onSettingsChange={handleSettingsChange}
        onClose={handleCloseSettingsModal}
      />

      <MainSettingsModal
        isOpen={isMainSettingsModalOpen}
        onClose={closeMainSettingsModal}
        feedSettings={feedSettings}
        onFeedSettingsChange={handleSettingsChange}
      />

      {(isFetchingMoreRef.current && allRecommendations.length > 0) && (
        <div className="loading-more-recommendations">Fetching more...</div>
      )}

      {(!loadingRecommendations && !isFetchingMoreRef.current && allRecommendations.length === 0) && (
        <div className="no-recommendations">
          <p>We couldn't find any recommendations. {rawHistory.length === 0 ? "Read some articles to get started!" : ""}</p>
        </div>
      )}
    </div>
  );
};

export default HomePage; 