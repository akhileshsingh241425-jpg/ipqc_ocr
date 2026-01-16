# IPQC App - Hostinger Deployment Guide

## Pre-Deployment Checklist

### 1. Build Production Files
```bash
# On your local machine
npm run build
```

### 2. Check Free Port on Hostinger
SSH into Hostinger and run:
```bash
# Check ports in use
netstat -tulpn | grep LISTEN

# Or check specific port (e.g., 3000, 5000, 8080)
lsof -i :3000
lsof -i :5000
lsof -i :8080

# Common free ports: 3000, 5000, 8080, 8081, 3001
```

### 3. Update Configuration

#### Update `server/.env`:
```env
NODE_ENV=production
PORT=<FREE_PORT_FROM_STEP_2>

# Database (already configured)
DB_HOST=localhost
DB_NAME=rohit
DB_USER=rohit
DB_PASSWORD=rohit0101
```

## Deployment Steps

### Option 1: Via Terminal (SSH)

1. **Upload files to Hostinger**
```bash
# Compress project (exclude node_modules)
tar -czf ipqc-app.tar.gz --exclude=node_modules --exclude=.git ipqc-app/

# Upload via SCP
scp ipqc-app.tar.gz username@your-domain.com:~/

# SSH into Hostinger
ssh username@your-domain.com

# Extract
tar -xzf ipqc-app.tar.gz
cd ipqc-app
```

2. **Install dependencies**
```bash
npm install
cd server && npm install && cd ..
```

3. **Create database tables**
```bash
# The app will auto-create tables on first run
# Or manually:
mysql -u rohit -prohit0101 rohit < server/database/schema.sql
```

4. **Start server**
```bash
cd server
NODE_ENV=production npm start

# Or use PM2 for persistent process
npm install -g pm2
pm2 start server.js --name ipqc-backend
pm2 save
pm2 startup
```

### Option 2: Via File Manager

1. Build locally: `npm run build`
2. Upload entire project via Hostinger File Manager
3. Use Hostinger Terminal to run:
```bash
cd domains/your-domain.com/ipqc-app/server
npm install
NODE_ENV=production npm start
```

## Access Your App

Frontend and Backend both on: `http://your-domain.com:PORT`

- Homepage: `/`
- API Health: `/api/health`
- API Endpoints: `/api/forms/*`

## Troubleshooting

### Check port is free:
```bash
netstat -tulpn | grep :5000
```

### If port is in use, kill process:
```bash
lsof -ti:5000 | xargs kill -9
```

### Check logs:
```bash
pm2 logs ipqc-backend
```

### Restart server:
```bash
pm2 restart ipqc-backend
```

## Database Setup

Tables will be auto-created on first run. If manual setup needed:

```bash
mysql -u rohit -prohit0101 rohit

# Check tables
SHOW TABLES;

# Check if data exists
SELECT * FROM ipqc_forms LIMIT 5;
```

## Notes

- Frontend build files are served by backend server
- Both run on same port (configured in .env)
- Database credentials already configured for Hostinger
- Make sure MySQL is running on Hostinger
