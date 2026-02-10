/**
 * Batch AI Mapper for IPQC Forms
 * Strategy: First collect ALL OCR data, then map fields in small batches
 * This avoids rate limits and improves accuracy
 */

// Groq API Configuration (30 RPM, 14400 RPD - much better than Gemini!)
const GROQ_API_KEY = process.env.REACT_APP_GROQ_API_KEY || '';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Store all OCR data here
let storedOCRData = {
  pages: {},
  fullText: '',
  extractedAt: null
};

/**
 * Step 1: Store OCR data from all pages (call this for each page)
 */
export function storePageOCR(pageNumber, ocrText) {
  storedOCRData.pages[pageNumber] = ocrText;
  console.log(`📄 Stored OCR for Page ${pageNumber} (${ocrText.length} chars)`);
}

/**
 * Step 2: Combine all pages into one text
 */
export function combineAllOCR() {
  const allPages = Object.keys(storedOCRData.pages).sort((a, b) => a - b);
  let combined = '';
  
  allPages.forEach(pageNum => {
    combined += `\n=== PAGE ${pageNum} ===\n`;
    combined += storedOCRData.pages[pageNum];
    combined += '\n';
  });
  
  storedOCRData.fullText = combined;
  storedOCRData.extractedAt = new Date().toISOString();
  
  console.log(`📚 Combined ${allPages.length} pages, total ${combined.length} chars`);
  return combined;
}

/**
 * Get stored OCR data
 */
export function getStoredOCR() {
  return storedOCRData;
}

/**
 * Clear stored OCR (for new document)
 */
export function clearStoredOCR() {
  storedOCRData = { pages: {}, fullText: '', extractedAt: null };
  console.log('🗑️ Cleared stored OCR data');
}

/**
 * Step 3: Map fields in batches (small requests = no rate limit)
 * Maps specific field groups one at a time
 */
