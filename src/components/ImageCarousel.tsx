import React, { useState, useRef, TouchEvent } from 'react';
import './ImageCarousel.css';

interface ImageCarouselProps {
  images: {
    url: string;
    alt: string;
  }[];
}

const ImageCarousel: React.FC<ImageCarouselProps> = ({ images }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const touchStartX = useRef<number>(0);
  const touchEndX = useRef<number>(0);

  const handleImageLoad = (src: string) => {
    console.log('Image loaded successfully:', src);
  };

  const handleImageError = (src: string, e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    console.error('Error loading image:', src, e);
  };

  const handleTouchStart = (e: TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    const difference = touchStartX.current - touchEndX.current;
    if (Math.abs(difference) > 50) { // Minimum swipe distance
      if (difference > 0 && currentIndex < images.length - 1) {
        // Swipe left
        setCurrentIndex(prev => prev + 1);
      } else if (difference < 0 && currentIndex > 0) {
        // Swipe right
        setCurrentIndex(prev => prev - 1);
      }
    }
  };

  if (!images.length) {
    console.log('No images provided to carousel');
    return null;
  }

  // Simple image display for single image
  if (images.length === 1) {
    return (
      <div className="carousel-container">
        <div className="carousel-slide">
          <img
            key={images[0].url}
            src={images[0].url}
            alt={images[0].alt}
            loading="lazy"
            onLoad={() => handleImageLoad(images[0].url)}
            onError={(e) => handleImageError(images[0].url, e)}
          />
        </div>
      </div>
    );
  }

  // Full carousel for multiple images
  return (
    <div className="carousel-container">
      <div 
        className="carousel-track"
        style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {images.map((image, index) => (
          <div key={index} className="carousel-slide">
            <img
              src={image.url}
              alt={image.alt}
              loading="lazy"
              onLoad={() => handleImageLoad(image.url)}
              onError={(e) => handleImageError(image.url, e)}
            />
          </div>
        ))}
      </div>
      <div className="carousel-dots">
        {images.map((_, index) => (
          <button
            key={index}
            className={`carousel-dot ${index === currentIndex ? 'active' : ''}`}
            onClick={() => setCurrentIndex(index)}
            aria-label={`Go to image ${index + 1}`}
          />
        ))}
      </div>
      <button
        className="carousel-arrow left"
        onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
        disabled={currentIndex === 0}
        aria-label="Previous image"
      >
        ‹
      </button>
      <button
        className="carousel-arrow right"
        onClick={() => setCurrentIndex(prev => Math.min(images.length - 1, prev + 1))}
        disabled={currentIndex === images.length - 1}
        aria-label="Next image"
      >
        ›
      </button>
    </div>
  );
};

export default ImageCarousel; 