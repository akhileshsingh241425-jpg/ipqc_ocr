@echo off
echo ==========================================
echo IPQC App - Production Build
echo ==========================================

:: Install dependencies
echo [1/3] Installing dependencies...
call npm install
cd server
call npm install
cd ..

:: Build React frontend
echo [2/3] Building React frontend...
call npm run build

:: Check if build was successful
if not exist "build" (
    echo ❌ Build failed!
    pause
    exit /b 1
)

echo.
echo ==========================================
echo ✅ Build complete!
echo ==========================================
echo.
echo Build folder created with production files.
echo.
echo Next steps for Hostinger deployment:
echo 1. Update server/.env with production settings:
echo    - NODE_ENV=production
echo    - DB credentials for Hostinger
echo 2. Upload project to Hostinger
echo 3. SSH into Hostinger and run: cd server ^&^& npm start
echo.
pause
