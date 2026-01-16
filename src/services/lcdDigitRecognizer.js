/**
 * LCD 7-Segment Digit Recognizer
 * Optimized for Micrometer displays - only recognizes 0-9 and decimal point
 */

/**
 * 7-Segment Display Pattern Reference:
 * 
 *    aaaa
 *   f    b
 *   f    b
 *    gggg
 *   e    c
 *   e    c
 *    dddd
 * 
 * Segments: [a, b, c, d, e, f, g] = [top, topRight, bottomRight, bottom, bottomLeft, topLeft, middle]
 */

const SEGMENT_PATTERNS = {
  0: [1, 1, 1, 1, 1, 1, 0],  // All except middle
  1: [0, 1, 1, 0, 0, 0, 0],  // Only right side
  2: [1, 1, 0, 1, 1, 0, 1],  // Top, topRight, middle, bottomLeft, bottom
  3: [1, 1, 1, 1, 0, 0, 1],  // Top, right side, middle, bottom
  4: [0, 1, 1, 0, 0, 1, 1],  // TopLeft, middle, right side
  5: [1, 0, 1, 1, 0, 1, 1],  // Top, topLeft, middle, bottomRight, bottom
  6: [1, 0, 1, 1, 1, 1, 1],  // All except topRight
  7: [1, 1, 1, 0, 0, 0, 0],  // Top and right side only
  8: [1, 1, 1, 1, 1, 1, 1],  // All segments
  9: [1, 1, 1, 1, 0, 1, 1],  // All except bottomLeft
};

/**
 * Find the LCD display area (bright rectangular region)
 */
function findLCDRegion(imageData) {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  
  // Convert to grayscale and find bright regions
  const gray = [];
  for (let y = 0; y < height; y++) {
    gray[y] = [];
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      gray[y][x] = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
    }
  }
  
  // Find the brightest rectangular region (LCD background is bright)
  // Scan horizontal lines to find bright region
  let minY = height, maxY = 0, minX = width, maxX = 0;
  const brightThreshold = 150; // LCD background is bright
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (gray[y][x] > brightThreshold) {
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }
  
  // Add small padding
  const pad = 5;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);
  
  console.log('LCD Region found:', minX, minY, 'to', maxX, maxY);
  
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Preprocess image - convert to binary (black digits on white background)
 */
function preprocessImage(imageData) {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  
  // For LCD displays: background is bright greenish, digits are dark
  // First find the range of brightness values
  let minGray = 255, maxGray = 0;
  const grayValues = [];
  
  for (let i = 0; i < data.length; i += 4) {
    // Convert to grayscale - LCD digits are darker
    const gray = Math.round((data[i] + data[i + 1] + data[i + 2]) / 3);
    grayValues.push(gray);
    if (gray < minGray) minGray = gray;
    if (gray > maxGray) maxGray = gray;
  }
  
  console.log('Gray range:', minGray, '-', maxGray);
  
  // Use adaptive threshold based on range
  // Digits are in the lower part of the range
  const range = maxGray - minGray;
  const threshold = minGray + range * 0.4; // Lower 40% is digit, upper 60% is background
  
  console.log('Using threshold:', threshold);
  
  // Apply threshold - LCD digits are DARKER
  for (let i = 0; i < data.length; i += 4) {
    const gray = grayValues[i / 4];
    // Dark pixels (digits) -> BLACK, Light pixels (background) -> WHITE
    const binary = gray < threshold ? 0 : 255;
    data[i] = binary;
    data[i + 1] = binary;
    data[i + 2] = binary;
  }
  
  return { threshold };
}

/**
 * Find digit boundaries using vertical projection
 */
