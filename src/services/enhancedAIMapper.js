/**
 * Enhanced AI Mapping Service for IPQC Forms
 * Uses Groq API to intelligently map OCR text to IPQC form fields
 * Works with any OCR text regardless of page layout or structure
 */

// Groq API Configuration (30 RPM, 14400 RPD - much better limits!)
const GROQ_API_KEY = process.env.REACT_APP_GROQ_API_KEY || '';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Enhanced AI-powered IPQC mapping using LLM
 * @param {string} ocrText - Complete OCR text from Azure OCR
 * @param {Array} checkpoints - Current IPQC form checkpoints structure
 * @returns {Object} - Mapped form data with updates
 */
export async function mapIPQCWithAI(ocrText, checkpoints = []) {
  console.log('🤖 AI Mapping: Starting intelligent field extraction...');
  
  try {
    // Create comprehensive field mapping prompt
    const mappingResult = await callEnhancedMappingAPI(ocrText);
    
    if (!mappingResult || Object.keys(mappingResult).length === 0) {
      console.log('⚠️ AI mapping failed, no data extracted');
      return { header: {}, checkpointUpdates: [] };
    }
    
    console.log('✅ AI Mapping successful:', Object.keys(mappingResult).length, 'fields extracted');
    
    // Convert AI result to IPQC form structure
    const formUpdates = convertAIResultToIPQCFormat(mappingResult, checkpoints);
    
    return formUpdates;
    
  } catch (error) {
    console.error('❌ AI Mapping Error:', error);
    return { header: {}, checkpointUpdates: [] };
  }
}

/**
 * Call Google Gemini API with comprehensive IPQC mapping prompt
 */
async function callEnhancedMappingAPI(ocrText) {
  const systemPrompt = `You are an expert AI system for extracting data from IPQC (In-Process Quality Control) forms in solar panel manufacturing.

Your task: Extract ALL relevant form data from OCR text and return it as a structured JSON object.

CRITICAL RULES:
1. Return ONLY valid JSON. No explanations, no markdown, no code blocks.
2. If a field is not found, use null
3. For OK/Pass status, look for: ✓, ☑, "OK", "PASS", "Good", checkmarks
4. For measurements, include units (mm, °C, %, W, V, A, etc.)
5. Extract ALL numbers, dates, times, serial numbers, and status values
6. Be flexible with field names - extract content even if field names vary

Field Categories to Extract:
- Header: date, time, shift, operator, batch, serial numbers
- Measurements: dimensions, temperatures, voltages, currents, power
- Quality checks: visual inspection results, defect counts, pass/fail status  
- Materials: EVA types, glass types, cell types, junction box info
- Test results: electrical tests, mechanical tests, performance values
- Process data: machine settings, environmental conditions
- Inspection notes: remarks, comments, observations

Return format: {"fieldName": "value", "fieldName2": "value2", ...}`;

  const userPrompt = `Extract ALL IPQC form data from this OCR text. Return comprehensive JSON with all found values:

=== OCR TEXT START ===
${ocrText.substring(0, 6000)} ${ocrText.length > 6000 ? '\n[...text truncated for length...]' : ''}
=== OCR TEXT END ===

Extract everything you can find and return as JSON:`;

  // Use Groq API (OpenAI-compatible format)
  try {
    console.log('🚀 Calling Groq API...');
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
        max_tokens: 3000
      })
    });

    if (response.ok) {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      const result = parseEnhancedJSON(content);
      if (result && Object.keys(result).length > 0) {
        console.log('✅ Groq extraction successful');
        return result;
      }
    } else {
      const errorText = await response.text();
      console.log('⚠️ Groq API error:', response.status, errorText);
    }
  } catch (error) {
    console.log('⚠️ Groq failed:', error.message);
  }

  console.log('❌ AI API failed');
  return {};
}

/**
 * Enhanced JSON parser for LLM responses
 */
