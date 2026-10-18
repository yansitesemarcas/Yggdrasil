# Yggdrasil

Assistente pessoal pensado primeiro para celular, com interface em português, conversa por texto, ditado por voz, tarefas, memória local e backend opcional com seleção de modelos de IA.

**Repositório independente:** `yansitesemarcas/Yggdrasil`. Não faz parte do site Yan Serra Sites e Marcas.

## Modelos de IA

O backend aceita OpenRouter como gateway multimodelo, permitindo escolher modelos de diferentes fornecedores usando uma única chave de API. A lista inicial da interface inclui modelos OpenAI, Anthropic, Google, DeepSeek, Z.ai e a opção de roteamento gratuito do OpenRouter. Catálogos e identificadores mudam; confirme os IDs disponíveis na conta do provedor.

- A chave fica como variável secreta no servidor, nunca no JavaScript público.
- OpenRouter pode encaminhar para modelos pagos ou gratuitos conforme a opção escolhida e a disponibilidade.
- Modelos pagos exigem crédito/faturamento na conta; integrar uma API não torna seu uso gratuito.
- Como alternativa simples, o backend aceita `OPENAI_API_KEY` e usa `OPENAI_MODEL` diretamente, mas a seleção multimodelo exige `OPENROUTER_API_KEY`.

## Configuração do backend

O GitHub Pages hospeda apenas os arquivos estáticos. O servidor em `server/` precisa ser implantado em um serviço que execute Node.js e que permita configurar variáveis de ambiente.

Variáveis recomendadas no serviço de hospedagem:

- `OPENROUTER_API_KEY`: chave da conta OpenRouter (recomendado para vários modelos).
- `OPENROUTER_MODEL`: modelo padrão, por exemplo `openai/gpt-6.1-sol`.
- `ALLOWED_MODELS`: lista opcional de IDs permitidos separados por vírgula. Se omitida, usa a lista inicial do servidor.
- `ALLOWED_ORIGIN`: origem do front-end; padrão `https://yansitesemarcas.github.io`.
- `PORT`: porta definida pelo serviço de hospedagem.

Comandos locais:

```bash
cd server
npm install
npm start
```

O endpoint de chat será `/api/chat` e o teste de saúde será `/health`. Configure a URL completa de `/api/chat` na aba **Conexões** da interface.

## Estado atual

A interface, tarefas e memória local rodam no navegador. O chat com modelos externos só funciona depois de hospedar o backend, adicionar a chave de API como segredo e configurar a URL do endpoint na interface. Não inclua chaves no repositório ou no GitHub Pages.
