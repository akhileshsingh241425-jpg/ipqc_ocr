# IPQC Check Sheet Application

## 📋 Description
A standalone web application for managing IPQC (In-Process Quality Control) Check Sheets at Gautam Solar. Features OCR-powered automatic form filling from scanned PDF documents.

## ✨ Features
- 📊 Full-screen checklist table with filters (Date, Line, Shift)
- 🔍 OCR text extraction from PDF documents using Azure Computer Vision
- 🤖 LLM-based intelligent parsing using Groq API
- ✍️ Handwriting-style fonts for natural look
- 📄 Split-screen view (Form + PDF side by side)
- 📥 Load checklists from API
- 👁️ PDF preview for all 7 pages

## 🚀 Quick Start

### Prerequisites
- Node.js v16 or higher
- npm or yarn

### Installation
```bash
cd ipqc-app
npm install
```

### Start Development Server
```bash
npm start
```

The app will open at http://localhost:3000

### Build for Production
```bash
npm run build
```

## 🔧 Configuration

### API Endpoints
- **Checklist API**: `https://maintenance.umanerp.com/api/peelTest/getuploadCheckListPdf`
- **PDF Proxy**: Configured in `src/setupProxy.js`

### Environment Variables
Create a `.env` file for sensitive keys:
```env
REACT_APP_AZURE_OCR_KEY=your_azure_key
REACT_APP_GROQ_API_KEY=your_groq_key
```

## 📂 Project Structure
```
ipqc-app/
├── public/
│   ├── index.html
│   ├── manifest.json
│   └── IPQC Check Sheet.xlsx  # Excel template
├── src/
│   ├── App.js
│   ├── App.css
│   ├── index.js
│   ├── index.css
│   ├── IPQCForm.js           # Main IPQC component
│   ├── IPQCForm.css
│   ├── setupProxy.js         # API proxy configuration
│   └── services/
│       ├── azureOCR.js       # Azure OCR service
│       ├── llmParser.js      # LLM parsing service
│       ├── ipqcParser.js
│       ├── ipqcStageParser.js
│       └── smartIPQCParser.js
└── package.json
```

## 🎨 UI Features

### Table View
- Compact full-screen table showing all checklists
- Filter by Date, Line (production line), and Shift (Day/Night)
- Quick action buttons: Load, View PDF, View Form

### Split View Mode
- Left panel: Editable IPQC form with handwriting fonts
- Right panel: Original PDF document for reference
- Page navigation controls

### Handwriting Fonts
8 different handwriting-style fonts available:
- Caveat, Dancing Script, Indie Flower, Kalam
- Patrick Hand, Permanent Marker, Rock Salt, Shadows Into Light

## 🔗 API Integration

### Fetch Checklists
```javascript
POST https://maintenance.umanerp.com/api/peelTest/getuploadCheckListPdf
Body: {}
```

### Response Structure
```json
{
  "checkListId": "123",
  "date": "2026-01-16",
  "Line": "L1",
  "Shift": "Day",
  "Type": "ipqcChecklist",
  "Page1PdfFile": "path/to/page1.pdf",
  ...
}
```

## 📝 Future Backend Integration

This app is designed for future backend integration:
- User authentication
- Form submission & storage
- Excel export with filled data
- Audit trail & history

## 📄 License
Gautam Solar Pvt. Ltd. - Internal Use Only
