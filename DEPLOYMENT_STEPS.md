# Hostinger Deployment Steps

## 1. SSH to Hostinger
```bash
ssh root@93.127.194.235
```

## 2. Navigate to Project
```bash
cd ~/ipqc_ocr
```

## 3. Pull Latest Changes
```bash
git pull origin master
```

## 4. Restart PM2 Application
```bash
pm2 restart ipqc-app
```

## 5. Check Logs
```bash
pm2 logs ipqc-app --lines 50
```

## 6. Verify in Browser
- URL: http://93.127.194.235:8080
- Hard refresh: Ctrl+Shift+R
- Check console for: "🚀 Using Deepinfra (FREE, generous limits)..."

## Expected Console Logs:
- ✅ "Deepinfra extraction successful"
- If fails: "⚠️ Deepinfra failed, using regex fallback"

## ACTIVE API:
- **Deepinfra**: Key = SkzTNKA3JOPtBmlGtn44CBrfRMkBlfTN
- Model: mistralai/Mixtral-8x7B-Instruct-v0.1

## DISABLED APIs (removed from code):
- ❌ Groq (rate limited)
- ❌ Gemini (404 errors)
- ❌ Hugging Face (410 errors)
- ❌ Together AI (not truly free)
- ❌ Ollama (local only)
