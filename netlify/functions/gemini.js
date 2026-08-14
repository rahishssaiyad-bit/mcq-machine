exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  // Rate limiting
  const MAX_REQ = 10;
  const WINDOW = 24 * 60 * 60 * 1000;
  if (!global.rateStore) global.rateStore = {};
  const ip = ((event.headers['x-forwarded-for'] || '').split(',')[0] || 'unknown').trim();
  const now = Date.now();
  if (!global.rateStore[ip]) global.rateStore[ip] = { count: 0, start: now };
  if (now - global.rateStore[ip].start > WINDOW) { global.rateStore[ip] = { count: 0, start: now }; }
  if (global.rateStore[ip].count >= MAX_REQ) {
    const mins = Math.ceil((global.rateStore[ip].start + WINDOW - now) / 60000);
    return { statusCode: 429, headers, body: JSON.stringify({ error: 'Rate limit reached', message: 'Aaj ke 10 requests khatam! ' + mins + ' minutes mein reset hoga.' }) };
  }
  global.rateStore[ip].count++;

  // Check API key
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { statusCode: 500, headers, body: JSON.stringify({ error: 'GEMINI_API_KEY not set in environment variables!' }) };

  // Parse body
  let body;
  try { body = JSON.parse(event.body); }
  catch(e) { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON: ' + e.message }) }; }

  if (!body || !body.contents) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing contents' }) };

  // Call Gemini using global fetch (Node 18+)
  try {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + key;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const text = await res.text();
    return { statusCode: res.status, headers, body: text };
  } catch(e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Gemini call failed: ' + e.message }) };
  }
};
