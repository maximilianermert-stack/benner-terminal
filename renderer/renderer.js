// ============================================================
// Tab Switching
// ============================================================
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const targetTab = tab.dataset.tab;

    // Remove active from all tabs and contents
    tabs.forEach((t) => t.classList.remove('active'));
    tabContents.forEach((c) => c.classList.remove('active'));

    // Activate clicked tab and matching content
    tab.classList.add('active');
    const targetContent = document.getElementById(`tab-${targetTab}`);
    if (targetContent) targetContent.classList.add('active');

    // Load data when switching tabs
    if (targetTab === 'portfolio') {
      loadPortfolio();
    }
    if (targetTab === 'news' && !newsLoaded) {
      loadNews();
    }
  });
});

// ============================================================
// Close Button
// ============================================================
document.getElementById('close-btn').addEventListener('click', () => {
  window.api.closeWindow();
});

// ============================================================
// NEWS TAB
// ============================================================
let newsLoaded = false;

function formatRelativeTime(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

async function loadNews() {
  const newsList = document.getElementById('news-list');
  newsList.innerHTML = '<div class="loading">Fetching market news…</div>';

  const data = await window.api.fetchNews();
  newsLoaded = true;

  if (data.error) {
    newsList.innerHTML = `<div class="error-msg">Failed to load news: ${data.error}</div>`;
    return;
  }

  if (!data.articles || data.articles.length === 0) {
    newsList.innerHTML = '<div class="empty">No articles found.</div>';
    return;
  }

  newsList.innerHTML = '';

  data.articles.forEach((article) => {
    // Skip removed or null titles
    if (!article.title || article.title === '[Removed]') return;

    const item = document.createElement('div');
    item.className = 'news-item';

    const source = document.createElement('span');
    source.className = 'news-source';
    source.textContent = article.source?.name || 'Unknown';

    const title = document.createElement('div');
    title.className = 'news-title';
    title.textContent = article.title;

    const time = document.createElement('span');
    time.className = 'news-time';
    time.textContent = article.publishedAt ? formatRelativeTime(article.publishedAt) : '';

    item.appendChild(source);
    item.appendChild(title);
    item.appendChild(time);

    item.addEventListener('click', () => {
      if (article.url) {
        window.api.openExternal(article.url);
      }
    });

    newsList.appendChild(item);
  });
}

document.getElementById('refresh-news').addEventListener('click', () => {
  newsLoaded = false;
  loadNews();
});

// Auto-load news on startup
loadNews();

// ============================================================
// PORTFOLIO TAB
// ============================================================
let portfolio = { positions: [] };
let priceCache = {};

async function fetchPrice(symbol) {
  const now = Date.now();
  if (priceCache[symbol] && (now - priceCache[symbol].timestamp) < 60000) {
    return priceCache[symbol].price;
  }

  try {
    const data = await window.api.fetchQuote(symbol);
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
    if (price !== null) {
      priceCache[symbol] = { price, timestamp: now };
    }
    return price;
  } catch (e) {
    return null;
  }
}

async function loadPortfolio() {
  portfolio = await window.api.getPortfolio();
  if (!portfolio || !portfolio.positions) {
    portfolio = { positions: [] };
  }

  // Fetch prices for all positions
  const fetchPromises = portfolio.positions.map((pos) => fetchPrice(pos.symbol));
  await Promise.all(fetchPromises);

  renderPortfolio();
}

function formatCurrency(val) {
  if (val === null || val === undefined || isNaN(val)) return '—';
  return '$' + val.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function renderPortfolio() {
  const positionsList = document.getElementById('positions-list');
  positionsList.innerHTML = '';

  if (!portfolio.positions || portfolio.positions.length === 0) {
    positionsList.innerHTML = '<div class="empty">No positions yet. Add a ticker above.</div>';
    document.getElementById('total-value').textContent = '—';
    document.getElementById('total-pnl').textContent = '—';
    document.getElementById('total-value').className = 'sum-value';
    document.getElementById('total-pnl').className = 'sum-value';
    return;
  }

  let totalValue = 0;
  let totalCost = 0;

  portfolio.positions.forEach((pos, index) => {
    const cached = priceCache[pos.symbol];
    const currentPrice = cached ? cached.price : null;
    const shares = parseFloat(pos.shares) || 0;
    const avgCost = parseFloat(pos.avgCost) || 0;
    const posValue = currentPrice !== null ? currentPrice * shares : null;
    const posCost = avgCost * shares;
    const pnl = posValue !== null ? posValue - posCost : null;
    const pnlPct = posCost > 0 && pnl !== null ? (pnl / posCost) * 100 : null;

    if (posValue !== null) totalValue += posValue;
    totalCost += posCost;

    const row = document.createElement('div');
    row.className = 'position-row';

    const symEl = document.createElement('div');
    symEl.className = 'pos-symbol';
    symEl.textContent = pos.symbol;

    const dataEl = document.createElement('div');
    dataEl.className = 'pos-data';
    const priceDisplay = currentPrice !== null ? `$${currentPrice.toFixed(2)}` : 'Loading…';
    dataEl.innerHTML = `${shares} shares @ ${formatCurrency(avgCost)}<br>Current: ${priceDisplay}`;

    const pnlEl = document.createElement('div');
    pnlEl.className = 'pos-pnl';
    if (pnl !== null && pnlPct !== null) {
      const sign = pnl >= 0 ? '+' : '';
      pnlEl.textContent = `${sign}${formatCurrency(pnl)}\n${sign}${pnlPct.toFixed(2)}%`;
      pnlEl.classList.add(pnl >= 0 ? 'positive' : 'negative');
      pnlEl.style.whiteSpace = 'pre';
    } else {
      pnlEl.textContent = '—';
      pnlEl.style.color = 'var(--muted)';
    }

    const removeBtn = document.createElement('button');
    removeBtn.className = 'pos-remove';
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove position';
    removeBtn.addEventListener('click', () => {
      portfolio.positions.splice(index, 1);
      window.api.savePortfolio(portfolio);
      renderPortfolio();
    });

    row.appendChild(symEl);
    row.appendChild(dataEl);
    row.appendChild(pnlEl);
    row.appendChild(removeBtn);
    positionsList.appendChild(row);
  });

  // Update summary
  const totalPnl = totalValue - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  const totalValueEl = document.getElementById('total-value');
  const totalPnlEl = document.getElementById('total-pnl');

  totalValueEl.textContent = totalValue > 0 ? formatCurrency(totalValue) : '—';
  totalValueEl.className = 'sum-value';

  if (totalCost > 0) {
    const sign = totalPnl >= 0 ? '+' : '';
    totalPnlEl.textContent = `${sign}${formatCurrency(totalPnl)} (${sign}${totalPnlPct.toFixed(2)}%)`;
    totalPnlEl.className = `sum-value ${totalPnl >= 0 ? 'positive' : 'negative'}`;
  } else {
    totalPnlEl.textContent = '—';
    totalPnlEl.className = 'sum-value';
  }
}

document.getElementById('add-position').addEventListener('click', async () => {
  const tickerInput = document.getElementById('ticker');
  const sharesInput = document.getElementById('shares');
  const costInput = document.getElementById('cost');

  const symbol = tickerInput.value.trim().toUpperCase();
  const shares = parseFloat(sharesInput.value);
  const avgCost = parseFloat(costInput.value);

  if (!symbol) {
    tickerInput.focus();
    return;
  }
  if (!shares || shares <= 0) {
    sharesInput.focus();
    return;
  }
  if (!avgCost || avgCost < 0) {
    costInput.focus();
    return;
  }

  portfolio.positions.push({ symbol, shares, avgCost });
  await window.api.savePortfolio(portfolio);

  // Fetch price for the new symbol
  await fetchPrice(symbol);
  renderPortfolio();

  // Clear inputs
  tickerInput.value = '';
  sharesInput.value = '';
  costInput.value = '';
  tickerInput.focus();
});

// Allow pressing Enter in ticker field to move to shares
document.getElementById('ticker').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('shares').focus();
  }
});

