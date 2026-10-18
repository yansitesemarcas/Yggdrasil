import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

const app = express();
const port = Number(process.env.PORT || 3000);
const allowedOrigin = process.env.ALLOWED_ORIGIN || 'https://yansitesemarcas.github.io';
const defaultModel = process.env.OPENROUTER_MODEL || 'openai/gpt-6.1-sol';
const allowedModels = new Set(
  (process.env.ALLOWED_MODELS || [
    'openai/gpt-6.1-sol',
    'openai/gpt-6-luna',
    'anthropic/claude-opus-5.5',
    'google/gemini-3.8-flash',
    'deepseek/deepseek-v4.1-flash',
    'deepseek/deepseek-v4-flash',
    'z-ai/glm-5.3-flash',
    'openrouter/free'
  ].join(',')).split(',').map(value => value.trim()).filter(Boolean)
);

app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || origin === allowedOrigin || origin === 'http://localhost:5173') return callback(null, true);
    return callback(new Error('Origem não permitida pelo CORS.'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json({ limit: '32kb' }));

app.get('/health', (_req, res) => res.json({
  ok: true,
  service: 'yggdrasil-api',
  provider: process.env.OPENROUTER_API_KEY ? 'openrouter' : process.env.OPENAI_API_KEY ? 'openai' : 'unconfigured',
  model: defaultModel
}));

app.post('/api/chat', async (req, res) => {
  const { message, history = [], model: requestedModel } = req.body || {};
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Envie uma mensagem válida.' });
  }

  const useOpenRouter = Boolean(process.env.OPENROUTER_API_KEY);
  const apiKey = useOpenRouter ? process.env.OPENROUTER_API_KEY : process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Configure OPENROUTER_API_KEY no servidor para acessar vários modelos. OPENAI_API_KEY é aceita como alternativa direta.' });
  }

  const requested = typeof requestedModel === 'string' && requestedModel.trim() ? requestedModel.trim() : defaultModel;
  const model = useOpenRouter ? (allowedModels.has(requested) ? requested : defaultModel) : (process.env.OPENAI_MODEL || 'gpt-4o-mini');
  const safeHistory = Array.isArray(history)
    ? history.slice(-10)
      .filter(item => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string')
      .map(item => ({ role: item.role, content: item.content.slice(0, 3000) }))
    : [];

  try {
    const endpoint = useOpenRouter
      ? 'https://openrouter.ai/api/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';
    const headers = {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    };
    if (useOpenRouter) {
      headers['HTTP-Referer'] = allowedOrigin;
      headers['X-Title'] = 'Yggdrasil Personal Intelligence';
    }

    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'Você é Yggdrasil, uma assistente pessoal útil, estratégica e direta. Responda em português brasileiro. Use o histórico fornecido como contexto. Seja clara e honesta: não afirme ter executado ações externas sem confirmação.' },
          ...safeHistory,
          { role: 'user', content: message.trim().slice(0, 4000) }
        ],
        temperature: 0.7
      }),
      signal: AbortSignal.timeout(60000)
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      console.error('Provedor de IA respondeu com status', upstream.status, 'modelo:', model);
      const upstreamMessage = data?.error?.message;
      if (upstream.status === 401) return res.status(502).json({ error: 'A chave de API configurada no servidor é inválida.' });
      if (upstream.status === 402) return res.status(502).json({ error: 'Saldo insuficiente ou modelo pago. Confira o crédito da conta do provedor.' });
      if (upstream.status === 429) return res.status(502).json({ error: 'Limite de uso atingido. Aguarde ou selecione outro modelo.' });
      return res.status(502).json({ error: typeof upstreamMessage === 'string' ? upstreamMessage.slice(0, 240) : 'O provedor de IA não conseguiu responder. Confira o modelo selecionado.' });
    }

    const reply = data?.choices?.[0]?.message?.content;
    const normalizedReply = typeof reply === 'string' ? reply.trim() : Array.isArray(reply) ? reply.map(part => part?.text || '').join('\n').trim() : '';
    if (!normalizedReply) return res.status(502).json({ error: 'O provedor retornou uma resposta vazia.' });
    return res.json({ reply: normalizedReply, model: data?.model || model, provider: useOpenRouter ? 'openrouter' : 'openai' });
  } catch (error) {
    console.error('Falha no provedor de IA:', error?.name || 'unknown');
    return res.status(502).json({ error: error?.name === 'TimeoutError' ? 'O modelo demorou demais para responder. Tente novamente ou escolha um modelo mais rápido.' : 'Falha de conexão com o provedor de IA.' });
  }
});

app.listen(port, () => console.log('Yggdrasil API ouvindo na porta ' + port));
