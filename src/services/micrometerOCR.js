/**
 * Micrometer OCR Reader - JavaScript Version
 * Specialized for reading digital micrometer displays using Azure OCR
 */

// Import the base Azure OCR function
import { extractTextFromImage } from './azureOCR';

/**
 * Preprocess micrometer image for better OCR accuracy
 * - Handles vertical displays
 * - Enhances contrast for LCD screens
 * - Inverts colors if needed (white on black display)
 * @param {string} imageDataUrl - Base64 data URL
 * @returns {Promise<string>} - Processed base64 data URL
 */
export const preprocessMicrometerImage = async (imageDataUrl) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        let width = img.width;
        let height = img.height;

        // Check if image is vertical (micrometer display often vertical)
        const isVertical = height > width * 1.5;

        if (isVertical) {
          // Rotate 90 degrees for horizontal reading
          canvas.width = height;
          canvas.height = width;
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.rotate(Math.PI / 2);
          ctx.drawImage(img, -width / 2, -height / 2);
          console.log('Micrometer image rotated for horizontal reading');
        } else {
          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0);
        }

        // Get image data for processing
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Analyze if image is dark (LCD display with light digits)
        let totalBrightness = 0;
        for (let i = 0; i < data.length; i += 4) {
          totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
        }
        const avgBrightness = totalBrightness / (data.length / 4);
        const isDarkBackground = avgBrightness < 128;

        // Process pixels - enhance contrast and optionally invert
        for (let i = 0; i < data.length; i += 4) {
          let r = data[i];
          let g = data[i + 1];
          let b = data[i + 2];

          // Convert to grayscale
          let gray = 0.299 * r + 0.587 * g + 0.114 * b;

          // Enhance contrast
          gray = ((gray - 128) * 2.5) + 128;
          gray = Math.max(0, Math.min(255, gray));

          // Invert if dark background (make digits dark on light background)
          if (isDarkBackground) {
            gray = 255 - gray;
          }

          // Apply threshold for cleaner digits
          gray = gray > 128 ? 255 : 0;

          data[i] = gray;
          data[i + 1] = gray;
          data[i + 2] = gray;
        }

        ctx.putImageData(imageData, 0, 0);

        // Scale up for better OCR
        const scaledCanvas = document.createElement('canvas');
        const scaleFactor = Math.max(2, 800 / canvas.width);
        scaledCanvas.width = canvas.width * scaleFactor;
        scaledCanvas.height = canvas.height * scaleFactor;
        const scaledCtx = scaledCanvas.getContext('2d');
        scaledCtx.imageSmoothingEnabled = true;
        scaledCtx.imageSmoothingQuality = 'high';
        scaledCtx.drawImage(canvas, 0, 0, scaledCanvas.width, scaledCanvas.height);

        const processedDataUrl = scaledCanvas.toDataURL('image/png');
        console.log('Micrometer image preprocessed successfully');
        resolve(processedDataUrl);

      } catch (err) {
        reject(new Error('Image preprocessing failed: ' + err.message));
      }
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageDataUrl;
  });
};


/**
 * Parse micrometer value from OCR text
 * Handles various formats and common OCR errors
 * @param {string} ocrText - Raw text from OCR
 * @returns {number|null} - Parsed numeric value or null
 */
