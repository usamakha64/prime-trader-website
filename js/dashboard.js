// Theme (shared)
(function initTheme() {
  const saved = localStorage.getItem('pts-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  const btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = saved === 'dark' ? '🌙' : '☀️';
})();
document.getElementById('themeToggle')?.addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('pts-theme', next);
  document.getElementById('themeToggle').textContent = next === 'dark' ? '🌙' : '☀️';
});

// Dashboard logic — Prime Trader Solution
let currentUser = null;

// Tab switching
document.querySelectorAll('.side-link').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('.side-link').forEach(l => l.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    link.classList.add('active');
    document.getElementById('tab-' + link.dataset.tab).classList.add('active');
    document.getElementById('tabTitle').textContent = link.textContent;
    if (link.dataset.tab === 'journal') loadJournal();
    if (link.dataset.tab === 'leaderboard') loadLeaderboard();
    if (link.dataset.tab === 'discipline') loadDiscipline();
    if (link.dataset.tab === 'giveaway') loadGiveaway();
    if (link.dataset.tab === 'spin') loadSpin();
    if (link.dataset.tab === 'ytgiveaway') loadYT();
    if (link.dataset.tab === 'messages') loadDMs();
  });
});

async function init() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return window.location.href = 'login.html';
  currentUser = user;

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved') {
    await supabase.auth.signOut();
    return window.location.href = 'login.html';
  }
  document.getElementById('userBadge').textContent = '👤 ' + (profile.username || profile.email);

  loadSignals();
  // Realtime signals
  supabase.channel('signals').on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'signals' },
    () => loadSignals()
  ).subscribe();
}

async function loadSignals() {
  const { data } = await supabase.from('signals')
    .select('*').order('entry_time', { ascending: false }).limit(20);
  const el = document.getElementById('signalsLive');
  if (!data || !data.length) { el.innerHTML = '<div class="card text-center"><p>No signals yet. Check back soon!</p></div>'; return; }
  el.innerHTML = data.map(s => `
    <div class="signal-live-card">
      <div><div class="sig-pair">${s.asset}</div><div class="sig-time">${new Date(s.entry_time).toLocaleString()}</div></div>
      <div class="sig-dir ${s.direction==='CALL'?'win':'loss'}">${s.direction} ${s.direction==='CALL'?'↑':'↓'}</div>
      <div><div class="sig-conf">${s.confidence}%</div><div class="sig-time">${s.result ? (s.result==='WIN'?'✅ WIN':'❌ LOSS') : '⏳ Pending'}</div></div>
    </div>`).join('');
}

async function loadJournal() {
  const { data } = await supabase.from('journal_entries')
    .select('*').eq('user_id', currentUser.id).order('trade_time', { ascending: false }).limit(50);

  const wins = (data||[]).filter(j => j.result === 'WIN').length;
  const profit = (data||[]).reduce((s,j) => s + (+j.profit||0), 0);
  const wr = data?.length ? Math.round(wins/data.length*100) : 0;

  document.getElementById('journalStats').innerHTML = `
    <div class="jstat"><div class="jstat-num">${data?.length||0}</div><div class="jstat-label">Trades</div></div>
    <div class="jstat"><div class="jstat-num" style="color:var(--green)">${wr}%</div><div class="jstat-label">Win Rate</div></div>
    <div class="jstat"><div class="jstat-num" style="color:${profit>=0?'var(--green)':'var(--red)'}">$${profit.toFixed(2)}</div><div class="jstat-label">Profit</div></div>`;

  document.getElementById('journalList').innerHTML = (data||[]).map(j => `
    <div class="lb-row"><span><b>${j.asset}</b> ${j.direction}</span>
    <span>$${j.amount}</span>
    <span class="${j.result==='WIN'?'win':'loss'}">${j.result} ($${(+j.profit||0).toFixed(2)})</span></div>`).join('')
    || '<p>No trades yet.</p>';
}

async function addJournalEntry() {
  const asset = document.getElementById('jAsset').value.trim();
  const direction = document.getElementById('jDir').value;
  const amount = +document.getElementById('jAmount').value;
  const result = document.getElementById('jResult').value;
  const notes = document.getElementById('jNotes').value.trim();
  if (!asset || !amount) return alert('Fill asset and amount');
  const profit = result === 'WIN' ? amount * 0.8 : -amount;

  const { error } = await supabase.from('journal_entries').insert({
    user_id: currentUser.id, asset, direction, amount, result, profit, notes
  });
  if (error) return alert(error.message);
  document.getElementById('jAsset').value = '';
  document.getElementById('jAmount').value = '';
  document.getElementById('jNotes').value = '';
  loadJournal();
}

async function loadLeaderboard() {
  const { data } = await supabase.from('leaderboard').select('*').limit(20);
  const medals = ['🥇','🥈','🥉'];
  document.getElementById('leaderboardList').innerHTML = (data||[]).map((r,i) => `
    <div class="lb-row"><span class="lb-rank">${medals[i]||'#'+(i+1)}</span>
    <span class="lb-name">${r.username||'Trader***'}</span>
    <span>${r.wins}/${r.total_trades} wins</span>
    <span class="lb-profit">+$${(+r.total_profit).toFixed(2)}</span></div>`).join('')
    || '<p>No data yet.</p>';
}

