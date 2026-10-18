import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

const app = express();
const port = Number(process.env.PORT || 3000);
const allowedOrigin = process.env.ALLOWED_ORIGIN || 'https://yansitesemarcas.github.io';
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
app.get('/health', (_req, res) => res.json({ ok: true, service: 'yggdrasil-api' }));
app.post('/api/chat', async (req, res) => {
  const { message, history = [] } = req.body || {};
  if (typeof message !== 'string' || !message.trim()) return res.status(400).json({ error: 'Envie uma mensagem válida.' });
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'O provedor de IA ainda não foi configurado no servidor.' });
  const safeHistory = Array.isArray(history)
    ? history.slice(-10).filter(item => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string')
      .map(item => ({ role: item.role, content: item.content.slice(0, 3000) }))
    : [];
  try {
    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Você é Yggdrasil, uma assistente pessoal útil, estratégica e direta. Responda em português brasileiro. Seja clara e honesta: não afirme ter executado ações externas sem confirmação.' },
          ...safeHistory,
          { role: 'user', content: message.trim().slice(0, 4000) }
        ],
        temperature: 0.7
      }),
      signal: AbortSignal.timeout(45000)
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      console.error('Provedor de IA respondeu com status', upstream.status);
      return res.status(502).json({ error: upstream.status === 401 ? 'A chave do provedor no servidor é inválida.' : 'O provedor de IA não conseguiu responder. Confira modelo, limites e cobrança.' });
    }
    const reply = data?.choices?.[0]?.message?.content?.trim();
    if (!reply) return res.status(502).json({ error: 'O provedor retornou uma resposta vazia.' });
    return res.json({ reply });
  } catch (error) {
    console.error('Falha no provedor de IA:', error?.name || 'unknown');
    return res.status(502).json({ error: 'Falha de conexão com o provedor de IA.' });
  }
});
app.listen(port, () => console.log('Yggdrasil API ouvindo na porta ' + port));