export async function mapFieldsBatch(fieldGroup) {
  const ocrText = storedOCRData.fullText || combineAllOCR();
  
  if (!ocrText) {
    console.log('❌ No OCR data stored. Call storePageOCR first.');
    return {};
  }
  
  // Define field groups with PRECISE extraction prompts based on trained regex patterns
  // Each prompt specifies EXACT patterns like the trained ipqcStageParser.js
  const fieldGroups = {
    header: {
      prompt: `Extract header info with EXACT patterns:
- DATE: DD/MM/YYYY or DD-MM-YYYY format (like "15/01/2025" or "15-01-2025")
- TIME: HH:MM format (like "10:30", "14:45")
- SHIFT: Look for "Day", "Night", "A", "B", "C", "Morning", "Evening"
- OPERATOR: Name after "Operator:", "Checked By:", "Inspector:"
- BATCH/LOT: Alphanumeric code after "Batch No:", "Lot No:", "Batch:"
- DOC NO: Format like "GSPL/IPQC/QC/XXX" or similar reference number
- PO NUMBER: Purchase Order number`,
      fields: ['date', 'time', 'shift', 'operator', 'batchNo', 'docNo', 'poNo', 'lotNumber']
    },
    stage1_shopfloor: {
      prompt: `Extract Shop Floor data with EXACT patterns (trained regex):
- TEMPERATURE: Format XX.X°C (like "25.3°C", "24.6°C") - 2 digits, decimal, 1 digit after decimal
- HUMIDITY: Format XX% or XXX% (like "55%", "62%", "48%") - 2-3 digits followed by %
- TEMPERATURE TIME: HH:MM format when temperature was recorded
- HUMIDITY TIME: HH:MM format when humidity was recorded
Look near "Shop Floor", "Environmental", "Temp", "RH", "Humidity"`,
      fields: ['temperature', 'humidity', 'temperatureTime', 'humidityTime']
    },
    stage2_glass: {
      prompt: `Extract Front Glass data with EXACT patterns (trained regex):
- DIMENSION: Format DDDD×DDDD×D.D mm (like "2278×1134×3.2 mm") - 4 digits × 4 digits × decimal
- Can also be written as "2278x1134x3.2mm" or "(2278 x 1134 x 3.2)"
- APPEARANCE: Look for "ok", "OK", "clean", "CLEAN", "good", "pass" near "Appearance"
Look near "Front Glass", "Glass Loader", "Glass Dimension"`,
      fields: ['frontGlassDimension', 'appearance', 'glassDefects']
    },
    stage3_eva: {
      prompt: `Extract EVA Cutting data with EXACT patterns (trained regex):
- EVA TYPE: MUST be one of: "EP304", "ER304", "EP 304", "ER 304", "POE", "EVA"
- DIMENSION: Format DDDD×DDDD×0.D mm (like "2278×1134×0.5 mm") - thickness 0.3-1.0
- MANUFACTURING DATE: YYYY-MM-DD or DD/MM/YYYY format
- STATUS: "OK" or "NG"
- LOT NUMBER: Alphanumeric lot/batch code
Look near "EVA Cutting", "EVA Type", "Mfg Date"`,
      fields: ['eva1Type', 'eva1Dimension', 'evaManufacturingDate', 'evaStatus', 'evaLotNo']
    },
    stage4_cell: {
      prompt: `Extract Cell/Soldering data with EXACT patterns (trained regex):
- CELL MANUFACTURER: Names like "Solar Space", "Mono", "Poly", "PERC", "TOPCon"
- CELL EFFICIENCY: Format DD.DD% (like "23.45%", "22.8%") - 2 digits, decimal, 1-2 digits
- CELL SIZE: Format DDD.D×DDD.D mm (like "182.0×182.0 mm" or "166×166mm")
- EVA SOLDERING TEMP: Format DDD°C (like "380°C", "400°C") - 350-450 range
- CELL CONDITION: "OK", "NG", "Good", "Pass"
- CLEANLINESS: "Clean", "OK"
- CELL LOT NUMBER: Alphanumeric code`,
      fields: ['cellManufacturer', 'cellEfficiency', 'cellSize', 'cellCondition', 'cleanliness', 'cellLotNo', 'evaSolderingTemp']
    },
    stage5_serial: {
      prompt: `Extract ALL SERIAL/SAMPLE NUMBERS with EXACT patterns (trained regex):
- MODULE SERIAL: Format GS0DDDT... or GSO... (like "GS0455T23925523456")
- Also matches: G5, G50 → normalize to GS0
- SAMPLE VALUES (S1-S5): Look for patterns like "S1:", "S2:", "S3:", "S4:", "S5:" or "Sample 1", "Sample 2"
- Each sample should have a serial number in GS format
- BARCODE patterns: GS followed by digits, then T, then more digits
Extract EVERY barcode/serial you find - they are critical!`,
      fields: ['sample1', 'sample2', 'sample3', 'sample4', 'sample5', 'serialNo1', 'serialNo2', 'serialNo3', 'moduleSerial']
    },
    stage6_tabber: {
      prompt: `Extract Tabber/Stringer data with EXACT patterns (trained regex):
- ATW TEMPERATURE: Format DD or DDD°C (like "85°C", "180°C")
- VISUAL CHECK for stations TS01A/TS01B/TS02A/TS02B/TS03A/TS03B/TS04A/TS04B: "OK" or "NG"
- EL IMAGE results: "OK" or "NG" for each TS station
- STRING LENGTH: Format DDDD mm (like "1163 mm") - must be 900-1500 range
- CELL GAP: Format 0.DD or D.DD mm (like "0.85", "1.2") - decimal values
- PEEL STRENGTH: Format DD.D N (like "22.5 N")
Look near "Tabber Stringer", "ATW", "String length", "Cell to Cell", "Peel Strength"`,
      fields: ['tabberAtwTemp', 'visualCheckTS01A', 'visualCheckTS01B', 'visualCheckTS02A', 'visualCheckTS02B', 'visualCheckTS03A', 'visualCheckTS03B', 'visualCheckTS04A', 'visualCheckTS04B', 'elImageTS01A', 'elImageTS01B', 'stringLengthTS01A', 'stringLengthTS01B', 'cellGapTS01A', 'cellGapTS01B', 'tabberPeelStrength']
    },
    stage7_bussing: {
      prompt: `Extract Auto Bussing data with EXACT patterns (trained regex):
- STRING TO STRING GAP: Format D.DD mm (like "2.5 mm", "3.0 mm")
- CELL EDGE TOP: Format DD.D mm (like "12.5 mm")
- CELL EDGE BOTTOM: Format DD.D mm
- CELL EDGE SIDES: Format DD.D mm
- BUSBAR PEEL STRENGTH: Format DD.D N (like "22.5 N", "18.3 N")
- TERMINAL BUSBAR: Format DD.DD mm
- SOLDERING QUALITY (3 values): "OK" or "NG"
- CREEPAGE (6 values): Format DD.DD mm for Top1, Top2, Top3, Bottom1, Bottom2, Bottom3
- AUTO TAPING (3 values): "OK" or "NG"
Look near "Auto Bussing", "String to String Gap", "Creepage", "Peel Strength"`,
      fields: ['stringToStringGap', 'cellEdgeTop', 'cellEdgeBottom', 'cellEdgeSides', 'busbarPeelStrength', 'terminalBusbar', 'solderingQuality1', 'solderingQuality2', 'solderingQuality3', 'creepageTop', 'creepageTop2', 'creepageTop3', 'creepageBottom', 'creepageBottom2', 'creepageBottom3', 'autoTaping1', 'autoTaping2', 'autoTaping3']
    },
    stage9_eva2: {
      prompt: `Extract EVA2/Back EVA data with EXACT patterns (trained regex):
- EVA2 TYPE: "EP304", "ER304", "POE", "EVA" (same as EVA1)
- DIMENSION: Format DDDD×DDDD×0.D mm (like "2278×1134×0.5 mm")
- STATUS: Date format YYYY-MM-DD or "OK"/"NG"
Look near "EVA 2", "Back EVA", "Manual"`,
      fields: ['eva2Type', 'eva2Dimension', 'eva2Status']
    },
    stage10_backglass: {
      prompt: `Extract Back Glass data with EXACT patterns (trained regex):
- DIMENSION: Format DDDD×DDDD×D.D mm (like "2278×1134×2.0 mm")
- NUMBER OF HOLES: Single digit + "Holes" (like "2 Holes", "4 Holes")
- HOLE DIMENSIONS (3 values): Format DD.DD mm (like "12.50 mm", "11.30 mm")
Can be written as "12:50" which means 12.50
Look near "Back Glass", "Backsheet", "Holes"`,
      fields: ['backGlassDimension', 'numberOfHoles', 'holesDimension1', 'holesDimension2', 'holesDimension3']
    },
    stage15_laminator: {
      prompt: `Extract Laminator data with EXACT patterns (trained regex):
- MONITORING STATUS: "OK" near "Monitoring of Laminator"
- DIAPHRAGM CLEANING: "Clean" or "CLEAN"
- PEEL TEST REF: Reference number format "GSPL/IPQC/QC/XXX"
- GEL CONTENT REF: Reference number
Look near "Laminator", "Diaphragm", "Peel Test", "Gel Content"`,
      fields: ['laminatorMonitoring', 'diaphragmCleaning', 'peelTestRef', 'gelContentRef']
    },
    stage20_jb: {
      prompt: `Extract Junction Box data with EXACT patterns (trained regex):
- JB APPEARANCE: "OK", "Good", "Pass"
- CABLE LENGTH: Format DDD or DDDD mm (like "300 mm", "1200 mm")
- SILICON GLUE WEIGHT: Format D.DD gm or DD.D gm (like "2.50 gm", "15.5 gm")
Look near "Junction Box", "JB", "Cable Length", "Silicon Glue"`,
      fields: ['jbAppearance', 'jbCableLength', 'siliconGlueWeight']
    },
    stage21_soldering: {
      prompt: `Extract JB Soldering data with EXACT patterns (trained regex):
- MAX WELDING TIME: Format D.D Sec or DD Sec (like "2.5 Sec", "3 Sec")
- SOLDERING CURRENT: Format DD Amps (like "16 Amps", "18 Amps")
- SOLDERING QUALITY: "OK", "Good", "Pass", "Covered"
Look near "Auto JB Soldering", "Welding Time", "Soldering Current"`,
      fields: ['maxWeldingTime', 'solderingCurrent', 'solderingQuality']
    },
    stage22_potting: {
      prompt: `Extract JB Potting data with EXACT patterns (trained regex):
- GLUE RATIO REF: Reference number for A/B Glue Ratio
- POTTING WEIGHT: Format D.DD gm or DD.D gm (like "8.50 gm")
- NOZZLE CHANGE TIME (2 values): Format HH:MM AM/PM (like "09:30 AM", "02:45 PM")
Look near "JB Potting", "A/B Glue Ratio", "Potting Weight"`,
      fields: ['glueRatioRef', 'pottingWeight', 'nozzleChangeTime1', 'nozzleChangeTime2', 'pottingStatus']
    },
    stage24_curing: {
      prompt: `Extract Curing data with EXACT patterns (trained regex):
- CURING TEMPERATURE: Format DD.D°C (like "25.5°C") - MUST be in 20-35 range
- CURING HUMIDITY: Format DD% (like "55%", "62%") - MUST be in 40-80 range, NOT 50%
- CURING TIME: Format D hrs or DD hrs (like "4 hrs", "8 hrs", "24 hrs") - typically 2-12 or 24
Look near "Curing", "Cure", NOT near "Laminator"`,
      fields: ['curingTemperature', 'curingHumidity', 'curingTime']
    },
    stage27_flash: {
      prompt: `Extract Flash Tester data with EXACT patterns (trained regex):
- AMBIENT TEMPERATURE: Format DD.DD°C (like "25.30°C", "26.45°C")
- MODULE TEMPERATURE: Format DD.DD°C (like "25.80°C", "27.10°C")
- SUN SIMULATOR CALIBRATION: Barcode like "GS0455T..." or calibration ref
- VALIDATION: "OK" or status
- SILVER REFERENCE EL: "OK" or status
Look near "Flash Tester", "Ambient", "Module Temp"`,
      fields: ['ambientTemp', 'moduleTemp', 'sunsimulatorCalibration', 'validation', 'silverRefEL']
    },
    stage28_hipot: {
      prompt: `Extract HiPot Test data with EXACT patterns:
- SERIAL NUMBERS for samples: GS0... format barcodes
- DCW values: Format D.D kV or DDDD V (like "1.5 kV", "1500 V")
- IR values: Format DDDD MOhm or D GOhm (like "500 MOhm", "1 GOhm")
- GC values: Format DD mOhm (like "50 mOhm")
Extract for Sample 1, Sample 2, Sample 3
Look near "Hipot", "Hi-Pot", "DCW", "IR", "GC"`,
      fields: ['hipotSNo1', 'dcw1', 'ir1', 'gc1', 'hipotSNo2', 'dcw2', 'ir2', 'gc2', 'hipotSNo3', 'dcw3', 'ir3', 'gc3']
    },
    stage29_postel: {
      prompt: `Extract Post EL Test data with EXACT patterns:
- VOLTAGE: Format DD.DD Volt (like "12.50 Volt")
- CURRENT: Format D.DD Amps (like "0.85 Amps")
- SAMPLE SERIAL NUMBERS (S1-S5): GS0... format
- RESULTS: "OK" for each sample
Look near "Post EL", "Voltage", "Current"`,
      fields: ['voltage', 'current', 'elSNo1', 'elSNo2', 'elSNo3', 'elSNo4', 'elSNo5', 'elResult1', 'elResult2', 'elResult3']
    },
    stage30_rfid: {
      prompt: `Extract RFID data with EXACT patterns:
- RFID POSITION: "Left", "Right", "Center", "Left Corner", "Right Corner"
- CELL MAKE MONTH: Format "Mon YYYY" (like "Jan 2025", "Dec 2024")
- MODULE MAKE MONTH: Format "Mon YYYY"
Look near "RFID", "Position", "Cell Make", "Module Make"`,
      fields: ['rfidPosition', 'cellMakeMonth', 'moduleMakeMonth']
    },
    stage32_dimension: {
      prompt: `Extract Dimension data with EXACT patterns (trained regex):
- MODULE DIMENSION L*W: Format DDDD×DDDD×DD or DDD mm (like "2278×1134×35 mm")
- MOUNTING HOLE: Number of holes or pitch
- DIAGONAL DIFFERENCE: Single digit mm (like "2 mm", "1 mm")
- CORNER GAP: Format D.DD mm (like "0.50 mm", "1.20 mm")
- JB CABLE LENGTH: Format DDD or DDDD mm
Look near "Dimension", "L*W", "Diagonal", "Corner Gap", "Mounting Hole"`,
      fields: ['moduleDimensionLW', 'mountingHole', 'diagonalDiff', 'cornerGap', 'moduleLength', 'moduleWidth', 'moduleThickness', 'jbCableLength']
    },
    stage33_packaging: {
      prompt: `Extract Packaging data with EXACT patterns (trained regex):
- PACKAGING LABEL: "OK" near "Packaging Label"
- CONTENT IN BOX: "OK" near "Content in Box"
- BOX CONDITION: "OK" near "Box Condition"
- PALLET DIMENSION: Format DDDD×DDD-DDDD×DD-DDD mm (like "1150×1050×120 mm")
Note: OCR may read 0 as Q or O - normalize to correct digits
Look near "Packaging", "Pallet", "Box"`,
      fields: ['packagingLabel', 'contentInBox', 'boxCondition', 'palletDimension']
    }
  };
  
  const group = fieldGroups[fieldGroup];
  if (!group) {
    console.log(`❌ Unknown field group: ${fieldGroup}`);
    return {};
  }
  
  return await callLLMForFields(ocrText, group.prompt, group.fields);
}

