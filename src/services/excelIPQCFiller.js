/**
 * Excel IPQC Filler Service
 * Fills OCR extracted data into the original IPQC Check Sheet Excel with handwriting style
 */

import * as XLSX from 'xlsx';

// Excel cell mapping for IPQC form data
// Maps form checkpoint index to Excel row and column
const IPQC_EXCEL_MAPPING = {
  // Header Info (Row 3 in Excel - 0 indexed)
  header: {
    date: { row: 3, col: 0 },      // "Date :- "
    time: { row: 3, col: 3 },      // "Time :- "
    shift: { row: 3, col: 5 },     // "Shift"
    poNo: { row: 3, col: 7 }       // "Po.no.:-"
  },
  
  // Checkpoints mapping - checkpoint index to Excel row(s) and result column(s)
  checkpoints: {
    // Stage 1: Shop Floor (Sr 1-2)
    1: { rows: [6], resultCol: 8, subFields: { 'Time': 8 } },      // Temperature
    2: { rows: [7], resultCol: 8, subFields: { 'Time': 8 } },      // Humidity
    
    // Stage 2: Glass Loader (Sr 3-4)
    3: { rows: [8], resultCol: 7 },       // Glass dimension
    4: { rows: [9], resultCol: 7 },       // Appearance(Visual)
    
    // Stage 3: EVA/EPE Cutting (Sr 5-7)
    5: { rows: [10], resultCol: 7 },      // EVA/EPE Type
    6: { rows: [11], resultCol: 7 },      // EVA/EPE dimension
    7: { rows: [12], resultCol: 7 },      // EVA/EPE Status
    
    // Stage 4: Eva/EPE Soldering (Sr 8)
    8: { rows: [13], resultCol: 7, subFields: { 'Temp': 7, 'Quality': 8 } },
    
    // Stage 5: Cell Loading (Sr 9-14)
    9: { rows: [14], resultCol: 7 },      // Cell Manufacturer
    10: { rows: [15], resultCol: 7 },     // Cell Size
    11: { rows: [16], resultCol: 7 },     // Cell Condition
    12: { rows: [17], resultCol: 7 },     // Cleanliness
    13: { rows: [18], resultCol: 7, subFields: { 'ATW Temp': 8 } },  // Process Parameter
    14: { rows: [19], resultCol: 7 },     // Cell Cross cutting
    
    // Stage 6: Tabber & Stringer (Sr 15-20)
    15: { rows: [20], resultCol: 8 },     // Verification of Process Parameter
    16: { 
      rows: [21, 22], 
      resultCol: 7,
      subFields: { 
        'TS01A': 7, 'TS01B': 8, 'TS02A': 9, 'TS02B': 10, 
        'TS03A': 11, 'TS03B': 12, 'TS04A': 13, 'TS04B': 14 
      }
    }, // Visual Check after Stringing
    17: { 
      rows: [23, 24], 
      resultCol: 7,
      subFields: { 
        'TS01A': 7, 'TS01B': 8, 'TS02A': 9, 'TS02B': 10, 
        'TS03A': 11, 'TS03B': 12, 'TS04A': 13, 'TS04B': 14 
      }
    }, // EL Image of Strings
    18: { 
      rows: [25, 26], 
      resultCol: 7,
      subFields: { 
        'TS01A': 7, 'TS01B': 8, 'TS02A': 9, 'TS02B': 10, 
        'TS03A': 11, 'TS03B': 12, 'TS04A': 13, 'TS04B': 14 
      }
    }, // String length
    19: { 
      rows: [27, 28], 
      resultCol: 7,
      subFields: { 
        'TS01A': 7, 'TS01B': 8, 'TS02A': 9, 'TS02B': 10, 
        'TS03A': 11, 'TS03B': 12, 'TS04A': 13, 'TS04B': 14 
      }
    }, // Cell to Cell Gap
    20: { rows: [29, 30], resultCol: 7, subFields: { 'Ribbon to cell': 7 } }, // Peel Strength
    
    // Stage 7: Auto bussing, layup & Tapping (Sr 21-28)
    21: { rows: [31], resultCol: 7 },     // String to String Gap
    22: { rows: [32, 33, 34], resultCol: 7, subFields: { 'TOP': 7, 'Bottom': 7, 'Sides': 7 } }, // Cell edge to Glass edge
    23: { rows: [35], resultCol: 7, subFields: { 'Ribbon to busbar': 7 } }, // Soldering Peel Strength
    24: { rows: [36, 37], resultCol: 7 }, // Terminal busbar to edge
    25: { rows: [38], resultCol: 7 },     // Soldering Quality
    26: { rows: [39], resultCol: 7 },     // Top & Bottom Creepage
    27: { rows: [40], resultCol: 7 },     // Verification of Process
    28: { rows: [41], resultCol: 7 },     // Quality of auto taping
    
    // Stage 8: Auto RFID Logo/Barcode (Sr 29)
    29: { rows: [42], resultCol: 7 },     // Position verification
    
    // Stage 9: EVA/EPE Cutting 2 (Sr 30-32)
    30: { rows: [43], resultCol: 7 },     // EVA/EPE Type
    31: { rows: [44], resultCol: 7 },     // EVA/EPE dimension
    32: { rows: [45], resultCol: 7 },     // EVA/EPE Status
    
    // Stage 10: Back Glass Loader (Sr 33-34)
    33: { rows: [46, 47], resultCol: 7 }, // Glass dimension
    34: { rows: [48, 49], resultCol: 7 }, // No. of Holes
    
    // Stage 11: Auto Busbar Flatten (Sr 35)
    35: { rows: [50, 51], resultCol: 7 }, // Visual Inspection
    
    // Stage 12: Pre lamination EL (Sr 36)
    36: { 
      rows: [52, 53, 54, 55, 56], 
      resultCol: 7,
      subFields: { 'S1': 7, 'S2': 8, 'S3': 9 }
    }, // EL & Visual
    
    // Stage 13: String Rework Station (Sr 37-38)
    37: { rows: [57], resultCol: 7 },     // Cleaning & sponge
    38: { rows: [58], resultCol: 7, subFields: { 'Time': 8 } }, // Soldering Iron Temp
    
    // Stage 14: Module Rework Station (Sr 39-41)
    39: { rows: [59], resultCol: 7 },     // Method of Rework
    40: { rows: [60], resultCol: 7 },     // Cleaning of station
    41: { rows: [61], resultCol: 7, subFields: { 'Time': 8 } }, // Soldering Iron Temp
    
    // Stage 15: Laminator (Sr 42-45)
    42: { rows: [62], resultCol: 7 },     // Monitoring Parameters
    43: { rows: [63], resultCol: 7 },     // Cleaning of Diaphragm
    44: { rows: [64], resultCol: 7, subFields: { 'Ref': 7 } }, // Peel of Test
    45: { rows: [65], resultCol: 7, subFields: { 'Ref': 7 } }, // Gel Content Test
    
    // Stage 16: Auto Tape Removing (Sr 46)
    46: { rows: [66], resultCol: 7 },     // Visual Check
    
    // Stage 17: Auto Edge Trimming (Sr 47-48)
    47: { 
      rows: [67, 68, 69, 70, 71], 
      resultCol: 7,
      subFields: { 'S1': 7, 'S2': 8, 'S3': 9, 'S4': 10, 'S5': 11 }
    }, // Trimming Quality
    48: { rows: [72], resultCol: 7 },     // Trimming Blade
    
    // Stage 18: 90° Visual (Sr 49)
    49: { 
      rows: [73, 74, 75, 76, 77], 
      resultCol: 7,
      subFields: { 'S1': 7, 'S2': 8, 'S3': 9, 'S4': 10, 'S5': 11 }
    }, // Visual Inspection
    
    // Stage 19: Framing (Sr 50-53)
    50: { rows: [78], resultCol: 7 },     // Glue uniformity
    51: { rows: [79], resultCol: 7, subFields: { 'Ref': 7 } }, // Short Side Glue
    52: { rows: [80], resultCol: 7 },     // Long Side Glue
    53: { rows: [81], resultCol: 7 },     // Anodizing Thickness
    
    // Stage 20: Junction Box (Sr 54-55)
    54: { rows: [82, 83], resultCol: 7 }, // Junction Box Check
    55: { rows: [84], resultCol: 7 },     // Silicon Glue Weight
    
    // Stage 21: Auto JB (Sr 56-58)
    56: { rows: [85], resultCol: 7 },     // Max Welding time
    57: { rows: [86], resultCol: 7 },     // Soldering current
    58: { rows: [87], resultCol: 7 },     // Soldering Quality
    
    // Stage 22: JB Potting (Sr 59-61)
    59: { rows: [88], resultCol: 7, subFields: { 'Ref': 7 } }, // A/B Glue Ratio
    60: { rows: [89], resultCol: 7 },     // Potting weight
    61: { rows: [90], resultCol: 7, subFields: { 'Time': 7 } }, // Nozzle Changing
    
    // Stage 23: OLE Potting Inspection (Sr 62)
    62: { rows: [91], resultCol: 7 },     // Visual Check
    
    // Stage 24: Curing (Sr 63-65)
    63: { rows: [92], resultCol: 7 },     // Temperature
    64: { rows: [93], resultCol: 7 },     // Humidity
    65: { rows: [94], resultCol: 7 },     // Curing Time
    
    // Stage 25: Buffing (Sr 66)
    66: { rows: [95], resultCol: 7 },     // Corner Edge/Belt condition
    
    // Stage 26: Cleaning (Sr 67)
    67: { 
      rows: [96, 97, 98, 99, 100], 
      resultCol: 7,
      subFields: { 'S1': 7, 'S2': 8, 'S3': 9, 'S4': 10, 'S5': 11 }
    }, // Module free from residue
    
    // Stage 27: Flash Tester (Sr 68-72)
    68: { rows: [101], resultCol: 7 },    // Ambient Temp
    69: { rows: [102], resultCol: 7 },    // Module Temp
    70: { rows: [103], resultCol: 7 },    // Sunsimulator Cal
    71: { rows: [104], resultCol: 7 },    // Validation
    72: { rows: [105], resultCol: 7 },    // Silver Ref EL
    
    // Stage 28: Hipot Test (Sr 73)
    73: { 
      rows: [106, 107, 108, 109, 110, 111], 
      resultCol: 7,
      subFields: { 
        'Sample 1': 7, 'Sample 2': 8, 'Sample 3': 9, 'Sample 4': 10, 'Sample 5': 11 
      }
    }, // DCW/IR/Ground
    
    // Stage 29: Post EL (Sr 74-75)
    74: { rows: [112], resultCol: 7 },    // Voltage & Current
    75: { 
      rows: [113, 114, 115, 116, 117], 
      resultCol: 7,
      subFields: { 'S1': 7, 'S2': 8, 'S3': 9 }
    }, // EL & Visual
    
    // Stage 30: RFID (Sr 76-77)
    76: { rows: [118], resultCol: 7 },    // RFID Position
    77: { rows: [119], resultCol: 7 },    // Cell & Module Make
    
    // Stage 31: Final Visual (Sr 78-79)
    78: { 
      rows: [120, 121, 122, 123, 124], 
      resultCol: 7,
      subFields: { 'S1': 7, 'S2': 8, 'S3': 9, 'S4': 10, 'S5': 11 }
    }, // Visual Inspection
    79: { 
      rows: [125, 126, 127, 128, 129], 
      resultCol: 7,
      subFields: { 'S1': 7, 'S2': 8, 'S3': 9, 'S4': 10, 'S5': 11 }
    }, // Backlabel
    
    // Stage 32: Dimension (Sr 80-84)
    80: { rows: [130], resultCol: 7 },    // L*W & Profile
    81: { rows: [131], resultCol: 7 },    // Mounting Hole
    82: { rows: [132], resultCol: 7 },    // Diagonal Diff
    83: { rows: [133], resultCol: 7 },    // Corner Gap
    84: { rows: [134], resultCol: 7 },    // JB Cable length
    
    // Stage 33: Packaging (Sr 85-88)
    85: { rows: [135], resultCol: 7 },    // Packaging Label
    86: { rows: [136], resultCol: 7 },    // Content in Box
    87: { rows: [137], resultCol: 7 },    // Box Condition
    88: { rows: [138], resultCol: 7 }     // Pallet dimension
  }
};

