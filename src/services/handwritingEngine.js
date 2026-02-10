/**
 * Handwriting Engine Service
 * Generates authentic handwriting styles for IPQC Check Sheets
 * Makes software-generated text look like real blue pen handwriting
 */

// Available handwriting fonts (must be loaded via Google Fonts or locally)
// Prioritizing more realistic, casual handwriting fonts
// UPDATED: Using Windows system fonts that Excel supports by default
const HANDWRITING_FONTS = [
    'Segoe Script',     // Windows handwriting font (best for Excel)
    'Comic Sans MS',    // Casual handwriting-like (widely available)
    'Brush Script MT',  // Cursive handwriting
    'Lucida Handwriting', // Formal handwriting
    'Freestyle Script', // Casual script
    'Monotype Corsiva', // Elegant handwriting
    'Tempus Sans ITC',  // Informal handwriting
    'Bradley Hand ITC', // Natural handwriting
];


// Blue ink color variants (like real ball pen)
// Using darker, more realistic blue pen colors
const BLUE_INK_COLORS = [
    '#0D47A1', // Dark blue (most realistic)
    '#1565C0', // Deep blue
    '#1976D2', // Standard ballpoint blue
    '#1E88E5', // Medium blue
    '#2196F3', // Bright blue (fresh pen)
];

// Default blue pen color - darker for more realistic look
const DEFAULT_INK_COLOR = '#0D47A1';

/**
 * Generate a consistent random seed from a string (checklistId)
 * Same checklistId will always produce same "person's" handwriting
 */
function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
}

/**
 * Seeded random number generator
 * Returns consistent random values for same seed
 */
function seededRandom(seed) {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
}

/**
 * Generate handwriting style for a specific checklist
 * Same checklistId will always get same "person's" handwriting
 * 
 * @param {string} checklistId - Unique identifier for the checklist
 * @returns {Object} - Handwriting style configuration
 */
export function getHandwritingStyle(checklistId = 'default') {
    const hash = hashString(checklistId);
    const rand = seededRandom(hash);

    // Pick consistent font for this "person"
    const fontIndex = Math.floor(rand * HANDWRITING_FONTS.length);
    const font = HANDWRITING_FONTS[fontIndex];

    // Pick ink color variant (mostly deep blue, sometimes lighter)
    const colorIndex = Math.floor(seededRandom(hash + 1) * BLUE_INK_COLORS.length);
    const inkColor = BLUE_INK_COLORS[colorIndex];

    // Base font size (12-16pt range for more visible handwriting variation)
    const baseFontSize = 12 + Math.floor(seededRandom(hash + 2) * 5);

    // Slant angle for this person (-3 to +3 degrees)
    const baseSlant = (seededRandom(hash + 3) - 0.5) * 6;

    // Letter spacing tendency (-0.5px to +1.5px for more variation)
    const baseLetterSpacing = (seededRandom(hash + 4) - 0.3) * 2;

    return {
        fontFamily: font,
        inkColor: inkColor,
        baseFontSize: baseFontSize,
        baseSlant: baseSlant,
        baseLetterSpacing: baseLetterSpacing,
        personId: hash % 1000, // Unique "person" identifier
    };
}


/**
 * Apply natural variations to make each cell look hand-written
 * 
 * @param {Object} baseStyle - Base handwriting style from getHandwritingStyle
 * @param {number} cellIndex - Cell position for variation seed
 * @returns {Object} - Style with natural variations
 */
