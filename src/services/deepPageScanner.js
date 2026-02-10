/**
 * Deep Page Scanner v3.0 - Complete IPQC Field Extraction
 * Extracts ALL 88 checkpoints with EXACT field names for applyMappedDataToForm()
 * Split into 2 API calls for accuracy, regex fallback when API unavailable
 */

const GROQ_API_KEY = process.env.REACT_APP_GROQ_API_KEY || '';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

let pageOCRData = {};

export function storePageOCR(pageNum, ocrText) {
  pageOCRData[pageNum] = ocrText;
}

export function clearAllOCR() {
  pageOCRData = {};
}

const delay = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Deep scan all pages using AI with EXACT field name mapping
 */
export async function deepScanAllPages(ocrTexts, progressCallback = () => {}) {
  if (!GROQ_API_KEY) {
    console.error('GROQ_API_KEY not found, using regex fallback');
    return extractAllFieldsWithRegex(Object.values(ocrTexts).join('\n\n'));
  }

  try {
    progressCallback('Starting AI field extraction...');
    const pages = Object.entries(ocrTexts);
    if (!pages.length) return {};
    const mid = Math.ceil(pages.length / 2);
    const firstHalf = pages.slice(0, mid).map(([, t]) => t).join('\n\n--- PAGE BREAK ---\n\n');
    const secondHalf = pages.slice(mid).map(([, t]) => t).join('\n\n--- PAGE BREAK ---\n\n');

    progressCallback('Processing pages 1-' + mid + '...');
    const result1 = await callGroqAPI(firstHalf, 'first');

    await delay(2500);

    progressCallback('Processing pages ' + (mid + 1) + '-' + pages.length + '...');
    const result2 = await callGroqAPI(secondHalf, 'second');

    const merged = { ...result1, ...result2 };
    normalizeSerials(merged);
    progressCallback('Field extraction complete');
    console.log('Deep Scanner v3: extracted', Object.keys(merged).length, 'fields');
    return merged;
  } catch (error) {
    console.error('Deep scan error:', error);
    progressCallback('AI failed, using regex fallback...');
    return extractAllFieldsWithRegex(Object.values(ocrTexts).join('\n\n'));
  }
}

async function callGroqAPI(text, half) {
  const prompt = half === 'first' ? getPromptFirstHalf(text) : getPromptSecondHalf(text);
  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4000,
      temperature: 0.05
    })
  });
  if (!response.ok) throw new Error(`Groq API error: ${response.status}`);
  const data = await response.json();
  const aiText = data.choices?.[0]?.message?.content || '{}';
  try {
    const jsonMatch = aiText.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (e) { console.error('JSON parse error:', e); }
  return {};
}

