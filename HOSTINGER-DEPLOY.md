# IPQC App - Hostinger Deployment (Port 8080)

## ✅ Free Port Found: 8080

Based on port check:
- ❌ Port 3000: IN USE (node)
- ❌ Port 5000: IN USE (node)
- ✅ Port 8080: FREE
- ✅ Port 8081: FREE
- ❌ Port 9000: IN USE (python)

**Using Port: 8080**

---

## 🚀 Quick Deployment Steps

### 1. Clone/Upload Project to Hostinger
```bash
cd ~
git clone https://github.com/akhileshsingh241425-jpg/ipqc_ocr.git
cd ipqc_ocr
```

### 2. Install Dependencies
```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd server
npm install
cd ..
```

### 3. Build Frontend
```bash
npm run build
```

### 4. Configure Production Environment
```bash
cd server

# Create .env file
cat > .env << EOF
# Server Configuration
PORT=8080
NODE_ENV=production

# MySQL Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_NAME=rohit
DB_USER=rohit
DB_PASSWORD=rohit0101

# CORS Origin
CORS_ORIGIN=*
EOF
```

### 5. Test Database Connection
```bash
mysql -u rohit -prohit0101 -e "SELECT 'Database connected successfully!' AS status;"
```

### 6. Start Server
```bash
cd server

# Option 1: Direct start (for testing)
NODE_ENV=production npm start

# Option 2: Use PM2 (recommended for production)
npm install -g pm2
pm2 start server.js --name ipqc-app
pm2 save
pm2 startup
```

### 7. Verify Server is Running
```bash
# Check if port 8080 is now in use
lsof -i :8080

# Test API
curl http://localhost:8080/api/health
```

---

## 🌐 Access Your Application

**URL:** `http://93.127.194.235:8080`

**Endpoints:**
- Homepage: `http://93.127.194.235:8080/`
- API Health: `http://93.127.194.235:8080/api/health`
- All API routes: `http://93.127.194.235:8080/api/forms/*`

---

## 📊 PM2 Management Commands

```bash
# View logs
pm2 logs ipqc-app

# Restart app
pm2 restart ipqc-app

# Stop app
pm2 stop ipqc-app

# Delete app
pm2 delete ipqc-app

# Monitor
pm2 monit
```

---

## 🔧 Troubleshooting

### If database tables not created automatically:
```bash
mysql -u rohit -prohit0101 rohit < server/database/schema.sql
```

### Check server logs:
```bash
pm2 logs ipqc-app --lines 100
```

### Port still showing as free but app not accessible:
```bash
# Check firewall
sudo ufw status
sudo ufw allow 8080/tcp

# Restart server
pm2 restart ipqc-app
```

---

## ✅ Final Checklist

- [x] Port 8080 is free
- [ ] Project cloned/uploaded
- [ ] Dependencies installed
- [ ] Frontend built
- [ ] .env configured with port 8080
- [ ] Database credentials correct (rohit/rohit0101)
- [ ] Server started with PM2
- [ ] Application accessible on port 8080

---

## 📝 Notes

- Frontend and Backend both run on same port (8080)
- Backend serves frontend build files
- Database auto-creates tables on first run
- Use PM2 to keep server running even after SSH disconnect
