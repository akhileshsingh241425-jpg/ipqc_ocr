/**
 * Handwritten PDF Exporter Service
 * Generates print-ready PDF with authentic handwriting style
 * Uses the same handwriting engine as Excel export for consistency
 */

import html2pdf from 'html2pdf.js';
import {
  getHandwritingStyle,
  applyNaturalVariations,
  getDefaultInkColor
} from './handwritingEngine';

/**
 * Generate handwritten PDF from IPQC form data
 * Creates a PDF that looks like it was filled by hand with blue pen
 * 
 * @param {Object} formData - IPQC form data with checkpoints
 * @param {Object} options - Options including checklistId, formElement
 * @returns {Promise<void>} - Downloads the PDF
 */
export async function generateHandwrittenPDF(formData, options = {}) {
  console.log('📄 Starting PDF generation with data:', formData);

  const checklistId = options.checklistId || formData.checklistId || 'default';
  const baseStyle = getHandwritingStyle(checklistId);

  console.log('✍️ Handwriting style:', baseStyle);

  // If form element is provided, use it directly
  if (options.formElement) {
    console.log('📋 Using form element for PDF');
    return generatePDFFromElement(options.formElement, formData, baseStyle, options);
  }

  // Otherwise, create HTML from form data
  console.log('🏗️ Generating HTML from form data');
  console.log('📊 FormData:', {
    date: formData.date,
    time: formData.time,
    shift: formData.shift,
    poNo: formData.poNo,
    checkpointsCount: formData.checkpoints?.length || 0
  });
  const html = generateIPQCHTML(formData, baseStyle);
  console.log('📝 HTML length:', html.length, 'characters');

  return generatePDFFromHTML(html, formData, options);
}


/**
 * Generate PDF from existing form element
 * Applies handwriting styles before conversion
 */
async function generatePDFFromElement(element, formData, baseStyle, options = {}) {
  // Clone the element to avoid modifying the original
  const clonedElement = element.cloneNode(true);

  // Apply handwriting styles to all input values
  let cellIndex = 0;
  const inputs = clonedElement.querySelectorAll('input, .result-value, .handwritten-text');

  inputs.forEach(input => {
    const style = applyNaturalVariations(baseStyle, cellIndex++);

    if (input.tagName === 'INPUT') {
      // Convert input to span with value
      const span = document.createElement('span');
      span.textContent = input.value || '';
      span.style.cssText = `
        font-family: '${style.fontFamily}', cursive;
        font-size: ${style.fontSize};
        color: ${style.color};
        transform: rotate(${style.rotation});
        display: inline-block;
      `;
      input.parentNode.replaceChild(span, input);
    } else {
      // Apply styles to existing elements
      input.style.fontFamily = `'${style.fontFamily}', cursive`;
      input.style.fontSize = style.fontSize;
      input.style.color = style.color;
    }
  });

  // PDF options
  const pdfOptions = {
    margin: 5,
    filename: options.filename || `IPQC_${formData.date || 'export'}_Handwritten.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      letterRendering: true,
    },
    jsPDF: {
      unit: 'mm',
      format: 'a4',
      orientation: 'portrait'
    }
  };

  // Generate and download PDF
  await html2pdf().set(pdfOptions).from(clonedElement).save();

  return { success: true, filename: pdfOptions.filename };
}

/**
 * Generate PDF from HTML string
 */
async function generatePDFFromHTML(html, formData, options = {}) {
  console.log('🔧 Creating container for PDF rendering');

  // Create container element
  const container = document.createElement('div');
  container.innerHTML = html;

  // Make container visible for proper rendering - position off-screen
  container.style.position = 'absolute';
  container.style.top = '-10000px'; // Far off-screen
  container.style.left = '0';
  container.style.width = '297mm'; // A4 landscape width
  container.style.minHeight = '100px';
  container.style.background = 'white';
  container.style.visibility = 'visible'; // MUST be visible for height calculation
  container.style.display = 'block';

  document.body.appendChild(container);

  console.log('📐 Container dimensions:', {
    width: container.offsetWidth,
    height: container.offsetHeight,
    scrollHeight: container.scrollHeight
  });

  try {
    // Wait for fonts and rendering to complete
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('📐 After delay:', {
      width: container.offsetWidth,
      height: container.offsetHeight,
      scrollHeight: container.scrollHeight
    });

    // DEBUG: Open HTML in new window to see what's rendering
    console.log('🔍 DEBUG: Opening HTML preview...');
    const debugWindow = window.open('', '_blank');
    if (debugWindow) {
      debugWindow.document.write(html);
      debugWindow.document.close();
    }

    const pdfOptions = {
      margin: 5,
      filename: options.filename || `IPQC_${formData.date || 'export'}_Handwritten.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: 1123,  // A4 landscape width
        windowHeight: 794,  // A4 landscape height
      },
      jsPDF: {
        unit: 'mm',
        format: 'a4',
        orientation: 'landscape'  // Excel-style landscape
      }
    };

    console.log('📄 Starting html2pdf conversion...');
    await html2pdf().set(pdfOptions).from(container).save();
    console.log('✅ PDF complete!');

    return { success: true, filename: pdfOptions.filename };
  } finally {
    document.body.removeChild(container);
    console.log('🗑️ Container removed');
  }
}



