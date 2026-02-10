/**
 * Handwriting Image Generator using Handwrite.io API
 * Generates realistic handwriting images for Excel cells
 */

const HANDWRITE_API_KEY = 'test_hw_54838bde67e8e6255fa6';
const HANDWRITE_API_BASE = 'https://api.handwrite.io/v1';

/**
 * Get available handwriting styles
 * @returns {Promise<Array>} Array of handwriting styles
 */
export async function getHandwritingStyles() {
    try {
        const response = await fetch(`${HANDWRITE_API_BASE}/handwriting`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': HANDWRITE_API_KEY
            }
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const styles = await response.json();
        console.log('📝 Available handwriting styles:', styles.length);
        return styles;
    } catch (error) {
        console.error('❌ Error fetching handwriting styles:', error);
        return [];
    }
}

/**
 * Generate handwriting image for text
 * @param {string} text - Text to convert to handwriting
 * @param {Object} options - Generation options
 * @returns {Promise<Blob>} Image blob
 */
export async function generateHandwritingImage(text, options = {}) {
    try {
        // Default to first handwriting style (Jeremy)
        const handwritingId = options.handwritingId || '5db6f0724cc1751452c5ae8e';

        // Build query parameters
        const params = new URLSearchParams({
            text: text,
            handwriting_id: handwritingId,
            handwriting_size: options.size || '20px',
            handwriting_color: options.color || '1a237e', // Blue pen color
            width: options.width || '400px',
            height: options.height || '80px',
            line_spacing: options.lineSpacing || '1.5'
        });

        const url = `${HANDWRITE_API_BASE}/render/png?${params.toString()}`;

        console.log(`🖊️ Generating handwriting for: "${text}"`);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': HANDWRITE_API_KEY
            }
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} - ${response.statusText}`);
        }

        const blob = await response.blob();
        console.log(`✅ Generated handwriting image: ${blob.size} bytes`);

        return blob;
    } catch (error) {
        console.error('❌ Error generating handwriting:', error);
        // Fallback to canvas-based generation
        return generateCanvasFallback(text, options);
    }
}

/**
 * Fallback: Generate handwriting using Canvas (when API fails)
 * @param {string} text - Text to render
 * @param {Object} options - Rendering options
 * @returns {Promise<Blob>} Image blob
 */
async function generateCanvasFallback(text, options = {}) {
    console.log('⚠️ Using canvas fallback for:', text);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Parse dimensions
    const width = parseInt(options.width) || 400;
    const height = parseInt(options.height) || 80;

    canvas.width = width;
    canvas.height = height;

    // White background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Handwriting style
    const fontSize = parseInt(options.size) || 20;
    ctx.font = `${fontSize}px "Caveat", "Patrick Hand", cursive`;
    ctx.fillStyle = `#${options.color || '1a237e'}`;
    ctx.textBaseline = 'middle';

    // Draw text with natural variations
    let x = 10;
    const y = canvas.height / 2;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        // Natural variations
        const yJitter = (Math.random() - 0.5) * 3;
        const rotation = (Math.random() - 0.5) * 0.08;
        const xSpacing = (Math.random() - 0.5) * 1.5;

        ctx.save();
        ctx.translate(x, y + yJitter);
        ctx.rotate(rotation);
        ctx.fillText(char, 0, 0);
        ctx.restore();

        x += ctx.measureText(char).width + xSpacing;
    }

    return new Promise(resolve => {
        canvas.toBlob(resolve, 'image/png');
    });
}

/**
 * Convert blob to base64 string
 * @param {Blob} blob - Image blob
 * @returns {Promise<string>} Base64 string
 */
export async function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            // Remove data URL prefix to get pure base64
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/**
 * Get handwriting style by name
 * @param {string} name - Style name (e.g., 'Jeremy', 'Tribeca', 'Terry')
 * @returns {Promise<string>} Handwriting ID
 */
export async function getHandwritingIdByName(name) {
    const styles = await getHandwritingStyles();
    const style = styles.find(s => s.name.toLowerCase() === name.toLowerCase());
    return style ? style._id : '5db6f0724cc1751452c5ae8e'; // Default to Jeremy
}

/**
 * Generate handwriting for multiple texts (batch)
 * @param {Array<string>} texts - Array of texts
 * @param {Object} options - Generation options
 * @returns {Promise<Array<Blob>>} Array of image blobs
 */
export async function generateBatchHandwriting(texts, options = {}) {
    console.log(`📦 Batch generating ${texts.length} handwriting images...`);

    const promises = texts.map(text =>
        generateHandwritingImage(text, options)
    );

    const results = await Promise.all(promises);
    console.log(`✅ Batch complete: ${results.length} images generated`);

    return results;
}

export default {
    getHandwritingStyles,
    generateHandwritingImage,
    generateBatchHandwriting,
    getHandwritingIdByName,
    blobToBase64
};