export const parseMicrometerValue = (ocrText) => {
  if (!ocrText || typeof ocrText !== 'string') {
    return null;
  }

  console.log('Parsing micrometer text:', ocrText);

  // Clean up text
  let text = ocrText.trim();

  // Common OCR corrections for LCD digits
  const corrections = {
    'O': '0', 'o': '0',
    'I': '1', 'l': '1', 'i': '1', '|': '1',
    'B': '8', 'b': '8',
    'S': '5', 's': '5',
    'Z': '2', 'z': '2',
    'G': '6', 'g': '6',
    'q': '9', 'Q': '9',
    'A': '4', 'a': '4',
    ' ': '',  // Remove spaces
  };

  for (const [wrong, correct] of Object.entries(corrections)) {
    text = text.split(wrong).join(correct);
  }

  // Pattern 1: Standard decimal number (0.128, 0,128, 12.34)
  const decimalPattern = /(\d+[.,]\d+)/g;
  const decimalMatches = text.match(decimalPattern);
  if (decimalMatches && decimalMatches.length > 0) {
    const value = parseFloat(decimalMatches[0].replace(',', '.'));
    if (!isNaN(value)) {
      console.log('Found decimal value:', value);
      return value;
    }
  }

  // Pattern 2: Vertical reading - digits on separate lines
  const lines = ocrText.split(/[\n\r]+/).map(l => l.trim()).filter(l => l);
  if (lines.length > 1) {
    // Check if lines contain single digits
    const digits = [];
    let hasDecimal = false;
    let decimalPos = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Apply corrections
      let correctedLine = line;
      for (const [wrong, correct] of Object.entries(corrections)) {
        correctedLine = correctedLine.split(wrong).join(correct);
      }

      if (/^[.,]$/.test(correctedLine)) {
        hasDecimal = true;
        decimalPos = digits.length;
      } else if (/^\d$/.test(correctedLine)) {
        digits.push(correctedLine);
      } else if (/^\d+$/.test(correctedLine)) {
        // Multiple digits in one line
        digits.push(...correctedLine.split(''));
      }
    }

    if (digits.length >= 2) {
      let numberStr = digits.join('');
      // Insert decimal point if found
      if (hasDecimal && decimalPos >= 0) {
        numberStr = numberStr.slice(0, decimalPos) + '.' + numberStr.slice(decimalPos);
      } else if (digits.length >= 3 && !numberStr.includes('.')) {
        // Assume format like 0128 should be 0.128
        numberStr = numberStr[0] + '.' + numberStr.slice(1);
      }

      const value = parseFloat(numberStr);
      if (!isNaN(value)) {
        console.log('Found vertical reading value:', value);
        return value;
      }
    }
  }

  // Pattern 3: Just digits without decimal (e.g., "0128" -> 0.128)
  const justDigits = text.replace(/[^\d]/g, '');
  if (justDigits.length >= 3 && justDigits.length <= 5) {
    // Common micrometer formats:
    // 0128 -> 0.128
    // 1234 -> 1.234 or 12.34
    // 01285 -> 0.1285

    if (justDigits.startsWith('0') && justDigits.length === 4) {
      // 0128 -> 0.128
      const value = parseFloat(justDigits[0] + '.' + justDigits.slice(1));
      if (!isNaN(value)) {
        console.log('Parsed digits as 0.xxx:', value);
        return value;
      }
    }
  }

  // Pattern 4: Any number in the text
  const anyNumber = text.match(/[\d.,]+/);
  if (anyNumber) {
    const cleaned = anyNumber[0].replace(',', '.');
    const value = parseFloat(cleaned);
    if (!isNaN(value)) {
      console.log('Found any number:', value);
      return value;
    }
  }

  console.log('Could not parse micrometer value');
  return null;
};


/**
 * Read micrometer value from image
 * Main function that combines preprocessing, OCR, and parsing
 * @param {string} imageDataUrl - Base64 data URL of micrometer image
 * @returns {Promise<{value: number|null, rawText: string, success: boolean}>}
 */
export const readMicrometerValue = async (imageDataUrl) => {
  const result = {
    value: null,
    rawText: '',
    success: false,
    error: null
  };

  try {
    console.log('Starting micrometer OCR...');

    // Step 1: Preprocess image
    console.log('Step 1: Preprocessing image...');
    const processedImage = await preprocessMicrometerImage(imageDataUrl);

    // Step 2: Run OCR
    console.log('Step 2: Running Azure OCR...');
    const ocrText = await extractTextFromImage(processedImage);
    result.rawText = ocrText;

    if (!ocrText || ocrText.trim().length === 0) {
      result.error = 'No text detected in image';
      return result;
    }

    // Step 3: Parse value
    console.log('Step 3: Parsing micrometer value...');
    const value = parseMicrometerValue(ocrText);

    if (value !== null) {
      result.value = value;
      result.success = true;
      console.log(`✓ Micrometer reading: ${value} mm`);
    } else {
      result.error = 'Could not parse numeric value from OCR text';
    }

    return result;

  } catch (error) {
    console.error('Micrometer OCR error:', error);
    result.error = error.message;
    return result;
  }
};


/**
 * Validate micrometer reading is within expected range
 * @param {number} value - Micrometer reading
 * @param {number} min - Minimum expected value (default 0)
 * @param {number} max - Maximum expected value (default 25mm for standard micrometer)
 * @returns {boolean}
 */
export const validateMicrometerReading = (value, min = 0, max = 25) => {
  if (value === null || isNaN(value)) {
    return false;
  }
  return value >= min && value <= max;
};


/**
 * Format micrometer reading with appropriate precision
 * @param {number} value - Micrometer reading
 * @param {number} decimals - Number of decimal places (default 3)
 * @returns {string}
 */
export const formatMicrometerReading = (value, decimals = 3) => {
  if (value === null || isNaN(value)) {
    return '--';
  }
  return value.toFixed(decimals) + ' mm';
};


export default {
  preprocessMicrometerImage,
  parseMicrometerValue,
  readMicrometerValue,
  validateMicrometerReading,
  formatMicrometerReading
};
