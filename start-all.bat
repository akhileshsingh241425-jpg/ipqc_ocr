@echo off
echo ╔════════════════════════════════════════════════════════════╗
echo ║         IPQC Application - Starting All Services          ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

:: Check if MySQL is running
echo 🔍 Checking MySQL...
sc query MySQL >nul 2>&1
if %errorlevel% neq 0 (
    echo ⚠️  MySQL service not found. Please make sure MySQL is installed and running.
    echo    You can start it manually or install XAMPP/WAMP.
    pause
)

:: Start Backend Server
echo.
echo 🚀 Starting Backend Server...
cd /d "%~dp0server"
if not exist "node_modules" (
    echo 📦 Installing backend dependencies...
    call npm install
)
start "IPQC Backend" cmd /k "npm start"

:: Wait for backend to start
echo ⏳ Waiting for backend to start...
timeout /t 5 /nobreak >nul

:: Start Frontend
echo.
echo 🚀 Starting Frontend...
cd /d "%~dp0"
if not exist "node_modules" (
    echo 📦 Installing frontend dependencies...
    call npm install
)
start "IPQC Frontend" cmd /k "npm start"

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║                  All Services Started!                     ║
echo ║                                                            ║
echo ║   Backend:  http://localhost:5000                         ║
echo ║   Frontend: http://localhost:3000                         ║
echo ║                                                            ║
echo ║   Press any key to close this window...                   ║
echo ╚════════════════════════════════════════════════════════════╝
pause >nul
