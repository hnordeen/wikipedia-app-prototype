import { RabbitHole, RabbitHoleEntry } from './rabbitHoleService';
import { getArticleImages, ArticleImage } from '../api/wikipedia';
import { formatTitleForDisplay } from '../utils/titleUtils';

const TIKTOK_WIDTH = 1080;
const TIKTOK_HEIGHT = 1920;
const START_NODE_SIZE = 280;
const END_NODE_SIZE = 280;
const MIDDLE_NODE_SIZE = 160;
const DOT_SIZE = 12;
const PATH_PADDING = 100;

interface ArticleWithImage extends RabbitHoleEntry {
  image?: ArticleImage;
}

// Fetch images for all articles in a rabbit hole
const fetchArticleImages = async (entries: RabbitHoleEntry[]): Promise<ArticleWithImage[]> => {
  const entriesWithImages: ArticleWithImage[] = [];
  
  for (const entry of entries) {
    try {
      const images = await getArticleImages(entry.title.replace(/ /g, '_'));
      entriesWithImages.push({
        ...entry,
        image: images.length > 0 ? images[0] : undefined
      });
    } catch (error) {
      console.error(`Error fetching image for ${entry.title}:`, error);
      entriesWithImages.push({
        ...entry,
        image: undefined
      });
    }
  }
  
  return entriesWithImages;
};

// Load an image from URL
const loadImage = (url: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
};

// Draw a rounded rectangle
const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) => {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
};