/**
 * Map ALL fields in sequence with delays (prevents rate limiting)
 */
export async function mapAllFieldsSequentially(progressCallback) {
  const ocrText = storedOCRData.fullText || combineAllOCR();
  
  if (!ocrText) {
    console.log('❌ No OCR data stored');
    return {};
  }
  
  const allFields = {};
  const groups = [
    'header', 'stage1_shopfloor', 'stage2_glass', 'stage3_eva', 
    'stage4_cell', 'stage5_serial', 'stage6_tabber', 'stage7_bussing', 'stage9_eva2',
    'stage10_backglass', 'stage15_laminator', 'stage20_jb', 'stage21_soldering',
    'stage22_potting', 'stage24_curing', 'stage27_flash', 'stage28_hipot',
    'stage29_postel', 'stage30_rfid', 'stage32_dimension', 'stage33_packaging'
  ];
  
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    if (progressCallback) {
      progressCallback(`Mapping ${group}... (${i + 1}/${groups.length})`);
    }
    
    console.log(`🔄 Mapping field group: ${group} (${i + 1}/${groups.length})`);
    
    try {
      const result = await mapFieldsBatch(group);
      Object.assign(allFields, result);
      
      // Delay to stay under 30 RPM rate limit (Groq is fast!)
      if (i < groups.length - 1) {
        console.log('⏳ Waiting 2s...');
        await delay(2000); // 2 second delay - Groq allows 30 RPM
      }
    } catch (error) {
      console.log(`⚠️ Error mapping ${group}:`, error.message);
      // Continue with next group even if one fails
    }
  }
  
  console.log('✅ All field groups mapped:', Object.keys(allFields).length, 'fields');
  return allFields;
}

