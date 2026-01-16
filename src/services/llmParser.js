// LLM-based OCR Data Parser
// Uses FREE LLM APIs to intelligently extract form fields from OCR text

// ============== FREE API OPTIONS ==============
// 1. Groq API - FREE, very fast (get key: https://console.groq.com/keys)
// 2. Google Gemini - FREE tier (get key: https://makersuite.google.com/app/apikey)
// 3. Hugging Face - COMPLETELY FREE, no rate limits (get key: https://huggingface.co/settings/tokens)
// 4. Ollama - FREE, runs locally (install: https://ollama.ai)

import {
  parsePage1,
  parsePage2,
  parsePage3,
  parsePage4,
  parsePage5,
  parsePage6,
  parsePage7,
} from './ipqcStageParser';

const GROQ_API_KEY = process.env.REACT_APP_GROQ_API_KEY || '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';
const GEMINI_API_KEY = process.env.REACT_APP_GEMINI_API_KEY || 'AIzaSyAq3VKTBHO6G47GakorL-imfz19RF3ryh4';
const HUGGINGFACE_API_KEY = process.env.REACT_APP_HUGGINGFACE_API_KEY || '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'; // FREE, NO RATE LIMITS!
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
const HUGGINGFACE_API_URL = 'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2';
const OLLAMA_URL = 'http://localhost:11434/api/generate';

/**
 * Parse OCR text using Groq LLM (FREE)
 * @param {string} ocrText - Raw OCR text from PDF page
 * @param {number} pageNumber - Which page (1-7) to extract fields for
 * @returns {Object} - Extracted form fields
 */
export async function parseWithLLM(ocrText, pageNumber) {
  console.log(`🤖 LLM Parser: Processing Page ${pageNumber}...`);
  
  // Define what fields to extract for each page
  const pageFieldsPrompt = getPageFieldsPrompt(pageNumber);
  
  const systemPrompt = `You are an expert OCR data extractor for IPQC (In-Process Quality Control) forms in a solar panel manufacturing plant.

CRITICAL: You MUST return ONLY a valid JSON object. No explanations, no markdown, no code blocks.

Rules for extraction:
1. Return ONLY valid JSON - example: {"field1": "value1", "field2": "value2"}
2. If a field is not found in OCR text, use null
3. For status fields (OK/NG), return "OK" if you see checkmark ☑, tick ✓, or "OK" text
4. For dimensions, extract the numbers and format as "LxWxT mm" (e.g., "2278×1134×3.2 mm")
5. For temperatures, include °C unit (e.g., "23.5°C")
6. For percentages, include % symbol (e.g., "45%")
7. EVA/EPE Type codes look like: EP304, ER304, POE, etc.
8. Look for numeric measurements near keywords
9. Serial numbers start with GS or GSO followed by digits

IMPORTANT: Your response must start with { and end with }`;

  const userPrompt = `Extract these IPQC form fields from the OCR text below.
Return ONLY a JSON object with field names as keys and extracted values.

Page ${pageNumber} - Fields to extract:
${pageFieldsPrompt}

=== OCR TEXT START ===
${ocrText.substring(0, 4000)}
=== OCR TEXT END ===

JSON output:`;

  // SKIP GROQ - Rate limited (30 req/min exhausted)
  // try {
  //   if (GROQ_API_KEY) {
  //     const result = await callGroqAPI(systemPrompt, userPrompt);
  //     if (result) {
  //       console.log('✅ Groq LLM extraction successful');
  //       return result;
  //     }
  //   }
  // } catch (error) {
  //   console.log('⚠️ Groq API failed:', error.message);
  // }

  // Try Hugging Face FIRST (completely free, no rate limits!)
  try {
    if (HUGGINGFACE_API_KEY && HUGGINGFACE_API_KEY !== 'hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx') {
      console.log('🤖 Trying Hugging Face (may take 10-20s for model loading)...');
      const result = await callHuggingFaceAPI(systemPrompt, userPrompt);
      if (result) {
        console.log('✅ Hugging Face LLM extraction successful');
        return result;
      }
    }
  } catch (error) {
    console.log('⚠️ Hugging Face API failed:', error.message);
  }

  // Try Google Gemini (free)
  try {
    if (GEMINI_API_KEY) {
      const result = await callGeminiAPI(systemPrompt, userPrompt);
      if (result) {
        console.log('✅ Gemini LLM extraction successful');
        return result;
      }
    }
  } catch (error) {
    console.log('⚠️ Gemini API failed:', error.message);
  }

  // Fallback to local Ollama if available
  try {
    const result = await callOllamaAPI(systemPrompt, userPrompt);
    if (result) {
      console.log('✅ Ollama extraction successful');
      return result;
    }
  } catch (error) {
    console.log('⚠️ Ollama not available:', error.message);
  }

  // Final fallback: return empty object
  console.log('⚠️ LLM parsing failed, using regex fallback');
  return {};
}

