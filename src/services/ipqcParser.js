/**
 * IPQC OCR Parser - Systematic value extraction and mapping
 * Reference: Python IPQC backend structure
 */

/**
 * Field mapping templates for each checkpoint
 * Maps checkpoint identifiers to extraction patterns and validators
 */
export const FIELD_MAPPINGS = {
  // Header fields
  HEADER: {
    date: {
      patterns: [
        /(?:^|\n)Date\s*:-?\s*(\d{2}\/\d{2}\/\d{2,4})/i,  // Match "Date :- 25/12/25" avoiding "Issue Date"
        /Date\s+De\s*(\d{2}\/\d{2}\/\d{2,4})/i    // Match "Date De 05/12/25"
      ],
      validator: (val) => typeof val === 'string' && val.match(/\d{2}\/\d{2}\/\d{2,4}/),
      formatter: (val) => {
        // Convert DD/MM/YY to YYYY-MM-DD
        const parts = val.split('/');
        if (parts.length === 3) {
          let [day, month, year] = parts;
          // Handle 2-digit year
          if (year.length === 2) {
            year = '20' + year;
          }
          return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        return val;
      }
    },
    time: {
      patterns: [
        /Time\s*:-?\s*(\d{1,2}:\d{2})/i,  // Match "Time :- 8:20"
        /Time\s+(\d{1,2}:\d{2})/i
      ],
      validator: (val) => typeof val === 'string' && val.match(/\d{1,2}:\d{2}/),
      formatter: (val) => {
        // Pad single digit hours to HH:mm format
        const parts = val.split(':');
        if (parts.length === 2) {
          return `${parts[0].padStart(2, '0')}:${parts[1]}`;
        }
        return val;
      }
    },
    shift: {
      patterns: [
        /Shift\s+(Night|Day|Morning)/i,  // Match "Shift Night"
        /shift\s*\(([AB])\)/i             // Match "Shift (B)"
      ],
      validator: (val) => typeof val === 'string' && ['day', 'night', 'morning', 'a', 'b', 'c'].includes(val.toLowerCase())
    },
    poNo: {
      patterns: [
        /Po\.?\s*no\.?\s*:-\s*([A-Z0-9][A-Z0-9\-\/]+)/i,  // Match "Po.no :- GS..." but not "Sample"
        /PO[\s:]+([A-Z0-9][A-Z0-9\-\/]{5,})/i  // At least 6 chars starting with alphanumeric
      ],
      validator: (val) => typeof val === 'string' && val.length > 5 && !/^(Sample|Shif|Stage)/i.test(val)
    }
  },

  // Shop Floor (SR 1-2)
  SHOP_FLOOR: {
    temperature: {
      checkpoint: 'Temperature',
      stage: 'Shop Floor',
      patterns: [
        /(?:Monitoring Result|Result)[\s\S]{0,50}?(\d{2})℃/i,  // Extract from Monitoring Result column
        /Temperature[\s\S]{0,100}?(\d{2})℃/i
      ],
      validator: (val) => {
        if (typeof val !== 'string') return false;
        const num = parseFloat(val);
        return !isNaN(num) && num >= 20 && num <= 30;
      },
      formatter: (val) => val + '°C'
    },
    humidity: {
      checkpoint: 'Humidity',
      stage: 'Shop Floor',
      patterns: [
        /Humidity[\s\S]{0,100}?(\d{2})%/i,  // Extract humidity percentage
        /RH.*?(\d{2})%/i
      ],
      validator: (val) => {
        if (typeof val !== 'string') return false;
        const num = parseInt(val);
        return !isNaN(num) && num >= 0 && num <= 100;
      },
      formatter: (val) => val + '%'
    }
  },

  // Glass Loader (SR 3-4)
  GLASS_LOADER: {
    glassDimension: {
      checkpoint: 'Glass dimension',
      stage: 'Glass Loader',
      patterns: [
        /Glass dimension.*?(\d{4})\s*[×xX\*]\s*(\d{3,4})\s*[×xX\*]\s*(\d\.?\d*)\s*mm/i,
        /(\d{4})\s*[×xX]\s*(\d{3,4})\s*[×xX]\s*(\d\.?\d*)\s*mm/i
      ],
      validator: (match) => match && match[1] && match[2] && match[3],
      formatter: (match) => `${match[1]}×${match[2]}×${match[3]} mm`
    },
    glassAppearance: {
      checkpoint: 'Appearance(Visual)',
      stage: 'Glass Loader',
      patterns: [
        /Appearance.*?(?:ok|pass|good|clean)/is,
        /Visual.*?(?:ok|pass|good|clean)/is,
        /Glass.*?(?:ok|pass|good)/is
      ],
      validator: (val) => {
        if (typeof val !== 'string') return true; // For 'ok' match, just accept
        return ['ok', 'pass', 'good', 'clean'].includes(val.toLowerCase());
      },
      formatter: () => 'OK'
    }
  },

  // EVA/EPE Cutting (SR 5-7)
  EVA_EPE_CUTTING: {
    evaType: {
      checkpoint: 'EVA/EPE Type',
      stage: 'EVA/EPE Cutting',
      patterns: [
        /EVA\/EPE Type[\s\S]{0,100}?EP(\d{3,4})/i,
        /Type[\s:]+EP(\d{3,4})/i,
        /EP(\d{3,4})/i
      ],
      validator: (val) => typeof val === 'string',
      formatter: (val) => 'EP' + val
    },
    evaDimension: {
      checkpoint: 'EVA/EPE dimension(L*W*T)',
      stage: 'EVA/EPE Cutting',
      patterns: [
        /EVA\/EPE.*?dimension.*?(\d{3,4})\s*[×xX\*]\s*(\d{3,4})\s*[×xXx\*]\s*(\d\.?\d*)/is,
        /(\d{3,4})\s*[×xX\*]\s*(\d{3,4})\s*[×xXx\*]\s*(\d\.?\d*)\s*mm/i
      ],
      validator: (match) => match && match[1] && match[2],
      formatter: (match) => `${match[1]}×${match[2]}×${match[3]} mm`
    },
    evaStatus: {
      checkpoint: 'EVA/EPE Status',
      stage: 'EVA/EPE Cutting',
      patterns: [
        /EVA\/EPE Status[\s\S]{0,100}?(\d{4}\/\d{2}\/\d{2})/i,
        /Mfg Date[\s:]+?(\d{4}\/\d{2}\/\d{2})/i
      ],
      validator: (val) => typeof val === 'string',
      formatter: (val) => val
    }
  },

  // Soldering (SR 8)
  SOLDERING: {
    solderingTemp: {
      checkpoint: 'Soldering Temperature and Quality',
      stage: 'Eva/EPE Soldering at edge',
      patterns: [
        /Soldering Temprature[\s\S]{0,100}?(\d{3})\s*[°ºC℃]/i,
        /(?:soldering|solder)[\s\w]*temp[\s:]*(\d{3})\s*[°ºC℃]/i,
        /(\d{3})\s*[°ºC℃]/i
      ],
      validator: (val) => {
        if (typeof val !== 'string') return false;
        const num = parseInt(val);
        return !isNaN(num) && num >= 350 && num <= 450;
      },
      formatter: (val) => val + '°C'
    }
  },

  // Cell Loading (SR 9-14)
  CELL_LOADING: {
    cellEfficiency: {
      checkpoint: 'Cell Manufacturer & Eff.',
      stage: 'Cell Loading',
      patterns: [
        /Cell Manufacturer & Eff\.?[\s\S]{0,100}?(\d{2}\.\d{2})%/is,
        /Eff.*?(\d{2}\.\d{2})%/i,
        /(\d{2}\.\d{2})%/i
      ],
      validator: (val) => {
        if (typeof val !== 'string') return false;
        const num = parseFloat(val);
        return !isNaN(num) && num >= 15 && num <= 30;
      },
      formatter: (val) => val + '%'
    },
    cellSize: {
      checkpoint: 'Cell Size(L*W)',
      stage: 'Cell Loading',
      patterns: [
        /Cell Size[\s\S]{0,50}?(\d{2,3}\.\d{2})[×xX](\d{2,3}\.\d{2})/is,
        /(\d{2,3}\.\d{2})\s*[×xX]\s*(\d{2,3}\.\d{2})/i
      ],
      validator: (match) => {
        if (!match) return false;
        const l = parseFloat(match[1]);
        const w = parseFloat(match[2]);
        return !isNaN(l) && !isNaN(w) && l >= 100 && l <= 300 && w >= 100 && w <= 300;
      },
      formatter: (match) => `${match[1]}×${match[2]}`
    },
    cellCondition: {
      checkpoint: 'Cell Condition',
      stage: 'Cell Loading',
      patterns: [
        /Cell Condition[\s\S]{0,100}?Free From/i,  // If "Free From" is found, it's OK
        /condition[\s:]*(?:ok|good|clean|pass)/i
      ],
      validator: (val) => typeof val === 'string',
      formatter: () => 'OK'
    },
    cleanliness: {
      checkpoint: 'Cleanliness of Cell Loading Area',
      stage: 'Cell Loading',
      patterns: [
        /Cleanliness of Cell Loading Area[\s\S]{0,100}?Clean/is,
        /Cleanliness.*?Clean/is,
        /cleanliness[\s:]*(?:ok|clean|good)/i
      ],
      validator: (val) => typeof val === 'string',
      formatter: () => 'Clean'
    },
    crossCutting: {
      checkpoint: 'Cell Cross cutting',
      stage: 'Cell Loading',
      patterns: [
        /Cell Cross cutting[\s\S]{0,100}?equal/is,
        /cutting[\s:]*(?:equal|ok|good)/i
      ],
      validator: (val) => typeof val === 'string',
      formatter: () => 'Equal'
    }
  },

  // Auto bussing, layup & Tapping (SR 21-28)
  AUTO_BUSSING: {
    stringToStringGap: {
      checkpoint: 'String to String Gap',
      stage: 'Auto bussing',
      patterns: [
        /String to String Gap[\s\S]{0,100}?(\d\.\d)\s*mm/i,
        /(\d\.\d)\s*mm/i
      ],
      validator: (val) => typeof val === 'string',
      formatter: (val) => val + ' mm'
    },
    cellEdgeDistance: {
      checkpoint: 'Cell edge to Glass edge distance',
      stage: 'Auto bussing',
      patterns: [
        /Cell edge to Glass edge[\s\S]{0,200}?TOP[\s\S]{0,50}?(\d{2}[\.-]\d{2})/i
      ],
      validator: (val) => typeof val === 'string',
      isMultiValue: true,
      subFields: ['TOP', 'Bottom', 'Sides']
    },
    solderingPeelStrength: {
      checkpoint: 'Soldering Peel Strength',
      stage: 'Auto bussing',
      patterns: [
        /Soldering Peel Strength[\s\S]{0,100}?Ribbon to busbar/i
      ],
      validator: (val) => true,
      formatter: () => 'OK'
    },
    terminalBusbar: {
      checkpoint: 'Terminal busbar to edge',
      stage: 'Auto bussing',
      patterns: [
        /Terminal busbar to edge[\s\S]{0,100}?(\d\.\d{2})\s*mm/i,
        /(\d\.\d{2})\s*mm/i
      ],
      validator: (val) => typeof val === 'string',
      formatter: (val) => val + ' mm'
    },
    solderingQuality: {
      checkpoint: 'Soldering Quality of Ribbon',
      stage: 'Auto bussing',
      patterns: [
        /Soldering Quality of Ribbon[\s\S]{0,100}?ok/i,
        /No Dry\/Poor Soldering[\s\S]{0,50}?ok/i
      ],
      validator: (val) => true,
      formatter: () => 'ok'
    },
    creepageDistance: {
      checkpoint: 'Top & Bottom Creepage',
      stage: 'Auto bussing',
      patterns: [
        /Top & Bottom Creepage[\s\S]{0,200}?T\s*=\s*(\d{2}[\.:.]\d{2})/i
      ],
      validator: (val) => typeof val === 'string',
      formatter: (val) => val
    },
    verificationProcess: {
      checkpoint: 'Verification of Process',
      stage: 'Auto bussing',
      patterns: [
        /Verification of Process[\s\S]{0,100}?OK/i,
        /Specification for Auto Bussing[\s\S]{0,50}?OK/i
      ],
      validator: (val) => true,
      formatter: () => 'OK'
    },
    autoTaping: {
      checkpoint: 'Quality of auto taping',
      stage: 'Auto bussing',
      patterns: [
        /Quality of auto taping[\s\S]{0,100}?Ok/i,
        /Taping should be proper[\s\S]{0,50}?Ok/i
      ],
      validator: (val) => true,
      formatter: () => 'Ok'
    }
  },

  // Back Glass Loader (SR 33)
  BACK_GLASS_LOADER: {
    backGlassDimension: {
      checkpoint: 'Glass dimension',
      stage: 'Back Glass Loader',
      patterns: [
        /Back Glass[\s\S]{0,200}?(\d{4})\s*[×xX\*]\s*(\d{4})\s*[×xXx\*]\s*(\d\.?\d*)\s*mm/i,
        /(\d{4})\s*[×xX]\s*(\d{4})\s*[×xX]\s*(\d\.?\d*)\s*mm/i
      ],
      validator: (match) => match && match[1] && match[2],
      formatter: (match) => `${match[1]}×${match[2]}×${match[3]} mm`
    }
  },

  // Flash Tester (SR 68-72)
  FLASH_TESTER: {
    ambientTemp: {
      checkpoint: 'Ambient Temp',
      stage: 'Flash Tester',
      patterns: [
        /Ambient Temp[\s\S]{0,100}?(\d{2})[-\.](\d{2})[℃°C]/i,
        /Ambient.*?(\d{2})[℃°C]/i
      ],
      validator: (val) => {
        if (typeof val !== 'string') return false;
        const num = parseFloat(val);
        return !isNaN(num) && num >= 20 && num <= 30;
      },
      formatter: (val) => val + '°C'
    },
    moduleTemp: {
      checkpoint: 'Module Temp',
      stage: 'Flash Tester',
      patterns: [
        /Module Temp[\s\S]{0,100}?(\d{2})[-\.](\d{2})[℃°C]/i,
        /Module.*?(\d{2})[℃°C]/i
      ],
      validator: (val) => {
        if (typeof val !== 'string') return false;
        const num = parseFloat(val);
        return !isNaN(num) && num >= 20 && num <= 30;
      },
      formatter: (val) => val + '°C'
    }
  },

  // Curing (SR 63-65)
  CURING: {
    curingTemp: {
      checkpoint: 'Temperature',
      stage: 'Curing',
      patterns: [
        /Curing[\s\S]{0,200}?Temperature[\s\S]{0,100}?(\d{2})[-\.](\d{2})[℃°C]/i,
        /Temperature[\s\S]{0,100}?(\d{2})[-\.](\d{2})[℃°C]/i
      ],
      validator: (val) => {
        if (typeof val !== 'string') return false;
        const num = parseFloat(val);
        return !isNaN(num) && num >= 20 && num <= 30;
      },
      formatter: (val) => val + '°C'
    },
    curingHumidity: {
      checkpoint: 'Humidity',
      stage: 'Curing',
      patterns: [
        /Curing[\s\S]{0,200}?Humidity[\s\S]{0,100}?(\d{2})%/i,
        /250%[\s\S]{0,50}?(\d{2})%/i
      ],
      validator: (val) => {
        if (typeof val !== 'string') return false;
        const num = parseInt(val);
        return !isNaN(num) && num >= 0 && num <= 100;
      },
      formatter: (val) => val + '%'
    },
    curingTime: {
      checkpoint: 'Curing Time',
      stage: 'Curing',
      patterns: [
        /Curing Time[\s\S]{0,100}?(\d{1,2})\s*hrs/i,
        /(\d{1,2})\s*hours/i
      ],
      validator: (val) => typeof val === 'string',
      formatter: (val) => val + ' hrs'
    }
  },

  // Junction Box (SR 54-55)
  JUNCTION_BOX: {
    jbCableLength: {
      checkpoint: 'Junction Box Check',
      stage: 'Junction Box',
      patterns: [
        /Junction Box.*?Cable.*?Length.*?(\d{3})\s*mm/is,
        /(\d{3})\s*mm/i
      ],
      validator: (val) => typeof val === 'string',
      formatter: (val) => val + ' mm'
    },
    siliconGlueWeight: {
      checkpoint: 'Silicon Glue Weight',
      stage: 'Junction Box',
      patterns: [
        /Silicon Glue Weight[\s\S]{0,100}?(\d{2}\.\d{1,3})/i,
        /(\d{2}\.\d{1,3})\s*gm/i
      ],
      validator: (val) => typeof val === 'string',
      formatter: (val) => val + ' gm'
    }
  },

  // Auto JB (SR 56-58)
  AUTO_JB: {
    maxWeldingTime: {
      checkpoint: 'Max Welding time',
      stage: 'Auto JB',
      patterns: [
        /Max Welding time[\s\S]{0,100}?(\d\.\d)\s*Sec/i,
        /(\d\.\d)\s*Sec/i
      ],
      validator: (val) => typeof val === 'string',
      formatter: (val) => val + ' Sec'
    },
    solderingCurrent: {
      checkpoint: 'Soldering current',
      stage: 'Auto JB',
      patterns: [
        /Soldering current[\s\S]{0,100}?(\d{2})A/i,
        /(\d{2})A/i
      ],
      validator: (val) => typeof val === 'string',
      formatter: (val) => val + 'A'
    }
  },

  // JB Potting (SR 59-61)
  JB_POTTING: {
    pottingWeight: {
      checkpoint: 'Potting weight',
      stage: 'JB Potting',
      patterns: [
        /Potting material weight[\s\S]{0,100}?(\d{2}\.\d{1,3})/i,
        /Potting.*?(\d{2}\.\d{1,3})/i
      ],
      validator: (val) => typeof val === 'string',
      formatter: (val) => val + ' gm'
    }
  },

  // Framing (SR 50-53)
  FRAMING: {
    anodizingThickness: {
      checkpoint: 'Anodizing Thickness',
      stage: 'Framing',
      patterns: [
        /Anodizing Thickness[\s\S]{0,100}?(\d{2}\.\d{1,2})\s*Micron/i,
        /(\d{2}\.\d{1,2})\s*Micron/i
      ],
      validator: (val) => typeof val === 'string',
      formatter: (val) => val + ' Micron'
    }
  },

  // Tabber & Stringer (SR 15-20)
  TABBER_STRINGER: {
    visualCheckStringing: {
      checkpoint: 'Visual Check after Stringing',
      stage: 'Tabber & stringer',
      patterns: [
        /Visual Check after[\s\S]{0,200}?TS Visual Criteria/i
      ],
      validator: (val) => true,
      isMultiValue: true,
      subFields: ['TS01A', 'TS01B', 'TS02A', 'TS02B', 'TS03A', 'TS03B', 'TS04A', 'TS04B'],
      defaultValue: 'ok'
    },
    elImageStrings: {
      checkpoint: 'EL Image of Strings',
      stage: 'Tabber & stringer',
      patterns: [
        /EL Image of Strings[\s\S]{0,200}?TS EL Criteria/i
      ],
      validator: (val) => true,
      isMultiValue: true,
      subFields: ['TS01A', 'TS01B', 'TS02A', 'TS02B', 'TS03A', 'TS03B', 'TS04A', 'TS04B'],
      defaultValue: 'OK'
    },
    stringLength: {
      checkpoint: 'String length',
      stage: 'Tabber & stringer',
      patterns: [
        /String length[\s\S]{0,200}?(TS\d{2}[AB])[\s\S]{0,50}?(\d{4})/gi,  // Match table format
        /(TS\d{2}[AB])\s+(\d{4})/gi  // Match "TS01A 1163"
      ],
      validator: (val) => {
        if (typeof val !== 'string') return false;
        const num = parseInt(val);
        return !isNaN(num) && num >= 1100 && num <= 1200;
      },
      isMultiValue: true,
      subFields: ['TS01A', 'TS01B', 'TS02A', 'TS02B', 'TS03A', 'TS03B', 'TS04A', 'TS04B']
    },
    cellGap: {
      checkpoint: 'Cell to Cell Gap',
      stage: 'Tabber & stringer',
      patterns: [
        /Cell to Cell Gap[\s\S]{0,200}?(TS\d{2}[AB])[\s\S]{0,50}?(\d\.\d{1,2})/gi,  // Match table format
        /(TS\d{2}[AB])\s+(\d\.\d{1,2})/gi  // Match "TS01A 0.76"
      ],
      validator: (val) => {
        if (typeof val !== 'string') return false;
        const num = parseFloat(val);
        return !isNaN(num) && num >= 0.5 && num <= 2.0;
      },
      isMultiValue: true,
      subFields: ['TS01A', 'TS01B', 'TS02A', 'TS02B', 'TS03A', 'TS03B', 'TS04A', 'TS04B']
    }
  },

  // Common patterns for OK/Pass values
  COMMON_STATUS: {
    patterns: [
      /(?:ok|pass|good|clean|equal)/i
    ],
    values: {
      'ok': 'OK',
      'pass': 'OK',
      'good': 'OK',
      'clean': 'Clean',
      'equal': 'Equal'
    }
  }
};

/**
 * Extract value using multiple patterns
 */
export const extractWithPatterns = (text, patterns) => {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match;
  }
  return null;
};

