# ShopBot — AI Chatbot for Romanian E-commerce

A SaaS chatbot product built with FastAPI + OpenAI, designed to be sold to Romanian e-commerce clients on a monthly subscription.

---

## File Structure

```
Shopbot/
├── main.py                   # FastAPI server — the brain of the app
├── knowledge/
│   └── biocyte.json          # Knowledge base for Biocyte Romania
├── static/
│   └── shopbot-widget.js     # Embeddable chat widget (vanilla JS)
├── admin/
│   └── dashboard.html        # Admin dashboard (single HTML file)
├── .env                      # Your secrets (never commit this!)
├── .env.example              # Template for .env
├── requirements.txt          # Python dependencies
└── README.md                 # This file
```

---

## Local Development (Run on Your Mac)

### Step 1 — Create the `.env` file

Copy the example file and fill in your real keys:

```bash
cp .env.example .env
```

Open `.env` and set:
- `OPENAI_API_KEY` — get it from https://platform.openai.com/api-keys
- `SHOPBOT_API_KEY` — make up any secret string (e.g. `shopbot_secret_2024`)

### Step 2 — Create a Python virtual environment

```bash
# Create virtual environment
python3 -m venv venv

# Activate it (Mac/Linux)
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### Step 3 — Run the server

```bash
python main.py
```

The server starts at: **http://localhost:8000**

### Step 4 — Test it

Open a new terminal and run:

```bash
# Test health endpoint
curl http://localhost:8000/health

# Test chat endpoint
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-api-key" \
  -d '{"message": "Ce vitamine aveti?", "session_id": "test123", "client_id": "biocyte"}'
```

### Step 5 — Open the admin dashboard

Open `admin/dashboard.html` directly in your browser (double-click it).
Set the API URL to `http://localhost:8000` and your API key, then click "Fetch Live Stats".

---

## Deploy to Railway.app (Free Hosting)

Railway.app gives you a free tier with $5/month credit — enough to run this 24/7.

### Step 1 — Push to GitHub

```bash
# Initialize git repository
git init
git add main.py requirements.txt knowledge/ static/ admin/ .env.example README.md
# NOTE: Do NOT add .env to git!
git commit -m "Initial ShopBot setup"

# Create a repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/shopbot.git
git push -u origin main
```

### Step 2 — Deploy on Railway

1. Go to https://railway.app and sign up with GitHub
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Select your shopbot repository
4. Railway will auto-detect Python and deploy it

### Step 3 — Add Environment Variables on Railway

In your Railway project:
1. Click on your service
2. Go to **"Variables"** tab
3. Add these variables:
   - `OPENAI_API_KEY` = your OpenAI key
   - `SHOPBOT_API_KEY` = your secret API key

Railway automatically sets the `PORT` variable — our server already reads it.

### Step 4 — Get your public URL

Railway gives you a URL like: `https://shopbot-production-xxxx.up.railway.app`

Test it:
```bash
curl https://shopbot-production-xxxx.up.railway.app/health
```

### Step 5 — Serve the widget file

FastAPI can serve static files. Add this to `main.py` after creating the app:

```python
from fastapi.staticfiles import StaticFiles
app.mount("/static", StaticFiles(directory="static"), name="static")
```

Then clients can load the widget from:
`https://your-app.railway.app/static/shopbot-widget.js`

> **Note:** Add `aiofiles` to requirements.txt for static file serving: `aiofiles==23.2.1`

---

## Adding a New Client

1. Create a new knowledge base file: `knowledge/newclient.json`
   - Copy `knowledge/biocyte.json` as a template
   - Update business name, products, FAQ, instructions

2. Give the client their embed code (use the admin dashboard generator):

```html
<script
  src="https://your-app.railway.app/static/shopbot-widget.js"
  data-api-url="https://your-app.railway.app"
  data-api-key="your-secret-api-key"
  data-client-id="newclient"
  data-primary-color="#FF6B00"
  data-bot-name="Asistentul nostru"
  data-welcome-message="Bună! Cu ce te pot ajuta?"
></script>
```

3. The client pastes this into their WordPress footer (Appearance → Theme Editor → footer.php, or use a plugin like "Insert Headers and Footers").

---

## API Reference

### `GET /health`
Check if server is running. No authentication required.

**Response:**
```json
{"status": "ok", "service": "ShopBot API"}
```

### `POST /chat`
Send a message and get a reply.

**Headers:** `X-API-Key: your-secret-key`

**Body:**
```json
{
  "message": "Ce vitamine aveti pentru imunitate?",
  "session_id": "unique-session-id",
  "client_id": "biocyte"
}
```

**Response:**
```json
{
  "reply": "Bună! Vă recomand Vitamina C 1000mg cu Zinc...",
  "session_id": "unique-session-id"
}
```

### `GET /stats`
Get usage statistics.

**Headers:** `X-API-Key: your-secret-key`

---

## Pricing Model Suggestion

| Plan | Price | Features |
|------|-------|---------|
| Starter | 200 RON/lună | 1 bot, 500 mesaje/lună |
| Pro | 400 RON/lună | 1 bot, 2000 mesaje/lună |
| Business | 800 RON/lună | 3 boturi, mesaje nelimitate |

OpenAI GPT-4o-mini costs ~$0.15 per 1M input tokens. 500 messages ≈ $0.10-0.20/month in API costs.

---

## Troubleshooting

**"Module not found" error:**
Make sure your virtual environment is activated: `source venv/bin/activate`

**"Invalid API key" from OpenAI:**
Check your `.env` file — make sure `OPENAI_API_KEY` starts with `sk-`

**Widget not showing on client site:**
Check the browser console for errors. Most common issue: wrong `data-api-url` or CORS if you restricted origins.

**Server crashes on Railway:**
Check Railway logs. Common fix: make sure all environment variables are set in the Variables tab.
