/**
 * Azure Document Intelligence (Form Recognizer) OCR Service
 * 
 * USE CASE:
 * - Unlike plain Computer Vision OCR which only returns raw text line-by-line,
 *   Document Intelligence extracts STRUCTURED data from forms:
 *   1) Key-Value Pairs (e.g., "Date: 12/02/2026", "Shift: A")
 *   2) Tables (rows + columns with headers - perfect for IPQC checkpoints)
 *   3) Selection Marks (checkboxes like OK/NG)
 *   4) Text with reading order (better than random OCR lines)
 * 
 * This is ideal for IPQC forms because they contain structured tables
 * and labeled fields that Document Intelligence can understand natively.
 * 
 * Resource: ipqcdoc1234 | API Kind: FormRecognizer | West Central US | Free tier
 */

const DI_KEY = process.env.REACT_APP_AZURE_DI_KEY || process.env.REACT_APP_AZURE_CV_KEY;
const DI_ENDPOINT = process.env.REACT_APP_AZURE_DI_ENDPOINT || process.env.REACT_APP_AZURE_CV_ENDPOINT;

const useProxy = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const proxyEndpoint = useProxy ? '/proxy-doc-intelligence' : DI_ENDPOINT;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Compress image if larger than 4MB (Document Intelligence limit)
 */
const compressImage = async (imageDataUrl) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        let width = img.width;
        let height = img.height;
        const maxSize = 2000;

        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = (height / width) * maxSize;
            width = maxSize;
          } else {
            width = (width / height) * maxSize;
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
        resolve(compressedDataUrl);
      } catch (err) {
        reject(new Error('Image compression failed: ' + err.message));
      }
    };
    img.onerror = () => reject(new Error('Failed to load image for compression'));
    img.src = imageDataUrl;
  });
};

/**
 * Extract STRUCTURED data from document using Azure Document Intelligence
 * Uses prebuilt-layout model which extracts: text, tables, key-value pairs, selection marks
 * 
 * @param {string} imageDataUrl - Base64 data URL of the image/PDF
 * @returns {Promise<Object>} - { text, tables, keyValuePairs, selectionMarks }
 */
