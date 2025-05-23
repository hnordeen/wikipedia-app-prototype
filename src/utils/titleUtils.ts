/**
 * Formats a Wikipedia title for display by:
 * 1. Decoding URI components
 * 2. Replacing underscores with spaces
 * 3. Handling special characters
 */
export const formatTitleForDisplay = (title: string): string => {
  let formattedTitle: string;
  try {
    formattedTitle = decodeURIComponent(title).replace(/_/g, ' ');
  } catch (e) {
    // If decoding fails, just replace underscores
    formattedTitle = title.replace(/_/g, ' ');
  }

  const maxLength = 30; // Max characters for display
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  if (isMobile && formattedTitle.length > maxLength) {
    return formattedTitle.substring(0, maxLength - 3) + '...'; // Reserve 3 chars for ellipsis
  }
  return formattedTitle;
};

/**
 * Formats a title for use in URLs by:
 * 1. Replacing spaces with underscores
 * 2. Encoding URI components
 */
export const formatTitleForUrl = (title: string): string => {
  return encodeURIComponent(title.replace(/ /g, '_'));
}; 