async function loadGiveaway() {
  const { data } = await supabase.from('giveaways')
    .select('*').eq('status','open').order('target_time',{ascending:true}).limit(1).single();
  const el = document.getElementById('giveawayCard');
  if (!data) { el.innerHTML = '<h3>🎁 Daily Giveaway</h3><p>No active giveaway right now. Check back at 9 PM!</p>'; return; }

  const { data: entry } = await supabase.from('giveaway_entries')
    .select('*').eq('giveaway_id', data.id).eq('user_id', currentUser.id).single();

  el.innerHTML = `
    <h3>🎁 ${data.title}</h3>
    <p>${data.question}</p>
    <p><b>Asset:</b> ${data.asset} | <b>Prize:</b> $${data.prize_pool}</p>
    <p><b>Closes:</b> ${new Date(data.target_time).toLocaleString()}</p>
    ${entry ? `<p>✅ Your prediction: <b>${entry.prediction}</b></p>` : `
    <div class="giveaway-opts">
      <button class="giveaway-btn green" onclick="enterGiveaway('${data.id}','GREEN')">🟢 GREEN</button>
      <button class="giveaway-btn red" onclick="enterGiveaway('${data.id}','RED')">🔴 RED</button>
    </div>`}`;
}

async function enterGiveaway(gid, pred) {
  const { error } = await supabase.from('giveaway_entries').insert({
    giveaway_id: gid, user_id: currentUser.id, prediction: pred
  });
  if (error) return alert(error.message);
  alert('✅ Prediction submitted: ' + pred);
  loadGiveaway();
}

async function applyMentorship() {
  const file = document.getElementById('payShot').files[0];
  if (!file) return alert('Upload payment screenshot first');
  // In production: upload to Supabase Storage
  const { error } = await supabase.from('mentorship_apps').insert({
    user_id: currentUser.id, payment_screenshot_url: 'pending-upload', status: 'pending'
  });
  if (error) return alert(error.message);
  document.getElementById('mentorStatus').textContent = '✅ Application submitted! We\'ll review within 24h.';
}

async function doLogout() {
  await supabase.auth.signOut();
  window.location.href = '../index.html';
}

// ===== DISCIPLINE BOARD =====
async function loadDiscipline() {
  const { data } = await supabase.from('discipline_board').select('*').limit(20);
  document.getElementById('disciplineList').innerHTML = (data||[]).map((r,i) =>
    `<div class="lb-row"><span class="lb-rank">${i<3?['🥇','🥈','🥉'][i]:'#'+(i+1)}</span><span class="lb-name">${r.username||'Trader***'}</span><span class="lb-profit" style="color:var(--gold)">${r.score}/100</span></div>`
  ).join('') || '<p>No data yet.</p>';

  // My score
  const { data: mine } = await supabase.from('discipline_scores').select('*').eq('user_id', currentUser.id).single();
  const { data: trades } = await supabase.from('journal_entries').select('result,trade_time').eq('user_id', currentUser.id).order('trade_time', {ascending:false}).limit(50);
  let score = 100, over = 0, streak = 0;
  if (trades?.length) {
    // Overtrading: >10 trades/day
    const today = trades.filter(t => new Date(t.trade_time).toDateString() === new Date().toDateString()).length;
    if (today > 10) over = Math.min(30, (today - 10) * 3);
    // Loss streak
    let ls = 0;
    for (const t of trades) { if (t.result === 'LOSS') ls++; else break; }
    if (ls >= 3) streak = Math.min(30, ls * 8);
    score = Math.max(0, 100 - over - streak);
  }
  // Upsert
  await supabase.from('discipline_scores').upsert({ user_id: currentUser.id, score, overtrading_penalty: over, loss_streak_penalty: streak }, { onConflict: 'user_id' });
  const color = score >= 80 ? 'var(--green)' : score >= 50 ? 'var(--gold)' : 'var(--red)';
  document.getElementById('myDiscipline').innerHTML = `
    <div style="text-align:center"><div style="font-size:3rem;font-weight:800;color:${color}">${score}</div>
    <p style="color:var(--muted)">Overtrading penalty: -${over} | Loss streak penalty: -${streak}</p></div>`;
}

// ===== BONUS SPIN =====
async function loadSpin() {
  const { data } = await supabase.from('bonus_spins').select('*').eq('user_id', currentUser.id).order('spun_at', {ascending:false}).limit(10);
  const today = data?.find(s => new Date(s.spun_at).toDateString() === new Date().toDateString());
  document.getElementById('spinBtn').disabled = !!today;
  document.getElementById('spinStatus').textContent = today ? `✅ Already spun today: ${today.bonus_percent}% bonus! Come back tomorrow.` : 'You have 1 free spin today!';
  document.getElementById('spinHistory').innerHTML = (data||[]).map(s =>
    `<div class="lb-row"><span>${new Date(s.spun_at).toLocaleDateString()}</span><span class="lb-profit" style="color:var(--gold)">${s.bonus_percent}% BONUS</span></div>`
  ).join('') || '<p>No spins yet.</p>';
}

