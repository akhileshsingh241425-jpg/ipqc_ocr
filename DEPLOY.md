# Hostinger Deployment Steps

## SSH Login
```bash
ssh root@93.127.194.235
```

## Deploy Latest Code
```bash
cd ~/ipqc_ocr
git pull origin master
pm2 restart ipqc-app
pm2 logs ipqc-app --lines 50
```

## Check Status
```bash
pm2 status
pm2 logs ipqc-app
```

## Emergency: Server Not Working?
```bash
cd ~/ipqc_ocr/server
npm install
pm2 restart ipqc-app
```

## Clear Browser Cache
After deployment, users need to:
- Press **Ctrl + Shift + R** (hard refresh)
- Or use **Incognito mode**

## Current Version
- Latest commit: ff0c0bf
- Groq: DISABLED (commented out)
- Hugging Face: ENABLED (with 410 retry logic)
- Fallback: Regex parser (always working)
