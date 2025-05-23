import { getDidYouKnowFacts, DidYouKnowEntry } from '../api/wikipedia';

let dykPromise: Promise<DidYouKnowEntry[]> | null = null;
let preloadedDykFacts: DidYouKnowEntry[] | null = null;
let preloadError: Error | null = null;

export const initiateDykPreload = (): void => {
  if (dykPromise === null) {
    console.log('PRELOAD_SERVICE: Initiating DYK preload...');
    dykPromise = getDidYouKnowFacts(10) // Fetch a slightly larger pool for variety
      .then(facts => {
        console.log(`PRELOAD_SERVICE: Successfully preloaded ${facts.length} DYK facts.`);
        preloadedDykFacts = facts;
        return facts;
      })
      .catch(err => {
        console.error('PRELOAD_SERVICE: Error during DYK preload:', err);
        preloadError = err;
        preloadedDykFacts = []; // Ensure it's an empty array on error for consumers
        throw err; // Re-throw so consumers of the direct promise can also catch
      });
  }
};

export const getPreloadedDykData = (): {
  facts: DidYouKnowEntry[] | null;
  isLoading: boolean;
  error: Error | null;
 } => {
  if (preloadedDykFacts !== null) {
    return { facts: preloadedDykFacts, isLoading: false, error: preloadError };
  }
  // If dykPromise exists but preloadedDykFacts is null, it's still loading
  return { facts: null, isLoading: dykPromise !== null && preloadError === null, error: preloadError };
};

// Optional: If a component prefers to await the promise directly
export const getDykPreloadPromise = (): Promise<DidYouKnowEntry[]> | null => {
  return dykPromise;
}; 