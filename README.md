# Yggdrasil

Assistente pessoal web, pensado primeiro para Android, com interface futurista, reconhecimento de voz em português brasileiro, respostas faladas e chat com IA.

## Estrutura

- `index.html`: interface principal.
- `style.css`: visual responsivo.
- `app.js`: microfone, conversa e síntese de voz.
- `api/chat.js`: endpoint serverless para conversar com a API da OpenAI.
- `manifest.json`: configuração para instalação como aplicativo web (PWA).

## Publicar com IA na Vercel

Este repositório é independente de `yan-serra-sites`. Importe **este repositório** (`yansitesemarcas/Yggdrasil`) na Vercel e deixe o diretório raiz como `.` (raiz do projeto).

Em **Settings → Environment Variables**, configure:

- `OPENAI_API_KEY`: sua chave secreta da API da OpenAI.
- `OPENAI_MODEL` (opcional): um modelo disponível na sua conta. O padrão é `gpt-4o-mini`.

Depois faça o deploy e abra o endereço gerado pela Vercel. A interface chama `/api/chat`, então o frontend e o endpoint precisam estar no mesmo domínio.

**Segurança:** nunca coloque a chave da API em `app.js`, `index.html`, no GitHub ou em mensagens. Ela deve ficar somente nas variáveis de ambiente da hospedagem.

## Teste local / limitações

- Abra a interface em um navegador moderno, preferencialmente Chrome para Android, e permita o acesso ao microfone.
- O reconhecimento de voz depende do suporte do navegador e de permissão HTTPS/microfone.
- A voz usa a síntese de fala nativa do navegador. ElevenLabs, memória persistente e automações externas ainda não estão implementados.
- O GitHub Pages só hospeda arquivos estáticos; não executa `api/chat.js`. Para chat real com IA, use uma hospedagem com funções serverless, como a Vercel.
- O uso da API pode gerar custos, dependendo da conta e do consumo.

## Estado atual

Protótipo funcional de interface e integração por voz. A conversa com IA só funciona depois que a aplicação é implantada com `OPENAI_API_KEY` configurada no servidor.