/**
 * SMART: Map only the relevant section of OCR (reduces tokens, improves accuracy)
 */
async function callLLMForFields(fullOcrText, extractionPrompt, fieldNames, retryCount = 0) {
  const MAX_RETRIES = 3;
  // Find relevant section of OCR text (search for keywords)
  const relevantText = extractRelevantSection(fullOcrText, extractionPrompt);
  
  const systemPrompt = `You are an expert IPQC (In-Process Quality Control) form data extractor for solar panel manufacturing.

CRITICAL EXTRACTION RULES:
1. Return ONLY valid JSON object - no markdown, no code blocks, no explanations
2. Extract EXACT values as written in OCR text - preserve original format
3. ALWAYS include units: mm, °C, %, N, gm, hrs, Amps, Sec, Volt, kV, MOhm, mOhm
4. Status fields: only "OK", "NG", "Pass", "Fail", "Good", "Clean"
5. Serial numbers pattern: GS0DDDT... (normalize G5/G50 to GS0, GSO to GS0)
6. Dimensions format: DDDD×DDDD×D.D mm (use × not x)
7. Temperature format: XX.X°C
8. Humidity format: XX%
9. Use null ONLY if value truly not found
10. Extract ALL sample values S1, S2, S3, S4, S5 when present
11. Preserve decimal places exactly as in OCR

FORMAT EXAMPLES:
- Temperature: "25.3°C" not "25.3" 
- Dimension: "2278×1134×3.2 mm" not "2278x1134x3.2"
- Humidity: "55%" not "55"
- Peel strength: "22.5 N" not "22.5"
- Serial: "GS0455T23925523456" (normalized)

JSON FORMAT: {"fieldName": "exactValue", "field2": "value2"}`;

  const userPrompt = `EXTRACT these IPQC form fields: ${extractionPrompt}

REQUIRED JSON KEYS: ${fieldNames.join(', ')}

=== OCR TEXT ===
${relevantText.substring(0, 4000)}
=== END OCR ===

Return ONLY the JSON object with extracted values:`;

  try {
    console.log('📡 Calling Groq API for:', fieldNames.slice(0, 3).join(', '), '...');
    
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 500
      })
    });

    console.log('📡 Groq Response Status:', response.status);

    // Handle rate limiting with retry
    if (response.status === 429 && retryCount < MAX_RETRIES) {
      const retryDelay = 5000; // 5 seconds
      console.log(`⏳ Rate limited. Retrying in ${retryDelay/1000}s... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
      await delay(retryDelay);
      return await callLLMForFields(fullOcrText, extractionPrompt, fieldNames, retryCount + 1);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Groq API Error:', response.status, errorText);
      throw new Error(`Groq API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    console.log('📡 Groq Raw Response:', content.substring(0, 200));
    
    const parsed = parseJSON(content);
    console.log('✅ Parsed fields:', Object.keys(parsed).length, Object.keys(parsed));
    
    return parsed;
    
  } catch (error) {
    console.error('LLM call failed:', error.message);
    return {};
  }
}