export const extractWithDocumentIntelligence = async (imageDataUrl) => {
  try {
    console.log('🔍 Starting Document Intelligence analysis...');
    console.log('DI Key loaded:', DI_KEY ? 'Yes' : 'NO - KEY MISSING!');
    console.log('DI Endpoint:', DI_ENDPOINT || 'MISSING!');

    if (!DI_KEY || !DI_ENDPOINT) {
      throw new Error('Document Intelligence credentials not configured. Set REACT_APP_AZURE_DI_KEY and REACT_APP_AZURE_DI_ENDPOINT in .env');
    }

    const isPDF = imageDataUrl.startsWith('data:application/pdf');

    // Compress if needed
    let processedDataUrl = imageDataUrl;
    const base64Size = (imageDataUrl.length * 3) / 4;
    if (base64Size > 4 * 1024 * 1024 && !isPDF) {
      console.log('Image too large, compressing...');
      processedDataUrl = await compressImage(imageDataUrl);
    }

    // Convert base64 to binary
    const base64Data = processedDataUrl.split(',')[1];
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Determine content type
    const contentType = isPDF ? 'application/pdf' : 'application/octet-stream';

    // Step 1: Submit document for analysis using prebuilt-layout model
    // This model extracts: text, tables, key-value pairs, selection marks
    const analyzeUrl = `${proxyEndpoint}/formrecognizer/documentModels/prebuilt-layout:analyze?api-version=2023-07-31`;
    console.log('📄 Document Intelligence API URL:', analyzeUrl);

    let analyzeResponse;
    let retryAttempts = 0;
    const maxRetries = 3;

    while (retryAttempts <= maxRetries) {
      analyzeResponse = await fetch(analyzeUrl, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': DI_KEY,
          'Content-Type': contentType
        },
        body: bytes
      });

      if (analyzeResponse.ok || analyzeResponse.status === 202) {
        break;
      }

      if (analyzeResponse.status === 429 && retryAttempts < maxRetries) {
        retryAttempts++;
        let waitTime = 20000;
        try {
          const errorJson = await analyzeResponse.clone().json();
          const message = errorJson?.error?.message || '';
          const match = message.match(/retry after (\d+) seconds/i);
          if (match) waitTime = (parseInt(match[1]) + 2) * 1000;
        } catch (e) { /* use default */ }
        console.log(`⏳ Rate limited. Waiting ${waitTime / 1000}s before retry ${retryAttempts}/${maxRetries}...`);
        await sleep(waitTime);
        continue;
      }

      const errorText = await analyzeResponse.text();
      throw new Error(`Document Intelligence API Error: ${analyzeResponse.status} - ${errorText}`);
    }

    // Get operation location for polling
    const operationLocation = analyzeResponse.headers.get('Operation-Location');
    if (!operationLocation) {
      throw new Error('No Operation-Location header in response');
    }

    // Convert polling URL to use proxy if needed
    let pollUrl = operationLocation;
    if (useProxy && operationLocation.includes('cognitiveservices.azure.com')) {
      pollUrl = operationLocation.replace(DI_ENDPOINT, proxyEndpoint);
    }
    console.log('📊 Polling URL:', pollUrl);

    // Step 2: Poll for results
    let result;
    let attempts = 0;
    const maxAttempts = 60; // DI can take longer than CV OCR

    while (attempts < maxAttempts) {
      await sleep(1500);

      const resultResponse = await fetch(pollUrl, {
        method: 'GET',
        headers: {
          'Ocp-Apim-Subscription-Key': DI_KEY
        }
      });

      if (!resultResponse.ok) {
        throw new Error(`Failed to get results: ${resultResponse.status}`);
      }

      result = await resultResponse.json();

      if (result.status === 'succeeded') break;
      if (result.status === 'failed') {
        throw new Error('Document Intelligence analysis failed: ' + JSON.stringify(result.error));
      }
      attempts++;
    }

    if (result.status !== 'succeeded') {
      throw new Error('Document Intelligence analysis timed out');
    }

    // Step 3: Parse the structured results
    const analyzeResult = result.analyzeResult;
    return parseDocumentIntelligenceResult(analyzeResult);

  } catch (error) {
    console.error('❌ Document Intelligence error:', error);
    throw new Error(`Document Intelligence OCR failed: ${error.message}`);
  }
};

/**
 * Parse Document Intelligence results into structured data
 * Extracts: plain text, tables (with headers), key-value pairs, selection marks
 */
