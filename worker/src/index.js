const DEFAULT_MODEL = "openrouter/free";
const ALLOWED_ORIGIN = "https://yansitesemarcas.github.io";

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(data, status = 200, origin = "") {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(origin) }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (origin && origin !== ALLOWED_ORIGIN) {
      return json({ error: "Origem não permitida." }, 403, origin);
    }

    if (url.pathname === "/health" && request.method === "GET") {
      return json({
        ok: true,
        service: "yggdrasil-api",
        provider: env.OPENROUTER_API_KEY ? "openrouter" : "unconfigured",
        model: env.OPENROUTER_MODEL || DEFAULT_MODEL
      }, 200, origin);
    }

    if (url.pathname !== "/api/chat" || request.method !== "POST") {
      return json({ error: "Rota não encontrada." }, 404, origin);
    }

    if (!env.OPENROUTER_API_KEY) {
      return json({ error: "A chave OPENROUTER_API_KEY ainda não foi configurada como segredo no servidor." }, 503, origin);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "O corpo da mensagem precisa ser JSON válido." }, 400, origin);
    }

    const message = typeof body?.message === "string" ? body.message.trim().slice(0, 4000) : "";
    if (!message) return json({ error: "Envie uma mensagem válida." }, 400, origin);

    const allowedModels = new Set([
      "openrouter/free",
      "~openai/gpt-sol-latest",
      "~google/gemini-flash-latest",
      "~deepseek/deepseek-flash",
      "~z-ai/glm-flash",
      "~anthropic/claude-opus-latest"
    ]);
    const requested = typeof body?.model === "string" ? body.model.trim() : "";
    const model = allowedModels.has(requested) ? requested : (env.OPENROUTER_MODEL || DEFAULT_MODEL);
    const history = Array.isArray(body?.history)
      ? body.history.slice(-10)
          .filter(item => {
            if (!item || !["user", "assistant"].includes(item.role) || typeof item.content !== "string") return false;
            if (item.role === "assistant" && /\bLFM\b|Liquid AI|modelo autônomo|não tenho conexão com nenhum backend|não estou conectado a nenhum outro serviço/i.test(item.content)) return false;
            return true;
          })
          .map(item => ({ role: item.role, content: item.content.slice(0, 3000) }))
      : [];

    try {
      const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + env.OPENROUTER_API_KEY,
          "Content-Type": "application/json",
          "HTTP-Referer": ALLOWED_ORIGIN,
          "X-OpenRouter-Title": "Yggdrasil Personal Intelligence"
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: "IDENTIDADE OBRIGATÓRIA: você é Yggdrasil, o assistente de software deste aplicativo. Esta requisição é processada por um backend Cloudflare Worker, que encaminha a mensagem à API da OpenRouter. Se perguntarem quem você é ou como a resposta é processada, responda: “Sou o Yggdrasil, o assistente deste aplicativo. Minhas respostas são processadas por um backend conectado à OpenRouter.” Não afirme que é LFM, Liquid AI, um modelo autônomo embutido, nem negue a existência do backend. Não invente identidade específica do modelo por trás da OpenRouter, pois o roteador gratuito pode selecionar modelos diferentes. Responda sempre em português brasileiro, com clareza, estratégia e objetividade. Você pode conversar, explicar, analisar, planejar e criar textos ou código. Tarefas e memórias ficam no navegador e não são automaticamente enviadas para você; só diga que conhece esses dados se estiverem presentes na mensagem ou no histórico válido. Você não consegue clicar na interface nem executar ações no dispositivo diretamente. Nunca afirme que salvou, alterou ou executou algo fora da conversa sem confirmação real. Ao explicar suas funções, diferencie o que pode fazer por conversa do que o aplicativo realmente executa. Não invente integrações, acesso à internet ou memória permanente."
            },
            ...history,
            { role: "user", content: message }
          ],
          temperature: 0.2,
          max_tokens: 1200
        }),
        signal: AbortSignal.timeout(55000)
      });

      const data = await upstream.json().catch(() => ({}));
      if (!upstream.ok) {
        const status = upstream.status === 401 ? 502 : upstream.status === 402 ? 402 : upstream.status === 429 ? 429 : 502;
        const detail = upstream.status === 401
          ? "A chave OpenRouter é inválida."
          : upstream.status === 402
            ? "O provedor informou saldo insuficiente ou que o modelo exige créditos."
            : upstream.status === 429
              ? "Limite de uso atingido. Aguarde ou tente novamente."
              : (typeof data?.error?.message === "string" ? data.error.message.slice(0, 200) : "O provedor não conseguiu responder.");
        return json({ error: detail }, status, origin);
      }

      const content = data?.choices?.[0]?.message?.content;
      const reply = typeof content === "string"
        ? content.trim()
        : Array.isArray(content)
          ? content.map(part => part?.text || "").join("\n").trim()
          : "";
      if (!reply) return json({ error: "O provedor retornou uma resposta vazia." }, 502, origin);
      return json({ reply, model: data?.model || model, provider: "openrouter" }, 200, origin);
    } catch (error) {
      return json({ error: error?.name === "TimeoutError" ? "A IA demorou demais para responder. Tente novamente." : "Falha ao conectar ao provedor de IA." }, 502, origin);
    }
  }
};
