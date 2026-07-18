/* ─────────────────────────────────────────────────────
   OmniCommand Tab — Application Logic
   Pure vanilla JS, no dependencies beyond CDN libs
───────────────────────────────────────────────────── */

'use strict';

/* ═══════ 0. GEMINI API LAYER ═══════ */

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Get saved Gemini API key */
function getApiKey() { return STORE.get('gemini_api_key', null); }

/** Check if AI is available */
function aiEnabled() { return !!getApiKey(); }

/** Update the AI status badge in the header */
function updateAiBadge() {
  const badge  = document.getElementById('ai-status-badge');
  const text   = document.getElementById('ai-badge-text');
  if (!badge || !text) return;
  if (aiEnabled()) {
    badge.className = 'ai-badge ai-badge-on';
    text.textContent = 'Gemini AI';
  } else {
    badge.className = 'ai-badge ai-badge-off';
    text.textContent = 'AI Off';
  }
}

/**
 * Core Gemini API call — send a prompt, get text back.
 * @param {string} prompt
 * @param {object} [opts]
 * @returns {Promise<string>}
 */
async function callGemini(prompt, opts = {}) {
  const key = getApiKey();
  if (!key) throw new Error('No API key set. Open Settings (⚙️) and add your Gemini key.');

  const url = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${key}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.4,
      maxOutputTokens: opts.maxTokens ?? 800,
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gemini API error ${res.status}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text.trim();
}

/**
 * Gemini: Categorize a single expense description.
 * Returns one of: food, grocery, transport, shopping, bills, health, other
 */
async function geminiCategorize(description) {
  const prompt = `Categorize this expense into exactly ONE of these categories:
food, grocery, transport, shopping, bills, health, other

Expense: "${description}"

Respond with ONLY the single category word, nothing else.`;
  const result = await callGemini(prompt, { temperature: 0.1, maxTokens: 10 });
  const cat = result.toLowerCase().trim().split(/\s/)[0];
  return ['food','grocery','transport','shopping','bills','health','other'].includes(cat) ? cat : 'other';
}

/**
 * Gemini: Tailor a resume against a job description.
 * Returns JSON: { score, matched_keywords, unmatched_keywords, tailored_resume }
 */
async function geminiTailorResume(resume, jd) {
  const prompt = `You are an expert resume coach. Analyze the resume against the job description.

RESUME:
${resume}

JOB DESCRIPTION:
${jd}

Return a JSON object with exactly these fields:
- score (number 0-100, keyword match percentage)
- matched_keywords (array of strings, max 15)
- unmatched_keywords (array of strings, max 10, important JD keywords missing from resume)
- tailored_resume (string: the original resume text, rewritten to emphasize matched keywords. Wrap each matched keyword in **double asterisks** for highlighting.)

Return ONLY valid JSON, no markdown fences.`;
  const raw = await callGemini(prompt, { temperature: 0.3, maxTokens: 1200 });
  const cleaned = raw.replace(/```json?\n?|```/g, '').trim();
  return JSON.parse(cleaned);
}

/**
 * Gemini: Parse an invoice natural language description.
 * Returns { client, amount, currency, description }
 */
async function geminiParseInvoice(text) {
  const prompt = `Extract invoice details from this natural language description.

Input: "${text}"

Return a JSON object with exactly:
- client (string: company or person name)
- amount (number: numeric value only)
- currency (string: INR, USD, or EUR — default INR)
- description (string: what service/product)

Return ONLY valid JSON, no markdown fences.`;
  const raw = await callGemini(prompt, { temperature: 0.1, maxTokens: 150 });
  const cleaned = raw.replace(/```json?\n?|```/g, '').trim();
  return JSON.parse(cleaned);
}

/**
 * Gemini: Summarize a URL/page title into a summary and tags.
 * Returns { summary, tags[] }
 */
async function geminiSummarizeBookmark(url, title) {
  const prompt = `Given this URL and page title, generate a short summary (1-2 sentences) and up to 5 relevant tags.

URL: ${url}
Title: ${title}

Return JSON with:
- summary (string)
- tags (array of strings, max 5, lowercase, no spaces)

Return ONLY valid JSON, no markdown fences.`;
  const raw = await callGemini(prompt, { temperature: 0.4, maxTokens: 150 });
  const cleaned = raw.replace(/```json?\n?|```/g, '').trim();
  return JSON.parse(cleaned);
}

/**
 * Gemini: Extract decisions and action items from meeting notes.
 * Returns { decisions[], actions[{owner, task, deadline}] }
 */
async function geminiExtractNotes(notes) {
  const prompt = `You are an expert meeting analyst. Extract structured information from these meeting notes.

MEETING NOTES:
${notes}

Return a JSON object with:
- decisions (array of strings: clear decisions made in the meeting)
- actions (array of objects with: owner (string, person's name), task (string, what they need to do), deadline (string or null, when it's due))

Return ONLY valid JSON, no markdown fences.`;
  const raw = await callGemini(prompt, { temperature: 0.2, maxTokens: 800 });
  const cleaned = raw.replace(/```json?\n?|```/g, '').trim();
  return JSON.parse(cleaned);
}


/* ═══════ 1. UTILITIES ═══════ */

/** Show toast notification */
function toast(msg, type = 'info', duration = 3000) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = 'toast'; }, duration);
}