function parseDocumentIntelligenceResult(analyzeResult) {
  const output = {
    text: '',           // Full extracted text (like CV OCR)
    tables: [],         // Array of tables with headers and rows
    keyValuePairs: {},  // Key-value pairs found in the document
    selectionMarks: {}, // Checkboxes/radio buttons
    paragraphs: [],     // Structured paragraphs
    rawResult: analyzeResult // Keep raw result for debugging
  };

  // 1. Extract full text content
  if (analyzeResult.content) {
    output.text = analyzeResult.content;
  }

  // 2. Extract tables (MOST IMPORTANT for IPQC forms)
  if (analyzeResult.tables) {
    for (const table of analyzeResult.tables) {
      const parsedTable = {
        rowCount: table.rowCount,
        columnCount: table.columnCount,
        headers: [],
        rows: []
      };

      // Organize cells by row
      const cellsByRow = {};
      for (const cell of table.cells) {
        const rowIndex = cell.rowIndex;
        if (!cellsByRow[rowIndex]) cellsByRow[rowIndex] = {};
        cellsByRow[rowIndex][cell.columnIndex] = cell.content || '';
      }

      // First row is typically headers
      if (cellsByRow[0]) {
        parsedTable.headers = Object.values(cellsByRow[0]);
      }

      // Remaining rows are data
      for (let i = 1; i < table.rowCount; i++) {
        if (cellsByRow[i]) {
          const row = {};
          parsedTable.headers.forEach((header, colIdx) => {
            row[header] = cellsByRow[i][colIdx] || '';
          });
          parsedTable.rows.push(row);
        }
      }

      output.tables.push(parsedTable);
    }
  }

  // 3. Extract key-value pairs
  if (analyzeResult.keyValuePairs) {
    for (const kvp of analyzeResult.keyValuePairs) {
      const key = kvp.key?.content?.trim();
      const value = kvp.value?.content?.trim();
      if (key && value) {
        output.keyValuePairs[key] = value;
      }
    }
  }

  // 4. Extract selection marks (checkboxes)
  if (analyzeResult.pages) {
    for (const page of analyzeResult.pages) {
      if (page.selectionMarks) {
        for (const mark of page.selectionMarks) {
          const state = mark.state; // 'selected' or 'unselected'
          // Try to associate with nearby text
          output.selectionMarks[`page${page.pageNumber}_mark_${mark.span?.offset || 'unknown'}`] = state;
        }
      }
    }
  }

  // 5. Extract paragraphs
  if (analyzeResult.paragraphs) {
    output.paragraphs = analyzeResult.paragraphs.map(p => ({
      content: p.content,
      role: p.role || 'body' // 'title', 'sectionHeading', 'body', etc.
    }));
  }

  console.log('📋 Document Intelligence Results:');
  console.log(`   - Text: ${output.text.length} chars`);
  console.log(`   - Tables: ${output.tables.length} found`);
  console.log(`   - Key-Value Pairs: ${Object.keys(output.keyValuePairs).length} found`);
  console.log(`   - Selection Marks: ${Object.keys(output.selectionMarks).length} found`);
  console.log(`   - Paragraphs: ${output.paragraphs.length} found`);

  return output;
}

/**
 * Map Document Intelligence structured output to IPQC form fields
 * This uses tables + key-value pairs for MUCH better accuracy than plain OCR + AI parsing
 */
export const mapDIResultToIPQCFields = (diResult) => {
  const fields = {};

  // 1. Map key-value pairs directly to form fields
  const kvMapping = {
    'Date': 'date', 'date': 'date', 'Dt': 'date',
    'Time': 'time', 'time': 'time',
    'Shift': 'shift', 'shift': 'shift',
    'PO No': 'poNo', 'PO No.': 'poNo', 'P.O. No': 'poNo', 'Purchase Order': 'poNo',
    'Doc No': 'docNo', 'Doc No.': 'docNo', 'Document No': 'docNo',
    'Operator': 'operator', 'Checked By': 'operator', 'Inspector': 'operator',
    'Lot No': 'lotNumber', 'Lot Number': 'lotNumber', 'Lot No.': 'lotNumber',
    'Batch No': 'batchNo', 'Batch No.': 'batchNo',
    'Temperature': 'temperature', 'Temp': 'temperature', 'Room Temperature': 'temperature',
    'Humidity': 'humidity', 'RH': 'humidity', 'Relative Humidity': 'humidity',
  };

  for (const [docKey, docValue] of Object.entries(diResult.keyValuePairs)) {
    const cleanKey = docKey.replace(/[:.\s]+$/, '').trim();
    const fieldName = kvMapping[cleanKey];
    if (fieldName) {
      fields[fieldName] = docValue;
    }
  }

  // 2. Parse tables for checkpoint data
  for (const table of diResult.tables) {
    parseIPQCTable(table, fields);
  }

  // 3. Fall back to text parsing for anything missed
  if (diResult.text && Object.keys(fields).length < 5) {
    console.log('📝 Few fields from structured data, also parsing raw text...');
    parseRawTextFallback(diResult.text, fields);
  }

  console.log('🗺️ Mapped', Object.keys(fields).length, 'IPQC fields from Document Intelligence');
  return fields;
};

/**
 * Parse IPQC checkpoint tables from Document Intelligence table extraction
 */