// ============================================================
// CHAT TAB
// ============================================================
let chatHistory = [];

function appendMessage(role, text) {
  const chatMessages = document.getElementById('chat-messages');

  const msgDiv = document.createElement('div');
  msgDiv.className = `msg ${role}`;

  const roleSpan = document.createElement('span');
  roleSpan.className = 'msg-role';
  roleSpan.textContent = role === 'user' ? 'YOU' : 'AI ADVISOR';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = text;

  msgDiv.appendChild(roleSpan);
  msgDiv.appendChild(bubble);
  chatMessages.appendChild(msgDiv);

  // Scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;

  return msgDiv;
}

async function sendMessage() {
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');
  const text = input.value.trim();

  if (!text) return;

  // Clear input and disable button
  input.value = '';
  sendBtn.disabled = true;

  // Add user message to history and UI
  chatHistory.push({ role: 'user', content: text });
  appendMessage('user', text);

  // Show thinking indicator
  const thinkingMsg = appendMessage('assistant', 'Analyzing…');

  try {
    const response = await window.api.chat(chatHistory);

    // Remove thinking bubble
    thinkingMsg.remove();

    if (response.error) {
      appendMessage('assistant', `Error: ${response.error}`);
    } else {
      const replyText = response?.content?.[0]?.text || 'No response received.';
      chatHistory.push({ role: 'assistant', content: replyText });
      appendMessage('assistant', replyText);
    }
  } catch (e) {
    thinkingMsg.remove();
    appendMessage('assistant', `Error: ${e.message}`);
  }

  sendBtn.disabled = false;
  input.focus();
}

document.getElementById('send-btn').addEventListener('click', sendMessage);

document.getElementById('chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
