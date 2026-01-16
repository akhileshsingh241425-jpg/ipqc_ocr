# Hostinger Deployment Script
Write-Host "🚀 Deploying to Hostinger..." -ForegroundColor Cyan

# Build the app locally
Write-Host "📦 Building React app..." -ForegroundColor Yellow
npm run build

# SCP build folder to Hostinger
Write-Host "📤 Uploading build files..." -ForegroundColor Yellow
scp -r build/* root@93.127.194.235:~/ipqc_ocr/build/

# SSH and restart PM2
Write-Host "🔄 Restarting server..." -ForegroundColor Yellow
ssh root@93.127.194.235 "cd ~/ipqc_ocr && pm2 restart ipqc-app"

Write-Host "✅ Deployment complete!" -ForegroundColor Green
Write-Host "🌐 URL: http://93.127.194.235:8080" -ForegroundColor Cyan