function parseIPQCTable(table, fields) {
  const headers = table.headers.map(h => h.toLowerCase().trim());

  for (const row of table.rows) {
    // Try to identify the checkpoint/parameter from the row
    const rowValues = Object.entries(row);
    let paramName = '';
    let paramValue = '';

    for (const [header, value] of rowValues) {
      const lowerHeader = header.toLowerCase().trim();
      
      // Parameter/checkpoint name columns
      if (lowerHeader.includes('parameter') || lowerHeader.includes('checkpoint') || 
          lowerHeader.includes('check point') || lowerHeader.includes('description') ||
          lowerHeader.includes('particulars') || lowerHeader.includes('item')) {
        paramName = value.trim();
      }
      
      // Value/observation/result columns
      if (lowerHeader.includes('observation') || lowerHeader.includes('result') || 
          lowerHeader.includes('actual') || lowerHeader.includes('value') ||
          lowerHeader.includes('reading') || lowerHeader.includes('status') ||
          lowerHeader.includes('ok/ng') || lowerHeader.includes('remark')) {
        if (value.trim()) {
          paramValue = value.trim();
        }
      }
    }

    if (paramName && paramValue) {
      // Map common IPQC parameter names to field names
      const paramMapping = {
        'front glass cutting dimension': 'frontGlassDimension',
        'glass dimension': 'frontGlassDimension',
        'front glass dimension': 'frontGlassDimension',
        'appearance': 'appearance',
        'visual appearance': 'appearance',
        'eva/epe type': 'eva1Type',
        'eva type': 'eva1Type',
        'eva/epe cutting dimension': 'eva1Dimension',
        'eva dimension': 'eva1Dimension',
        'eva manufacturing date': 'evaManufacturingDate',
        'eva mfg date': 'evaManufacturingDate',
        'dust particle': 'evaStatus',
        'eva status': 'evaStatus',
        'soldering temperature': 'evaSolderingTemp',
        'soldering temp': 'evaSolderingTemp',
        'soldering quality': 'evaSolderingQuality',
        'cell manufacturer': 'cellManufacturer',
        'cell make': 'cellManufacturer',
        'cell efficiency': 'cellEfficiency',
        'efficiency': 'cellEfficiency',
        'cell size': 'cellSize',
        'cell condition': 'cellCondition',
        'cleanliness': 'cleanliness',
        'cell loading area': 'cleanliness',
        'cross cutting': 'crossCutting',
        'string to string gap': 'stringToStringGap',
        'cell edge to glass edge top': 'cellEdgeTop',
        'cell edge to glass edge bottom': 'cellEdgeBottom',
        'cell edge to glass edge sides': 'cellEdgeSides',
        'busbar peel strength': 'busbarPeelStrength',
        'peel strength': 'busbarPeelStrength',
        'terminal busbar': 'terminalBusbar',
        'back glass dimension': 'backGlassDimension',
        'back sheet dimension': 'backGlassDimension',
        'number of holes': 'numberOfHoles',
        'no. of holes': 'numberOfHoles',
        'laminator monitoring': 'laminatorMonitoring',
        'diaphragm cleaning': 'diaphragmCleaning',
        'peel test': 'peelStrengthValue',
        'gel content': 'gelContent',
        'blade life cycle': 'bladeLifeCycle',
        'blade condition': 'bladeCondition',
        'glue uniformity': 'glueUniformity',
        'anodizing thickness': 'anodizingThickness',
        'jb appearance': 'jbAppearance',
        'junction box appearance': 'jbAppearance',
        'cable length': 'jbCableLength',
        'jb cable length': 'jbCableLength',
        'silicon glue weight': 'siliconGlueWeight',
        'silicone weight': 'siliconGlueWeight',
        'jb model': 'jbModel',
        'junction box model': 'jbModel',
        'max welding time': 'maxWeldingTime',
        'welding time': 'maxWeldingTime',
        'soldering current': 'solderingCurrent',
        'jb soldering quality': 'jbSolderingQuality',
        'potting weight': 'pottingWeight',
        'curing temperature': 'curingTemperature',
        'curing temp': 'curingTemperature',
        'curing humidity': 'curingHumidity',
        'curing time': 'curingTime',
        'ambient temperature': 'ambientTemp',
        'ambient temp': 'ambientTemp',
        'module temperature': 'moduleTemp',
        'module temp': 'moduleTemp',
        'sun simulator calibration': 'sunsimulatorCalibration',
        'calibration': 'sunsimulatorCalibration',
        'voltage': 'voltage',
        'module profile': 'moduleProfile',
        'module dimension': 'moduleProfile',
        'mounting hole x pitch': 'mountingHoleXPitch',
        'mounting hole y pitch': 'mountingHoleYPitch',
        'diagonal difference': 'diagonalDifference',
        'corner gap': 'cornerGap',
        'packaging label': 'packagingLabel',
        'content in box': 'contentInBox',
        'box condition': 'boxCondition',
        'pallet dimension': 'palletDimension',
        'cleaning status': 'cleaningStatus',
        'soldering iron temperature': 'solderingIronTemp',
        'soldering iron temp': 'solderingIronTemp',
        'method of rework': 'methodOfRework',
      };

      const lowerParam = paramName.toLowerCase();
      const fieldName = paramMapping[lowerParam];
      if (fieldName) {
        fields[fieldName] = paramValue;
      }
    }
  }
}

