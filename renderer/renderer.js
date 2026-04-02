// ============================================================
// CONFIG
// ============================================================
const TICKER_SYMBOLS = ['SPY', 'QQQ', 'AAPL', 'NVDA', 'MSFT', 'BTC-USD', 'GLD', 'TLT'];

const PICKS_DATA = [
  { symbol: 'GLD',   name: 'SPDR Gold Shares',   target: 330,  risk: 22, benner: 'ACCUMULATE', sector: 'COMMODITY' },
  { symbol: 'BRK-B', name: 'Berkshire Hathaway', target: 580,  risk: 28, benner: 'HOLD',       sector: 'VALUE' },
  { symbol: 'MSFT',  name: 'Microsoft Corp',      target: 430,  risk: 44, benner: 'HOLD',       sector: 'TECH' },
  { symbol: 'AMZN',  name: 'Amazon.com',          target: 240,  risk: 50, benner: 'HOLD',       sector: 'TECH' },
  { symbol: 'SPY',   name: 'S&P 500 ETF',         target: 530,  risk: 55, benner: 'CAUTION',    sector: 'ETF' },
  { symbol: 'META',  name: 'Meta Platforms',      target: 640,  risk: 62, benner: 'CAUTION',    sector: 'TECH' },
  { symbol: 'TLT',   name: '20Y Treasury Bond',   target: 100,  risk: 36, benner: 'WATCH',      sector: 'BONDS' },
  { symbol: 'NVDA',  name: 'NVIDIA Corp',         target: 100,  risk: 78, benner: 'LATE CYCLE', sector: 'TECH' },
];

const BENNER_COLORS = {
  'ACCUMULATE': 'var(--accent2)',
  'HOLD':       'var(--amber)',
  'CAUTION':    'var(--amber)',
  'WATCH':      'var(--muted)',
  'LATE CYCLE': 'var(--red)',
};

// ============================================================
// TABS
// ============================================================
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${target}`)?.classList.add('active');
    if (target === 'picks' && !picksLoaded) loadPicks();
    if (target === 'news' && !newsLoaded) loadNews();
  });
});

// ============================================================
// TITLEBAR
// ============================================================
document.getElementById('close-btn').addEventListener('click', () => window.api.closeWindow());

let pinActive = false;
const pinBtn = document.getElementById('pin-btn');
pinBtn.addEventListener('click', async () => {
  pinActive = await window.api.toggleAlwaysOnTop();
  pinBtn.classList.toggle('active', pinActive);
});

// ============================================================
// TICKER BAR
// ============================================================
let tickerData = {};

function fmtTickerPrice(price) {
  if (price >= 10000) return '$' + (price / 1000).toFixed(1) + 'K';
  if (price >= 100)   return '$' + price.toFixed(2);
  return '$' + price.toFixed(3);
}

async function refreshTicker() {
  await Promise.all(TICKER_SYMBOLS.map(async sym => {
    try {
      const data = await window.api.fetchQuote(sym);
      const meta = data?.chart?.result?.[0]?.meta;
      if (meta) {
        const price = meta.regularMarketPrice;
        const prev  = meta.chartPreviousClose ?? meta.previousClose ?? price;
        tickerData[sym] = { price, change: prev ? ((price - prev) / prev) * 100 : 0 };
      }
    } catch {}
  }));
  renderTicker();
}

function renderTicker() {
  if (!Object.keys(tickerData).length) return;
  const track = document.getElementById('ticker-track');

  const items = TICKER_SYMBOLS.map(sym => {
    const d = tickerData[sym];
    if (!d) return '';
    const sign  = d.change >= 0 ? '+' : '';
    const cls   = d.change >= 0 ? 'up' : 'down';
    const arrow = d.change >= 0 ? '▲' : '▼';
    return `<span class="tick-item">
      <span class="tick-sym">${sym}</span>
      <span class="tick-price ${cls}">${fmtTickerPrice(d.price)}</span>
      <span class="tick-change ${cls}">${arrow}${sign}${d.change.toFixed(2)}%</span>
    </span>`;
  }).join('');

  // Duplicate content for seamless infinite loop
  track.innerHTML = items + items;
}

refreshTicker();
setInterval(refreshTicker, 90000);

// ============================================================
// NEWS TAB
// ============================================================
let newsLoaded = false;

const BULL_WORDS = ['surge', 'rally', 'gain', 'rise', 'breakout', 'beat', 'record', 'bullish', 'soar', 'jump', 'climbs', 'strong', 'growth', 'bounce'];
const BEAR_WORDS = ['crash', 'drop', 'fall', 'sell-off', 'recession', 'bear', 'miss', 'plunge', 'slump', 'decline', 'tumble', 'sinks', 'fear', 'warning', 'loss'];
const HOT_WORDS  = ['breaking', 'alert', 'shock', 'halted', 'suspended', 'spike', 'massive', 'historic', 'emergency', 'just in'];

function detectTags(title = '', desc = '') {
  const t = (title + ' ' + desc).toLowerCase();
  const tags = [];
  if (BULL_WORDS.some(w => t.includes(w))) tags.push({ label: 'BULL', cls: 'tag-bull' });
  if (BEAR_WORDS.some(w => t.includes(w))) tags.push({ label: 'BEAR', cls: 'tag-bear' });
  if (HOT_WORDS.some(w => t.includes(w)))  tags.push({ label: 'HOT',  cls: 'tag-hot' });
  return tags.slice(0, 2);
}

function relTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m`;
  if (h < 24) return `${h}h`;
  if (d < 7)  return `${d}d`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

