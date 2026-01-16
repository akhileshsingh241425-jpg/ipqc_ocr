/**
 * Excel LLM Mapper Service
 * Uses LLM (Groq) to intelligently understand Excel structure and map form data to correct cells
 */

import ExcelJS from 'exceljs';

const GROQ_API_KEY = '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';

/**
 * Extract all cell data from Excel with positions
 * @param {ArrayBuffer} excelBuffer - Excel file buffer
 * @returns {Promise<Object>} - Cell structure map
 */
export async function extractExcelStructure(excelBuffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(excelBuffer);
  
  const worksheet = workbook.worksheets[0];
  const structure = {
    sheetName: worksheet.name,
    cells: [],
    mergedCells: [],
    headers: {},
    checkpoints: [],
    resultColumns: []
  };
  
  // Get merged cells
  worksheet.model.merges?.forEach(merge => {
    structure.mergedCells.push(merge);
  });
  
  // Extract all cells with their values and positions
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const cellInfo = {
        row: rowNumber,
        col: colNumber,
        address: cell.address,
        value: cell.value?.toString() || '',
        type: typeof cell.value
      };
      
      // Check if it's a result/monitoring column header
      if (rowNumber <= 6 && cell.value) {
        const val = cell.value.toString().toLowerCase();
        if (val.includes('monitoring') || val.includes('result') || val.includes('sample')) {
          structure.resultColumns.push({ col: colNumber, label: cell.value.toString() });
        }
      }
      
      // Identify checkpoint rows (has Sr. No.)
      if (colNumber === 1 && !isNaN(parseInt(cell.value))) {
        structure.checkpoints.push({
          srNo: parseInt(cell.value),
          row: rowNumber
        });
      }
      
      structure.cells.push(cellInfo);
    });
  });
  
  return structure;
}

/**
 * Use LLM to create intelligent mapping between form data and Excel cells
 * @param {Object} excelStructure - Excel structure from extractExcelStructure
 * @param {Object} formData - Form data to map
 * @returns {Promise<Array>} - Array of {cellAddress, value} mappings
 */
export async function createLLMMapping(excelStructure, formData) {
  // Create a simplified view of Excel structure for LLM
  const excelContext = createExcelContext(excelStructure);
  const formContext = createFormContext(formData);
  
  const prompt = `You are an Excel data mapping expert. I have an IPQC (In-Process Quality Control) form data that needs to be filled into an Excel template.

## Excel Template Structure:
${excelContext}

## Form Data to Fill:
${formContext}

## Task:
Create a JSON mapping that shows which form value should go into which Excel cell.
The Excel has "Monitoring Result" columns (usually columns H, I, J, K, L, M, N, O) where data should be filled.

IMPORTANT RULES:
1. Match checkpoint names/descriptions to find correct rows
2. Header info (Date, Time, Shift, PO No) goes in row 4
3. Each checkpoint result goes in the "Monitoring Result" column of that checkpoint's row
4. For checkpoints with multiple sub-results (like TS01A, TS01B, S1, S2, S3), fill in consecutive columns
5. Only return cells that have data to fill
6. Use exact cell addresses like "H7", "I22", etc.

Return ONLY a valid JSON array like this (no explanation):
[
  {"cell": "A4", "value": "Date :- 2025-01-15"},
  {"cell": "H7", "value": "25°C"},
  {"cell": "H8", "value": "45%"}
]`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'You are an Excel mapping expert. Return only valid JSON arrays. No explanations.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 4000
      })
    });

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || '[]';
    
    // Extract JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return [];
  } catch (error) {
    console.error('LLM Mapping Error:', error);
    // Fallback to rule-based mapping
    return createFallbackMapping(excelStructure, formData);
  }
}

/**
 * Create context string for Excel structure
 */
function createExcelContext(structure) {
  let context = `Sheet: ${structure.sheetName}\n\n`;
  
  // Show first 150 rows structure
  const relevantCells = structure.cells
    .filter(c => c.row <= 150 && c.value && c.value.trim())
    .sort((a, b) => a.row - b.row || a.col - b.col);
  
  context += "Key cells and their content:\n";
  
  let currentRow = 0;
  relevantCells.forEach(cell => {
    if (cell.row !== currentRow) {
      context += `\nRow ${cell.row}: `;
      currentRow = cell.row;
    }
    context += `[${cell.address}]="${cell.value.substring(0, 50)}" `;
  });
  
  return context;
}

/**
 * Create context string for form data
 */
