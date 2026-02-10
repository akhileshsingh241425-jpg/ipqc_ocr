/**
 * Handwritten Excel IPQC Filler Service - IMAGE BASED
 * Fills OCR extracted data into IPQC Check Sheet with REAL handwriting images
 * Uses Handwrite.io API to generate authentic handwriting images
 */

import ExcelJS from 'exceljs';
import {
    generateHandwritingImage,
    blobToBase64,
    getHandwritingIdByName
} from './handwritingImageGenerator';

// Use 'Jeremy' handwriting style (most natural looking)
const DEFAULT_HANDWRITING_STYLE = '5db6f0724cc1751452c5ae8e';

/**
 * Fill IPQC Excel with form data using REAL handwriting images
 * @param {ArrayBuffer} excelBuffer - Original Excel file as ArrayBuffer
 * @param {Object} formData - Form data from IPQC form
 * @param {Object} options - Options like checklistId for consistent handwriting
 * @returns {Promise<ArrayBuffer>} - Modified Excel file with handwriting images
 */
export async function fillIPQCExcelHandwritten(excelBuffer, formData, options = {}) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(excelBuffer);

    // Try to find worksheet by name first, then by index
    let worksheet = workbook.getWorksheet('IPQC');
    if (!worksheet) {
        worksheet = workbook.worksheets[0]; // Fallback to first sheet
    }
    if (!worksheet) {
        console.error('Available worksheets:', workbook.worksheets.map(ws => ws.name));
        throw new Error('No worksheet found in workbook');
    }

    console.log('📊 Using worksheet:', worksheet.name, 'Rows:', worksheet.rowCount);

    // Get handwriting style ID
    const handwritingId = options.handwritingId || DEFAULT_HANDWRITING_STYLE;

    console.log('🖊️ Using handwriting style:', handwritingId);
    console.log('📝 Generating handwriting images for all fields...');

    // Helper function to add handwriting image to cell
    const addHandwritingToCell = async (row, col, text, width = 300, height = 60) => {
        if (!text || text === '') return;

        try {
            // Generate handwriting image
            const imageBlob = await generateHandwritingImage(text, {
                handwritingId: handwritingId,
                size: '18px',
                color: '1a237e',  // Blue pen
                width: `${width}px`,
                height: `${height}px`
            });

            // Convert to base64
            const base64 = await blobToBase64(imageBlob);

            // Add image to workbook
            const imageId = workbook.addImage({
                base64: base64,
                extension: 'png',
            });

            // Calculate cell position
            // ExcelJS uses 0-based column indexing for images
            const colIndex = col - 1;
            const rowIndex = row - 1;

            // Insert image at cell position
            worksheet.addImage(imageId, {
                tl: { col: colIndex, row: rowIndex },
                ext: { width: width * 0.75, height: height * 0.75 }  // Scale to 75% for better fit
            });

            // Clear cell text (image will overlay)
            const cell = worksheet.getCell(row, col);
            cell.value = '';

            console.log(`✅ Added handwriting image at row ${row}, col ${col}: "${text}"`);
        } catch (error) {
            console.error(`❌ Error adding handwriting for "${text}":`, error);
            // Fallback: just write text
            const cell = worksheet.getCell(row, col);
            cell.value = text;
        }
    };

    // Fill header data with handwriting images
    console.log('📋 Filling header information...');

    if (formData.date) {
        await addHandwritingToCell(4, 2, formData.date, 200, 50);
    }

    if (formData.time) {
        await addHandwritingToCell(4, 5, formData.time, 150, 50);
    }

    if (formData.shift) {
        await addHandwritingToCell(4, 7, formData.shift, 100, 50);
    }

    if (formData.poNo) {
        await addHandwritingToCell(4, 9, formData.poNo, 200, 50);
    }

    // Fill checkpoints with handwriting images
    console.log('📝 Filling checkpoint data...');

    if (formData.checkpoints && Array.isArray(formData.checkpoints)) {
        let processedCount = 0;

        for (const checkpoint of formData.checkpoints) {
            const srNo = checkpoint.sr;
            const subResults = checkpoint.subResults || {};
            const result = checkpoint.result || subResults.result || '';

            // Simple mapping: Sr No to Row
            // Assuming checkpoints start from row 7 (Sr 1)
            const row = 6 + srNo;  // Row 7 for Sr 1, Row 8 for Sr 2, etc.
            const resultCol = 8;    // Column H for results

            if (result) {
                await addHandwritingToCell(row, resultCol, result, 250, 55);
                processedCount++;
            }

            // Handle sub-fields (like TS01A, TS01B, etc.)
            const subKeys = Object.keys(subResults).filter(k => k !== 'result');
            if (subKeys.length > 0) {
                for (const subKey of subKeys) {
                    const value = subResults[subKey];
                    if (value) {
                        // For sub-fields, use adjacent columns
                        // This is a simplified mapping - adjust based on your Excel layout
                        await addHandwritingToCell(row, resultCol, value, 200, 55);
                        processedCount++;
                        break;  // Just fill first sub-field for now
                    }
                }
            }

            // Add small delay to avoid API rate limiting
            if (processedCount % 10 === 0) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        console.log(`✅ Processed ${processedCount} checkpoint values`);
    }

    // Generate the output buffer
    console.log('💾 Generating final Excel file...');
    const buffer = await workbook.xlsx.writeBuffer();
    console.log('✅ Handwritten Excel ready!');

    return buffer;
}

/**
 * Download filled handwritten Excel file
 * @param {ArrayBuffer} excelBuffer - Filled Excel as ArrayBuffer
 * @param {string} filename - Output filename
 */
export function downloadHandwrittenExcel(excelBuffer, filename = 'IPQC_Handwritten.xlsx') {
    const blob = new Blob([excelBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Load the original IPQC Excel template
 * @returns {Promise<ArrayBuffer>} - Excel file as ArrayBuffer
 */
export async function loadIPQCTemplate() {
    // Fetch from public folder
    const response = await fetch('/IPQC Check Sheet.xlsx');
    if (!response.ok) {
        throw new Error('Failed to load IPQC template');
    }
    return await response.arrayBuffer();
}

/**
 * Main function to generate handwritten Excel from form data
 * @param {Object} formData - IPQC form data
 * @param {Object} options - Options including checklistId
 * @returns {Promise<void>} - Downloads the file
 */
export async function generateHandwrittenIPQCExcel(formData, options = {}) {
    try {
        console.log('🚀 Starting handwritten Excel generation...');

        // Load template
        const template = await loadIPQCTemplate();

        // Fill with handwriting IMAGES
        const filledBuffer = await fillIPQCExcelHandwritten(template, formData, options);

        // Generate filename
        const date = formData.date || new Date().toISOString().split('T')[0];
        const shift = formData.shift || 'Day';
        const filename = `IPQC_${date}_${shift}_Handwritten.xlsx`;

        // Download
        downloadHandwrittenExcel(filledBuffer, filename);

        console.log('🎉 Handwritten Excel exported successfully!');
        return { success: true, filename };
    } catch (error) {
        console.error('❌ Error generating handwritten Excel:', error);
        throw error;
    }
}

export default {
    fillIPQCExcelHandwritten,
    downloadHandwrittenExcel,
    loadIPQCTemplate,
    generateHandwrittenIPQCExcel,
};
