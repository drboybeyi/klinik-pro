// AI Stream çekirdeği (v0.5.2 Sprint 6A — Vaka Tartışması)
//
// Cloudflare Worker /stream (Anthropic SSE passthrough) üzerinden çok-turn'e hazır
// streaming yardımcısı. messages DİZİSİ alır (6B çok-turn için baştan uygun).
// aiSorgu.js'in askAIStream'inden bağımsızdır — mevcut konsültasyon akışına dokunmaz.

const WORKER_STREAM_URL = 'https://muddy-cherry-1712.drahmetboyoglu.workers.dev/stream';

/**
 * Anthropic messages API'sini stream eder.
 * @param {Object}   o
 * @param {string}   o.model      — Anthropic model id
 * @param {string}   [o.system]   — system prompt
 * @param {Array}    o.messages   — [{ role:'user'|'assistant', content }] (content string veya block dizisi)
 * @param {Array}    [o.tools]    — Anthropic tools (ör. web_search)
 * @param {number}   [o.maxTokens=4096]
 * @param {AbortSignal} [o.signal]
 * @param {(chunk:string, full:string)=>void} [o.onChunk]
 * @param {(res:{text,usage,webSearchCount,model,aborted})=>void} [o.onDone]
 * @param {(err:Error)=>void} [o.onError]
 */
export async function streamMessages({
  model, system, messages, tools, maxTokens = 4096,
  signal, onChunk, onDone, onError
}) {
  const body = {
    model,
    max_tokens: maxTokens,
    messages
  };
  if (system) body.system = system;
  if (tools && tools.length) body.tools = tools;

  let response;
  try {
    response = await fetch(WORKER_STREAM_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      onDone?.({ text: '', usage: { input_tokens: 0, output_tokens: 0 }, webSearchCount: 0, model, aborted: true });
      return;
    }
    onError?.(error);
    return;
  }

  if (!response.ok) {
    const t = await response.text().catch(() => '');
    onError?.(new Error(`API ${response.status}: ${t.slice(0, 200)}`));
    return;
  }

  const reader  = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let usage = { input_tokens: 0, output_tokens: 0 };
  let webSearchCount = 0;
  let modelName = model;

  const _finish = (aborted) => onDone?.({ text: fullText, usage, webSearchCount, model: modelName, aborted });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const event of events) {
        if (!event.trim()) continue;
        const dataLine = event.split('\n').find(l => l.startsWith('data: '));
        if (!dataLine) continue;
        let data;
        try { data = JSON.parse(dataLine.substring(6)); }
        catch { continue; }

        if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
          const chunk = data.delta.text;
          fullText += chunk;
          onChunk?.(chunk, fullText);
        }
        if (data.type === 'content_block_start' &&
            data.content_block?.type === 'server_tool_use' &&
            data.content_block?.name === 'web_search') {
          webSearchCount++;
        }
        if (data.type === 'message_start' && data.message) {
          usage.input_tokens = data.message.usage?.input_tokens || 0;
          modelName = data.message.model || model;
        }
        if (data.type === 'message_delta' && data.usage) {
          usage.output_tokens = data.usage.output_tokens || 0;
          if (data.usage.server_tool_use?.web_search_requests != null) {
            webSearchCount = data.usage.server_tool_use.web_search_requests;
          }
        }
      }
    }
  } catch (error) {
    if (error.name === 'AbortError' || signal?.aborted) {
      _finish(true);
      return;
    }
    onError?.(error);
    return;
  }

  _finish(signal?.aborted === true);
}
