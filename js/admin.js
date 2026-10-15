// Admin Panel — LegendJournal parity + Bot Signals
// Theme
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

let adminUser = null;
let selectedUsers = new Set();
let sigFilter = 'today';
let botSettings = { autoPublish: true, autoSettle: true };
let auditCache = [];
let winnerCtx = { type: null, id: null };

// ===== NAVIGATION =====
function switchTab(t) {
  document.querySelectorAll('.side-link').forEach(l => {
    l.classList.toggle('active', l.dataset.tab === t);
    if (l.dataset.tab === t) document.getElementById('tabTitle').textContent = l.textContent;
  });
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + t).classList.add('active');
  loadTab(t);
}
document.querySelectorAll('.side-link').forEach(link => {
  link.addEventListener('click', (e) => { e.preventDefault(); switchTab(link.dataset.tab); });
});
function loadTab(t) {
  if (t === 'dashboard') loadDashboard();
  if (t === 'users') loadUsers();
  if (t === 'signals') { loadBotStatus(); loadSession(); loadBotSignals(); }
  if (t === 'giveaways') { loadAdminGiveaways(); loadSpinConfig(); }
  if (t === 'ytgive') loadAdminYT();
  if (t === 'mentorship') loadMentorApps();
  if (t === 'dms') loadDMThreads();
  if (t === 'audit') loadAudit();
}