function getPromptFirstHalf(text) {
  return `You are an IPQC form data extractor. Extract values from OCR text. Return ONLY a JSON object.
Use these EXACT field names (skip missing ones):

HEADER: "date","time","shift","poNo","operator","docNo"

STAGE 1 Shop Floor:
"temperature" (value like "24℃"), "temperatureTime"
"humidity" (like "54%"), "humidityTime"

STAGE 2 Glass Loader:
"frontGlassDimension" (like "2376X1128×2.0mm")
"appearance" (like "OK")

STAGE 3 EVA/EPE:
"eva1Type" (like "EP304","EVA")
"eva1Dimension" (like "2378×1125×0.71")
"evaManufacturingDate" (mfg date)
"evaStatus" (dust/particle status)

STAGE 4 Soldering at Edge:
"evaSolderingTemp" (like "395℃")
"evaSolderingQuality"

STAGE 5 Cell Loading:
"cellManufacturer" (like "Aiko")
"cellEfficiency" (like "25.40")
"cellSize" (like "105.7×182.34mm")
"cellCondition" (like "OK")
"cleanliness" (cell loading area, like "Clean")

STAGE 6 Tabber & Stringer (TS01A-TS04B values):
"crossCutting" (like "Equal")
Visual Check: "visualCheckTS01A","visualCheckTS01B","visualCheckTS02A","visualCheckTS02B","visualCheckTS03A","visualCheckTS03B","visualCheckTS04A","visualCheckTS04B"
EL Image: "elImageTS01A","elImageTS01B","elImageTS02A","elImageTS02B","elImageTS03A","elImageTS03B","elImageTS04A","elImageTS04B"
String Length: "stringLengthTS01A","stringLengthTS01B","stringLengthTS02A","stringLengthTS02B","stringLengthTS03A","stringLengthTS03B","stringLengthTS04A","stringLengthTS04B"
Cell Gap: "cellGapTS01A","cellGapTS01B","cellGapTS02A","cellGapTS02B","cellGapTS03A","cellGapTS03B","cellGapTS04A","cellGapTS04B"

STAGE 7 Auto Bussing:
"stringToStringGap" (like "1.5mm")
"cellEdgeTop","cellEdgeBottom","cellEdgeSides" (distances in mm)
"busbarPeelStrength" (like "2.2N")
"terminalBusbar" (like "3.02mm")
"solderingQuality1","solderingQuality2","solderingQuality3"
"creepageTop","creepageTop2","creepageTop3" (T-values)
"creepageBottom","creepageBottom2","creepageBottom3" (B-values)
"autoTaping1","autoTaping2","autoTaping3"
"processVerificationAuto"

STAGE 8 RFID:
"positionVerification1","positionVerification2","positionVerification3"

OCR TEXT:
${text}

Return ONLY valid JSON:`;
}

function getPromptSecondHalf(text) {
  return `You are an IPQC form data extractor. Extract values from OCR text. Return ONLY a JSON object.
Use these EXACT field names (skip missing ones):

STAGE 9 EVA 2nd: "eva2Type","eva2Dimension","eva2Status"

STAGE 10 Back Glass:
"backGlassDimension" (like "2376X1128×2.0mm")
"numberOfHoles","holesDimension1","holesDimension2","holesDimension3"

STAGE 11 Flatten: "visualInspection1"-"visualInspection5" (each OK)

STAGE 12 Pre-EL (serial numbers 19-digit like GS04890KG0092676054):
"elBarcode1"-"elBarcode5" (serial numbers)

STAGE 13 String Rework:
"cleaningStatus" (like "Clean and wet")
"solderingIronTemp" (like "420℃"), "solderingIronTime"

STAGE 14 Module Rework:
"methodOfRework" (like "Manual")
"reworkCleaningStatus","reworkSolderingTemp","reworkSolderingTime"

STAGE 15 Laminator:
"laminatorMonitoring","diaphragmCleaning"

STAGE 17 Trimming:
"trimmingSNo1"-"trimmingSNo5" (serial numbers)
"bladeLifeCycle","bladeCondition"

STAGE 18 90° Visual:
"visualSNo1"-"visualSNo5" (serial numbers)

STAGE 19 Framing:
"glueUniformity" (like "Uniform & Continue")
"shortSideGlueRef","longSideGlueRef"
"anodizingThickness" (like "215 micron")

STAGE 20 Junction Box:
"jbAppearance","jbCableLength" (like "300mm")
"siliconGlueWeight" (like "19.02 gm")

STAGE 21 Auto JB:
"maxWeldingTime","solderingCurrent","jbSolderingQuality"

STAGE 22 Potting:
"pottingWeight","nozzleChangeTime1","nozzleChangeTime2"

STAGE 23 OLE: "oleVisualCheck1"-"oleVisualCheck5"

STAGE 24 Curing:
"curingTemperature","curingHumidity","curingTime"

STAGE 25 Buffing: "buffingCheck1"-"buffingCheck5"

STAGE 26 Cleaning:
"cleaningSNo1"-"cleaningSNo5" (serial numbers)

STAGE 27 Flash:
"ambientTemp","moduleTemp","sunsimulatorCalibration","validation"

STAGE 28 Hipot:
"hipotSNo1"-"hipotSNo5" (serial numbers)
"dcw1"-"dcw5","ir1"-"ir5","gc1"-"gc5"
"voltage","current"

STAGE 29 Post EL:
"postElSNo1"-"postElSNo5" (serial numbers)

STAGE 30 RFID:
"rfidPosition","cellMakeMonth"

STAGE 31 Final Visual:
"finalVisualSNo1"-"finalVisualSNo5"
"backlabelSNo1"-"backlabelSNo5"

STAGE 32 Dimension:
"moduleProfile" (like "(2382X1134X30)mm")
"mountingHoleXPitch","mountingHoleYPitch"
"diagonalDifference","cornerGap"

STAGE 33 Packaging:
"packagingLabel","contentInBox","boxCondition" (each OK)
"palletDimension"

SERIAL FIX: GSO→GS0, GTSO→GTS0, LISO→LIS0, remove spaces in serials.

OCR TEXT:
${text}

Return ONLY valid JSON:`;
}

