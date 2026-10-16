# Customer Signup Security — Verification Notes

**Date:** 2026-10-16
**Status:** Already implemented (matches LegendJournal model)

---

## Current Flow (pages/signup.html + js/auth.js)

| Step | What happens | LegendJournal parity |
|------|--------------|---------------------|
| 1 | Email + password + username → **Send Verification Code** | ✅ Email signup |
| 1 | **Continue with Google** button | ✅ Google signup |
| 2 | **6-digit OTP** via Supabase Auth email → Verify | ✅ 6-digit OTP |
| 3 | **Quotex Account ID** (required) + **Deposit Amount** (required, min $50) + optional note → Submit | ✅ Quotex ID + deposit |
| 4 | **"Account Under Review"** — admin verifies within 24h | ✅ Admin approval |

## What's Enforced

- `js/auth.js` line 76-77: Quotex ID required, minimum $50 deposit required
- `profiles.status` = 'pending' until admin approves
- `profiles.deposit_verified` = false until admin verifies
- Login blocked for pending/rejected/blocked users (check `js/auth.js` login flow)

## LegendJournal Comparison

| Feature | LegendJournal | Ours |
|---------|---------------|------|
| Email/Google signup | ✅ | ✅ |
| 6-digit OTP | ✅ | ✅ |
| Admin approval required | ✅ | ✅ |
| Quotex ID verification | ✅ | ✅ |
| Minimum deposit | $20 | **$50** (our business rule — keep) |
| Deposit proof screenshot | Manual check | ✅ `deposit_proof_url` column added (migration) |

## Admin Side (new in this build)

- **Bulk approve/reject** — multi-select checkboxes on pending users
- **User detail modal** — Quotex ID, deposit amount, deposit proof image, join date
- **Verify Deposit** button — marks `deposit_verified = true`
- **Block/Unblock** — both directions now supported
- **Audit log** — every action recorded

## TODO (needs Supabase config)

1. **Email OTP**: Supabase Dashboard → Authentication → Email → Enable "Confirm email" OFF (we use OTP, not link). Rate limit: 30 emails/hour on free plan.
2. **Google OAuth**: Supabase Dashboard → Authentication → Providers → Enable Google, add OAuth client ID/secret.
3. **deposit_proof_url**: Currently no upload UI on signup. Options:
   - a) Add file upload to signup step 3 (Supabase Storage bucket `deposit-proofs`)
   - b) User sends screenshot via DM after signup (admin views in user detail modal)
   - Recommendation: (b) for now — simpler, matches LegendJournal's manual flow.

## RLS Policies Needed

```sql
-- Users can read their own profile
create policy "users_read_own" on profiles for select to authenticated
  using (auth.uid() = id);

-- Users can update own quotex_id/deposit (before approval)
create policy "users_update_own_pending" on profiles for update to authenticated
  using (auth.uid() = id and status = 'pending');

-- Admins can do everything (create via SQL, replace <admin-uuid>)
-- This is a simplified example — use your existing admin check logic
```

*Note: Check your existing RLS policies in Supabase Dashboard → Authentication → Policies. The above are suggestions only.*
