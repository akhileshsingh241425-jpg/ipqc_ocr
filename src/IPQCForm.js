import React, { useState, useRef, useEffect } from 'react';
import html2pdf from 'html2pdf.js';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { extractTextFromImage } from './services/azureOCR';
import { parseIPQCComplete } from './services/smartIPQCParser';
import { parsePreLaminationComplete, parseIPQCAllStages, parsePage1, parsePage2, parsePage3, parsePage4, parsePage5, parsePage6, parsePage7 } from './services/ipqcStageParser';
import { parseWithLLM, parseWithKeywordMatching } from './services/llmParser';
import { exportIPQCToExcel } from './services/excelLLMMapper';
import './IPQCForm.css';

// API Base URL - Always use local backend server (proxies to maintenance.umanerp.com)
// This avoids CORS issues in both development and production
const API_BASE_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:8080'  // Local development
  : `http://${window.location.hostname}:8080`;  // Production (same server)

console.log('🌐 API_BASE_URL:', API_BASE_URL);
  
// Proxy URL for PDF files (to bypass CORS in development)
const PDF_PROXY_URL = '/proxy-pdf';

// LLM Parser Settings  
const USE_LLM_PARSER = true; // Enabled with Deepinfra (FREE, generous limits, reliable!)
const GROQ_API_KEY = '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'; // Groq API key