// Draw a node with image or dot
const drawNode = async (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  entry: ArticleWithImage,
  isStart: boolean,
  isEnd: boolean,
  isMiddle: boolean
) => {
  const size = isStart ? START_NODE_SIZE : isEnd ? END_NODE_SIZE : MIDDLE_NODE_SIZE;
  const centerX = x;
  const centerY = y;

  // If no image and it's a middle node, just draw a dot
  if (isMiddle && !entry.image?.url) {
    ctx.fillStyle = '#007bff';
    ctx.beginPath();
    ctx.arc(centerX, centerY, DOT_SIZE / 2, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw white border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.stroke();
    return;
  }

  // Draw gradient background for start/end, white for middle
  const gradient = ctx.createLinearGradient(centerX - size/2, centerY - size/2, centerX + size/2, centerY + size/2);
  if (isStart) {
    gradient.addColorStop(0, '#667eea');
    gradient.addColorStop(1, '#764ba2');
  } else if (isEnd) {
    gradient.addColorStop(0, '#f093fb');
    gradient.addColorStop(1, '#f5576c');
  } else {
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(1, '#f8f9fa');
  }
  
  ctx.fillStyle = gradient;
  drawRoundedRect(ctx, centerX - size/2, centerY - size/2, size, size, 20);
  ctx.fill();
  
  // Draw border
  ctx.strokeStyle = isStart || isEnd ? 'rgba(255, 255, 255, 0.4)' : '#dee2e6';
  ctx.lineWidth = isStart || isEnd ? 4 : 2;
  ctx.stroke();

  // Draw image if available
  if (entry.image?.url) {
    try {
      const img = await loadImage(entry.image.url);
      const imageSize = size - (isStart || isEnd ? 40 : 30);
      const imageX = centerX - imageSize/2;
      const imageY = centerY - imageSize/2 - (isStart || isEnd ? 20 : 15);
      
      // Draw image with rounded corners
      ctx.save();
      drawRoundedRect(ctx, imageX, imageY, imageSize, imageSize, 14);
      ctx.clip();
      ctx.drawImage(img, imageX, imageY, imageSize, imageSize);
      ctx.restore();
    } catch (error) {
      console.error('Error loading image:', error);
      // If image fails to load and it's middle, draw dot instead
      if (isMiddle) {
        ctx.fillStyle = '#007bff';
        ctx.beginPath();
        ctx.arc(centerX, centerY, DOT_SIZE / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.stroke();
        return;
      }
    }
  }

  // Draw title
  ctx.fillStyle = isStart || isEnd ? '#ffffff' : '#1a1a1a';
  const fontSize = isStart || isEnd ? 20 : 16;
  ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  
  const title = formatTitleForDisplay(entry.title);
  const maxWidth = size - 30;
  const words = title.split(' ');
  let lines: string[] = [];
  let currentLine = '';
  
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  
  // Limit to 2 lines for start/end, 1 for middle
  lines = lines.slice(0, isStart || isEnd ? 2 : 1);
  const lineHeight = fontSize + 4;
  const startY = centerY + size/2 - 15 - (lines.length - 1) * lineHeight;
  
  lines.forEach((line, index) => {
    ctx.fillText(line, centerX, startY + index * lineHeight);
  });

  // Draw badge for start/end
  if (isStart || isEnd) {
    ctx.fillStyle = isStart ? '#667eea' : '#f5576c';
    const badgeWidth = 70;
    const badgeHeight = 28;
    const badgeX = centerX - badgeWidth/2;
    const badgeY = centerY - size/2 + 12;
    
    drawRoundedRect(ctx, badgeX, badgeY, badgeWidth, badgeHeight, 14);
    ctx.fill();
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isStart ? 'START' : 'END', centerX, badgeY + badgeHeight/2);
  }
};

// Draw a winding path using bezier curves
const drawWindingPath = (
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[]
) => {
  if (points.length < 2) return;

  ctx.strokeStyle = '#007bff';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  
  // Create smooth bezier curves between points
  for (let i = 0; i < points.length - 1; i++) {
    const current = points[i];
    const next = points[i + 1];
    
    if (i === 0) {
      // First segment - straight or slight curve
      const controlX = current.x + (next.x - current.x) * 0.3;
      const controlY = current.y + (next.y - current.y) * 0.3;
      ctx.quadraticCurveTo(controlX, controlY, next.x, next.y);
    } else if (i === points.length - 2) {
      // Last segment
      const prev = points[i - 1];
      const controlX = current.x + (next.x - current.x) * 0.7;
      const controlY = current.y + (next.y - current.y) * 0.7;
      ctx.quadraticCurveTo(controlX, controlY, next.x, next.y);
    } else {
      // Middle segments - create winding effect
      const prev = points[i - 1];
      const nextNext = points[i + 2];
      
      // Calculate control points for smooth curves with some randomness
      const dx1 = (next.x - prev.x) * 0.3;
      const dy1 = (next.y - prev.y) * 0.3;
      const dx2 = (nextNext.x - current.x) * 0.3;
      const dy2 = (nextNext.y - current.y) * 0.3;
      
      const cp1x = current.x + dx1;
      const cp1y = current.y + dy1;
      const cp2x = next.x - dx2;
      const cp2y = next.y - dy2;
      
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, next.x, next.y);
    }
  }
  
  ctx.stroke();
  
  // Draw arrow at the end
  if (points.length >= 2) {
    const last = points[points.length - 1];
    const secondLast = points[points.length - 2];
    const angle = Math.atan2(last.y - secondLast.y, last.x - secondLast.x);
    const arrowSize = 14;
    const arrowX = last.x - Math.cos(angle) * 20;
    const arrowY = last.y - Math.sin(angle) * 20;
    
    ctx.fillStyle = '#007bff';
    ctx.beginPath();
    ctx.moveTo(arrowX, arrowY);
    ctx.lineTo(
      arrowX - arrowSize * Math.cos(angle - Math.PI / 6),
      arrowY - arrowSize * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      arrowX - arrowSize * Math.cos(angle + Math.PI / 6),
      arrowY - arrowSize * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
  }
};

// Generate TikTok-format image for a rabbit hole
export const generateRabbitHoleImage = async (rabbitHole: RabbitHole): Promise<string> => {
  const canvas = document.createElement('canvas');
  canvas.width = TIKTOK_WIDTH;
  canvas.height = TIKTOK_HEIGHT;
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  // Fetch images for all entries
  const entriesWithImages = await fetchArticleImages(rabbitHole.entries);
  
  // Draw background gradient
  const bgGradient = ctx.createLinearGradient(0, 0, 0, TIKTOK_HEIGHT);
  bgGradient.addColorStop(0, '#f8f9fa');
  bgGradient.addColorStop(1, '#e9ecef');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, TIKTOK_WIDTH, TIKTOK_HEIGHT);
  
  // Draw header
  const centerX = TIKTOK_WIDTH / 2;
  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 36px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('🐰 My Wikipedia Rabbit Hole', centerX, 50);
  
  ctx.fillStyle = '#666';
  ctx.font = '18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(`${rabbitHole.entries.length} articles • ${formatDuration(rabbitHole.duration)}`, centerX, 100);
  
  // Calculate path points - create a winding path from start to end
  const startEntry = entriesWithImages[0];
  const endEntry = entriesWithImages[entriesWithImages.length - 1];
  const middleEntries = entriesWithImages.slice(1, -1);
  
  // Define start and end positions (prominent placement)
  const startX = PATH_PADDING + START_NODE_SIZE / 2;
  const startY = 200;
  const endX = TIKTOK_WIDTH - PATH_PADDING - END_NODE_SIZE / 2;
  const endY = TIKTOK_HEIGHT - 250;
  
  // Calculate path points with winding effect
  const pathPoints: { x: number; y: number }[] = [];
  
  // Add start point
  pathPoints.push({ x: startX, y: startY });
  
  // Add middle points with winding path
  if (middleEntries.length > 0) {
    const totalDistance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
    const segmentLength = totalDistance / (middleEntries.length + 1);
    
    for (let i = 0; i < middleEntries.length; i++) {
      const t = (i + 1) / (middleEntries.length + 1);
      const baseX = startX + (endX - startX) * t;
      const baseY = startY + (endY - startY) * t;
      
      // Add winding effect - alternate sides of the path
      const amplitude = 80;
      const frequency = 2;
      const offsetX = Math.sin(t * Math.PI * frequency) * amplitude;
      const offsetY = Math.cos(t * Math.PI * frequency) * amplitude * 0.5;
      
      pathPoints.push({
        x: baseX + offsetX,
        y: baseY + offsetY
      });
    }
  }
  
  // Add end point
  pathPoints.push({ x: endX, y: endY });
  
  // Draw the winding path first (behind nodes)
  drawWindingPath(ctx, pathPoints);
  
  // Draw all nodes along the path
  // Start node
  await drawNode(ctx, pathPoints[0].x, pathPoints[0].y, startEntry, true, false, false);
  
  // Middle nodes
  for (let i = 0; i < middleEntries.length; i++) {
    const point = pathPoints[i + 1];
    await drawNode(ctx, point.x, point.y, middleEntries[i], false, false, true);
  }
  
  // End node
  await drawNode(ctx, pathPoints[pathPoints.length - 1].x, pathPoints[pathPoints.length - 1].y, endEntry, false, true, false);
  
  // Draw footer
  ctx.fillStyle = '#999';
  ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('Wikipedia App', centerX, TIKTOK_HEIGHT - 40);
  
  return canvas.toDataURL('image/png');
};

const formatDuration = (ms: number): string => {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
};

// Download the generated image
export const downloadRabbitHoleImage = (dataUrl: string, filename: string) => {
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  link.click();
};