function findDigitBoundaries(imageData) {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  
  // Count black pixels in each column
  const projection = [];
  for (let x = 0; x < width; x++) {
    let count = 0;
    for (let y = 0; y < height; y++) {
      const idx = (y * width + x) * 4;
      if (data[idx] === 0) count++; // Black pixel
    }
    projection.push(count);
  }
  
  // Find the digit area (where most black pixels are)
  const maxProj = Math.max(...projection);
  const threshold = maxProj * 0.05; // Very low threshold to catch thin segments
  
  console.log('Max projection:', maxProj, 'threshold:', threshold);
  
  // Find start and end of digit area
  let digitStart = 0, digitEnd = width - 1;
  for (let x = 0; x < width; x++) {
    if (projection[x] > threshold) {
      digitStart = x;
      break;
    }
  }
  for (let x = width - 1; x >= 0; x--) {
    if (projection[x] > threshold) {
      digitEnd = x;
      break;
    }
  }
  
  const digitAreaWidth = digitEnd - digitStart;
  console.log('Digit area:', digitStart, 'to', digitEnd, 'width:', digitAreaWidth);
  
  // For LCD displays, digits are evenly spaced
  // Estimate digit width based on typical LCD: 4 digits in display
  // But we need to detect individual digits
  
  // Find gaps between digits (columns with very few black pixels)
  const gapThreshold = maxProj * 0.1;
  const gaps = [];
  let inGap = false;
  let gapStart = 0;
  
  for (let x = digitStart; x <= digitEnd; x++) {
    if (projection[x] < gapThreshold && !inGap) {
      inGap = true;
      gapStart = x;
    } else if (projection[x] >= gapThreshold && inGap) {
      inGap = false;
      const gapWidth = x - gapStart;
      if (gapWidth >= 2) { // Minimum gap width
        gaps.push({ start: gapStart, end: x, width: gapWidth });
      }
    }
  }
  
  console.log('Found gaps:', gaps.length, gaps);
  
  // If no gaps found, try to split evenly
  const boundaries = [];
  
  if (gaps.length === 0) {
    // No gaps detected - split digit area into 4 equal parts (typical LCD: X.XXX)
    const numDigits = 4;
    const digitWidth = digitAreaWidth / numDigits;
    
    for (let i = 0; i < numDigits; i++) {
      const x = digitStart + i * digitWidth;
      boundaries.push({
        x: Math.round(x),
        width: Math.round(digitWidth)
      });
    }
    console.log('Split evenly into', numDigits, 'digits');
  } else {
    // Use gaps to find digit regions
    let currentX = digitStart;
    for (const gap of gaps) {
      if (gap.start > currentX) {
        boundaries.push({
          x: currentX,
          width: gap.start - currentX
        });
      }
      currentX = gap.end;
    }
    // Add last digit
    if (currentX < digitEnd) {
      boundaries.push({
        x: currentX,
        width: digitEnd - currentX
      });
    }
  }
  
  // Find vertical bounds for each digit region
  const digits = [];
  for (const bound of boundaries) {
    let minY = height, maxY = 0;
    for (let x = bound.x; x < bound.x + bound.width && x < width; x++) {
      for (let y = 0; y < height; y++) {
        const idx = (y * width + x) * 4;
        if (data[idx] === 0) {
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    
    if (maxY > minY && bound.width > 3) {
      digits.push({
        x: bound.x,
        y: minY,
        width: bound.width,
        height: maxY - minY + 1
      });
    }
  }
  
  console.log('Final digit regions:', digits.length);
  return digits;
}

/**
 * Check if region is a decimal point (small and roughly square)
 */
function isDecimalPoint(region, avgHeight, avgWidth) {
  // Decimal point is much smaller than digits
  const isShort = region.height < avgHeight * 0.5;
  const isNarrow = region.width < avgWidth * 0.5;
  return isShort && isNarrow;
}

/**
 * Analyze segment presence in a digit region
 */
function analyzeDigitSegments(imageData, region) {
  const data = imageData.data;
  const imgWidth = imageData.width;
  const { x, y, width: w, height: h } = region;
  
  // Define segment zones (relative to digit bounding box)
  // [startX%, startY%, endX%, endY%]
  const segmentZones = {
    a: [0.1, 0.0, 0.9, 0.2],      // Top horizontal
    b: [0.6, 0.05, 1.0, 0.5],     // Top-right vertical
    c: [0.6, 0.5, 1.0, 0.95],     // Bottom-right vertical
    d: [0.1, 0.8, 0.9, 1.0],      // Bottom horizontal
    e: [0.0, 0.5, 0.4, 0.95],     // Bottom-left vertical
    f: [0.0, 0.05, 0.4, 0.5],     // Top-left vertical
    g: [0.1, 0.4, 0.9, 0.6],      // Middle horizontal
  };
  
  const segments = [];
  const segmentOrder = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  
  for (const segName of segmentOrder) {
    const [x1p, y1p, x2p, y2p] = segmentZones[segName];
    const sx = Math.floor(x + w * x1p);
    const sy = Math.floor(y + h * y1p);
    const ex = Math.ceil(x + w * x2p);
    const ey = Math.ceil(y + h * y2p);
    
    let blackPixels = 0;
    let totalPixels = 0;
    
    for (let py = sy; py < ey; py++) {
      for (let px = sx; px < ex; px++) {
        if (px >= 0 && px < imgWidth && py >= 0) {
          const idx = (py * imgWidth + px) * 4;
          if (idx < data.length) {
            totalPixels++;
            if (data[idx] === 0) blackPixels++; // Black = digit
          }
        }
      }
    }
    
    // Segment is ON if enough black pixels
    const ratio = totalPixels > 0 ? blackPixels / totalPixels : 0;
    segments.push(ratio > 0.2 ? 1 : 0);
  }
  
  return segments;
}

/**
 * Match segment pattern to digit
 */
function matchPatternToDigit(segments) {
  let bestDigit = '?';
  let bestScore = 0;
  
  for (const [digit, pattern] of Object.entries(SEGMENT_PATTERNS)) {
    let score = 0;
    for (let i = 0; i < 7; i++) {
      if (segments[i] === pattern[i]) score++;
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestDigit = digit;
    }
  }
  
  // Need at least 5/7 match
  return bestScore >= 5 ? bestDigit : '?';
}

/**
 * Main recognition function
 */
export function recognizeLCDDigits(input) {
  let canvas, ctx, imageData;
  
  // Handle different input types
  if (input instanceof HTMLCanvasElement) {
    canvas = input;
    ctx = canvas.getContext('2d');
    imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  } else if (input instanceof ImageData) {
    imageData = input;
    canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    ctx = canvas.getContext('2d');
    ctx.putImageData(imageData, 0, 0);
  } else {
    return { value: null, text: '', confidence: 0, error: 'Invalid input' };
  }
  
  console.log('Original image size:', imageData.width, 'x', imageData.height);
  
  // Step 1: Find and crop LCD region (bright area)
  const lcdRegion = findLCDRegion(imageData);
  console.log('LCD region:', lcdRegion);
  
  // Create cropped canvas for LCD area only
  const lcdCanvas = document.createElement('canvas');
  lcdCanvas.width = lcdRegion.width;
  lcdCanvas.height = lcdRegion.height;
  const lcdCtx = lcdCanvas.getContext('2d');
  lcdCtx.drawImage(canvas, lcdRegion.x, lcdRegion.y, lcdRegion.width, lcdRegion.height, 0, 0, lcdRegion.width, lcdRegion.height);
  
  let lcdImageData = lcdCtx.getImageData(0, 0, lcdCanvas.width, lcdCanvas.height);
  console.log('LCD cropped size:', lcdCanvas.width, 'x', lcdCanvas.height);
  
  // Step 2: Preprocess LCD region - threshold to get black digits on white
  preprocessImage(lcdImageData);
  lcdCtx.putImageData(lcdImageData, 0, 0);
  
  // Copy back to main canvas for preview
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(lcdCanvas, 0, 0);
  
  // Step 3: Find digit regions
  const regions = findDigitBoundaries(lcdImageData);
  console.log('Found', regions.length, 'regions');
  
  if (regions.length === 0) {
    return { value: null, text: '', confidence: 0, error: 'No digits found', regions: 0 };
  }
  
  // Calculate average height and width (excluding very small regions)
  const heights = regions.map(r => r.height).filter(h => h > 5);
  const widths = regions.map(r => r.width).filter(w => w > 3);
  const avgHeight = heights.length > 0 ? 
    heights.reduce((a, b) => a + b, 0) / heights.length : 50;
  const avgWidth = widths.length > 0 ?
    widths.reduce((a, b) => a + b, 0) / widths.length : 30;
  
  console.log('Average digit height:', avgHeight, 'width:', avgWidth);
  
  // Step 4: Recognize each region
  let result = '';
  let recognized = 0;
  
  // Sort regions left to right
  regions.sort((a, b) => a.x - b.x);
  
  for (const region of regions) {
    console.log('Region:', region.x, region.y, region.width, 'x', region.height);
    
    if (isDecimalPoint(region, avgHeight, avgWidth)) {
      result += '.';
      console.log('  -> Decimal point');
    } else {
      const segments = analyzeDigitSegments(lcdImageData, region);
      const digit = matchPatternToDigit(segments);
      result += digit;
      console.log('  -> Segments:', segments.join(''), '-> Digit:', digit);
      if (digit !== '?') recognized++;
    }
  }
  
  // Step 5: Clean up result
  let cleaned = result.replace(/^\?+/, '').replace(/\?+$/, '');
  
  // If result looks like "0123" without decimal, make it "0.123"
  if (cleaned.length === 4 && cleaned[0] === '0' && !cleaned.includes('.')) {
    cleaned = cleaned[0] + '.' + cleaned.slice(1);
  }
  // If looks like "123" without decimal and no leading 0, might be "0.123"
  if (cleaned.length === 3 && !cleaned.includes('.')) {
    cleaned = '0.' + cleaned;
  }
  
  const value = parseFloat(cleaned);
  const totalDigits = regions.filter(r => !isDecimalPoint(r, avgHeight, avgWidth)).length;
  const confidence = totalDigits > 0 ? Math.round((recognized / totalDigits) * 100) : 0;
  
  console.log('Result:', result, '-> Cleaned:', cleaned, '-> Value:', value);
  
  return {
    value: isNaN(value) ? null : value,
    text: result,
    cleaned: cleaned,
    confidence: confidence,
    regions: regions.length
  };
}

/**
 * Preprocess image from data URL
 */
export function preprocessForLCD(imageDataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Scale up for better digit detection
      const canvas = document.createElement('canvas');
      const targetWidth = 600; // Good size for digit detection
      const scale = targetWidth / img.width;
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      resolve({ canvas, imageData, ctx });
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageDataUrl;
  });
}

export default { recognizeLCDDigits, preprocessForLCD };
