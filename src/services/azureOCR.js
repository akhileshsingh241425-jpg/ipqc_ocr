// Azure Computer Vision Configuration
const key = process.env.REACT_APP_AZURE_CV_KEY;
const endpoint = process.env.REACT_APP_AZURE_CV_ENDPOINT;

// Use proxy for local development to bypass CORS
const useProxy = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const proxyEndpoint = useProxy ? '/proxy-azure-ocr' : endpoint;

/**
 * Compress image if larger than 4MB
 * @param {string} imageDataUrl - Base64 data URL
 * @returns {Promise<string>} - Compressed base64 data URL
 */
const compressImage = async (imageDataUrl) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Calculate new dimensions (max 2000px width/height)
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
        
        // Compress to JPEG with 0.8 quality
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
        console.log('Image compressed from', imageDataUrl.length, 'to', compressedDataUrl.length, 'bytes');
        resolve(compressedDataUrl);
      } catch (err) {
        reject(new Error('Image compression failed: ' + err.message));
      }
    };
    img.onerror = (err) => {
      reject(new Error('Failed to load image for compression. Please use JPG, PNG, or JPEG format.'));
    };
    img.src = imageDataUrl;
  });
};

/**
 * Extract text from image using Azure Computer Vision OCR (REST API)
 * @param {string} imageDataUrl - Base64 data URL of the image
 * @returns {Promise<string>} - Extracted text from the image
 */
export const extractTextFromImage = async (imageDataUrl) => {
  try {
    console.log('Starting OCR analysis...');
    console.log('Azure Key loaded:', key ? 'Yes (length: ' + key.length + ')' : 'NO - KEY MISSING!');
    console.log('Azure Endpoint:', endpoint || 'MISSING!');
    console.log('Using Proxy:', useProxy ? 'YES (localhost)' : 'NO (direct)');

    // Check if file is PDF (not supported by compression)
    const isPDF = imageDataUrl.startsWith('data:application/pdf');
    
    // Check image size and compress if needed (Azure limit: 4MB)
    let processedDataUrl = imageDataUrl;
    const base64Size = (imageDataUrl.length * 3) / 4; // Approximate size in bytes
    
    if (base64Size > 4 * 1024 * 1024) {
      if (isPDF) {
        throw new Error('PDF file is too large (>4MB). Please upload images instead or split the PDF into smaller pages.');
      }
      console.log('Image too large, compressing...');
      processedDataUrl = await compressImage(imageDataUrl);
    }

    // Convert base64 data URL to binary
    const base64Data = processedDataUrl.split(',')[1];
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Step 1: Submit the image for OCR analysis with retry logic for rate limiting
    const analyzeUrl = `${proxyEndpoint}/vision/v3.2/read/analyze`;
    console.log('OCR API URL:', analyzeUrl);
    
    let analyzeResponse;
    let retryAttempts = 0;
    const maxRetries = 3;
    
    while (retryAttempts <= maxRetries) {
      analyzeResponse = await fetch(analyzeUrl, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Type': 'application/octet-stream'
        },
        body: bytes
      });

      if (analyzeResponse.ok) {
        break; // Success, exit retry loop
      }
      
      // Check if it's a rate limit error (429)
      if (analyzeResponse.status === 429 && retryAttempts < maxRetries) {
        retryAttempts++;
        // Extract retry-after time from error or use default 20 seconds
        let waitTime = 20000;
        try {
          const errorJson = await analyzeResponse.clone().json();
          const message = errorJson?.error?.message || '';
          const match = message.match(/retry after (\d+) seconds/i);
          if (match) {
            waitTime = (parseInt(match[1]) + 2) * 1000; // Add 2 seconds buffer
          }
        } catch (e) {
          // Use default wait time
        }
        console.log(`⏳ Rate limited (429). Waiting ${waitTime/1000} seconds before retry ${retryAttempts}/${maxRetries}...`);
        await sleep(waitTime);
        continue;
      }
      
      // For non-429 errors, throw immediately
      const errorText = await analyzeResponse.text();
      throw new Error(`Azure API Error: ${analyzeResponse.status} - ${errorText}`);
    }

    if (!analyzeResponse.ok) {
      const errorText = await analyzeResponse.text();
      throw new Error(`Azure API Error: ${analyzeResponse.status} - ${errorText}`);
    }

    // Get the operation location from response headers
    const operationLocation = analyzeResponse.headers.get('Operation-Location');
    if (!operationLocation) {
      throw new Error('No Operation-Location header in response');
    }

    // Convert operation location to use proxy if needed
    let pollUrl = operationLocation;
    if (useProxy && operationLocation.includes('cognitiveservices.azure.com')) {
      pollUrl = operationLocation.replace(endpoint, proxyEndpoint);
    }
    console.log('Polling URL:', pollUrl);

    console.log('OCR analysis submitted, polling for results...');

    // Step 2: Poll for results
    let result;
    let attempts = 0;
    const maxAttempts = 30;

    while (attempts < maxAttempts) {
      await sleep(1000); // Wait 1 second between polls
      
      const resultResponse = await fetch(pollUrl, {
        method: 'GET',
        headers: {
          'Ocp-Apim-Subscription-Key': key
        }
      });

      if (!resultResponse.ok) {
        throw new Error(`Failed to get results: ${resultResponse.status}`);
      }

      result = await resultResponse.json();
      
      if (result.status === 'succeeded') {
        break;
      } else if (result.status === 'failed') {
        throw new Error('OCR analysis failed');
      }
      
      attempts++;
    }

    if (result.status !== 'succeeded') {
      throw new Error('OCR analysis timed out');
    }

    // Step 3: Extract text from results
    let extractedText = '';
    if (result.analyzeResult && result.analyzeResult.readResults) {
      for (const page of result.analyzeResult.readResults) {
        for (const line of page.lines) {
          extractedText += line.text + '\n';
        }
      }
    }

    console.log('OCR completed successfully');
    console.log('Extracted text:', extractedText);
    
    return extractedText;
  } catch (error) {
    console.error('Error in Azure OCR:', error);
    throw new Error(`OCR failed: ${error.message}`);
  }
};