async function loadNews() {
  newsLoaded = true;
  const list = document.getElementById('news-list');
  list.innerHTML = '<div class="state-msg">Fetching market news…</div>';

  const data = await window.api.fetchNews();

  if (data.error) {
    list.innerHTML = `<div class="error-msg">${data.error}</div>`;
    return;
  }

  const articles = (data.articles || []).filter(a => a.title && a.title !== '[Removed]');
  if (!articles.length) {
    list.innerHTML = '<div class="state-msg">No articles found.</div>';
    return;
  }

  list.innerHTML = '';
  articles.forEach(a => {
    const tags = detectTags(a.title, a.description);
    const tagsHtml = tags.length
      ? `<div class="news-tags">${tags.map(t => `<span class="tag ${t.cls}">${t.label}</span>`).join('')}</div>`
      : '';

    const el = document.createElement('div');
    el.className = 'news-item';
    el.innerHTML = `
      <div class="news-meta">
        <span class="news-source">${a.source?.name || '—'}</span>
        <span class="news-time">${a.publishedAt ? relTime(a.publishedAt) : ''}</span>
      </div>
      <div class="news-title">${a.title}</div>
      ${tagsHtml}
    `;
    el.addEventListener('click', () => a.url && window.api.openExternal(a.url));
    list.appendChild(el);
  });
}

document.getElementById('refresh-news').addEventListener('click', () => {
  newsLoaded = false;
  loadNews();
});

loadNews();

// ============================================================
// PICKS TAB
// ============================================================
let picksLoaded = false;

function riskColor(r) {
  if (r <= 33) return 'var(--accent2)';
  if (r <= 66) return 'var(--amber)';
  return 'var(--red)';
}

async function loadPicks() {
  picksLoaded = true;
  const container = document.getElementById('picks-list');
  container.innerHTML = '<div class="state-msg">Loading picks…</div>';

  await Promise.all(PICKS_DATA.map(async pick => {
    try {
      const data = await window.api.fetchQuote(pick.symbol);
      const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (price != null) pick.livePrice = price;
    } catch {}
  }));

  container.innerHTML = '';

  PICKS_DATA.forEach(pick => {
    const price  = pick.livePrice ?? null;
    const upside = price != null ? ((pick.target - price) / price) * 100 : null;
    const upsign = upside != null && upside >= 0 ? '+' : '';
    const upcls  = upside == null ? '' : upside >= 0 ? 'up' : 'down';
    const bc     = BENNER_COLORS[pick.benner] || 'var(--muted)';

    const card = document.createElement('div');
    card.className = 'pick-card';
    card.innerHTML = `
      <div class="pick-header">
        <div class="pick-left">
          <span class="pick-symbol">${pick.symbol}</span>
          <span class="pick-sector">${pick.sector}</span>
        </div>
        <span class="pick-benner" style="color:${bc};border-color:${bc}44;background:${bc}0e">${pick.benner}</span>
      </div>
      <div class="pick-name">${pick.name}</div>
      <div class="pick-prices">
        <div class="pick-price-item">
          <span class="pick-price-label">PRICE</span>
          <span class="pick-price-val">${price != null ? '$' + price.toFixed(2) : '—'}</span>
        </div>
        <div class="pick-price-item">
          <span class="pick-price-label">TARGET</span>
          <span class="pick-price-val">$${pick.target.toLocaleString()}</span>
        </div>
        <div class="pick-price-item">
          <span class="pick-price-label">UPSIDE</span>
          <span class="pick-price-val ${upcls}">${upside != null ? upsign + upside.toFixed(1) + '%' : '—'}</span>
        </div>
      </div>
      <div class="risk-bar-row">
        <span class="risk-label">RISK</span>
        <div class="risk-bar-track">
          <div class="risk-bar-fill" style="width:${pick.risk}%;background:${riskColor(pick.risk)}"></div>
        </div>
        <span class="risk-val" style="color:${riskColor(pick.risk)}">${pick.risk}</span>
      </div>
    `;
    container.appendChild(card);
  });
}

// ============================================================
// CHAT TAB
// ============================================================
let chatHistory = [];

function appendMsg(role, text, isThinking = false) {
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = `msg ${role}${isThinking ? ' msg-thinking' : ''}`;

  const safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  div.innerHTML = `
    <span class="msg-role">${role === 'user' ? 'YOU' : 'BENNER AI'}</span>
    <div class="msg-bubble">${safe}</div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

async function sendMessage() {
  const input   = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');
  const text    = input.value.trim();
  if (!text) return;

  input.value      = '';
  sendBtn.disabled = true;

  chatHistory.push({ role: 'user', content: text });
  appendMsg('user', text);

  const thinking = appendMsg('assistant', '···', true);

  try {
    const res = await window.api.chat(chatHistory);
    thinking.remove();

    if (res.error) {
      appendMsg('assistant', 'Error: ' + res.error);
    } else {
      const reply = res?.content?.[0]?.text || 'No response.';
      chatHistory.push({ role: 'assistant', content: reply });
      appendMsg('assistant', reply);
    }
  } catch (e) {
    thinking.remove();
    appendMsg('assistant', 'Error: ' + e.message);
  }

  sendBtn.disabled = false;
  input.focus();
}

document.getElementById('send-btn').addEventListener('click', sendMessage);
document.getElementById('chat-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
