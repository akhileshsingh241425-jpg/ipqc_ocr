/**
 * Excel-to-PDF Converter with Handwriting
 * Converts Excel file to PDF maintaining exact layout and structure
 * Applies handwriting fonts to filled data
 */

import ExcelJS from 'exceljs';
import html2pdf from 'html2pdf.js';
import {
    getHandwritingStyle,
    applyNaturalVariations,
} from './handwritingEngine';

/**
 * Convert Excel to PDF with handwriting
 * @param {Object} formData - Form data
 * @param {Object} options - Options
 * @returns {Promise<void>} - Downloads PDF
 */
export async function convertExcelToPDFWithHandwriting(formData, options = {}) {
    try {
        console.log('📊 Loading Excel template...');

        // Load Excel template
        const response = await fetch('/IPQC Check Sheet.xlsx');
        const arrayBuffer = await response.arrayBuffer();

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(arrayBuffer);

        let worksheet = workbook.getWorksheet('IPQC') || workbook.worksheets[0];

        console.log('✍️ Applying handwriting to cells...');

        // Get handwriting style
        const checklistId = options.checklistId || formData.checklistId || 'default';
        const baseStyle = getHandwritingStyle(checklistId);

        // Apply handwriting fonts to filled cells
        let cellIndex = 0;

        // Fill header data (Row 4)
        if (formData.date) {
            const cell = worksheet.getCell('B4');
            applyHandwritingFont(cell, formData.date, baseStyle, cellIndex++);
        }
        if (formData.time) {
            const cell = worksheet.getCell('E4');
            applyHandwritingFont(cell, formData.time, baseStyle, cellIndex++);
        }
        if (formData.shift) {
            const cell = worksheet.getCell('G4');
            applyHandwritingFont(cell, formData.shift, baseStyle, cellIndex++);
        }
        if (formData.poNo) {
            const cell = worksheet.getCell('I4');
            applyHandwritingFont(cell, formData.poNo, baseStyle, cellIndex++);
        }

        // Fill checkpoint results
        if (formData.checkpoints && Array.isArray(formData.checkpoints)) {
            formData.checkpoints.forEach((checkpoint) => {
                const srNo = checkpoint.sr;
                const row = 6 + srNo; // Checkpoints start from row 7
                const subResults = checkpoint.subResults || {};
                const result = checkpoint.result || subResults.result || '';

                if (result) {
                    const cell = worksheet.getCell(row, 8); // Column H
                    applyHandwritingFont(cell, result, baseStyle, cellIndex++);
                }

                // Handle sub-fields
                Object.keys(subResults).forEach((key, idx) => {
                    if (key !== 'result' && subResults[key]) {
                        const col = 8 + idx; // Adjacent columns
                        const cell = worksheet.getCell(row, col);
                        applyHandwritingFont(cell, subResults[key], baseStyle, cellIndex++);
                    }
                });
            });
        }

        console.log('🔄 Converting Excel to HTML...');

        // Convert Excel to HTML
        const html = await excelToHTML(worksheet);

        console.log('📄 Generating PDF from HTML...');

        // Convert HTML to PDF
        const pdfOptions = {
            margin: 5,
            filename: `IPQC_${formData.date || 'export'}_Handwritten.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: {
                scale: 2,
                useCORS: true,
                logging: false,
            },
            jsPDF: {
                unit: 'mm',
                format: 'a4',
                orientation: 'landscape'
            }
        };

        // Create container
        const container = document.createElement('div');
        container.innerHTML = html;
        container.style.position = 'absolute';
        container.style.left = '-9999px';
        document.body.appendChild(container);

        try {
            await html2pdf().set(pdfOptions).from(container).save();
            console.log('✅ PDF generated successfully!');
        } finally {
            document.body.removeChild(container);
        }

    } catch (error) {
        console.error('❌ Error converting Excel to PDF:', error);
        throw error;
    }
}

/**
 * Apply handwriting font to Excel cell
 */
function applyHandwritingFont(cell, value, baseStyle, cellIndex) {
    const style = applyNaturalVariations(baseStyle, cellIndex);

    cell.value = value;
    cell.font = {
        name: 'Bradley Hand ITC',
        size: 11,
        color: { argb: 'FF1a237e' }, // Blue pen
        italic: Math.random() > 0.4,
        bold: Math.random() > 0.9,
    };
    cell.alignment = {
        vertical: 'middle',
        horizontal: 'center',
        wrapText: true,
    };
}

/**
 * Convert Excel worksheet to HTML table
 */
async function excelToHTML(worksheet) {
    let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                @page { size: A4 landscape; margin: 10mm; }
                body { 
                    font-family: Arial, sans-serif; 
                    margin: 0; 
                    padding: 10px;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 9pt;
                }
                td, th {
                    border: 1px solid #000;
                    padding: 4px;
                    text-align: center;
                    vertical-align: middle;
                }
                th {
                    background: #d9d9d9;
                    font-weight: bold;
                }
                .handwritten {
                    font-family: 'Bradley Hand ITC', 'Segoe Script', cursive;
                    color: #1a237e;
                }
            </style>
        </head>
        <body>
            <table>
    `;

    // Iterate through rows
    worksheet.eachRow((row, rowNumber) => {
        html += '<tr>';

        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            const value = cell.value || '';
            const isHandwritten = cell.font && cell.font.name === 'Bradley Hand ITC';
            const className = isHandwritten ? 'handwritten' : '';

            // Get cell styling
            const bgColor = cell.fill && cell.fill.fgColor ?
                `#${cell.fill.fgColor.argb.substring(2)}` : 'white';
            const fontWeight = cell.font && cell.font.bold ? 'bold' : 'normal';
            const fontStyle = cell.font && cell.font.italic ? 'italic' : 'normal';

            html += `<td class="${className}" style="background: ${bgColor}; font-weight: ${fontWeight}; font-style: ${fontStyle};">${value}</td>`;
        });

        html += '</tr>';
    });

    html += `
            </table>
        </body>
        </html>
    `;

    return html;
}

export default {
    convertExcelToPDFWithHandwriting
};