/**
 * Parse extracted OCR text into structured IQC form data
 * @param {string} text - Raw text extracted from OCR
 * @returns {Object} - Structured form data
 */
export const parseIQCFormData = (text) => {
  // Initialize default structure
  const formData = {
    moduleInfo: {
      model: '',
      serialNo: '',
      batchNo: '',
      testDate: new Date().toISOString().split('T')[0],
    },
    materials: {},
    performanceTests: {
      solderingPeelTest: [],
    },
    sampleData: {
      visualInspection: [],
      electricalTests: [],
      dimensions: [],
    },
  };

  try {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line);

    // Parse module information
    for (const line of lines) {
      // Extract Serial Number
      if (line.match(/serial|s\.?n\.?|sn/i)) {
        const match = line.match(/[A-Z0-9]{8,}/);
        if (match) formData.moduleInfo.serialNo = match[0];
      }

      // Extract Batch Number
      if (line.match(/batch|lot/i)) {
        const match = line.match(/[A-Z0-9\-]{5,}/);
        if (match) formData.moduleInfo.batchNo = match[0];
      }

      // Extract Model
      if (line.match(/model|type/i)) {
        const match = line.match(/[A-Z0-9\-]{4,}/);
        if (match) formData.moduleInfo.model = match[0];
      }

      // Extract Date
      if (line.match(/date|dated/i)) {
        const dateMatch = line.match(/\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/);
        if (dateMatch) {
          formData.moduleInfo.testDate = convertToISODate(dateMatch[0]);
        }
      }

      // Parse Pass/Fail status
      if (line.match(/pass|fail|ok|ng/i)) {
        const status = line.match(/pass|ok/i) ? 'PASS' : 'FAIL';
        
        // Try to identify which material this is for
        const materialKeywords = {
          glass: /glass/i,
          eva: /eva/i,
          backsheet: /back\s*sheet|backsheet/i,
          junction_box: /junction|j\.?box/i,
          interconnect: /interconnect|ribbon/i,
          frame: /frame/i,
          diode: /diode/i,
          laminate: /laminate/i,
          cell: /cell/i,
          solder: /solder/i,
          tape: /tape/i,
          string: /string/i,
          assembly: /assembly/i,
          label: /label/i,
          packaging: /pack/i,
        };

        for (const [key, regex] of Object.entries(materialKeywords)) {
          if (line.match(regex)) {
            formData.materials[key] = { status, remarks: '' };
          }
        }
      }

      // Parse numerical test values
      const numberMatch = line.match(/(\d+\.?\d*)\s*(W|V|A|kg|mm|N|MPa)?/i);
      if (numberMatch) {
        const value = numberMatch[1];
        const unit = numberMatch[2] || '';
        
        // Add to performance tests if it looks like test data
        if (formData.performanceTests.solderingPeelTest.length < 8) {
          formData.performanceTests.solderingPeelTest.push({
            sample: `S${formData.performanceTests.solderingPeelTest.length + 1}`,
            testName: 'Extracted Test',
            value: value,
            unit: unit,
            remarks: ''
          });
        }
      }
    }

    // Fill in default materials if not detected
    const defaultMaterials = ['glass', 'eva', 'backsheet', 'junction_box', 'interconnect', 
                             'frame', 'diode', 'laminate', 'cell', 'solder', 'tape', 
                             'string', 'assembly', 'label', 'packaging', 'others'];
    
    for (const material of defaultMaterials) {
      if (!formData.materials[material]) {
        formData.materials[material] = { status: 'PASS', remarks: '' };
      }
    }

    // Fill sample data arrays with default 8 samples
    for (let i = 1; i <= 8; i++) {
      formData.sampleData.visualInspection.push({
        sample: `S${i}`,
        defect: 'None',
        remarks: ''
      });
      formData.sampleData.electricalTests.push({
        sample: `S${i}`,
        result: 'OK',
        value: '',
        unit: ''
      });
      formData.sampleData.dimensions.push({
        sample: `S${i}`,
        measurements: {}
      });
    }

    // Ensure we have 8 performance test entries
    while (formData.performanceTests.solderingPeelTest.length < 8) {
      formData.performanceTests.solderingPeelTest.push({
        sample: `S${formData.performanceTests.solderingPeelTest.length + 1}`,
        testName: 'Manual Entry',
        value: '',
        unit: '',
        remarks: ''
      });
    }

  } catch (error) {
    console.error('Error parsing OCR text:', error);
  }

  return formData;
};

/**
 * Convert various date formats to ISO date (YYYY-MM-DD)
 */
const convertToISODate = (dateString) => {
  try {
    const parts = dateString.split(/[-/]/);
    let year, month, day;

    if (parts[2].length === 4) {
      // DD-MM-YYYY or DD/MM/YYYY
      day = parts[0].padStart(2, '0');
      month = parts[1].padStart(2, '0');
      year = parts[2];
    } else {
      // MM-DD-YY or MM/DD/YY
      month = parts[0].padStart(2, '0');
      day = parts[1].padStart(2, '0');
      year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
    }

    return `${year}-${month}-${day}`;
  } catch (error) {
    return new Date().toISOString().split('T')[0];
  }
};

/**
 * Helper function to sleep/wait
 */
const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export default {
  extractTextFromImage,
  parseIQCFormData
};
