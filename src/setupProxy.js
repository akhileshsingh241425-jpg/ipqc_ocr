const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // Proxy for maintenance.umanerp.com to bypass CORS
  app.use(
    '/proxy-pdf',
    createProxyMiddleware({
      target: 'https://maintenance.umanerp.com',
      changeOrigin: true,
      pathRewrite: {
        '^/proxy-pdf': '', // Remove /proxy-pdf prefix when forwarding
      },
      secure: false,
      followRedirects: true,
      onProxyReq: function(proxyReq, req, res) {
        // Set proper headers for PDF request
        proxyReq.setHeader('Accept', 'application/pdf,*/*');
        // Log the request for debugging
        console.log('🔄 Proxying PDF request:', req.url, '→', proxyReq.path);
      },
      onProxyRes: function (proxyRes, req, res) {
        // Log response status and content-type for debugging
        console.log('📥 Proxy response:', proxyRes.statusCode, proxyRes.headers['content-type']);
        // Add CORS headers to the response
        proxyRes.headers['Access-Control-Allow-Origin'] = '*';
      },
      onError: function(err, req, res) {
        console.error('❌ Proxy error:', err);
      }
    })
  );

  // Proxy for Azure OCR API to bypass CORS
  app.use(
    '/proxy-azure-ocr',
    createProxyMiddleware({
      target: 'https://ocr-app14007.cognitiveservices.azure.com',
      changeOrigin: true,
      pathRewrite: {
        '^/proxy-azure-ocr': '', // Remove /proxy-azure-ocr prefix when forwarding
      },
      secure: true,
      onProxyReq: function(proxyReq, req, res) {
        console.log('🔄 Proxying Azure OCR request:', req.method, req.url);
      },
      onProxyRes: function (proxyRes, req, res) {
        console.log('📥 Azure OCR response:', proxyRes.statusCode);
        // Add CORS headers to the response
        proxyRes.headers['Access-Control-Allow-Origin'] = '*';
        proxyRes.headers['Access-Control-Expose-Headers'] = 'Operation-Location';
      },
      onError: function(err, req, res) {
        console.error('❌ Azure OCR Proxy error:', err);
      }
    })
  );
};
