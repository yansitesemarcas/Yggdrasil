export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST para conversar com a Yggdrasil." });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({
      error: "A IA ainda não foi configurada no servidor. Adicione OPENAI_API_KEY nas variáveis de ambiente da hospedagem."
    });
  }

  const { message, history = [] } = req.body || {};
  if (typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "Envie uma mensagem para a Yggdrasil." });
  }

  const safeHistory = Array.isArray(history)
    ? history.slice(-8).filter(m =>
        m && ["user", "assistant"].includes(m.role) &&
        typeof m.content === "string"
      ).map(m => ({ role: m.role, content: m.content.slice(0, 2000) }))
    : [];

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Você é Yggdrasil, uma assistente pessoal útil, estratégica e direta. Responda em português brasileiro, com voz textual natural, feminina e tecnológica. Não afirme que executou ações externas sem confirmação real. Peça autorização antes de ações sensíveis."
          },
          ...safeHistory,
          { role: "user", content: message.trim().slice(0, 4000) }
        ],
        temperature: 0.7
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("AI provider error:", response.status, data?.error?.type || "unknown");
      return res.status(502).json({
        error: response.status === 401
          ? "A chave da IA no servidor é inválida."
          : "O serviço de IA não conseguiu responder. Verifique a configuração e o saldo/limites da conta."
      });
    }

    const answer = data?.choices?.[0]?.message?.content?.trim();
    if (!answer) return res.status(502).json({ error: "A IA retornou uma resposta vazia." });
    return res.status(200).json({ reply: answer });
  } catch (error) {
    console.error("Yggdrasil API request failed:", error?.message || "unknown");
    return res.status(500).json({ error: "Falha de conexão com o serviço de IA." });
  }
}