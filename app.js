const button = document.getElementById('talk');
const statusEl = document.getElementById('status');
const messages = document.getElementById('messages');
const dot = document.getElementById('dot');
const label = document.getElementById('coreLabel');
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, active = false, busy = false;
const history = [];

function status(text, listening = false) {
  statusEl.textContent = text;
  document.body.classList.toggle('listening', listening);
  dot.style.background = listening ? '#72e5ef' : '#72e5a3';
}
function add(text, who = 'assistant') {
  const row = document.createElement('article');
  row.className = 'message';
  const b = document.createElement('b');
  b.textContent = who === 'user' ? 'VOCÊ' : 'YG';
  const p = document.createElement('p');
  p.textContent = text;
  row.append(b, p);
  messages.append(row);
  row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function speak(text) {
  if (!('speechSynthesis' in window)) {
    status('Resposta recebida, mas este navegador não oferece voz.');
    return;
  }
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'pt-BR';
  utterance.rate = 1.02;
  utterance.pitch = 1.08;
  utterance.onstart = () => status('Yggdrasil falando…');
  utterance.onend = () => status('Sistema pronto');
  utterance.onerror = () => status('Resposta pronta; houve um erro ao reproduzir a voz.');
  speechSynthesis.speak(utterance);
}
async function askAI(text) {
  status('Conectando à inteligência artificial…');
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'A API não conseguiu responder.');
    const answer = data.reply;
    history.push({ role: 'user', content: text }, { role: 'assistant', content: answer });
    if (history.length > 12) history.splice(0, history.length - 12);
    add(answer);
    speak(answer);
  } catch (error) {
    const message = error.message.includes('<!DOCTYPE') || error.message.includes('Unexpected token')
      ? 'A interface está aberta, mas a API ainda não está publicada neste endereço. Hospede o projeto na Vercel e configure a chave da IA.'
      : error.message;
    add(message);
    status('IA não conectada');
  }
}
function listen() {
  if (!SR) {
    status('Reconhecimento de voz indisponível neste navegador');
    add('Tente abrir a Yggdrasil no Chrome para Android e confira a permissão do microfone.');
    return;
  }
  rec = new SR();
  rec.lang = 'pt-BR';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.onstart = () => {
    active = true;
    status('Ouvindo você…', true);
    label.textContent = 'OUVINDO';
  };
  rec.onresult = async event => {
    const text = event.results[0][0].transcript.trim();
    if (!text) return;
    add(text, 'user');
    busy = true;
    button.disabled = true;
    await askAI(text);
    busy = false;
    button.disabled = false;
  };
  rec.onerror = event => {
    const reason = event.error === 'not-allowed'
      ? 'Permita o microfone nas configurações do Chrome e do Android.'
      : event.error === 'no-speech'
        ? 'Não detectei fala. Tente novamente perto do microfone.'
        : 'Erro no microfone: ' + event.error;
    status(reason);
    add(reason);
  };
  rec.onend = () => {
    active = false;
    document.body.classList.remove('listening');
    label.textContent = 'ATIVAR';
  };
  try { rec.start(); } catch { status('Aguarde um instante e tente novamente.'); }
}
button.addEventListener('click', () => {
  if (busy) return;
  if (active && rec) { rec.stop(); return; }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  listen();
});