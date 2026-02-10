/**
 * checkpointDefaults.js - Shared default checkpoint definitions
 * Used by both IPQCForm.js and BatchProcessor.js
 */

export const getDefaultCheckpoints = () => [
  { sr: 1, stage: 'Shop Floor', checkpoint: 'Temperature', quantum: 'once', frequency: 'per shift', criteria: 'Temp. 25±3°C', subResults: {} },
  { sr: 2, stage: 'Shop Floor', checkpoint: 'Humidity', quantum: 'once', frequency: 'per shift', criteria: 'RH ≤60%', subResults: {} },
  { sr: 3, stage: 'Glass Loader', checkpoint: 'Glass dimension(L*W*T)', quantum: 'once', frequency: 'per shift', criteria: 'As Per PO', subResults: {} },
  { sr: 4, stage: 'Glass Loader', checkpoint: 'Appearance(Visual)', quantum: 'once', frequency: 'per shift', criteria: 'Glass Broken, Crack, Scratches and Line mark not allowed', subResults: {} },
  { sr: 5, stage: 'EVA/EPE Cutting', checkpoint: 'EVA/EPE Type', quantum: 'once', frequency: 'per shift', criteria: 'As per approved BOM', subResults: {} },
  { sr: 6, stage: 'EVA/EPE Cutting', checkpoint: 'EVA/EPE dimension(L*W*T)', quantum: 'once', frequency: 'per shift', criteria: 'As per Specification', subResults: {} },
  { sr: 7, stage: 'EVA/EPE Cutting', checkpoint: 'EVA/EPE Status', quantum: 'once', frequency: 'per shift', criteria: 'Not allowed dust & foreign particle/Cut & non Uniform Embossing', subResults: {} },
  { sr: 8, stage: 'Eva/EPE Soldering at edge', checkpoint: 'Soldering Temperature and Quality', quantum: 'Once', frequency: 'per shift', criteria: 'As per specification 400 ± 20°C', subResults: { 'Temp': '', 'Quality': '' } },
  { sr: 9, stage: 'Cell Loading', checkpoint: 'Cell Manufacturer & Eff.', quantum: 'once', frequency: 'per shift', criteria: 'Refer Process Card', subResults: {} },
  { sr: 10, stage: 'Cell Loading', checkpoint: 'Cell Size(L*W)', quantum: 'once', frequency: 'per shift', criteria: 'Refer Process Card', subResults: {} },
  { sr: 11, stage: 'Cell Loading', checkpoint: 'Cell Condition', quantum: 'once', frequency: 'per shift', criteria: 'Free From dust,finger spot,color variation', subResults: {} },
  { sr: 12, stage: 'Cell Loading', checkpoint: 'Cleanliness of Cell Loading Area', quantum: 'once', frequency: 'per shift', criteria: 'No unwanted or waste material', subResults: {} },
  { sr: 13, stage: 'Cell Loading', checkpoint: 'Verification of Process Parameter', quantum: 'once', frequency: 'per shift', criteria: 'ATW Stringer Specification', subResults: { 'ATW Temp': '' } },
  { sr: 14, stage: 'Cell Loading', checkpoint: 'Cell Cross cutting', quantum: 'once', frequency: 'per shift', criteria: 'Both side cutting should be equal', subResults: {} },
  { sr: 15, stage: 'Tabber & stringer', checkpoint: 'Verification of Process Parameter', quantum: 'once', frequency: 'Month', criteria: 'ATW Stringer specification', subResults: { 'ATW Temp': '' } },
  { sr: 16, stage: 'Tabber & stringer', checkpoint: 'Visual Check after Stringing', quantum: 'once', frequency: '1 String/TS shift', criteria: 'TS Visual Criteria', subResults: { 'TS01A': '', 'TS01B': '', 'TS02A': '', 'TS02B': '', 'TS03A': '', 'TS03B': '', 'TS04A': '', 'TS04B': '' } },
  { sr: 17, stage: 'Tabber & stringer', checkpoint: 'EL Image of Strings', quantum: 'once', frequency: '1 String/TS/shift', criteria: 'TS EL Criteria', subResults: { 'TS01A': '', 'TS01B': '', 'TS02A': '', 'TS02B': '', 'TS03A': '', 'TS03B': '', 'TS04A': '', 'TS04B': '' } },
  { sr: 18, stage: 'Tabber & stringer', checkpoint: 'String length', quantum: 'once', frequency: '1 String/Stringer/ shift', criteria: 'Refer Process Card', subResults: { 'TS01A': '', 'TS01B': '', 'TS02A': '', 'TS02B': '', 'TS03A': '', 'TS03B': '', 'TS04A': '', 'TS04B': '' } },
  { sr: 19, stage: 'Tabber & stringer', checkpoint: 'Cell to Cell Gap', quantum: 'once', frequency: 'per shift', criteria: 'Refer Process Card', subResults: { 'TS01A': '', 'TS01B': '', 'TS02A': '', 'TS02B': '', 'TS03A': '', 'TS03B': '', 'TS04A': '', 'TS04B': '' } },
  { sr: 20, stage: 'Tabber & stringer', checkpoint: 'Verification of Soldering Peel Strength', quantum: '2 cell each stringer', frequency: 'per shift', criteria: 'Peel Strength ≥1N', subResults: { 'Ribbon to cell': '' } },
  { sr: 21, stage: 'Auto bussing, layup & Tapping', checkpoint: 'String to String Gap', quantum: 'once', frequency: 'per shift', criteria: 'Refer Process Card & Module Drawing', subResults: {} },
  { sr: 22, stage: 'Auto bussing, layup & Tapping', checkpoint: 'Cell edge to Glass edge distance', quantum: 'once', frequency: 'per shift', criteria: 'Refer Module Drawing', subResults: { 'TOP': '', 'Bottom': '', 'Sides': '' } },
  { sr: 23, stage: 'Auto bussing, layup & Tapping', checkpoint: 'Soldering Peel Strength', quantum: 'once', frequency: 'per shift', criteria: '≥2N', subResults: { 'Ribbon to busbar': '' } },
  { sr: 24, stage: 'Auto bussing, layup & Tapping', checkpoint: 'Terminal busbar to edge', quantum: 'once', frequency: 'per shift', criteria: '132 Cell module drawing', subResults: {} },
  { sr: 25, stage: 'Auto bussing, layup & Tapping', checkpoint: 'Soldering Quality of Ribbon', quantum: 'Every 4h', frequency: 'per shift', criteria: 'No Dry/Poor Soldering', subResults: {} },
  { sr: 26, stage: 'Auto bussing, layup & Tapping', checkpoint: 'Top & Bottom Creepage', quantum: 'Every 4h', frequency: 'per shift', criteria: 'Creepage distance as per process card', subResults: {} },
  { sr: 27, stage: 'Auto bussing, layup & Tapping', checkpoint: 'Verification of Process', quantum: 'once', frequency: 'per shift', criteria: 'Specification for Auto Bussing', subResults: {} },
  { sr: 28, stage: 'Auto bussing, layup & Tapping', checkpoint: 'Quality of auto taping', quantum: 'Every 4h', frequency: 'per shift', criteria: 'Taping proper,no Cell Shifting', subResults: {} },
  { sr: 29, stage: 'Auto RFID Logo/Barcode', checkpoint: 'Position verification', quantum: 'Every 4h', frequency: 'per shift', criteria: 'Should not be tilt', subResults: {} },
  { sr: 30, stage: 'EVA/EPE cutting', checkpoint: 'EVA/EPE Type', quantum: 'once', frequency: 'per shift', criteria: 'EVA', subResults: {} },
  { sr: 31, stage: 'EVA/EPE cutting', checkpoint: 'EVA/EPE dimension', quantum: 'once', frequency: 'per shift', criteria: 'As per Specification', subResults: {} },
  { sr: 32, stage: 'EVA/EPE cutting', checkpoint: 'EVA/EPE Status', quantum: 'once', frequency: 'per shift', criteria: 'Not allowed dust & particle', subResults: {} },
  { sr: 33, stage: 'Back Glass Loader', checkpoint: 'Glass dimension', quantum: 'once', frequency: 'Per shift', criteria: 'As per PO', subResults: {} },
  { sr: 34, stage: 'Back Glass Loader', checkpoint: 'No. of Holes', quantum: 'once', frequency: 'Per shift', criteria: '3 hole with 12mm±0.5mm', subResults: {} },
  { sr: 35, stage: 'Auto Busbar Flatten', checkpoint: 'Visual Inspection', quantum: '5 pieces', frequency: 'per shift', criteria: 'No cracks/ breaks', subResults: {} },
  { sr: 36, stage: 'Pre lamination EL', checkpoint: 'EL & Visual inspection', quantum: '5 pieces', frequency: 'per shift', criteria: 'Pre EL Inspection Criteria', subResults: { 'S1': '', 'S2': '', 'S3': '' } },
  { sr: 37, stage: 'String Rework Station', checkpoint: 'Cleaning & sponge', quantum: 'once', frequency: 'per shift', criteria: 'Rework Station Clean/Sponge Wet', subResults: {} },
  { sr: 38, stage: 'String Rework Station', checkpoint: 'Soldering Iron Temp', quantum: 'once', frequency: 'per shift', criteria: '400±30°C', subResults: { 'Time': '' } },
  { sr: 39, stage: 'Module Rework Station', checkpoint: 'Method of Rework', quantum: 'once', frequency: 'per shift', criteria: 'As per WI (GSPL/P/WI/012)', subResults: {} },
  { sr: 40, stage: 'Module Rework Station', checkpoint: 'Cleaning of station', quantum: 'once', frequency: 'per shift', criteria: 'Station Clean/Sponge Wet', subResults: {} },
  { sr: 41, stage: 'Module Rework Station', checkpoint: 'Soldering Iron Temp', quantum: 'once', frequency: 'per shift', criteria: '400±30°C', subResults: { 'Time': '' } },
  { sr: 42, stage: 'Laminator', checkpoint: 'Monitoring Parameters', quantum: 'once', frequency: 'per shift', criteria: 'Process Parameter', subResults: {} },
  { sr: 43, stage: 'Laminator', checkpoint: 'Cleaning of Diaphragm', quantum: 'once', frequency: '24h', criteria: 'Clean,No EVA residue', subResults: {} },
  { sr: 44, stage: 'Laminator', checkpoint: 'Peel of Test', quantum: 'All position', frequency: 'Month', criteria: 'E/G ≥60N/cm E/B≥60N/cm', subResults: { 'Ref': '' } },
  { sr: 45, stage: 'Laminator', checkpoint: 'Gel Content Test', quantum: 'All position', frequency: 'Month', criteria: '75 to 95%', subResults: { 'Ref': '' } },
  { sr: 46, stage: 'Auto Tape Removing', checkpoint: 'Visual Check', quantum: '5 pieces', frequency: 'per shift', criteria: 'Tape smooth, No bubble', subResults: {} },
  { sr: 47, stage: 'Auto Edge Trimming', checkpoint: 'Trimming Quality', quantum: '5 pieces', frequency: 'per shift', criteria: 'Uneven Trimming not allowed', subResults: { 'S1': '', 'S2': '', 'S3': '', 'S4': '', 'S5': '' } },
  { sr: 48, stage: 'Auto Edge Trimming', checkpoint: 'Trimming Blade', quantum: 'once', frequency: 'per month', criteria: 'Worn out not allowed', subResults: {} },
  { sr: 49, stage: '90° Visual', checkpoint: 'Visual Inspection', quantum: '5 pieces', frequency: 'per shift', criteria: 'Post Lam Criteria', subResults: { 'S1': '', 'S2': '', 'S3': '', 'S4': '', 'S5': '' } },
  { sr: 50, stage: 'Framing', checkpoint: 'Glue uniformity', quantum: '1 set', frequency: 'per shift', criteria: 'Uniform,Back sealing proper', subResults: {} },
  { sr: 51, stage: 'Framing', checkpoint: 'Short Side Glue', quantum: 'once', frequency: 'Per shift', criteria: 'Fill as per Spec', subResults: { 'Ref': '' } },
  { sr: 52, stage: 'Framing', checkpoint: 'Long Side Glue', quantum: 'once', frequency: 'Per shift', criteria: 'Fill as per Spec', subResults: {} },
  { sr: 53, stage: 'Framing', checkpoint: 'Anodizing Thickness', quantum: 'once', frequency: 'Per shift', criteria: '≥15 micron', subResults: {} },
  { sr: 54, stage: 'Junction Box', checkpoint: 'Junction Box Check', quantum: 'once', frequency: 'Per shift', criteria: 'As per Process Card', subResults: {} },
  { sr: 55, stage: 'Junction Box', checkpoint: 'Silicon Glue Weight', quantum: 'once', frequency: 'Per shift', criteria: '21±6 gm', subResults: {} },
  { sr: 56, stage: 'Auto JB', checkpoint: 'Max Welding time', quantum: 'once', frequency: 'Per shift', criteria: 'As per Spec', subResults: {} },
  { sr: 57, stage: 'Auto JB', checkpoint: 'Soldering current', quantum: 'once', frequency: 'per shift', criteria: 'As per Spec', subResults: {} },
  { sr: 58, stage: 'Auto JB', checkpoint: 'Soldering Quality', quantum: 'once', frequency: 'per shift', criteria: 'Welding area covered', subResults: {} },
  { sr: 59, stage: 'JB Potting', checkpoint: 'A/B Glue Ratio', quantum: 'once', frequency: 'Per shift', criteria: 'As per Spec', subResults: { 'Ref': '' } },
  { sr: 60, stage: 'JB Potting', checkpoint: 'Potting weight', quantum: 'once', frequency: 'Per shift', criteria: '21±6 gm', subResults: {} },
  { sr: 61, stage: 'JB Potting', checkpoint: 'Nozzle Changing', quantum: 'once', frequency: 'every 6h', criteria: 'Changed after 6h', subResults: { 'Time': '' } },
  { sr: 62, stage: 'OLE Potting Inspection', checkpoint: 'Visual Check', quantum: 'once', frequency: '5 piece', criteria: 'Potting properly filled', subResults: {} },
  { sr: 63, stage: 'Curing', checkpoint: 'Temperature', quantum: 'once', frequency: 'per shift', criteria: '25±3℃', subResults: {} },
  { sr: 64, stage: 'Curing', checkpoint: 'Humidity', quantum: 'once', frequency: 'per shift', criteria: '≥50%', subResults: {} },
  { sr: 65, stage: 'Curing', checkpoint: 'Curing Time', quantum: 'once', frequency: 'Per shift', criteria: '≥4 hours', subResults: {} },
  { sr: 66, stage: 'Buffing', checkpoint: 'Corner Edge/Belt condition', quantum: '5 pieces', frequency: 'per shift', criteria: 'Not sharp & No worn', subResults: {} },
  { sr: 67, stage: 'Cleaning', checkpoint: 'Module free from residue', quantum: '5 pieces', frequency: 'per shift', criteria: 'Post Lam Criteria', subResults: { 'S1': '', 'S2': '', 'S3': '', 'S4': '', 'S5': '' } },
  { sr: 68, stage: 'Flash Tester', checkpoint: 'Ambient Temp', quantum: 'once', frequency: 'per shift', criteria: '25±3℃', subResults: {} },
  { sr: 69, stage: 'Flash Tester', checkpoint: 'Module Temp', quantum: 'once', frequency: 'per shift', criteria: '25±3℃', subResults: {} },
  { sr: 70, stage: 'Flash Tester', checkpoint: 'Sunsimulator Cal', quantum: 'once', frequency: '12h', criteria: 'Calibrated at shift', subResults: {} },
  { sr: 71, stage: 'Flash Tester', checkpoint: 'Validation', quantum: 'once', frequency: 'every 6h', criteria: 'As per GSPL/QA/S/11', subResults: {} },
  { sr: 72, stage: 'Flash Tester', checkpoint: 'Silver Ref EL', quantum: 'once', frequency: 'Two weeks', criteria: 'Same as original', subResults: {} },
  { sr: 73, stage: 'Hipot Test', checkpoint: 'DCW/IR/Ground', quantum: '5 pieces', frequency: 'per shift', criteria: '≤50µA , >40MΩ', subResults: { 'Sample 1': '', 'Sample 2': '', 'Sample 3': '', 'Sample 4': '', 'Sample 5': '' } },
  { sr: 74, stage: 'Post EL', checkpoint: 'Voltage & Current', quantum: 'once', frequency: 'Shift', criteria: 'As per WI', subResults: {} },
  { sr: 75, stage: 'Post EL', checkpoint: 'EL & Visual', quantum: '5 pieces', frequency: 'per shift', criteria: 'Post EL Criteria', subResults: { 'S1': '', 'S2': '', 'S3': '' } },
  { sr: 76, stage: 'RFID', checkpoint: 'RFID Position', quantum: 'once', frequency: 'per shift', criteria: 'As per Process', subResults: {} },
  { sr: 77, stage: 'RFID', checkpoint: 'Cell & Module Make', quantum: 'once', frequency: 'per shift', criteria: 'As per BOM', subResults: {} },
  { sr: 78, stage: 'Final Visual', checkpoint: 'Visual Inspection', quantum: '5 pieces', frequency: 'per shift', criteria: 'Post lam criteria', subResults: { 'S1': '', 'S2': '', 'S3': '', 'S4': '', 'S5': '' } },
  { sr: 79, stage: 'Final Visual', checkpoint: 'Backlabel', quantum: '5 pieces', frequency: 'per shift', criteria: 'Air bubble not allowed', subResults: { 'S1': '', 'S2': '', 'S3': '', 'S4': '', 'S5': '' } },
  { sr: 80, stage: 'Dimension', checkpoint: 'L*W & Profile', quantum: 'once', frequency: 'per shift', criteria: 'Module drawing (±1mm)', subResults: {} },
  { sr: 81, stage: 'Dimension', checkpoint: 'Mounting Hole', quantum: 'once', frequency: 'Per shift', criteria: 'Refer Drawing', subResults: {} },
  { sr: 82, stage: 'Dimension', checkpoint: 'Diagonal Diff', quantum: 'once', frequency: 'Per shift', criteria: '≤3mm', subResults: {} },
  { sr: 83, stage: 'Dimension', checkpoint: 'Corner Gap', quantum: 'once', frequency: 'Per shift', criteria: 'As per criteria', subResults: {} },
  { sr: 84, stage: 'Dimension', checkpoint: 'JB Cable length', quantum: 'once', frequency: 'Per shift', criteria: 'As per Card', subResults: {} },
  { sr: 85, stage: 'Packaging', checkpoint: 'Packaging Label', quantum: 'once', frequency: 'Per shift', criteria: 'WI For Packaging', subResults: {} },
  { sr: 86, stage: 'Packaging', checkpoint: 'Content in Box', quantum: 'once', frequency: 'Per shift', criteria: 'Refer Card', subResults: {} },
  { sr: 87, stage: 'Packaging', checkpoint: 'Box Condition', quantum: 'once', frequency: 'Per shift', criteria: 'No damage', subResults: {} },
  { sr: 88, stage: 'Packaging', checkpoint: 'Pallet dimension', quantum: 'once', frequency: 'Per shift', criteria: 'Not less than module', subResults: {} }
];

