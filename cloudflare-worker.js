notepad cloudflare-worker.js/**
 * Klinik Pro - Cloudflare Worker v0.3.5.1
 * 
 * Endpoints:
 *   POST /               → Anthropic API proxy (non-streaming)
 *   POST /stream         → Anthropic Streaming proxy (SSE)
 *   POST /storage-proxy  → Firebase Storage download proxy
 * 
 * Environment Variables:
 *   ANTHROPIC_API_KEY (Secret)
 */

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const ALLOWED_STORAGE_DOMAIN = 'firebasestorage.googleapis.com';
const ALLOWED_STORAGE_BUCKET = 'klinik-pro.firebasestorage.app';

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders() });
    }

    const url = new URL(request.url);
    
    if (url.pathname === '/storage-proxy') {
      return handleStorageProxy(request, env);
    }
    
    if (url.pathname === '/stream') {
      return handleAnthropicStream(request, env);
    }
    
    return handleAnthropicProxy(request, env);
  },
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() }
  });
}

// === ANTHROPIC API PROXY (non-streaming) ===
async function handleAnthropicProxy(request, env) {
  try {
    const body = await request.json();
    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) return jsonResponse({ error: 'API key not configured' }, 500);

    const anthropicResponse = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const responseBody = await anthropicResponse.text();
    return new Response(responseBody, {
      status: anthropicResponse.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  } catch (error) {
    return jsonResponse({ error: error.message || 'Internal server error' }, 500);
  }
}

// === ANTHROPIC STREAMING PROXY ===
async function handleAnthropicStream(request, env) {
  try {
    const body = await request.json();
    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) return jsonResponse({ error: 'API key not configured' }, 500);

    body.stream = true;

    const anthropicResponse = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    return new Response(anthropicResponse.body, {
      status: anthropicResponse.status,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        ...corsHeaders()
      },
    });
  } catch (error) {
    return jsonResponse({ error: error.message || 'Stream proxy error' }, 500);
  }
}

// === FIREBASE STORAGE PROXY ===
async function handleStorageProxy(request, env) {
  try {
    const body = await request.json();
    const { url: storageUrl } = body;
    
    if (!storageUrl) return jsonResponse({ error: 'url parameter required' }, 400);
    
    let parsedUrl;
    try {
      parsedUrl = new URL(storageUrl);
    } catch {
      return jsonResponse({ error: 'Invalid URL' }, 400);
    }
    
    if (parsedUrl.hostname !== ALLOWED_STORAGE_DOMAIN) {
      return jsonResponse({ error: `Only ${ALLOWED_STORAGE_DOMAIN} URLs allowed` }, 403);
    }
    
    if (!parsedUrl.pathname.includes(ALLOWED_STORAGE_BUCKET)) {
      return jsonResponse({ error: `Only klinik-pro bucket allowed` }, 403);
    }
    
    const storageResponse = await fetch(storageUrl);
    if (!storageResponse.ok) {
      return jsonResponse({ error: `Storage fetch failed: ${storageResponse.status}` }, storageResponse.status);
    }
    
    const arrayBuffer = await storageResponse.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.slice(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }
    const base64 = btoa(binary);
    
    const mediaType = storageResponse.headers.get('content-type') || 'application/octet-stream';
    
    return jsonResponse({
      base64,
      mediaType: mediaType.split(';')[0].trim(),
      size: bytes.length
    });
  } catch (error) {
    return jsonResponse({ error: error.message || 'Storage proxy error' }, 500);
  }
}