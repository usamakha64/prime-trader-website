-- Prime Trader Solution — Admin Redesign Migration
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- Date: 2026-10-16

-- ===== 1. SIGNALS TABLE: bot columns =====
alter table signals add column if not exists source text default 'manual';       -- 'bot' | 'manual'
alter table signals add column if not exists status text default 'open';         -- 'open' | 'win' | 'loss' | 'pending'
alter table signals add column if not exists entry_price numeric;
alter table signals add column if not exists exit_price numeric;
alter table signals add column if not exists settled_by text;                    -- 'bot' | 'admin'
alter table signals add column if not exists mtg_level int default 0;
alter table signals add column if not exists strategy text default '7-indicator';
alter table signals add column if not exists pnl numeric default 0;

-- Backfill: existing rows with result -> status
update signals set status = lower(result) where result is not null and status = 'open';
update signals set source = 'manual' where source is null;

-- ===== 2. PROFILES: deposit proof + verification note =====
alter table profiles add column if not exists deposit_amount decimal(10,2);
alter table profiles add column if not exists deposit_proof_url text;
alter table profiles add column if not exists verification_note text;
alter table profiles add column if not exists otp_verified_at timestamptz;

-- ===== 3. BOT STATUS (singleton row, id=1) =====
create table if not exists bot_status (
  id int primary key default 1,
  connected boolean default false,
  ssid_valid boolean default false,
  auto_publish boolean default true,
  auto_settle boolean default true,
  last_signal_at timestamptz,
  updated_at timestamptz default now(),
  constraint bot_status_singleton check (id = 1)
);
insert into bot_status (id) values (1) on conflict (id) do nothing;

-- ===== 4. GIVEAWAYS: winner + resolve =====
alter table giveaways add column if not exists winner text;
alter table giveaways add column if not exists resolved_at timestamptz;
-- prize_pool may not exist on older schema
alter table giveaways add column if not exists prize_pool numeric default 300;

-- giveaway entries (if missing)
create table if not exists giveaway_entries (
  id uuid primary key default gen_random_uuid(),
  giveaway_id uuid references giveaways(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  prediction text,
  created_at timestamptz default now(),
  unique(giveaway_id, user_id)
);

-- ===== 5. YT GIVEAWAYS: winner + resolve =====
alter table yt_giveaways add column if not exists winner text;
alter table yt_giveaways add column if not exists resolved_at timestamptz;

-- ===== 6. DEPOSIT BONUS SPIN =====
create table if not exists spin_config (
  id int primary key default 1,
  enabled boolean default false,
  max_per_day int default 1,
  options int[] default array[50,70,100],
  constraint spin_config_singleton check (id = 1)
);
insert into spin_config (id) values (1) on conflict (id) do nothing;

create table if not exists spin_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  bonus_pct int not null,
  created_at timestamptz default now()
);

-- ===== 7. BROADCASTS: target column =====
alter table broadcasts add column if not exists target text default 'all';  -- 'all' | 'approved' | 'telegram' | 'both'

-- ===== 8. MENTORSHIP: payment proof =====
alter table mentorship_apps add column if not exists payment_proof_url text;
alter table mentorship_apps add column if not exists package text default '$125 / 30 days';
alter table mentorship_apps add column if not exists note text;

-- ===== 9. RLS: allow admin full access (adjust to your policies) =====
-- The app uses service-role via admin.js? No — it uses anon key with RLS.
-- Ensure these permissive admin policies exist (replace with your own logic if needed):

-- Example: allow authenticated users to read bot_status
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'bot_status_read_all') then
    create policy bot_status_read_all on bot_status for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'spin_config_read_all') then
    create policy spin_config_read_all on spin_config for select to authenticated using (true);
  end if;
end $$;

-- ===== 10. Helpful indexes =====
create index if not exists idx_signals_created on signals(created_at desc);
create index if not exists idx_signals_status on signals(status);
create index if not exists idx_signals_source on signals(source);
create index if not exists idx_profiles_status on profiles(status);
create index if not exists idx_audit_created on audit_log(created_at desc);