/** Format currency */
function fmtCurrency(amount, currency = 'INR') {
  const symbols = { INR: '₹', USD: '$', EUR: '€' };
  const sym = symbols[currency] || currency;
  return `${sym}${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/** Debounce */
function debounce(fn, delay) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

/** Scroll to widget and briefly highlight it */
function focusWidget(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.classList.add('highlight');
  setTimeout(() => el.classList.remove('highlight'), 2000);
}

/** Local storage persistence */
const STORE = {
  get(key, fallback = null) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { }
  }
};

/* ═══════ 2. LIVE CLOCK ═══════ */

function startClock() {
  const el = document.getElementById('live-clock');
  function tick() {
    const now = new Date();
    el.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  tick();
  setInterval(tick, 1000);
}

/* ═══════ 3. EXPENSE TRACKER ═══════ */

const EXPENSE_CATEGORIES = {
  food:       { label: 'Food & Dining',  color: '#a78bfa', keywords: ['chai', 'coffee', 'tea', 'lunch', 'dinner', 'breakfast', 'food', 'snack', 'pizza', 'burger', 'restaurant', 'meal', 'eat', 'biryani', 'samosa', 'rice', 'roti', 'dosa', 'idli', 'thali', 'swiggy', 'zomato', 'dunkin', 'subway', 'kfc', 'mcdonalds'] },
  grocery:    { label: 'Grocery',        color: '#34d399', keywords: ['grocery', 'groceries', 'vegetables', 'fruit', 'milk', 'bread', 'eggs', 'supermarket', 'big bazaar', 'dmart', 'reliance', 'blinkit', 'zepto', 'instamart', 'fresh', 'provisions'] },
  transport:  { label: 'Transport',      color: '#60a5fa', keywords: ['uber', 'ola', 'cab', 'auto', 'bus', 'metro', 'train', 'fuel', 'petrol', 'diesel', 'rapido', 'ride', 'taxi', 'commute', 'travel', 'flight', 'ticket'] },
  shopping:   { label: 'Shopping',       color: '#f472b6', keywords: ['clothes', 'shirt', 'shoes', 'amazon', 'flipkart', 'myntra', 'ajio', 'nykaa', 'buy', 'purchase', 'mall', 'shop', 'amazon', 'order', 'delivery'] },
  bills:      { label: 'Bills',          color: '#fb923c', keywords: ['electricity', 'internet', 'wifi', 'recharge', 'mobile', 'phone', 'bill', 'subscription', 'netflix', 'spotify', 'hotstar', 'ott', 'jio', 'airtel', 'bsnl', 'gas', 'water'] },
  health:     { label: 'Health',         color: '#4ade80', keywords: ['medicine', 'pharmacy', 'chemist', 'doctor', 'hospital', 'gym', 'fitness', 'yoga', 'medic', 'health', 'vitamins', '1mg', 'pharmeasy'] },
  other:      { label: 'Other',          color: '#94a3b8', keywords: [] }
};

function categorize(description) {
  const lower = description.toLowerCase();
  for (const [key, cat] of Object.entries(EXPENSE_CATEGORIES)) {
    if (key === 'other') continue;
    if (cat.keywords.some(kw => lower.includes(kw))) return key;
  }
  return 'other';
}

function parseExpenseInput(raw) {
  // Extract amount (first number found)
  const amountMatch = raw.match(/\d+(\.\d+)?/);
  if (!amountMatch) return null;

  const amount = parseFloat(amountMatch[0]);
  const description = raw.replace(amountMatch[0], '').trim();
  const category = categorize(raw);
  return { description: description || raw, amount, category, raw };
}

const expenses = STORE.get('expenses', [
  { id: 1, description: 'Coffee at Café Day', amount: 180, category: 'food', date: Date.now() - 86400000 * 2 },
  { id: 2, description: 'Uber to office', amount: 240, category: 'transport', date: Date.now() - 86400000 },
  { id: 3, description: 'Grocery — DMart', amount: 1200, category: 'grocery', date: Date.now() - 43200000 },
]);

let nextExpenseId = STORE.get('nextExpenseId', 4);

function saveExpenses() { STORE.set('expenses', expenses); STORE.set('nextExpenseId', nextExpenseId); }

function addExpense(parsed) {
  const entry = { id: nextExpenseId++, description: parsed.description, amount: parsed.amount, category: parsed.category, date: Date.now() };
  expenses.unshift(entry);
  if (expenses.length > 50) expenses.splice(50); // cap at 50
  saveExpenses();
  renderExpenses();
  simulateWebhook(entry);
}

function getMonthlyExpenses() {
  const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0,0,0,0);
  return expenses.filter(e => e.date >= startOfMonth.getTime());
}

function renderExpenses() {
  const monthly = getMonthlyExpenses();
  // Build category totals
  const totals = {};
  let grandTotal = 0;
  for (const e of monthly) {
    totals[e.category] = (totals[e.category] || 0) + e.amount;
    grandTotal += e.amount;
  }

  // Total
  document.getElementById('donut-total').textContent = fmtCurrency(grandTotal);

  // Donut chart
  drawDonut(totals, grandTotal);

  // Legend
  const legendEl = document.getElementById('exp-legend');
  legendEl.innerHTML = '';
  for (const [cat, amt] of Object.entries(totals)) {
    const info = EXPENSE_CATEGORIES[cat];
    if (!info) continue;
    const div = document.createElement('div');
    div.className = 'legend-item';
    div.innerHTML = `<span class="legend-dot" style="background:${info.color}"></span><span class="legend-name">${info.label}</span><span class="legend-val">${fmtCurrency(amt)}</span>`;
    legendEl.appendChild(div);
  }

  // Table
  const tbody = document.getElementById('exp-tbody');
  tbody.innerHTML = '';
  const recent = expenses.slice(0, 8);
  if (recent.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#475569;padding:20px">No expenses yet</td></tr>`;
    return;
  }
  for (const e of recent) {
    const cat = EXPENSE_CATEGORIES[e.category] || EXPENSE_CATEGORIES.other;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${e.description}</td>
      <td><span class="cat-chip" style="background:${cat.color}20;color:${cat.color};border:1px solid ${cat.color}40">${cat.label}</span></td>
      <td style="font-family:var(--font-mono);color:var(--text-primary)">${fmtCurrency(e.amount)}</td>
      <td><span class="sync-ok">Synced</span></td>
    `;
    tbody.appendChild(tr);
  }
}

function drawDonut(totals, grandTotal) {
  const canvas = document.getElementById('donut-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const cx = W / 2, cy = H / 2, r = 46, lineW = 14;

  if (grandTotal === 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = lineW;
    ctx.stroke();
    return;
  }

  let startAngle = -Math.PI / 2;
  for (const [cat, amt] of Object.entries(totals)) {
    const info = EXPENSE_CATEGORIES[cat];
    const slice = (amt / grandTotal) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, startAngle + slice);
    ctx.strokeStyle = info ? info.color : '#94a3b8';
    ctx.lineWidth = lineW;
    ctx.lineCap = 'butt';
    ctx.stroke();
    startAngle += slice;
  }
}

function simulateWebhook(entry) {
  const logEl = document.getElementById('exp-log');
  const ts = new Date().toLocaleTimeString();
  const cat = EXPENSE_CATEGORIES[entry.category] || EXPENSE_CATEGORIES.other;

  const lines = [
    { cls: 'info', text: `[${ts}] POST /webhook/expenses — viaSocket trigger initiated` },
    { cls: 'info', text: `[${ts}] Payload: { desc: "${entry.description}", amount: ${entry.amount}, cat: "${cat.label}" }` },
    { cls: 'success', text: `[${ts}] ✓ Google Sheets row appended — Row #${Math.floor(Math.random()*900)+100}` },
    { cls: 'success', text: `[${ts}] ✓ Sync complete. Monthly total: ${fmtCurrency(getMonthlyExpenses().reduce((a,b)=>a+b.amount,0))}` },
  ];

  logEl.innerHTML = '';
  let delay = 0;
  for (const line of lines) {
    delay += 350;
    setTimeout(() => {
      const span = document.createElement('span');
      span.className = `log ${line.cls}`;
      span.textContent = line.text;
      logEl.appendChild(span);
      logEl.scrollTop = logEl.scrollHeight;
    }, delay);
  }
}