// ===== HELPERS =====
function toast(msg, type = '') {
  const d = document.createElement('div');
  d.className = 'adm-toast ' + type;
  d.innerHTML = msg;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 3500);
}
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function esc(s) { return String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

async function audit(action, target_type = '', target_id = '', details = {}) {
  try {
    await supabase.from('audit_log').insert({ admin_id: adminUser.id, action, target_type, target_id, details });
  } catch (e) { console.warn('audit failed', e); }
}

// ===== DASHBOARD =====
async function loadDashboard() {
  try {
    const [users, signals, giveaways, mentors, dms] = await Promise.all([
      supabase.from('profiles').select('status', { count: 'exact' }),
      supabase.from('signals').select('result').gte('created_at', new Date().toISOString().split('T')[0]),
      supabase.from('giveaways').select('id', { count: 'exact' }).eq('status', 'open'),
      supabase.from('mentorship_apps').select('id', { count: 'exact' }).eq('status', 'pending'),
      supabase.from('dm_messages').select('user_id', { count: 'exact' }),
    ]);
    const pending = (users.data || []).filter(u => u.status === 'pending').length;
    const wins = (signals.data || []).filter(s => s.result === 'WIN').length;
    const total = (signals.data || []).length;
    const wr = total ? Math.round(wins / total * 100) : 0;

    document.getElementById('dashStats').innerHTML = `
      <div class="adm-stat"><div class="adm-stat-num">${users.count || 0}</div><span class="adm-stat-label">Total Users</span></div>
      <div class="adm-stat gold"><div class="adm-stat-num">${pending}</div><span class="adm-stat-label">Pending</span></div>
      <div class="adm-stat"><div class="adm-stat-num">${total}</div><span class="adm-stat-label">Signals Today</span></div>
      <div class="adm-stat green"><div class="adm-stat-num">${wr}%</div><span class="adm-stat-label">Win Rate</span></div>
      <div class="adm-stat"><div class="adm-stat-num">${giveaways.count || 0}</div><span class="adm-stat-label">Open Giveaways</span></div>
      <div class="adm-stat gold"><div class="adm-stat-num">${mentors.count || 0}</div><span class="adm-stat-label">Mentor Apps</span></div>`;
    loadBotStatus(true);
  } catch (e) { console.warn(e); }
}

// ===== USERS =====
async function loadUsers() {
  const { data: pending } = await supabase.from('profiles').select('*').eq('status', 'pending').order('created_at');
  document.getElementById('pendingUsers').innerHTML = (pending || []).map(u => `
    <div class="lb-row">
      <span style="display:flex;gap:.6rem;align-items:center">
        <input type="checkbox" class="user-check" data-uid="${u.id}" onchange="toggleSelect('${u.id}')">
        <span><b style="cursor:pointer;color:var(--gold)" onclick="openUserDetail('${u.id}')">${esc(u.username)}</b> (${esc(u.email)})<br>
        <small style="color:var(--muted)">QX ID: ${esc(u.quotex_id) || '—'} | Deposit: $${u.deposit_amount || '—'} ${u.deposit_verified ? '✅' : '⏳'}</small></span>
      </span>
      <span>
        <button class="btn btn-gold btn-sm" onclick="approveUser('${u.id}',true)">✅</button>
        <button class="btn btn-ghost btn-sm" onclick="approveUser('${u.id}',false)">❌</button>
      </span>
    </div>`).join('') || '<p>No pending users.</p>';

  const { data: counts } = await supabase.from('profiles').select('status');
  const c = { approved: 0, blocked: 0, rejected: 0 };
  (counts || []).forEach(u => { if (c[u.status] !== undefined) c[u.status]++; });
  document.getElementById('userStats').innerHTML = `
    <div class="adm-stat"><div class="adm-stat-num">${counts?.length || 0}</div><span class="adm-stat-label">Total</span></div>
    <div class="adm-stat green"><div class="adm-stat-num">${c.approved}</div><span class="adm-stat-label">Approved</span></div>
    <div class="adm-stat gold"><div class="adm-stat-num">${(pending || []).length}</div><span class="adm-stat-label">Pending</span></div>
    <div class="adm-stat red"><div class="adm-stat-num">${c.blocked}</div><span class="adm-stat-label">Blocked</span></div>`;

  const { data: all } = await supabase.from('profiles').select('*').neq('status', 'pending').order('created_at', { ascending: false }).limit(50);
  document.getElementById('allUsers').innerHTML = (all || []).map(u => `
    <div class="lb-row">
      <span><b style="cursor:pointer;color:var(--gold)" onclick="openUserDetail('${u.id}')">${esc(u.username)}</b> (${esc(u.email)})</span>
      <span><span class="${u.status === 'approved' ? 'win' : 'loss'}" style="margin-right:.6rem">${u.status.toUpperCase()}</span>
      ${u.status === 'blocked'
        ? `<button class="btn btn-gold btn-sm" onclick="unblockUser('${u.id}')">Unblock</button>`
        : `<button class="btn btn-ghost btn-sm" onclick="blockUser('${u.id}')">Block</button>`}</span>
    </div>`).join('');
}

function toggleSelect(uid) {
  selectedUsers.has(uid) ? selectedUsers.delete(uid) : selectedUsers.add(uid);
  const bar = document.getElementById('bulkBar');
  bar.style.display = selectedUsers.size ? 'flex' : 'none';
  document.getElementById('bulkCount').textContent = selectedUsers.size + ' selected';
}
function clearSelection() {
  selectedUsers.clear();
  document.querySelectorAll('.user-check').forEach(c => c.checked = false);
  document.getElementById('bulkBar').style.display = 'none';
}
async function bulkApprove() { await bulkAction(true); }
async function bulkReject() { await bulkAction(false); }
async function bulkAction(ok) {
  if (!selectedUsers.size) return;
  if (!confirm(`${ok ? 'Approve' : 'Reject'} ${selectedUsers.size} users?`)) return;
  for (const id of selectedUsers) {
    await supabase.from('profiles').update({ status: ok ? 'approved' : 'rejected', approved_at: new Date().toISOString() }).eq('id', id);
    await audit(ok ? 'user_approved' : 'user_rejected', 'profile', id, { bulk: true });
  }
  toast(`✅ ${selectedUsers.size} users ${ok ? 'approved' : 'rejected'}`, 'success');
  clearSelection(); loadUsers();
}

async function approveUser(id, ok) {
  await supabase.from('profiles').update({ status: ok ? 'approved' : 'rejected', approved_at: new Date().toISOString() }).eq('id', id);
  await audit(ok ? 'user_approved' : 'user_rejected', 'profile', id, {});
  loadUsers();
}
async function blockUser(id) {
  if (!confirm('Block this user?')) return;
  await supabase.from('profiles').update({ status: 'blocked' }).eq('id', id);
  await audit('user_blocked', 'profile', id, {});
  loadUsers();
}
async function unblockUser(id) {
  await supabase.from('profiles').update({ status: 'approved' }).eq('id', id);
  await audit('user_unblocked', 'profile', id, {});
  toast('✅ User unblocked', 'success');
  loadUsers();
}
async function verifyDeposit(id) {
  await supabase.from('profiles').update({ deposit_verified: true }).eq('id', id);
  await audit('deposit_verified', 'profile', id, {});
  toast('✅ Deposit verified!', 'success');
  closeModal('userModal'); loadUsers();
}

async function openUserDetail(id) {
  const { data: u } = await supabase.from('profiles').select('*').eq('id', id).single();
  if (!u) return;
  const { count: sigCount } = await supabase.from('signals').select('id', { count: 'exact', head: true });
  document.getElementById('userModalBody').innerHTML = `
    <div class="modal-row"><span class="k">Username</span><span class="v">${esc(u.username)}</span></div>
    <div class="modal-row"><span class="k">Email</span><span class="v">${esc(u.email)}</span></div>
    <div class="modal-row"><span class="k">Quotex ID</span><span class="v">${esc(u.quotex_id) || '—'}</span></div>
    <div class="modal-row"><span class="k">Deposit</span><span class="v">$${u.deposit_amount || '—'} ${u.deposit_verified ? '✅ Verified' : '⏳ Pending'}</span></div>
    <div class="modal-row"><span class="k">Status</span><span class="v">${u.status.toUpperCase()}</span></div>
    <div class="modal-row"><span class="k">Joined</span><span class="v">${new Date(u.created_at).toLocaleDateString()}</span></div>
    ${u.deposit_proof_url ? `<div style="margin-top:1rem"><span class="k">Deposit Proof:</span><br><img src="${esc(u.deposit_proof_url)}" class="proof-img" onclick="window.open('${esc(u.deposit_proof_url)}','_blank')"></div>` : ''}`;
  document.getElementById('userModalActions').innerHTML = `
    ${u.status === 'pending' ? `<button class="btn btn-gold btn-sm" onclick="approveUser('${u.id}',true);closeModal('userModal')">✅ Approve</button>
    <button class="btn btn-ghost btn-sm" onclick="approveUser('${u.id}',false);closeModal('userModal')">❌ Reject</button>` : ''}
    ${!u.deposit_verified ? `<button class="btn btn-gold btn-sm" onclick="verifyDeposit('${u.id}')">💰 Verify Deposit</button>` : ''}
    ${u.status === 'blocked'
      ? `<button class="btn btn-gold btn-sm" onclick="unblockUser('${u.id}');closeModal('userModal')">Unblock</button>`
      : u.status !== 'pending' ? `<button class="btn btn-ghost btn-sm" onclick="blockUser('${u.id}');closeModal('userModal')">Block</button>` : ''}`;
  openModal('userModal');
}

// ===== BOT SIGNALS =====
async function loadBotStatus(intoDash = false) {
  try {
    const { data } = await supabase.from('bot_status').select('*').order('updated_at', { ascending: false }).limit(1).single();
    const connected = data?.connected;
    const dot = document.getElementById('botDot');
    if (dot) {
      dot.className = 'bot-dot' + (connected ? '' : ' off');
      document.getElementById('botConnText').innerHTML = connected
        ? '● Connected — Bot Online'
        : '● Disconnected — Bot Offline';
      document.getElementById('botConnSub').textContent =
        `Strategy: 7-indicator (EMA 9/21/50 · RSI 14 · ADX 14 · ATR 14 · BB 20,2)` +
        (data?.last_signal_at ? ` · Last signal: ${new Date(data.last_signal_at).toLocaleTimeString()}` : '');
    }
    const dash = document.getElementById('dashBotStatus');
    if (dash) dash.innerHTML = `<div class="bot-status"><div class="bot-dot${connected ? '' : ' off'}"></div>
      <div class="bot-info"><b>${connected ? 'Bot Online' : 'Bot Offline'}</b>
      <small>SSID: ${data?.ssid_valid ? '✅ Valid' : '❌ Expired/Missing'}</small></div></div>`;
    // toggles
    if (data) {
      botSettings.autoPublish = data.auto_publish !== false;
      botSettings.autoSettle = data.auto_settle !== false;
      const ap = document.getElementById('tglAutoPublish'), as = document.getElementById('tglAutoSettle');
      if (ap) ap.classList.toggle('on', botSettings.autoPublish);
      if (as) as.classList.toggle('on', botSettings.autoSettle);
    }
  } catch (e) {
    const dot = document.getElementById('botDot');
    if (dot) { dot.className = 'bot-dot off'; document.getElementById('botConnText').textContent = '● Unknown — No bot data yet'; }
  }
}
async function toggleSetting(key) {
  botSettings[key] = !botSettings[key];
  const el = key === 'autoPublish' ? document.getElementById('tglAutoPublish') : document.getElementById('tglAutoSettle');
  el.classList.toggle('on', botSettings[key]);
  await supabase.from('bot_status').upsert({ id: 1, [key === 'autoPublish' ? 'auto_publish' : 'auto_settle']: botSettings[key], updated_at: new Date().toISOString() }, { onConflict: 'id' });
  await audit('bot_setting_changed', 'bot', '', { [key]: botSettings[key] });
  toast(`🤖 ${key === 'autoPublish' ? 'Auto-publish' : 'Auto-settle'} ${botSettings[key] ? 'ON' : 'OFF'}`);
}
async function refreshBotStatus() { await loadBotStatus(); toast('🔄 Status refreshed'); }
async function notifySsidExpiry() {
  if (!confirm('Send SSID expiry notification to bot owner via Telegram?')) return;
  await audit('ssid_expiry_notified', 'bot', '', {});
  toast('📩 SSID expiry notification queued', 'success');
}

function setSigFilter(f) {
  sigFilter = f;
  document.querySelectorAll('#sigFilters .filter-btn').forEach(b => b.classList.toggle('active', b.dataset.f === f));
  loadBotSignals();
}
async function loadBotSignals() {
  let q = supabase.from('signals').select('*').order('created_at', { ascending: false });
  const today = new Date().toISOString().split('T')[0];
  if (sigFilter === 'today') q = q.gte('created_at', today);
  else if (sigFilter === 'week') q = q.gte('created_at', new Date(Date.now() - 7 * 864e5).toISOString());
  else if (sigFilter === 'open') q = q.eq('status', 'open');
  else if (sigFilter === 'win') q = q.eq('result', 'WIN');
  else if (sigFilter === 'loss') q = q.eq('result', 'LOSS');
  const { data } = await q.limit(50);
  document.getElementById('botSignalsBody').innerHTML = (data || []).map(s => {
    const st = s.status || (s.result ? s.result.toLowerCase() : 'open');
    const badge = st === 'win' ? 'badge-win' : st === 'loss' ? 'badge-loss' : st === 'open' ? 'badge-open' : 'badge-pending';
    const src = s.source === 'bot' ? '<span class="badge badge-bot">🤖 BOT</span>' : '<span class="badge badge-manual">MANUAL</span>';
    return `<tr>
      <td>${new Date(s.created_at || s.entry_time).toLocaleString()}</td>
      <td><b>${esc(s.asset)}</b></td>
      <td><span class="${s.direction === 'CALL' ? 'win' : 'loss'}">${s.direction}</span></td>
      <td>${s.confidence}%</td>
      <td>${src}</td>
      <td><span class="badge ${badge}">${st.toUpperCase()}</span>${s.settled_by === 'admin' ? ' <small style="color:var(--muted)">(override)</small>' : ''}</td>
      <td>${s.pnl ? '$' + (+s.pnl).toFixed(2) : '—'}</td>
      <td>${!s.result || s.result === 'PENDING'
        ? `<button class="btn btn-gold btn-sm" onclick="overrideResult('${s.id}','WIN')">WIN</button>
           <button class="btn btn-ghost btn-sm" onclick="overrideResult('${s.id}','LOSS')">LOSS</button>`
        : `<button class="btn btn-ghost btn-sm" onclick="overrideResult('${s.id}','${s.result === 'WIN' ? 'LOSS' : 'WIN'}')">↩ Flip</button>`}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--muted)">No signals yet. Bot signals will appear here automatically.</td></tr>';
}
async function overrideResult(id, result) {
  await supabase.from('signals').update({
    result, status: result.toLowerCase(), settled_by: 'admin',
    result_marked_by: adminUser.id, result_marked_at: new Date().toISOString()
  }).eq('id', id);
  await audit('signal_result_override', 'signal', id, { result });
  toast(`✅ Signal marked ${result} (override)`, 'success');
  loadBotSignals(); loadSession();
}
async function loadSession() {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase.from('signals').select('result,pnl').gte('created_at', today);
  const wins = (data || []).filter(s => s.result === 'WIN').length;
  const losses = (data || []).filter(s => s.result === 'LOSS').length;
  const total = (data || []).length;
  const wr = total ? Math.round(wins / total * 100) : 0;
  const pnl = (data || []).reduce((a, s) => a + (+s.pnl || 0), 0);
  document.getElementById('sessionSummary').innerHTML = `
    <div class="session-item"><div class="n">${total}</div><div class="l">Signals</div></div>
    <div class="session-item"><div class="n" style="color:var(--green-bright)">${wins}</div><div class="l">Wins</div></div>
    <div class="session-item"><div class="n" style="color:#f87171">${losses}</div><div class="l">Losses</div></div>
    <div class="session-item"><div class="n" style="color:var(--gold)">${wr}%</div><div class="l">Win Rate</div></div>
    <div class="session-item"><div class="n" style="color:${pnl >= 0 ? 'var(--green-bright)' : '#f87171'}">$${pnl.toFixed(2)}</div><div class="l">P&L</div></div>`;
}
async function broadcastSession() {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase.from('signals').select('result').gte('created_at', today);
  const wins = (data || []).filter(s => s.result === 'WIN').length;
  const total = (data || []).length;
  const msg = `📊 *Today's Session*\n📡 Signals: ${total}\n✅ Wins: ${wins}\n❌ Losses: ${total - wins}\n🎯 Win Rate: ${total ? Math.round(wins / total * 100) : 0}%`;
  await supabase.from('broadcasts').insert({ title: "Today's Session Summary", message: msg, sent_by: adminUser.id, target: 'telegram' });
  await audit('session_broadcast', 'broadcast', '', {});
  toast('📢 Session summary queued for Telegram', 'success');
}

// Manual publish (fallback)
async function publishSignal() {
  const asset = document.getElementById('sAsset').value.trim();
  const direction = document.getElementById('sDir').value;
  const confidence = +document.getElementById('sConf').value;
  if (!asset || !confidence) return toast('Fill all fields', 'error');
  const { error } = await supabase.from('signals').insert({
    asset, direction, confidence, entry_time: new Date().toISOString(),
    created_by: adminUser.id, source: 'manual', status: 'open'
  });
  if (error) return toast(error.message, 'error');
  await audit('signal_published', 'signal', '', { asset, direction, confidence });
  toast('📡 Signal published!', 'success');
  document.getElementById('sAsset').value = ''; document.getElementById('sConf').value = '';
  loadBotSignals();
}
function toggleCollapse(id) {
  const b = document.getElementById(id);
  b.classList.toggle('open');
  b.previousElementSibling.classList.toggle('open');
}

// ===== GIVEAWAYS =====
async function createGiveaway() {
  const title = document.getElementById('gTitle').value.trim();
  const question = document.getElementById('gQ').value.trim();
  const asset = document.getElementById('gAsset').value.trim();
  const prize_pool = +document.getElementById('gPrize').value || 300;
  const target_time = document.getElementById('gTime').value;
  if (!title || !question || !asset || !target_time) return toast('Fill all fields', 'error');
  const { error } = await supabase.from('giveaways').insert({ title, question, asset, prize_pool, target_time });
  if (error) return toast(error.message, 'error');
  await audit('giveaway_created', 'giveaway', '', { title });
  toast('🎁 Giveaway created!', 'success');
  loadAdminGiveaways();
}
async function loadAdminGiveaways() {
  const { data } = await supabase.from('giveaways').select('*, giveaway_entries(count)').order('created_at', { ascending: false }).limit(10);
  document.getElementById('adminGiveaways').innerHTML = (data || []).map(g => `
    <div class="lb-row"><span><b>${esc(g.title)}</b> — ${esc(g.asset)} ($${g.prize_pool})
      <br><small style="color:var(--muted)">${g.giveaway_entries?.[0]?.count || 0} entries${g.winner ? ` · 🏆 Winner: ${esc(g.winner)}` : ''}</small></span>
    <span style="display:flex;gap:.5rem;align-items:center"><span class="badge ${g.status === 'open' ? 'badge-open' : 'badge-pending'}">${g.status.toUpperCase()}</span>
    ${g.status === 'open' ? `<button class="btn btn-gold btn-sm" onclick="openWinnerModal('giveaway','${g.id}')">🏆 Pick Winner</button>` : ''}</span></div>`).join('')
    || '<p>No giveaways yet.</p>';
}
function openWinnerModal(type, id) {
  winnerCtx = { type, id };
  document.getElementById('winnerName').value = '';
  document.getElementById('winnerEntries').innerHTML = '<p style="color:var(--muted)">Enter the winner username above.</p>';
  openModal('winnerModal');
}
async function confirmWinner() {
  const name = document.getElementById('winnerName').value.trim();
  if (!name) return toast('Enter winner username', 'error');
  const { type, id } = winnerCtx;
  const table = type === 'giveaway' ? 'giveaways' : 'yt_giveaways';
  await supabase.from(table).update({ winner: name, status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', id);
  await audit(type + '_winner_picked', type, id, { winner: name });
  toast(`🏆 Winner recorded: ${esc(name)}`, 'success');
  closeModal('winnerModal');
  type === 'giveaway' ? loadAdminGiveaways() : loadAdminYT();
}

// Deposit Bonus Spin
async function loadSpinConfig() {
  try {
    const { data } = await supabase.from('spin_config').select('*').limit(1).single();
    if (data) {
      document.getElementById('tglSpin').classList.toggle('on', data.enabled);
      document.getElementById('spinMax').value = data.max_per_day || 1;
    }
    const { data: spins } = await supabase.from('spin_history').select('*, profiles!spin_history_user_id_fkey(username)').order('created_at', { ascending: false }).limit(15);
    document.getElementById('spinHistory').innerHTML = (spins || []).map(s => `
      <div class="lb-row"><span><b>${esc(s.profiles?.username || 'User')}</b> spun <b style="color:var(--gold)">${s.bonus_pct}%</b></span>
      <span class="sig-time">${new Date(s.created_at).toLocaleString()}</span></div>`).join('') || '<p>No spins yet.</p>';
  } catch (e) { /* tables may not exist yet */ }
}
async function toggleSpin() {
  const el = document.getElementById('tglSpin');
  const on = !el.classList.contains('on');
  el.classList.toggle('on', on);
  await supabase.from('spin_config').upsert({ id: 1, enabled: on }, { onConflict: 'id' });
  await audit('spin_toggled', 'spin_config', '', { enabled: on });
}
async function saveSpinConfig() {
  const max = +document.getElementById('spinMax').value || 1;
  await supabase.from('spin_config').upsert({ id: 1, max_per_day: max }, { onConflict: 'id' });
  await audit('spin_config_saved', 'spin_config', '', { max_per_day: max });
  toast('🎰 Spin config saved', 'success');
}

// ===== YT GIVEAWAY =====
async function createYT() {
  const title = document.getElementById('ytTitle').value.trim();
  const video_url = document.getElementById('ytUrl').value.trim();
  const prize_usdt = +document.getElementById('ytPrize').value || 50;
  if (!title || !video_url) return toast('Fill title and URL', 'error');
  const { error } = await supabase.from('yt_giveaways').insert({ title, video_url, prize_usdt });
  if (error) return toast(error.message, 'error');
  await audit('yt_giveaway_created', 'yt_giveaway', '', { title });
  toast('📺 Created!', 'success');
  loadAdminYT();
}
async function loadAdminYT() {
  const { data } = await supabase.from('yt_giveaways').select('*, yt_entries(count)').order('created_at', { ascending: false }).limit(10);
  document.getElementById('adminYT').innerHTML = (data || []).map(g => `
    <div class="lb-row"><span><b>${esc(g.title)}</b> — $${g.prize_usdt} USDT (${g.yt_entries?.[0]?.count || 0} entries)
    <br><small style="color:var(--muted)">${g.winner ? `🏆 Winner: ${esc(g.winner)}` : ''}</small></span>
    <span style="display:flex;gap:.5rem;align-items:center"><span class="badge ${g.status === 'open' ? 'badge-open' : 'badge-pending'}">${g.status.toUpperCase()}</span>
    ${g.status === 'open' ? `<button class="btn btn-gold btn-sm" onclick="openWinnerModal('yt','${g.id}')">🏆 Pick Winner</button>` : ''}</span></div>`).join('')
    || '<p>None yet.</p>';
}

// ===== MENTORSHIP =====
async function loadMentorApps() {
  const { data } = await supabase.from('mentorship_apps').select('*, profiles!mentorship_apps_user_id_fkey(username,email,quotex_id)').eq('status', 'pending');
  document.getElementById('mentorApps').innerHTML = (data || []).map(a => `
    <div class="lb-row"><span><b>${esc(a.profiles?.username)}</b> (${esc(a.profiles?.email)})
    <br><small style="color:var(--muted)">Package: ${esc(a.package || '$125 / 30 days')} · ${new Date(a.created_at).toLocaleDateString()}</small></span>
    <span><button class="btn btn-gold btn-sm" onclick="openMentorDetail('${a.id}')">View →</button></span></div>`).join('')
    || '<p>No pending applications.</p>';
}
async function openMentorDetail(id) {
  const { data: a } = await supabase.from('mentorship_apps').select('*, profiles!mentorship_apps_user_id_fkey(username,email,quotex_id)').eq('id', id).single();
  if (!a) return;
  document.getElementById('mentorModalBody').innerHTML = `
    <div class="modal-row"><span class="k">Applicant</span><span class="v">${esc(a.profiles?.username)} (${esc(a.profiles?.email)})</span></div>
    <div class="modal-row"><span class="k">Quotex ID</span><span class="v">${esc(a.profiles?.quotex_id) || '—'}</span></div>
    <div class="modal-row"><span class="k">Package</span><span class="v">${esc(a.package || '$125 / 30 days')}</span></div>
    <div class="modal-row"><span class="k">Applied</span><span class="v">${new Date(a.created_at).toLocaleString()}</span></div>
    ${a.payment_proof_url
      ? `<div style="margin-top:1rem"><b>💳 Payment Screenshot:</b><br><img src="${esc(a.payment_proof_url)}" class="proof-img" onclick="window.open('${esc(a.payment_proof_url)}','_blank')"></div>`
      : '<p style="color:var(--muted);margin-top:1rem">No payment screenshot uploaded.</p>'}
    ${a.note ? `<div style="margin-top:.8rem"><b>Note:</b> ${esc(a.note)}</div>` : ''}`;
  document.getElementById('mentorModalActions').innerHTML = `
    <button class="btn btn-gold" onclick="reviewMentor('${a.id}',true);closeModal('mentorModal')">✅ Approve</button>
    <button class="btn btn-ghost" onclick="reviewMentor('${a.id}',false);closeModal('mentorModal')">❌ Reject</button>`;
  openModal('mentorModal');
}
async function reviewMentor(id, ok) {
  await supabase.from('mentorship_apps').update({ status: ok ? 'approved' : 'rejected', reviewed_by: adminUser.id, reviewed_at: new Date().toISOString() }).eq('id', id);
  await audit(ok ? 'mentorship_approved' : 'mentorship_rejected', 'mentorship_app', id, {});
  toast(ok ? '✅ Mentorship approved' : '❌ Mentorship rejected', ok ? 'success' : '');
  loadMentorApps();
}

// ===== DMS =====
let dmUserId = null;
async function loadDMThreads() {
  const { data } = await supabase.from('dm_messages').select('user_id, profiles!dm_messages_user_id_fkey(username)').order('created_at', { ascending: false });
  const seen = new Map();
  (data || []).forEach(m => { if (!seen.has(m.user_id)) seen.set(m.user_id, m.profiles?.username || 'User'); });
  document.getElementById('dmThreads').innerHTML = [...seen.entries()].map(([uid, name]) =>
    `<div class="lb-row"><span><b>${esc(name)}</b></span><button class="btn btn-gold btn-sm" onclick="openDM('${uid}','${esc(name)}')">Open Chat →</button></div>`
  ).join('') || '<p>No messages.</p>';
}
async function openDM(uid, name) {
  dmUserId = uid;
  document.getElementById('dmUserName').textContent = name;
  document.getElementById('dmReplyCard').style.display = 'block';
  const { data } = await supabase.from('dm_messages').select('*').eq('user_id', uid).order('created_at', { ascending: true });
  document.getElementById('adminDMList').innerHTML = (data || []).map(m => {
    const isAdmin = m.sender_id === adminUser.id;
    return `<div style="margin:.4rem 0;text-align:${isAdmin ? 'right' : 'left'}"><span style="display:inline-block;background:${isAdmin ? 'rgba(245,185,66,.15)' : 'var(--bg2)'};border:1px solid var(--card-border);border-radius:10px;padding:.5rem .9rem">${esc(m.message)}</span></div>`;
  }).join('');
}
async function replyDM() {
  const input = document.getElementById('adminDMInput');
  const msg = input.value.trim();
  if (!msg || !dmUserId) return;
  await supabase.from('dm_messages').insert({ user_id: dmUserId, sender_id: adminUser.id, message: msg });
  await audit('dm_replied', 'dm', dmUserId, {});
  input.value = '';
  openDM(dmUserId, document.getElementById('dmUserName').textContent);
}

// ===== BROADCAST =====
function previewBroadcast() {
  const title = document.getElementById('bTitle').value.trim();
  const msg = document.getElementById('bMsg').value.trim();
  const target = document.getElementById('bTarget').value;
  const p = document.getElementById('tgPreview');
  if (!msg) { p.style.display = 'none'; return; }
  p.style.display = 'block';
  document.getElementById('tgPreviewBody').textContent = `*${title}*\n\n${msg}\n\n_Target: ${target}_`;
}
async function sendBroadcast() {
  const title = document.getElementById('bTitle').value.trim();
  const message = document.getElementById('bMsg').value.trim();
  const target = document.getElementById('bTarget').value;
  if (!title || !message) return toast('Fill title and message', 'error');
  const { error } = await supabase.from('broadcasts').insert({ title, message, target, sent_by: adminUser.id });
  if (error) return toast(error.message, 'error');
  await audit('broadcast_sent', 'broadcast', '', { title, target });
  toast('📢 Broadcast sent!', 'success');
  document.getElementById('bTitle').value = ''; document.getElementById('bMsg').value = '';
  document.getElementById('tgPreview').style.display = 'none';
}

// ===== AUDIT =====
async function loadAudit() {
  const { data } = await supabase.from('audit_log').select('*, profiles!audit_log_admin_id_fkey(username)').order('created_at', { ascending: false }).limit(100);
  auditCache = data || [];
  renderAudit(auditCache);
}
function renderAudit(list) {
  document.getElementById('auditList').innerHTML = list.map(a => `
    <div class="lb-row"><span><b>${esc(a.action)}</b> by ${esc(a.profiles?.username || '?')}
    ${a.target_type ? `<small style="color:var(--muted)"> · ${esc(a.target_type)}</small>` : ''}</span>
    <span class="sig-time">${new Date(a.created_at).toLocaleString()}</span></div>`).join('')
    || '<p>No logs yet.</p>';
}
function filterAudit() {
  const q = document.getElementById('auditSearch').value.toLowerCase();
  renderAudit(auditCache.filter(a => (a.action + ' ' + (a.profiles?.username || '')).toLowerCase().includes(q)));
}

// ===== AUTH =====
async function doLogout() {
  await supabase.auth.signOut();
  window.location.href = '../index.html';
}
async function init() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return window.location.href = 'login.html';
  const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (!p?.is_admin) { toast('Admin only', 'error'); return window.location.href = 'login.html'; }
  adminUser = p;
  loadDashboard();
}
init();