/**
 * Call Groq API with retry and exponential backoff for rate limits
 */
async function callGroqAPI(systemPrompt, userPrompt, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.05,
          max_tokens: 3000,
          response_format: { type: 'json_object' }
        })
      });

      if (response.status === 429) {
        // Rate limit - wait and retry with exponential backoff
        const waitTime = Math.pow(2, attempt) * 5000; // 5s, 10s, 20s
        console.log(`⏳ Groq rate limit hit. Waiting ${waitTime/1000}s before retry ${attempt + 1}/${retries}...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue; // Retry
      }

      if (!response.ok) {
        throw new Error(`Groq API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content || '';
      
      return parseJSONFromText(content);
      
    } catch (error) {
      if (attempt === retries - 1) {
        throw error; // Last attempt failed
      }
      console.log(`⚠️ Groq attempt ${attempt + 1} failed, retrying...`);
    }
  }
  
  throw new Error('Groq API failed after all retries');
}

/**
 * Call Google Gemini API (FREE tier available)
 * Get key: https://makersuite.google.com/app/apikey
 */
async function callGeminiAPI(systemPrompt, userPrompt) {
  const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: `${systemPrompt}\n\n${userPrompt}`
        }]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2000
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  
  // Parse JSON from response
  return parseJSONFromText(content);
}

/**
 * Call Hugging Face Inference API via Backend Proxy (avoids CORS)
 * Get FREE API key: https://huggingface.co/settings/tokens
 * Model: Mistral-7B-Instruct (fast, accurate, free)
 */
async function callHuggingFaceAPI(systemPrompt, userPrompt) {
  // Call via backend proxy to avoid CORS
  const API_BASE_URL = window.location.origin;
  
  const response = await fetch(`${API_BASE_URL}/api/llm/huggingface`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prompt: `<s>[INST] ${systemPrompt}\n\n${userPrompt} [/INST]`,
      apiKey: HUGGINGFACE_API_KEY
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Hugging Face API error: ${response.status}`);
  }

  const result = await response.json();
  const content = result.data?.[0]?.generated_text || '';
  
  // Parse JSON from response
  return parseJSONFromText(content);
}

/**
 * Call local Ollama API (completely free, runs locally)
 */
async function callOllamaAPI(systemPrompt, userPrompt) {
  const response = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama3.1', // or 'mistral', 'phi3', etc.
      prompt: `${systemPrompt}\n\n${userPrompt}`,
      stream: false
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status}`);
  }

  const data = await response.json();
  return parseJSONFromText(data.response || '');
}

/**
 * Parse JSON from LLM response text - ROBUST VERSION
 */
