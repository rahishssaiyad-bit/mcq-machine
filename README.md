# MCQ Machine — Netlify Deploy Guide

## Folder Structure
```
mcq-machine-netlify/
├── netlify.toml                    ← Netlify config
├── netlify/
│   └── functions/
│       └── gemini.js              ← Proxy function (key yahan safe hai)
└── public/
    └── index.html                 ← App (key nahi hai)
```

## Deploy Steps

### Step 1 — GitHub pe upload karo
1. GitHub pe naya repository banao (e.g. `mcq-machine`)
2. In saari files upload karo (folder structure same rakho)

### Step 2 — Netlify pe connect karo
1. netlify.com pe jaao → "Add new site" → "Import from Git"
2. GitHub repo select karo
3. Build settings auto-detect ho jaayenge (`netlify.toml` se)
4. "Deploy site" click karo

### Step 3 — API Key set karo (IMPORTANT)
1. Netlify dashboard → Site settings → Environment variables
2. "Add variable" click karo:
   - Key:   `GEMINI_API_KEY`
   - Value: `AQ.Ab8RN6JXTpfsBapzRvTl6h-Dcqnl8Kq7wJj-SCwYLQEo_d0Vxw`
3. Save → Redeploy karo

### Step 4 — Test karo
- Site URL pe jaao (e.g. `mcq-machine.netlify.app`)
- Content paste karo, Generate karo
- Kaam karta hai? ✅

## Rate Limiting
- Har user (IP) ko **10 requests per 24 hours** milenge
- 10 ke baad: "Aaj ke 10 requests khatam! Kal dobara try karo."
- 24 ghante baad automatic reset

## Play Store ke liye (TWA)
1. App deploy hone ke baad URL note karo
2. `bubblewrap` tool use karo TWA banane ke liye:
   ```
   npm install -g @bubblewrap/cli
   bubblewrap init --manifest https://YOUR-SITE.netlify.app/manifest.json
   bubblewrap build
   ```
3. Generated APK ko Play Store pe upload karo

## Security
- ✅ Gemini API key sirf Netlify server pe hai — HTML mein nahi
- ✅ Rate limiting — ek user zyada requests na bheje
- ✅ CORS configured
- ✅ User ka data sirf uske phone mein (localStorage)