/**
 * Generate HTML representation matching Excel layout EXACTLY
 */
function generateIPQCHTML(formData, baseStyle) {
  let cellIndex = 0;

  const getStyle = () => {
    return applyNaturalVariations(baseStyle, cellIndex++);
  };

  const renderHandwrittenText = (text) => {
    if (!text) return '';

    // Render each character with individual variations for authentic look
    let result = '';
    const chars = String(text).split('');

    chars.forEach((char) => {
      // Per-character variations (like real pen strokes)
      const size = 11 + (Math.random() - 0.5) * 4;  // 9-13pt
      const rotate = (Math.random() - 0.5) * 6;  // -3 to +3 degrees
      const yShift = (Math.random() - 0.5) * 3;  // Vertical wobble
      const weight = Math.random() > 0.85 ? '600' : '400';  // Occasional pressure

      result += `<span style="
        font-family: 'Bradley Hand ITC', 'Segoe Script', cursive;
        font-size: ${size}pt;
        color: #1a237e;
        display: inline-block;
        transform: rotate(${rotate}deg) translateY(${yShift}px);
        font-weight: ${weight};
      ">${char}</span>`;
    });

    return result;
  };

  // Build HTML - Excel exact layout
  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        @page { size: A4 landscape; margin: 8mm; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: Arial, sans-serif;
          font-size: 9pt;
          padding: 5px;
        }
        
        /* Header with logo */
        .header-row {
          display: table;
          width: 100%;
          border: 1px solid #000;
          margin-bottom: 2px;
        }
        .logo-cell {
          display: table-cell;
          width: 120px;
          border-right: 1px solid #000;
          padding: 5px;
          vertical-align: middle;
          text-align: center;
        }
        .logo-text {
          font-weight: bold;
          font-size: 14pt;
          color: #c00000;
        }
        .title-cell {
          display: table-cell;
          text-align: center;
          padding: 8px;
          vertical-align: middle;
        }
        .company-name {
          font-size: 14pt;
          font-weight: bold;
          margin-bottom: 2px;
        }
        .doc-title {
          font-size: 12pt;
          font-weight: bold;
        }
        .doc-info-cell {
          display: table-cell;
          width: 180px;
          border-left: 1px solid #000;
          padding: 5px;
          font-size: 8pt;
        }
        
        /* Info row */
        .info-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 2px;
        }
        .info-table td {
          border: 1px solid #000;
          padding: 6px;
          font-size: 9pt;
        }
        .info-label {
          font-weight: bold;
          width: 60px;
        }
        
        /* Main table */
        table.main-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 8pt;
        }
        table.main-table th,
        table.main-table td {
          border: 1px solid #000;
          padding: 4px;
          vertical-align: middle;
        }
        table.main-table th {
          background: #d9d9d9;
          font-weight: bold;
          text-align: center;
          font-size: 8pt;
        }
        .col-sr { width: 30px; text-align: center; }
        .col-stage { width: 100px; }
        .col-checkpoint { width: 180px; }
        .col-quantum { width: 60px; text-align: center; }
        .col-frequency { width: 60px; text-align: center; }
        .col-criteria { width: 150px; }
        .col-result { width: 120px; text-align: center; }
        .col-remarks { width: 100px; }
      </style>
    </head>
    <body>
      <!-- Header matching Excel -->
      <div class="header-row">
        <div class="logo-cell">
          <div class="logo-text">GAUTAM<br/>SOLAR</div>
        </div>
        <div class="title-cell">
          <div class="company-name">Gautam Solar Private Limited</div>
          <div class="doc-title">IPQC Check Sheet</div>
        </div>
        <div class="doc-info-cell">
          <div><strong>Document No.</strong> GSPL/IPQC/IPC/003</div>
          <div><strong>Issue Date:</strong> 01/12/24</div>
          <div><strong>Rev. No./Rev.Date:</strong> 01/30 08 2025</div>
        </div>
      </div>
      
      <!-- Info row -->
      <table class="info-table">
        <tr>
          <td class="info-label">Time:</td>
          <td colspan="2">${renderHandwrittenText(formData.time || '')}</td>
          <td class="info-label">Shift:</td>
          <td>${renderHandwrittenText(formData.shift || '')}</td>
          <td class="info-label">P.O. No.:</td>
          <td>${renderHandwrittenText(formData.poNo || '')}</td>
        </tr>
      </table>
      
      <!-- Main table -->
      <table class="main-table">
        <thead>
          <tr>
            <th class="col-sr">Sr.No.</th>
            <th class="col-stage">Stage</th>
            <th class="col-checkpoint">Check point</th>
            <th class="col-quantum">Quantum of Check<br/>sample Size</th>
            <th class="col-frequency">frequency</th>
            <th class="col-criteria">Acceptance Criteria</th>
            <th class="col-result">Monitoring Result</th>
            <th class="col-remarks">Remarks,if any</th>
          </tr>
        </thead>
        <tbody>
  `;

  // Add checkpoint rows
  if (formData.checkpoints && Array.isArray(formData.checkpoints)) {
    formData.checkpoints.forEach((checkpoint, index) => {
      const subResults = checkpoint.subResults || {};
      const result = checkpoint.result || subResults.result || '';
      const remarks = checkpoint.remarks || '';

      // Handle sub-results
      let resultDisplay = '';
      if (Object.keys(subResults).length > 1 || (Object.keys(subResults).length === 1 && !subResults.result)) {
        const subFields = Object.keys(subResults).filter(k => k !== 'result');
        resultDisplay = subFields.map(key =>
          `${key}: ${renderHandwrittenText(subResults[key] || '')}`
        ).join('<br/>');
      } else {
        resultDisplay = renderHandwrittenText(result);
      }

      html += `
        <tr>
          <td class="col-sr">${checkpoint.sr || index + 1}</td>
          <td class="col-stage">${checkpoint.stage || ''}</td>
          <td class="col-checkpoint">${checkpoint.checkpoint || ''}</td>
          <td class="col-quantum">${checkpoint.quantum || ''}</td>
          <td class="col-frequency">${checkpoint.frequency || ''}</td>
          <td class="col-criteria">${checkpoint.criteria || checkpoint.acceptance || ''}</td>
          <td class="col-result">${resultDisplay}</td>
          <td class="col-remarks">${renderHandwrittenText(remarks)}</td>
        </tr>
      `;
    });
  }

  html += `
        </tbody>
      </table>
    </body>
    </html>
  `;

  return html;
}

/**
 * Preview handwritten PDF in new window
 * 
 * @param {Object} formData - IPQC form data
 * @param {Object} options - Options including checklistId
 */
export async function previewHandwrittenPDF(formData, options = {}) {
  const checklistId = options.checklistId || formData.checklistId || 'default';
  const baseStyle = getHandwritingStyle(checklistId);

  const html = generateIPQCHTML(formData, baseStyle);

  // Open in new window for preview
  const previewWindow = window.open('', '_blank');
  previewWindow.document.write(html);
  previewWindow.document.close();

  return { success: true, message: 'Preview opened in new window' };
}

/**
 * Generate PDF blob for upload/save
 * 
 * @param {Object} formData - IPQC form data
 * @param {Object} options - Options
 * @returns {Promise<Blob>} - PDF as blob
 */
export async function generatePDFBlob(formData, options = {}) {
  const checklistId = options.checklistId || formData.checklistId || 'default';
  const baseStyle = getHandwritingStyle(checklistId);

  const html = generateIPQCHTML(formData, baseStyle);

  // Create container
  const container = document.createElement('div');
  container.innerHTML = html;
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  document.body.appendChild(container);

  try {
    const pdfOptions = {
      margin: 10,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    const pdf = await html2pdf().set(pdfOptions).from(container).outputPdf('blob');
    return pdf;
  } finally {
    document.body.removeChild(container);
  }
}

export default {
  generateHandwrittenPDF,
  previewHandwrittenPDF,
  generatePDFBlob,
};
