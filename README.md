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


## Implantação do backend pelo Cloudflare Workers

O repositório inclui uma implementação Cloudflare Worker em `worker/`, para que o backend possa ser implantado a partir do GitHub sem colocar a chave no código.

1. Abra o painel do [Cloudflare](https://dash.cloudflare.com/) e entre em **Workers & Pages**.
2. Escolha **Create application** e depois a opção para importar/conectar um repositório Git.
3. Selecione `yansitesemarcas/Yggdrasil`.
4. Configure o diretório raiz do projeto como `worker` e use o arquivo `wrangler.jsonc`. O comando de implantação é `npx wrangler deploy`.
5. Após criar o Worker, abra **Settings → Variables and Secrets → Add**.
6. Escolha o tipo **Secret**, nome `OPENROUTER_API_KEY`, e cole a chave do OpenRouter no campo de valor. Salve e implante.
7. Abra a URL `https://SEU-WORKER.workers.dev/health`. O resultado deve indicar `"ok": true` e `"provider": "openrouter"`.
8. Na Yggdrasil, entre em **Conexões** e informe `https://SEU-WORKER.workers.dev/api/chat`, salve e toque em **Testar conexão**.

Substitua `SEU-WORKER` pelo subdomínio mostrado pelo Cloudflare. Nunca coloque a chave no GitHub, no campo de URL do aplicativo ou em mensagens.

O modelo inicial é `openrouter/free`, que seleciona um modelo gratuito disponível. Modelos gratuitos podem ter limites e ficar temporariamente indisponíveis. Outros modelos podem gerar cobrança. O nome e a disponibilidade dos modelos mudam; confira o catálogo do OpenRouter.
