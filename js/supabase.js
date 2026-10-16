// Supabase client — Prime Trader Solution
// Connected: 2026-10-16 (project sovvicsyflemmrfghwan — shared with iCloud site)
const SUPABASE_URL = 'https://sovvicsyflemmrfghwan.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNvdnZpY3N5ZmxlbW1yZmdod2FuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2NzE2NjksImV4cCI6MjEwNjI0NzY2OX0.PB4Rz9acHTO4kLFuFYelG85AW5E2qIJkPEwnFGfOiQw';

// Guard: if the library failed to load, say so visibly instead of dead buttons
if (!window.supabase || !window.supabase.createClient) {
  document.addEventListener('DOMContentLoaded', function () {
    var el = document.getElementById('authError');
    if (el) el.textContent = 'Login library failed to load. Please check your connection and reload the page.';
  });
  throw new Error('supabase-js failed to load');
}

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
