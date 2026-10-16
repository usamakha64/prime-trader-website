# Bot → Website API Specification

**Date:** 2026-10-16
**Purpose:** How the Prime Trader app/bot publishes signals and results to the website automatically.

---

## 1. Authentication

The bot authenticates to Supabase using the **service role key** OR a dedicated bot user with admin privileges.

Recommended: Create a Supabase service-role key stored securely (NOT in the app — use a small proxy or Edge Function).

**Option A (simple):** Bot uses anon key + RLS policy allowing INSERT on `signals` where `source='bot'`.
**Option B (secure):** Supabase Edge Function `bot-signal` validates a shared secret header, then inserts with service role.

---

## 2. Publish Signal (bot → website)

```
POST /rest/v1/signals
Headers: apikey, Authorization: Bearer <key>, Content-Type: application/json
Body:
{
  "asset": "EURUSD",
  "direction": "CALL",
  "confidence": 87,
  "entry_time": "2026-10-16T10:30:00Z",
  "entry_price": 1.08542,
  "expiry_seconds": 60,
  "source": "bot",
  "status": "open",
  "strategy": "7-indicator"
}
```

Website then:
- Shows on customer dashboard (login-only, approved users)
- Sends Telegram broadcast (if auto-publish ON in bot_status)

---

## 3. Settle Signal (bot → website)

```
PATCH /rest/v1/signals?id=eq.<signal_id>
Body:
{
  "result": "WIN",
  "status": "win",
  "exit_price": 1.08561,
  "pnl": 4.35,
  "settled_by": "bot"
}
```

---

## 4. Update Bot Status (bot → website)

```
POST /rest/v1/bot_status (upsert id=1)
Body:
{
  "id": 1,
  "connected": true,
  "ssid_valid": true,
  "last_signal_at": "2026-10-16T10:30:00Z",
  "updated_at": "2026-10-16T10:30:00Z"
}
```

The admin panel reads this for the 🤖 Bot Status card.

---

## 5. Customer Dashboard Signal Feed

Customer dashboard queries:
```sql
SELECT * FROM signals
WHERE source = 'bot'
  AND status IN ('open', 'win', 'loss')
  AND created_at >= NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 30;
```

Only approved, non-blocked users can access (RLS policy).

---

## 6. Telegram Broadcast (website → Telegram)

When a bot signal is published (and auto-publish is ON):
1. Website Edge Function or cron picks up new `source='bot'` signals
2. Formats message:
   ```
   📡 *NEW SIGNAL*
   📊 EURUSD — CALL ⬆️
   🎯 Confidence: 87%
   ⏱️ Expiry: 1 min
   ```
3. Sends via Telegram Bot API to channel

Session summary broadcast uses the same path (admin clicks button → inserts into `broadcasts` with target='telegram' → Edge Function sends).

---

## Implementation Notes

- The Android app (v1.0.9+) has the Quotex WebSocket client. Phase 3 will add signal generation + this API push.
- Until then, signals can be tested with manual inserts.
- **Do NOT expose the service role key in the APK.** Use Edge Function proxy.
