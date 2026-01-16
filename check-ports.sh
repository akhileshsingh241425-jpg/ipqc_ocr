#!/bin/bash

echo "=========================================="
echo "Checking Free Ports on Hostinger"
echo "=========================================="
echo ""

# Common ports to check
PORTS=(3000 5000 8080 8081 3001 4000 9000)

echo "Checking common application ports..."
echo ""

for port in "${PORTS[@]}"
do
    # Check if port is in use
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        echo "❌ Port $port: IN USE"
    else
        echo "✅ Port $port: FREE"
    fi
done

echo ""
echo "=========================================="
echo "All ports in use:"
echo "=========================================="
netstat -tulpn | grep LISTEN | awk '{print $4}' | awk -F: '{print $NF}' | sort -nu

echo ""
echo "=========================================="
echo "Recommendation: Use a FREE port from above"
echo "Update server/.env with PORT=<FREE_PORT>"
echo "=========================================="
