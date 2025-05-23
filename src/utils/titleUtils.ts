/**
 * Formats a Wikipedia title for display by:
 * 1. Decoding URI components
 * 2. Replacing underscores with spaces
 * 3. Handling special characters
 */
export const formatTitleForDisplay = (title: string): string => {
  try {
    return decodeURIComponent(title).replace(/_/g, ' ');
  } catch (e) {
    // If decoding fails, just replace underscores
    return title.replace(/_/g, ' ');
  }
};

/**
 * Formats a title for use in URLs by:
 * 1. Replacing spaces with underscores
 * 2. Encoding URI components
 */
export const formatTitleForUrl = (title: string): string => {
  return encodeURIComponent(title.replace(/ /g, '_'));
}; 