/**
 * Fill IPQC Excel with form data
 * @param {ArrayBuffer} excelBuffer - Original Excel file as ArrayBuffer
 * @param {Object} formData - Form data from IPQC form
 * @param {Object} options - Options like handwriting style
 * @returns {ArrayBuffer} - Modified Excel file
 */
export function fillIPQCExcel(excelBuffer, formData, options = {}) {
  // Read the workbook
  const workbook = XLSX.read(excelBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  
  // Fill header data
  const headerMapping = IPQC_EXCEL_MAPPING.header;
  
  if (formData.date) {
    const dateCell = XLSX.utils.encode_cell({ r: headerMapping.date.row, c: headerMapping.date.col });
    sheet[dateCell] = { t: 's', v: `Date :- ${formData.date}` };
  }
  
  if (formData.time) {
    const timeCell = XLSX.utils.encode_cell({ r: headerMapping.time.row, c: headerMapping.time.col });
    sheet[timeCell] = { t: 's', v: ` Time :- ${formData.time}` };
  }
  
  if (formData.shift) {
    const shiftCell = XLSX.utils.encode_cell({ r: headerMapping.shift.row, c: headerMapping.shift.col + 1 });
    sheet[shiftCell] = { t: 's', v: formData.shift };
  }
  
  if (formData.poNo) {
    const poCell = XLSX.utils.encode_cell({ r: headerMapping.poNo.row, c: headerMapping.poNo.col + 1 });
    sheet[poCell] = { t: 's', v: formData.poNo };
  }
  
  // Fill checkpoints
  formData.checkpoints.forEach((checkpoint, index) => {
    const srNo = checkpoint.sr;
    const mapping = IPQC_EXCEL_MAPPING.checkpoints[srNo];
    
    if (!mapping) return;
    
    const subResults = checkpoint.subResults || {};
    
    // Check if it has sub-fields
    if (mapping.subFields && Object.keys(subResults).length > 0) {
      // Fill sub-fields
      Object.keys(mapping.subFields).forEach(subKey => {
        const value = subResults[subKey];
        if (value) {
          const col = mapping.subFields[subKey];
          const row = mapping.rows[0]; // Use first row for sub-fields
          const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
          sheet[cellAddress] = { t: 's', v: value };
        }
      });
    } else if (subResults.result) {
      // Single result field
      const cellAddress = XLSX.utils.encode_cell({ r: mapping.rows[0], c: mapping.resultCol });
      sheet[cellAddress] = { t: 's', v: subResults.result };
    }
  });
  
  // Generate the output
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
}

/**
 * Download filled Excel file
 * @param {ArrayBuffer} excelBuffer - Filled Excel as ArrayBuffer
 * @param {string} filename - Output filename
 */
export function downloadExcel(excelBuffer, filename = 'IPQC_Filled.xlsx') {
  const blob = new Blob([excelBuffer], { 
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Load the original IPQC Excel template
 * @returns {Promise<ArrayBuffer>} - Excel file as ArrayBuffer
 */
export async function loadIPQCTemplate() {
  // Fetch from public folder or server
  const response = await fetch('/IPQC Check Sheet.xlsx');
  if (!response.ok) {
    throw new Error('Failed to load IPQC template');
  }
  return await response.arrayBuffer();
}

export default {
  fillIPQCExcel,
  downloadExcel,
  loadIPQCTemplate,
  IPQC_EXCEL_MAPPING
};
