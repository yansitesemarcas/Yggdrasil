const COMMANDS = [
  { id: 'task.create', patterns: [/^(?:criar|adicionar|registrar) tarefa\s*:/i, /^me lembra de\s+/i] },
  { id: 'task.list', patterns: [/^(?:listar|mostrar|minhas) tarefas\s*\??$/i] },
  { id: 'memory.create', patterns: [/^guardar mem[oó]ria\s*:/i, /^anotar\s*:/i] },
  { id: 'help', patterns: [/^(?:ajuda|comandos|o que voc[eê] faz)\s*\??$/i] }
];

export function detectIntent(input) {
  const text = String(input || '').trim();
  if (!text) return { intent: 'empty', confidence: 1, explanation: 'Nenhuma mensagem foi fornecida.' };
  const match = COMMANDS.find(command => command.patterns.some(pattern => pattern.test(text)));
  return match
    ? { intent: match.id, confidence: 0.98, explanation: 'A mensagem corresponde a um comando local conhecido.' }
    : { intent: 'conversation', confidence: 0.55, explanation: 'Nenhum comando local conhecido correspondeu; encaminhar ao provedor de IA se houver conexão.' };
}

export function validateChatPayload(payload) {
  if (!payload || typeof payload.message !== 'string' || !payload.message.trim()) {
    return { ok: false, error: 'Envie uma mensagem válida.' };
  }
  return { ok: true, message: payload.message.trim().slice(0, 4000) };
}