/**
 * Extract relevant section of OCR based on keywords
 */
function extractRelevantSection(fullText, prompt) {
  const keywords = prompt.toLowerCase().split(/[,\s]+/).filter(w => w.length > 3);
  const lines = fullText.split('\n');
  const relevantLines = [];
  
  // Find lines containing keywords
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    const hasKeyword = keywords.some(kw => line.includes(kw));
    
    if (hasKeyword) {
      // Include context: 2 lines before and 3 lines after
      const start = Math.max(0, i - 2);
      const end = Math.min(lines.length, i + 4);
      
      for (let j = start; j < end; j++) {
        if (!relevantLines.includes(lines[j])) {
          relevantLines.push(lines[j]);
        }
      }
    }
  }
  
  // If no relevant lines found, return first portion of text
  if (relevantLines.length === 0) {
    return fullText.substring(0, 2000);
  }
  
  return relevantLines.join('\n');
}

/**
 * Parse JSON from LLM response
 */
function parseJSON(text) {
  if (!text) return {};
  
  // Clean up response
  let clean = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .replace(/`/g, '')
    .trim();
  
  // Find JSON object
  const jsonMatch = clean.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      // Try fixing common issues
      let fixed = jsonMatch[0]
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
        .replace(/'/g, '"');
      try {
        return JSON.parse(fixed);
      } catch (e2) {
        console.log('JSON parse failed:', e2.message);
      }
    }
  }
  
  return {};
}

/**
 * Utility delay function
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * MAIN FUNCTION: Process PDF with batch mapping
 * Call this after OCR is complete on all pages
 */
export async function processPDFWithBatchMapping(ocrTextsByPage, progressCallback) {
  console.log('🚀 Starting Batch AI Mapping...');
  
  // Step 1: Clear old data
  clearStoredOCR();
  
  // Step 2: Store all page OCR data
  Object.entries(ocrTextsByPage).forEach(([pageNum, text]) => {
    storePageOCR(parseInt(pageNum), text);
  });
  
  // Step 3: Combine all OCR
  combineAllOCR();
  
  // Step 4: Map all fields sequentially with delays
  const allMappedData = await mapAllFieldsSequentially(progressCallback);
  
  console.log('✅ Batch mapping complete!', Object.keys(allMappedData).length, 'fields extracted');
  
  return allMappedData;
}

export default {
  storePageOCR,
  combineAllOCR,
  getStoredOCR,
  clearStoredOCR,
  mapFieldsBatch,
  mapAllFieldsSequentially,
  processPDFWithBatchMapping
};
