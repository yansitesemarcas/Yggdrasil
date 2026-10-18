(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const KEYS = { tasks: 'yggdrasil.tasks.v2', memory: 'yggdrasil.memory.v2', chat: 'yggdrasil.chat.v2', endpoint: 'yggdrasil.endpoint.v2', model: 'yggdrasil.model.v1', shareContext: 'yggdrasil.share-context.v1' };
  const CLOUD_API = 'https://yggdrasil.yan-sitesemarcas.workers.dev';
  let cloudToken = localStorage.getItem('yggdrasil.cloud-token.v1') || '', cloudEmail = localStorage.getItem('yggdrasil.cloud-email.v1') || '', cloudSyncTimer = null, cloudSyncRunning = false;
  const read = (key, fallback) => { try { const value = JSON.parse(localStorage.getItem(key)); return value ?? fallback; } catch { return fallback; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); if ((key === KEYS.tasks || key === KEYS.memory) && cloudToken) { clearTimeout(cloudSyncTimer); cloudSyncTimer = setTimeout(() => syncCloudData(false), 900); } return true; } catch { toast('O armazenamento está cheio ou indisponível. Exporte os dados e tente novamente.'); return false; } };
  let tasks = read(KEYS.tasks, []), memories = read(KEYS.memory, []), history = read(KEYS.chat, []), endpoint = localStorage.getItem(KEYS.endpoint) || 'https://yggdrasil.yan-sitesemarcas.workers.dev/api/chat', selectedModel = localStorage.getItem(KEYS.model) || 'openrouter/free', taskFilter = 'all', listening = false, recognition = null;
  const titles = { assistant: 'Assistente', tasks: 'Tarefas', memory: 'Memória', settings: 'Conexões' };
  let toastTimer, pendingTaskTitle = localStorage.getItem('yggdrasil.pending-task-title.v1') || '', awaitingTaskTitle = localStorage.getItem('yggdrasil.awaiting-task.v1') === 'true';
  function persistPendingTask() { try { if (pendingTaskTitle) localStorage.setItem('yggdrasil.pending-task-title.v1', pendingTaskTitle); else localStorage.removeItem('yggdrasil.pending-task-title.v1'); localStorage.setItem('yggdrasil.awaiting-task.v1', awaitingTaskTitle ? 'true' : 'false'); } catch {} }
  function memoryTokens(value) { return String(value || '').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9]{3,}/g) || []; }
  function findRelevantMemories(query, limit = 5) { const terms = [...new Set(memoryTokens(query).filter(w => !['sobre','isso','essa','esse','para','como','qual','quais','lembra','lembrar','memoria','minhas','meus','voce','quero','preciso','quando','onde','porque','fazer','coisa','mais','muito'].includes(w)))]; return memories.map(m => { const words = new Set(memoryTokens(m.title + ' ' + m.content)); const overlap = terms.filter(t => words.has(t)).length; return { memory:m, score: overlap + (terms.length && terms.some(t => memoryTokens(m.title).includes(t)) ? 1.5 : 0) }; }).filter(x => x.score > 0).sort((a,b) => b.score-a.score || String(b.memory.createdAt).localeCompare(String(a.memory.createdAt))).slice(0,limit).map(x => x.memory); }
  function updateCloudUI(message = '') {
    const badge = $('#cloudBadge');
    if (badge) badge.textContent = cloudToken ? 'CONECTADO' : 'DESCONECTADO';
    if ($('#cloudSync')) $('#cloudSync').disabled = !cloudToken;
    if ($('#cloudLogout')) $('#cloudLogout').hidden = !cloudToken;
    if ($('#cloudEmail')) $('#cloudEmail').value = cloudEmail || $('#cloudEmail').value;
    if ($('#cloudFeedback') && message) $('#cloudFeedback').textContent = message;
  }
  async function cloudRequest(path, options = {}) {
    const headers = { 'Content-Type':'application/json', ...(options.headers || {}) };
    if (cloudToken) headers.Authorization = 'Bearer ' + cloudToken;
    const response = await fetch(CLOUD_API + path, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Servidor respondeu com status ' + response.status + '.');
    return data;
  }
  async function authenticateCloud(mode) {
    const email = ($('#cloudEmail')?.value || '').trim().toLowerCase();
    const password = $('#cloudPassword')?.value || '';
    if (!email || !password) { updateCloudUI('Preencha e-mail e senha para continuar.'); return; }
    if (mode === 'register' && password.length < 10) { updateCloudUI('Use uma senha com pelo menos 10 caracteres.'); return; }
    $('#cloudRegister').disabled = true; $('#cloudLogin').disabled = true;
    updateCloudUI(mode === 'register' ? 'Criando conta segura…' : 'Entrando na conta…');
    try {
      const data = await cloudRequest('/api/auth/' + mode, { method:'POST', body:JSON.stringify({email,password}), headers:{} });
      cloudToken = data.token; cloudEmail = data.email || email;
      localStorage.setItem('yggdrasil.cloud-token.v1',cloudToken);
      localStorage.setItem('yggdrasil.cloud-email.v1',cloudEmail);
      $('#cloudPassword').value = '';
      const remote = await cloudRequest('/api/data');
      const merge = (local, remoteItems) => {
        const byId = new Map();
        [...remoteItems, ...local].forEach(item => { if (item && item.id) byId.set(item.id,item); });
        return [...byId.values()].sort((a,b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
      };
      tasks = merge(tasks, Array.isArray(remote.tasks) ? remote.tasks : []);
      memories = merge(memories, Array.isArray(remote.memories) ? remote.memories : []);
      write(KEYS.tasks,tasks); write(KEYS.memory,memories);
      renderTasks(); renderMemories();
      updateCloudUI('Conta conectada. Dados locais e da nuvem foram combinados; a sincronização automática está ativa.');
      await syncCloudData(false);
    } catch (error) {
      updateCloudUI('Não consegui acessar a conta: ' + error.message);
    } finally { $('#cloudRegister').disabled = false; $('#cloudLogin').disabled = false; }
  }
  async function syncCloudData(showMessage = true) {
    if (!cloudToken || cloudSyncRunning) return;
    cloudSyncRunning = true;
    try {
      const result = await cloudRequest('/api/data',{method:'PUT',body:JSON.stringify({tasks,memories})});
      if (showMessage) updateCloudUI('Sincronização concluída. ' + result.taskCount + ' tarefa(s) e ' + result.memoryCount + ' memória(s) guardadas na nuvem.');
    } catch (error) {
      if (/Sessão inválida|expirada/i.test(error.message)) {
        cloudToken=''; localStorage.removeItem('yggdrasil.cloud-token.v1');
        updateCloudUI('Sua sessão expirou. Entre novamente para sincronizar.');
      } else if (showMessage) updateCloudUI('Falha na sincronização: ' + error.message);
    } finally { cloudSyncRunning = false; }
  }
  function renderMemorySearch() { const input = $('#memorySearch'); if (!input) return; const query = input.value.trim().toLocaleLowerCase('pt-BR'); $$('#memoryList .memory-card').forEach(card => { card.hidden = !!query && !card.textContent.toLocaleLowerCase('pt-BR').includes(query); }); }
  function toast(text) { const el = $('#toast'); el.textContent = text; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2800); }
  function safeDate(value) { try { return new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }); } catch { return ''; } }
  function escapeText(text) { return String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function showView(name) {
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    $('#pageTitle').textContent = titles[name] || titles.assistant;
    $('.sidebar').classList.remove('open');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function addMessage(text, role = 'assistant', save = true) {
    const msg = { role, content: String(text), time: new Date().toISOString() };
    const el = document.createElement('article');
    el.className = 'message ' + (role === 'user' ? 'user-message' : 'assistant-message');
    const avatar = document.createElement('div'); avatar.className = 'message-avatar'; avatar.textContent = role === 'user' ? 'Y' : 'ᛉ';
    const body = document.createElement('div'), strong = document.createElement('strong'), p = document.createElement('p'), small = document.createElement('small');
    strong.textContent = role === 'user' ? 'Você' : 'Yggdrasil'; p.textContent = text;
    small.textContent = (msg.time ? new Date(msg.time).toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'}) : '') + (role === 'assistant' && !endpoint ? ' · sessão local' : '');
    body.append(strong,p,small); el.append(avatar,body); $('#messages').append(el); $('#messages').scrollTop = $('#messages').scrollHeight;
    if (save) { history.push(msg); if (history.length > 60) history = history.slice(-60); write(KEYS.chat, history); }
  }
  function renderHistory() {
    $('#messages').replaceChildren();
    if (!history.length) { addMessage('Conversa limpa. Suas tarefas e memórias continuam guardadas neste dispositivo.', 'assistant', false); return; }
    history.forEach(m => addMessage(m.content, m.role === 'user' ? 'user' : 'assistant', false));
  }
  function renderTasks() {
    const pending = tasks.filter(t => !t.done).length;
    $('#taskCount').textContent = String(pending); $('#taskStats').innerHTML = pending + ' <small>pendentes</small>';
    const list = $('#taskList'); list.replaceChildren();
    const filtered = tasks.filter(t => taskFilter === 'all' || (taskFilter === 'done' ? t.done : !t.done));
    if (!filtered.length) { list.innerHTML = '<div class="empty-state">Nenhuma tarefa nesta lista.<br>Adicione um próximo passo acima. Um sistema organizado começa com uma coisa só.</div>'; return; }
    filtered.forEach(task => {
      const row = document.createElement('div'); row.className = 'task-row' + (task.done ? ' done' : '');
      const check = document.createElement('input'); check.type = 'checkbox'; check.className = 'task-check'; check.checked = !!task.done; check.setAttribute('aria-label', 'Concluir ' + task.title);
      check.addEventListener('change', () => { task.done = check.checked; write(KEYS.tasks, tasks); renderTasks(); });
      const title = document.createElement('span'); title.className = 'task-title'; title.textContent = task.title;
      const date = document.createElement('span'); date.className = 'task-date'; date.textContent = safeDate(task.createdAt);
      const del = document.createElement('button'); del.className = 'delete-button'; del.type = 'button'; del.textContent = '×'; del.setAttribute('aria-label','Excluir tarefa'); del.addEventListener('click', () => { tasks = tasks.filter(t => t.id !== task.id); write(KEYS.tasks,tasks); renderTasks(); toast('Tarefa removida.'); });
      row.append(check,title,date,del); list.append(row);
    });
  }
  function renderMemories() {
    $('#memoryCount').textContent = memories.length + (memories.length === 1 ? ' registro' : ' registros');
    const list = $('#memoryList'); list.replaceChildren();
    if (!memories.length) { list.innerHTML = '<div class="empty-state">Sua memória ainda está vazia.<br>Guarde aqui ideias e informações que queira manter neste aparelho.</div>'; return; }
    memories.slice().reverse().forEach(item => {
      const card = document.createElement('article'); card.className = 'memory-card';
      const h = document.createElement('h4'); h.textContent = item.title;
      const p = document.createElement('p'); p.textContent = item.content;
      const foot = document.createElement('div'); foot.className = 'memory-card-foot';
      const date = document.createElement('span'); date.textContent = safeDate(item.createdAt);
      const del = document.createElement('button'); del.className = 'delete-button'; del.type = 'button'; del.textContent = 'Excluir'; del.addEventListener('click', () => { memories = memories.filter(m => m.id !== item.id); write(KEYS.memory, memories); renderMemories(); toast('Registro removido.'); });
      foot.append(date,del); card.append(h,p,foot); list.append(card);
    });
    renderMemorySearch();
  }
  function handleLocalCommand(text) {
    const lower = text.toLocaleLowerCase('pt-BR').trim();
    if (awaitingTaskTitle && /^(sim|s|confirmo|pode salvar|salva|salvar|isso)$/i.test(lower)) {
      if (!pendingTaskTitle) return 'Ainda não tenho um título definido. Escreva a tarefa, por exemplo: "Preciso estudar matemática amanhã".';

      const title = pendingTaskTitle;
      tasks.unshift({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), title: title.slice(0,180), done: false, createdAt: new Date().toISOString() });
      if (!write(KEYS.tasks, tasks)) { tasks.shift(); return 'Não consegui guardar a tarefa neste dispositivo. A confirmação continua pendente.'; }
      pendingTaskTitle = ''; awaitingTaskTitle = false; persistPendingTask(); renderTasks(); return 'Tarefa salva: "' + title + '". Você pode acompanhá-la na aba Tarefas.';
    }
    if (awaitingTaskTitle && /^(não|nao|não precisa|nao precisa|cancela|cancelar)$/i.test(lower)) {
      pendingTaskTitle = ''; awaitingTaskTitle = false; persistPendingTask(); return 'Certo, não salvei a tarefa.';
    }
    const naturalTask = text.trim().match(/^(?:(?:eu )?preciso|precisa|tenho que|devo|quero|não posso esquecer de|nao posso esquecer de|lembrar de|me lembra de|adicionar como tarefa|crie uma tarefa para)\s+(.+?)[.!?]*$/i);
    if (naturalTask && !/^(de ajuda|entender|saber|perguntar|conversar|explicar|descobrir|ver como|falar com você|uma coisa)$/i.test(naturalTask[1].trim())) {
      pendingTaskTitle = naturalTask[1].trim().replace(/[.!?]+$/, '').replace(/^estudar matemática para amanhã$/i, 'Estudar matemática amanhã');
      awaitingTaskTitle = true; persistPendingTask();
      return 'Entendi. Posso registrar "' + pendingTaskTitle + '" como tarefa. Responda "sim" para salvar ou "não" para cancelar.';
    }
    const naturalMemory = text.trim().match(/^(?:guarde que|lembre-se que|lembre que|salve que|anote que)\s+(.+?)[.!?]*$/i);
    if (naturalMemory) {
      let content = naturalMemory[1].trim().replace(/[.!?]+$/, '');
      let title = '';
      const project = content.match(/^meu projeto pessoal se chama\s+(.+)$/i);
      const namedProject = content.match(/^meu projeto se chama\s+(.+)$/i);
      const objective = content.match(/^(?:meu objetivo é|meu objetivo e)\s+(.+)$/i);
      const preference = content.match(/^(?:minha preferência é|minha preferencia e|eu prefiro)\s+(.+)$/i);
      if (project || namedProject) {
        const name = (project || namedProject)[1].trim().replace(/[.!?]+$/, '');
        title = project ? 'Projeto pessoal' : 'Projeto';
        content = (project ? 'Meu projeto pessoal se chama ' : 'Meu projeto se chama ') + name + '.';
      } else if (objective) {
        title = 'Objetivo';
        content = 'Meu objetivo é ' + objective[1].trim().replace(/[.!?]+$/, '') + '.';
      } else if (preference) {
        title = 'Preferência';
        content = preference[1].trim().replace(/[.!?]+$/, '') + '.';
      } else {
        title = content.split(/\s+/).slice(0, 6).join(' ');
        if (title.length > 52) title = title.slice(0, 49).trimEnd() + '…';
      }
      memories.push({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), title, content, createdAt: new Date().toISOString() });
      if (!write(KEYS.memory, memories)) return 'Não consegui guardar essa informação neste dispositivo.';
      renderMemories(); return 'Anotado na memória deste dispositivo: "' + content.slice(0,180) + '".';
    }
    const recall = text.trim().match(/^(?:o que você lembra sobre|o que voce lembra sobre|o que sabe sobre|buscar na memória|buscar na memoria|procurar memória|procurar memoria)\s*(.*)$/i);
    if (recall) { const query = recall[1].trim(); const found = findRelevantMemories(query); return found.length ? 'Encontrei estas memórias relevantes:\n' + found.map((m,i) => { const title = String(m.title || '').trim(); const content = String(m.content || '').trim(); const duplicate = !title || title.toLocaleLowerCase('pt-BR') === content.toLocaleLowerCase('pt-BR') || content.toLocaleLowerCase('pt-BR').startsWith(title.toLocaleLowerCase('pt-BR') + ':'); return (i+1)+'. '+(duplicate ? content : title+': '+content); }).join('\n') : 'Não encontrei memórias relacionadas a esse assunto. Você pode guardar uma usando “guarde que ...”.'; }
    const projectMemory = text.match(/\bmeu projeto pessoal se chama\s+(.+?)[.!?]*$/i);
    if (projectMemory) {
      const projectName = projectMemory[1].trim().replace(/[.!?]+$/, '');
      const content = 'Meu projeto pessoal se chama ' + projectName + '.';
      memories.push({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), title: 'Projeto pessoal', content, createdAt: new Date().toISOString() });
      if (!write(KEYS.memory, memories)) return 'Não consegui guardar essa memória neste dispositivo.';
      renderMemories(); return 'Memória guardada neste dispositivo: ' + content;
    }
    if (/^(?:criar|adicionar|nova|nova tarefa)(?: uma)? tarefa(?: pessoal)?$/.test(lower)) {
      pendingTaskTitle = ''; awaitingTaskTitle = true; persistPendingTask();
      return 'Vamos criar uma tarefa. Escreva o que precisa fazer, por exemplo: "Preciso estudar matemática amanhã". Vou mostrar o título e pedir confirmação antes de salvar.';
    }
    const addTask = lower.match(/^(?:criar|adicionar|registrar) tarefa\s*:\s*(.+)$/i);
    if (addTask) {
      const title = text.slice(text.indexOf(':') + 1).trim();
      if (!title) return 'Escreva o nome da tarefa depois dos dois-pontos.';
      tasks.unshift({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), title: title.slice(0,180), done: false, createdAt: new Date().toISOString() });
      if (!write(KEYS.tasks,tasks)) return 'Não consegui guardar a tarefa neste dispositivo.';
      awaitingTaskTitle = false; pendingTaskTitle = ''; persistPendingTask(); renderTasks(); return 'Tarefa criada: "' + title + '". Ela já aparece na aba Tarefas.';
    }
    if (/^(?:listar|mostrar|ver) tarefas$|^minhas tarefas$|^quais são minhas tarefas\??$/.test(lower)) {
      const pending = tasks.filter(t => !t.done);
      return pending.length ? 'Suas tarefas pendentes:\n' + pending.map((t,i) => (i+1)+'. '+t.title).join('\n') : 'Você não tem tarefas pendentes.';
    }
    const complete = lower.match(/^(?:concluir|finalizar|marcar como concluída) tarefa\s*:\s*(.+)$/i);
    if (complete) {
      const query = text.slice(text.indexOf(':')+1).trim().toLocaleLowerCase('pt-BR');
      const task = tasks.find(t => !t.done && t.title.toLocaleLowerCase('pt-BR') === query) || tasks.find(t => !t.done && t.title.toLocaleLowerCase('pt-BR').includes(query));
      if (!task) return 'Não encontrei uma tarefa pendente com esse nome. Use "listar tarefas" para ver os títulos.';
      task.done = true; write(KEYS.tasks,tasks); renderTasks(); return 'Tarefa concluída: "' + task.title + '".';
    }
    const saveMemory = lower.match(/^(?:guardar|salvar|registrar) memória\s*:\s*(.+)$/i);
    if (saveMemory) {
      const content = text.slice(text.indexOf(':')+1).trim();
      if (!content) return 'Escreva o que deseja guardar depois dos dois-pontos.';
      memories.push({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), title: content.slice(0,60), content: content.slice(0,3000), createdAt: new Date().toISOString() });
      if (!write(KEYS.memory,memories)) return 'Não consegui guardar a memória neste dispositivo.';
      renderMemories(); return 'Memória guardada neste dispositivo: "' + content.slice(0,160) + '".';
    }
    if (/^(?:listar|mostrar|ver) memórias$|^minhas memórias$|^o que está guardado na memória\??$/.test(lower)) {
      return memories.length ? 'Memórias guardadas:\n' + memories.slice(-10).map((m,i)=>(i+1)+'. '+m.title+': '+m.content).join('\n') : 'Sua memória local ainda está vazia.';
    }
    return null;
  }
  function localAnswer(text) {
    const lower = text.toLocaleLowerCase('pt-BR');
    if (/^(oi|olá|ola|bom dia|boa tarde|boa noite|e aí|eai)/.test(lower)) return 'Olá. Estou funcionando em modo local. Posso registrar tarefas e guardar notas neste dispositivo. Para conversar com um modelo de IA de verdade, conecte um servidor em Conexões.';
    if (lower.includes('ajuda') || lower.includes('o que você faz') || lower.includes('o que voce faz')) return 'Neste modo, consigo guardar tarefas, marcar conclusões, registrar notas na memória e manter o histórico no navegador. Ainda não gero respostas inteligentes sem um servidor de IA conectado. Use a aba Tarefas ou Memória, ou configure a URL do backend em Conexões.';
    if (lower.startsWith('criar tarefa:') || lower.startsWith('adicionar tarefa:')) {
      const title = text.slice(text.indexOf(':') + 1).trim();
      if (!title) return 'Escreva o nome depois dos dois-pontos. Exemplo: criar tarefa: estudar matemática.';
      tasks.unshift({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), title, done: false, createdAt: new Date().toISOString() }); write(KEYS.tasks,tasks); renderTasks();
      return 'Tarefa registrada localmente: "' + title + '". Você pode encontrá-la na aba Tarefas.';
    }
    if (lower.includes('listar tarefas') || lower.includes('minhas tarefas')) {
      const pending = tasks.filter(t => !t.done);
      return pending.length ? 'Tarefas pendentes:\n' + pending.map((t,i) => (i+1)+'. '+t.title).join('\n') : 'Você não tem tarefas pendentes registradas.';
    }
    if (lower.startsWith('guardar memória:') || lower.startsWith('guardar memoria:')) {
      const content = text.slice(text.indexOf(':')+1).trim();
      if (!content) return 'Escreva o que deseja guardar depois dos dois-pontos.';
      memories.push({ id: String(Date.now()), title: content.slice(0,60), content, createdAt: new Date().toISOString() }); write(KEYS.memory,memories); renderMemories();
      return 'Anotação guardada na memória local deste dispositivo.';
    }
    return 'Recebi sua mensagem, mas a conexão com a IA ainda não foi configurada. Posso executar comandos locais simples: "criar tarefa: estudar", "listar tarefas", "guardar memória: minha ideia" ou "ajuda". Para respostas abertas, configure o backend na aba Conexões.';
  }
  async function sendMessage(text) {
    const message = text.trim(); if (!message) return;
    $('#messageInput').value = ''; $('#messageInput').style.height = 'auto';
    addMessage(message,'user'); const send = $('.send-button'); send.disabled = true; $('#topStatus').textContent = endpoint ? 'Conectando à IA' : 'Modo local';
    try {
      const localResult = handleLocalCommand(message);
      if (localResult !== null) { addMessage(localResult); return; }
      if (!endpoint) { await new Promise(resolve => setTimeout(resolve, 180)); addMessage(localAnswer(message)); }
      else {
        const prior = history.filter(m => m.role === 'user' || m.role === 'assistant').slice(-12,-1).map(m => ({ role: m.role, content: m.content }));
        const response = await fetch(endpoint, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ message, history:prior, model:selectedModel, context: $('#shareContext')?.checked ? { tasks: tasks.filter(t => !t.done).slice(0,20).map(t => ({ title: t.title, done: false })), memories: [...new Map([...findRelevantMemories(message,5), ...memories.slice(-5).reverse()].map(m => [m.id,m])).values()].slice(0,10).map(m => ({ title: m.title, content: m.content.slice(0,500) })) } : null }) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Servidor respondeu com status ' + response.status + '.');
        if (typeof data.reply !== 'string' || !data.reply.trim()) throw new Error('O servidor não retornou o campo "reply".');
        const cleanReply = data.reply.trim();
        if (/^(?:user safety:\s*safe\s*\n?\s*response safety:\s*safe|response safety:\s*safe\s*\n?\s*user safety:\s*safe)[.!\s]*$/i.test(cleanReply)) {
          addMessage('A IA retornou apenas um aviso técnico, sem responder à mensagem. Tente novamente ou use um comando local, como "guardar memória: meu projeto pessoal se chama Yggdrasil".');
        } else {
          addMessage(cleanReply);
        }
      }
    } catch (error) {
      addMessage('Não consegui acessar o servidor de IA. ' + error.message + ' Confira a URL, o HTTPS, o CORS e se o backend está ativo.');
    } finally { send.disabled = false; $('#topStatus').textContent = endpoint ? 'Conexão configurada' : 'Operação local'; }
  }
  $$('.nav-item').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.view)));
  $('#menuToggle').addEventListener('click', () => $('.sidebar').classList.toggle('open'));
  $$('.quick-card').forEach(btn => btn.addEventListener('click', () => { $('#messageInput').value = btn.dataset.prompt; $('#messageInput').focus(); $('#messageInput').scrollIntoView({behavior:'smooth',block:'center'}); }));
  $('#chatForm').addEventListener('submit', e => { e.preventDefault(); sendMessage($('#messageInput').value); });
  $('#messageInput').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#chatForm').requestSubmit(); } });
  $('#messageInput').addEventListener('input', e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight,150) + 'px'; });
  $('#taskForm').addEventListener('submit', e => { e.preventDefault(); const input = $('#taskInput'), title = input.value.trim(); if (!title) return; tasks.unshift({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), title, done:false, createdAt:new Date().toISOString() }); if(write(KEYS.tasks,tasks)){ input.value=''; renderTasks(); toast('Tarefa adicionada.'); } });
  $$('.filter').forEach(btn => btn.addEventListener('click', () => { taskFilter=btn.dataset.filter; $$('.filter').forEach(b=>b.classList.toggle('active',b===btn)); renderTasks(); }));
  $('#clearDone').addEventListener('click', () => { tasks=tasks.filter(t=>!t.done); write(KEYS.tasks,tasks); renderTasks(); toast('Tarefas concluídas removidas.'); });
  $('#cloudRegister')?.addEventListener('click', () => authenticateCloud('register'));
  $('#cloudLogin')?.addEventListener('click', () => authenticateCloud('login'));
  $('#cloudSync')?.addEventListener('click', () => syncCloudData(true));
  $('#cloudLogout')?.addEventListener('click', () => { cloudToken=''; cloudEmail=''; localStorage.removeItem('yggdrasil.cloud-token.v1'); localStorage.removeItem('yggdrasil.cloud-email.v1'); updateCloudUI('Você saiu da conta. Os dados locais continuam neste aparelho.'); });
  if (cloudToken) updateCloudUI('Sessão encontrada. Sincronizando dados…');
  $('#memorySearch')?.addEventListener('input', renderMemorySearch);
  $('#memoryForm').addEventListener('submit', e => { e.preventDefault(); const title=$('#memoryTitle').value.trim(), content=$('#memoryContent').value.trim(); if(!title||!content)return; memories.push({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),title,content,createdAt:new Date().toISOString()}); if(write(KEYS.memory,memories)){ $('#memoryTitle').value=''; $('#memoryContent').value=''; renderMemories(); toast('Nota guardada neste dispositivo.'); } });
  function refreshEndpointUI() { const share=$('#shareContext'); if(share) share.checked=localStorage.getItem(KEYS.shareContext)==='true'; $('#apiUrl').value=endpoint; if ($('#modelSelect')) $('#modelSelect').value=selectedModel; const configured=!!endpoint; $('#apiBadge').textContent=configured?'CONFIGURADO':'NÃO CONFIGURADO'; $('#apiBadge').style.color=configured?'var(--cyan)':'var(--gold)'; $('#chatMode').textContent=configured?'IA CONFIGURADA':'MODO LOCAL'; $('#connectionLabel').textContent=configured?'Endpoint configurado':'Modo local ativo'; $('#topStatus').textContent=configured?'Conexão configurada':'Operação local'; }
  $('#shareContext')?.addEventListener('change', e => { try { localStorage.setItem(KEYS.shareContext, e.target.checked ? 'true' : 'false'); } catch {} toast(e.target.checked ? 'Contexto pessoal será enviado nas próximas mensagens.' : 'Envio de contexto pessoal desativado.'); });
  $('#settingsForm').addEventListener('submit', e => { e.preventDefault(); selectedModel=$('#modelSelect')?.value || selectedModel; try { localStorage.setItem(KEYS.model,selectedModel); } catch {} const value=$('#apiUrl').value.trim(); if(value){ try { const u=new URL(value); if(u.protocol!=='https:' && u.hostname!=='localhost' && u.hostname!=='127.0.0.1') throw new Error('Use uma URL HTTPS para o servidor.'); } catch(err){ $('#connectionFeedback').textContent='URL inválida. Informe o endereço completo do endpoint, incluindo https://.'; return; } } endpoint=value; try { if(endpoint) localStorage.setItem(KEYS.endpoint,endpoint); else localStorage.removeItem(KEYS.endpoint); } catch {} refreshEndpointUI(); $('#connectionFeedback').textContent=endpoint?'Endereço salvo neste navegador. A chave secreta deve ficar no servidor.':'Conexão removida. O aplicativo seguirá em modo local.'; toast('Configuração atualizada.'); });
  $('#testConnection').addEventListener('click', async () => { if(!endpoint){ $('#connectionFeedback').textContent='Configure primeiro a URL do endpoint.'; return; } $('#connectionFeedback').textContent='Testando endpoint…'; try { const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'Responda apenas: conexão OK.',history:[],model:selectedModel,context:null})}); const d=await r.json().catch(()=>({})); if(!r.ok) throw new Error(d.error||'Status HTTP '+r.status); if(typeof d.reply!=='string') throw new Error('O endpoint respondeu, mas não retornou "reply".'); $('#connectionFeedback').textContent='Conexão concluída. Modelo respondendo: '+(d.model||selectedModel)+'.'; } catch(err) { $('#connectionFeedback').textContent='Teste falhou: '+err.message+' Confira CORS e se o servidor está ativo.'; } });
  $('#exportData').addEventListener('click', () => { const payload={exportedAt:new Date().toISOString(),tasks,memories,chat:history}; const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='yggdrasil-dados.json'; a.click(); URL.revokeObjectURL(url); toast('Exportação preparada.'); });
  $('#clearChat').addEventListener('click', () => { if(!confirm('Apagar o histórico de conversa deste dispositivo? Tarefas e memórias serão mantidas.')) return; history=[]; write(KEYS.chat,history); renderHistory(); toast('Conversa apagada.'); });
  $('#voiceButton').addEventListener('click', () => {
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){ toast('Ditado por voz indisponível neste navegador. Tente o Chrome atualizado.'); return; }
    if(listening && recognition){ recognition.stop(); return; }
    recognition=new SR(); recognition.lang='pt-BR'; recognition.interimResults=false; recognition.maxAlternatives=1;
    recognition.onstart=()=>{listening=true;$('#voiceButton').textContent='●';$('#inputHint').textContent='Ouvindo… fale agora';};
    recognition.onresult=e=>{ $('#messageInput').value=e.results[0][0].transcript; $('#messageInput').focus(); };
    recognition.onerror=e=>toast(e.error==='not-allowed'?'Permita o acesso ao microfone no navegador.':'Não consegui reconhecer a fala: '+e.error);
    recognition.onend=()=>{listening=false;$('#voiceButton').textContent='♩';$('#inputHint').textContent='Enter para enviar · Shift + Enter para nova linha';};
    try{recognition.start();}catch{toast('Aguarde um instante e tente novamente.');}
  });
  renderTasks(); renderMemories(); renderHistory(); refreshEndpointUI();
  if (cloudToken) (async () => {
    try {
      const remote = await cloudRequest('/api/data');
      const merge = (local, remoteItems) => {
        const byId = new Map();
        [...(Array.isArray(remoteItems) ? remoteItems : []), ...local].forEach(item => { if (item && item.id) byId.set(item.id,item); });
        return [...byId.values()].sort((a,b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
      };
      tasks = merge(tasks, remote.tasks); memories = merge(memories, remote.memories);
      write(KEYS.tasks,tasks); write(KEYS.memory,memories); renderTasks(); renderMemories();
      await syncCloudData(false);
      updateCloudUI('Sessão restaurada. Dados locais e da nuvem estão sincronizados.');
    } catch (error) {
      if (/Sessão inválida|expirada/i.test(error.message)) { cloudToken=''; localStorage.removeItem('yggdrasil.cloud-token.v1'); updateCloudUI('Sua sessão expirou. Entre novamente para sincronizar.'); }
      else updateCloudUI('Não consegui restaurar os dados da nuvem: ' + error.message);
    }
  })();
  const requestedView = new URLSearchParams(location.search).get('view');
  if (['assistant','tasks','memory','settings'].includes(requestedView)) showView(requestedView);
  if (awaitingTaskTitle && pendingTaskTitle) toast('Há uma tarefa aguardando sua confirmação: ' + pendingTaskTitle);
  const installButton = $('#installAppButton');
  installButton?.addEventListener('click', () => toast('No Chrome, toque em ⋮ e escolha “Adicionar à tela inicial”. Isso cria um atalho para o site, não instala um APK.'));
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();