function normalizeSerials(data) {
  Object.keys(data).forEach(key => {
    if ((key.includes('SNo') || key.includes('Barcode') || key.includes('hipotSNo') || key.includes('Serial') || key.includes('serialNo')) && typeof data[key] === 'string') {
      data[key] = normalizeSerial(data[key]);
    }
  });
}

function normalizeSerial(s) {
  if (!s || typeof s !== 'string') return s;
  let c = s.replace(/\s+/g, '');
  c = c.replace(/^G5O/i, 'GS0').replace(/^GSO/i, 'GS0').replace(/^GTSO/i, 'GTS0');
  c = c.replace(/^LISO/i, 'LIS0').replace(/^LYSO/i, 'LYS0').replace(/^WYSO/i, 'WYS0');
  c = c.replace(/^CASO/i, 'CAS0').replace(/^USO/i, 'US0').replace(/^CHO/i, 'CH0');
  return c;
}

function extractAllFieldsWithRegex(text) {
  const m = {};
  const dateMatch = text.match(/Date[\s:.\\-]+(\d{1,2}[\-\/]\d{1,2}[\-\/]\d{2,4})/i);
  if (dateMatch) m.date = dateMatch[1];
  const timeMatch = text.match(/Time[\s:.\\-]+(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)/i);
  if (timeMatch) m.time = timeMatch[1];
  const shiftMatch = text.match(/Shift[\s:.\\-]*(Night|Day|Morning|Evening|A|B|C)/i);
  if (shiftMatch) m.shift = shiftMatch[1];
  const tempMatch = text.match(/(\d+[\.\d]*)\s*℃/);
  if (tempMatch) m.temperature = tempMatch[1] + '℃';
  const humMatch = text.match(/(\d+[\.\d]*)\s*%/);
  if (humMatch) m.humidity = humMatch[1] + '%';
  const glassMatch = text.match(/(\d{4})\s*[Xx×]\s*(\d{3,4})\s*[Xx×]\s*([\d.]+)\s*mm/);
  if (glassMatch) m.frontGlassDimension = `${glassMatch[1]}X${glassMatch[2]}×${glassMatch[3]}mm`;
  const evaMatch = text.match(/EVA\/EPE\s*Type[\s\S]*?(EP\d+|EVA|EPE|POE)/i);
  if (evaMatch) m.eva1Type = evaMatch[1];
  const profMatch = text.match(/\((\d{4})\s*[Xx×]\s*(\d{3,4})\s*[Xx×]\s*(\d+)\)\s*mm/);
  if (profMatch) m.moduleProfile = `(${profMatch[1]}X${profMatch[2]}X${profMatch[3]})mm`;
  if (/Packaging\s*Label[\s\S]*?OK/i.test(text)) m.packagingLabel = 'OK';
  if (/Content\s*[iI]n\s*Box[\s\S]*?OK/i.test(text)) m.contentInBox = 'OK';
  if (/Box\s*Condition[\s\S]*?OK/i.test(text)) m.boxCondition = 'OK';
  return m;
}

export default { deepScanAllPages, storePageOCR, clearAllOCR };