export function applyNaturalVariations(baseStyle, cellIndex = 0) {
    const seed = baseStyle.personId + cellIndex;

    // Font size variation (±2pt for more visible differences)
    const sizeVariation = (seededRandom(seed) - 0.5) * 4;
    const fontSize = baseStyle.baseFontSize + sizeVariation;

    // Rotation variation (±2 degrees on top of base slant)
    const rotationVariation = (seededRandom(seed + 100) - 0.5) * 4;
    const rotation = baseStyle.baseSlant + rotationVariation;

    // Letter spacing variation (more pronounced)
    const spacingVariation = (seededRandom(seed + 200) - 0.5) * 1;
    const letterSpacing = baseStyle.baseLetterSpacing + spacingVariation;

    // Vertical offset (slight baseline wobble, -2px to +2px)
    const verticalOffset = (seededRandom(seed + 300) - 0.5) * 4;

    // Horizontal offset (slight position variation)
    const horizontalOffset = (seededRandom(seed + 400) - 0.5) * 3;

    // Ink intensity variation (opacity 0.80 to 1.0 for more realistic pen pressure)
    const inkOpacity = 0.80 + (seededRandom(seed + 500) * 0.20);

    return {
        fontFamily: baseStyle.fontFamily,
        fontSize: `${Math.round(fontSize)}pt`,
        fontSizeNum: Math.round(fontSize),
        color: baseStyle.inkColor,
        rotation: `${rotation.toFixed(1)}deg`,
        rotationNum: rotation,
        letterSpacing: `${letterSpacing.toFixed(2)}px`,
        verticalOffset: `${verticalOffset.toFixed(1)}px`,
        horizontalOffset: `${horizontalOffset.toFixed(1)}px`,
        opacity: inkOpacity.toFixed(2),
    };
}


/**
 * Generate CSS style string for a handwritten cell
 * 
 * @param {Object} style - Style from applyNaturalVariations
 * @returns {string} - CSS style string
 */
export function getHandwritingCSS(style) {
    return `
    font-family: '${style.fontFamily}', cursive;
    font-size: ${style.fontSize};
    color: ${style.color};
    transform: rotate(${style.rotation}) translateY(${style.verticalOffset});
    letter-spacing: ${style.letterSpacing};
    opacity: ${style.opacity};
  `.replace(/\s+/g, ' ').trim();
}

/**
 * Generate ExcelJS-compatible style object for handwritten cell
 * 
 * @param {Object} style - Style from applyNaturalVariations
 * @returns {Object} - ExcelJS font and alignment settings
 */
export function getExcelHandwritingStyle(style) {
    return {
        font: {
            name: style.fontFamily,
            size: style.fontSizeNum,
            color: { argb: style.color.replace('#', 'FF') }, // Add alpha
            italic: false,
            bold: false,
        },
        alignment: {
            vertical: 'middle',
            horizontal: 'center',
            wrapText: true,
        }
    };
}

/**
 * Add slight imperfections to text to make it look more human
 * (Optional: can add character-level variations)
 * 
 * @param {string} text - Original text
 * @param {number} seed - Random seed
 * @returns {string} - Text with possible variations
 */
export function humanizeText(text, seed = 0) {
    if (!text) return text;

    // For now, just return original text
    // Future: could add slight typos, case variations, etc.
    return text.toString();
}

/**
 * Get all available handwriting fonts
 * 
 * @returns {Array<string>} - List of font names
 */
export function getAvailableFonts() {
    return [...HANDWRITING_FONTS];
}

/**
 * Get all blue ink color options
 * 
 * @returns {Array<string>} - List of hex colors
 */
export function getInkColors() {
    return [...BLUE_INK_COLORS];
}

/**
 * Get default ink color
 * 
 * @returns {string} - Hex color code
 */
export function getDefaultInkColor() {
    return DEFAULT_INK_COLOR;
}

/**
 * Generate preview styles for UI
 * 
 * @param {string} checklistId - Checklist identifier
 * @param {number} sampleCount - Number of sample styles to generate
 * @returns {Array<Object>} - Array of style objects for preview
 */
export function generatePreviewStyles(checklistId, sampleCount = 5) {
    const baseStyle = getHandwritingStyle(checklistId);
    const styles = [];

    for (let i = 0; i < sampleCount; i++) {
        styles.push(applyNaturalVariations(baseStyle, i * 10));
    }

    return styles;
}

export default {
    getHandwritingStyle,
    applyNaturalVariations,
    getHandwritingCSS,
    getExcelHandwritingStyle,
    humanizeText,
    getAvailableFonts,
    getInkColors,
    getDefaultInkColor,
    generatePreviewStyles,
    HANDWRITING_FONTS,
    BLUE_INK_COLORS,
    DEFAULT_INK_COLOR,
};
