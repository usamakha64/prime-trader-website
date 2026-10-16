// Theme (shared)
(function initTheme() {
  const saved = localStorage.getItem('pts-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
})();

// Auth logic — Prime Trader Solution
let pendingEmail = '', pendingPassword = '', pendingUsername = '', pendingQuotexId = '';

function showError(msg) {
  document.getElementById('authError').textContent = msg;
}

async function googleSignup() {
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/pages/signup.html?google=1' }
    });
    if (error) showError(error.message);
  } catch (e) {
    showError('Google login is not enabled yet. Please use email & password.');
  }
}

// Block disposable/temporary email domains (like LegendJournal)
const DISPOSABLE_DOMAINS = [
  'mailinator.com','tempmail.com','guerrillamail.com','10minutemail.com','throwawaymail.com',
  'yopmail.com','temp-mail.org','fakeinbox.com','getnada.com','maildrop.cc','trashmail.com',
  'sharklasers.com','grr.la','guerrillamailblock.com','pokemail.net','spam4.me','bccto.me',
  'chacuo.net','dispostable.com','mailnesia.com','mintemail.com','mytrashmail.com','sogetthis.com',
  'soodonims.com','trashmail.net','trashymail.com','wegwerfmail.de','wegwerfmail.net',
  'e4ward.com','gishpuppy.com','mailnull.com','spambox.us','whyspam.me','willselfdestruct.com',
  'mailinator.net','mailinator2.com','tempmailo.com','tempail.com','emailondeck.com','mohmal.com',
  'tempmailaddress.com','mail7.io','tmail.ws','inboxbear.com','moakt.com','tutanota.com'
];
function isDisposableEmail(email) {
  const domain = (email.split('@')[1] || '').toLowerCase().trim();
  if (!domain) return true;
  if (DISPOSABLE_DOMAINS.includes(domain)) return true;
  // block subdomains of known disposable providers
  const parts = domain.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    if (DISPOSABLE_DOMAINS.includes(parts.slice(i).join('.'))) return true;
  }
  return false;
}

async function sendOTP() {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const username = document.getElementById('username').value.trim();

  if (!email || !password || !username) return showError('Please fill all required fields');
  if (password.length < 6) return showError('Password must be at least 6 characters');
  if (isDisposableEmail(email)) return showError('Temporary/disposable emails are not allowed. Please use a real email address.');

  pendingEmail = email; pendingPassword = password;
  pendingUsername = username; pendingQuotexId = quotexId;

  // Send OTP via Supabase Auth
  const { error } = await supabase.auth.signInWithOtp({ email });
  if (error) return showError(error.message);

  document.getElementById('step1').style.display = 'none';
  document.getElementById('step2').style.display = 'block';
  showError('');
}

function backToStep1() {
  document.getElementById('step2').style.display = 'none';
  document.getElementById('step1').style.display = 'block';
}

async function verifyOTP() {
  const otp = document.getElementById('otp').value.trim();
  if (otp.length !== 6) return showError('Enter the 6-digit code');

  // Verify OTP
  const { data, error } = await supabase.auth.verifyOtp({
    email: pendingEmail, token: otp, type: 'email'
  });
  if (error) return showError(error.message);

  // Create profile (pending approval)
  const { error: pErr } = await supabase.from('profiles').insert({
    id: data.user.id,
    email: pendingEmail,
    username: pendingUsername,
    status: 'pending',
    deposit_verified: false
  });
  if (pErr) return showError(pErr.message);

  document.getElementById('step2').style.display = 'none';
  document.getElementById('step3').style.display = 'block';
  showError('');
}

async function submitVerification() {
  const quotexId = document.getElementById('quotexId').value.trim();
  const depositAmt = document.getElementById('depositAmt').value.trim();
  const note = document.getElementById('verifyNote').value.trim();
  if (!quotexId) return showError('⚠️ Quotex Account ID is required!');
  if (!depositAmt || +depositAmt < 50) return showError('⚠️ Minimum $50 deposit required!');
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await supabase.from('profiles').update({
      quotex_id: quotexId,
      deposit_amount: +depositAmt,
      verification_note: note || null
    }).eq('id', user.id);
  }
  document.getElementById('step3').style.display = 'none';
  document.getElementById('step4').style.display = 'block';
  showError('');
}

async function doLogin() {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  if (!email || !password) return showError('Enter email and password');

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return showError(error.message);

  // Check approval status
  const { data: profile } = await supabase.from('profiles').select('status,is_admin').eq('id', data.user.id).single();

  if (!profile) return showError('Profile not found. Please sign up.');
  if (profile.status === 'pending') return showError('⏳ Account under review. Please wait for approval.');
  if (profile.status === 'blocked') return showError('🚫 Account blocked. Contact support.');
  if (profile.status === 'rejected') return showError('❌ Application rejected.');

  // Redirect
  window.location.href = profile.is_admin ? 'admin.html' : 'dashboard.html';
}
