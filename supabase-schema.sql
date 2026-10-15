-- Prime Trader Solution — Supabase Schema
-- Run this in Supabase SQL Editor

-- Users (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE,
  quotex_id TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','blocked')),
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  deposit_verified BOOLEAN DEFAULT FALSE
);

-- Signals
CREATE TABLE IF NOT EXISTS signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('CALL','PUT')),
  confidence INT NOT NULL,
  entry_time TIMESTAMPTZ NOT NULL,
  expiry_seconds INT DEFAULT 60,
  result TEXT CHECK (result IN ('WIN','LOSS','PENDING')),
  result_marked_by UUID REFERENCES profiles(id),
  result_marked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);

-- Trading Journal
CREATE TABLE IF NOT EXISTS journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  asset TEXT NOT NULL,
  direction TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('WIN','LOSS')),
  profit DECIMAL(10,2),
  notes TEXT,
  trade_time TIMESTAMPTZ DEFAULT NOW(),
  is_demo BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leaderboard (auto-calculated view)
CREATE OR REPLACE VIEW leaderboard AS
SELECT
  p.username,
  COUNT(j.id) as total_trades,
  SUM(CASE WHEN j.result='WIN' THEN 1 ELSE 0 END) as wins,
  COALESCE(SUM(j.profit), 0) as total_profit
FROM profiles p
LEFT JOIN journal_entries j ON j.user_id = p.id AND j.is_demo = FALSE
WHERE p.status = 'approved'
GROUP BY p.id, p.username
ORDER BY total_profit DESC;

-- Giveaway Quiz
CREATE TABLE IF NOT EXISTS giveaways (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  question TEXT NOT NULL,
  asset TEXT NOT NULL,
  target_time TIMESTAMPTZ NOT NULL,
  correct_answer TEXT CHECK (correct_answer IN ('GREEN','RED')),
  prize_pool DECIMAL(10,2) DEFAULT 300,
  status TEXT DEFAULT 'open' CHECK (status IN ('open','closed','resolved')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS giveaway_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  giveaway_id UUID NOT NULL REFERENCES giveaways(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  prediction TEXT NOT NULL CHECK (prediction IN ('GREEN','RED')),
  is_winner BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(giveaway_id, user_id)
);

-- Mentorship Applications
CREATE TABLE IF NOT EXISTS mentorship_apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  payment_screenshot_url TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admin Audit Log
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES profiles(id),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Broadcasts
CREATE TABLE IF NOT EXISTS broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  sent_by UUID REFERENCES profiles(id),
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE giveaways ENABLE ROW LEVEL SECURITY;
ALTER TABLE giveaway_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentorship_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcasts ENABLE ROW LEVEL SECURITY;

-- Profiles: users read own, admins read all
CREATE POLICY "Users read own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Signals: approved users read
CREATE POLICY "Approved users read signals" ON signals FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND status = 'approved')
);

-- Journal: users manage own
CREATE POLICY "Users manage own journal" ON journal_entries FOR ALL USING (auth.uid() = user_id);

-- Giveaways: all read, approved users enter
CREATE POLICY "All read giveaways" ON giveaways FOR SELECT USING (true);
CREATE POLICY "Approved users enter" ON giveaway_entries FOR INSERT WITH CHECK (
  auth.uid() = user_id AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND status = 'approved')
);
CREATE POLICY "Users read own entries" ON giveaway_entries FOR SELECT USING (auth.uid() = user_id);