function createFormContext(formData) {
  let context = `Header Info:\n`;
  context += `- Date: ${formData.date || 'empty'}\n`;
  context += `- Time: ${formData.time || 'empty'}\n`;
  context += `- Shift: ${formData.shift || 'empty'}\n`;
  context += `- PO No: ${formData.poNo || 'empty'}\n\n`;
  
  context += `Checkpoints Data (only filled ones):\n`;
  
  formData.checkpoints.forEach((cp, idx) => {
    const subResults = cp.subResults || {};
    const hasData = Object.values(subResults).some(v => v && v.toString().trim());
    
    if (hasData) {
      context += `\nSr.${cp.sr} - ${cp.stage} - ${cp.checkpoint}:\n`;
      Object.entries(subResults).forEach(([key, value]) => {
        if (value && value.toString().trim()) {
          context += `  ${key}: "${value}"\n`;
        }
      });
    }
  });
  
  return context;
}

/**
 * Fallback rule-based mapping when LLM fails
 */
function createFallbackMapping(structure, formData) {
  const mappings = [];
  
  // Header mappings
  if (formData.date) {
    mappings.push({ cell: 'A4', value: `Date :- ${formData.date}` });
  }
  if (formData.time) {
    mappings.push({ cell: 'D4', value: `Time :- ${formData.time}` });
  }
  if (formData.shift) {
    mappings.push({ cell: 'G4', value: formData.shift });
  }
  if (formData.poNo) {
    mappings.push({ cell: 'I4', value: formData.poNo });
  }
  
  // Find checkpoint rows from structure
  const checkpointRows = {};
  structure.checkpoints.forEach(cp => {
    checkpointRows[cp.srNo] = cp.row;
  });
  
  // Map checkpoint data
  formData.checkpoints.forEach(cp => {
    const row = checkpointRows[cp.sr];
    if (!row) return;
    
    const subResults = cp.subResults || {};
    const keys = Object.keys(subResults);
    
    if (keys.length === 0) return;
    
    // Start from column H (8)
    let colIndex = 8;
    keys.forEach(key => {
      const value = subResults[key];
      if (value && value.toString().trim()) {
        const colLetter = getColumnLetter(colIndex);
        mappings.push({ cell: `${colLetter}${row}`, value: value.toString() });
        colIndex++;
      }
    });
  });
  
  return mappings;
}

/**
 * Convert column number to letter (1=A, 2=B, etc.)
 */
function getColumnLetter(colNum) {
  let letter = '';
  while (colNum > 0) {
    const mod = (colNum - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    colNum = Math.floor((colNum - 1) / 26);
  }
  return letter;
}

/**
 * Fill Excel with mapped data preserving all formatting
 * @param {ArrayBuffer} templateBuffer - Original Excel template
 * @param {Array} mappings - Cell mappings from LLM
 * @returns {Promise<Blob>} - Filled Excel as Blob
 */
export async function fillExcelWithMappings(templateBuffer, mappings) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBuffer);
  
  const worksheet = workbook.worksheets[0];
  
  // Apply mappings
  mappings.forEach(({ cell, value }) => {
    if (cell && value) {
      const cellObj = worksheet.getCell(cell);
      cellObj.value = value;
    }
  });
  
  // Generate output
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { 
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
  });
}

/**
 * Main function: Export IPQC form to Excel using LLM mapping
 * @param {Object} formData - IPQC form data
 * @param {Function} progressCallback - Progress update callback
 * @returns {Promise<{blob: Blob, filename: string}>}
 */
export async function exportIPQCToExcel(formData, progressCallback = () => {}) {
  try {
    progressCallback('Loading Excel template...');
    
    // Load template
    const response = await fetch('/IPQC Check Sheet.xlsx');
    if (!response.ok) {
      throw new Error('Could not load Excel template');
    }
    const templateBuffer = await response.arrayBuffer();
    
    progressCallback('Analyzing Excel structure...');
    
    // Extract structure
    const structure = await extractExcelStructure(templateBuffer);
    console.log('📊 Excel Structure:', structure.cells.length, 'cells,', structure.checkpoints.length, 'checkpoints');
    
    progressCallback('AI is mapping form data to Excel cells...');
    
    // Create LLM mapping
    const mappings = await createLLMMapping(structure, formData);
    console.log('🤖 LLM Mappings:', mappings.length, 'cells to fill');
    console.log('📝 Mappings:', mappings);
    
    progressCallback('Filling Excel with data...');
    
    // Fill Excel
    const blob = await fillExcelWithMappings(templateBuffer, mappings);
    
    const filename = `IPQC_${formData.date || 'NoDate'}_${formData.shift || 'NoShift'}_LLM.xlsx`;
    
    progressCallback('Done!');
    
    return { blob, filename, mappings };
  } catch (error) {
    console.error('Export Error:', error);
    throw error;
  }
}

export default {
  extractExcelStructure,
  createLLMMapping,
  fillExcelWithMappings,
  exportIPQCToExcel
};
