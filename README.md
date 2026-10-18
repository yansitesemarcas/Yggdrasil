# Yggdrasil

Assistente pessoal pensado primeiro para celular, com interface em português, conversa por texto, ditado por voz, tarefas, memória local e uma conexão opcional com um servidor de IA.

**Repositório independente:** `yansitesemarcas/Yggdrasil`. Não faz parte do site Yan Serra Sites e Marcas.

## O que funciona na interface publicada

- Interface responsiva para Android e desktop.
- Tarefas com criação, conclusão, filtros e exclusão.
- Memória de notas local, com criação e exclusão.
- Histórico de conversa salvo no navegador.
- Exportação de tarefas, notas e histórico em JSON.
- Ditado por voz quando o navegador oferece suporte e concede permissão.
- Modo local sem servidor, com comandos básicos para registrar tarefas e notas.
- Campo para configurar e testar um endpoint de IA hospedado separadamente.
- PWA com manifesto e cache básico para abrir a interface offline depois da primeira visita.

## Publicação no GitHub Pages

O site está configurado para publicar a raiz da branch `main`:

`https://yansitesemarcas.github.io/Yggdrasil/`

O GitHub Pages **não executa código Node.js** e não hospeda o endpoint de chat. O modo local funciona sem backend; respostas generativas exigem que o servidor abaixo seja hospedado em um serviço compatível com Node.js, fora do GitHub Pages. Não é necessário usar Vercel.

## Servidor de IA

O código do servidor está em `server/`. Requer Node.js 20 ou superior.

1. Hospede a pasta `server` em um serviço Node.js compatível (por exemplo, Render ou Railway).
2. Configure as variáveis de ambiente no serviço:
   - `OPENAI_API_KEY`: chave secreta do provedor, apenas no servidor.
   - `OPENAI_MODEL`: modelo habilitado na sua conta (padrão: `gpt-4o-mini`).
   - `ALLOWED_ORIGIN`: origem do site, por exemplo `https://yansitesemarcas.github.io`.
   - `PORT`: normalmente fornecida pelo serviço.
3. Copie a URL HTTPS do endpoint `/api/chat`.
4. No site, abra **Conexões**, cole a URL completa e salve. Use **Testar conexão**.

A chave da API nunca deve ser colocada no frontend, no repositório público ou no navegador. O uso do provedor pode gerar custos.

## Limitações honestas

- Memória, tarefas e histórico ficam no armazenamento local daquele navegador/dispositivo; não são sincronizados entre dispositivos nem criptografados por esta versão.
- O modo local não é um modelo de IA. Ele executa comandos simples e informa quando não há backend conectado.
- Ditado depende do suporte do navegador e de permissão para microfone.
- A configuração do endpoint não hospeda o servidor automaticamente: ela apenas conecta a interface a um servidor que já esteja funcionando.
