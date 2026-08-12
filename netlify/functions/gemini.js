
// netlify/functions/gemini.js
// Gemini API proxy with per-IP rate limiting (max 10 requests / 24 hours)

const https = require('https');

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_HOST = 'generativelanguage.googleapis.com';
const GEMINI_PATH = '/v1beta/models/gemini-2.5-flash:generateContent?key=' + GEMINI_KEY;

const MAX_REQUESTS = 10;
const WINDOW_MS    = 24 * 60 * 60 * 1000;
const rateStore    = {};

function getClientIP(event) {
  return (
    (event.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    event.headers['x-real-ip'] ||
    'unknown'
  );
}

function checkRateLimit(ip) {
  const now = Date.now();
  if (!rateStore[ip]) rateStore[ip] = { count: 0, windowStart: now };
  const entry = rateStore[ip];
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

// Native HTTPS request (no external deps needed)
function httpsPost(host, path, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const req = https.request({
      hostname: host,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch (e) { reject(new Error('JSON parse failed: ' + raw.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  // Rate limit
  const ip = getClientIP(event);
  const limit = checkRateLimit(ip);
  if (!limit.allowed) {
    return {
      statusCode: 429, headers,
      body: JSON.stringify({
        error: 'Rate limit reached',
        message: 'Aaj ke 10 requests khatam ho gaye! ' + limit.resetIn + ' minutes mein reset hoga.',
        resetIn: limit.resetIn
      })
    };
  }

  // Parse body
  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) }; }

  if (!body.contents || !Array.isArray(body.contents)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing contents field' }) };
  }

  if (!GEMINI_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'GEMINI_API_KEY not set in environment variables!' }) };
  }

  // Call Gemini
  try {
    const result = await httpsPost(GEMINI_HOST, GEMINI_PATH, body);
    return {
      statusCode: result.status,
      headers: {
        ...headers,
        'X-RateLimit-Used':      String(limit.used),
        'X-RateLimit-Max':       String(limit.max),
        'X-RateLimit-Remaining': String(limit.remaining || 0)
      },
      body: JSON.stringify(result.data)
    };
  } catch (err) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Gemini call failed', detail: err.message }) };
  }
};