function initExpenseTracker() {
  renderExpenses();

  const input = document.getElementById('exp-input');
  const btn   = document.getElementById('exp-add-btn');

  async function handleAdd() {
    const raw = input.value.trim();
    if (!raw) { toast('Please enter an expense description and amount', 'error'); return; }
    const parsed = parseExpenseInput(raw);
    if (!parsed) { toast('Could not parse amount — include a number (e.g. chai 40)', 'error'); return; }

    // AI categorization
    if (aiEnabled()) {
      btn.disabled = true;
      btn.innerHTML = '<span class="ai-loading"></span>';
      try {
        parsed.category = await geminiCategorize(parsed.description + ' ' + raw);
      } catch (e) {
        console.warn('AI categorize failed:', e.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="plus-circle"></i>';
        lucide.createIcons();
      }
    }

    addExpense(parsed);
    input.value = '';
    const catLabel = EXPENSE_CATEGORIES[parsed.category]?.label || parsed.category;
    toast(`${aiEnabled() ? '🤖 AI' : '✓'} Logged ₹${parsed.amount} → ${catLabel}`, 'success');
  }

  btn.addEventListener('click', handleAdd);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') handleAdd(); });
}

/* ═══════ 4. INVOICE GENERATOR ═══════ */

function getInvoiceCurrencySymbol() {
  const v = document.getElementById('inv-currency').value;
  return { INR: '₹', USD: '$', EUR: '€' }[v] || '₹';
}

function updateInvoiceCalc() {
  const base = parseFloat(document.getElementById('inv-amount').value) || 0;
  const gst  = parseFloat(document.getElementById('inv-gst').value) || 0;
  const sym  = getInvoiceCurrencySymbol();
  const gstAmt = base * (gst / 100);
  const total  = base + gstAmt;

  document.getElementById('c-base').textContent = `${sym}${base.toLocaleString('en-IN')}`;
  document.getElementById('c-gst').textContent  = `${sym}${gstAmt.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  document.getElementById('c-total').textContent = `${sym}${total.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  generateUPIQR();
}

function generateUPIQR() {
  const canvas = document.getElementById('upi-qr');
  if (!canvas || typeof QRious === 'undefined') return;
  const upiId  = document.getElementById('inv-upi').value.trim() || 'example@upi';
  const amount = parseFloat(document.getElementById('inv-amount').value) || 0;
  const gst    = parseFloat(document.getElementById('inv-gst').value) || 0;
  const total  = amount + (amount * gst / 100);
  const client = document.getElementById('inv-client').value.trim() || 'Invoice';
  const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(client)}&am=${total.toFixed(2)}&cu=INR&tn=${encodeURIComponent('Invoice Payment')}`;

  new QRious({
    element: canvas,
    value: upiUrl,
    size: 140,
    background: '#ffffff',
    foreground: '#0d0f1a',
    level: 'M',
    padding: 10
  });
}

function parseInvoiceNL(text) {
  const tokens = text.split(/\s+/);
  let client = '', amount = 0, currency = 'INR';
  for (const t of tokens) {
    if (/^\d+/.test(t)) { amount = parseFloat(t); }
    else if (/^(usd|inr|eur|\$|₹|€)$/i.test(t)) { currency = t.toUpperCase().replace(/[$₹€]/,''); }
    else if (t && !client) { client = t; }
    else if (t) { client += ' ' + t; }
  }
  return { client: client.trim(), amount, currency };
}

function initInvoice() {
  generateUPIQR();
  updateInvoiceCalc();

  ['inv-amount', 'inv-gst', 'inv-currency', 'inv-upi', 'inv-client'].forEach(id => {
    document.getElementById(id).addEventListener('input', debounce(updateInvoiceCalc, 300));
  });

  document.getElementById('inv-nl-btn').addEventListener('click', async () => {
    const txt = document.getElementById('inv-nl-input').value.trim();
    if (!txt) return;

    const nlBtn = document.getElementById('inv-nl-btn');
    nlBtn.disabled = true;
    const originalHtml = nlBtn.innerHTML;
    nlBtn.innerHTML = '<span class="ai-loading"></span> Parsing';

    try {
      let parsed;
      if (aiEnabled()) {
        try {
          parsed = await geminiParseInvoice(txt);
        } catch (e) {
          console.warn('Gemini invoice parse failed, using fallback:', e.message);
          parsed = parseInvoiceNL(txt);
        }
      } else {
        parsed = parseInvoiceNL(txt);
      }

      if (parsed.client) document.getElementById('inv-client').value = parsed.client.charAt(0).toUpperCase() + parsed.client.slice(1);
      if (parsed.amount) document.getElementById('inv-amount').value = parsed.amount;
      if (parsed.currency) document.getElementById('inv-currency').value = parsed.currency;
      if (parsed.description) document.getElementById('inv-upi').setAttribute('data-desc', parsed.description);
      updateInvoiceCalc();
      document.getElementById('inv-nl-input').value = '';
      toast(`${aiEnabled() ? '🤖 AI parsed' : '✓ Parsed'}: ${parsed.client || 'client'} · ${parsed.currency || 'INR'} ${parsed.amount}`, 'success');
    } finally {
      nlBtn.disabled = false;
      nlBtn.innerHTML = originalHtml;
      lucide.createIcons();
    }
  });

  document.getElementById('inv-nl-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('inv-nl-btn').click();
  });

  document.getElementById('gen-invoice-btn').addEventListener('click', () => {
    toast('✓ Invoice generated! (PDF export requires a backend)', 'info');
  });

  document.getElementById('copy-upi-btn').addEventListener('click', () => {
    const upiId = document.getElementById('inv-upi').value.trim();
    const amount = parseFloat(document.getElementById('inv-amount').value) || 0;
    const gst = parseFloat(document.getElementById('inv-gst').value) || 0;
    const total = amount + (amount * gst / 100);
    const client = document.getElementById('inv-client').value.trim();
    const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(client)}&am=${total.toFixed(2)}&cu=INR&tn=Invoice Payment`;
    navigator.clipboard.writeText(upiUrl).then(() => toast('✓ UPI payment link copied!', 'success')).catch(() => toast('Copy failed', 'error'));
  });
}

