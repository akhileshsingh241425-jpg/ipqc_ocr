/**
 * Deep Page Scanner v4.0 - Bulletproof IPQC Field Extraction
 * Features:
 *  1) AI prompt with exact field names
 *  2) DETERMINISTIC field name normalizer (200+ aliases → correct names)
 *  3) Split into 2 API calls for accuracy
 *  4) Regex fallback when API is unavailable
 *  5) Serial number normalization
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

// ======================================================================
// FIELD NAME NORMALIZER - Maps ANY AI-generated name to the EXACT name
// that applyMappedDataToForm() expects. This is deterministic.
// ======================================================================
const FIELD_ALIASES = {
  // --- HEADER ---
  'date': 'date', 'inspectionDate': 'date', 'formDate': 'date',
  'time': 'time', 'inspectionTime': 'time', 'formTime': 'time',
  'shift': 'shift', 'shiftType': 'shift',
  'poNo': 'poNo', 'poNumber': 'poNo', 'po': 'poNo', 'purchaseOrder': 'poNo', 'batchNo': 'batchNo',
  'operator': 'operator', 'checkedBy': 'operator', 'inspector': 'operator',
  'docNo': 'docNo', 'documentNo': 'docNo', 'documentNumber': 'docNo',
  'lotNumber': 'lotNumber', 'lotNo': 'lotNumber',

  // --- STAGE 1: Shop Floor ---
  'temperature': 'temperature', 'temp': 'temperature', 'shopFloorTemp': 'temperature', 'shopFloorTemperature': 'temperature', 'roomTemperature': 'temperature', 'roomTemp': 'temperature', 'ambientTemperature': 'temperature',
  'temperatureTime': 'temperatureTime', 'tempTime': 'temperatureTime',
  'humidity': 'humidity', 'shopFloorHumidity': 'humidity', 'roomHumidity': 'humidity', 'rh': 'humidity', 'relativeHumidity': 'humidity',
  'humidityTime': 'humidityTime',

  // --- STAGE 2: Glass Loader ---
  'frontGlassDimension': 'frontGlassDimension', 'glassDimension': 'frontGlassDimension', 'glassDim': 'frontGlassDimension', 'glassSize': 'frontGlassDimension', 'frontGlass': 'frontGlassDimension', 'frontGlassSize': 'frontGlassDimension', 'glassCuttingDimension': 'frontGlassDimension', 'frontGlassCuttingDimension': 'frontGlassDimension',
  'appearance': 'appearance', 'glassAppearance': 'appearance', 'visualAppearance': 'appearance',

  // --- STAGE 3: EVA/EPE Cutting ---
  'eva1Type': 'eva1Type', 'evaType': 'eva1Type', 'evaEpeType': 'eva1Type', 'evaCuttingType': 'eva1Type', 'evaEPEType': 'eva1Type', 'eva_type': 'eva1Type', 'evaepetype': 'eva1Type',
  'eva1Dimension': 'eva1Dimension', 'evaDimension': 'eva1Dimension', 'evaEpeDimension': 'eva1Dimension', 'evaEpeCuttingDimension': 'eva1Dimension', 'evaCuttingDimension': 'eva1Dimension', 'evaSize': 'eva1Dimension', 'evaEPEDimension': 'eva1Dimension', 'eva_dimension': 'eva1Dimension',
  'evaManufacturingDate': 'evaManufacturingDate', 'evaMfgDate': 'evaManufacturingDate', 'evaDate': 'evaManufacturingDate', 'evaManufactureDate': 'evaManufacturingDate',
  'evaStatus': 'evaStatus', 'evaEpeStatus': 'evaStatus', 'evaCondition': 'evaStatus', 'evaEPEStatus': 'evaStatus', 'dustParticle': 'evaStatus', 'dustParticleStatus': 'evaStatus',
  'evaLotNo': 'evaLotNo', 'evaLot': 'evaLotNo',

  // --- STAGE 4: Soldering at Edge ---
  'evaSolderingTemp': 'evaSolderingTemp', 'solderingTemperature': 'evaSolderingTemp', 'solderingTemp': 'evaSolderingTemp', 'edgeSolderingTemp': 'evaSolderingTemp', 'solderTemp': 'evaSolderingTemp', 'solderingAtEdgeTemp': 'evaSolderingTemp',
  'evaSolderingQuality': 'evaSolderingQuality', 'solderingQualityAtEdge': 'evaSolderingQuality', 'edgeSolderingQuality': 'evaSolderingQuality',

  // --- STAGE 5: Cell Loading ---
  'cellManufacturer': 'cellManufacturer', 'cellMake': 'cellManufacturer', 'cellMaker': 'cellManufacturer', 'cellManufacturerEfficiency': 'cellManufacturer', 'cellBrand': 'cellManufacturer', 'cellMfg': 'cellManufacturer',
  'cellEfficiency': 'cellEfficiency', 'efficiency': 'cellEfficiency', 'cellEff': 'cellEfficiency',
  'cellSize': 'cellSize', 'cellDimension': 'cellSize',
  'cellCondition': 'cellCondition', 'cellStatus': 'cellCondition',
  'cleanliness': 'cleanliness', 'cellLoadingArea': 'cleanliness', 'cleanlinessStatus': 'cleanliness', 'cellAreaCleanliness': 'cleanliness', 'loadingAreaClean': 'cleanliness', 'cellLoadingAreaClean': 'cleanliness',
  'cellLotNo': 'cellLotNo', 'cellLot': 'cellLotNo',

  // --- STAGE 6: Tabber & Stringer ---
  'crossCutting': 'crossCutting', 'crossCut': 'crossCutting',
  'visualCheckTS01A': 'visualCheckTS01A', 'visualTS01A': 'visualCheckTS01A', 'vcTS01A': 'visualCheckTS01A',
  'visualCheckTS01B': 'visualCheckTS01B', 'visualTS01B': 'visualCheckTS01B', 'vcTS01B': 'visualCheckTS01B',
  'visualCheckTS02A': 'visualCheckTS02A', 'visualTS02A': 'visualCheckTS02A', 'vcTS02A': 'visualCheckTS02A',
  'visualCheckTS02B': 'visualCheckTS02B', 'visualTS02B': 'visualCheckTS02B', 'vcTS02B': 'visualCheckTS02B',
  'visualCheckTS03A': 'visualCheckTS03A', 'visualTS03A': 'visualCheckTS03A', 'vcTS03A': 'visualCheckTS03A',
  'visualCheckTS03B': 'visualCheckTS03B', 'visualTS03B': 'visualCheckTS03B', 'vcTS03B': 'visualCheckTS03B',
  'visualCheckTS04A': 'visualCheckTS04A', 'visualTS04A': 'visualCheckTS04A', 'vcTS04A': 'visualCheckTS04A',
  'visualCheckTS04B': 'visualCheckTS04B', 'visualTS04B': 'visualCheckTS04B', 'vcTS04B': 'visualCheckTS04B',
  'elImageTS01A': 'elImageTS01A', 'elTS01A': 'elImageTS01A',
  'elImageTS01B': 'elImageTS01B', 'elTS01B': 'elImageTS01B',
  'elImageTS02A': 'elImageTS02A', 'elTS02A': 'elImageTS02A',
  'elImageTS02B': 'elImageTS02B', 'elTS02B': 'elImageTS02B',
  'elImageTS03A': 'elImageTS03A', 'elTS03A': 'elImageTS03A',
  'elImageTS03B': 'elImageTS03B', 'elTS03B': 'elImageTS03B',
  'elImageTS04A': 'elImageTS04A', 'elTS04A': 'elImageTS04A',
  'elImageTS04B': 'elImageTS04B', 'elTS04B': 'elImageTS04B',
  'stringLengthTS01A': 'stringLengthTS01A', 'strLenTS01A': 'stringLengthTS01A', 'stringTS01A': 'stringLengthTS01A',
  'stringLengthTS01B': 'stringLengthTS01B', 'strLenTS01B': 'stringLengthTS01B', 'stringTS01B': 'stringLengthTS01B',
  'stringLengthTS02A': 'stringLengthTS02A', 'strLenTS02A': 'stringLengthTS02A', 'stringTS02A': 'stringLengthTS02A',
  'stringLengthTS02B': 'stringLengthTS02B', 'strLenTS02B': 'stringLengthTS02B', 'stringTS02B': 'stringLengthTS02B',
  'stringLengthTS03A': 'stringLengthTS03A', 'strLenTS03A': 'stringLengthTS03A', 'stringTS03A': 'stringLengthTS03A',
  'stringLengthTS03B': 'stringLengthTS03B', 'strLenTS03B': 'stringLengthTS03B', 'stringTS03B': 'stringLengthTS03B',
  'stringLengthTS04A': 'stringLengthTS04A', 'strLenTS04A': 'stringLengthTS04A', 'stringTS04A': 'stringLengthTS04A',
  'stringLengthTS04B': 'stringLengthTS04B', 'strLenTS04B': 'stringLengthTS04B', 'stringTS04B': 'stringLengthTS04B',
  'cellGapTS01A': 'cellGapTS01A', 'gapTS01A': 'cellGapTS01A',
  'cellGapTS01B': 'cellGapTS01B', 'gapTS01B': 'cellGapTS01B',
  'cellGapTS02A': 'cellGapTS02A', 'gapTS02A': 'cellGapTS02A',
  'cellGapTS02B': 'cellGapTS02B', 'gapTS02B': 'cellGapTS02B',
  'cellGapTS03A': 'cellGapTS03A', 'gapTS03A': 'cellGapTS03A',
  'cellGapTS03B': 'cellGapTS03B', 'gapTS03B': 'cellGapTS03B',
  'cellGapTS04A': 'cellGapTS04A', 'gapTS04A': 'cellGapTS04A',
  'cellGapTS04B': 'cellGapTS04B', 'gapTS04B': 'cellGapTS04B',
  'tabberPeelStrength': 'tabberPeelStrength', 'peelStrengthTabber': 'tabberPeelStrength',
  'stringLength': 'stringLengthTS01A', 'cellToCellGap': 'cellGapTS01A',

  // --- STAGE 7: Auto Bussing ---
  'stringToStringGap': 'stringToStringGap', 'stringTostringGap': 'stringToStringGap', 'stringGap': 'stringToStringGap', 's2sGap': 'stringToStringGap', 'string2StringGap': 'stringToStringGap',
  'cellEdgeTop': 'cellEdgeTop', 'cellEdgeToGlassEdgeTop': 'cellEdgeTop', 'topEdge': 'cellEdgeTop',
  'cellEdgeBottom': 'cellEdgeBottom', 'cellEdgeToGlassEdgeBottom': 'cellEdgeBottom', 'bottomEdge': 'cellEdgeBottom',
  'cellEdgeSides': 'cellEdgeSides', 'cellEdgeToGlassEdgeSides': 'cellEdgeSides', 'sideEdge': 'cellEdgeSides', 'cellEdgeToGlassEdge': 'cellEdgeSides',
  'cellEdgeLeft': 'cellEdgeLeft', 'leftEdge': 'cellEdgeLeft',
  'cellEdgeRight': 'cellEdgeRight', 'rightEdge': 'cellEdgeRight',
  'busbarPeelStrength': 'busbarPeelStrength', 'ribbonToBusbar': 'busbarPeelStrength', 'peelStrength': 'busbarPeelStrength', 'peelStrengthBusbar': 'busbarPeelStrength', 'solderingPeelStrength': 'busbarPeelStrength',
  'terminalBusbar': 'terminalBusbar', 'terminalBusbarToEdge': 'terminalBusbar', 'terminalBusbarEdge': 'terminalBusbar',
  'solderingQuality1': 'solderingQuality1', 'solderQuality1': 'solderingQuality1',
  'solderingQuality2': 'solderingQuality2', 'solderQuality2': 'solderingQuality2',
  'solderingQuality3': 'solderingQuality3', 'solderQuality3': 'solderingQuality3',
  'solderingQuality': 'solderingQuality1', 'solderQuality': 'solderingQuality1', 'qualityOfSoldering': 'solderingQuality1',
  'creepageTop': 'creepageTop', 'topCreepage': 'creepageTop', 'topCreepage1': 'creepageTop', 'creepageTop1': 'creepageTop',
  'creepageTop2': 'creepageTop2', 'topCreepage2': 'creepageTop2',
  'creepageTop3': 'creepageTop3', 'topCreepage3': 'creepageTop3',
  'creepageBottom': 'creepageBottom', 'bottomCreepage': 'creepageBottom', 'bottomCreepage1': 'creepageBottom', 'creepageBottom1': 'creepageBottom',
  'creepageBottom2': 'creepageBottom2', 'bottomCreepage2': 'creepageBottom2',
  'creepageBottom3': 'creepageBottom3', 'bottomCreepage3': 'creepageBottom3',
  'topAndBottomCreepage': 'creepageTop', 'creepageDistance': 'creepageTop', 'creepageDistances': 'creepageTop',
  'autoTaping1': 'autoTaping1', 'taping1': 'autoTaping1', 'qualityOfAutoTaping': 'autoTaping1',
  'autoTaping2': 'autoTaping2', 'taping2': 'autoTaping2',
  'autoTaping3': 'autoTaping3', 'taping3': 'autoTaping3',
  'processVerificationAuto': 'processVerificationAuto', 'autoProcessVerification': 'processVerificationAuto', 'autoBussingSpecification': 'processVerificationAuto',

  // --- STAGE 8: RFID ---
  'positionVerification1': 'positionVerification1', 'rfidPosition1': 'positionVerification1',
  'positionVerification2': 'positionVerification2', 'rfidPosition2': 'positionVerification2',
  'positionVerification3': 'positionVerification3', 'rfidPosition3': 'positionVerification3',

  // --- STAGE 9: EVA 2nd ---
  'eva2Type': 'eva2Type', 'eva2ndType': 'eva2Type', 'evaEpeTypeDerShift': 'eva2Type', 'evaType2': 'eva2Type', 'eva2EPEType': 'eva2Type', 'secondEvaType': 'eva2Type',
  'eva2Dimension': 'eva2Dimension', 'eva2ndDimension': 'eva2Dimension', 'evaEpeDimensionDerShift': 'eva2Dimension', 'evaDimension2': 'eva2Dimension', 'eva2EPEDimension': 'eva2Dimension', 'evaEpeDimension': 'eva2Dimension', 'secondEvaDimension': 'eva2Dimension',
  'eva2Status': 'eva2Status', 'eva2ndStatus': 'eva2Status', 'evaEpeStatusDerShift': 'eva2Status', 'evaStatus2': 'eva2Status', 'eva2EPEStatus': 'eva2Status', 'secondEvaStatus': 'eva2Status',

  // --- STAGE 10: Back Glass ---
  'backGlassDimension': 'backGlassDimension', 'backGlass': 'backGlassDimension', 'backGlassSize': 'backGlassDimension', 'rearGlass': 'backGlassDimension', 'backSheetDimension': 'backGlassDimension',
  'numberOfHoles': 'numberOfHoles', 'holes': 'numberOfHoles', 'noOfHoles': 'numberOfHoles', 'holeCount': 'numberOfHoles',
  'holesDimension1': 'holesDimension1', 'holeDim1': 'holesDimension1',
  'holesDimension2': 'holesDimension2', 'holeDim2': 'holesDimension2',
  'holesDimension3': 'holesDimension3', 'holeDim3': 'holesDimension3',

  // --- STAGE 11: Flatten ---
  'visualInspection1': 'visualInspection1', 'flattenVisual1': 'visualInspection1', 'vi1': 'visualInspection1',
  'visualInspection2': 'visualInspection2', 'flattenVisual2': 'visualInspection2', 'vi2': 'visualInspection2',
  'visualInspection3': 'visualInspection3', 'flattenVisual3': 'visualInspection3', 'vi3': 'visualInspection3',
  'visualInspection4': 'visualInspection4', 'flattenVisual4': 'visualInspection4', 'vi4': 'visualInspection4',
  'visualInspection5': 'visualInspection5', 'flattenVisual5': 'visualInspection5', 'vi5': 'visualInspection5',

  // --- STAGE 12: Pre-EL ---
  'elBarcode1': 'elBarcode1', 'preElBarcode1': 'elBarcode1', 'elSNo1': 'elBarcode1', 'preElSNo1': 'elBarcode1',
  'elBarcode2': 'elBarcode2', 'preElBarcode2': 'elBarcode2', 'elSNo2': 'elBarcode2', 'preElSNo2': 'elBarcode2',
  'elBarcode3': 'elBarcode3', 'preElBarcode3': 'elBarcode3', 'elSNo3': 'elBarcode3', 'preElSNo3': 'elBarcode3',
  'elBarcode4': 'elBarcode4', 'preElBarcode4': 'elBarcode4', 'elSNo4': 'elBarcode4', 'preElSNo4': 'elBarcode4',
  'elBarcode5': 'elBarcode5', 'preElBarcode5': 'elBarcode5', 'elSNo5': 'elBarcode5', 'preElSNo5': 'elBarcode5',
  'elResult1': 'elResult1', 'preElResult1': 'elResult1',
  'elResult2': 'elResult2', 'preElResult2': 'elResult2',
  'elResult3': 'elResult3', 'preElResult3': 'elResult3',
  'elResult4': 'elResult4', 'preElResult4': 'elResult4',
  'elResult5': 'elResult5', 'preElResult5': 'elResult5',

  // --- STAGE 13: String Rework ---
  'cleaningStatus': 'cleaningStatus', 'stringReworkCleaning': 'cleaningStatus', 'reworkCleaning': 'cleaningStatus',
  'solderingIronTemp': 'solderingIronTemp', 'ironTemp': 'solderingIronTemp', 'solderingIronTemperature': 'solderingIronTemp', 'reworkSolderingIronTemp': 'solderingIronTemp',
  'solderingIronTime': 'solderingIronTime', 'ironTime': 'solderingIronTime',

  // --- STAGE 14: Module Rework ---
  'methodOfRework': 'methodOfRework', 'reworkMethod': 'methodOfRework', 'moduleReworkMethod': 'methodOfRework',
  'reworkCleaningStatus': 'reworkCleaningStatus', 'moduleReworkCleaning': 'reworkCleaningStatus',
  'reworkSolderingTemp': 'reworkSolderingTemp', 'moduleReworkTemp': 'reworkSolderingTemp',
  'reworkSolderingTime': 'reworkSolderingTime', 'moduleReworkTime': 'reworkSolderingTime',

  // --- STAGE 15: Laminator ---
  'laminatorMonitoring': 'laminatorMonitoring', 'laminationMonitoring': 'laminatorMonitoring', 'laminatorCheck': 'laminatorMonitoring',
  'diaphragmCleaning': 'diaphragmCleaning', 'diaphragmClean': 'diaphragmCleaning',
  'peelTestRef': 'peelTestRef', 'peelStrengthRef': 'peelTestRef',
  'peelStrengthValue': 'peelStrengthValue', 'peelValue': 'peelStrengthValue',
  'gelContentRef': 'gelContentRef',
  'gelContent': 'gelContent', 'gelContentValue': 'gelContent',

  // --- STAGE 17: Trimming ---
  'trimmingSNo1': 'trimmingSNo1', 'trimSNo1': 'trimmingSNo1', 'trimmingSerial1': 'trimmingSNo1',
  'trimmingSNo2': 'trimmingSNo2', 'trimSNo2': 'trimmingSNo2', 'trimmingSerial2': 'trimmingSNo2',
  'trimmingSNo3': 'trimmingSNo3', 'trimSNo3': 'trimmingSNo3', 'trimmingSerial3': 'trimmingSNo3',
  'trimmingSNo4': 'trimmingSNo4', 'trimSNo4': 'trimmingSNo4', 'trimmingSerial4': 'trimmingSNo4',
  'trimmingSNo5': 'trimmingSNo5', 'trimSNo5': 'trimmingSNo5', 'trimmingSerial5': 'trimmingSNo5',
  'bladeLifeCycle': 'bladeLifeCycle', 'bladeLife': 'bladeLifeCycle',
  'bladeCondition': 'bladeCondition', 'bladeCond': 'bladeCondition',

  // --- STAGE 18: 90° Visual ---
  'visualSNo1': 'visualSNo1', 'visual90SNo1': 'visualSNo1', 'visualSerial1': 'visualSNo1',
  'visualSNo2': 'visualSNo2', 'visual90SNo2': 'visualSNo2', 'visualSerial2': 'visualSNo2',
  'visualSNo3': 'visualSNo3', 'visual90SNo3': 'visualSNo3', 'visualSerial3': 'visualSNo3',
  'visualSNo4': 'visualSNo4', 'visual90SNo4': 'visualSNo4', 'visualSerial4': 'visualSNo4',
  'visualSNo5': 'visualSNo5', 'visual90SNo5': 'visualSNo5', 'visualSerial5': 'visualSNo5',
  'visualResult1': 'visualResult1', 'visual90Result1': 'visualResult1',
  'visualResult2': 'visualResult2', 'visual90Result2': 'visualResult2',
  'visualResult3': 'visualResult3', 'visual90Result3': 'visualResult3',
  'visualResult4': 'visualResult4', 'visual90Result4': 'visualResult4',
  'visualResult5': 'visualResult5', 'visual90Result5': 'visualResult5',

  // --- STAGE 19: Framing ---
  'glueUniformity': 'glueUniformity', 'glueUniform': 'glueUniformity', 'framingGlue': 'glueUniformity',
  'shortSideGlueRef': 'shortSideGlueRef', 'shortSideGlue': 'shortSideGlueRef',
  'longSideGlueRef': 'longSideGlueRef', 'longSideGlue': 'longSideGlueRef',
  'anodizingThickness': 'anodizingThickness', 'anodizing': 'anodizingThickness', 'frameAnodizing': 'anodizingThickness',

  // --- STAGE 20: Junction Box ---
  'jbAppearance': 'jbAppearance', 'junctionBoxAppearance': 'jbAppearance', 'jbVisual': 'jbAppearance',
  'jbCableLength': 'jbCableLength', 'cableLength': 'jbCableLength', 'junctionBoxCableLength': 'jbCableLength',
  'siliconGlueWeight': 'siliconGlueWeight', 'siliconeWeight': 'siliconGlueWeight', 'glueWeight': 'siliconGlueWeight', 'sealantWeight': 'siliconGlueWeight',
  'jbModel': 'jbModel', 'junctionBoxModel': 'jbModel',

  // --- STAGE 21: Auto JB Soldering ---
  'maxWeldingTime': 'maxWeldingTime', 'weldingTime': 'maxWeldingTime', 'maxWelding': 'maxWeldingTime',
  'solderingCurrent': 'solderingCurrent', 'jbCurrent': 'solderingCurrent', 'current': 'solderingCurrent',
  'jbSolderingQuality': 'jbSolderingQuality', 'jbSolderQuality': 'jbSolderingQuality', 'junctionBoxSolderingQuality': 'jbSolderingQuality',

  // --- STAGE 22: Potting ---
  'pottingWeight': 'pottingWeight', 'potWeight': 'pottingWeight',
  'nozzleChangeTime1': 'nozzleChangeTime1', 'nozzleChange1': 'nozzleChangeTime1',
  'nozzleChangeTime2': 'nozzleChangeTime2', 'nozzleChange2': 'nozzleChangeTime2',
  'pottingStatus': 'pottingStatus',

  // --- STAGE 23: OLE ---
  'oleVisualCheck1': 'oleVisualCheck1', 'oleCheck1': 'oleVisualCheck1', 'oleVisual1': 'oleVisualCheck1',
  'oleVisualCheck2': 'oleVisualCheck2', 'oleCheck2': 'oleVisualCheck2', 'oleVisual2': 'oleVisualCheck2',
  'oleVisualCheck3': 'oleVisualCheck3', 'oleCheck3': 'oleVisualCheck3', 'oleVisual3': 'oleVisualCheck3',
  'oleVisualCheck4': 'oleVisualCheck4', 'oleCheck4': 'oleVisualCheck4', 'oleVisual4': 'oleVisualCheck4',
  'oleVisualCheck5': 'oleVisualCheck5', 'oleCheck5': 'oleVisualCheck5', 'oleVisual5': 'oleVisualCheck5',

  // --- STAGE 24: Curing ---
  'curingTemperature': 'curingTemperature', 'curingTemp': 'curingTemperature', 'cureTemp': 'curingTemperature',
  'curingHumidity': 'curingHumidity', 'cureHumidity': 'curingHumidity',
  'curingTime': 'curingTime', 'cureTime': 'curingTime',

  // --- STAGE 25: Buffing ---
  'buffingCheck1': 'buffingCheck1', 'buffing1': 'buffingCheck1',
  'buffingCheck2': 'buffingCheck2', 'buffing2': 'buffingCheck2',
  'buffingCheck3': 'buffingCheck3', 'buffing3': 'buffingCheck3',
  'buffingCheck4': 'buffingCheck4', 'buffing4': 'buffingCheck4',
  'buffingCheck5': 'buffingCheck5', 'buffing5': 'buffingCheck5',

  // --- STAGE 26: Cleaning ---
  'cleaningSNo1': 'cleaningSNo1', 'cleanSerial1': 'cleaningSNo1',
  'cleaningSNo2': 'cleaningSNo2', 'cleanSerial2': 'cleaningSNo2',
  'cleaningSNo3': 'cleaningSNo3', 'cleanSerial3': 'cleaningSNo3',
  'cleaningSNo4': 'cleaningSNo4', 'cleanSerial4': 'cleaningSNo4',
  'cleaningSNo5': 'cleaningSNo5', 'cleanSerial5': 'cleaningSNo5',
  'cleaningResult1': 'cleaningResult1', 'cleanResult1': 'cleaningResult1',
  'cleaningResult2': 'cleaningResult2', 'cleanResult2': 'cleaningResult2',
  'cleaningResult3': 'cleaningResult3', 'cleanResult3': 'cleaningResult3',
  'cleaningResult4': 'cleaningResult4', 'cleanResult4': 'cleaningResult4',
  'cleaningResult5': 'cleaningResult5', 'cleanResult5': 'cleaningResult5',

  // --- STAGE 27: Flash Tester ---
  'ambientTemp': 'ambientTemp', 'ambientTemperature': 'ambientTemp', 'flashAmbientTemp': 'ambientTemp',
  'moduleTemp': 'moduleTemp', 'moduleTemperature': 'moduleTemp', 'flashModuleTemp': 'moduleTemp',
  'sunsimulatorCalibration': 'sunsimulatorCalibration', 'sunSimCalibration': 'sunsimulatorCalibration', 'calibration': 'sunsimulatorCalibration',
  'validation': 'validation', 'flashValidation': 'validation',

  // --- STAGE 28: Hipot ---
  'hipotSNo1': 'hipotSNo1', 'hipotSerial1': 'hipotSNo1',
  'hipotSNo2': 'hipotSNo2', 'hipotSerial2': 'hipotSNo2',
  'hipotSNo3': 'hipotSNo3', 'hipotSerial3': 'hipotSNo3',
  'hipotSNo4': 'hipotSNo4', 'hipotSerial4': 'hipotSNo4',
  'hipotSNo5': 'hipotSNo5', 'hipotSerial5': 'hipotSNo5',
  'dcw1': 'dcw1', 'dcw2': 'dcw2', 'dcw3': 'dcw3', 'dcw4': 'dcw4', 'dcw5': 'dcw5',
  'ir1': 'ir1', 'ir2': 'ir2', 'ir3': 'ir3', 'ir4': 'ir4', 'ir5': 'ir5',
  'gc1': 'gc1', 'gc2': 'gc2', 'gc3': 'gc3', 'gc4': 'gc4', 'gc5': 'gc5',
  'voltage': 'voltage', 'hipotVoltage': 'voltage',

  // --- STAGE 29: Post EL ---
  'postElSNo1': 'postElSNo1', 'postElSerial1': 'postElSNo1',
  'postElSNo2': 'postElSNo2', 'postElSerial2': 'postElSNo2',
  'postElSNo3': 'postElSNo3', 'postElSerial3': 'postElSNo3',
  'postElSNo4': 'postElSNo4', 'postElSerial4': 'postElSNo4',
  'postElSNo5': 'postElSNo5', 'postElSerial5': 'postElSNo5',
  'postElResult1': 'postElResult1', 'postElResult2': 'postElResult2', 'postElResult3': 'postElResult3', 'postElResult4': 'postElResult4', 'postElResult5': 'postElResult5',
  'postElVoltage': 'voltage', 'postElCurrent': 'current',

  // --- STAGE 30: RFID ---
  'rfidPosition': 'rfidPosition', 'rfidPos': 'rfidPosition',
  'cellMakeMonth': 'cellMakeMonth', 'cellMake': 'cellMakeMonth',
  'moduleMakeMonth': 'moduleMakeMonth',

  // --- STAGE 31: Final Visual ---
  'finalVisualSNo1': 'finalVisualSNo1', 'finalSNo1': 'finalVisualSNo1',
  'finalVisualSNo2': 'finalVisualSNo2', 'finalSNo2': 'finalVisualSNo2',
  'finalVisualSNo3': 'finalVisualSNo3', 'finalSNo3': 'finalVisualSNo3',
  'finalVisualSNo4': 'finalVisualSNo4', 'finalSNo4': 'finalVisualSNo4',
  'finalVisualSNo5': 'finalVisualSNo5', 'finalSNo5': 'finalVisualSNo5',
  'finalVisualResult1': 'finalVisualResult1', 'finalResult1': 'finalVisualResult1',
  'finalVisualResult2': 'finalVisualResult2', 'finalResult2': 'finalVisualResult2',
  'finalVisualResult3': 'finalVisualResult3', 'finalResult3': 'finalVisualResult3',
  'finalVisualResult4': 'finalVisualResult4', 'finalResult4': 'finalVisualResult4',
  'finalVisualResult5': 'finalVisualResult5', 'finalResult5': 'finalVisualResult5',
  'backlabelSNo1': 'backlabelSNo1', 'backLabelSNo1': 'backlabelSNo1',
  'backlabelSNo2': 'backlabelSNo2', 'backLabelSNo2': 'backlabelSNo2',
  'backlabelSNo3': 'backlabelSNo3', 'backLabelSNo3': 'backlabelSNo3',
  'backlabelSNo4': 'backlabelSNo4', 'backLabelSNo4': 'backlabelSNo4',
  'backlabelSNo5': 'backlabelSNo5', 'backLabelSNo5': 'backlabelSNo5',
  'backlabelResult1': 'backlabelResult1', 'backLabelResult1': 'backlabelResult1',
  'backlabelResult2': 'backlabelResult2', 'backLabelResult2': 'backlabelResult2',
  'backlabelResult3': 'backlabelResult3', 'backLabelResult3': 'backlabelResult3',
  'backlabelResult4': 'backlabelResult4', 'backLabelResult4': 'backlabelResult4',
  'backlabelResult5': 'backlabelResult5', 'backLabelResult5': 'backlabelResult5',

  // --- STAGE 32: Dimension ---
  'moduleProfile': 'moduleProfile', 'moduleDimension': 'moduleProfile', 'moduleDimensionLW': 'moduleProfile', 'moduleSize': 'moduleProfile',
  'mountingHoleXPitch': 'mountingHoleXPitch', 'xPitch': 'mountingHoleXPitch', 'mountingX': 'mountingHoleXPitch', 'mountingHoleX': 'mountingHoleXPitch',
  'mountingHoleYPitch': 'mountingHoleYPitch', 'yPitch': 'mountingHoleYPitch', 'mountingY': 'mountingHoleYPitch', 'mountingHoleY': 'mountingHoleYPitch',
  'diagonalDifference': 'diagonalDifference', 'diagonalDiff': 'diagonalDifference', 'diagonal': 'diagonalDifference',
  'cornerGap': 'cornerGap', 'corner': 'cornerGap',
  'moduleLength': 'moduleLength', 'moduleWidth': 'moduleWidth', 'moduleThickness': 'moduleThickness',

  // --- STAGE 33: Packaging ---
  'packagingLabel': 'packagingLabel', 'packageLabel': 'packagingLabel', 'labelCheck': 'packagingLabel',
  'contentInBox': 'contentInBox', 'boxContent': 'contentInBox', 'contentsInBox': 'contentInBox',
  'boxCondition': 'boxCondition', 'cartonCondition': 'boxCondition',
  'palletDimension': 'palletDimension', 'palletDim': 'palletDimension', 'palletSize': 'palletDimension',
  'cartonNo': 'cartonNo', 'shippingMarks': 'shippingMarks',
};

/**
 * Normalize all field names in AI response to the exact names expected by applyMappedDataToForm
 */