/**
 * Fallback: parse raw text for fields not found in structured extraction
 */
function parseRawTextFallback(text, fields) {
  if (!text) return;

  // Date
  if (!fields.date) {
    const m = text.match(/Date[:\s]*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i);
    if (m) fields.date = m[1];
  }
  // Time
  if (!fields.time) {
    const m = text.match(/Time[:\s]*(\d{1,2}:\d{2}(?::\d{2})?)/i);
    if (m) fields.time = m[1];
  }
  // Shift
  if (!fields.shift) {
    const m = text.match(/Shift[:\s]*(A|B|C|Day|Night|General)/i);
    if (m) fields.shift = m[1];
  }
  // PO No
  if (!fields.poNo) {
    const m = text.match(/(?:PO|P\.O|Purchase\s*Order)[.\s:]*(\S+)/i);
    if (m) fields.poNo = m[1];
  }
  // Temp
  if (!fields.temperature) {
    const m = text.match(/(?:Temp|Temperature)[:\s]*([\d.]+)\s*[°℃C]/i);
    if (m) fields.temperature = m[1] + '℃';
  }
  // Humidity
  if (!fields.humidity) {
    const m = text.match(/(?:Humidity|RH)[:\s]*([\d.]+)\s*%/i);
    if (m) fields.humidity = m[1] + '%';
  }
  // Serial numbers
  const serialPattern = /\b[A-Z]{2,4}\d{5,}[A-Z]{0,3}\d{5,}\b/g;
  const serials = text.match(serialPattern) || [];
  const uniqueSerials = [...new Set(serials)];
  for (let i = 0; i < Math.min(5, uniqueSerials.length); i++) {
    if (!fields[`elBarcode${i + 1}`]) {
      fields[`elBarcode${i + 1}`] = uniqueSerials[i];
    }
  }
}

/**
 * Convenience: Extract text only (drop-in replacement for azureOCR extractTextFromImage)
 * Returns just the text string, same as Computer Vision OCR
 */
export const extractTextFromDocument = async (imageDataUrl) => {
  const result = await extractWithDocumentIntelligence(imageDataUrl);
  return result.text;
};

/**
 * Full extraction: Returns both raw text AND structured data
 * Best for IPQC form processing
 */
export const extractStructuredIPQCData = async (imageDataUrl) => {
  const diResult = await extractWithDocumentIntelligence(imageDataUrl);
  const mappedFields = mapDIResultToIPQCFields(diResult);
  
  return {
    rawText: diResult.text,
    tables: diResult.tables,
    keyValuePairs: diResult.keyValuePairs,
    mappedFields: mappedFields,
    selectionMarks: diResult.selectionMarks
  };
};

export default {
  extractWithDocumentIntelligence,
  extractTextFromDocument,
  extractStructuredIPQCData,
  mapDIResultToIPQCFields
};
