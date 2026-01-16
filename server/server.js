const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');
const http = require('http');
require('dotenv').config();

const { sequelize } = require('./models');
const formsRoutes = require('./routes/forms');
const llmRoutes = require('./routes/llm');

const app = express();
const PORT = process.env.PORT || 5000;

// Serve static files from React build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../build')));
}

// ========== MIDDLEWARE ==========
// Allow multiple origins for CORS
const allowedOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',')
  : ['http://localhost:3000'];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      console.log(`❌ CORS blocked: ${origin}`);
      return callback(new Error('CORS policy: Origin not allowed'), false);
    }
    
    console.log(`✅ CORS allowed: ${origin}`);
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`📨 ${new Date().toISOString()} | ${req.method} ${req.path}`);
  next();
});

// ========== PDF PROXY for Production ==========
app.get('/proxy-pdf/*', async (req, res) => {
  try {
    const pdfPath = req.path.replace('/proxy-pdf/', '');
    const targetUrl = `https://maintenance.umanerp.com/${pdfPath}`;
    
    console.log(`📄 Proxying PDF: ${targetUrl}`);
    
    https.get(targetUrl, (proxyRes) => {
      // Set response headers
      res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'application/pdf');
      res.setHeader('Content-Disposition', proxyRes.headers['content-disposition'] || 'inline');
      
      // Pipe the response
      proxyRes.pipe(res);
    }).on('error', (err) => {
      console.error('❌ PDF Proxy Error:', err.message);
      res.status(500).json({ error: 'Failed to fetch PDF' });
    });
  } catch (error) {
    console.error('❌ PDF Proxy Error:', error);
    res.status(500).json({ error: 'Failed to fetch PDF' });
  }
});

// ========== Azure OCR Proxy ==========
app.post('/proxy-azure-ocr', async (req, res) => {
  try {
    const { endpoint, subscriptionKey, imageData } = req.body;
    
    const url = new URL(endpoint);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Ocp-Apim-Subscription-Key': subscriptionKey,
      }
    };
    
    const proxyReq = https.request(options, (proxyRes) => {
      let data = '';
      proxyRes.on('data', chunk => data += chunk);
      proxyRes.on('end', () => {
        try {
          res.status(proxyRes.statusCode).json(JSON.parse(data));
        } catch (e) {
          res.status(proxyRes.statusCode).send(data);
        }
      });
    });
    
    proxyReq.on('error', (err) => {
      console.error('❌ Azure OCR Proxy Error:', err.message);
      res.status(500).json({ error: 'Failed to process OCR request' });
    });
    
    // Convert base64 to buffer and send
    const buffer = Buffer.from(imageData, 'base64');
    proxyReq.write(buffer);
    proxyReq.end();
  } catch (error) {
    console.error('❌ Azure OCR Proxy Error:', error);
    res.status(500).json({ error: 'Failed to process OCR request' });
  }
});

// ========== ROUTES ==========
app.use('/api/forms', formsRoutes);
app.use('/api/llm', llmRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    database: 'MySQL',
    version: '1.0.0'
  });
});

// ========== ERROR HANDLING ==========
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(500).json({ 
    success: false, 
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// Serve React app for any other routes (production only)
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../build', 'index.html'));
  });
} else {
  // 404 handler for development
  app.use((req, res) => {
    res.status(404).json({ success: false, error: 'Route not found' });
  });
}

// ========== DATABASE SYNC & SERVER START ==========
const startServer = async () => {
  try {
    // Sync database models (create tables if not exist)
    await sequelize.sync({ alter: process.env.NODE_ENV === 'development' });
    console.log('✅ Database tables synced successfully!');
    
    // Start the Express server
    const server = app.listen(PORT, () => {
      console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   🚀 IPQC Backend Server Running!                         ║
║                                                            ║
║   📍 URL: http://localhost:${PORT}                          ║
║   📊 Database: MySQL (${process.env.DB_NAME || 'ipqc_db'})                      ║
║   🌍 Environment: ${process.env.NODE_ENV || 'development'}                       ║
║                                                            ║
║   API Endpoints:                                           ║
║   ├─ GET    /api/health           - Health check          ║
║   ├─ GET    /api/forms            - Get all forms         ║
║   ├─ GET    /api/forms/:id        - Get form by ID        ║
║   ├─ POST   /api/forms            - Create new form       ║
║   ├─ PUT    /api/forms/:id        - Update form           ║
║   ├─ POST   /api/forms/:id/save   - Save form             ║
║   ├─ POST   /api/forms/save-by-checklist - Save by CID    ║
║   ├─ DELETE /api/forms/:id        - Delete form           ║
║   └─ POST   /api/forms/bulk-status - Get bulk status      ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
      `);
    });

    // Handle server errors
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
      } else {
        console.error('❌ Server error:', error);
      }
      process.exit(1);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
