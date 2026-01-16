# ========================================
# Hostinger Terminal Commands
# Copy-paste these commands one by one
# ========================================

# 1. CHECK WHICH PORTS ARE IN USE
netstat -tulpn | grep LISTEN

# 2. CHECK SPECIFIC COMMON PORTS (One by one)
lsof -i :3000
lsof -i :5000
lsof -i :8080
lsof -i :8081
lsof -i :9000

# 3. QUICK CHECK - Find FREE ports
echo "Checking ports..."
for port in 3000 5000 8080 8081 9000 3001 4000; do 
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then 
        echo "Port $port: IN USE ❌"
    else 
        echo "Port $port: FREE ✅"
    fi
done

# 4. ALTERNATIVE - Check if port responds
nc -zv localhost 3000
nc -zv localhost 5000
nc -zv localhost 8080

# ========================================
# After finding FREE port, note it down
# Then update server/.env with that PORT
# ========================================