/* ═══════ 5. RESUME TAILOR ═══════ */

function extractKeywords(text) {
  const stopWords = new Set(['a','an','the','and','or','but','in','on','at','to','for','of','with','by','from','as','is','was','be','it','we','are','that','this','have','has','will','can','not','also','our','their','your','you','do','does','its','been','more','each','other','all','they','which','who','than','had','into','about','new','any','out','up','if','would','one','use','such','only','very','some','when','them']);
  const words = text.toLowerCase().match(/\b[a-z][a-z.+]+\b/g) || [];
  const freq = {};
  for (const w of words) {
    if (!stopWords.has(w) && w.length > 2) freq[w] = (freq[w] || 0) + 1;
  }
  return Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0, 25).map(([w]) => w);
}

function emphasizeKeywords(resume, keywords) {
  let result = resume;
  for (const kw of keywords) {
    const re = new RegExp(`\\b(${kw.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})\\b`, 'gi');
    result = result.replace(re, match => `**${match}**`);
  }
  return result;
}

function renderTailored(text) {
  // Convert **bold** to <em> for highlighting
  return text
    .replace(/\*\*(.+?)\*\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

function initResumeTailor() {
  document.getElementById('tailor-btn').addEventListener('click', async () => {
    const master = document.getElementById('resume-master').value.trim();
    const jd     = document.getElementById('resume-jd').value.trim();
    if (!master || !jd) { toast('Please fill both the resume and job description fields', 'error'); return; }

    const btn = document.getElementById('tailor-btn');
    btn.disabled = true;
    const origHtml = btn.innerHTML;
    btn.innerHTML = '<span class="ai-loading"></span> ' + (aiEnabled() ? 'AI Analysing...' : 'Analysing...');

    try {
      let score, matched, unmatched, tailoredText;

      if (aiEnabled()) {
        try {
          const result = await geminiTailorResume(master, jd);
          score     = result.score ?? 0;
          matched   = result.matched_keywords ?? [];
          unmatched = result.unmatched_keywords ?? [];
          tailoredText = result.tailored_resume ?? master;
        } catch (e) {
          console.warn('Gemini resume tailor failed, using fallback:', e.message);
          toast('AI failed, using local analysis', 'warn');
          // fallback
          const resumeKws = new Set(extractKeywords(master));
          const jdKws     = new Set(extractKeywords(jd));
          matched   = [...jdKws].filter(k => [...resumeKws].some(r => r.includes(k) || k.includes(r)));
          unmatched = [...jdKws].filter(k => !matched.includes(k)).slice(0, 10);
          score     = Math.min(100, Math.round((matched.length / Math.max(jdKws.size, 1)) * 100));
          tailoredText = emphasizeKeywords(master, matched);
        }
      } else {
        const resumeKws = new Set(extractKeywords(master));
        const jdKws     = new Set(extractKeywords(jd));
        matched   = [...jdKws].filter(k => [...resumeKws].some(r => r.includes(k) || k.includes(r)));
        unmatched = [...jdKws].filter(k => !matched.includes(k)).slice(0, 10);
        score     = Math.min(100, Math.round((matched.length / Math.max(jdKws.size, 1)) * 100));
        tailoredText = emphasizeKeywords(master, matched);
      }

      document.getElementById('match-score').textContent = `${score}%`;
      document.getElementById('score-fill').style.width = `${score}%`;

      const kwtEl = document.getElementById('kw-tags');
      kwtEl.innerHTML = '';
      for (const kw of matched.slice(0, 15)) {
        kwtEl.innerHTML += `<span class="kw-tag matched">✓ ${kw}</span>`;
      }
      for (const kw of unmatched.slice(0, 8)) {
        kwtEl.innerHTML += `<span class="kw-tag unmatched">✗ ${kw}</span>`;
      }

      const preview = document.getElementById('tailored-preview');
      preview.innerHTML = renderTailored(tailoredText);

      toast(`${aiEnabled() ? '🤖 AI' : '✓'} ${matched.length} keywords matched — ${score}% match`, 'success');
    } finally {
      btn.disabled = false;
      btn.innerHTML = origHtml;
      lucide.createIcons();
    }
  });

  document.getElementById('copy-resume-btn').addEventListener('click', () => {
    const text = document.getElementById('resume-master').value;
    navigator.clipboard.writeText(text).then(() => toast('✓ Tailored resume copied!', 'success')).catch(() => toast('Copy failed', 'error'));
  });
}

/* ═══════ 6. BOOKMARK BRAIN ═══════ */

const BOOKMARK_SUMMARIES = {
  'react.dev':       { summary: 'Official React documentation — hooks, components, state management.', tags: ['react', 'javascript', 'frontend', 'ui'] },
  'nextjs.org':      { summary: 'Next.js docs — SSR, App Router, API routes, performance.', tags: ['nextjs', 'react', 'ssr', 'fullstack'] },
  'github.com':      { summary: 'GitHub — code hosting, pull requests, CI/CD pipelines.', tags: ['git', 'hosting', 'open source', 'devops'] },
  'dev.to':          { summary: "Developer blog community — tutorials, tips, trending tech posts.", tags: ['blog', 'learning', 'developer'] },
  'stackoverflow.com': { summary: 'Stack Overflow — Q&A for programming problems.', tags: ['qa', 'debugging', 'developer', 'help'] },
  'tailwindcss.com': { summary: 'Tailwind CSS documentation — utility-first CSS framework.', tags: ['css', 'tailwind', 'styling', 'frontend'] },
  'notion.so':       { summary: 'Notion — all-in-one workspace for notes, wikis, databases.', tags: ['productivity', 'notes', 'workspace'] },
  'viasocket.com':   { summary: 'viaSocket — workflow automation with webhooks and integrations.', tags: ['automation', 'webhook', 'integration', 'saas'] },
};

function autoMeta(url, title) {
  try {
    const hostname = new URL(url.startsWith('http') ? url : 'https://' + url).hostname.replace(/^www\./, '');
    const known = BOOKMARK_SUMMARIES[hostname];
    if (known) return known;
    // Fallback: generate tags from title
    const tags = title.toLowerCase().match(/\b[a-z]{3,}\b/g)?.slice(0,4) || ['link'];
    return { summary: `Saved from ${hostname}. Auto-tagged for later discovery.`, tags };
  } catch { return { summary: 'Saved link.', tags: ['general'] }; }
}

const bookmarks = STORE.get('bookmarks', [
  { id: 1, url: 'https://react.dev', title: 'React Docs', ...autoMeta('https://react.dev', 'React Docs'), date: Date.now() - 86400000 * 3 },
  { id: 2, url: 'https://viasocket.com', title: 'viaSocket Automation', ...autoMeta('https://viasocket.com', 'viaSocket'), date: Date.now() - 86400000 },
  { id: 3, url: 'https://dev.to', title: 'DEV Community', ...autoMeta('https://dev.to', 'DEV blog'), date: Date.now() - 43200000 },
]);
let nextBmId = STORE.get('nextBmId', 4);

function saveBookmarks() { STORE.set('bookmarks', bookmarks); STORE.set('nextBmId', nextBmId); }

function scoreBookmark(bm, query) {
  if (!query) return 1;
  const q = query.toLowerCase();
  const text = `${bm.title} ${bm.summary} ${(bm.tags || []).join(' ')}`.toLowerCase();
  const words = q.split(/\s+/);
  let score = 0;
  for (const w of words) {
    if (text.includes(w)) score++;
    if (bm.title.toLowerCase().includes(w)) score += 2;
    if ((bm.tags || []).some(t => t.includes(w))) score += 1.5;
  }
  return score;
}

function renderBookmarks(query = '') {
  const listEl = document.getElementById('bm-list');
  listEl.innerHTML = '';

  const scored = bookmarks.map(bm => ({ ...bm, score: scoreBookmark(bm, query) }));
  const filtered = query ? scored.filter(b => b.score > 0) : scored;
  filtered.sort((a, b) => (query ? b.score - a.score : b.date - a.date));

  if (filtered.length === 0) {
    listEl.innerHTML = `<div style="text-align:center;padding:30px;color:var(--text-muted);font-size:0.82rem">No bookmarks found for "${query}"</div>`;
    return;
  }

  for (const bm of filtered) {
    const initial = (bm.title || 'L').charAt(0).toUpperCase();
    const el = document.createElement('a');
    el.href = bm.url;
    el.target = '_blank';
    el.rel = 'noopener noreferrer';
    el.className = 'bm-item';
    el.style.textDecoration = 'none';
    el.innerHTML = `
      <div class="bm-favicon">${initial}</div>
      <div class="bm-info">
        <div class="bm-title-text">${bm.title}</div>
        <div class="bm-summary">${bm.summary}</div>
        <div class="bm-tag-row">${(bm.tags || []).map(t => `<span class="bm-tag">${t}</span>`).join('')}</div>
      </div>
    `;
    listEl.appendChild(el);
  }
}

function initBookmarks() {
  renderBookmarks();

  const searchInput = document.getElementById('bm-search');
  searchInput.addEventListener('input', debounce(() => renderBookmarks(searchInput.value.trim()), 250));

  document.getElementById('bm-add-btn').addEventListener('click', async () => {
    const url   = document.getElementById('bm-url').value.trim();
    const title = document.getElementById('bm-title').value.trim();
    if (!url || !title) { toast('Please provide both URL and title', 'error'); return; }

    const addBtn = document.getElementById('bm-add-btn');
    addBtn.disabled = true;
    const origHtml = addBtn.innerHTML;
    addBtn.innerHTML = '<span class="ai-loading"></span> ' + (aiEnabled() ? 'AI Summarizing...' : 'Saving...');

    let meta;
    if (aiEnabled()) {
      try {
        meta = await geminiSummarizeBookmark(url, title);
      } catch (e) {
        console.warn('Gemini bookmark summarize failed, using fallback:', e.message);
        meta = autoMeta(url, title);
      }
    } else {
      meta = autoMeta(url, title);
    }

    const bm = { id: nextBmId++, url, title, ...meta, date: Date.now() };
    bookmarks.unshift(bm);
    if (bookmarks.length > 100) bookmarks.splice(100);
    saveBookmarks();
    renderBookmarks();
    document.getElementById('bm-url').value = '';
    document.getElementById('bm-title').value = '';
    toast(`${aiEnabled() ? '🤖 AI tagged' : '✓ Saved'} · Tags: ${(meta.tags || []).slice(0,3).join(', ')}`, 'success');

    addBtn.disabled = false;
    addBtn.innerHTML = origHtml;
    lucide.createIcons();
  });
}

/* ═══════ 7. MEETING NOTES EXTRACTOR ═══════ */

const DECISION_TRIGGERS = ['decided', 'decision', 'agreed', 'agreement', 'confirmed', 'resolved', 'conclude', 'go with', 'we will', 'final'];
const ACTION_PATTERNS = [
  { re: /(\w+(?:\s+\w+)?)\s+(?:will|needs? to|shall|to)\s+(.+?)(?:\s+by\s+(.+?))?[.!,]?$/i, ownerIdx: 1, taskIdx: 2, deadlineIdx: 3 },
  { re: /(?:action\s*item[:.]?\s*)(.+?)\s+(?:owner|assigned to|by)[:\s]+(\w+(?:\s+\w+)?)\s*(?:by\s+(.+?))?[.!]?$/i, taskIdx: 1, ownerIdx: 2, deadlineIdx: 3 },
];

function extractNotes(text) {
  const lines = text.split(/\n|\./).map(l => l.trim()).filter(Boolean);
  const decisions = [];
  const actions   = [];

  for (const line of lines) {
    const lower = line.toLowerCase();

    if (DECISION_TRIGGERS.some(t => lower.includes(t))) {
      const clean = line.replace(/^\w+:\s*/, '').replace(/decided[:\s]*/i, '').trim();
      if (clean && !decisions.includes(clean)) decisions.push(clean);
      continue;
    }

    for (const pattern of ACTION_PATTERNS) {
      const m = line.match(pattern.re);
      if (m) {
        const owner    = m[pattern.ownerIdx]?.trim() || 'TBD';
        const task     = m[pattern.taskIdx]?.trim() || line;
        const deadline = m[pattern.deadlineIdx]?.trim() || null;
        actions.push({ owner, task, deadline, done: false });
        break;
      }
    }

    // Fallback: lines with "I will" or "I'll"
    if (/\bI(?:'ll| will)\b/i.test(line) && !actions.some(a => line.includes(a.task))) {
      const speakerMatch = line.match(/^(\w+):\s*/);
      const owner = speakerMatch ? speakerMatch[1] : 'Speaker';
      const task  = line.replace(/^\w+:\s*/, '').replace(/\bI(?:'ll| will)\b/i, 'will').trim();
      const deadlineMatch = task.match(/\bby\s+(.+?)(?:[.,]|$)/i);
      actions.push({ owner, task, deadline: deadlineMatch?.[1] || null, done: false });
    }
  }

  return { decisions, actions };
}

function renderNotes(decisions, actions) {
  const container = document.getElementById('notes-output');
  container.style.display = 'flex';

  const decEl = document.getElementById('notes-decisions');
  decEl.innerHTML = '';
  if (decisions.length === 0) {
    decEl.innerHTML = '<li style="color:var(--text-muted);font-size:0.82rem;padding:8px">No explicit decisions found.</li>';
  } else {
    for (const d of decisions) {
      const li = document.createElement('li');
      li.textContent = d;
      decEl.appendChild(li);
    }
  }

  const actEl = document.getElementById('notes-actions');
  actEl.innerHTML = '';
  if (actions.length === 0) {
    actEl.innerHTML = '<div style="color:var(--text-muted);font-size:0.82rem;padding:8px">No action items identified.</div>';
  } else {
    for (const a of actions) {
      const div = document.createElement('div');
      div.className = 'action-item';
      div.innerHTML = `
        <input type="checkbox" class="action-check" ${a.done ? 'checked' : ''}>
        <div class="action-info">
          <div class="action-text">${a.task}</div>
          <div class="action-meta">
            <span class="action-owner">@${a.owner}</span>
            ${a.deadline ? ` · Due: <strong>${a.deadline}</strong>` : ''}
          </div>
        </div>
      `;
      div.querySelector('.action-check').addEventListener('change', function() {
        div.classList.toggle('done', this.checked);
      });
      actEl.appendChild(div);
    }
  }
}

function initNotes() {
  document.getElementById('extract-btn').addEventListener('click', async () => {
    const raw = document.getElementById('notes-input').value.trim();
    if (!raw) { toast('Please paste some meeting notes first', 'error'); return; }

    const btn = document.getElementById('extract-btn');
    btn.disabled = true;
    const origHtml = btn.innerHTML;
    btn.innerHTML = '<span class="ai-loading"></span> ' + (aiEnabled() ? 'AI Extracting...' : 'Extracting...');

    try {
      let decisions, actions;

      if (aiEnabled()) {
        try {
          const result = await geminiExtractNotes(raw);
          decisions = result.decisions ?? [];
          actions   = result.actions ?? [];
        } catch (e) {
          console.warn('Gemini notes extract failed, using fallback:', e.message);
          const fallback = extractNotes(raw);
          decisions = fallback.decisions;
          actions   = fallback.actions;
        }
      } else {
        const fallback = extractNotes(raw);
        decisions = fallback.decisions;
        actions   = fallback.actions;
      }

      renderNotes(decisions, actions);
      toast(`${aiEnabled() ? '🤖 AI' : '✓'} Extracted ${decisions.length} decisions & ${actions.length} action items`, 'success');
    } finally {
      btn.disabled = false;
      btn.innerHTML = origHtml;
      lucide.createIcons();
    }
  });
}

/* ═══════ 8. COMMAND PALETTE ═══════ */

function initCommandPalette() {
  const overlay = document.getElementById('cp-overlay');
  const cpInput = document.getElementById('cp-input');
  const cpList  = document.getElementById('cp-list');
  const trigger = document.getElementById('cmd-trigger');
  let selectedIdx = 0;

  function open() {
    overlay.style.display = 'flex';
    cpInput.value = '';
    cpInput.focus();
    updateActive();
  }

  function close() {
    overlay.style.display = 'none';
    cpInput.value = '';
  }

  function getItems() { return [...cpList.querySelectorAll('.cp-item')]; }

  function updateActive() {
    const items = getItems();
    items.forEach((el, i) => el.classList.toggle('active', i === selectedIdx));
  }

  function execute(cmd) {
    close();
    const full = (cmd || '').trim();
    
    if (full.startsWith('/expense ')) {
      const raw = full.replace('/expense ', '').trim();
      const input = document.getElementById('exp-input');
      input.value = raw;
      focusWidget('widget-expense');
      setTimeout(() => document.getElementById('exp-add-btn').click(), 500);

    } else if (full.startsWith('/invoice ')) {
      const raw = full.replace('/invoice ', '').trim();
      document.getElementById('inv-nl-input').value = raw;
      focusWidget('widget-invoice');
      setTimeout(() => document.getElementById('inv-nl-btn').click(), 500);

    } else if (full.startsWith('/bookmark ')) {
      const raw = full.replace('/bookmark ', '').trim();
      document.getElementById('bm-url').value = raw.startsWith('http') ? raw : `https://${raw}`;
      document.getElementById('bm-title').value = raw;
      focusWidget('widget-bookmarks');
      const details = document.querySelector('.add-bm-drop');
      if (details) details.open = true;

    } else if (full === '/tailor' || full === '/resume') {
      focusWidget('widget-resume');

    } else if (full === '/notes') {
      focusWidget('widget-notes');

    } else {
      toast('Unknown command. Try /expense, /invoice, /bookmark, /tailor, /notes', 'error');
    }
  }

  // Command palette item click
  cpList.addEventListener('click', e => {
    const item = e.target.closest('.cp-item');
    if (!item) return;
    const cmd = item.dataset.cmd;
    if (cmd.endsWith(' ')) {
      cpInput.value = cmd;
      cpInput.focus();
    } else {
      execute(cmd);
    }
  });

  // Enter to execute current input
  cpInput.addEventListener('keydown', e => {
    const items = getItems();
    if (e.key === 'ArrowDown') { e.preventDefault(); selectedIdx = (selectedIdx + 1) % items.length; updateActive(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); selectedIdx = (selectedIdx - 1 + items.length) % items.length; updateActive(); }
    else if (e.key === 'Enter') {
      const val = cpInput.value.trim();
      if (val) { execute(val); }
      else {
        const active = items[selectedIdx];
        if (active) { const cmd = active.dataset.cmd; if (cmd.endsWith(' ')) { cpInput.value = cmd; } else { execute(cmd); } }
      }
    }
    else if (e.key === 'Escape') { close(); }
  });

  // Open triggers
  trigger.addEventListener('click', open);
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); overlay.style.display === 'flex' ? close() : open(); }
    if (e.key === 'Escape' && overlay.style.display === 'flex') close();
  });

  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
}

/* ═══════ 9. SETTINGS PANEL ═══════ */

function initSettings() {
  const overlay     = document.getElementById('settings-overlay');
  const openBtn     = document.getElementById('settings-btn');
  const closeBtn    = document.getElementById('settings-close');
  const keyInput    = document.getElementById('gemini-key-input');
  const saveBtn     = document.getElementById('save-key-btn');
  const testBtn     = document.getElementById('test-key-btn');
  const clearBtn    = document.getElementById('clear-key-btn');
  const toggleVis   = document.getElementById('toggle-key-vis');
  const testResult  = document.getElementById('ai-test-result');

  // Load saved key into input
  function refreshInput() {
    const saved = getApiKey();
    keyInput.value = saved || '';
    keyInput.placeholder = saved ? 'AIzaSy••••••••••••••••••••••••••••••••' : 'AIzaSy...';
  }

  function openSettings() {
    overlay.style.display = 'flex';
    refreshInput();
    testResult.style.display = 'none';
    lucide.createIcons();
  }

  function closeSettings() { overlay.style.display = 'none'; }

  openBtn.addEventListener('click', openSettings);
  closeBtn.addEventListener('click', closeSettings);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeSettings(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay.style.display === 'flex') closeSettings(); });

  // Toggle password visibility
  toggleVis.addEventListener('click', () => {
    const isHidden = keyInput.type === 'password';
    keyInput.type = isHidden ? 'text' : 'password';
    toggleVis.innerHTML = isHidden ? '<i data-lucide="eye-off"></i>' : '<i data-lucide="eye"></i>';
    lucide.createIcons();
  });

  // Save key
  saveBtn.addEventListener('click', () => {
    const key = keyInput.value.trim();
    if (!key) { toast('Please enter an API key', 'error'); return; }
    if (!key.startsWith('AIza')) { toast('Invalid key format — Gemini keys start with AIza...', 'error'); return; }
    STORE.set('gemini_api_key', key);
    updateAiBadge();
    toast('✓ Gemini API key saved! AI features are now active.', 'success');
    closeSettings();
  });

  // Test connection
  testBtn.addEventListener('click', async () => {
    const key = keyInput.value.trim() || getApiKey();
    if (!key) { toast('Enter an API key first', 'error'); return; }

    testBtn.disabled = true;
    testBtn.innerHTML = '<span class="ai-loading"></span> Testing...';
    testResult.style.display = 'none';

    // Temporarily use the entered key for testing
    const originalKey = getApiKey();
    STORE.set('gemini_api_key', key);

    try {
      const response = await callGemini('Reply with exactly: OK', { temperature: 0, maxTokens: 5 });
      testResult.className = 'ai-test-result ok';
      testResult.innerHTML = '✓ Connection successful! Gemini is ready. Response: ' + response;
      testResult.style.display = 'flex';
      updateAiBadge();
    } catch (e) {
      // Restore original key on failure
      if (originalKey) STORE.set('gemini_api_key', originalKey); else localStorage.removeItem('gemini_api_key');
      testResult.className = 'ai-test-result fail';
      testResult.innerHTML = '✗ Failed: ' + e.message;
      testResult.style.display = 'flex';
      updateAiBadge();
    } finally {
      testBtn.disabled = false;
      testBtn.innerHTML = '<i data-lucide="zap"></i> Test Connection';
      lucide.createIcons();
    }
  });

  // Clear key
  clearBtn.addEventListener('click', () => {
    if (!confirm('Remove the saved Gemini API key? AI features will revert to local mode.')) return;
    localStorage.removeItem('gemini_api_key');
    refreshInput();
    updateAiBadge();
    toast('API key removed. Running in local mode.', 'info');
  });
}

/* ═══════ 10. INIT ═══════ */

document.addEventListener('DOMContentLoaded', () => {
  // Initialise Lucide icons
  if (window.lucide) lucide.createIcons();

  startClock();
  updateAiBadge();
  initSettings();
  initExpenseTracker();
  initInvoice();
  initResumeTailor();
  initBookmarks();
  initNotes();
  initCommandPalette();
});
