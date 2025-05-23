import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getHistory, HistoryItem, HISTORY_EVENTS } from '../services/historyService';
import { getMoreLikeArticles, SearchResult, getTrendingArticles, getRandomArticles } from '../api/wikipedia';
import RecommendationCarousel from '../components/RecommendationCarousel';
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

interface StoredFeedState {
  recommendations: RecommendationItem[];
  displayedIds: number[]; // Store Set as Array for JSON compatibility
  carouselIndex: number;
  timestamp: number;
}

const HomePage: React.FC = () => {
  const [rawHistory, setRawHistory] = useState<HistoryItem[]>(getHistory());
  // Single state for all recommendations
  const [allRecommendations, setAllRecommendations] = useState<RecommendationItem[]>([]); 
  const [loadingRecommendations, setLoadingRecommendations] = useState<boolean>(true);
  const isFetchingMoreRef = useRef<boolean>(false); // Using ref for immediate check
  const [displayedPageIds, setDisplayedPageIds] = useState<Set<number>>(new Set()); // Track displayed articles
  const initialFetchCalledRef = useRef(false); // To prevent double initial fetch in strict mode
  const [carouselCurrentIndex, setCarouselCurrentIndex] = useState<number>(0); // For lifted state

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
  const fetchAndProcessRecommendations = useCallback(async (isInitial: boolean, currentGlobalIdsAtCallTime: Set<number>) => {
    const currentFetchCycleId = ++fetchCycleIdCounter;
    console.log(`FETCH_PROCESS [ID: ${currentFetchCycleId}]: Called. isInitial: ${isInitial}, isFetchingMoreRef.current: ${isFetchingMoreRef.current}, currentGlobalIdsAtCallTime size: ${currentGlobalIdsAtCallTime.size}`);
    
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

    // Fetch Personalized (mostly for initial load or if history changes significantly)
    if (isInitial && rawHistory.length > 0) {
      const recentUniqueTitles = rawHistory.slice().sort((a,b) => b.timestamp - a.timestamp).map(item => item.title).filter((v,i,s) => s.indexOf(v)===i).slice(0,4);
      console.log(`FETCH_PROCESS [ID: ${currentFetchCycleId}]: Personalized seed titles:`, recentUniqueTitles);
      if (recentUniqueTitles.length > 0) {
        try {
          const personalizedPromises = recentUniqueTitles.map(async (sourceTitle) => {
            const recs = await getMoreLikeArticles(sourceTitle.replace(/ /g, '_'), 5);
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
        console.log(`FETCH_PROCESS [ID: ${currentFetchCycleId}]: No raw history for personalized recs on initial load.`);
    }

    // Fetch Trending
    try {
      // Fetch more than needed to increase chance of getting new ones after filtering
      const trendingApiResults = await getTrendingArticles(isInitial ? Math.floor(INITIAL_LOAD_COUNT * 0.3) + 5 : FETCH_MORE_COUNT + 5); 
      console.log(`FETCH_PROCESS [ID: ${currentFetchCycleId}]: Raw trending API results (pageids):`, trendingApiResults.map(t => t.pageid));
      trendingRecs = trendingApiResults
        .filter(rec => rec.pageid && !idsToFilterAgainstThisBatch.has(rec.pageid))
        .map(rec => ({ recommendation: rec, reasonText: "Trending Today" }));
      console.log(`FETCH_PROCESS [ID: ${currentFetchCycleId}]: Filtered trending items (pageids):`, trendingRecs.map(t => t.recommendation.pageid));
    } catch (error) { console.error(`FETCH_PROCESS_ERROR [ID: ${currentFetchCycleId}]: Trending recs:`, error); }

    // Fetch Random
    try {
      const randomApiResults = await getRandomArticles(isInitial ? Math.floor(INITIAL_LOAD_COUNT * 0.2) + 5 : FETCH_MORE_COUNT + 5);
      console.log(`FETCH_PROCESS [ID: ${currentFetchCycleId}]: Raw random API results (pageids):`, randomApiResults.map(r => r.pageid));
      randomRecs = randomApiResults
        .filter(rec => rec.pageid && !idsToFilterAgainstThisBatch.has(rec.pageid))
        .map(rec => ({ recommendation: rec, reasonText: "Random Discovery" }));
      console.log(`FETCH_PROCESS [ID: ${currentFetchCycleId}]: Filtered random items (pageids):`, randomRecs.map(r => r.recommendation.pageid));
    } catch (error) { console.error(`FETCH_PROCESS_ERROR [ID: ${currentFetchCycleId}]: Random recs:`, error); }
    
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
    console.log(`FETCH_PROCESS [ID: ${currentFetchCycleId}]: New items before final unique filter (pageids):`, newItems.map(i => i.recommendation.pageid));

    const trulyNewItems = newItems.filter((item, index, self) =>
      item.recommendation.pageid &&
      !idsToFilterAgainstThisBatch.has(item.recommendation.pageid) && 
      index === self.findIndex(r => r.recommendation.pageid === item.recommendation.pageid)
    );
    console.log(`FETCH_PROCESS [ID: ${currentFetchCycleId}]: Truly new items to add (title, pageid, reason):`, trulyNewItems.map(i => ({ title: i.recommendation.title, pageid: i.recommendation.pageid, reason: i.reasonText })));
    
    if (trulyNewItems.length > 0) {
      setDisplayedPageIds(prevGlobalIds => {
        const updatedGlobalIds = new Set(prevGlobalIds);
        trulyNewItems.forEach(item => { if (item.recommendation.pageid) updatedGlobalIds.add(item.recommendation.pageid); });
        console.log(`FETCH_PROCESS_SETTER [ID: ${currentFetchCycleId}]: Updated global displayedPageIds. Old size: ${prevGlobalIds.size}, New items: ${trulyNewItems.length}, New global size: ${updatedGlobalIds.size}`);
        return updatedGlobalIds;
      });

      setAllRecommendations(prevRecs => {
        // Ensure trulyNewItems are ACTUALLY new compared to prevRecs, just in case of subtle race conditions
        const prevRecsPageIds = new Set(prevRecs.map(pr => pr.recommendation.pageid).filter(pid => pid !== undefined) as number[]);
        const actuallyNewToAdd = trulyNewItems.filter(newItem => 
          !newItem.recommendation.pageid || !prevRecsPageIds.has(newItem.recommendation.pageid)
        );

        if (actuallyNewToAdd.length < trulyNewItems.length) {
          console.warn(`FETCH_PROCESS_SETTER [ID: ${currentFetchCycleId}]: Filtered out ${trulyNewItems.length - actuallyNewToAdd.length} items from trulyNewItems because their pageIDs were already in prevRecs.`);
        }

        const combined = isInitial ? [...actuallyNewToAdd] : [...prevRecs, ...actuallyNewToAdd];
        const finalRecommendations = combined.sort(() => 0.5 - Math.random());
        console.log(`FETCH_PROCESS_SETTER [ID: ${currentFetchCycleId}]: Prev recs: ${prevRecs.length}, Filtered New: ${actuallyNewToAdd.length}, Final: ${finalRecommendations.length}`);
        
        const pageidCounts = finalRecommendations.reduce((acc, item) => {
          const pid = item.recommendation.pageid;
          if (pid) { acc[pid] = (acc[pid] || 0) + 1; }
          return acc;
        }, {} as Record<number, number>);
        const duplicatesInFinal = Object.entries(pageidCounts).filter(([_pid, count]) => count > 1);
        if (duplicatesInFinal.length > 0) {
          console.warn(`FETCH_PROCESS_SETTER_WARN [ID: ${currentFetchCycleId}]: Duplicates by pageID in finalRecommendations!`, JSON.stringify(duplicatesInFinal));
          duplicatesInFinal.forEach(([pid, count]) => {
              const dupItems = finalRecommendations.filter(r => r.recommendation.pageid === parseInt(pid));
              console.warn(` -> PageID ${pid} (count ${count}):`, JSON.stringify(dupItems.map(d => ({title: d.recommendation.title, reason: d.reasonText}))));
          });
        }
        return finalRecommendations;
      });
    } else if (isInitial) {
        // If it's an initial load and no new items were found (e.g., all filtered out)
        // ensure recommendations isn't stuck with stale data if any.
        setAllRecommendations([]); 
        console.log(`FETCH_PROCESS [ID: ${currentFetchCycleId}]: Initial load, but no new items found after filtering. Setting empty recommendations.`);
    }

    if (isInitial) setLoadingRecommendations(false);
    if (!isInitial) {
        isFetchingMoreRef.current = false;
    }
    console.log(`FETCH_PROCESS [ID: ${currentFetchCycleId}]: Finished. isFetchingMoreRef.current is now: ${isFetchingMoreRef.current}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawHistory]); // Removed displayedPageIds, pass as arg. Added rawHistory.

  // Effect for initial data load & history changes
  useEffect(() => {
    if (initialFetchCalledRef.current && process.env.NODE_ENV === 'development') {
      return; // Prevent second call in StrictMode for initial data load
    }
    console.log("EFFECT_INIT: Initial load or rawHistory change. Resetting states and fetching.");
    setDisplayedPageIds(new Set());
    setAllRecommendations([]);                   // Clear existing recommendations
    isFetchingMoreRef.current = false;           // Ensure fetching isn't blocked
    setCarouselCurrentIndex(0); // Reset index for initial load / history change
    fetchAndProcessRecommendations(true, new Set()); // Pass a brand new empty set for initial global IDs
    
    if (process.env.NODE_ENV === 'development') {
        initialFetchCalledRef.current = true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawHistory]); // Only depends on rawHistory

  const handleCarouselIndexChange = (newIndex: number) => {
    setCarouselCurrentIndex(newIndex);
  };

  const handleOnNearEnd = useCallback(() => {
    // Pass a NEW COPY of the current displayedPageIds to fetchAndProcessRecommendations
    // This ensures the fetch operation uses the IDs known at the moment it's called.
    const currentGlobalIdsForFetchMore = new Set(displayedPageIds);
    console.log(`CALLBACK_NEAR_END: Triggered. Current recs: ${allRecommendations.length}, Current global IDs for next fetch: ${currentGlobalIdsForFetchMore.size}`);
    fetchAndProcessRecommendations(false, currentGlobalIdsForFetchMore);
  }, [fetchAndProcessRecommendations, displayedPageIds, allRecommendations.length]);

  console.log("RENDER: LoadingStates:", {loadingRecommendations, isFetchingMore: isFetchingMoreRef.current});
  console.log("RENDER: Recommendations count:", allRecommendations.length, "CarouselIndex:", carouselCurrentIndex);

  return (
    <div className="home-page">
      {(loadingRecommendations && allRecommendations.length === 0) && 
        <div className="loading-recommendations">Loading recommendations...</div>}
      
      {allRecommendations.length > 0 && (
        <div className="recommendation-stream">
          <RecommendationCarousel 
            recommendations={allRecommendations} 
            onNearEnd={handleOnNearEnd}
            currentIndex={carouselCurrentIndex} // Pass state down
            onCurrentIndexChange={handleCarouselIndexChange} // Pass callback down
          />
        </div>
      )}

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