function parseJSONFromText(text) {
  if (!text || typeof text !== 'string') {
    console.log('❌ Empty or invalid LLM response');
    return {};
  }
  
  console.log('🔍 Parsing LLM response, length:', text.length);
  
  // Step 1: Remove markdown code blocks
  let cleanText = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .replace(/`/g, '')
    .trim();
  
  // Step 2: Try direct parse
  try {
    const result = JSON.parse(cleanText);
    console.log('✅ Direct JSON parse successful, fields:', Object.keys(result).length);
    return result;
  } catch (e) {
    // Continue to other methods
  }
  
  // Step 3: Find JSON object pattern - greedy match for largest valid JSON
  const jsonPatterns = [
    /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g,  // Nested objects
    /\{[\s\S]*?\}/g  // Simple objects
  ];
  
  for (const pattern of jsonPatterns) {
    const matches = cleanText.match(pattern);
    if (matches) {
      // Try each match, starting with longest
      const sortedMatches = matches.sort((a, b) => b.length - a.length);
      for (const match of sortedMatches) {
        try {
          // Fix common JSON issues
          let fixedJson = match
            .replace(/,\s*}/g, '}')  // Remove trailing commas
            .replace(/,\s*]/g, ']')
            .replace(/'/g, '"')  // Replace single quotes with double
            .replace(/(\w+):/g, '"$1":')  // Add quotes to unquoted keys
            .replace(/""+/g, '"')  // Fix double quotes
            .replace(/:\s*([^",\[\]{}\s][^,\[\]{}]*[^",\[\]{}\s])\s*([,}])/g, ': "$1"$2');  // Quote unquoted values
          
          const result = JSON.parse(fixedJson);
          if (Object.keys(result).length > 0) {
            console.log('✅ JSON pattern match successful, fields:', Object.keys(result).length);
            return result;
          }
        } catch (e) {
          continue;
        }
      }
    }
  }
  
  // Step 4: Try to extract key-value pairs manually
  console.log('⚠️ JSON parse failed, trying manual extraction...');
  const extracted = {};
  const keyValuePattern = /"?(\w+)"?\s*[:=]\s*"?([^",\n\r}]+)"?/g;
  let match;
  while ((match = keyValuePattern.exec(cleanText)) !== null) {
    const key = match[1].trim();
    let value = match[2].trim();
    // Clean up value
    value = value.replace(/[",]/g, '').trim();
    if (key && value && value !== 'null' && value !== 'undefined') {
      extracted[key] = value;
    }
  }
  
  if (Object.keys(extracted).length > 0) {
    console.log('✅ Manual extraction found', Object.keys(extracted).length, 'fields');
    return extracted;
  }
  
  console.log('❌ Could not extract any data from LLM response');
  console.log('📝 Response preview:', cleanText.substring(0, 500));
  return {};
}

/**
 * Get field extraction prompt for each page
 */
function getPageFieldsPrompt(pageNumber) {
  const pageFields = {
    1: `
Page 1 Fields to Extract (IPQC Check Sheet - Sr.No 1-20):
This is a Gautam Solar IPQC Check Sheet. Extract these fields from the Monitoring Result column:

Sr.1 Shop Floor - Temperature:
- temperature: Shop floor temperature value (e.g., "23.5°C", "24°C")

Sr.2 Shop Floor - Humidity:
- humidity: Humidity percentage (e.g., "45%", "38%")

Sr.3 Glass Loader - Glass dimension(L*W*T):
- frontGlassDimension: Glass dimensions in mm (e.g., "2278×1134×3.2mm", "2272×1128×2.0mm")

Sr.4 Glass Loader - Appearance(Visual):
- appearance: Visual check result ("OK" or description)

Sr.5 EVA/EPE Cutting - EVA/EPE Type:
- eva1Type: EVA type code (e.g., "EP304", "ER304", "POE", "304")

Sr.6 EVA/EPE Cutting - EVA/EPE dimension(L*W*T):
- eva1Dimension: EVA dimensions (e.g., "2274×1125×0.50mm", "2274×1125×0.70mm")

Sr.7 EVA/EPE Cutting - EVA/EPE Status:
- evaStatusOk: EVA condition check ("OK")

Sr.8 EVA/EPE Soldering at edge - Soldering Temperature and Quality:
- solderingTemperature: Temperature value (e.g., "410°C", "400°C")
- solderingQuality: Quality check ("OK")

Sr.9 Cell Loading - Cell Manufacturer & Eff.:
- cellManufacturer: Cell maker name (e.g., "Astronergy", "Solar Space", "Jinko")
- cellEfficiency: Efficiency percentage (e.g., "24.20%", "25.50%")

Sr.10 Cell Loading - Cell Size(L*W):
- cellSize: Cell dimensions (e.g., "182.2×91.45mm", "182.30×91.93mm")

Sr.11 Cell Loading - Cell Condition:
- cellCondition: Cell condition ("OK")

Sr.12 Cell Loading - Cleanliness of Cell Loading Area:
- cleanliness: Cleanliness status ("OK", "Clean")

Sr.13 Cell Loading - Verification of Process Parameter (ATW):
- atwTemp: ATW Stringer temperature or "OK"

Sr.14 Cell Loading - Cell Cross cutting:
- crossCutting: Cross cutting status ("Equal", "OK")

Sr.15 Tabber & Stringer - Verification of Process Parameter:
- tabberProcessParam: Process parameter status ("OK")

Sr.16 Tabber & Stringer - Visual Check after Stringing (TABLE with TS01A-TS04B columns):
- visualCheckTS01A, visualCheckTS01B, visualCheckTS02A, visualCheckTS02B: All "OK"
- visualCheckTS03A, visualCheckTS03B, visualCheckTS04A, visualCheckTS04B: All "OK"

Sr.17 Tabber & Stringer - EL Image of Strings (TABLE with TS01A-TS04B columns):
- elImageTS01A, elImageTS01B, elImageTS02A, elImageTS02B: All "OK"
- elImageTS03A, elImageTS03B, elImageTS04A, elImageTS04B: All "OK"

Sr.18 Tabber & Stringer - String length (TABLE with numeric values):
- stringLengthTS01A, stringLengthTS01B: 4-digit numbers (e.g., "1163", "1169")
- stringLengthTS02A, stringLengthTS02B, stringLengthTS03A, stringLengthTS03B
- stringLengthTS04A, stringLengthTS04B

Sr.19 Tabber & Stringer - Cell to Cell Gap (TABLE with decimal values):
- cellGapTS01A, cellGapTS01B: Decimal values (e.g., "0.76", "0.72")
- cellGapTS02A, cellGapTS02B, cellGapTS03A, cellGapTS03B
- cellGapTS04A, cellGapTS04B

Sr.20 Tabber & Stringer - Verification of Soldering Peel Strength (Ribbon to Cell):
- tabberPeelStrength: Extract as per defined criteria (NOT 21N - that's for busbar only). Look for "As per spec" or actual value like "≥1N"`,

    2: `
Page 2 Fields to Extract (IPQC Check Sheet - Sr.No 20-33):
This page continues from Stringer section and covers Auto Bussing, EVA/EPE, Back Glass.

Sr.20 (if on this page) - Verification of Soldering Peel Strength:
- ribbonToCellPeelStrength: Ribbon to cell peel strength (e.g., "≥1N", "21N" means ≥1N)

Sr.21 Auto Bussing - String to String Gap:
- stringToStringGap: Gap measurement (e.g., "1.60mm", "1.6mm")

Sr.22 Auto Bussing - Cell edge to Glass edge distance (TOP/Bottom/Sides):
- cellEdgeTop: TOP edge distance (e.g., "18.72mm")
- cellEdgeBottom: Bottom edge distance (e.g., "18.60mm")
- cellEdgeSides: Sides edge distance (e.g., "13.25mm")

Sr.23 Auto Bussing - Soldering Peel Strength (Ribbon to busbar):
- busbarPeelStrength: Busbar peel strength (e.g., "≥2N", "22N" means ≥2N)

Sr.24 Auto Bussing - Terminal busbar to edge of Cell:
- terminalBusbarToEdge: Distance value (e.g., "3.12mm")

Sr.25 Auto Bussing - Soldering Quality of Ribbon to busbar (3 readings):
- solderingQuality1: First reading ("OK")
- solderingQuality2: Second reading ("OK")
- solderingQuality3: Third reading ("OK")

Sr.26 Auto Bussing - Top & Bottom Creepage Distance (multiple readings):
Top row readings:
- creepageTop1: First top value (e.g., "11.70mm")
- creepageTop2: Second top value (e.g., "12.04mm")
- creepageTop3: Third top value (e.g., "11.82mm")
Bottom row readings:
- creepageBottom1: First bottom value (e.g., "11.60mm")
- creepageBottom2: Second bottom value (e.g., "11.70mm")
- creepageBottom3: Third bottom value (e.g., "11.72mm")

Sr.27 Auto Bussing - Verification of Process Parameter:
- autoBussingStatus: Process verification ("OK")

Sr.28 Auto Bussing - Quality of auto taping (3 readings):
- autoTapingQuality1: First reading ("OK")
- autoTapingQuality2: Second reading ("OK")
- autoTapingQuality3: Third reading ("OK")

Sr.29 Auto RFID - Position verification of RFID & Logo/Barcode (3 readings):
- rfidPosition1: First position check ("OK")
- rfidPosition2: Second position check ("OK")
- rfidPosition3: Third position check ("OK")

Sr.30 EVA/EPE Cutting - EVA/EPE Type (second EVA layer):
- eva2Type: EVA type (e.g., "304", "EP304", "EVA")

Sr.31 EVA/EPE Cutting - EVA/EPE dimension(L*W*T):
- eva2Dimension: Dimensions (e.g., "2274×1125×0.70mm", "(2274×1125×0.70)mm")

Sr.32 EVA/EPE Cutting - EVA/EPE Status:
- eva2StatusOk: Status check ("OK")

Sr.33 Back Glass Loader - Glass dimension(L*W*T):
- backGlassDimension: Back glass dimensions (e.g., "2272×1128×2.0mm", "(2272×1128×2.0)mm")`,

    3: `
Page 3 Fields to Extract (IPQC Check Sheet - Sr.No 33-41):
This page covers Back Glass, Flatten, Pre-Lamination EL, String Rework, Module Rework.

Sr.33 (if on this page) Back Glass Loader - Glass dimension:
- backGlassDimension: Dimensions (e.g., "2272×1128×2.0mm")

Sr.34 Back Glass Loader - No. of Holes & Dimension:
- numberOfHoles: Number of holes (e.g., "3")
- holesDimension: Extract actual OCR values like "11.99 mm, 11.97 mm, 11.99 mm" (Acceptance: 12mm±0.5mm)

Sr.35 Auto Busbar Flatten - Visual Inspection (5 pieces):
- flattenVisual1, flattenVisual2, flattenVisual3, flattenVisual4, flattenVisual5: Results only "OK" (no numerical values)

Sr.36 Pre lamination EL - EL & Visual inspection (BARCODE MANDATORY):
- preLamELBarcode1: First 19-digit barcode (e.g., "GS04755T212392547924")
- preLamELBarcode2: Second barcode
- preLamELBarcode3: Third barcode
- preLamELResult1, preLamELResult2, preLamELResult3: Results ("OK")

Sr.37 String Rework Station - Cleaning & sponge status:
- stringReworkCleaning: Cleaning status ("OK", "Clean")

Sr.38 String Rework Station - Soldering Iron Temp:
- stringReworkSolderingTemp: Temperature (e.g., "400°C")
- stringReworkSolderingTime: Time if available

Sr.39 Module Rework Station - Method of Rework:
- moduleReworkMethod: Method description or "OK"

Sr.40 Module Rework Station - Cleaning of station:
- moduleReworkCleaning: Cleaning status ("OK")

Sr.41 Module Rework Station - Soldering Iron Temp:
- moduleReworkSolderingTemp: Temperature (e.g., "400°C")`,

    4: `
Page 4 Fields to Extract (IPQC Check Sheet - Sr.No 42-49):
This page covers Laminator, Tape Removing, Edge Trimming, 90° Visual.

Sr.42 Laminator - Monitoring Parameters:
- laminatorMonitoring: Parameter status ("OK" or specific values)

Sr.43 Laminator - Cleaning of Diaphragm:
- diaphragmCleaning: Cleaning status - extract exactly as written (e.g., "Clean", "OK")

Sr.44 Laminator - Peel of Test (EVA to Glass/Backsheet ≥60 N/cm):
- peelTestRef: Reference "EVA/Backsheet spec" or actual value

Sr.45 Laminator - Gel Content Test (Fixed range 75%-95%):
- gelContentRef: Always "Refer Document GSPL/IPQC/QC/001" (fixed range, no OCR value)

Sr.46 Auto Tape Removing - Visual Check (5 pieces):
- tapeRemovingVisual1, tapeRemovingVisual2, tapeRemovingVisual3: Results ("OK")
- tapeRemovingVisual4, tapeRemovingVisual5: Results

Sr.47 Auto Edge Trimming - Trimming Quality (5 pieces with S.No):
- trimmingSNo1, trimmingSNo2, trimmingSNo3, trimmingSNo4, trimmingSNo5: Serial numbers
- trimmingResult1, trimmingResult2, trimmingResult3, trimmingResult4, trimmingResult5: Results

Sr.48 Auto Edge Trimming - Trimming Blade condition:
- bladeCondition: Always "OK" (worn-out not allowed, life 20 days)

Sr.49 90° Visual - Visual Inspection (5 pieces with S.No):
- visualSNo1, visualSNo2, visualSNo3, visualSNo4, visualSNo5: Serial numbers
- visualResult1, visualResult2, visualResult3, visualResult4, visualResult5: Results ("OK")`,

    5: `
Page 5 Fields to Extract (IPQC Check Sheet - Sr.No 50-65):
This page covers Framing, Junction Box, JB Potting, OLE, Curing.

Sr.50 Framing - Glue uniformity (Back Sealing):
- glueUniformity: Always "OK" (criteria: Uniform)

Sr.51 Framing - Short Side Glue (Reference):
- shortSideGlueRef: Reference document (always "Refer Document GSPL/IPQC/QC/011")

Sr.52 Framing - Long Side Glue (Reference):
- longSideGlueRef: Reference document (always "Refer Document GSPL/IPQC/QC/011")

Sr.53 Framing - Anodizing Thickness (≥15 micron):
- anodizingThickness: OCR value with unit (e.g., "18.8 µm", "19.06 µm", "18.2 Micron")

Sr.54 Junction Box - Junction Box Check:
- jbCheck: JB check status ("OK")
- jbCableLength: Cable length if mentioned

Sr.55 Junction Box - Silicon Glue Weight (21±6 gm):
- siliconGlueWeight: OCR value with gm unit (e.g., "16.914 gm", "22 gm")

Sr.56 Auto JB - Max Welding time:
- maxWeldingTime: Time value (e.g., "2.5s")

Sr.57 Auto JB - Soldering current:
- solderingCurrent: Current value (e.g., "1.8A")

Sr.58 Auto JB - Soldering Quality:
- jbSolderingQuality: Quality check ("OK")

Sr.59 JB Potting - A/B Glue Ratio (Reference):
- glueRatioRef: Reference number

Sr.60 JB Potting - Potting weight:
- pottingWeight: Weight (e.g., "21±6 gm")

Sr.61 JB Potting - Nozzle Changing time:
- nozzleChangeTime1: First time
- nozzleChangeTime2: Second time (if available)

Sr.62 OLE Potting Inspection - Visual Check:
- oleVisualCheck1, oleVisualCheck2, oleVisualCheck3: Results ("OK")

Sr.63 Curing - Temperature:
- curingTemperature: Temperature (e.g., "25°C")

Sr.64 Curing - Humidity:
- curingHumidity: Humidity (e.g., "≥50%", "55%")

Sr.65 Curing - Curing Time:
- curingTime: Time (e.g., "≥4 hours", "4.5h")`,

    6: `
Page 6 Fields to Extract (IPQC Check Sheet - Sr.No 66-75):
This page covers Buffing, Cleaning, Flash Tester, Hipot Test, Post EL.

Sr.66 Buffing - Corner Edge/Belt condition (5 pieces):
- buffingCondition: 5 times "OK" (criteria: Not sharp & No worn)

Sr.67 Cleaning - Module free from residue (5 pieces with 19-digit S.No):
- cleaningSNo1, cleaningSNo2, cleaningSNo3, cleaningSNo4, cleaningSNo5: 19-digit serial numbers (e.g., "GS04755T212392547924")
- cleaningResult1, cleaningResult2, cleaningResult3, cleaningResult4, cleaningResult5: Results ("OK")

Sr.68 Flash Tester - Ambient Temp:
- ambientTemp: Temperature (e.g., "25°C")

Sr.69 Flash Tester - Module Temp:
- moduleTemp: Temperature (e.g., "25°C")

Sr.70 Flash Tester - Sunsimulator Calibration:
- sunsimulatorCalibration: "OK"
- sunsimulatorBarcode: Calibrated module barcode (19-digit, e.g., "GS04755T212392547924")

Sr.71 Flash Tester - Validation:
- validation: Validation status ("OK")

Sr.72 Flash Tester - Silver Ref EL:
- silverRefEL: Reference status ("OK", "Same as original")

Sr.73 Hipot Test - DCW/IR/Ground (5 samples, DCW≤50µA, IR>40MΩ):
- hipotSNo1, hipotSNo2, hipotSNo3, hipotSNo4, hipotSNo5: 19-digit serial numbers
- dcw1, dcw2, dcw3, dcw4, dcw5: DCW values (e.g., "2.0", "0.8")
- ir1, ir2, ir3, ir4, ir5: IR values (may need manual input)

Sr.74 Post EL - Voltage & Current:
- voltage: Voltage value
- current: Current value

Sr.75 Post EL - EL & Visual (5 pieces with S.No):
- elSNo1, elSNo2, elSNo3, elSNo4, elSNo5: Serial numbers
- elResult1, elResult2, elResult3, elResult4, elResult5: Results ("OK")`,

    7: `
Page 7 Fields to Extract (IPQC Check Sheet - Sr.No 76-88):
This page covers RFID, Final Visual, Dimension, Packaging.

Sr.76 RFID - RFID Position:
- rfidPosition: Position check ("OK")

Sr.77 RFID - Cell & Module Make verification:
- cellModuleMake: Module as per BOM
- cellMakeDate: Cell manufacturing date (mandatory, e.g., "Jan 2024", "12/2023")

Sr.78 Final Visual - Visual Inspection (5 pieces with S.No):
- finalVisualSNo1, finalVisualSNo2, finalVisualSNo3, finalVisualSNo4, finalVisualSNo5: Serial numbers
- finalVisualResult1, finalVisualResult2, finalVisualResult3, finalVisualResult4, finalVisualResult5: Results

Sr.79 Final Visual - Backlabel (5 pieces):
- backlabelSNo1, backlabelSNo2, backlabelSNo3, backlabelSNo4, backlabelSNo5: Serial numbers
- backlabelResult1, backlabelResult2, backlabelResult3, backlabelResult4, backlabelResult5: Results

Sr.80 Dimension - L*W & Profile:
- moduleDimensionLW: Length × Width (e.g., "2278×1134mm")

Sr.81 Dimension - Mounting Hole:
- mountingHole: Hole measurement or "OK"

Sr.82 Dimension - Diagonal Diff:
- diagonalDiff: Difference value (e.g., "≤3mm", "2mm")

Sr.83 Dimension - Corner Gap:
- cornerGap: Gap measurement or "OK"

Sr.84 Dimension - JB Cable length:
- jbCableLength: Cable length measurement

Sr.85 Packaging - Packaging Label:
- packagingLabel: Label status ("OK")

Sr.86 Packaging - Content in Box:
- contentInBox: Content check ("OK")

Sr.87 Packaging - Box Condition:
- boxCondition: Condition ("OK", "Good")

Sr.88 Packaging - Pallet dimension:
- palletDimension: Dimension or "OK"`
  };

  return pageFields[pageNumber] || pageFields[1];
}

/**
 * Simple free alternative: Use keyword matching with context
 * This doesn't need any API key
 */
export function parseWithKeywordMatching(ocrText, pageNumber) {
  console.log(`🔍 Regex Fallback Parser: Processing Page ${pageNumber}...`);
  
  let data = {};
  switch (pageNumber) {
    case 1:
      data = parsePage1(ocrText);
      break;
    case 2:
      data = parsePage2(ocrText);
      break;
    case 3:
      data = parsePage3(ocrText);
      break;
    case 4:
      data = parsePage4(ocrText);
      break;
    case 5:
      data = parsePage5(ocrText);
      break;
    case 6:
      data = parsePage6(ocrText);
      break;
    case 7:
      data = parsePage7(ocrText);
      break;
    default:
      console.log(`⚠️ No specific parser for page ${pageNumber}.`);
      data = {};
  }
  
  console.log(`✅ Regex Fallback found ${Object.keys(data).length} fields`);
  return data;
}

export default { parseWithLLM, parseWithKeywordMatching };