/**
 * Apply mapped data from AI scanner to form data structure
 * Returns { formData, filledCount, totalFields }
 */
export const applyMappedDataToFormData = (mappedData) => {
  const formData = {
    date: mappedData.date || '',
    time: mappedData.time || '',
    shift: mappedData.shift || '',
    poNo: mappedData.poNo || mappedData.batchNo || '',
    checkpoints: getDefaultCheckpoints(),
  };

  const cp = formData.checkpoints;

  const set = (idx, val) => {
    if (!cp[idx] || !val || !val.toString().trim()) return;
    if (!cp[idx].subResults) cp[idx].subResults = {};
    cp[idx].subResults['result'] = val;
  };

  const setSub = (idx, obj) => {
    if (!cp[idx] || !obj) return;
    if (!cp[idx].subResults) cp[idx].subResults = {};
    Object.entries(obj).forEach(([k, v]) => {
      if (v && v.toString().trim()) cp[idx].subResults[k] = v;
    });
  };

  // Header
  if (mappedData.date) formData.date = mappedData.date;
  if (mappedData.time) formData.time = mappedData.time;
  if (mappedData.shift) formData.shift = mappedData.shift;
  if (mappedData.operator) formData.checkedBy = mappedData.operator;
  if (mappedData.batchNo) formData.poNo = mappedData.batchNo;
  if (mappedData.poNo) formData.poNo = mappedData.poNo;

  // Stage 1: Shop Floor (sr 1-2, index 0-1)
  set(0, mappedData.temperature);
  if (mappedData.temperatureTime) setSub(0, { 'Time': mappedData.temperatureTime });
  set(1, mappedData.humidity);

  // Stage 2: Glass Loader (sr 3-4, index 2-3)
  set(2, mappedData.frontGlassDimension);
  set(3, mappedData.appearance);

  // Stage 3: EVA Cutting (sr 5-7, index 4-6)
  set(4, mappedData.eva1Type);
  set(5, mappedData.eva1Dimension);
  set(6, mappedData.evaManufacturingDate || mappedData.evaStatus || mappedData.evaStatusOk);
  if (mappedData.evaLotNo) setSub(6, { 'Lot No': mappedData.evaLotNo });

  // Stage 4: Eva/EPE Soldering (sr 8, index 7)
  if (mappedData.evaSolderingTemp || mappedData.evaSolderingQuality) {
    setSub(7, { 'Temp': mappedData.evaSolderingTemp, 'Quality': mappedData.evaSolderingQuality || 'OK' });
  }

  // Stage 5: Cell Loading (sr 9-14, index 8-13)
  if (mappedData.cellManufacturer || mappedData.cellEfficiency) {
    set(8, `${mappedData.cellManufacturer || ''} ${mappedData.cellEfficiency || ''}`.trim());
  }
  set(9, mappedData.cellSize);
  set(10, mappedData.cellCondition);
  set(11, mappedData.cleanliness);
  if (mappedData.atwTemp) setSub(12, { 'ATW Temp': mappedData.atwTemp });
  if (mappedData.crossCutting) set(13, mappedData.crossCutting);

  // Stage 6: Tabber & Stringer (sr 15-20, index 14-19)
  if (mappedData.tabberAtwTemp) setSub(14, { 'ATW Temp': mappedData.tabberAtwTemp });
  if (mappedData.visualCheckTS01A) {
    setSub(15, {
      'TS01A': mappedData.visualCheckTS01A, 'TS01B': mappedData.visualCheckTS01B,
      'TS02A': mappedData.visualCheckTS02A, 'TS02B': mappedData.visualCheckTS02B,
      'TS03A': mappedData.visualCheckTS03A, 'TS03B': mappedData.visualCheckTS03B,
      'TS04A': mappedData.visualCheckTS04A, 'TS04B': mappedData.visualCheckTS04B
    });
  }
  if (mappedData.elImageTS01A) {
    setSub(16, {
      'TS01A': mappedData.elImageTS01A, 'TS01B': mappedData.elImageTS01B,
      'TS02A': mappedData.elImageTS02A, 'TS02B': mappedData.elImageTS02B,
      'TS03A': mappedData.elImageTS03A, 'TS03B': mappedData.elImageTS03B,
      'TS04A': mappedData.elImageTS04A, 'TS04B': mappedData.elImageTS04B
    });
  }
  if (mappedData.stringLengthTS01A) {
    setSub(17, {
      'TS01A': mappedData.stringLengthTS01A, 'TS01B': mappedData.stringLengthTS01B,
      'TS02A': mappedData.stringLengthTS02A, 'TS02B': mappedData.stringLengthTS02B,
      'TS03A': mappedData.stringLengthTS03A, 'TS03B': mappedData.stringLengthTS03B,
      'TS04A': mappedData.stringLengthTS04A, 'TS04B': mappedData.stringLengthTS04B
    });
  }
  if (mappedData.cellGapTS01A) {
    setSub(18, {
      'TS01A': mappedData.cellGapTS01A, 'TS01B': mappedData.cellGapTS01B,
      'TS02A': mappedData.cellGapTS02A, 'TS02B': mappedData.cellGapTS02B,
      'TS03A': mappedData.cellGapTS03A, 'TS03B': mappedData.cellGapTS03B,
      'TS04A': mappedData.cellGapTS04A, 'TS04B': mappedData.cellGapTS04B
    });
  }
  if (mappedData.peelStrength) setSub(19, { 'Ribbon to cell': mappedData.peelStrength });

  // Stage 7: Auto Bussing (sr 21-28, index 20-27)
  set(20, mappedData.stringGap);
  if (mappedData.cellEdgeTop || mappedData.cellEdgeBottom || mappedData.cellEdgeSides) {
    setSub(21, { 'TOP': mappedData.cellEdgeTop, 'Bottom': mappedData.cellEdgeBottom, 'Sides': mappedData.cellEdgeSides });
  }
  if (mappedData.busbarPeelStrength) setSub(22, { 'Ribbon to busbar': mappedData.busbarPeelStrength });
  set(23, mappedData.terminalBusbar);
  set(24, mappedData.solderingQuality);
  set(25, mappedData.creepage);
  set(26, mappedData.processVerificationAuto);
  set(27, mappedData.tapingQuality);

  // Stage 8: RFID Logo/Barcode (sr 29, index 28)
  set(28, mappedData.rfidPosition || mappedData.barcodePosition);

  // Stage 9: EVA 2nd cutting (sr 30-32, index 29-31)
  set(29, mappedData.eva2Type);
  set(30, mappedData.eva2Dimension);
  set(31, mappedData.eva2Status);

  // Stage 10: Back Glass Loader (sr 33-34, index 32-33)
  set(32, mappedData.backGlassDimension);
  set(33, mappedData.numberOfHoles);

  // Stage 11: Auto Busbar Flatten (sr 35, index 34)
  set(34, mappedData.busbarFlatten);

  // Stage 12: Pre-Lam EL (sr 36, index 35)
  if (mappedData.preLamELS1 || mappedData.preLamEL) {
    setSub(35, { 'S1': mappedData.preLamELS1, 'S2': mappedData.preLamELS2, 'S3': mappedData.preLamELS3 });
  }

  // Stage 13: String Rework (sr 37-38, index 36-37)
  set(36, mappedData.stringReworkCleaning);
  if (mappedData.stringReworkTemp) setSub(37, { 'Time': mappedData.stringReworkTemp });

  // Stage 14: Module Rework (sr 39-41, index 38-40)
  set(38, mappedData.moduleReworkMethod);
  set(39, mappedData.moduleReworkCleaning);
  if (mappedData.moduleReworkTemp) setSub(40, { 'Time': mappedData.moduleReworkTemp });

  // Stage 15: Laminator (sr 42-45, index 41-44)
  set(41, mappedData.laminatorParams);
  set(42, mappedData.diaphragmCleaning);
  if (mappedData.peelTest) setSub(43, { 'Ref': mappedData.peelTest });
  if (mappedData.gelContent) setSub(44, { 'Ref': mappedData.gelContent });

  // Stage 16: Auto Tape Removing (sr 46, index 45)
  set(45, mappedData.tapeRemoving || mappedData.bladeCondition);

  // Stage 17: Auto Edge Trimming (sr 47-48, index 46-47)
  if (mappedData.trimmingS1) {
    setSub(46, { 'S1': mappedData.trimmingS1, 'S2': mappedData.trimmingS2, 'S3': mappedData.trimmingS3, 'S4': mappedData.trimmingS4, 'S5': mappedData.trimmingS5 });
  }
  set(47, mappedData.trimmingBlade || mappedData.bladeCondition);

  // Stage 18: 90° Visual (sr 49, index 48)
  if (mappedData.visual90S1) {
    setSub(48, { 'S1': mappedData.visual90S1, 'S2': mappedData.visual90S2, 'S3': mappedData.visual90S3, 'S4': mappedData.visual90S4, 'S5': mappedData.visual90S5 });
  }

  // Stage 19: Framing (sr 50-53, index 49-52)
  set(49, mappedData.glueUniformity);
  if (mappedData.shortSideGlue) setSub(50, { 'Ref': mappedData.shortSideGlue });
  set(51, mappedData.longSideGlue);
  set(52, mappedData.anodizingThickness);

  // Stage 20: Junction Box (sr 54-55, index 53-54)
  set(53, mappedData.junctionBoxCheck);
  set(54, mappedData.siliconGlueWeight);

  // Stage 21: Auto JB (sr 56-58, index 55-57)
  set(55, mappedData.weldingTime);
  set(56, mappedData.solderingCurrent);
  set(57, mappedData.jbSolderingQuality);

  // Stage 22: JB Potting (sr 59-61, index 58-60)
  if (mappedData.glueRatio) setSub(58, { 'Ref': mappedData.glueRatio });
  set(59, mappedData.pottingWeight);
  if (mappedData.nozzleChanging) setSub(60, { 'Time': mappedData.nozzleChanging });

  // Stage 23: OLE Potting (sr 62, index 61)
  set(61, mappedData.olePotting);

  // Stage 24: Curing (sr 63-65, index 62-64)
  set(62, mappedData.curingTemp);
  set(63, mappedData.curingHumidity);
  set(64, mappedData.curingTime);

  // Stage 25: Buffing (sr 66, index 65)
  set(65, mappedData.buffing);

  // Stage 26: Cleaning (sr 67, index 66)
  if (mappedData.cleaningS1) {
    setSub(66, { 'S1': mappedData.cleaningS1, 'S2': mappedData.cleaningS2, 'S3': mappedData.cleaningS3, 'S4': mappedData.cleaningS4, 'S5': mappedData.cleaningS5 });
  }

  // Stage 27: Flash Tester (sr 68-72, index 67-71)
  set(67, mappedData.ambientTemp);
  set(68, mappedData.moduleTemp);
  set(69, mappedData.sunSimCal);
  set(70, mappedData.flashValidation);
  set(71, mappedData.silverRefEL);

  // Stage 28: Hipot Test (sr 73, index 72)
  if (mappedData.hipotSample1) {
    setSub(72, {
      'Sample 1': mappedData.hipotSample1, 'Sample 2': mappedData.hipotSample2,
      'Sample 3': mappedData.hipotSample3, 'Sample 4': mappedData.hipotSample4, 'Sample 5': mappedData.hipotSample5
    });
  }

  // Stage 29: Post EL (sr 74-75, index 73-74)
  set(73, mappedData.postELVoltage);
  if (mappedData.postELS1) {
    setSub(74, { 'S1': mappedData.postELS1, 'S2': mappedData.postELS2, 'S3': mappedData.postELS3 });
  }

  // Stage 30: RFID (sr 76-77, index 75-76)
  set(75, mappedData.rfidFinalPosition);
  set(76, mappedData.cellModuleMake);

  // Stage 31: Final Visual (sr 78-79, index 77-78)
  if (mappedData.finalVisualS1) {
    setSub(77, { 'S1': mappedData.finalVisualS1, 'S2': mappedData.finalVisualS2, 'S3': mappedData.finalVisualS3, 'S4': mappedData.finalVisualS4, 'S5': mappedData.finalVisualS5 });
  }
  if (mappedData.backlabelS1) {
    setSub(78, { 'S1': mappedData.backlabelS1, 'S2': mappedData.backlabelS2, 'S3': mappedData.backlabelS3, 'S4': mappedData.backlabelS4, 'S5': mappedData.backlabelS5 });
  }

  // Stage 32: Dimension (sr 80-84, index 79-83)
  set(79, mappedData.lwProfile);
  set(80, mappedData.mountingHole);
  set(81, mappedData.diagonalDiff);
  set(82, mappedData.cornerGap);
  set(83, mappedData.jbCableLength);

  // Stage 33: Packaging (sr 85-88, index 84-87)
  set(84, mappedData.packagingLabel);
  set(85, mappedData.contentInBox);
  set(86, mappedData.boxCondition);
  set(87, mappedData.palletDimension);

  // Count filled fields across all checkpoints
  let filledCount = 0;
  let totalFields = 88; // total checkpoints
  cp.forEach(checkpoint => {
    const subs = checkpoint.subResults || {};
    const hasValue = Object.values(subs).some(v => v && v.toString().trim());
    if (hasValue) filledCount++;
  });

  return { formData, filledCount, totalFields };
};
