import React, { useRef, TouchEvent, useEffect, useCallback } from 'react';
// Import RecommendationItem from HomePage or define it here if preferred
import { RecommendationItem } from '../pages/HomePage'; // Assuming HomePage exports it
import { useNavigate } from 'react-router-dom';
import './RecommendationCarousel.css'; // We'll create this CSS file

interface RecommendationCarouselProps {
  recommendations: RecommendationItem[];
  onNearEnd?: () => void;
  currentIndex: number; // Changed from internal state to prop
  onCurrentIndexChange: (index: number) => void; // Callback to parent
  // swipedOutItemKey: string | null; // This might also need to be managed by parent if swipe-out animation needs to persist across nav
  // onSwipeOutComplete: () => void; // If parent manages swipedOutItemKey
}

const SWIPE_THRESHOLD_X = 50; // Min horizontal distance for swipe-to-open
const SWIPE_THRESHOLD_Y = 50; // Min vertical distance for changing cards
const ANIMATION_DURATION = 300; // ms, should match CSS transition

const RecommendationCarousel: React.FC<RecommendationCarouselProps> = ({ 
  recommendations, 
  onNearEnd, 
  currentIndex, // Use prop
  onCurrentIndexChange // Use prop
}) => {
  const touchStartY = useRef<number>(0);
  const touchEndY = useRef<number>(0);
  const touchStartX = useRef<number>(0); // For horizontal swipe
  const touchEndX = useRef<number>(0);   // For horizontal swipe
  const navigate = useNavigate();
  const isInteracting = useRef(false); // To prevent clicks during swipe
  const swipedOutItemKeyRef = useRef<string | null>(null); // Manage locally for animation trigger

  // Effect to monitor currentIndex and trigger onNearEnd
  useEffect(() => {
    // Trigger when 3 items are left, and we have recommendations and the callback
    if (onNearEnd && recommendations.length > 0 && currentIndex >= recommendations.length - 3) {
      onNearEnd();
    }
  }, [currentIndex, recommendations, onNearEnd]); // recommendations.length removed as recommendations itself is a dep

  const getItemKey = useCallback((item: RecommendationItem, index: number): string => {
    return item.recommendation.pageid ? `rec-${item.recommendation.pageid}` : `rec-idx-${index}-${item.recommendation.title}`;
  }, []);

  const handleTouchStart = (e: TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchStartX.current = e.touches[0].clientX; // Store X
    isInteracting.current = true; // User starts interaction
  };

  const handleTouchMove = (e: TouchEvent) => {
    touchEndY.current = e.touches[0].clientY;
    touchEndX.current = e.touches[0].clientX; // Store X
  };

  const handleTouchEnd = () => {
    if (!isInteracting.current) return; // Should not happen if start was true

    const diffY = touchStartY.current - touchEndY.current;
    const diffX = touchStartX.current - touchEndX.current;

    let didNavigate = false;

    // Prioritize vertical swipe if it's dominant or clear
    if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > SWIPE_THRESHOLD_Y) {
      if (diffY > 0 && currentIndex < recommendations.length - 1) { // Swipe Up (next card)
        onCurrentIndexChange(currentIndex + 1); // Call parent to update index
      } else if (diffY < 0 && currentIndex > 0) { // Swipe Down (previous card)
        onCurrentIndexChange(currentIndex - 1); // Call parent to update index
      }
    } 
    // Check for horizontal swipe left to open article
    else if (diffX > SWIPE_THRESHOLD_X && Math.abs(diffX) > Math.abs(diffY)) { 
      const currentItem = recommendations[currentIndex];
      if (currentItem) {
        didNavigate = true;
        swipedOutItemKeyRef.current = getItemKey(currentItem, currentIndex);
        // Force a re-render to apply swiped-out class, then navigate
        // This is a bit of a hack; ideally parent manages swipedOutItemKey for cleaner animation state
        // For now, just trigger navigation after animation duration
        setTimeout(() => {
          navigate(`/article/${encodeURIComponent(currentItem.recommendation.title.replace(/ /g, '_'))}`);
          swipedOutItemKeyRef.current = null; // Reset after navigation (may not be needed if component unmounts)
        }, ANIMATION_DURATION);
      }
    }

    // Reset touch points
    touchStartY.current = 0;
    touchEndY.current = 0;
    touchStartX.current = 0;
    touchEndX.current = 0;
    if (!didNavigate) {
        setTimeout(() => { isInteracting.current = false; }, 100);
    }
  };
  
  // Prevent click if a swipe interaction just happened or is in progress
  const handlePotentialClick = (e: React.MouseEvent, title: string) => {
    if (isInteracting.current) {
      // Check if touchEndX/Y are close to startX/Y, indicating a tap rather than a swipe
      const tapThreshold = 10; // Small movement threshold for tap
      const dx = Math.abs(touchStartX.current - touchEndX.current);
      const dy = Math.abs(touchStartY.current - touchEndY.current);

      if (dx < tapThreshold && dy < tapThreshold && touchStartX.current !== 0) { // It was a tap
        // Allow navigation only if it was a clear tap (minimal movement)
      } else {
        e.preventDefault(); // It was part of a swipe, prevent click
        return;
      }
    }
    isInteracting.current = false; // Reset interaction lock immediately for click
    navigate(`/article/${encodeURIComponent(title.replace(/ /g, '_'))}`);
  };

  if (!recommendations || recommendations.length === 0) {
    // Optionally, render a message if no recommendations passed, though HomePage handles this.
    return null; 
  }
  
  // Calculate the height of a single slide for transform
  // This assumes all slides have the same height, which they will (100% of container)
  // The transform will be based on percentage.

  return (
    <div className="recommendation-carousel-container">
      <div
        className="recommendation-carousel-track"
        style={{ transform: `translateY(-${currentIndex * 100}%)` }} // Each slide is 100% height of container
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {recommendations.map((item, index) => {
          const itemKey = getItemKey(item, index);
          // Use the ref for swiped out key. This state is now local to the swipe action.
          const isSwipedOut = swipedOutItemKeyRef.current === itemKey;
          return (
            <div 
              key={itemKey} 
              className={`recommendation-carousel-slide ${isSwipedOut ? 'swiped-out-left' : ''}`}
              // onClick is now more complex to prevent firing during/after swipe
              onClick={(e) => handlePotentialClick(e, item.recommendation.title)}
              style={{ backgroundImage: `url(${item.recommendation.images && item.recommendation.images[0].url})` }}
            >
              <div className="because-you-read-tag">
                {item.reasonText.includes(":") ? (
                  <>
                    {item.reasonText.split(":")[0]}: <em>{item.reasonText.split(":").slice(1).join(":")}</em>
                  </>
                ) : (
                  item.reasonText
                )}
              </div>
              <div className="slide-overlay">
                <div className="slide-content">
                  <h4>{item.recommendation.title}</h4>
                  {item.recommendation.snippet && (
                    <div
                      className="recommendation-snippet-carousel"
                      dangerouslySetInnerHTML={{ __html: item.recommendation.snippet || '' }}
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default RecommendationCarousel; 