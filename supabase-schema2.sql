-- Prime Trader Solution — Additional Systems Schema
-- Run AFTER supabase-schema.sql

-- Discipline scores (auto-calculated from journal)
CREATE TABLE IF NOT EXISTS discipline_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  score INT DEFAULT 100,
  overtrading_penalty INT DEFAULT 0,
  loss_streak_penalty INT DEFAULT 0,
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Deposit bonus spins
CREATE TABLE IF NOT EXISTS bonus_spins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  bonus_percent INT NOT NULL,
  spun_at TIMESTAMPTZ DEFAULT NOW()
);

-- YouTube giveaways
CREATE TABLE IF NOT EXISTS yt_giveaways (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  video_url TEXT NOT NULL,
  prize_usdt DECIMAL(10,2) DEFAULT 50,
  status TEXT DEFAULT 'open' CHECK (status IN ('open','closed','resolved')),
  winner_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS yt_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  giveaway_id UUID NOT NULL REFERENCES yt_giveaways(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  yt_comment_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(giveaway_id, user_id)
);

-- DM messages
CREATE TABLE IF NOT EXISTS dm_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id),
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE discipline_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE bonus_spins ENABLE ROW LEVEL SECURITY;
ALTER TABLE yt_giveaways ENABLE ROW LEVEL SECURITY;
ALTER TABLE yt_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE dm_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read discipline" ON discipline_scores FOR SELECT USING (true);
CREATE POLICY "Users read own spins" ON bonus_spins FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own spins" ON bonus_spins FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "All read yt giveaways" ON yt_giveaways FOR SELECT USING (true);
CREATE POLICY "Users enter yt" ON yt_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users read own yt entries" ON yt_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users read own DMs" ON dm_messages FOR SELECT USING (auth.uid() = user_id OR auth.uid() = sender_id);
CREATE POLICY "Users send DMs" ON dm_messages FOR INSERT WITH CHECK (auth.uid() = sender_id);

-- Add verification fields for Journal-style flow
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deposit_amount DECIMAL(10,2);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verification_note TEXT;

-- Discipline leaderboard view
CREATE OR REPLACE VIEW discipline_board AS
SELECT p.username, d.score,
  d.overtrading_penalty, d.loss_streak_penalty
FROM discipline_scores d
JOIN profiles p ON p.id = d.user_id
WHERE p.status = 'approved'
ORDER BY d.score DESC;
