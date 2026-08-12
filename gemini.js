// netlify/functions/gemini.js
// Gemini API proxy with per-IP rate limiting (max 10 requests / 24 hours)

const GEMINI_KEY  = process.env.GEMINI_API_KEY;   // set in Netlify env vars
const GEMINI_URL  = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + GEMINI_KEY;

const MAX_REQUESTS = 10;          // per user per window
const WINDOW_MS    = 24 * 60 * 60 * 1000;  // 24 hours in ms

// In-memory store (resets on cold start — good enough for free tier)
// For persistent rate limiting across deploys, use Netlify KV or Upstash Redis
const rateStore = {};

function getClientIP(event) {
  return (
    event.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    event.headers["x-real-ip"] ||
    "unknown"
  );
}

function checkRateLimit(ip) {
  const now = Date.now();
  if (!rateStore[ip]) {
    rateStore[ip] = { count: 0, windowStart: now };
  }
  const entry = rateStore[ip];

  // Reset window if 24h passed
  if (now - entry.windowStart > WINDOW_MS) {
    entry.count = 0;
    entry.windowStart = now;
  }

  if (entry.count >= MAX_REQUESTS) {
    const resetIn = Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000 / 60);
    return { allowed: false, resetIn, used: entry.count, max: MAX_REQUESTS };
  }

  entry.count++;
  return { allowed: true, used: entry.count, max: MAX_REQUESTS, remaining: MAX_REQUESTS - entry.count };
}

exports.handler = async function(event) {
  // CORS headers — allow your Netlify domain
  const headers = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  // Handle preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  // Only POST allowed
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  // Rate limit check
  const ip = getClientIP(event);
  const limit = checkRateLimit(ip);

  if (!limit.allowed) {
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({
        error: "Rate limit reached",
        message: `Aaj ke 10 requests khatam ho gaye! ${limit.resetIn} minutes mein reset hoga.`,
        resetIn: limit.resetIn
      })
    };
  }

  // Parse body
  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  // Validate — must have contents
  if (!body.contents || !Array.isArray(body.contents)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing contents field" }) };
  }

  // Check Gemini key is configured
  if (!GEMINI_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Server config error — API key not set" }) };
  }

  // Forward to Gemini
  try {
    const geminiRes = await fetch(GEMINI_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body)
    });

    const data = await geminiRes.json();

    // Pass Gemini response back with rate limit info in header
    return {
      statusCode: geminiRes.status,
      headers: {
        ...headers,
        "X-RateLimit-Used":      String(limit.used),
        "X-RateLimit-Max":       String(limit.max),
        "X-RateLimit-Remaining": String(limit.remaining ?? 0)
      },
      body: JSON.stringify(data)
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: "Gemini API call failed", detail: err.message })
    };
  }
};