async function doSpin() {
  const btn = document.getElementById('spinBtn');
  btn.disabled = true;
  const wheel = document.getElementById('spinWheel');
  const result = document.getElementById('spinResult');
  // Animate
  let spins = 0;
  const anim = setInterval(() => {
    wheel.style.transform = `rotate(${spins * 45}deg)`;
    spins++;
    if (spins > 20) {
      clearInterval(anim);
      const bonuses = [50, 50, 70, 70, 100];
      const won = bonuses[Math.floor(Math.random() * bonuses.length)];
      result.innerHTML = `🎉 <span style="color:var(--gold)">${won}% BONUS!</span>`;
      result.style.animation = 'fadeDown .5s';
      supabase.from('bonus_spins').insert({ user_id: currentUser.id, bonus_percent: won }).then(() => loadSpin());
    }
  }, 100);
}

// ===== YOUTUBE GIVEAWAY =====
async function loadYT() {
  const { data } = await supabase.from('yt_giveaways').select('*').eq('status','open').order('created_at',{ascending:false}).limit(1).single();
  const el = document.getElementById('ytGiveawayCard');
  if (!data) { el.innerHTML = '<h3>📺 YouTube Giveaway</h3><p>No active giveaway. Check back soon!</p>'; return; }
  const { data: entry } = await supabase.from('yt_entries').select('*').eq('giveaway_id', data.id).eq('user_id', currentUser.id).single();
  el.innerHTML = `<h3>📺 ${data.title}</h3>
    <p><a href="${data.video_url}" target="_blank" style="color:var(--gold)">▶ Watch Video</a></p>
    <p><b>Prize:</b> $${data.prize_usdt} USDT</p>
    <p style="color:var(--muted)">Steps: 1) Watch the video 2) Comment with your username 3) Paste comment link below</p>
    ${entry ? '<p>✅ Entered! Good luck!</p>' :
    `<input id="ytUrl" placeholder="Paste your YouTube comment link" class="auth-input"><button class="btn btn-gold" onclick="enterYT('${data.id}')">Enter Giveaway →</button>`}`;
}

async function enterYT(gid) {
  const url = document.getElementById('ytUrl').value.trim();
  if (!url) return alert('Paste your comment link');
  const { error } = await supabase.from('yt_entries').insert({ giveaway_id: gid, user_id: currentUser.id, yt_comment_url: url });
  if (error) return alert(error.message);
  alert('✅ Entered!');
  loadYT();
}

// ===== CSV IMPORT =====
async function importCSV() {
  const file = document.getElementById('csvFile').files[0];
  if (!file) return;
  const text = await file.text();
  const lines = text.split('\n').slice(1); // Skip header
  let imported = 0;
  for (const line of lines) {
    const cols = line.split(',');
    if (cols.length < 4) continue;
    // Expected: date, asset, direction, amount, result
    try {
      const [date, asset, direction, amount, result] = cols.map(c => c.trim().replace(/"/g,''));
      if (!asset || !amount) continue;
      const amt = parseFloat(amount);
      const res = result?.toUpperCase() === 'WIN' ? 'WIN' : 'LOSS';
      await supabase.from('journal_entries').insert({
        user_id: currentUser.id, asset, direction: direction?.toUpperCase() || 'CALL',
        amount: amt, result: res, profit: res === 'WIN' ? amt * 0.8 : -amt,
        trade_time: date || new Date().toISOString(), is_demo: false
      });
      imported++;
    } catch(e) {}
  }
  alert(`✅ Imported ${imported} trades!`);
  loadJournal();
}

// ===== DM MESSAGES =====
async function loadDMs() {
  const { data } = await supabase.from('dm_messages').select('*').eq('user_id', currentUser.id).order('created_at', {ascending:true}).limit(50);
  const el = document.getElementById('dmList');
  el.innerHTML = (data||[]).map(m => {
    const isMe = m.sender_id === currentUser.id;
    return `<div style="margin:.5rem 0;text-align:${isMe?'right':'left'}"><span style="display:inline-block;background:${isMe?'rgba(245,185,66,.15)':'var(--bg2)'};border:1px solid var(--card-border);border-radius:12px;padding:.6rem 1rem;max-width:80%">${m.message}</span></div>`;
  }).join('') || '<p style="color:var(--muted)">No messages yet. Say hello! 👋</p>';
  el.scrollTop = el.scrollHeight;
}

async function sendDM() {
  const input = document.getElementById('dmInput');
  const msg = input.value.trim();
  if (!msg) return;
  const { error } = await supabase.from('dm_messages').insert({ user_id: currentUser.id, sender_id: currentUser.id, message: msg });
  if (error) return alert(error.message);
  input.value = '';
  loadDMs();
}

init();
