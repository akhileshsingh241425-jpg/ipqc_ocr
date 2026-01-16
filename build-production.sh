#!/bin/bash

echo "=========================================="
echo "IPQC App - Production Build"
echo "=========================================="

# Install dependencies
echo "📦 Installing dependencies..."
npm install
cd server && npm install && cd ..

# Build React frontend
echo "🏗️  Building React frontend..."
npm run build

# Copy .env.example to .env in server folder if not exists
if [ ! -f server/.env ]; then
    echo "⚙️  Creating .env file..."
    cp server/.env.example server/.env 2>/dev/null || echo "Note: Please configure server/.env manually"
fi

echo "✅ Build complete!"
echo ""
echo "Next steps for Hostinger deployment:"
echo "1. Upload entire project to Hostinger via FTP/SSH"
echo "2. Update server/.env with production settings"
echo "3. Run: cd server && npm start"
echo ""