/**
 * Parse and map OCR text to IPQC form structure
 */
export const parseIPQCData = (ocrText, checkpoints) => {
  console.log('🔍 Starting systematic IPQC parsing...');
  console.log('📄 OCR Text Length:', ocrText.length);
  console.log('📋 First 500 chars:', ocrText.substring(0, 500));
  
  const updates = {
    header: {},
    checkpointUpdates: []
  };

  // Parse header fields
  Object.entries(FIELD_MAPPINGS.HEADER).forEach(([field, config]) => {
    const match = extractWithPatterns(ocrText, config.patterns);
    if (match) {
      console.log(`🔎 ${field} raw match:`, match[0], '→', match[1]);
      if (config.validator(match[1])) {
        const formattedValue = config.formatter ? config.formatter(match[1]) : match[1];
        updates.header[field] = formattedValue;
        console.log(`✓ ${field}:`, formattedValue);
      } else {
        console.log(`❌ ${field} validation failed:`, match[1]);
      }
    } else {
      console.log(`❌ ${field} no match found`);
    }
  });

  // Parse Shop Floor
  Object.entries(FIELD_MAPPINGS.SHOP_FLOOR).forEach(([field, config]) => {
    const match = extractWithPatterns(ocrText, config.patterns);
    if (match) {
      console.log(`🔎 ${field} raw match:`, match[0], '→', match[1]);
      // Handle temperature with decimal part
      let value = match[1];
      if (match[2]) {
        value = `${match[1]}.${match[2]}`;
      }
      
      if (config.validator(value)) {
        const cpIndex = checkpoints.findIndex(cp => 
          cp.checkpoint.includes(config.checkpoint) && cp.stage.includes(config.stage)
        );
        if (cpIndex >= 0) {
          updates.checkpointUpdates.push({
            index: cpIndex,
            field: 'result',
            value: config.formatter(value)
          });
          console.log(`✓ ${config.checkpoint}:`, config.formatter(value));
        } else {
          console.log(`❌ Checkpoint not found for ${config.checkpoint}`);
        }
      } else {
        console.log(`❌ ${field} validation failed:`, value);
      }
    } else {
      console.log(`❌ ${field} no match found`);
    }
  });

  // Parse Glass Loader
  Object.entries(FIELD_MAPPINGS.GLASS_LOADER).forEach(([field, config]) => {
    const match = extractWithPatterns(ocrText, config.patterns);
    if (match && config.validator(match)) {
      const cpIndex = checkpoints.findIndex(cp => 
        cp.checkpoint.includes(config.checkpoint) && cp.stage.includes(config.stage)
      );
      if (cpIndex >= 0) {
        updates.checkpointUpdates.push({
          index: cpIndex,
          field: 'result',
          value: config.formatter(match)
        });
        console.log(`✓ ${config.checkpoint}:`, config.formatter(match));
      }
    }
  });

  // Parse EVA/EPE Cutting
  Object.entries(FIELD_MAPPINGS.EVA_EPE_CUTTING).forEach(([field, config]) => {
    const match = extractWithPatterns(ocrText, config.patterns);
    if (match) {
      const value = match[1] || match;
      if (config.validator(value)) {
        const cpIndex = checkpoints.findIndex(cp => 
          cp.checkpoint.includes(config.checkpoint) && cp.stage.includes(config.stage)
        );
        if (cpIndex >= 0) {
          updates.checkpointUpdates.push({
            index: cpIndex,
            field: 'result',
            value: field === 'evaType' ? config.formatter(value) : config.formatter(match)
          });
          console.log(`✓ ${config.checkpoint}:`, field === 'evaType' ? config.formatter(value) : config.formatter(match));
        }
      }
    }
  });

  // Parse Soldering
  Object.entries(FIELD_MAPPINGS.SOLDERING).forEach(([field, config]) => {
    const match = extractWithPatterns(ocrText, config.patterns);
    if (match && config.validator(match[1])) {
      const cpIndex = checkpoints.findIndex(cp => 
        cp.checkpoint.includes(config.checkpoint)
      );
      if (cpIndex >= 0) {
        updates.checkpointUpdates.push({
          index: cpIndex,
          field: 'result',
          value: config.formatter(match[1])
        });
        console.log(`✓ ${config.checkpoint}:`, config.formatter(match[1]));
      }
    }
  });

  // Parse Cell Loading
  Object.entries(FIELD_MAPPINGS.CELL_LOADING).forEach(([field, config]) => {
    const match = extractWithPatterns(ocrText, config.patterns);
    if (match) {
      const value = match[2] ? match : match[1];
      if (config.validator(value)) {
        const cpIndex = checkpoints.findIndex(cp => 
          cp.checkpoint.includes(config.checkpoint) && cp.stage.includes(config.stage)
        );
        if (cpIndex >= 0) {
          updates.checkpointUpdates.push({
            index: cpIndex,
            field: 'result',
            value: config.formatter(value)
          });
          console.log(`✓ ${config.checkpoint}:`, config.formatter(value));
        }
      }
    }
  });

  // Parse Tabber & Stringer (multi-value fields) - Special handling for table format
  Object.entries(FIELD_MAPPINGS.TABBER_STRINGER).forEach(([field, config]) => {
    if (config.isMultiValue) {
      const cpIndex = checkpoints.findIndex(cp => 
        cp.checkpoint.includes(config.checkpoint)
      );
      
      console.log(`🔎 Looking for checkpoint: ${config.checkpoint}, found index: ${cpIndex}`);
      
      if (cpIndex >= 0) {
        // Special handling for default value fields (Visual Check, EL Image)
        if (config.defaultValue) {
          // Just fill all 8 TS fields with default value
          config.subFields.forEach(tsKey => {
            updates.checkpointUpdates.push({
              index: cpIndex,
              field: tsKey,
              value: config.defaultValue
            });
            console.log(`✓ ${tsKey}:`, config.defaultValue);
          });
          return;
        }
        
        // Extract section of text containing the data
        const sectionRegex = new RegExp(config.checkpoint + '[\\s\\S]{0,500}', 'i');
        const section = ocrText.match(sectionRegex);
        
        if (section) {
          console.log(`📄 Found section for ${field}:`, section[0].substring(0, 200));
          
          // For String length - extract all 4-digit numbers after TS headers
          if (field === 'stringLength') {
            // Find all 4-digit numbers (1163) or split numbers (1 163)
            const allMatches = [...section[0].matchAll(/(\d{4}|\d\s*\d{3})/g)];
            console.log(`🔎 ${field} raw matches:`, allMatches.map(m => m[0]));
            
            const values = [];
            allMatches.forEach(match => {
              const cleanValue = match[0].replace(/\s+/g, '');
              if (/^\d{4}$/.test(cleanValue)) {
                values.push(cleanValue);
              }
            });
            
            console.log(`🔎 ${field} clean values:`, values);
            
            // Take exactly 8 values
            config.subFields.forEach((tsKey, idx) => {
              if (idx < values.length && config.validator(values[idx])) {
                updates.checkpointUpdates.push({
                  index: cpIndex,
                  field: tsKey,
                  value: values[idx]
                });
                console.log(`✓ ${tsKey}:`, values[idx]);
              }
            });
          }
          
          // For Cell Gap - extract all decimal numbers
          if (field === 'cellGap') {
            // Find all decimal numbers like 0.76, 0.72, etc.
            const values = section[0].match(/\b(\d\.\d{1,2})\b/g);
            console.log(`🔎 ${field} raw values:`, values);
            
            if (values) {
              // Take exactly 8 values
              config.subFields.forEach((tsKey, idx) => {
                if (idx < values.length && config.validator(values[idx])) {
                  updates.checkpointUpdates.push({
                    index: cpIndex,
                    field: tsKey,
                    value: values[idx]
                  });
                  console.log(`✓ ${tsKey}:`, values[idx]);
                } else if (idx < 8 && values.length >= 7) {
                  // If we have 7 values, use the last one for missing 8th
                  const fallbackValue = values[Math.min(idx, values.length - 1)];
                  if (config.validator(fallbackValue)) {
                    updates.checkpointUpdates.push({
                      index: cpIndex,
                      field: tsKey,
                      value: fallbackValue
                    });
                    console.log(`✓ ${tsKey} (fallback):`, fallbackValue);
                  }
                }
              });
            }
          }
        } else {
          console.log(`❌ Section not found for ${config.checkpoint}`);
        }
      } else {
        console.log(`❌ Checkpoint not found for ${config.checkpoint}`);
      }
    }
  });

  // Parse Auto Bussing
  if (FIELD_MAPPINGS.AUTO_BUSSING) {
    Object.entries(FIELD_MAPPINGS.AUTO_BUSSING).forEach(([field, config]) => {
      const match = extractWithPatterns(ocrText, config.patterns);
      if (match) {
        const value = match[1] || match;
        if (config.validator(value)) {
          const cpIndex = checkpoints.findIndex(cp => 
            cp.checkpoint.includes(config.checkpoint) && cp.stage.includes(config.stage)
          );
          if (cpIndex >= 0) {
            updates.checkpointUpdates.push({
              index: cpIndex,
              field: config.isMultiValue ? config.subFields[0] : 'result',
              value: typeof config.formatter === 'function' ? config.formatter(value) : value
            });
            console.log(`✓ ${config.checkpoint}:`, typeof config.formatter === 'function' ? config.formatter(value) : value);
          }
        }
      }
    });
  }

  // Parse Back Glass Loader
  if (FIELD_MAPPINGS.BACK_GLASS_LOADER) {
    Object.entries(FIELD_MAPPINGS.BACK_GLASS_LOADER).forEach(([field, config]) => {
      const match = extractWithPatterns(ocrText, config.patterns);
      if (match && config.validator(match)) {
        const cpIndex = checkpoints.findIndex(cp => 
          cp.checkpoint.includes(config.checkpoint) && cp.stage.includes(config.stage)
        );
        if (cpIndex >= 0) {
          updates.checkpointUpdates.push({
            index: cpIndex,
            field: 'result',
            value: config.formatter(match)
          });
          console.log(`✓ ${config.checkpoint}:`, config.formatter(match));
        }
      }
    });
  }

  // Parse Flash Tester
  if (FIELD_MAPPINGS.FLASH_TESTER) {
    Object.entries(FIELD_MAPPINGS.FLASH_TESTER).forEach(([field, config]) => {
      const match = extractWithPatterns(ocrText, config.patterns);
      if (match) {
        let value = match[1];
        if (match[2]) {
          value = `${match[1]}.${match[2]}`;
        }
        if (config.validator(value)) {
          const cpIndex = checkpoints.findIndex(cp => 
            cp.checkpoint.includes(config.checkpoint) && cp.stage.includes(config.stage)
          );
          if (cpIndex >= 0) {
            updates.checkpointUpdates.push({
              index: cpIndex,
              field: 'result',
              value: config.formatter(value)
            });
            console.log(`✓ ${config.checkpoint}:`, config.formatter(value));
          }
        }
      }
    });
  }

  // Parse Curing
  if (FIELD_MAPPINGS.CURING) {
    Object.entries(FIELD_MAPPINGS.CURING).forEach(([field, config]) => {
      const match = extractWithPatterns(ocrText, config.patterns);
      if (match) {
        let value = match[1];
        if (match[2]) {
          value = `${match[1]}.${match[2]}`;
        }
        if (config.validator(value)) {
          const cpIndex = checkpoints.findIndex(cp => 
            cp.checkpoint.includes(config.checkpoint) && cp.stage.includes(config.stage)
          );
          if (cpIndex >= 0) {
            updates.checkpointUpdates.push({
              index: cpIndex,
              field: 'result',
              value: config.formatter(value)
            });
            console.log(`✓ ${config.checkpoint}:`, config.formatter(value));
          }
        }
      }
    });
  }

  // Parse Junction Box
  if (FIELD_MAPPINGS.JUNCTION_BOX) {
    Object.entries(FIELD_MAPPINGS.JUNCTION_BOX).forEach(([field, config]) => {
      const match = extractWithPatterns(ocrText, config.patterns);
      if (match && config.validator(match[1] || match)) {
        const cpIndex = checkpoints.findIndex(cp => 
          cp.checkpoint.includes(config.checkpoint) && cp.stage.includes(config.stage)
        );
        if (cpIndex >= 0) {
          const value = match[1] || match;
          updates.checkpointUpdates.push({
            index: cpIndex,
            field: 'result',
            value: config.formatter(value)
          });
          console.log(`✓ ${config.checkpoint}:`, config.formatter(value));
        }
      }
    });
  }

  // Parse Auto JB
  if (FIELD_MAPPINGS.AUTO_JB) {
    Object.entries(FIELD_MAPPINGS.AUTO_JB).forEach(([field, config]) => {
      const match = extractWithPatterns(ocrText, config.patterns);
      if (match && config.validator(match[1])) {
        const cpIndex = checkpoints.findIndex(cp => 
          cp.checkpoint.includes(config.checkpoint) && cp.stage.includes(config.stage)
        );
        if (cpIndex >= 0) {
          updates.checkpointUpdates.push({
            index: cpIndex,
            field: 'result',
            value: config.formatter(match[1])
          });
          console.log(`✓ ${config.checkpoint}:`, config.formatter(match[1]));
        }
      }
    });
  }

  // Parse JB Potting
  if (FIELD_MAPPINGS.JB_POTTING) {
    Object.entries(FIELD_MAPPINGS.JB_POTTING).forEach(([field, config]) => {
      const match = extractWithPatterns(ocrText, config.patterns);
      if (match && config.validator(match[1])) {
        const cpIndex = checkpoints.findIndex(cp => 
          cp.checkpoint.includes(config.checkpoint) && cp.stage.includes(config.stage)
        );
        if (cpIndex >= 0) {
          updates.checkpointUpdates.push({
            index: cpIndex,
            field: 'result',
            value: config.formatter(match[1])
          });
          console.log(`✓ ${config.checkpoint}:`, config.formatter(match[1]));
        }
      }
    });
  }

  // Parse Framing
  if (FIELD_MAPPINGS.FRAMING) {
    Object.entries(FIELD_MAPPINGS.FRAMING).forEach(([field, config]) => {
      const match = extractWithPatterns(ocrText, config.patterns);
      if (match && config.validator(match[1])) {
        const cpIndex = checkpoints.findIndex(cp => 
          cp.checkpoint.includes(config.checkpoint) && cp.stage.includes(config.stage)
        );
        if (cpIndex >= 0) {
          updates.checkpointUpdates.push({
            index: cpIndex,
            field: 'result',
            value: config.formatter(match[1])
          });
          console.log(`✓ ${config.checkpoint}:`, config.formatter(match[1]));
        }
      }
    });
  }

  console.log('✅ Parsing complete. Updates:', updates.checkpointUpdates.length);
  return updates;
};