function normalizeFieldNames(rawData) {
  const normalized = {};
  Object.entries(rawData).forEach(([key, value]) => {
    if (!value || (typeof value === 'string' && !value.trim())) return;
    
    // Direct lookup
    const correctName = FIELD_ALIASES[key];
    if (correctName) {
      normalized[correctName] = value;
      return;
    }
    
    // Case-insensitive lookup
    const lowerKey = key.toLowerCase();
    for (const [alias, target] of Object.entries(FIELD_ALIASES)) {
      if (alias.toLowerCase() === lowerKey) {
        normalized[target] = value;
        return;
      }
    }
    
    // Fuzzy match: remove underscores, dashes, spaces and compare
    const cleanKey = key.replace(/[-_ ]/g, '').toLowerCase();
    for (const [alias, target] of Object.entries(FIELD_ALIASES)) {
      if (alias.replace(/[-_ ]/g, '').toLowerCase() === cleanKey) {
        normalized[target] = value;
        return;
      }
    }
    
    // If no alias found, keep original (might still match)
    normalized[key] = value;
  });
  
  console.log('🔄 Field normalization: ', Object.keys(rawData).length, 'raw →', Object.keys(normalized).length, 'normalized');
  return normalized;
}

// ======================================================================
// MAIN EXPORT
// ======================================================================
export async function deepScanAllPages(ocrTexts, progressCallback = () => {}) {
  if (!GROQ_API_KEY) {
    console.error('❌ GROQ_API_KEY not found, using regex fallback');
    return normalizeFieldNames(extractAllFieldsWithRegex(Object.values(ocrTexts).join('\n\n')));
  }

  try {
    progressCallback('Starting AI field extraction...');
    const pages = Object.entries(ocrTexts);
    if (!pages.length) return {};

    const allText = pages.map(([, t]) => t).join('\n\n--- PAGE BREAK ---\n\n');
    const mid = Math.ceil(pages.length / 2);
    const firstHalf = pages.slice(0, mid).map(([, t]) => t).join('\n\n--- PAGE BREAK ---\n\n');
    const secondHalf = pages.slice(mid).map(([, t]) => t).join('\n\n--- PAGE BREAK ---\n\n');

    progressCallback('Processing pages 1-' + mid + '...');
    const result1 = await callGroqAPI(firstHalf, 'first');

    await delay(2500);

    progressCallback('Processing pages ' + (mid + 1) + '-' + pages.length + '...');
    const result2 = await callGroqAPI(secondHalf, 'second');

    const merged = { ...result1, ...result2 };
    
    // NORMALIZE field names BEFORE returning
    const normalized = normalizeFieldNames(merged);
    normalizeSerials(normalized);
    
    progressCallback('Field extraction complete');
    console.log('✅ Deep Scanner v4: AI returned', Object.keys(merged).length, 'fields → normalized to', Object.keys(normalized).length);
    return normalized;
  } catch (error) {
    console.error('Deep scan error:', error);
    progressCallback('AI failed, using regex fallback...');
    return normalizeFieldNames(extractAllFieldsWithRegex(Object.values(ocrTexts).join('\n\n')));
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
  return `Extract ALL data from this IPQC inspection form OCR text. Return ONLY a JSON object with key-value pairs. Use these field names where applicable:

For header: date, time, shift, poNo, operator, docNo
For temperature/humidity readings: temperature, humidity  
For glass: frontGlassDimension, appearance
For EVA: eva1Type, eva1Dimension, evaManufacturingDate, evaStatus
For soldering edge: evaSolderingTemp, evaSolderingQuality
For cells: cellManufacturer, cellEfficiency, cellSize, cellCondition, cleanliness
For tabber stringer: crossCutting, visualCheckTS01A through TS04B, elImageTS01A through TS04B, stringLengthTS01A through TS04B, cellGapTS01A through TS04B
For auto bussing: stringToStringGap, cellEdgeTop, cellEdgeBottom, cellEdgeSides, busbarPeelStrength, terminalBusbar, solderingQuality1/2/3, creepageTop/2/3, creepageBottom/2/3, autoTaping1/2/3

Extract EVERY value you can find. Include serial numbers, measurements, OK/NG statuses, temperatures, dimensions.

OCR TEXT:
${text}

Return ONLY valid JSON, no explanation:`;
}

function getPromptSecondHalf(text) {
  return `Extract ALL data from this IPQC inspection form OCR text. Return ONLY a JSON object with key-value pairs. Use these field names where applicable:

For EVA 2nd layer: eva2Type, eva2Dimension, eva2Status
For back glass: backGlassDimension, numberOfHoles
For visual inspection: visualInspection1-5
For EL barcodes: elBarcode1-5
For rework: cleaningStatus, solderingIronTemp, methodOfRework
For laminator: laminatorMonitoring, diaphragmCleaning
For trimming serials: trimmingSNo1-5, bladeCondition
For visual serials: visualSNo1-5
For framing: glueUniformity, anodizingThickness
For JB: jbAppearance, jbCableLength, siliconGlueWeight, maxWeldingTime, solderingCurrent
For potting: pottingWeight
For curing: curingTemperature, curingHumidity, curingTime
For flash: ambientTemp, moduleTemp
For hipot serials: hipotSNo1-5, dcw1-5, ir1-5
For post EL: postElSNo1-5
For RFID: rfidPosition, cellMakeMonth
For final visual: finalVisualSNo1-5, backlabelSNo1-5
For dimension: moduleProfile, mountingHoleXPitch, mountingHoleYPitch, diagonalDifference, cornerGap
For packaging: packagingLabel, contentInBox, boxCondition, palletDimension

Extract EVERY value you can find. Include serial numbers (19-digit like GS04890KG0092676054), measurements, OK/NG.
Fix serial OCR: GSO→GS0, GTSO→GTS0, remove spaces in serial numbers.

OCR TEXT:
${text}

Return ONLY valid JSON, no explanation:`;
}

function normalizeSerials(data) {
  Object.keys(data).forEach(key => {
    if (typeof data[key] === 'string' && (
      key.includes('SNo') || key.includes('Barcode') || key.includes('Serial') || 
      key.includes('hipot') || key.includes('postEl') || key.includes('elBarcode') ||
      key.includes('trimming') || key.includes('visual') || key.includes('cleaning') ||
      key.includes('finalVisual') || key.includes('backlabel')
    )) {
      data[key] = normalizeSerial(data[key]);
    }
  });
}

function normalizeSerial(serial) {
  if (!serial || typeof serial !== 'string') return serial;
  let s = serial.replace(/\s+/g, '');
  s = s.replace(/GSO/g, 'GS0').replace(/GTSO/g, 'GTS0').replace(/LISO/g, 'LIS0');
  s = s.replace(/[oO](?=\d)/g, '0');
  return s;
}

// ======================================================================
// REGEX FALLBACK - extract fields without AI
// ======================================================================
function extractAllFieldsWithRegex(text) {
  const result = {};
  if (!text) return result;

  // Header
  const dateMatch = text.match(/Date[:\s]*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i);
  if (dateMatch) result.date = dateMatch[1];
  const timeMatch = text.match(/Time[:\s]*(\d{1,2}:\d{2}(?::\d{2})?)/i);
  if (timeMatch) result.time = timeMatch[1];
  const shiftMatch = text.match(/Shift[:\s]*(A|B|C|Day|Night|General)/i);
  if (shiftMatch) result.shift = shiftMatch[1];
  const poMatch = text.match(/(?:PO|P\.O|Purchase\s*Order)[.\s:]*(\S+)/i);
  if (poMatch) result.poNo = poMatch[1];

  // Temperature & Humidity
  const tempMatch = text.match(/(?:Temp|Temperature)[:\s]*([\d.]+)\s*[°℃C]/i);
  if (tempMatch) result.temperature = tempMatch[1] + '℃';
  const humMatch = text.match(/(?:Humidity|RH)[:\s]*([\d.]+)\s*%/i);
  if (humMatch) result.humidity = humMatch[1] + '%';

  // Glass dimensions
  const glassMatch = text.match(/(?:Front\s*)?Glass[:\s]*Dimension[:\s]*([\d.]+\s*[×xX]\s*[\d.]+\s*[×xX]\s*[\d.]+)\s*mm/i);
  if (glassMatch) result.frontGlassDimension = glassMatch[1].replace(/\s+/g, '') + 'mm';
  const backGlassMatch = text.match(/Back\s*(?:Glass|Sheet)[:\s]*(?:Dimension)?[:\s]*([\d.]+\s*[×xX]\s*[\d.]+\s*[×xX]\s*[\d.]+)\s*mm/i);
  if (backGlassMatch) result.backGlassDimension = backGlassMatch[1].replace(/\s+/g, '') + 'mm';

  // EVA
  const evaTypeMatch = text.match(/EVA[/\s]*EPE[:\s]*(?:Type)?[:\s]*(EP\d+|EVA[\w]*)/i);
  if (evaTypeMatch) result.eva1Type = evaTypeMatch[1];
  const evaDimMatch = text.match(/EVA[/\s]*(?:EPE)?[:\s]*(?:Cutting\s*)?Dimension[:\s]*([\d.]+\s*[×xX]\s*[\d.]+(?:\s*[×xX]\s*[\d.]+)?)/i);
  if (evaDimMatch) result.eva1Dimension = evaDimMatch[1].replace(/\s+/g, '');

  // Cell info
  const cellMfgMatch = text.match(/Cell\s*(?:Manufacturer|Make|Brand)[:\s]*(\w+)/i);
  if (cellMfgMatch) result.cellManufacturer = cellMfgMatch[1];
  const cellEffMatch = text.match(/(?:Cell\s*)?Efficiency[:\s]*([\d.]+)\s*%?/i);
  if (cellEffMatch) result.cellEfficiency = cellEffMatch[1];
  const cellSizeMatch = text.match(/Cell\s*Size[:\s]*([\d.]+\s*[×xX]\s*[\d.]+)\s*mm/i);
  if (cellSizeMatch) result.cellSize = cellSizeMatch[1].replace(/\s+/g, '') + 'mm';

  // Serial numbers (19-digit patterns)
  const serialPattern = /\b[A-Z]{2,4}\d{5,}[A-Z]{0,3}\d{5,}\b/g;
  const serials = text.match(serialPattern) || [];
  const uniqueSerials = [...new Set(serials.map(s => normalizeSerial(s)))];
  
  // Assign serials to various fields
  if (uniqueSerials.length > 0) {
    for (let i = 0; i < Math.min(5, uniqueSerials.length); i++) {
      result[`elBarcode${i + 1}`] = uniqueSerials[i];
    }
  }

  // Soldering temp
  const solderTempMatch = text.match(/(?:Soldering|Solder)[:\s]*(?:Iron\s*)?(?:Temp|Temperature)[:\s]*([\d.]+)\s*[°℃C]/i);
  if (solderTempMatch) result.evaSolderingTemp = solderTempMatch[1] + '℃';

  // Module profile
  const profileMatch = text.match(/(?:Module\s*(?:Profile|Dimension)|LxWxT)[:\s]*\(?([\d.]+\s*[×xX]\s*[\d.]+\s*[×xX]\s*[\d.]+)\)?\s*mm/i);
  if (profileMatch) result.moduleProfile = '(' + profileMatch[1].replace(/\s+/g, '') + ')mm';

  // Anodizing
  const anodMatch = text.match(/Anodiz(?:ing|ation)[:\s]*(?:Thickness)?[:\s]*([\d.]+)\s*(?:micron|μm)/i);
  if (anodMatch) result.anodizingThickness = anodMatch[1] + ' micron';

  // Silicon glue weight
  const glueMatch = text.match(/(?:Silicon|Silicone)\s*(?:Glue|Sealant)\s*(?:Weight)?[:\s]*([\d.]+)\s*(?:gm|g)/i);
  if (glueMatch) result.siliconGlueWeight = glueMatch[1] + ' gm';

  // Curing
  const cureTemp = text.match(/Curing[:\s]*(?:Temp|Temperature)[:\s]*([\d.]+)/i);
  if (cureTemp) result.curingTemperature = cureTemp[1];
  const cureHum = text.match(/Curing[:\s]*(?:Humidity)[:\s]*([\d.]+)/i);
  if (cureHum) result.curingHumidity = cureHum[1];

  // OK/NG statuses
  const okFields = ['appearance', 'cellCondition', 'cleanliness', 'laminatorMonitoring', 'diaphragmCleaning',
    'glueUniformity', 'packagingLabel', 'contentInBox', 'boxCondition'];
  okFields.forEach(field => {
    if (!result[field]) {
      const regex = new RegExp(field.replace(/([A-Z])/g, '\\s*$1') + '[:\\s]*(OK|Good|Clean|Pass|Uniform)', 'i');
      const m = text.match(regex);
      if (m) result[field] = m[1];
    }
  });

  return result;
}