// Utility function for delays
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const IPQCForm = () => {
  const fileInputRef = useRef(null);
  const formContainerRef = useRef(null);
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [ocrProgress, setOcrProgress] = useState({ current: 0, total: 0 });
  
  // API Integration State
  const [availableChecklists, setAvailableChecklists] = useState([]);
  const [selectedChecklist, setSelectedChecklist] = useState(null);
  const [isLoadingChecklists, setIsLoadingChecklists] = useState(false);
  const [isLoadingFromAPI, setIsLoadingFromAPI] = useState(false);
  const [apiError, setApiError] = useState('');
  const [loadedPdfUrls, setLoadedPdfUrls] = useState([]); // Store PDF URLs for download
  const [autoFilledFields, setAutoFilledFields] = useState(new Set()); // Track auto-filled default values
  const [ocrReport, setOcrReport] = useState([]); // Track OCR missing/doubtful fields report
  const [showOcrReport, setShowOcrReport] = useState(false); // Toggle OCR report visibility
  const [debugData, setDebugData] = useState([]); // Store all parsed data for debug view
  const [useLLMParser, setUseLLMParser] = useState(USE_LLM_PARSER); // Toggle LLM parser
  const [showDebug, setShowDebug] = useState(false); // Toggle debug panel
  const [selectedDebugPage, setSelectedDebugPage] = useState(1); // Selected page for single-page debug
  const [singlePageProcessing, setSinglePageProcessing] = useState(false); // Processing single page flag
  
  // PDF Preview State
  const [pdfPreviews, setPdfPreviews] = useState([]); // Store all 7 page previews as images
  const [showPdfPreview, setShowPdfPreview] = useState(false); // Toggle PDF preview panel
  const [isLoadingPreviews, setIsLoadingPreviews] = useState(false); // Loading state for previews
  const [selectedPreviewPage, setSelectedPreviewPage] = useState(null); // Selected page for single processing
  const [useHalfPageMode, setUseHalfPageMode] = useState(false); // Full page OCR (default OFF)
  const [zoomedPage, setZoomedPage] = useState(null); // Zoomed page for modal view
  const [processedPages, setProcessedPages] = useState(new Set()); // Track which pages have been processed to prevent duplicates
  
  // Checklist Table Filter States
  const [filterLine, setFilterLine] = useState(''); // Filter by Line
  const [filterShift, setFilterShift] = useState(''); // Filter by Shift (Day/Night)
  const [filterDate, setFilterDate] = useState(''); // Filter by Date
  const [showChecklistTable, setShowChecklistTable] = useState(true); // Toggle table visibility
  const [showFilledForm, setShowFilledForm] = useState(false); // Show/hide filled IPQC form
  const [formViewMode, setFormViewMode] = useState(false); // Full screen form view mode (split with PDF)
  const [activePdfPage, setActivePdfPage] = useState(1); // Currently viewed PDF page in split view
  const [useHandwritingFont, setUseHandwritingFont] = useState(true); // Toggle handwriting style font
  const [selectedFont, setSelectedFont] = useState('Caveat'); // Selected handwriting font
  
  // ========== OCR PROCESSED & SAVED PDFs TRACKING ==========
  const [processedChecklists, setProcessedChecklists] = useState(() => {
    // Load from localStorage on init
    const saved = localStorage.getItem('ipqc_processed_checklists');
    return saved ? JSON.parse(saved) : {};
  }); // Track which checklists have been OCR processed: { checklistId: { processed: true, saved: false, savedAt: null, editedData: null } }
  const [isSaving, setIsSaving] = useState(false); // Saving state
  const [editMode, setEditMode] = useState(false); // Edit mode toggle
  
  const [formData, setFormData] = useState({
    date: '',
    time: '',
    shift: '',
    poNo: '',
    checkpoints: [
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
    ]
  });

  // ========== API INTEGRATION FUNCTIONS ==========
  
  // Fetch available checklists from API
  const fetchAvailableChecklists = async () => {
    setIsLoadingChecklists(true);
    setApiError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/peelTest/getuploadCheckListPdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });
      if (!response.ok) throw new Error('Failed to fetch checklists');
      const data = await response.json();
      
      console.log('📋 API Response:', data);
      
      // Handle different response structures
      let checklistArray = [];
      if (Array.isArray(data)) {
        checklistArray = data;
      } else if (data && Array.isArray(data.data)) {
        checklistArray = data.data;
      } else if (data && Array.isArray(data.result)) {
        checklistArray = data.result;
      } else if (data && Array.isArray(data.checklists)) {
        checklistArray = data.checklists;
      } else if (data && typeof data === 'object') {
        // If it's a single object, wrap in array
        checklistArray = [data];
      }
      
      // Filter only IPQC checklists and sort by date
      const ipqcChecklists = checklistArray
        .filter(item => item && item.Type === 'ipqcChecklist')
        .sort((a, b) => new Date(b.date) - new Date(a.date));
      
      setAvailableChecklists(ipqcChecklists);
      console.log('📋 Available IPQC Checklists:', ipqcChecklists.length);
    } catch (error) {
      console.error('Error fetching checklists:', error);
      setApiError('Failed to load checklists: ' + error.message);
    } finally {
      setIsLoadingChecklists(false);
    }
  };

  // Load checklist PDFs and process via OCR
  const loadChecklistFromAPI = async (checklist) => {
    if (!checklist) return;
    
    setIsLoadingFromAPI(true);
    setApiError('');
    setSelectedChecklist(checklist);
    setOcrReport([]); // Reset OCR report
    setShowOcrReport(false);
    setDebugData([]); // Reset debug data
    setShowDebug(false);
    setProcessedPages(new Set()); // Reset processed pages tracker to prevent duplicates
    
    try {
      // Log the full checklist object to see its structure
      console.log('📋 Full checklist object:', JSON.stringify(checklist, null, 2));
      
      // Get all 7 PDF page URLs
      const pdfPages = [
        checklist.Page1PdfFile,
        checklist.Page2PdfFile,
        checklist.Page3PdfFile,
        checklist.Page4PdfFile,
        checklist.Page5PdfFile,
        checklist.Page6PdfFile,
        checklist.Page7PdfFile
      ].filter(Boolean);
      
      // Remove duplicate PDF URLs to prevent processing same page twice
      const uniquePdfPages = [...new Set(pdfPages)];
      if (uniquePdfPages.length !== pdfPages.length) {
        console.log(`⚠️ WARNING: Found ${pdfPages.length - uniquePdfPages.length} duplicate PDF pages! Removing duplicates...`);
      }

      console.log('📄 Loading', uniquePdfPages.length, 'unique PDF pages from API...');
      console.log('📄 PDF URLs:', uniquePdfPages);
      setOcrProgress({ current: 0, total: uniquePdfPages.length });

      // Store PDF URLs for download - use actual server URLs
      const actualPdfUrls = uniquePdfPages.map(filePath => `https://maintenance.umanerp.com/api/${filePath}`);
      setLoadedPdfUrls(actualPdfUrls);
      console.log('📥 Download URLs saved:', actualPdfUrls);

      // Process each PDF page ONE BY ONE and update form after each
      let successCount = 0;
      const processedPageSet = new Set(); // Local tracker for this session
      
      // Helper function to add delay between API calls to avoid rate limiting
      const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
      
      for (let i = 0; i < uniquePdfPages.length; i++) {
        setOcrProgress({ current: i + 1, total: uniquePdfPages.length });
        
        // Add delay between OCR calls to avoid Azure rate limiting (429 errors)
        // Azure F0 tier allows ~20 calls per minute, so 20 second delay is safe
        if (i > 0) {
          console.log(`   ⏳ Waiting 20 seconds to avoid API rate limit...`);
          await delay(20000);
        }
        
        const filePath = uniquePdfPages[i];
        
        // Check if this page was already processed (duplicate prevention)
        if (processedPageSet.has(filePath)) {
          console.log(`⚠️ SKIPPING PAGE ${i + 1} - Already processed (duplicate)`);
          continue;
        }
        
        console.log(`\n════════════════════════════════════════`);
        console.log(`📖 PROCESSING PAGE ${i + 1} OF ${uniquePdfPages.length}`);
        console.log(`🆔 Page ID: ${filePath}`);
        processedPageSet.add(filePath); // Mark as processed
        console.log(`   File: ${filePath}`);
        console.log(`════════════════════════════════════════`);
        console.log(`   ✂️ Half Page Mode: ${useHalfPageMode ? 'ON' : 'OFF'}`);
        
        try {
          // Step 1: Download PDF and convert to image (with optional crop)
          const pdfUrl = `${PDF_PROXY_URL}/api/${filePath}`;
          console.log(`   📥 Downloading: ${pdfUrl}`);
          
          const imageBlob = await convertPdfToImage(pdfUrl, useHalfPageMode);
          
          if (!imageBlob) {
            console.error(`   ❌ Failed to download PDF for page ${i + 1}`);
            continue;
          }
          console.log(`   ✅ PDF downloaded ${useHalfPageMode ? '(RIGHT HALF)' : '(FULL)'}`);
          
          // Step 2: OCR - Extract text from this page
          const base64 = await blobToBase64(imageBlob);
          const pageText = await extractTextFromImage(base64);
          console.log(`   ✅ OCR complete for Page ${i + 1}`);
          console.log(`   📝 Text length: ${pageText.length} characters`);
          
          // Step 3: Log OCR text for this page
          console.log(`\n--- PAGE ${i + 1} OCR TEXT ---`);
          console.log(pageText);
          console.log(`--- END PAGE ${i + 1} ---\n`);
          
          // Step 4: Parse THIS PAGE's text and update form
          // Pass page number so parser knows which stages to expect
          await parseAndUpdateFormByPage(pageText, i + 1);
          console.log(`   ✅ Form updated with Page ${i + 1} data`);
          
          successCount++;
          
        } catch (pageError) {
          console.error(`   ❌ Error processing page ${i + 1}:`, pageError.message);
          // Continue with next page
        }
      }
      
      // Update processed pages state
      setProcessedPages(processedPageSet);

      // Update form metadata from checklist
      setFormData(prev => ({
        ...prev,
        date: checklist.date ? new Date(checklist.date).toISOString().split('T')[0] : prev.date,
        shift: checklist.Shift || prev.shift,
        poNo: checklist.Line || prev.poNo
      }));
      
      if (successCount > 0) {
        // Load PDF previews for split view
        await loadPdfPreviews(checklist);
        
        // Mark this checklist as OCR processed
        const checklistId = checklist._id || checklist.id || `${checklist.date}_${checklist.Line}_${checklist.Shift}`;
        const updatedProcessed = {
          ...processedChecklists,
          [checklistId]: {
            processed: true,
            saved: false,
            processedAt: new Date().toISOString(),
            savedAt: null,
            checklistInfo: {
              date: checklist.date,
              line: checklist.Line,
              shift: checklist.Shift
            }
          }
        };
        setProcessedChecklists(updatedProcessed);
        localStorage.setItem('ipqc_processed_checklists', JSON.stringify(updatedProcessed));
        setEditMode(true); // Enable edit mode after OCR
        
        // Show OCR report and open form view mode
        setShowOcrReport(true);
        setFormViewMode(true); // Open split view mode with form and PDF side by side
        
        const duplicatesRemoved = pdfPages.length - uniquePdfPages.length;
        const duplicateMsg = duplicatesRemoved > 0 ? `\n\n⚠️ ${duplicatesRemoved} duplicate pages removed automatically!` : '';
        console.log(`✅ Successfully processed ${successCount}/${uniquePdfPages.length} unique pages!`);
      } else {
        throw new Error('Could not process any PDF pages');
      }
      
    } catch (error) {
      console.error('Error loading checklist from API:', error);
      setApiError('Failed to process checklist: ' + error.message);
    } finally {
      setIsLoadingFromAPI(false);
      setOcrProgress({ current: 0, total: 0 });
    }
  };

  // ========== PDF PREVIEW - LOAD ALL PAGES AS IMAGES ==========
  // Load all 7 PDF pages as image previews for visual verification
  const loadPdfPreviews = async (checklist) => {
    if (!checklist) return;
    
    setIsLoadingPreviews(true);
    setPdfPreviews([]);
    setShowPdfPreview(true);
    setSelectedChecklist(checklist);
    
    try {
      // Get all 7 PDF page URLs
      const pdfPages = [
        checklist.Page1PdfFile,
        checklist.Page2PdfFile,
        checklist.Page3PdfFile,
        checklist.Page4PdfFile,
        checklist.Page5PdfFile,
        checklist.Page6PdfFile,
        checklist.Page7PdfFile
      ].filter(Boolean);

      console.log('📄 Loading PDF previews for', pdfPages.length, 'pages...');
      
      const previews = [];
      
      for (let i = 0; i < pdfPages.length; i++) {
        const filePath = pdfPages[i];
        console.log(`📥 Loading preview for Page ${i + 1}: ${filePath}`);
        
        try {
          const pdfUrl = `${PDF_PROXY_URL}/api/${filePath}`;
          const imageBlob = await convertPdfToImage(pdfUrl);
          
          if (imageBlob) {
            const imageUrl = URL.createObjectURL(imageBlob);
            previews.push({
              pageNumber: i + 1,
              fileName: filePath.split('/').pop(),
              imageUrl: imageUrl,
              originalPath: filePath
            });
            console.log(`✅ Page ${i + 1} preview loaded`);
          } else {
            previews.push({
              pageNumber: i + 1,
              fileName: filePath.split('/').pop(),
              imageUrl: null,
              error: 'Failed to load'
            });
          }
        } catch (err) {
          console.error(`❌ Error loading page ${i + 1}:`, err.message);
          previews.push({
            pageNumber: i + 1,
            fileName: filePath.split('/').pop(),
            imageUrl: null,
            error: err.message
          });
        }
        
        // Update previews progressively
        setPdfPreviews([...previews]);
      }
      
      console.log('✅ All PDF previews loaded');
      
    } catch (error) {
      console.error('Error loading PDF previews:', error);
    } finally {
      setIsLoadingPreviews(false);
    }
  };

  // Process ONLY selected preview page
  const processPreviewPage = async (pageIndex) => {
    if (!selectedChecklist) {
      console.log('⚠️ Please select checklist first');
      return;
    }

    setSelectedPreviewPage(pageIndex);
    setSinglePageProcessing(true);
    setOcrReport([]);
    setDebugData([]);

    const pdfPages = [
      selectedChecklist.Page1PdfFile,
      selectedChecklist.Page2PdfFile,
      selectedChecklist.Page3PdfFile,
      selectedChecklist.Page4PdfFile,
      selectedChecklist.Page5PdfFile,
      selectedChecklist.Page6PdfFile,
      selectedChecklist.Page7PdfFile
    ].filter(Boolean);

    const filePath = pdfPages[pageIndex];
    const pageNumber = pageIndex + 1;
    
    console.log(`\n🔬════════════════════════════════════════════════`);
    console.log(`🔬 PROCESSING API PAGE ${pageNumber} (File: ${filePath})`);
    console.log(`🔬 Half Page Mode: ${useHalfPageMode ? 'ON (Right Half Only)' : 'OFF (Full Page)'}`);
    console.log(`🔬════════════════════════════════════════════════\n`);

    try {
      const pdfUrl = `${PDF_PROXY_URL}/api/${filePath}`;
      const imageBlob = await convertPdfToImage(pdfUrl, useHalfPageMode);
      
      if (!imageBlob) {
        throw new Error(`Failed to download PDF`);
      }
      
      const base64 = await blobToBase64(imageBlob);
      const pageText = await extractTextFromImage(base64);
      
      console.log(`\n╔════════════════════════════════════════════════╗`);
      console.log(`║ API PAGE ${pageNumber} - FULL OCR TEXT                 ║`);
      console.log(`╚════════════════════════════════════════════════╝`);
      console.log(pageText);
      console.log(`\n╔════════════════════════════════════════════════╗`);
      console.log(`║ END API PAGE ${pageNumber} OCR TEXT                    ║`);
      console.log(`╚════════════════════════════════════════════════╝\n`);
      
      // Store debug data
      setDebugData([{
        pageNumber: pageNumber,
        ocrText: pageText,
        fields: {},
        timestamp: new Date().toLocaleTimeString()
      }]);
      
      // Try LLM parsing
      if (useLLMParser && GROQ_API_KEY) {
        console.log('🤖 Trying LLM parser...');
        const llmData = await parseWithLLM(pageText, pageNumber);
        if (llmData && Object.keys(llmData).length > 0) {
          console.log(`✅ LLM extracted ${Object.keys(llmData).length} fields:`);
          console.log(JSON.stringify(llmData, null, 2));
          setDebugData(prev => prev.map(p => p.pageNumber === pageNumber ? {...p, fields: llmData} : p));
        }
      }
      
      setShowDebug(true);
      console.log(`✅ API Page ${pageNumber} processed`);
      
    } catch (error) {
      console.error(`❌ Error:`, error);
    } finally {
      setSinglePageProcessing(false);
      setSelectedPreviewPage(null);
    }
  };

  // ========== SINGLE PAGE DEBUG PROCESSING ==========
  // Process ONLY selected page for detailed debugging
  const processSelectedPageOnly = async () => {
    if (!selectedChecklist) {
      console.log('⚠️ Please load checklist from server first');
      return;
    }

    const pageNumber = selectedDebugPage;
    const pdfPages = [
      selectedChecklist.Page1PdfFile,
      selectedChecklist.Page2PdfFile,
      selectedChecklist.Page3PdfFile,
      selectedChecklist.Page4PdfFile,
      selectedChecklist.Page5PdfFile,
      selectedChecklist.Page6PdfFile,
      selectedChecklist.Page7PdfFile
    ].filter(Boolean);

    if (pageNumber > pdfPages.length) {
      console.log(`⚠️ Page ${pageNumber} not available. Total pages: ${pdfPages.length}`);
      return;
    }

    setSinglePageProcessing(true);
    setOcrReport([]); // Reset OCR report
    setDebugData([]); // Reset debug data

    const filePath = pdfPages[pageNumber - 1];
    console.log(`\n🔬════════════════════════════════════════════════`);
    console.log(`🔬 DEBUG: PROCESSING ONLY PAGE ${pageNumber}`);
    console.log(`🔬 File: ${filePath}`);
    console.log(`🔬 Half Page Mode: ${useHalfPageMode ? 'ON (Right Half Only)' : 'OFF (Full Page)'}`);
    console.log(`🔬════════════════════════════════════════════════\n`);

    try {
      // Step 1: Download PDF and convert to image (with optional crop)
      const pdfUrl = `${PDF_PROXY_URL}/api/${filePath}`;
      console.log(`📥 Downloading: ${pdfUrl}`);
      
      const imageBlob = await convertPdfToImage(pdfUrl, useHalfPageMode);
      
      if (!imageBlob) {
        throw new Error(`Failed to download PDF for page ${pageNumber}`);
      }
      console.log(`✅ PDF downloaded and converted to image ${useHalfPageMode ? '(RIGHT HALF)' : '(FULL)'}`);
      
      // Step 2: OCR - Extract text
      const base64 = await blobToBase64(imageBlob);
      const pageText = await extractTextFromImage(base64);
      console.log(`✅ OCR complete for Page ${pageNumber}`);
      console.log(`📝 Text length: ${pageText.length} characters`);
      
      // Step 3: Log OCR text FULLY
      console.log(`\n╔════════════════════════════════════════════════╗`);
      console.log(`║ PAGE ${pageNumber} FULL OCR TEXT ${useHalfPageMode ? '(HALF)' : '(FULL)'}             ║`);
      console.log(`╚════════════════════════════════════════════════╝`);
      console.log(pageText);
      console.log(`╔════════════════════════════════════════════════╗`);
      console.log(`║ END PAGE ${pageNumber} OCR TEXT                       ║`);
      console.log(`╚════════════════════════════════════════════════╝\n`);
      
      // Step 4: Parse with detailed logging
      await parseAndUpdateFormByPage(pageText, pageNumber);
      
      setShowDebug(true);
      setShowOcrReport(true);
      
      console.log(`✅ Page ${pageNumber} processed`);
      
    } catch (error) {
      console.error(`❌ Error processing page ${pageNumber}:`, error);
    } finally {
      setSinglePageProcessing(false);
    }
  };

  // Parse and update form for a SPECIFIC PAGE
  // This ensures each page's data goes to correct form fields
  const parseAndUpdateFormByPage = async (pageText, pageNumber) => {
    console.log(`\n🔍 Parsing Page ${pageNumber} data...`);
    
    // Use page-specific parser to avoid cross-page data mixing
    let data = {};
    
    // Try LLM parser first if enabled
    if (useLLMParser && GROQ_API_KEY) {
      try {
        // Add 4 second delay BEFORE EVERY LLM call (including Page 1) to avoid Groq rate limit
        // Groq free tier: 30 req/min = 2 seconds per request minimum
        // 4 seconds provides safe buffer for all pages (7 pages × 4s = 28s total)
        console.log(`⏳ Waiting 4 seconds before LLM call (rate limit protection)...`);
        await delay(4000);
        
        console.log('🤖 Using LLM parser...');
        const llmData = await parseWithLLM(pageText, pageNumber);
        if (llmData && Object.keys(llmData).length > 0) {
          data = llmData;
          console.log(`✅ LLM extracted ${Object.keys(data).length} fields`);
        }
      } catch (error) {
        console.log('⚠️ LLM parser failed, using regex fallback:', error.message);
      }
    }
    
    // If LLM didn't work or is disabled, use keyword matching
    if (Object.keys(data).length === 0) {
      // First try keyword matching (simpler, no API needed)
      const keywordData = parseWithKeywordMatching(pageText, pageNumber);
      
      // Then use regex parser
      let regexData = {};
      switch (pageNumber) {
        case 1:
          regexData = parsePage1(pageText);
          break;
        case 2:
          regexData = parsePage2(pageText);
          break;
        case 3:
          regexData = parsePage3(pageText);
          break;
        case 4:
          regexData = parsePage4(pageText);
          break;
        case 5:
          regexData = parsePage5(pageText);
          break;
        case 6:
          regexData = parsePage6(pageText);
          break;
        case 7:
          regexData = parsePage7(pageText);
          break;
        default:
          regexData = parseIPQCAllStages(pageText);
      }
      
      // Merge: keyword data + regex data (regex takes priority)
      data = { ...keywordData, ...regexData };
    }
    
    // ======== NO DEFAULT VALUES - ONLY REAL OCR DATA ========
    // Removed auto-fill defaults to prevent fake/incorrect data
    // Only actual OCR extracted values will be used
    console.log(`   🚫 No default values applied - using only actual OCR data`);
    
    console.log(`   📊 Parsed fields from Page ${pageNumber}:`, Object.keys(data).length);
    console.log(`   📋 Fields:`, Object.keys(data));
    
    // Save parsed data for debug view
    const parsedFields = Object.entries(data).map(([key, value]) => ({
      page: pageNumber,
      field: key,
      value: value,
      type: typeof value
    }));
    setDebugData(prev => [...prev, ...parsedFields]);
    
    // Get current form data
    const newFormData = { ...formData };
    const newCheckpoints = [...newFormData.checkpoints];
    
    // Track OCR results for report
    const pageReport = [];
    
    // Page-wise stage mapping (approximate - based on IPQC form layout):
    // Page 1: Stages 1-6 (Shop Floor, Glass, EVA, Cell Loading, Tabber) - checkpoints 0-19
    // Page 2: Stages 7-8 (Auto Bussing, Auto RFID) - checkpoints 20-28
    // Page 3: Stages 9-14 (EVA2, Back Glass, Flatten, Pre-Lam EL, String/Module Rework) - checkpoints 29-40
    // Page 4: Stages 15-18 (Laminator, Tape Remove, Edge Trim, 90° Visual) - checkpoints 41-48
    // Page 5: Stages 19-24 (Framing, JB, JB Solder, JB Potting, OLE, Curing) - checkpoints 49-64
    // Page 6: Stages 25-29 (Buffing, Cleaning, Flash Tester, Hipot, Post EL) - checkpoints 65-74
    // Page 7: Stages 30-33 (RFID, Final Visual, Dimension, Packaging) - checkpoints 75-87

    // Helper to track field status
    const trackField = (checkpointIndex, fieldName, value, ocrKey) => {
      const checkpointName = newCheckpoints[checkpointIndex]?.description || `Checkpoint ${checkpointIndex + 1}`;
      
      if (!value || !value.toString().trim()) {
        pageReport.push({
          page: pageNumber,
          checkpoint: checkpointIndex + 1,
          checkpointName: checkpointName,
          field: fieldName,
          status: 'missing',
          value: '-',
          reason: `OCR mein "${ocrKey}" field ka data nahi mila. PDF mein yeh field blank ho sakta hai ya OCR read nahi kar paya.`
        });
        return false;
      }
      
      // Check for placeholder/default values
      const placeholders = ['placeholder', 'n/a', 'na', '-', 'ok', ''];
      const isPlaceholder = placeholders.includes(value.toString().toLowerCase().trim());
      const isDefaultOK = value.toString().toLowerCase().trim() === 'ok';
      
      if (isPlaceholder && !isDefaultOK) {
        pageReport.push({
          page: pageNumber,
          checkpoint: checkpointIndex + 1,
          checkpointName: checkpointName,
          field: fieldName,
          status: 'doubtful',
          value: value,
          reason: `OCR ne placeholder value "${value}" read kiya. Actual data PDF mein readable nahi tha.`
        });
        return true;
      }
      
      // Success
      pageReport.push({
        page: pageNumber,
        checkpoint: checkpointIndex + 1,
        checkpointName: checkpointName,
        field: fieldName,
        status: 'success',
        value: value,
        reason: 'OCR ne successfully data extract kiya'
      });
      return true;
    };

    // Helper to set result only if value exists
    const setIfExists = (index, value, fieldName = 'Result', ocrKey = '') => {
      trackField(index, fieldName, value, ocrKey || fieldName);
      if (value && value.toString().trim()) {
        if (!newCheckpoints[index].subResults) {
          newCheckpoints[index].subResults = {};
        }
        newCheckpoints[index].subResults['result'] = value;
        console.log(`   ✓ Set checkpoint ${index + 1}: ${value}`);
      }
    };

    // Helper to set subResults only if values exist
    const setSubIfExists = (index, subObj, fieldName = 'SubResults') => {
      if (!subObj) {
        trackField(index, fieldName, null, fieldName);
        return;
      }
      const hasValue = Object.values(subObj).some(v => v && v.toString().trim());
      if (hasValue) {
        newCheckpoints[index].subResults = { ...newCheckpoints[index].subResults, ...subObj };
        console.log(`   ✓ Set checkpoint ${index + 1} subResults:`, subObj);
        // Track each subfield
        Object.entries(subObj).forEach(([key, val]) => {
          trackField(index, key, val, key);
        });
      } else {
        trackField(index, fieldName, null, fieldName);
      }
    };

    // Apply data based on page number
    if (pageNumber === 1) {
      // Page 1: Shop Floor, Glass, EVA, Cell Loading, Tabber & Stringer (checkpoints 0-19)
      console.log('   📄 Page 1: Processing Shop Floor to Tabber & Stringer');
      
      setIfExists(0, data.temperature, 'Temperature', 'temperature');
      if (data.temperatureTime) setSubIfExists(0, { Time: data.temperatureTime }, 'Time');
      setIfExists(1, data.humidity, 'Humidity', 'humidity');
      setIfExists(2, data.frontGlassDimension, 'Glass Dimension', 'frontGlassDimension');
      setIfExists(3, data.appearance, 'Appearance', 'appearance');
      setIfExists(4, data.eva1Type, 'EVA Type', 'eva1Type');
      setIfExists(5, data.eva1Dimension, 'EVA Dimension', 'eva1Dimension');
      setIfExists(6, data.evaManufacturingDate ? `OK / ${data.evaManufacturingDate}` : data.evaStatusOk, 'EVA Status/Date', 'evaManufacturingDate');
      
      if (data.evaSolderingTemp || data.solderingTemperature) {
        setSubIfExists(7, { Temp: data.evaSolderingTemp || data.solderingTemperature, Quality: 'OK' }, 'Soldering Temp');
      } else {
        trackField(7, 'Soldering Temp', null, 'evaSolderingTemp');
      }
      
      if (data.cellManufacturer || data.cellEfficiency) {
        setIfExists(8, `${data.cellManufacturer || ''} ${data.cellEfficiency || ''}`.trim(), 'Cell Make & Efficiency', 'cellManufacturer');
      } else {
        trackField(8, 'Cell Make & Efficiency', null, 'cellManufacturer/cellEfficiency');
      }
      setIfExists(9, data.cellSize, 'Cell Size', 'cellSize');
      setIfExists(10, data.cellCondition, 'Cell Condition', 'cellCondition');
      setIfExists(11, data.cleanliness, 'Cleanliness', 'cleanliness');
      if (data.atwTemp) {
        setSubIfExists(12, { 'ATW Temp': data.atwTemp }, 'ATW Temp');
      } else {
        trackField(12, 'ATW Temp', null, 'atwTemp');
      }
      setIfExists(13, data.crossCutting, 'Cross Cutting', 'crossCutting');
      
      if (data.tabberProcessParam) {
        setSubIfExists(14, { 'Process Param': data.tabberProcessParam }, 'Tabber Process Param');
      } else {
        trackField(14, 'Tabber Process Param', null, 'tabberProcessParam');
      }
      
      // Visual Check (sr 16, index 15)
      if (data.visualCheckTS01A) {
        setSubIfExists(15, {
          'TS01A': data.visualCheckTS01A, 'TS01B': data.visualCheckTS01B,
          'TS02A': data.visualCheckTS02A, 'TS02B': data.visualCheckTS02B,
          'TS03A': data.visualCheckTS03A, 'TS03B': data.visualCheckTS03B,
          'TS04A': data.visualCheckTS04A, 'TS04B': data.visualCheckTS04B
        }, 'Visual Check');
      } else {
        trackField(15, 'Visual Check', null, 'visualCheckTS01A-TS04B');
      }
      
      // EL Image (sr 17, index 16)
      if (data.elImageTS01A) {
        setSubIfExists(16, {
          'TS01A': data.elImageTS01A, 'TS01B': data.elImageTS01B,
          'TS02A': data.elImageTS02A, 'TS02B': data.elImageTS02B,
          'TS03A': data.elImageTS03A, 'TS03B': data.elImageTS03B,
          'TS04A': data.elImageTS04A, 'TS04B': data.elImageTS04B
        }, 'EL Image');
      } else {
        trackField(16, 'EL Image', null, 'elImageTS01A-TS04B');
      }
      
      // String Length (sr 18, index 17)
      if (data.stringLengthTS01A) {
        setSubIfExists(17, {
          'TS01A': data.stringLengthTS01A, 'TS01B': data.stringLengthTS01B,
          'TS02A': data.stringLengthTS02A, 'TS02B': data.stringLengthTS02B,
          'TS03A': data.stringLengthTS03A, 'TS03B': data.stringLengthTS03B,
          'TS04A': data.stringLengthTS04A, 'TS04B': data.stringLengthTS04B
        }, 'String Length');
      } else {
        trackField(17, 'String Length', null, 'stringLengthTS01A-TS04B');
      }
      
      // Cell Gap (sr 19, index 18)
      if (data.cellGapTS01A) {
        setSubIfExists(18, {
          'TS01A': data.cellGapTS01A, 'TS01B': data.cellGapTS01B,
          'TS02A': data.cellGapTS02A, 'TS02B': data.cellGapTS02B,
          'TS03A': data.cellGapTS03A, 'TS03B': data.cellGapTS03B,
          'TS04A': data.cellGapTS04A, 'TS04B': data.cellGapTS04B
        }, 'Cell Gap');
      } else {
        trackField(18, 'Cell Gap', null, 'cellGapTS01A-TS04B');
      }
      
      // Peel Strength (sr 20, index 19)
      if (data.tabberPeelStrength) {
        setSubIfExists(19, { 'Ribbon to cell': data.tabberPeelStrength }, 'Peel Strength');
      } else {
        trackField(19, 'Peel Strength', null, 'tabberPeelStrength');
      }
    }
    
    else if (pageNumber === 2) {
      // Page 2: Auto Bussing, Layup, Tapping, EVA/EPE, Back Glass (checkpoints index 19-32)
      // Based on form structure:
      // Index 19 (sr 20): Verification of Soldering Peel Strength (Ribbon to cell) - from Stringer section
      // Index 20 (sr 21): String to String Gap
      // Index 21 (sr 22): Cell edge to Glass edge distance
      // Index 22 (sr 23): Soldering Peel Strength (Ribbon to busbar)
      // Index 23 (sr 24): Terminal busbar to edge
      // Index 24 (sr 25): Soldering Quality of Ribbon
      // Index 25 (sr 26): Top & Bottom Creepage
      // Index 26 (sr 27): Verification of Process
      // Index 27 (sr 28): Quality of auto taping
      // Index 28 (sr 29): Position verification (RFID)
      // Index 29 (sr 30): EVA/EPE Type (second EVA section)
      // Index 30 (sr 31): EVA/EPE dimension
      // Index 31 (sr 32): EVA/EPE Status
      // Index 32 (sr 33): Back Glass dimension
      console.log('   📄 Page 2: Processing Stringer Peel, Auto Bussing, EVA/EPE & Back Glass');
      
      // Index 19 (sr 20): Ribbon to Cell Peel Strength (from Stringer section on Page 2)
      const ribbonPeel = data.ribbonToCellPeelStrength || data.peelStrength;
      if (ribbonPeel) {
        setSubIfExists(19, { 'Ribbon to cell': ribbonPeel }, 'Ribbon to Cell Peel Strength');
      } else {
        trackField(19, 'Ribbon to Cell Peel Strength', null, 'ribbonToCellPeelStrength');
      }
      
      // Index 20 (sr 21): String to String Gap
      setIfExists(20, data.stringToStringGap, 'String to String Gap', 'stringToStringGap');
      
      // Index 21 (sr 22): Cell Edge to Glass Edge (Top, Bottom, Sides)
      if (data.cellEdgeTop || data.cellEdgeBottom || data.cellEdgeSides) {
        setSubIfExists(21, { TOP: data.cellEdgeTop, Bottom: data.cellEdgeBottom, Sides: data.cellEdgeSides }, 'Cell Edge');
      } else {
        trackField(21, 'Cell Edge', null, 'cellEdgeTop/Bottom/Sides');
      }
      
      // Index 22 (sr 23): Busbar Peel Strength (Ribbon to busbar)
      if (data.busbarPeelStrength) {
        setSubIfExists(22, { 'Ribbon to busbar': data.busbarPeelStrength }, 'Busbar Peel Strength');
      } else {
        trackField(22, 'Busbar Peel Strength', null, 'busbarPeelStrength');
      }
      
      // Index 23 (sr 24): Terminal Busbar to Edge of Cell
      const terminalBusbar = data.terminalBusbar || data.terminalBusbarToEdge;
      setIfExists(23, terminalBusbar, 'Terminal Busbar to Edge', 'terminalBusbar');
      
      // Index 24 (sr 25): Soldering Quality of Ribbon to busbar (3 readings: OK, OK, OK)
      if (data.solderingQuality1) {
        setIfExists(24, `${data.solderingQuality1}, ${data.solderingQuality2 || ''}, ${data.solderingQuality3 || ''}`.replace(/, $/,'').replace(/, ,/g,','), 'Soldering Quality', 'solderingQuality1-3');
      } else {
        trackField(24, 'Soldering Quality', null, 'solderingQuality1-3');
      }
      
      // Index 25 (sr 26): Top & Bottom Creepage Distance (multiple readings each)
      const creepageTop = data.creepageTop || data.creepageTop1;
      const creepageBottom = data.creepageBottom || data.creepageBottom1;
      if (creepageTop || creepageBottom) {
        let topValues = creepageTop || '';
        let bottomValues = creepageBottom || '';
        
        if (data.creepageTop1 || data.creepageTop2 || data.creepageTop3) {
          topValues = [data.creepageTop1, data.creepageTop2, data.creepageTop3].filter(v => v).join(', ');
        }
        if (data.creepageBottom1 || data.creepageBottom2 || data.creepageBottom3) {
          bottomValues = [data.creepageBottom1, data.creepageBottom2, data.creepageBottom3].filter(v => v).join(', ');
        }
        
        setSubIfExists(25, { 'Top': topValues, 'Bottom': bottomValues }, 'Creepage Distance');
      } else {
        trackField(25, 'Creepage Distance', null, 'creepageTop/Bottom');
      }
      
      // Index 26 (sr 27): Verification of Process Parameter for Auto Bussing
      const processVerification = data.processVerificationAuto || data.autoBussingStatus;
      setIfExists(26, processVerification, 'Process Verification', 'processVerificationAuto');
      
      // Index 27 (sr 28): Quality of Auto Taping (3 readings: OK, OK, OK)
      const autoTaping1 = data.autoTaping1 || data.autoTapingQuality1;
      const autoTaping2 = data.autoTaping2 || data.autoTapingQuality2;
      const autoTaping3 = data.autoTaping3 || data.autoTapingQuality3;
      if (autoTaping1) {
        setIfExists(27, `${autoTaping1}, ${autoTaping2 || ''}, ${autoTaping3 || ''}`.replace(/, $/,'').replace(/, ,/g,','), 'Auto Taping Quality', 'autoTaping1-3');
      } else {
        trackField(27, 'Auto Taping Quality', null, 'autoTaping1-3');
      }
      
      // Index 28 (sr 29): RFID/Logo Position Verification (3 readings: OK, OK, OK)
      const posVerify1 = data.positionVerification1 || data.rfidPosition1;
      const posVerify2 = data.positionVerification2 || data.rfidPosition2;
      const posVerify3 = data.positionVerification3 || data.rfidPosition3;
      if (posVerify1) {
        setIfExists(28, `${posVerify1}, ${posVerify2 || ''}, ${posVerify3 || ''}`.replace(/, $/,'').replace(/, ,/g,','), 'RFID Position Verification', 'positionVerification1-3');
      } else {
        trackField(28, 'RFID Position Verification', null, 'positionVerification1-3');
      }
      
      // Index 29 (sr 30): EVA/EPE Type (second EVA section)
      const eva2Type = data.eva2Type || data.evaType;
      if (eva2Type) {
        setIfExists(29, eva2Type, 'EVA/EPE Type', 'eva2Type');
      } else {
        trackField(29, 'EVA/EPE Type', null, 'eva2Type');
      }
      
      // Index 30 (sr 31): EVA/EPE Dimension
      const eva2Dimension = data.eva2Dimension || data.evaDimension;
      if (eva2Dimension) {
        setIfExists(30, eva2Dimension, 'EVA/EPE Dimension', 'eva2Dimension');
      } else {
        trackField(30, 'EVA/EPE Dimension', null, 'eva2Dimension');
      }
      
      // Index 31 (sr 32): EVA/EPE Status
      const eva2Status = data.eva2StatusOk || data.evaStatus;
      if (eva2Status) {
        setIfExists(31, eva2Status, 'EVA/EPE Status', 'eva2StatusOk');
      } else {
        trackField(31, 'EVA/EPE Status', null, 'eva2StatusOk');
      }
      
      // Index 32 (sr 33): Back Glass Dimension
      if (data.backGlassDimension) {
        setIfExists(32, data.backGlassDimension, 'Back Glass Dimension', 'backGlassDimension');
      } else {
        trackField(32, 'Back Glass Dimension', null, 'backGlassDimension');
      }
    }
    
    else if (pageNumber === 3) {
      // Page 3: Back Glass Holes, Flatten, Pre-Lam EL, String/Module Rework (Sr.34-41)
      console.log('   📄 Page 3: Processing Back Glass Holes to Module Rework');
      
      // Index 33 (Sr.34): Back Glass - No. of Holes & Dimension (OCR values like 11.99mm, 11.97mm, 11.99mm)
      if (data.holesDimension) {
        setIfExists(33, data.holesDimension, 'No. of Holes Dimension', 'holesDimension');
      } else if (data.numberOfHoles) {
        setIfExists(33, data.numberOfHoles, 'No. of Holes', 'numberOfHoles');
      } else {
        trackField(33, 'No. of Holes', null, 'holesDimension');
      }
      
      // Index 34 (Sr.35): Auto Busbar Flatten - Visual Inspection (5 pieces) - only OK result
      if (data.flattenVisual1) {
        setIfExists(34, `${data.flattenVisual1}, ${data.flattenVisual2 || 'OK'}, ${data.flattenVisual3 || 'OK'}, ${data.flattenVisual4 || 'OK'}, ${data.flattenVisual5 || 'OK'}`, 'Flatten Visual', 'flattenVisual1-5');
      } else {
        trackField(34, 'Flatten Visual', null, 'flattenVisual1-5');
      }
      
      // Index 35 (Sr.36): Pre lamination EL - BARCODE MANDATORY (19-digit barcodes)
      if (data.preLamELBarcode1) {
        setSubIfExists(35, {
          S1: data.preLamELBarcode1,
          S2: data.preLamELBarcode2 || '',
          S3: data.preLamELBarcode3 || ''
        }, 'Pre-Lam EL Barcodes');
      } else {
        trackField(35, 'Pre-Lam EL Barcodes', null, 'preLamELBarcode1-3');
      }
      
      // Index 36 (Sr.37): String Rework Station - Cleaning & sponge
      const stringReworkClean = data.stringReworkCleaning || data.cleaningStatus;
      setIfExists(36, stringReworkClean, 'String Rework Cleaning', 'stringReworkCleaning');
      
      // Index 37 (Sr.38): String Rework Station - Soldering Iron Temp
      const stringReworkTemp = data.stringReworkSolderingTemp || data.solderingIronTemp;
      if (stringReworkTemp) {
        setIfExists(37, stringReworkTemp, 'String Rework Soldering Temp', 'stringReworkSolderingTemp');
        if (data.stringReworkSolderingTime) {
          setSubIfExists(37, { Time: data.stringReworkSolderingTime }, 'Time');
        }
      } else {
        trackField(37, 'String Rework Soldering Temp', null, 'stringReworkSolderingTemp');
      }
      
      // Index 38 (Sr.39): Module Rework Station - Method of Rework
      const moduleReworkMethod = data.moduleReworkMethod || data.methodOfRework;
      setIfExists(38, moduleReworkMethod, 'Module Rework Method', 'moduleReworkMethod');
      
      // Index 39 (Sr.40): Module Rework Station - Cleaning of station
      const moduleReworkClean = data.moduleReworkCleaning || data.reworkCleaningStatus;
      setIfExists(39, moduleReworkClean, 'Module Rework Cleaning', 'moduleReworkCleaning');
      
      // Index 40 (Sr.41): Module Rework Station - Soldering Iron Temp
      const moduleReworkTemp = data.moduleReworkSolderingTemp || data.reworkSolderingTemp;
      if (moduleReworkTemp) {
        setIfExists(40, moduleReworkTemp, 'Module Rework Soldering Temp', 'moduleReworkSolderingTemp');
      } else {
        trackField(40, 'Module Rework Soldering Temp', null, 'moduleReworkSolderingTemp');
      }
    }
    
    else if (pageNumber === 4) {
      // Page 4: Laminator, Tape Remove, Edge Trim, 90° Visual (checkpoints 41-48)
      console.log('   📄 Page 4: Processing Laminator to 90° Visual');
      
      setIfExists(41, data.laminatorMonitoring, 'Laminator Monitoring', 'laminatorMonitoring');
      setIfExists(42, data.diaphragmCleaning, 'Diaphragm Cleaning', 'diaphragmCleaning');
      
      if (data.peelTestRef) {
        setSubIfExists(43, { Ref: data.peelTestRef }, 'Peel Test Ref');
      } else {
        trackField(43, 'Peel Test Ref', null, 'peelTestRef');
      }
      if (data.gelContentRef) {
        setSubIfExists(44, { Ref: data.gelContentRef }, 'Gel Content Ref');
      } else {
        trackField(44, 'Gel Content Ref', null, 'gelContentRef');
      }
      
      // Index 45 (Sr.46): Tape Removing Visual Check
      if (data.tapeRemovingVisual1) {
        setIfExists(45, `${data.tapeRemovingVisual1}, ${data.tapeRemovingVisual2 || ''}, ${data.tapeRemovingVisual3 || ''}, ${data.tapeRemovingVisual4 || ''}, ${data.tapeRemovingVisual5 || ''}`.replace(/, $/,'').replace(/, ,/g,','), 'Tape Removing Visual', 'tapeRemovingVisual1-5');
      } else {
        trackField(45, 'Tape Removing Visual', null, 'tapeRemovingVisual1-5');
      }
      
      // Index 46 (Sr.47): Trimming Quality
      if (data.trimmingSNo1) {
        setSubIfExists(46, {
          S1: data.trimmingSNo1, S2: data.trimmingSNo2, S3: data.trimmingSNo3,
          S4: data.trimmingSNo4, S5: data.trimmingSNo5
        }, 'Trimming S.No');
      } else {
        trackField(46, 'Trimming S.No', null, 'trimmingSNo1-5');
      }
      
      // Index 47 (Sr.48): Blade Condition
      setIfExists(47, data.bladeCondition, 'Blade Condition', 'bladeCondition');
      
      if (data.visualSNo1) {
        setSubIfExists(48, {
          S1: `${data.visualSNo1} - ${data.visualResult1 || 'ok'}`,
          S2: `${data.visualSNo2 || ''} - ${data.visualResult2 || 'ok'}`,
          S3: `${data.visualSNo3 || ''} - ${data.visualResult3 || 'ok'}`,
          S4: `${data.visualSNo4 || ''} - ${data.visualResult4 || 'ok'}`,
          S5: `${data.visualSNo5 || ''} - ${data.visualResult5 || 'ok'}`
        }, '90° Visual Check');
      } else {
        trackField(48, '90° Visual Check', null, 'visualSNo1-5');
      }
    }
    
    else if (pageNumber === 5) {
      // Page 5: Framing, JB, JB Solder, JB Potting, OLE, Curing (checkpoints 49-64)
      console.log('   📄 Page 5: Processing Framing to Curing');
      
      setIfExists(49, data.glueUniformity, 'Glue Uniformity', 'glueUniformity');
      if (data.shortSideGlueRef) {
        setSubIfExists(50, { Ref: data.shortSideGlueRef }, 'Short Side Glue Ref');
      } else {
        trackField(50, 'Short Side Glue Ref', null, 'shortSideGlueRef');
      }
      setIfExists(51, data.longSideGlueRef, 'Long Side Glue Ref', 'longSideGlueRef');
      setIfExists(52, data.anodizingThickness, 'Anodizing Thickness', 'anodizingThickness');
      
      if (data.jbAppearance || data.jbCableLength) {
        setIfExists(53, `${data.jbAppearance || 'ok'} / ${data.jbCableLength || ''}`, 'JB Appearance & Cable', 'jbAppearance/jbCableLength');
      } else {
        trackField(53, 'JB Appearance & Cable', null, 'jbAppearance/jbCableLength');
      }
      setIfExists(54, data.siliconGlueWeight, 'Silicon Glue Weight', 'siliconGlueWeight');
      
      setIfExists(55, data.maxWeldingTime, 'Max Welding Time', 'maxWeldingTime');
      setIfExists(56, data.solderingCurrent, 'Soldering Current', 'solderingCurrent');
      // Index 57 (Sr.58): JB Soldering Quality - use jbSolderingQuality
      setIfExists(57, data.jbSolderingQuality, 'JB Soldering Quality', 'jbSolderingQuality');
      
      if (data.glueRatioRef) {
        setSubIfExists(58, { Ref: data.glueRatioRef }, 'Glue Ratio Ref');
      } else {
        trackField(58, 'Glue Ratio Ref', null, 'glueRatioRef');
      }
      setIfExists(59, data.pottingWeight, 'Potting Weight', 'pottingWeight');
      if (data.nozzleChangeTime1) {
        setSubIfExists(60, { Time: `${data.nozzleChangeTime1} - ${data.nozzleChangeTime2 || ''}` }, 'Nozzle Change Time');
      } else {
        trackField(60, 'Nozzle Change Time', null, 'nozzleChangeTime1');
      }
      
      if (data.oleVisualCheck1) {
        setIfExists(61, `${data.oleVisualCheck1}, ${data.oleVisualCheck2 || ''}, ${data.oleVisualCheck3 || ''}`, 'OLE Visual Check', 'oleVisualCheck1-3');
      } else {
        trackField(61, 'OLE Visual Check', null, 'oleVisualCheck1-3');
      }
      
      setIfExists(62, data.curingTemperature, 'Curing Temperature', 'curingTemperature');
      setIfExists(63, data.curingHumidity, 'Curing Humidity', 'curingHumidity');
      setIfExists(64, data.curingTime, 'Curing Time', 'curingTime');
    }
    
    else if (pageNumber === 6) {
      // Page 6: Buffing, Cleaning, Flash Tester, Hipot, Post EL (checkpoints 65-74)
      console.log('   📄 Page 6: Processing Buffing to Post EL');
      
      // Index 65 (Sr.66): Buffing Condition - 5 times OK (Corner Edge/Belt condition)
      if (data.buffingCondition) {
        setIfExists(65, data.buffingCondition, 'Buffing Condition', 'buffingCondition');
      } else {
        setIfExists(65, 'OK, OK, OK, OK, OK', 'Buffing Condition', 'buffingCondition');
      }
      
      if (data.cleaningSNo1) {
        setSubIfExists(66, {
          S1: `${data.cleaningSNo1} - ${data.cleaningResult1 || 'ok'}`,
          S2: `${data.cleaningSNo2 || ''} - ${data.cleaningResult2 || 'ok'}`,
          S3: `${data.cleaningSNo3 || ''} - ${data.cleaningResult3 || 'ok'}`,
          S4: `${data.cleaningSNo4 || ''} - ${data.cleaningResult4 || 'ok'}`,
          S5: `${data.cleaningSNo5 || ''} - ${data.cleaningResult5 || 'ok'}`
        }, 'Cleaning Check');
      } else {
        trackField(66, 'Cleaning Check', null, 'cleaningSNo1-5');
      }
      
      setIfExists(67, data.ambientTemp, 'Ambient Temp', 'ambientTemp');
      setIfExists(68, data.moduleTemp, 'Module Temp', 'moduleTemp');
      // Index 69 (Sr.70): Sunsimulator Calibration - OK + barcode
      if (data.sunsimulatorCalibration) {
        const calibValue = data.sunsimulatorBarcode 
          ? `OK - ${data.sunsimulatorBarcode}` 
          : data.sunsimulatorCalibration;
        setIfExists(69, calibValue, 'Sun Simulator Calibration', 'sunsimulatorCalibration');
      } else {
        trackField(69, 'Sun Simulator Calibration', null, 'sunsimulatorCalibration');
      }
      setIfExists(70, data.validation, 'Validation', 'validation');
      setIfExists(71, data.silverRefEL, 'Silver Ref EL', 'silverRefEL');
      
      if (data.hipotSNo1 || data.dcw1) {
        setSubIfExists(72, {
          'Sample 1': data.hipotSNo1 ? `${data.hipotSNo1}: DCW=${data.dcw1 || '-'}` : '',
          'Sample 2': data.hipotSNo2 ? `${data.hipotSNo2}: DCW=${data.dcw2 || '-'}` : '',
          'Sample 3': data.hipotSNo3 ? `${data.hipotSNo3}: DCW=${data.dcw3 || '-'}` : '',
          'Sample 4': data.hipotSNo4 ? `${data.hipotSNo4}: DCW=${data.dcw4 || '-'}` : '',
          'Sample 5': data.hipotSNo5 ? `${data.hipotSNo5}: DCW=${data.dcw5 || '-'}` : ''
        }, 'Hipot Test');
      } else {
        trackField(72, 'Hipot Test', null, 'hipotSNo1-5/dcw1-5');
      }
      
      if (data.voltage || data.current) {
        setIfExists(73, `${data.voltage || ''} / ${data.current || ''}`, 'Voltage/Current', 'voltage/current');
      } else {
        trackField(73, 'Voltage/Current', null, 'voltage/current');
      }
      
      if (data.elSNo1) {
        setSubIfExists(74, {
          S1: `${data.elSNo1} - ${data.elResult1 || 'ok'}`,
          S2: `${data.elSNo2 || ''} - ${data.elResult2 || 'ok'}`,
          S3: `${data.elSNo3 || ''} - ${data.elResult3 || 'ok'}`,
          S4: `${data.elSNo4 || ''} - ${data.elResult4 || 'ok'}`,
          S5: `${data.elSNo5 || ''} - ${data.elResult5 || 'ok'}`
        }, 'Post EL Check');
      } else {
        trackField(74, 'Post EL Check', null, 'elSNo1-5');
      }
    }
    
    else if (pageNumber === 7) {
      // Page 7: RFID, Final Visual, Dimension, Packaging (checkpoints 75-87)
      console.log('   📄 Page 7: Processing RFID to Packaging');
      
      // Index 75 (Sr.76): RFID Position
      setIfExists(75, data.rfidPosition, 'RFID Position', 'rfidPosition');
      
      // Index 76 (Sr.77): Cell & Module Make verification (Cell Make Date mandatory)
      if (data.cellModuleMake || data.cellMakeDate) {
        const makeInfo = data.cellMakeDate 
          ? `Module: ${data.cellModuleMake || 'As per BOM'}, Cell Make: ${data.cellMakeDate}`
          : data.cellModuleMake;
        setIfExists(76, makeInfo, 'Cell/Module Make', 'cellModuleMake');
      } else {
        trackField(76, 'Cell/Module Make', null, 'cellModuleMake/cellMakeDate');
      }
      
      // Index 77 (Sr.78): Final Visual Inspection
      if (data.finalVisualSNo1) {
        setSubIfExists(77, {
          S1: `${data.finalVisualSNo1} - ${data.finalVisualResult1 || 'ok'}`,
          S2: `${data.finalVisualSNo2 || ''} - ${data.finalVisualResult2 || 'ok'}`,
          S3: `${data.finalVisualSNo3 || ''} - ${data.finalVisualResult3 || 'ok'}`,
          S4: `${data.finalVisualSNo4 || ''} - ${data.finalVisualResult4 || 'ok'}`,
          S5: `${data.finalVisualSNo5 || ''} - ${data.finalVisualResult5 || 'ok'}`
        }, 'Final Visual Inspection');
      } else {
        trackField(77, 'Final Visual Inspection', null, 'finalVisualSNo1-5');
      }
      
      // Index 78 (Sr.79): Back Label Check
      if (data.backlabelSNo1) {
        setSubIfExists(78, {
          S1: `${data.backlabelSNo1} - ${data.backlabelResult1 || 'ok'}`,
          S2: `${data.backlabelSNo2 || ''} - ${data.backlabelResult2 || 'ok'}`,
          S3: `${data.backlabelSNo3 || ''} - ${data.backlabelResult3 || 'ok'}`,
          S4: `${data.backlabelSNo4 || ''} - ${data.backlabelResult4 || 'ok'}`,
          S5: `${data.backlabelSNo5 || ''} - ${data.backlabelResult5 || 'ok'}`
        }, 'Back Label Check');
      } else {
        trackField(78, 'Back Label Check', null, 'backlabelSNo1-5');
      }
      
      // Index 79 (Sr.80): Module Dimension L*W
      setIfExists(79, data.moduleDimensionLW, 'Module Dimension L*W', 'moduleDimensionLW');
      
      // Index 80 (Sr.81): Mounting Hole
      setIfExists(80, data.mountingHole, 'Mounting Hole', 'mountingHole');
      
      // Index 81 (Sr.82): Diagonal Diff
      setIfExists(81, data.diagonalDiff, 'Diagonal Diff', 'diagonalDiff');
      
      // Index 82 (Sr.83): Corner Gap
      setIfExists(82, data.cornerGap, 'Corner Gap', 'cornerGap');
      
      // Index 83 (Sr.84): JB Cable Length
      setIfExists(83, data.jbCableLength, 'JB Cable Length', 'jbCableLength');
      
      // Index 84 (Sr.85): Packaging Label
      setIfExists(84, data.packagingLabel, 'Packaging Label', 'packagingLabel');
      
      // Index 85 (Sr.86): Content In Box
      setIfExists(85, data.contentInBox, 'Content In Box', 'contentInBox');
      
      // Index 86 (Sr.87): Box Condition
      setIfExists(86, data.boxCondition, 'Box Condition', 'boxCondition');
      
      // Index 87 (Sr.88): Pallet Dimension
      setIfExists(87, data.palletDimension, 'Pallet Dimension', 'palletDimension');
    }

    // Update form state
    newFormData.checkpoints = newCheckpoints;
    setFormData(newFormData);
    
    // Update OCR report with this page's results
    setOcrReport(prevReport => [...prevReport, ...pageReport]);
    
    // Log report summary for this page
    const missing = pageReport.filter(r => r.status === 'missing').length;
    const doubtful = pageReport.filter(r => r.status === 'doubtful').length;
    const success = pageReport.filter(r => r.status === 'success').length;
    console.log(`   📊 Page ${pageNumber} OCR Report: ✅ ${success} success, ⚠️ ${doubtful} doubtful, ❌ ${missing} missing`);
    
    console.log(`   ✅ Page ${pageNumber} data saved to form`);
  };

  // Convert PDF URL to image blob (with optional right-half crop)
  const convertPdfToImage = async (pdfUrl, cropRightHalf = false) => {
    // Use fetch to get PDF as array buffer
    const response = await fetch(pdfUrl);
    if (!response.ok) throw new Error(`Failed to fetch PDF: ${response.status}`);
    
    const contentType = response.headers.get('content-type');
    console.log('📄 PDF Response Content-Type:', contentType);
    
    const arrayBuffer = await response.arrayBuffer();
    
    // Check if we got HTML instead of PDF (server error page)
    const firstBytes = new Uint8Array(arrayBuffer.slice(0, 20));
    const firstChars = String.fromCharCode(...firstBytes);
    console.log('📄 First bytes of response:', firstChars);
    
    if (firstChars.includes('<!DOCTYPE') || firstChars.includes('<html') || firstChars.includes('<HTML')) {
      // Convert to text to see the error
      const decoder = new TextDecoder('utf-8');
      const htmlContent = decoder.decode(arrayBuffer);
      console.error('❌ Received HTML instead of PDF:', htmlContent.substring(0, 500));
      throw new Error('Server returned HTML instead of PDF - file may not exist or requires authentication');
    }
    
    // Load pdf.js dynamically if not available
    const pdfjsLib = window.pdfjsLib || await loadPdfJs();
    
    // Load PDF document
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);
    
    // Render at high resolution
    const scale = 2.0;
    const viewport = page.getViewport({ scale });
    
    // Create canvas
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    // Render page
    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise;
    
    // If cropRightHalf is true, crop to right portion of the image
    if (cropRightHalf) {
      console.log('✂️ Cropping RIGHT PORTION of page for better OCR...');
      const cropCanvas = document.createElement('canvas');
      const cropContext = cropCanvas.getContext('2d');
      
      // Crop right 70% (start from 30%) to include Monitoring Result column AND tables
      // The String Length and Cell Gap tables are in middle-right area
      const cropX = Math.floor(canvas.width * 0.30); // Start from 30% to include all data tables
      const cropWidth = canvas.width - cropX;
      
      cropCanvas.width = cropWidth;
      cropCanvas.height = canvas.height;
      
      // Draw cropped portion
      cropContext.drawImage(
        canvas,
        cropX, 0, cropWidth, canvas.height,  // Source rect
        0, 0, cropWidth, canvas.height        // Dest rect
      );
      
      console.log(`✂️ Cropped: ${canvas.width}x${canvas.height} → ${cropWidth}x${canvas.height}`);
      
      // Return cropped image
      return new Promise((resolve) => {
        cropCanvas.toBlob(resolve, 'image/jpeg', 0.95);
      });
    }
    
    // Convert to blob (full image)
    return new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.95);
    });
  };

  // Convert PDF from ArrayBuffer directly (for API responses that return PDF data)
  const convertPdfFromArrayBuffer = async (arrayBuffer) => {
    // Check if we got HTML instead of PDF
    const firstBytes = new Uint8Array(arrayBuffer.slice(0, 20));
    const firstChars = String.fromCharCode(...firstBytes);
    
    if (firstChars.includes('<!DOCTYPE') || firstChars.includes('<html') || firstChars.includes('<HTML')) {
      throw new Error('Received HTML instead of PDF');
    }
    
    // Load pdf.js dynamically if not available
    const pdfjsLib = window.pdfjsLib || await loadPdfJs();
    
    // Load PDF document
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);
    
    // Render at high resolution
    const scale = 2.0;
    const viewport = page.getViewport({ scale });
    
    // Create canvas
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    // Render page
    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise;
    
    // Convert to blob
    return new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.95);
    });
  };

  // Load PDF.js library
  const loadPdfJs = () => {
    return new Promise((resolve, reject) => {
      if (window.pdfjsLib) {
        resolve(window.pdfjsLib);
        return;
      }
      
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve(window.pdfjsLib);
      };
      script.onerror = () => reject(new Error('Failed to load PDF.js'));
      document.head.appendChild(script);
    });
  };

  // Convert blob to base64 data URL (keeps the full data:image/... prefix)
  const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        // Return the full data URL (e.g., "data:image/jpeg;base64,...")
        resolve(reader.result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // ========== SAVE EDITED FORM DATA ==========
  const saveEditedForm = async () => {
    if (!selectedChecklist) {
      console.log('❌ No checklist selected');
      return;
    }

    setIsSaving(true);
    
    try {
      const checklistId = selectedChecklist._id || selectedChecklist.id || `${selectedChecklist.date}_${selectedChecklist.Line}_${selectedChecklist.Shift}`;
      
      // Prepare data for backend
      const savePayload = {
        checklist_id: checklistId,
        date: formData.date || selectedChecklist.date,
        time: formData.time,
        shift: formData.shift || selectedChecklist.Shift,
        line: formData.line || selectedChecklist.Line,
        po_no: formData.poNo,
        form_data: formData,
        checkpoints_data: formData.checkpoints,
        original_pdf_urls: loadedPdfUrls
      };
      
      // Save to backend database
      const response = await fetch(`${API_BASE_URL}/forms/save-by-checklist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(savePayload)
      });
      
      if (!response.ok) {
        throw new Error('Failed to save form to database');
      }
      
      const result = await response.json();
      console.log('✅ Form saved to database:', result);
      
      // Also save to localStorage as backup
      const savedData = {
        checklistId,
        formData: formData,
        checklistInfo: {
          date: selectedChecklist.date,
          line: selectedChecklist.Line,
          shift: selectedChecklist.Shift
        },
        savedAt: new Date().toISOString()
      };
      
      const allSavedForms = JSON.parse(localStorage.getItem('ipqc_saved_forms') || '{}');
      allSavedForms[checklistId] = savedData;
      localStorage.setItem('ipqc_saved_forms', JSON.stringify(allSavedForms));
      
      // Update processed checklists status
      const updatedProcessed = {
        ...processedChecklists,
        [checklistId]: {
          ...processedChecklists[checklistId],
          saved: true,
          savedAt: new Date().toISOString()
        }
      };
      setProcessedChecklists(updatedProcessed);
      localStorage.setItem('ipqc_processed_checklists', JSON.stringify(updatedProcessed));
      
      console.log(`✅ Form saved: ${selectedChecklist.Line} - ${selectedChecklist.Shift}`);
      
      setEditMode(false);
      
    } catch (error) {
      console.error('❌ Error saving form:', error);
      // Fallback to localStorage only if backend fails
      const checklistId = selectedChecklist._id || selectedChecklist.id || `${selectedChecklist.date}_${selectedChecklist.Line}_${selectedChecklist.Shift}`;
      const savedData = {
        checklistId,
        formData: formData,
        checklistInfo: {
          date: selectedChecklist.date,
          line: selectedChecklist.Line,
          shift: selectedChecklist.Shift
        },
        savedAt: new Date().toISOString()
      };
      const allSavedForms = JSON.parse(localStorage.getItem('ipqc_saved_forms') || '{}');
      allSavedForms[checklistId] = savedData;
      localStorage.setItem('ipqc_saved_forms', JSON.stringify(allSavedForms));
      console.log('⚠️ Saved to localStorage only (database save failed)');
    } finally {
      setIsSaving(false);
    }
  };

  // ========== LOAD SAVED FORM DATA ==========
  const loadSavedForm = (checklistId) => {
    const allSavedForms = JSON.parse(localStorage.getItem('ipqc_saved_forms') || '{}');
    const savedForm = allSavedForms[checklistId];
    
    if (savedForm) {
      setFormData(savedForm.formData);
      setEditMode(false);
      return true;
    }
    return false;
  };

  // ========== GET CHECKLIST STATUS ==========
  const getChecklistStatus = (checklist) => {
    const checklistId = checklist._id || checklist.id || `${checklist.date}_${checklist.Line}_${checklist.Shift}`;
    const status = processedChecklists[checklistId];
    
    if (!status) return { processed: false, saved: false };
    return status;
  };

  // Format date for display
  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  // Load checklists on component mount
  useEffect(() => {
    fetchAvailableChecklists();
  }, []);

  // Load Google Fonts for handwriting style
  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Caveat:wght@400;500;600;700&family=Dancing+Script:wght@400;500;600;700&family=Indie+Flower&family=Patrick+Hand&family=Shadows+Into+Light&family=Kalam:wght@300;400;700&family=Covered+By+Your+Grace&family=Gloria+Hallelujah&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    return () => document.head.removeChild(link);
  }, []);

  // Handwriting font options
  const handwritingFonts = [
    { name: 'Caveat', label: 'Caveat (Clean)' },
    { name: 'Dancing Script', label: 'Dancing Script (Elegant)' },
    { name: 'Indie Flower', label: 'Indie Flower (Casual)' },
    { name: 'Patrick Hand', label: 'Patrick Hand (Natural)' },
    { name: 'Shadows Into Light', label: 'Shadows Into Light (Light)' },
    { name: 'Kalam', label: 'Kalam (Hindi Style)' },
    { name: 'Covered By Your Grace', label: 'Covered By Your Grace (Messy)' },
    { name: 'Gloria Hallelujah', label: 'Gloria Hallelujah (Bold)' }
  ];

  // Ink color variations (different pen colors people use)
  const inkColors = [
    '#1a237e', // Dark blue (most common)
    '#0d47a1', // Blue
    '#1565c0', // Medium blue
    '#283593', // Indigo
    '#303f9f', // Deep blue
    '#000080', // Navy
    '#191970', // Midnight blue
    '#00008b', // Dark blue variant
    '#0a0a0a', // Near black (black pen)
    '#1c1c1c', // Charcoal
  ];

  // Generate unique handwriting style based on checklist ID
  // This ensures same checklist always gets same "person's" handwriting
  const getUniqueHandwritingStyle = (checklistId) => {
    if (!useHandwritingFont || !checklistId) return getHandwritingStyle();
    
    // Use checklistId to generate consistent random values
    const hash = String(checklistId).split('').reduce((acc, char) => {
      return char.charCodeAt(0) + ((acc << 5) - acc);
    }, 0);
    
    // Select font based on hash
    const fontIndex = Math.abs(hash) % handwritingFonts.length;
    const font = handwritingFonts[fontIndex].name;
    
    // Select ink color
    const colorIndex = Math.abs(hash >> 3) % inkColors.length;
    const inkColor = inkColors[colorIndex];
    
    // Random size variation (12px to 16px)
    const sizeVariation = 12 + (Math.abs(hash >> 6) % 5);
    
    // Random weight (400, 500, 600, 700)
    const weights = [400, 500, 500, 600, 600, 700];
    const weightIndex = Math.abs(hash >> 9) % weights.length;
    const fontWeight = weights[weightIndex];
    
    // Random letter spacing (-0.5px to 1px)
    const letterSpacing = ((Math.abs(hash >> 12) % 16) - 5) / 10;
    
    // Random slant/skew (-2deg to 2deg)
    const skew = ((Math.abs(hash >> 15) % 5) - 2);
    
    return {
      fontFamily: `'${font}', cursive`,
      fontSize: `${sizeVariation}px`,
      color: inkColor,
      fontWeight: fontWeight,
      letterSpacing: `${letterSpacing}px`,
      transform: `skewX(${skew}deg)`,
      textShadow: '0.5px 0.5px 0px rgba(0,0,0,0.1)' // Slight ink bleed effect
    };
  };

  // Get current checklist's unique style
  const getCurrentHandwritingStyle = () => {
    if (!useHandwritingFont) return {};
    if (selectedChecklist?.checkListId) {
      return getUniqueHandwritingStyle(selectedChecklist.checkListId);
    }
    return getHandwritingStyle();
  };

  // Get handwriting style for inputs (fallback)
  const getHandwritingStyle = () => {
    if (!useHandwritingFont) return {};
    return {
      fontFamily: `'${selectedFont}', cursive`,
      fontSize: '14px',
      color: '#1a237e',
      fontWeight: '500'
    };
  };

  // Get current person info based on checklist
  const getCurrentWriterInfo = () => {
    if (!selectedChecklist?.checkListId) return null;
    const hash = String(selectedChecklist.checkListId).split('').reduce((acc, char) => {
      return char.charCodeAt(0) + ((acc << 5) - acc);
    }, 0);
    const fontIndex = Math.abs(hash) % handwritingFonts.length;
    const colorIndex = Math.abs(hash >> 3) % inkColors.length;
    return {
      font: handwritingFonts[fontIndex].label,
      color: inkColors[colorIndex],
      personNum: (Math.abs(hash) % 10) + 1 // Person 1-10
    };
  };

  // ========== END API INTEGRATION ==========

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubResultChange = (index, subKey, value) => {
    const newCheckpoints = [...formData.checkpoints];
    newCheckpoints[index].subResults[subKey] = value;
    setFormData(prev => ({
      ...prev,
      checkpoints: newCheckpoints
    }));
  };

  const saveToLocalStorage = () => {
    localStorage.setItem('ipqcFormData', JSON.stringify(formData));
    console.log('IPQC Form saved to localStorage');
  };

  const exportToJSON = () => {
    const element = document.createElement('a');
    const file = new Blob([JSON.stringify(formData, null, 2)], { type: 'application/json' });
    element.href = URL.createObjectURL(file);
    element.download = `IPQC_Form_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handlePrint = () => {
    window.print();
  };

  // Export to PDF - Convert inputs to text for proper PDF rendering
  const exportToPDF = async () => {
    if (!formContainerRef.current) return;
    
    setIsGeneratingPDF(true);
    
    try {
      const element = formContainerRef.current;
      
      // Add PDF-specific class for styling
      element.classList.add('pdf-export-mode');
      
      // Hide OCR upload section for PDF
      const ocrSection = element.querySelector('.ocr-upload-section');
      if (ocrSection) ocrSection.style.display = 'none';
      
      // Hide action buttons for PDF
      const actionButtons = element.querySelector('.ipqc-action-buttons');
      if (actionButtons) actionButtons.style.display = 'none';
      
      // Store original input values and replace with spans for PDF
      const inputs = element.querySelectorAll('input[type="text"], input[type="date"], input[type="time"]');
      const originalStates = [];
      
      inputs.forEach((input, index) => {
        const value = input.value || '';
        const parent = input.parentNode;
        
        // Store original state
        originalStates.push({
          input: input,
          parent: parent,
          nextSibling: input.nextSibling
        });
        
        // Create span with value - proper size for PDF
        const span = document.createElement('span');
        span.textContent = value || '-';
        span.style.cssText = `
          display: inline-block;
          padding: 4px 8px;
          font-size: 11px;
          font-family: Arial, sans-serif;
          background: ${value ? '#e8f5e9' : '#f5f5f5'};
          border: 1px solid ${value ? '#4caf50' : '#ddd'};
          border-radius: 4px;
          word-break: break-word;
          white-space: normal;
          min-width: 80px;
        `;
        span.className = 'pdf-value-span';
        
        // Replace input with span
        parent.replaceChild(span, input);
      });
      
      const opt = {
        margin: [10, 10, 10, 10],
        filename: `IPQC_Form_${formData.date || new Date().toISOString().split('T')[0]}_${formData.shift || 'NA'}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
          scale: 2,
          useCORS: true,
          letterRendering: true,
          scrollX: 0,
          scrollY: 0,
          onclone: (clonedDoc) => {
            const clonedElement = clonedDoc.querySelector('.ipqc-form-container');
            if (clonedElement) {
              clonedElement.style.width = '100%';
              clonedElement.style.padding = '15px';
              clonedElement.style.fontSize = '12px';
              
              // Style stage cards for PDF
              const stageCards = clonedElement.querySelectorAll('.stage-card');
              stageCards.forEach(card => {
                card.style.marginBottom = '15px';
                card.style.pageBreakInside = 'avoid';
                card.style.border = '1px solid #ddd';
              });
              
              // Style stage tables
              const tables = clonedElement.querySelectorAll('.stage-table');
              tables.forEach(table => {
                table.style.width = '100%';
                table.style.fontSize = '11px';
                table.style.borderCollapse = 'collapse';
              });
              
              // Style all cells
              const cells = clonedElement.querySelectorAll('td, th');
              cells.forEach(cell => {
                cell.style.padding = '6px 8px';
                cell.style.fontSize = '11px';
                cell.style.border = '1px solid #ddd';
              });
              
              // Style sub-results grid
              const subItems = clonedElement.querySelectorAll('.sub-item');
              subItems.forEach(item => {
                item.style.padding = '4px 8px';
                item.style.marginBottom = '4px';
                item.style.background = '#f9f9f9';
              });
              
              // Style header
              const header = clonedElement.querySelector('.ipqc-header');
              if (header) {
                header.style.marginBottom = '20px';
              }
            }
          }
        },
        jsPDF: { 
          unit: 'mm', 
          format: 'a3', 
          orientation: 'landscape'
        },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
      };

      await html2pdf().set(opt).from(element).save();
      
      // Restore original inputs
      const spans = element.querySelectorAll('.pdf-value-span');
      spans.forEach((span, index) => {
        if (originalStates[index]) {
          const { input } = originalStates[index];
          span.parentNode.replaceChild(input, span);
        }
      });
      
      // Restore hidden sections
      if (ocrSection) ocrSection.style.display = '';
      if (actionButtons) actionButtons.style.display = '';
      element.classList.remove('pdf-export-mode');
      
      console.log('PDF generated successfully');
    } catch (error) {
      console.error('Error generating PDF:', error);
      
      // Try to restore inputs on error
      try {
        const element = formContainerRef.current;
        const spans = element.querySelectorAll('.pdf-value-span');
        spans.forEach(span => {
          const input = document.createElement('input');
          input.type = 'text';
          input.value = span.textContent === '-' ? '' : span.textContent;
          span.parentNode.replaceChild(input, span);
        });
        
        const ocrSection = element.querySelector('.ocr-upload-section');
        const actionButtons = element.querySelector('.ipqc-action-buttons');
        if (ocrSection) ocrSection.style.display = '';
        if (actionButtons) actionButtons.style.display = '';
        element.classList.remove('pdf-export-mode');
      } catch (e) {}
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // Export to Excel - EXACT CLONE using ExcelJS (preserves ALL formatting)
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  
  const exportToExcel = async () => {
    setIsExportingExcel(true);
    
    try {
      // Load the template Excel file from public folder
      const response = await fetch('/IPQC Check Sheet.xlsx');
      if (!response.ok) {
        throw new Error('Could not load IPQC Excel template. Please make sure "IPQC Check Sheet.xlsx" is in the public folder.');
      }
      
      const templateBuffer = await response.arrayBuffer();
      console.log('📊 Excel Template fetched, size:', templateBuffer.byteLength);
      
      // Use ExcelJS to load workbook - preserves ALL formatting
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(templateBuffer);
      
      console.log('📊 Workbook loaded. Sheets:', workbook.worksheets.map(ws => ws.name));
      
      // Get worksheet by name or index
      let worksheet = workbook.getWorksheet('IPQC');
      if (!worksheet) {
        worksheet = workbook.worksheets[0]; // First sheet
      }
      
      if (!worksheet) {
        throw new Error('No worksheet found in workbook');
      }
      
      console.log('📊 Excel Template Loaded with ExcelJS:');
      console.log('   Sheet:', worksheet.name);
      console.log('   Rows:', worksheet.rowCount);
      console.log('   Columns:', worksheet.columnCount);
      
      // Helper function to set cell value while preserving ALL existing formatting
      const setCellValue = (cellAddress, value) => {
        if (!value || value === '' || value === undefined) return;
        
        const cell = worksheet.getCell(cellAddress);
        
        // Store existing style before setting value
        const existingStyle = {
          font: cell.font ? { ...cell.font } : undefined,
          fill: cell.fill ? { ...cell.fill } : undefined,
          border: cell.border ? { ...cell.border } : undefined,
          alignment: cell.alignment ? { ...cell.alignment } : undefined,
          numFmt: cell.numFmt
        };
        
        // Set the value
        cell.value = String(value);
        
        // Restore all formatting
        if (existingStyle.font) cell.font = existingStyle.font;
        if (existingStyle.fill) cell.fill = existingStyle.fill;
        if (existingStyle.border) cell.border = existingStyle.border;
        if (existingStyle.alignment) cell.alignment = existingStyle.alignment;
        if (existingStyle.numFmt) cell.numFmt = existingStyle.numFmt;
      };
      
      // Fill header information (Row 4)
      if (formData.date) {
        setCellValue('A4', `Date :- ${formData.date}`);
      }
      if (formData.time) {
        setCellValue('D4', `Time :- ${formData.time}`);
      }
      if (formData.shift) {
        setCellValue('G4', formData.shift);
      }
      if (formData.poNo) {
        setCellValue('I4', formData.poNo);
      }
      
      // IPQC Checkpoint to Excel Cell Mapping (1-indexed rows for ExcelJS)
      const checkpointCellMapping = {
        // Stage 1: Shop Floor (Sr 1-2)
        1: { cells: ['H7'] },   // Temperature
        2: { cells: ['H8'] },   // Humidity
        
        // Stage 2: Glass Loader (Sr 3-4)
        3: { cells: ['H9'] },   // Glass dimension
        4: { cells: ['H10'] },  // Appearance
        
        // Stage 3: EVA/EPE Cutting (Sr 5-7)
        5: { cells: ['H11'] },  // EVA/EPE Type
        6: { cells: ['H12'] },  // EVA/EPE dimension
        7: { cells: ['H13'] },  // EVA/EPE Status
        
        // Stage 4: Eva/EPE Soldering (Sr 8)
        8: { cells: ['H14'], subKeys: ['Temp', 'Quality'], subCells: ['H14', 'N14'] },
        
        // Stage 5: Cell Loading (Sr 9-14)
        9: { cells: ['H15'] },   // Cell Manufacturer
        10: { cells: ['H16'] },  // Cell Size
        11: { cells: ['H17'] },  // Cell Condition
        12: { cells: ['H18'] },  // Cleanliness
        13: { cells: ['H19'], subKeys: ['ATW Temp'], subCells: ['H19'] },
        14: { cells: ['H20'] },  // Cell Cross cutting
        
        // Stage 6: Tabber & Stringer (Sr 15-20)
        15: { cells: ['H21'], subKeys: ['ATW Temp'], subCells: ['H21'] },
        16: { cells: ['H22'], subKeys: ['TS01A', 'TS01B', 'TS02A', 'TS02B', 'TS03A', 'TS03B', 'TS04A', 'TS04B'], subCells: ['H22', 'I22', 'J22', 'K22', 'L22', 'M22', 'N22', 'O22'] },
        17: { cells: ['H24'], subKeys: ['TS01A', 'TS01B', 'TS02A', 'TS02B', 'TS03A', 'TS03B', 'TS04A', 'TS04B'], subCells: ['H24', 'I24', 'J24', 'K24', 'L24', 'M24', 'N24', 'O24'] },
        18: { cells: ['H26'], subKeys: ['TS01A', 'TS01B', 'TS02A', 'TS02B', 'TS03A', 'TS03B', 'TS04A', 'TS04B'], subCells: ['H26', 'I26', 'J26', 'K26', 'L26', 'M26', 'N26', 'O26'] },
        19: { cells: ['H28'], subKeys: ['TS01A', 'TS01B', 'TS02A', 'TS02B', 'TS03A', 'TS03B', 'TS04A', 'TS04B'], subCells: ['H28', 'I28', 'J28', 'K28', 'L28', 'M28', 'N28', 'O28'] },
        20: { cells: ['H30'], subKeys: ['Ribbon to cell'], subCells: ['H30'] },
        
        // Stage 7: Auto bussing, layup & Tapping (Sr 21-28)
        21: { cells: ['H32'] },  // String to String Gap
        22: { cells: ['H33'], subKeys: ['TOP', 'Bottom', 'Sides'], subCells: ['H33', 'H34', 'H35'] },
        23: { cells: ['H36'], subKeys: ['Ribbon to busbar'], subCells: ['H36'] },
        24: { cells: ['H38'] },  // Terminal busbar
        25: { cells: ['H40'] },  // Soldering Quality
        26: { cells: ['H41'] },  // Top & Bottom Creepage
        27: { cells: ['H42'] },  // Verification of Process
        28: { cells: ['H43'] },  // Quality of auto taping
        
        // Stage 8: Auto RFID Logo/Barcode (Sr 29)
        29: { cells: ['H44'] },  // Position verification
        
        // Stage 9: EVA/EPE cutting 2 (Sr 30-32)
        30: { cells: ['H45'] },  // EVA/EPE Type
        31: { cells: ['H46'] },  // EVA/EPE dimension
        32: { cells: ['H47'] },  // EVA/EPE Status
        
        // Stage 10: Back Glass Loader (Sr 33-34)
        33: { cells: ['H48'] },  // Glass dimension
        34: { cells: ['H50'] },  // No. of Holes
        
        // Stage 11: Auto Busbar Flatten (Sr 35)
        35: { cells: ['H51'] },  // Visual Inspection
        
        // Stage 12: Pre lamination EL (Sr 36)
        36: { cells: ['H53'], subKeys: ['S1', 'S2', 'S3'], subCells: ['H53', 'I53', 'J53'] },
        
        // Stage 13: String Rework Station (Sr 37-38)
        37: { cells: ['H58'] },  // Cleaning
        38: { cells: ['H59'], subKeys: ['Temp', 'Time'], subCells: ['H59', 'L59'] },
        
        // Stage 14: Module Rework Station (Sr 39-41)
        39: { cells: ['H60'] },  // Method of Rework
        40: { cells: ['H61'] },  // Cleaning
        41: { cells: ['H62'], subKeys: ['Temp', 'Time'], subCells: ['H62', 'L62'] },
        
        // Stage 15: Laminator (Sr 42-45)
        42: { cells: ['H63'] },  // Monitoring Parameters
        43: { cells: ['H64'] },  // Cleaning
        44: { cells: ['H65'], subKeys: ['Ref'], subCells: ['H65'] },
        45: { cells: ['H66'], subKeys: ['Ref'], subCells: ['H66'] },
        
        // Stage 16: Auto Tape Removing (Sr 46)
        46: { cells: ['H67'] },  // Visual Check
        
        // Stage 17: Auto Edge Trimming (Sr 47-48)
        47: { cells: ['H68'], subKeys: ['S1', 'S2', 'S3', 'S4', 'S5'], subCells: ['H68', 'H69', 'H70', 'H71', 'H72'] },
        48: { cells: ['H73'] },  // Trimming Blade
        
        // Stage 18: 90° Visual (Sr 49)
        49: { cells: ['H74'], subKeys: ['S1', 'S2', 'S3', 'S4', 'S5'], subCells: ['H74', 'H75', 'H76', 'H77', 'H78'] },
        
        // Stage 19: Framing (Sr 50-53)
        50: { cells: ['H79'] },  // Glue uniformity
        51: { cells: ['H80'], subKeys: ['Ref'], subCells: ['H80'] },
        52: { cells: ['H82'] },  // Long Side Glue
        53: { cells: ['H83'] },  // Anodizing
        
        // Stage 20: Junction Box (Sr 54-55)
        54: { cells: ['H84'] },  // Junction Box Check
        55: { cells: ['H86'] },  // Silicon Glue Weight
        
        // Stage 21: Auto JB (Sr 56-58)
        56: { cells: ['H87'] },  // Max Welding time
        57: { cells: ['H88'] },  // Soldering current
        58: { cells: ['H89'] },  // Soldering Quality
        
        // Stage 22: JB Potting (Sr 59-61)
        59: { cells: ['H90'], subKeys: ['Ref'], subCells: ['H90'] },
        60: { cells: ['H91'] },  // Potting weight
        61: { cells: ['H92'], subKeys: ['Time'], subCells: ['H92'] },
        
        // Stage 23: OLE Potting Inspection (Sr 62)
        62: { cells: ['H93'] },  // Visual Check
        
        // Stage 24: Curing (Sr 63-65)
        63: { cells: ['H94'] },  // Temperature
        64: { cells: ['H95'] },  // Humidity
        65: { cells: ['H96'] },  // Curing Time
        
        // Stage 25: Buffing (Sr 66)
        66: { cells: ['H97'] },  // Corner Edge
        
        // Stage 26: Cleaning (Sr 67)
        67: { cells: ['H98'], subKeys: ['S1', 'S2', 'S3', 'S4', 'S5'], subCells: ['H98', 'H99', 'H100', 'H101', 'H102'] },
        
        // Stage 27: Flash Tester (Sr 68-72)
        68: { cells: ['H103'] }, // Ambient Temp
        69: { cells: ['H104'] }, // Module Temp
        70: { cells: ['H105'] }, // Sunsimulator
        71: { cells: ['H106'] }, // Validation
        72: { cells: ['H107'] }, // Silver Ref EL
        
        // Stage 28: Hipot Test (Sr 73)
        73: { cells: ['H108'], subKeys: ['Sample 1', 'Sample 2', 'Sample 3', 'Sample 4', 'Sample 5'], subCells: ['H108', 'H109', 'H110', 'H111', 'H112'] },
        
        // Stage 29: Post EL (Sr 74-75)
        74: { cells: ['H113'] }, // Voltage & Current
        75: { cells: ['H114'], subKeys: ['S1', 'S2', 'S3'], subCells: ['H114', 'H115', 'H116'] },
        
        // Stage 30: RFID (Sr 76-77)
        76: { cells: ['H119'] }, // RFID Position
        77: { cells: ['H120'] }, // Cell & Module Make
        
        // Stage 31: Final Visual (Sr 78-79)
        78: { cells: ['H121'], subKeys: ['S1', 'S2', 'S3', 'S4', 'S5'], subCells: ['H121', 'H122', 'H123', 'H124', 'H125'] },
        79: { cells: ['H126'], subKeys: ['S1', 'S2', 'S3', 'S4', 'S5'], subCells: ['H126', 'H127', 'H128', 'H129', 'H130'] },
        
        // Stage 32: Dimension (Sr 80-84)
        80: { cells: ['H131'] }, // L*W & Profile
        81: { cells: ['H132'] }, // Mounting Hole
        82: { cells: ['H133'] }, // Diagonal Diff
        83: { cells: ['H134'] }, // Corner Gap
        84: { cells: ['H135'] }, // JB Cable length
        
        // Stage 33: Packaging (Sr 85-88)
        85: { cells: ['H136'] }, // Packaging Label
        86: { cells: ['H137'] }, // Content in Box
        87: { cells: ['H138'] }, // Box Condition
        88: { cells: ['H139'] }  // Pallet dimension
      };
      
      // Fill checkpoints data
      let filledCount = 0;
      
      // Debug: Log all form data first
      console.log('========= EXCEL EXPORT DEBUG =========');
      console.log('📋 Header:', { date: formData.date, time: formData.time, shift: formData.shift, poNo: formData.poNo });
      console.log('📋 Total Checkpoints:', formData.checkpoints.length);
      
      // Log all checkpoints that have data
      formData.checkpoints.forEach((cp, idx) => {
        const sr = cp.subResults || {};
        const hasData = sr.result || Object.keys(sr).filter(k => sr[k]).length > 0;
        if (hasData) {
          console.log(`📌 Index ${idx}, SR ${cp.sr}: ${cp.checkpoint}`, sr);
        }
      });
      
      console.log('========= STARTING CELL FILL =========');
      
      formData.checkpoints.forEach((checkpoint, index) => {
        const mapping = checkpointCellMapping[checkpoint.sr];
        if (!mapping) {
          return;
        }
        
        const subResults = checkpoint.subResults || {};
        const resultValue = subResults.result;
        const hasSubKeys = Object.keys(subResults).filter(k => k !== 'result' && subResults[k]).length > 0;
        
        // Only log if there's data
        if (resultValue || hasSubKeys) {
          console.log(`🔍 Processing SR ${checkpoint.sr}: ${checkpoint.checkpoint}`);
          console.log(`   Data:`, subResults);
        }
        
        // First check: if there's a 'result' key, fill the first cell
        if (resultValue !== undefined && resultValue !== '' && resultValue !== null) {
          const cellAddr = mapping.cells[0];
          console.log(`   ✅ Writing to ${cellAddr}: "${resultValue}"`);
          setCellValue(cellAddr, resultValue);
          filledCount++;
        }
        
        // Second check: if there are sub-fields mapping
        if (mapping.subKeys && mapping.subCells) {
          mapping.subKeys.forEach((key, idx) => {
            const value = subResults[key];
            if (value !== undefined && value !== '' && value !== null && mapping.subCells[idx]) {
              console.log(`   ✅ Writing [${key}] to ${mapping.subCells[idx]}: "${value}"`);
              setCellValue(mapping.subCells[idx], value);
              filledCount++;
            }
          });
        }
        
        // Third check: fill any other keys in subResults
        const otherKeys = Object.keys(subResults).filter(k => k !== 'result' && (!mapping.subKeys || !mapping.subKeys.includes(k)));
        otherKeys.forEach((key, idx) => {
          const value = subResults[key];
          if (value !== undefined && value !== '' && value !== null) {
            const cellToUse = mapping.cells[Math.min(idx, mapping.cells.length - 1)];
            console.log(`   ✅ Writing [${key}] to ${cellToUse}: "${value}" (auto)`);
            setCellValue(cellToUse, value);
            filledCount++;
          }
        });
      });
      
      console.log(`========= FILL COMPLETE: ${filledCount} cells =========`);
      
      // Generate filename with form details
      const filename = `IPQC_Filled_${formData.date || new Date().toISOString().split('T')[0]}_${formData.shift || 'NA'}_${selectedChecklist?.lineName || 'Unknown'}.xlsx`;
      
      // Write workbook to buffer - ExcelJS preserves ALL formatting automatically
      const outputBuffer = await workbook.xlsx.writeBuffer();
      
      // Download the file
      const blob = new Blob([outputBuffer], { 
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
      
      console.log(`✅ Excel exported: ${filename}, Cells filled: ${filledCount}`);
      
    } catch (error) {
      console.error('Error exporting to Excel:', error);
    } finally {
      setIsExportingExcel(false);
    }
  };

  // Test Export - Fill dummy data to verify Excel writing works
  const testExportToExcel = async () => {
    setIsExportingExcel(true);
    
    try {
      console.log('🧪 TEST: Fetching template...');
      const response = await fetch('/IPQC Check Sheet.xlsx');
      if (!response.ok) {
        throw new Error('Could not load IPQC Excel template');
      }
      
      const templateBuffer = await response.arrayBuffer();
      console.log('🧪 TEST: Template loaded, size:', templateBuffer.byteLength);
      
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(templateBuffer);
      
      console.log('🧪 TEST: Workbook loaded');
      console.log('🧪 TEST: Sheet names:', workbook.worksheets.map(ws => ws.name));
      console.log('🧪 TEST: Sheet count:', workbook.worksheets.length);
      
      // Get worksheet by name or index
      let worksheet = workbook.getWorksheet('IPQC');
      if (!worksheet) {
        worksheet = workbook.worksheets[0]; // First sheet
      }
      
      if (!worksheet) {
        throw new Error('No worksheet found in workbook. Sheets: ' + workbook.worksheets.map(ws => ws.name).join(', '));
      }
      
      console.log('🧪 TEST: Worksheet found:', worksheet.name);
      console.log('🧪 TEST: Row count:', worksheet.rowCount);
      
      // Test: Write to some cells with dummy data
      const testData = [
        { cell: 'A4', value: 'Date :- 2026-01-16' },
        { cell: 'D4', value: 'Time :- 10:30' },
        { cell: 'G4', value: 'Day' },
        { cell: 'I4', value: 'PO-12345' },
        { cell: 'H7', value: '25.5°C' },
        { cell: 'H8', value: '45%' },
        { cell: 'H9', value: '2278*1134*3.2' },
        { cell: 'H10', value: 'OK' },
        { cell: 'H11', value: 'FIRST EVA' },
        { cell: 'H12', value: '2282*1138*0.45' },
        { cell: 'H15', value: 'AIKO 23.8%' },
        { cell: 'H20', value: 'OK - Equal cutting' },
      ];
      
      testData.forEach(({ cell, value }) => {
        try {
          const cellObj = worksheet.getCell(cell);
          cellObj.value = value;
          console.log(`✅ TEST: ${cell} = "${value}"`);
        } catch (e) {
          console.error(`❌ Failed to write ${cell}:`, e);
        }
      });
      
      const outputBuffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([outputBuffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'IPQC_TEST_Export.xlsx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      console.log('🧪 TEST Excel exported with test data');
      
    } catch (error) {
      console.error('Test export error:', error);
    } finally {
      setIsExportingExcel(false);
    }
  };

  // Smart Export to Excel using LLM AI mapping
  const [isSmartExporting, setIsSmartExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState('');
  
  const smartExportToExcel = async () => {
    setIsSmartExporting(true);
    setExportProgress('Starting...');
    
    try {
      const result = await exportIPQCToExcel(formData, (progress) => {
        setExportProgress(progress);
        console.log('📊 Export Progress:', progress);
      });
      
      // Download the file
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      console.log('🤖 LLM Mappings Used:', result.mappings);
      
      console.log(`✅ Smart Excel Export Complete: ${result.filename}`);
      
    } catch (error) {
      console.error('Smart Export Error:', error);
    } finally {
      setIsSmartExporting(false);
      setExportProgress('');
    }
  };

  // OCR Upload and Processing - Multiple Files
  const handleOCRUpload = async (event) => {
    const files = Array.from(event.target.files);
    if (!files || files.length === 0) return;

    setIsProcessingOCR(true);
    setOcrProgress({ current: 0, total: files.length });
    
    let allExtractedText = '';

    try {
      // Process each file sequentially
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setOcrProgress({ current: i + 1, total: files.length });
        
        console.log(`Processing file ${i + 1}/${files.length}: ${file.name}`);
        
        try {
          const text = await processFile(file);
          allExtractedText += `\n--- Page ${i + 1} ---\n${text}\n`;
          console.log(`Page ${i + 1} OCR completed`);
        } catch (err) {
          console.error(`Error processing file ${i + 1}:`, err);
        }
      }

      console.log('All OCR Extracted Text:', allExtractedText);
      
      // Parse and update form with all extracted data
      parseAndUpdateForm(allExtractedText);
      
      console.log(`✅ OCR completed! Processed ${files.length} page(s)`);
    } catch (err) {
      console.error('Upload Error:', err);
    } finally {
      setIsProcessingOCR(false);
      setOcrProgress({ current: 0, total: 0 });
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Process single file
  const processFile = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const text = await extractTextFromImage(e.target.result);
          resolve(text);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  const parseAndUpdateForm = (text) => {
    console.log('=== Starting IPQC Parser (All 33 Stages) ===');
    console.log('🚫 NO DEFAULT VALUES - Only actual OCR data will be used');
    
    const newFormData = { ...formData };
    const newCheckpoints = [...newFormData.checkpoints];

    // Parse ALL stages using trained parser
    console.log('🔍 Parsing All 33 Stages with trained parser...');
    const data = parseIPQCAllStages(text);
    console.log('✅ Parsed Data:', data);

    // NO DEFAULT VALUES - Only use actual OCR extracted data
    // Helper function to set result ONLY if value exists
    const setResult = (index, value) => {
      if (!newCheckpoints[index].subResults) {
        newCheckpoints[index].subResults = {};
      }
      if (value && value.toString().trim()) {
        newCheckpoints[index].subResults['result'] = value;
        console.log(`✅ Checkpoint ${index + 1}: ${value}`);
      } else {
        console.log(`❌ Checkpoint ${index + 1}: No OCR data found`);
      }
    };

    // Helper to set subResults ONLY if values exist
    const setSubResults = (index, dataObj) => {
      if (!dataObj || Object.keys(dataObj).length === 0) {
        console.log(`❌ Checkpoint ${index + 1}: No subResults data found`);
        return;
      }
      
      if (!newCheckpoints[index].subResults) {
        newCheckpoints[index].subResults = {};
      }
      
      let hasValue = false;
      for (const key in dataObj) {
        if (dataObj[key] && dataObj[key].toString().trim()) {
          newCheckpoints[index].subResults[key] = dataObj[key];
          hasValue = true;
        }
      }
      
      if (hasValue) {
        console.log(`✅ Checkpoint ${index + 1} subResults set:`, dataObj);
      } else {
        console.log(`❌ Checkpoint ${index + 1}: Empty subResults data`);
      }
    };

    // ======== HEADER INFO ========
    // Extract date from text
    const dateMatch = text.match(/Date\s*[:-]?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
    if (dateMatch) newFormData.date = dateMatch[1];
    
    // Extract shift
    const shiftMatch = text.match(/Shift\s*[:-]?\s*(Night|Day|Morning|Evening)/i);
    if (shiftMatch) newFormData.shift = shiftMatch[1];
    
    // Extract time
    if (data.temperatureTime) newFormData.time = data.temperatureTime;

    // ======== STAGE 1: Shop Floor (sr 1-2, index 0-1) ========
    setResult(0, data.temperature);
    if (data.temperatureTime) {
      if (!newCheckpoints[0].subResults) newCheckpoints[0].subResults = {};
      newCheckpoints[0].subResults['Time'] = data.temperatureTime;
    }
    setResult(1, data.humidity);
    if (data.humidityTime) {
      if (!newCheckpoints[1].subResults) newCheckpoints[1].subResults = {};
      newCheckpoints[1].subResults['Time'] = data.humidityTime;
    }

    // ======== STAGE 2: Glass Loader (sr 3-4, index 2-3) ========
    setResult(2, data.frontGlassDimension);
    setResult(3, data.appearance);

    // ======== STAGE 3: EVA Cutting (sr 5-7, index 4-6) ========
    setResult(4, data.eva1Type);
    setResult(5, data.eva1Dimension);
    setResult(6, data.evaManufacturingDate ? `OK / ${data.evaManufacturingDate}` : data.evaStatusOk);

    // ======== STAGE 3.5: EVA Soldering at edge (sr 8, index 7) ========
    if (data.evaSolderingTemp || data.solderingTemperature) {
      setSubResults(7, { 'Temp': data.evaSolderingTemp || data.solderingTemperature, 'Quality': data.solderingQuality || '' });
    }

    // ======== STAGE 4: Cell Loading (sr 9-14, index 8-13) ========
    if (data.cellManufacturer || data.cellEfficiency) {
      setResult(8, `${data.cellManufacturer || ''} ${data.cellEfficiency || ''}`.trim());
    }
    setResult(9, data.cellSize);
    setResult(10, data.cellCondition);
    setResult(11, data.cleanliness);
    // Verification of Process Parameter (sr 13, index 12)
    if (data.processVerification || data.atwTemp) {
      setSubResults(12, { 'ATW Temp': data.atwTemp || '' });
      setResult(12, data.processVerification);
    }
    setResult(13, data.crossCutting);

    // ======== STAGE 6: Tabber & Stringer (sr 15-20, index 14-19) ========
    if (data.tabberProcessVerification || data.tabberAtwTemp) {
      setSubResults(14, { 'ATW Temp': data.tabberAtwTemp || '' });
      setResult(14, data.tabberProcessVerification);
    }
    
    // Visual Check (sr 16, index 15)
    if (data.visualCheckTS01A) {
      setSubResults(15, {
        'TS01A': data.visualCheckTS01A, 'TS01B': data.visualCheckTS01B,
        'TS02A': data.visualCheckTS02A, 'TS02B': data.visualCheckTS02B,
        'TS03A': data.visualCheckTS03A, 'TS03B': data.visualCheckTS03B,
        'TS04A': data.visualCheckTS04A, 'TS04B': data.visualCheckTS04B
      });
    }
    
    // EL Image (sr 17, index 16)
    if (data.elImageTS01A) {
      setSubResults(16, {
        'TS01A': data.elImageTS01A, 'TS01B': data.elImageTS01B,
        'TS02A': data.elImageTS02A, 'TS02B': data.elImageTS02B,
        'TS03A': data.elImageTS03A, 'TS03B': data.elImageTS03B,
        'TS04A': data.elImageTS04A, 'TS04B': data.elImageTS04B
      });
    }
    // String Length (sr 18, index 17)
    if (data.stringLengthTS01A) {
      setSubResults(17, {
        'TS01A': data.stringLengthTS01A, 'TS01B': data.stringLengthTS01B,
        'TS02A': data.stringLengthTS02A, 'TS02B': data.stringLengthTS02B,
        'TS03A': data.stringLengthTS03A, 'TS03B': data.stringLengthTS03B,
        'TS04A': data.stringLengthTS04A, 'TS04B': data.stringLengthTS04B
      });
    }
    // Cell Gap (sr 19, index 18)
    if (data.cellGapTS01A) {
      setSubResults(18, {
        'TS01A': data.cellGapTS01A, 'TS01B': data.cellGapTS01B,
        'TS02A': data.cellGapTS02A, 'TS02B': data.cellGapTS02B,
        'TS03A': data.cellGapTS03A, 'TS03B': data.cellGapTS03B,
        'TS04A': data.cellGapTS04A, 'TS04B': data.cellGapTS04B
      });
    }
    // Peel Strength (sr 20, index 19) - has 'Ribbon to cell' subResult
    if (data.tabberPeelStrength) {
      setSubResults(19, { 'Ribbon to cell': data.tabberPeelStrength });
    }

    // ======== STAGE 7: Auto Bussing (sr 21-28, index 20-27) ========
    setResult(20, data.stringToStringGap);
    // Cell edge to Glass edge distance (sr 22, index 21)
    if (data.cellEdgeTop || data.cellEdgeBottom || data.cellEdgeSides) {
      setSubResults(21, {
        'TOP': data.cellEdgeTop || '',
        'Bottom': data.cellEdgeBottom || '',
        'Sides': data.cellEdgeSides || ''
      });
      setResult(21, `Top: ${data.cellEdgeTop || '-'}, Bottom: ${data.cellEdgeBottom || '-'}, Sides: ${data.cellEdgeSides || '-'}`);
    }
    // Soldering Peel Strength (sr 23, index 22)
    if (data.busbarPeelStrength) {
      setSubResults(22, { 'Ribbon to busbar': data.busbarPeelStrength });
      setResult(22, data.busbarPeelStrength);
    }
    setResult(23, data.terminalBusbar);
    if (data.solderingQuality1) {
      setResult(24, `${data.solderingQuality1}, ${data.solderingQuality2 || ''}, ${data.solderingQuality3 || ''}`);
    }
    if (data.creepageTop) {
      setResult(25, `Top: ${data.creepageTop}, ${data.creepageTop2 || ''}, ${data.creepageTop3 || ''} | Bottom: ${data.creepageBottom || ''}, ${data.creepageBottom2 || ''}, ${data.creepageBottom3 || ''}`);
    }
    setResult(26, data.processVerificationAuto);
    if (data.autoTaping1) {
      setResult(27, `${data.autoTaping1}, ${data.autoTaping2 || ''}, ${data.autoTaping3 || ''}`);
    }

    // ======== STAGE 8: Auto RFID (sr 29, index 28) ========
    if (data.positionVerification1) {
      setResult(28, `${data.positionVerification1}, ${data.positionVerification2 || ''}, ${data.positionVerification3 || ''}`);
    }

    // ======== STAGE 9: EVA Cutting 2 (sr 30-32, index 29-31) ========
    setResult(29, data.eva2Type);
    setResult(30, data.eva2Dimension);
    setResult(31, data.eva2Status);

    // ======== STAGE 10: Back Glass (sr 33-34, index 32-33) ========
    setResult(32, data.backGlassDimension);
    if (data.numberOfHoles) {
      setResult(33, `${data.numberOfHoles}; ${data.holesDimension1 || ''}, ${data.holesDimension2 || ''}, ${data.holesDimension3 || ''}`);
    }

    // ======== STAGE 11: Auto Busbar Flatten (sr 35, index 34) ========
    if (data.visualInspection1) {
      setResult(34, `${data.visualInspection1}, ${data.visualInspection2 || ''}, ${data.visualInspection3 || ''}, ${data.visualInspection4 || ''}, ${data.visualInspection5 || ''}`);
    }

    // ======== STAGE 12: Pre-Lam EL (sr 36, index 35) ========
    if (data.elInspectionBarcodes && data.elInspectionBarcodes.length > 0) {
      setSubResults(35, {
        'S1': data.elInspectionBarcodes[0] ? `${data.elInspectionBarcodes[0].barcode} - ${data.elInspectionBarcodes[0].result || ''}` : '',
        'S2': data.elInspectionBarcodes[1] ? `${data.elInspectionBarcodes[1].barcode} - ${data.elInspectionBarcodes[1].result || ''}` : '',
        'S3': data.elInspectionBarcodes[2] ? `${data.elInspectionBarcodes[2].barcode} - ${data.elInspectionBarcodes[2].result || ''}` : ''
      });
      setResult(35, data.elInspectionBarcodes.map(b => b.barcode).join(', '));
    }

    // ======== STAGE 13: String Rework (sr 37-38, index 36-37) ========
    setResult(36, data.cleaningStatus);
    if (data.solderingIronTemp) {
      setResult(37, data.solderingIronTemp);
      if (!newCheckpoints[37].subResults) newCheckpoints[37].subResults = {};
      newCheckpoints[37].subResults['Time'] = data.solderingIronTime || '';
    }

    // ======== STAGE 14: Module Rework (sr 39-41, index 38-40) ========
    setResult(38, data.methodOfRework);
    setResult(39, data.reworkCleaningStatus);
    if (data.reworkSolderingTemp) {
      setResult(40, data.reworkSolderingTemp);
      if (!newCheckpoints[40].subResults) newCheckpoints[40].subResults = {};
      newCheckpoints[40].subResults['Time'] = data.reworkSolderingTime || '';
    }

    // ======== STAGE 15: Laminator (sr 42-45, index 41-44) ========
    setResult(41, data.laminatorMonitoring);
    setResult(42, data.diaphragmCleaning);
    // Point 44 - Peel of Test (has Ref subResult)
    if (data.peelTestRef) {
      setSubResults(43, { 'Ref': data.peelTestRef });
    }
    // Point 45 - Gel Content Test (has Ref subResult)
    if (data.gelContentRef) {
      setSubResults(44, { 'Ref': data.gelContentRef });
    }

    // ======== STAGE 16: Auto Tape Removing (sr 46, index 45) ========
    if (data.visualCheck1) {
      setResult(45, `${data.visualCheck1}, ${data.visualCheck2 || ''}, ${data.visualCheck3 || ''}, ${data.visualCheck4 || ''}, ${data.visualCheck5 || ''}`);
    }

    // ======== STAGE 17: Auto Edge Trimming (sr 47-48, index 46-47) ========
    if (data.trimmingSNo1) {
      setSubResults(46, {
        'S1': data.trimmingSNo1, 'S2': data.trimmingSNo2 || '', 'S3': data.trimmingSNo3 || '',
        'S4': data.trimmingSNo4 || '', 'S5': data.trimmingSNo5 || ''
      });
    }
    setResult(47, data.bladeLifeCycle);

    // ======== STAGE 18: 90° Visual (sr 49, index 48) ========
    if (data.visualSNo1) {
      setSubResults(48, {
        'S1': `${data.visualSNo1} - ${data.visualResult1 || ''}`,
        'S2': `${data.visualSNo2 || ''} - ${data.visualResult2 || ''}`,
        'S3': `${data.visualSNo3 || ''} - ${data.visualResult3 || ''}`,
        'S4': `${data.visualSNo4 || ''} - ${data.visualResult4 || ''}`,
        'S5': `${data.visualSNo5 || ''} - ${data.visualResult5 || ''}`
      });
    }

    // ======== STAGE 19: Framing (sr 50-53, index 49-52) ========
    setResult(49, data.glueUniformity);
    if (data.shortSideGlueRef) {
      setSubResults(50, { 'Ref': data.shortSideGlueRef });
    }
    if (data.longSideGlueRef) {
      setResult(51, data.longSideGlueRef);
    }
    setResult(52, data.anodizingThickness);

    // ======== STAGE 20: Junction Box (sr 54-55, index 53-54) ========
    if (data.jbAppearance || data.jbCableLength) {
      setResult(53, `${data.jbAppearance || ''} / ${data.jbCableLength || ''}`);
    }
    setResult(54, data.siliconGlueWeight);

    // ======== STAGE 21: Auto JB Soldering (sr 56-58, index 55-57) ========
    setResult(55, data.maxWeldingTime);
    setResult(56, data.solderingCurrent);
    setResult(57, data.solderingQuality);

    // ======== STAGE 22: JB Potting (sr 59-61, index 58-60) ========
    if (data.glueRatioRef) {
      setSubResults(58, { 'Ref': data.glueRatioRef });
    }
    setResult(59, data.pottingWeight);
    if (data.nozzleChangeTime1) {
      setSubResults(60, { 'Time': `${data.nozzleChangeTime1} - ${data.nozzleChangeTime2 || ''}` });
    }

    // ======== STAGE 23: OLE Potting (sr 62, index 61) ========
    if (data.oleVisualCheck1) {
      setResult(61, `${data.oleVisualCheck1}, ${data.oleVisualCheck2 || ''}, ${data.oleVisualCheck3 || ''}, ${data.oleVisualCheck4 || ''}, ${data.oleVisualCheck5 || ''}`);
    }

    // ======== STAGE 24: Curing (sr 63-65, index 62-64) ========
    setResult(62, data.curingTemperature);
    setResult(63, data.curingHumidity);
    setResult(64, data.curingTime);

    // ======== STAGE 25: Buffing (sr 66, index 65) ========
    if (data.buffingCheck1) {
      setResult(65, `${data.buffingCheck1}, ${data.buffingCheck2 || ''}, ${data.buffingCheck3 || ''}, ${data.buffingCheck4 || ''}, ${data.buffingCheck5 || ''}`);
    }

    // ======== STAGE 26: Cleaning (sr 67, index 66) ========
    if (data.cleaningSNo1) {
      setSubResults(66, {
        'S1': `${data.cleaningSNo1} - ${data.cleaningResult1 || ''}`,
        'S2': `${data.cleaningSNo2 || ''} - ${data.cleaningResult2 || ''}`,
        'S3': `${data.cleaningSNo3 || ''} - ${data.cleaningResult3 || ''}`,
        'S4': `${data.cleaningSNo4 || ''} - ${data.cleaningResult4 || ''}`,
        'S5': `${data.cleaningSNo5 || ''} - ${data.cleaningResult5 || ''}`
      });
    }

    // ======== STAGE 27: Flash Tester (sr 68-72, index 67-71) ========
    setResult(67, data.ambientTemp);
    setResult(68, data.moduleTemp);
    setResult(69, data.sunsimulatorCalibration);
    setResult(70, data.validation);
    setResult(71, data.silverRefEL);

    // ======== STAGE 28: Hipot Test (sr 73, index 72) ========
    if (data.hipotSNo1 || data.dcw1) {
      setSubResults(72, {
        'Sample 1': data.hipotSNo1 ? `${data.hipotSNo1}: DCW=${data.dcw1 || '-'}, IR=${data.ir1 || '-'}, GC=${data.gc1 || '-'}` : '',
        'Sample 2': data.hipotSNo2 ? `${data.hipotSNo2}: DCW=${data.dcw2 || '-'}, IR=${data.ir2 || '-'}, GC=${data.gc2 || '-'}` : '',
        'Sample 3': data.hipotSNo3 ? `${data.hipotSNo3}: DCW=${data.dcw3 || '-'}, IR=${data.ir3 || '-'}, GC=${data.gc3 || '-'}` : '',
        'Sample 4': data.hipotSNo4 ? `${data.hipotSNo4}: DCW=${data.dcw4 || '-'}, IR=${data.ir4 || '-'}, GC=${data.gc4 || '-'}` : '',
        'Sample 5': data.hipotSNo5 ? `${data.hipotSNo5}: DCW=${data.dcw5 || '-'}, IR=${data.ir5 || '-'}, GC=${data.gc5 || '-'}` : ''
      });
    }

    // ======== STAGE 29: Post EL (sr 74-75, index 73-74) ========
    if (data.voltage || data.current) {
      setResult(73, `${data.voltage || ''} ${data.current || ''}`);
    }
    if (data.elSNo1) {
      setSubResults(74, {
        'S1': `${data.elSNo1} - ${data.elResult1 || ''}`,
        'S2': `${data.elSNo2 || ''} - ${data.elResult2 || ''}`,
        'S3': `${data.elSNo3 || ''} - ${data.elResult3 || ''}`,
        'S4': `${data.elSNo4 || ''} - ${data.elResult4 || ''}`,
        'S5': `${data.elSNo5 || ''} - ${data.elResult5 || ''}`
      });
    }

    // ======== STAGE 30: RFID (sr 76-77, index 75-76) ========
    setResult(75, data.rfidPosition);
    if (data.cellMakeMonth || data.moduleMakeMonth) {
      setResult(76, `Cell: ${data.cellMakeMonth || ''}, Module: ${data.moduleMakeMonth || ''}`);
    }

    // ======== STAGE 31: Final Visual (sr 78-79, index 77-78) ========
    if (data.visualInspectionBarcodes && data.visualInspectionBarcodes.length > 0) {
      setSubResults(77, {
        'S1': `${data.visualInspectionBarcodes[0]?.barcode || ''} - ${data.visualInspectionBarcodes[0]?.result || ''}`,
        'S2': `${data.visualInspectionBarcodes[1]?.barcode || ''} - ${data.visualInspectionBarcodes[1]?.result || ''}`,
        'S3': `${data.visualInspectionBarcodes[2]?.barcode || ''} - ${data.visualInspectionBarcodes[2]?.result || ''}`,
        'S4': `${data.visualInspectionBarcodes[3]?.barcode || ''} - ${data.visualInspectionBarcodes[3]?.result || ''}`,
        'S5': `${data.visualInspectionBarcodes[4]?.barcode || ''} - ${data.visualInspectionBarcodes[4]?.result || ''}`
      });
    }
    if (data.backlabelBarcodes && data.backlabelBarcodes.length > 0) {
      setSubResults(78, {
        'S1': `${data.backlabelBarcodes[0]?.barcode || ''} - ${data.backlabelBarcodes[0]?.result || ''}`,
        'S2': `${data.backlabelBarcodes[1]?.barcode || ''} - ${data.backlabelBarcodes[1]?.result || ''}`,
        'S3': `${data.backlabelBarcodes[2]?.barcode || ''} - ${data.backlabelBarcodes[2]?.result || ''}`,
        'S4': `${data.backlabelBarcodes[3]?.barcode || ''} - ${data.backlabelBarcodes[3]?.result || ''}`,
        'S5': `${data.backlabelBarcodes[4]?.barcode || ''} - ${data.backlabelBarcodes[4]?.result || ''}`
      });
    }

    // ======== STAGE 32: Dimension (sr 80-84, index 79-83) ========
    setResult(79, data.moduleProfile);
    if (data.mountingHoleXPitch) {
      setResult(80, `X: ${data.mountingHoleXPitch}, Y: ${data.mountingHoleYPitch || ''}`);
    }
    setResult(81, data.diagonalDifference);
    setResult(82, data.cornerGap);
    setResult(83, data.jbCableLength);

    // ======== STAGE 33: Packaging (sr 85-88, index 84-87) ========
    setResult(84, data.packagingLabel);
    setResult(85, data.contentInBox);
    setResult(86, data.boxCondition);
    setResult(87, data.palletDimension);

    // Update form state
    newFormData.checkpoints = newCheckpoints;
    setFormData(newFormData);
    
    console.log('=== IPQC Parser Complete (NO DEFAULT VALUES) ===');
    console.log('📊 Total fields parsed:', Object.keys(data).length);
    console.log('📊 All parsed data:', JSON.stringify(data, null, 2));
    console.log('🚫 No auto-filled defaults - only real OCR data used');
    
    // Debug: Log all parser output field names
    console.log('📋 Parser Field Names:', Object.keys(data).sort().join(', '));
    
    // Debug: Show which fields are set
    let filledCount = 0;
    newCheckpoints.forEach((cp, idx) => {
      if (cp.subResults && (cp.subResults['result'] || Object.keys(cp.subResults).length > 0)) {
        filledCount++;
        console.log(`✅ Checkpoint ${idx}: sr ${cp.sr} - ${cp.checkpoint} = `, cp.subResults);
      }
    });
    console.log('📊 Form fields filled:', filledCount, '/ 88');
  };

  // ========== SPLIT VIEW MODE - Form + PDF Side by Side ==========
  if (formViewMode) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'linear-gradient(135deg, #f5f7fa 0%, #e4e8ec 100%)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* ========== FRIENDLY OCR LOADING OVERLAY (Split View) ========== */}
        {(isProcessingOCR || isLoadingFromAPI || singlePageProcessing || isGeneratingPDF || isExportingExcel) && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(5px)',
            zIndex: 999999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '20px'
          }}>
            <div style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              padding: '40px 60px',
              borderRadius: '20px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
              textAlign: 'center',
              animation: 'pulse 2s ease-in-out infinite'
            }}>
              <div style={{ fontSize: '60px', marginBottom: '15px' }}>
                {isGeneratingPDF ? '📄' : isExportingExcel ? '📊' : isLoadingFromAPI ? '📄' : '🔍'}
              </div>
              <h2 style={{ 
                color: 'white', 
                margin: '0 0 10px 0',
                fontSize: '24px',
                fontWeight: '700'
              }}>
                {isGeneratingPDF ? 'Generating PDF...' : isExportingExcel ? 'Exporting Excel...' : isLoadingFromAPI ? 'Loading PDF...' : 'OCR Processing...'}
              </h2>
              <p style={{ 
                color: 'rgba(255,255,255,0.9)', 
                margin: '0 0 15px 0',
                fontSize: '16px'
              }}>
                {ocrProgress.total > 0 
                  ? `Page ${ocrProgress.current} of ${ocrProgress.total}`
                  : 'Please wait...'}
              </p>
              {/* Progress Bar */}
              {ocrProgress.total > 0 && (
                <div style={{
                  width: '200px',
                  height: '8px',
                  background: 'rgba(255,255,255,0.2)',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  margin: '0 auto'
                }}>
                  <div style={{
                    width: `${(ocrProgress.current / ocrProgress.total) * 100}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #00ff88, #00d4ff)',
                    borderRadius: '10px',
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              )}
              {/* Animated Dots */}
              <div style={{ 
                marginTop: '15px',
                display: 'flex',
                justifyContent: 'center',
                gap: '8px'
              }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    background: '#00ff88',
                    animation: `bounce 1.4s infinite ease-in-out both`,
                    animationDelay: `${i * 0.16}s`
                  }} />
                ))}
              </div>
            </div>
            <style>{`
              @keyframes pulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.02); }
              }
              @keyframes bounce {
                0%, 80%, 100% { transform: scale(0); }
                40% { transform: scale(1); }
              }
            `}</style>
          </div>
        )}

        {/* Top Bar */}
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: '10px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          padding: '8px 20px',
          minHeight: 'auto'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <button
              onClick={() => setFormViewMode(false)}
              style={{
                padding: '8px 16px',
                background: 'rgba(255,255,255,0.2)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: '700',
                cursor: 'pointer',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              ← Back
            </button>
            <span style={{ color: 'white', fontWeight: '700', fontSize: '14px' }}>
              📋 {selectedChecklist ? `${formatDate(selectedChecklist.date)} | ${selectedChecklist.Shift} | ${selectedChecklist.Line}` : ''}
            </span>
          </div>
        </div>

        {/* Split View Content */}
        <div style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden'
        }}>
          {/* Left Side - IPQC Form */}
          <div style={{
            width: '50%',
            overflow: 'auto',
            background: '#fff',
            borderRight: '3px solid #667eea'
          }}>
            <div ref={formContainerRef} style={{ padding: '15px' }}>
              {/* Form Header */}
              <div style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                padding: '15px',
                borderRadius: '10px',
                marginBottom: '15px',
                textAlign: 'center'
              }}>
                <h2 style={{ margin: 0, fontSize: '18px' }}>Gautam Solar Private Limited</h2>
                <p style={{ margin: '5px 0 0 0', fontSize: '12px' }}>IPQC Check Sheet - Document No. GSPL/IPQC/IPC/003</p>
              </div>

              {/* Form Info */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '10px',
                marginBottom: '15px',
                padding: '15px',
                background: '#f8f9fa',
                borderRadius: '8px'
              }}>
                <div>
                  <label style={{ fontSize: '11px', color: '#666', display: 'block' }}>Date:</label>
                  <input 
                    type="date" 
                    name="date" 
                    value={formData.date} 
                    onChange={handleInputChange}
                    style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', ...getCurrentHandwritingStyle() }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#666', display: 'block' }}>Time:</label>
                  <input 
                    type="time" 
                    name="time" 
                    value={formData.time} 
                    onChange={handleInputChange}
                    style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', ...getCurrentHandwritingStyle() }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#666', display: 'block' }}>Shift:</label>
                  <input 
                    type="text" 
                    name="shift" 
                    value={formData.shift} 
                    onChange={handleInputChange}
                    style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', ...getCurrentHandwritingStyle() }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#666', display: 'block' }}>P.O. No.:</label>
                  <input 
                    type="text" 
                    name="poNo" 
                    value={formData.poNo} 
                    onChange={handleInputChange}
                    style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', ...getCurrentHandwritingStyle() }}
                  />
                </div>
              </div>

              {/* Stage-wise Checkpoints */}
              {(() => {
                const stages = {};
                let stageNumber = 0;
                let lastStage = '';
                
                formData.checkpoints.forEach((checkpoint, index) => {
                  if (checkpoint.stage !== lastStage) {
                    stageNumber++;
                    lastStage = checkpoint.stage;
                  }
                  if (!stages[checkpoint.stage]) {
                    stages[checkpoint.stage] = { number: stageNumber, name: checkpoint.stage, checkpoints: [] };
                  }
                  stages[checkpoint.stage].checkpoints.push({ ...checkpoint, index });
                });

                return Object.values(stages).map((stage) => (
                  <div key={stage.number} style={{
                    marginBottom: '15px',
                    border: '1px solid #e0e0e0',
                    borderRadius: '8px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      color: 'white',
                      padding: '10px 15px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span style={{ fontWeight: '700', fontSize: '13px' }}>
                        Stage {stage.number}: {stage.name}
                      </span>
                      <span style={{
                        background: 'rgba(255,255,255,0.2)',
                        padding: '3px 10px',
                        borderRadius: '15px',
                        fontSize: '11px'
                      }}>
                        {stage.checkpoints.filter(cp => cp.subResults?.result || Object.values(cp.subResults || {}).some(v => v)).length}/{stage.checkpoints.length}
                      </span>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                      <thead>
                        <tr style={{ background: '#f8f9fa' }}>
                          <th style={{ padding: '8px', border: '1px solid #e0e0e0', width: '30px' }}>Sr</th>
                          <th style={{ padding: '8px', border: '1px solid #e0e0e0' }}>Check Point</th>
                          <th style={{ padding: '8px', border: '1px solid #e0e0e0' }}>Criteria</th>
                          <th style={{ padding: '8px', border: '1px solid #e0e0e0' }}>Result / Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stage.checkpoints.map((checkpoint) => {
                          const subResultKeys = Object.keys(checkpoint.subResults || {});
                          const hasSubResults = subResultKeys.length > 0 && !subResultKeys.includes('result');
                          const hasFilled = checkpoint.subResults?.result || Object.values(checkpoint.subResults || {}).some(v => v);
                          
                          return (
                            <tr key={checkpoint.sr} style={{ background: hasFilled ? '#e8f5e9' : 'white' }}>
                              <td style={{ padding: '6px', border: '1px solid #e0e0e0', textAlign: 'center', fontWeight: '600' }}>{checkpoint.sr}</td>
                              <td style={{ padding: '6px', border: '1px solid #e0e0e0' }}>
                                <div style={{ fontWeight: '500' }}>{checkpoint.checkpoint}</div>
                                <div style={{ fontSize: '9px', color: '#888' }}>{checkpoint.quantum} / {checkpoint.frequency}</div>
                              </td>
                              <td style={{ padding: '6px', border: '1px solid #e0e0e0', fontSize: '10px', color: '#666' }}>{checkpoint.criteria}</td>
                              <td style={{ padding: '6px', border: '1px solid #e0e0e0' }}>
                                {hasSubResults ? (
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                    {subResultKeys.map((key, idx) => (
                                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                        <label style={{ fontSize: '9px', color: '#666' }}>{key}:</label>
                                        <input 
                                          type="text"
                                          value={checkpoint.subResults[key] || ''}
                                          onChange={(e) => handleSubResultChange(checkpoint.index, key, e.target.value)}
                                          style={{
                                            width: '50px',
                                            padding: '3px 5px',
                                            border: '1px solid #ddd',
                                            borderRadius: '3px',
                                            background: checkpoint.subResults[key] ? '#e8f5e9' : 'white',
                                            ...getCurrentHandwritingStyle()
                                          }}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <input 
                                    type="text"
                                    value={checkpoint.subResults?.result || ''}
                                    onChange={(e) => handleSubResultChange(checkpoint.index, 'result', e.target.value)}
                                    placeholder="Enter result"
                                    style={{
                                      width: '100%',
                                      padding: '5px 8px',
                                      border: '1px solid #ddd',
                                      borderRadius: '4px',
                                      background: checkpoint.subResults?.result ? '#e8f5e9' : 'white',
                                      ...getCurrentHandwritingStyle()
                                    }}
                                  />
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ));
              })()}
            </div>
          </div>

          {/* Right Side - Original PDF */}
          <div style={{
            width: '50%',
            display: 'flex',
            flexDirection: 'column',
            background: '#1a1a2e'
          }}>
            {/* PDF Page Selector */}
            <div style={{
              padding: '10px 15px',
              background: 'rgba(0,0,0,0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flexWrap: 'wrap'
            }}>
              <span style={{ color: '#00d4ff', fontWeight: '600', fontSize: '13px' }}>📄 Original PDF:</span>
              {[1, 2, 3, 4, 5, 6, 7].map(pageNum => (
                <button
                  key={pageNum}
                  onClick={() => setActivePdfPage(pageNum)}
                  style={{
                    padding: '6px 12px',
                    background: activePdfPage === pageNum 
                      ? 'linear-gradient(135deg, #00d4ff 0%, #00ff88 100%)' 
                      : 'rgba(255,255,255,0.1)',
                    color: activePdfPage === pageNum ? '#1a1a2e' : 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  Page {pageNum}
                </button>
              ))}
            </div>

            {/* PDF View */}
            <div style={{
              flex: 1,
              overflow: 'auto',
              padding: '15px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center'
            }}>
              {pdfPreviews.length > 0 ? (
                <>
                  {pdfPreviews.find(p => p.pageNumber === activePdfPage) ? (
                    <img
                      src={pdfPreviews.find(p => p.pageNumber === activePdfPage)?.imageUrl}
                      alt={`Page ${activePdfPage}`}
                      style={{
                        maxWidth: '100%',
                        maxHeight: '100%',
                        objectFit: 'contain',
                        borderRadius: '8px',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
                      }}
                    />
                  ) : (
                    <div style={{
                      color: '#888',
                      textAlign: 'center',
                      padding: '40px'
                    }}>
                      <p style={{ fontSize: '48px', marginBottom: '15px' }}>📄</p>
                      <p>Page {activePdfPage} not available</p>
                    </div>
                  )}
                </>
              ) : loadedPdfUrls.length > 0 ? (
                <div style={{
                  color: 'white',
                  textAlign: 'center',
                  padding: '40px'
                }}>
                  <p style={{ fontSize: '48px', marginBottom: '15px' }}>📥</p>
                  <p style={{ marginBottom: '15px' }}>PDF preview not loaded</p>
                  <button
                    onClick={() => selectedChecklist && loadPdfPreviews(selectedChecklist)}
                    disabled={isLoadingPreviews}
                    style={{
                      padding: '12px 25px',
                      background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    {isLoadingPreviews ? '⏳ Loading...' : '👁️ Load PDF Preview'}
                  </button>
                </div>
              ) : (
                <div style={{
                  color: '#888',
                  textAlign: 'center',
                  padding: '40px'
                }}>
                  <p style={{ fontSize: '48px', marginBottom: '15px' }}>📋</p>
                  <p>No PDF loaded yet</p>
                  <p style={{ fontSize: '12px', marginTop: '10px' }}>Load a checklist to view original PDF</p>
                </div>
              )}
            </div>

            {/* PDF Download Links */}
            {loadedPdfUrls.length > 0 && (
              <div style={{
                padding: '10px 15px',
                background: 'rgba(0,0,0,0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
                justifyContent: 'center'
              }}>
                <span style={{ color: '#888', fontSize: '11px' }}>Download:</span>
                {loadedPdfUrls.map((url, idx) => (
                  <a
                    key={idx}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      padding: '4px 10px',
                      background: 'rgba(255,255,255,0.1)',
                      color: '#00d4ff',
                      borderRadius: '4px',
                      fontSize: '11px',
                      textDecoration: 'none'
                    }}
                  >
                    📥 P{idx + 1}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ========== FOOTER WITH ESSENTIAL BUTTONS ONLY ========== */}
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: '10px 20px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.15)'
        }}>
          {/* Handwriting Toggle */}
          <label style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '6px',
            cursor: 'pointer',
            background: useHandwritingFont ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.15)',
            padding: '8px 14px',
            borderRadius: '20px',
            border: useHandwritingFont ? '2px solid #fff' : '2px solid transparent'
          }}>
            <span style={{ fontSize: '14px' }}>✍️</span>
            <span style={{ color: 'white', fontSize: '11px', fontWeight: '600' }}>
              Handwriting {useHandwritingFont ? 'ON' : 'OFF'}
            </span>
            <input
              type="checkbox"
              checked={useHandwritingFont}
              onChange={(e) => setUseHandwritingFont(e.target.checked)}
              style={{ width: '16px', height: '16px', accentColor: '#00ff88' }}
            />
          </label>
          
          {/* Save Button */}
          <button
            onClick={saveEditedForm}
            disabled={isSaving}
            style={{
              padding: '10px 24px',
              background: isSaving 
                ? 'rgba(255,255,255,0.3)'
                : 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '20px',
              fontWeight: '700',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              boxShadow: '0 4px 15px rgba(17,153,142,0.4)'
            }}
          >
            {isSaving ? '⏳ Saving...' : '💾 Save Form'}
          </button>

          {/* Export PDF */}
          <button
            onClick={exportToPDF}
            disabled={isGeneratingPDF}
            style={{
              padding: '10px 24px',
              background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '20px',
              fontWeight: '700',
              cursor: 'pointer',
              fontSize: '13px',
              boxShadow: '0 4px 15px rgba(240,147,251,0.4)'
            }}
          >
            {isGeneratingPDF ? '⏳...' : '📄 Export PDF'}
          </button>

          {/* Export Excel */}
          <button
            onClick={exportToExcel}
            disabled={isExportingExcel}
            style={{
              padding: '10px 24px',
              background: 'linear-gradient(135deg, #00b09b 0%, #96c93d 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '20px',
              fontWeight: '700',
              cursor: 'pointer',
              fontSize: '13px',
              boxShadow: '0 4px 15px rgba(0,176,155,0.4)'
            }}
          >
            {isExportingExcel ? '⏳...' : '📊 Export Excel'}
          </button>
        </div>
      </div>
    );
  }

  // ========== NORMAL VIEW MODE - FULL PAGE TABLE ==========
  return (
    <div className="ipqc-form-container" ref={formContainerRef} style={{
      height: '100vh',
      width: '100vw',
      background: '#ffffff',
      padding: '0',
      margin: '0',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* ========== FRIENDLY OCR LOADING OVERLAY ========== */}
      {(isProcessingOCR || isLoadingFromAPI || singlePageProcessing) && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(10px)',
          zIndex: 99999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '20px'
        }}>
          <div style={{
            background: '#ffffff',
            padding: '40px 60px',
            borderRadius: '16px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
            border: '1px solid #e0e0e0',
            textAlign: 'center',
            animation: 'pulse 2s ease-in-out infinite'
          }}>
            <div style={{ fontSize: '60px', marginBottom: '15px' }}>
              {isLoadingFromAPI ? '📄' : '🔍'}
            </div>
            <h2 style={{ 
              color: '#1976d2', 
              margin: '0 0 10px 0',
              fontSize: '22px',
              fontWeight: '600'
            }}>
              {isLoadingFromAPI ? 'Loading PDF...' : 'Processing OCR...'}
            </h2>
            <p style={{ 
              color: '#666', 
              margin: '0 0 15px 0',
              fontSize: '14px'
            }}>
              {ocrProgress.total > 0 
                ? `Page ${ocrProgress.current} of ${ocrProgress.total}`
                : 'Please wait...'}
            </p>
            {/* Progress Bar */}
            {ocrProgress.total > 0 && (
              <div style={{
                width: '200px',
                height: '6px',
                background: '#e0e0e0',
                borderRadius: '10px',
                overflow: 'hidden',
                margin: '0 auto'
              }}>
                <div style={{
                  width: `${(ocrProgress.current / ocrProgress.total) * 100}%`,
                  height: '100%',
                  background: '#1976d2',
                  borderRadius: '10px',
                  transition: 'width 0.3s ease'
                }} />
              </div>
            )}
            {/* Animated Dots */}
            <div style={{ 
              marginTop: '15px',
              display: 'flex',
              justifyContent: 'center',
              gap: '8px'
            }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: '#1976d2',
                  animation: `bounce 1.4s infinite ease-in-out both`,
                  animationDelay: `${i * 0.16}s`
                }} />
              ))}
            </div>
          </div>
          <style>{`
            @keyframes pulse {
              0%, 100% { transform: scale(1); }
              50% { transform: scale(1.02); }
            }
            @keyframes bounce {
              0%, 80%, 100% { transform: scale(0); }
              40% { transform: scale(1); }
            }
          `}</style>
        </div>
      )}

      {/* Hidden OCR Upload Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleOCRUpload}
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        id="ocr-file-input"
      />

      {/* ======== FULL SCREEN TABLE ======== */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: '10px',
        overflow: 'hidden',
        minHeight: 0
      }}>
        {/* Title Bar with Refresh */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: '10px',
          padding: '12px 20px',
          background: '#ffffff',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          border: '1px solid #e0e0e0'
        }}>
          <h2 style={{ 
            margin: 0, 
            color: '#1976d2', 
            fontSize: '18px',
            fontWeight: '600'
          }}>
            📋 IPQC Checklists ({availableChecklists.length})
          </h2>
          <button
            onClick={fetchAvailableChecklists}
            disabled={isLoadingChecklists}
            style={{
              padding: '8px 20px',
              background: '#1976d2',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            {isLoadingChecklists ? '⏳...' : '🔄 Refresh'}
          </button>
        </div>
        
        {apiError && (
          <div style={{ 
            background: '#ffebee', 
            padding: '12px 20px', 
            borderRadius: '8px', 
            marginBottom: '15px', 
            textAlign: 'center',
            fontWeight: '500',
            color: '#c62828',
            border: '1px solid #ef9a9a'
          }}>
            ❌ {apiError}
          </div>
        )}

        {/* Table always visible - no toggle */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            {/* ======== COMPACT FILTER BAR ======== */}
            <div style={{
              display: 'flex',
              gap: '10px',
              alignItems: 'center',
              padding: '10px 15px',
              background: '#ffffff',
              borderRadius: '8px',
              marginBottom: '8px',
              border: '1px solid #e0e0e0',
              boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
              flexShrink: 0
            }}>
              <span style={{ fontWeight: '600', color: '#1976d2', fontSize: '12px' }}>🔍</span>
              
              {/* Date Filter */}
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid #ddd',
                  background: '#fff',
                  color: '#333',
                  fontSize: '12px',
                  outline: 'none'
                }}
                placeholder="Filter by Date"
              />
              
              {/* Line Filter */}
              <select
                value={filterLine}
                onChange={(e) => setFilterLine(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid #ddd',
                  background: '#fff',
                  color: '#333',
                  fontSize: '12px',
                  minWidth: '120px',
                  cursor: 'pointer'
                }}
              >
                <option value="">📍 All Lines</option>
                {[...new Set(availableChecklists.map(c => c.Line).filter(Boolean))].sort().map(line => (
                  <option key={line} value={line}>{line}</option>
                ))}
              </select>
              
              {/* Shift Filter */}
              <select
                value={filterShift}
                onChange={(e) => setFilterShift(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid #ddd',
                  background: '#fff',
                  color: '#333',
                  fontSize: '12px',
                  minWidth: '120px',
                  cursor: 'pointer'
                }}
              >
                <option value="">🌓 All Shifts</option>
                <option value="Day">☀️ Day</option>
                <option value="Night">🌙 Night</option>
              </select>
              
              {/* Clear Filters */}
              {(filterDate || filterLine || filterShift) && (
                <button
                  onClick={() => {
                    setFilterDate('');
                    setFilterLine('');
                    setFilterShift('');
                  }}
                  style={{
                    padding: '5px 10px',
                    background: '#f5f5f5',
                    color: '#666',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: '500',
                    fontSize: '11px'
                  }}
                >
                  ✕ Clear
                </button>
              )}
            </div>

            {/* ======== CHECKLIST TABLE - FULL HEIGHT ======== */}
            <div style={{
              background: '#ffffff',
              borderRadius: '8px',
              overflow: 'hidden',
              border: '1px solid #e0e0e0',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0
            }}>
              {/* Table Header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '50px 1.5fr 100px 80px 80px 80px 100px 200px',
                gap: '10px',
                padding: '12px 15px',
                background: '#1976d2',
                color: '#ffffff',
                fontWeight: '600',
                fontSize: '12px',
                textTransform: 'uppercase',
                letterSpacing: '0.3px'
              }}>
                <span>#</span>
                <span>📅 Date</span>
                <span>📍 Line</span>
                <span>🌓 Shift</span>
                <span>📊 Status</span>
                <span>📄 Pages</span>
                <span>🤖 OCR</span>
                <span>🎯 Actions</span>
              </div>
              
              {/* Table Body - Scrollable */}
              <div style={{ 
                flex: 1, 
                overflowY: 'auto',
                minHeight: 0
              }}>
                {availableChecklists
                  .filter(item => {
                    // Apply filters
                    if (filterDate && !item.date?.includes(filterDate)) return false;
                    if (filterLine && item.Line !== filterLine) return false;
                    if (filterShift && item.Shift !== filterShift) return false;
                    return true;
                  })
                  .map((item, idx) => {
                    const isSelected = selectedChecklist?.checkListId === item.checkListId;
                    const pageCount = [
                      item.Page1PdfFile, item.Page2PdfFile, item.Page3PdfFile,
                      item.Page4PdfFile, item.Page5PdfFile, item.Page6PdfFile, item.Page7PdfFile
                    ].filter(Boolean).length;
                    
                    return (
                      <div
                        key={item.checkListId}
                        onClick={() => setSelectedChecklist(item)}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '50px 1.5fr 100px 80px 80px 80px 100px 200px',
                          gap: '10px',
                          padding: '10px 15px',
                          borderBottom: '1px solid #f0f0f0',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          background: isSelected 
                            ? '#e3f2fd' 
                            : '#fff',
                          borderLeft: isSelected ? '3px solid #1976d2' : '3px solid transparent',
                          fontSize: '12px'
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) e.currentTarget.style.background = '#fafafa';
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) e.currentTarget.style.background = '#fff';
                        }}
                      >
                        <span style={{ 
                          color: '#666', 
                          fontWeight: '600',
                          display: 'flex',
                          alignItems: 'center',
                          fontSize: '12px'
                        }}>{idx + 1}</span>
                        
                        <span style={{ 
                          fontWeight: '500',
                          display: 'flex',
                          alignItems: 'center',
                          color: isSelected ? '#1976d2' : '#333',
                          fontSize: '12px'
                        }}>
                          {formatDate(item.date)}
                        </span>
                        
                        <span style={{
                          display: 'flex',
                          alignItems: 'center'
                        }}>
                          <span style={{
                            background: '#e3f2fd',
                            color: '#1976d2',
                            padding: '3px 10px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: '500'
                          }}>{item.Line || 'N/A'}</span>
                        </span>
                        
                        <span style={{ 
                          display: 'flex',
                          alignItems: 'center'
                        }}>
                          <span style={{
                            background: item.Shift === 'Day' 
                              ? '#fff3e0' 
                              : '#ede7f6',
                            color: item.Shift === 'Day' ? '#e65100' : '#5e35b1',
                            padding: '3px 10px',
                            borderRadius: '12px',
                            fontSize: '10px',
                            fontWeight: '500',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '3px'
                          }}>
                            {item.Shift === 'Day' ? '☀️' : '🌙'}
                          </span>
                        </span>
                        
                        {/* OCR Status Column */}
                        {(() => {
                          const ocrStatus = getChecklistStatus(item);
                          return (
                            <span style={{ 
                              display: 'flex',
                              alignItems: 'center'
                            }}>
                              <span style={{
                                background: ocrStatus.saved 
                                  ? '#e8f5e9' 
                                  : ocrStatus.processed 
                                    ? '#fce4ec'
                                    : '#f5f5f5',
                                color: ocrStatus.saved 
                                  ? '#2e7d32' 
                                  : ocrStatus.processed 
                                    ? '#c2185b'
                                    : '#757575',
                                padding: '3px 10px',
                                borderRadius: '12px',
                                fontSize: '10px',
                                fontWeight: '500',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}>
                                {ocrStatus.saved ? '💾 Saved' : ocrStatus.processed ? '✏️ Edit' : '⏸️ Pending'}
                              </span>
                            </span>
                          );
                        })()}
                        
                        <span style={{ 
                          display: 'flex',
                          alignItems: 'center'
                        }}>
                          <span style={{
                            background: item.Status === 'Completed' 
                              ? '#e8f5e9' 
                              : '#fff3e0',
                            color: item.Status === 'Completed' ? '#2e7d32' : '#e65100',
                            padding: '3px 8px',
                            borderRadius: '12px',
                            fontSize: '10px',
                            fontWeight: '500'
                          }}>{item.Status === 'Completed' ? '✓' : '⏳'}</span>
                        </span>
                        
                        <span style={{ 
                          display: 'flex',
                          alignItems: 'center',
                          color: pageCount === 7 ? '#2e7d32' : '#e65100',
                          fontWeight: '500',
                          fontSize: '11px'
                        }}>
                          {pageCount}/7
                        </span>
                        
                        <span style={{ 
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          {/* Smart Load Button - Load Saved if available, else OCR */}
                          {(() => {
                            const status = getChecklistStatus(item);
                            if (status.saved) {
                              // Show Load Saved button if form is saved
                              return (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const checklistId = item._id || item.id || `${item.date}_${item.Line}_${item.Shift}`;
                                    if (loadSavedForm(checklistId)) {
                                      setSelectedChecklist(item);
                                      loadPdfPreviews(item);
                                      setFormViewMode(true);
                                    } else {
                                      console.log('❌ Could not load saved form');
                                    }
                                  }}
                                  style={{
                                    padding: '5px 12px',
                                    background: '#2e7d32',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    fontWeight: '500',
                                    cursor: 'pointer',
                                    fontSize: '10px'
                                  }}
                                  title="Open Saved Form"
                                >
                                  💾 Open Saved
                                </button>
                              );
                            } else {
                              // Show OCR button if not saved
                              return (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    loadChecklistFromAPI(item);
                                  }}
                                  disabled={isLoadingFromAPI}
                                  style={{
                                    padding: '5px 12px',
                                    background: '#1976d2',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    fontWeight: '500',
                                    cursor: 'pointer',
                                    fontSize: '10px'
                                  }}
                                  title="Load & OCR Process"
                                >
                                  📥 Load OCR
                                </button>
                              );
                            }
                          })()}
                          
                          {/* Preview Button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedChecklist(item);
                              loadPdfPreviews(item);
                            }}
                            disabled={isLoadingPreviews}
                            style={{
                              padding: '4px 10px',
                              background: '#7b1fa2',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              fontWeight: '500',
                              cursor: 'pointer',
                              fontSize: '10px'
                            }}
                            title="Preview PDF"
                          >
                            👁️
                          </button>
                          
                          {/* View Form Button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedChecklist(item);
                              loadPdfPreviews(item); // Load PDF previews for split view
                              setFormViewMode(true); // Open split view mode
                            }}
                            style={{
                              padding: '4px 10px',
                              background: '#455a64',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              fontWeight: '500',
                              cursor: 'pointer',
                              fontSize: '10px'
                            }}
                            title="View Form"
                          >
                            📋
                          </button>
                        </span>
                      </div>
                    );
                  })}
                
                {/* No Results */}
                {availableChecklists.filter(item => {
                  if (filterDate && !item.date?.includes(filterDate)) return false;
                  if (filterLine && item.Line !== filterLine) return false;
                  if (filterShift && item.Shift !== filterShift) return false;
                  return true;
                }).length === 0 && (
                  <div style={{
                    padding: '40px',
                    textAlign: 'center',
                    color: '#888'
                  }}>
                    {availableChecklists.length === 0 
                      ? '📭 No checklists found. Click "Refresh" to load data.'
                      : '🔍 No results match your filters. Try adjusting the filters.'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
  );
};

export default IPQCForm;