function parseEnhancedJSON(text) {
  if (!text || typeof text !== 'string') {
    return {};
  }
  
  console.log('🔍 Parsing AI response...');
  
  // Clean response text
  let cleanText = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .replace(/`/g, '')
    .trim();
  
  // Try direct parsing first
  try {
    const result = JSON.parse(cleanText);
    console.log('✅ Direct JSON parse successful:', Object.keys(result).length, 'fields');
    return result;
  } catch (e) {
    console.log('⚠️ Direct parse failed, trying cleanup...');
  }
  
  // Enhanced cleanup for better parsing
  try {
    // Fix common LLM JSON issues
    let fixedJson = cleanText
      .replace(/,\s*}/g, '}')           // Remove trailing commas
      .replace(/,\s*]/g, ']')
      .replace(/'/g, '"')              // Replace single quotes
      .replace(/(\w+):/g, '"$1":')     // Quote unquoted keys
      .replace(/""+/g, '"')            // Fix double quotes
      .replace(/:\s*([^",\[\]{}\s][^,\[\]{}]*[^",\[\]{}\s])\s*([,}])/g, ': "$1"$2') // Quote values
      .replace(/\n/g, '')              // Remove newlines
      .replace(/\r/g, '');
    
    const result = JSON.parse(fixedJson);
    console.log('✅ Enhanced JSON parse successful:', Object.keys(result).length, 'fields');
    return result;
    
  } catch (e) {
    console.log('⚠️ Enhanced parse failed, trying manual extraction...');
  }
  
  // Manual key-value extraction as fallback
  const extracted = {};
  const patterns = [
    /"(\w+)":\s*"([^"]+)"/g,           // "key": "value"
    /"(\w+)":\s*([^,}\s]+)/g,          // "key": value
    /(\w+):\s*"([^"]+)"/g,             // key: "value"
    /(\w+):\s*([^,}\s]+)/g             // key: value
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(cleanText)) !== null) {
      const key = match[1].trim();
      let value = match[2].trim().replace(/[",]/g, '');
      
      if (key && value && value !== 'null' && value !== 'undefined' && !extracted[key]) {
        extracted[key] = value;
      }
    }
  }
  
  console.log('✅ Manual extraction found:', Object.keys(extracted).length, 'fields');
  return extracted;
}

/**
 * Convert AI mapping result to IPQC form update structure
 * Maps AI extracted fields to specific IPQC form fields and checkpoints
 */
function convertAIResultToIPQCFormat(aiResult, checkpoints) {
  const updates = {
    header: {},
    checkpointUpdates: []
  };
  
  // Header field mappings
  const headerMappings = {
    'date': ['date', 'testDate', 'inspection_date'],
    'time': ['time', 'testTime', 'inspection_time'],
    'shift': ['shift', 'shiftNo', 'shift_no'],
    'operator': ['operator', 'inspector', 'operatorName'],
    'poNo': ['poNo', 'po_no', 'batchNo', 'batch_no'],
    'serialNo': ['serialNo', 'serial_no', 'moduleSerial']
  };
  
  // Extract header fields
  for (const [formField, aiFields] of Object.entries(headerMappings)) {
    for (const aiField of aiFields) {
      if (aiResult[aiField]) {
        updates.header[formField] = aiResult[aiField];
        console.log(`📋 Header mapping: ${formField} = ${aiResult[aiField]}`);
        break;
      }
    }
  }
  
  // Extract checkpoint data
  const extractedValues = [];
  
  // Look for common IPQC patterns in AI result
  Object.entries(aiResult).forEach(([key, value]) => {
    if (!value || value === 'null') return;
    
    // Temperature values
    if (key.toLowerCase().includes('temp') || value.toString().includes('°C')) {
      extractedValues.push({ type: 'temperature', value: value, field: key });
    }
    
    // Dimension values  
    if (key.toLowerCase().includes('dimension') || value.toString().match(/\d+\s*[x×]\s*\d+/)) {
      extractedValues.push({ type: 'dimension', value: value, field: key });
    }
    
    // Status values (OK/Pass/Fail)
    if (value.toString().toLowerCase().match(/\b(ok|pass|fail|ng|good|clean)\b/)) {
      extractedValues.push({ type: 'status', value: value, field: key });
    }
    
    // Measurement values
    if (value.toString().match(/\d+\.?\d*\s*(mm|cm|m|V|A|W|%|kg|N|MPa)/)) {
      extractedValues.push({ type: 'measurement', value: value, field: key });
    }
    
    // EVA/EPE types
    if (key.toLowerCase().includes('eva') || key.toLowerCase().includes('epe') || 
        value.toString().match(/^(EP|ER|POE)\d+/)) {
      extractedValues.push({ type: 'material', value: value, field: key });
    }
  });
  
  console.log('🔍 Extracted values for mapping:', extractedValues.length);
  
  // Smart checkpoint mapping based on content
  extractedValues.forEach((extracted, index) => {
    // Find best matching checkpoint
    const matchingCheckpoint = findBestCheckpointMatch(extracted, checkpoints);
    
    if (matchingCheckpoint !== -1) {
      updates.checkpointUpdates.push({
        index: matchingCheckpoint,
        field: 'result',
        value: extracted.value
      });
      console.log(`✅ Mapped: ${extracted.field} (${extracted.value}) → Checkpoint ${matchingCheckpoint + 1}`);
    }
  });
  
  return updates;
}

/**
 * Find the best matching checkpoint for extracted data
 */
function findBestCheckpointMatch(extracted, checkpoints) {
  if (!checkpoints || checkpoints.length === 0) return -1;
  
  const { type, value, field } = extracted;
  
  // Keyword matching for different types
  const typeKeywords = {
    temperature: ['temperature', 'temp', 'heating', 'thermal'],
    dimension: ['dimension', 'size', 'length', 'width', 'thickness'],
    status: ['inspection', 'visual', 'quality', 'condition'],
    measurement: ['test', 'measurement', 'value'],
    material: ['eva', 'epe', 'material', 'type']
  };
  
  const keywords = typeKeywords[type] || [];
  
  // Find checkpoint with matching keywords
  for (let i = 0; i < checkpoints.length; i++) {
    const checkpoint = checkpoints[i];
    const checkpointText = (checkpoint.checkpoint || '').toLowerCase() + 
                          (checkpoint.stage || '').toLowerCase();
    
    // Check if any keyword matches
    for (const keyword of keywords) {
      if (checkpointText.includes(keyword)) {
        return i;
      }
    }
    
    // Check field name matching
    if (checkpointText.includes(field.toLowerCase())) {
      return i;
    }
  }
  
  // Default to sequential mapping if no specific match
  return -1;
}

/**
 * Batch mapping for multiple images/pages
 */
export async function mapMultipleIPQCWithAI(ocrTexts, checkpoints = []) {
  console.log('🤖 AI Batch Mapping: Processing', ocrTexts.length, 'pages...');
  
  // Combine all OCR texts
  const combinedText = ocrTexts.join('\n--- Page Break ---\n');
  
  // Single comprehensive mapping call
  return await mapIPQCWithAI(combinedText, checkpoints);
}

export default {
  mapIPQCWithAI,
  mapMultipleIPQCWithAI
};