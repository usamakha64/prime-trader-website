// Prime Trader Solution — Main JS

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

// Scroll reveal + staggered grids
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('visible');
      if (e.target.id === 'featureGrid') e.target.classList.add('visible');
    }
  });
}, { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
const fg = document.getElementById('featureGrid');
if (fg) observer.observe(fg);

// Animated counters
document.querySelectorAll('.stat-num[data-count]').forEach(el => {
  const target = +el.dataset.count;
  const obs = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      let cur = 0; const inc = target / 60;
      const timer = setInterval(() => {
        cur += inc;
        if (cur >= target) { cur = target; clearInterval(timer); }
        el.textContent = Math.floor(cur).toLocaleString();
      }, 25);
      obs.disconnect();
    }
  });
  obs.observe(el);
});

// Gold ticker
const tickItems = ['🎁 Daily Cash Giveaways','🎓 1-on-1 Mentorship','📡 Real-time Signals','🏆 Trader Leaderboards','⚡ AI Signal Engine'];
const tickerTrack = document.getElementById('tickerTrack');
if (tickerTrack) {
  let html = '';
  for (let i = 0; i < 3; i++) tickItems.forEach(t => { html += `<span class="ticker-item">${t}</span>`; });
  tickerTrack.innerHTML = html;
}

// Mobile menu
const hamburger = document.getElementById('hamburger');
const navLinks = document.querySelector('.nav-links');
hamburger?.addEventListener('click', () => {
  const isOpen = navLinks.style.display === 'flex';
  navLinks.style.display = isOpen ? 'none' : 'flex';
});
// Close menu on link click
navLinks?.querySelectorAll('a').forEach(a => {
  a.addEventListener('click', () => { navLinks.style.display = 'none'; });
});
