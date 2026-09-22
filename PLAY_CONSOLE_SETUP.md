# FRIDAY — Google Play Console subscription setup checklist

Intended FRIDAY launch prices. Create these as **subscriptions** (not one-time
products) under the app `com.friday.ai`. Until every box below is done AND a
real test purchase verifies end-to-end, the app honestly reports billing as
not configured — do NOT claim Play has these prices until verified.

## Products to create (exact IDs)

| # | Name | Product ID | Base plan | Billing period | Intended price |
|---|------|------------|-----------|----------------|----------------|
| 1 | FRIDAY Pro Monthly | `friday_pro_monthly` | pro-monthly | P1M | ₹99/month |
| 2 | FRIDAY Pro 3 Months | `friday_pro_3_month` | pro-3-month | P3M | ₹249/3 months |
| 3 | FRIDAY Pro Yearly | `friday_pro_yearly` | pro-yearly | P1Y | ₹799/year |
| 4 | FRIDAY Plus Monthly | `friday_plus_monthly` | plus-monthly | P1M | ₹199/month |
| 5 | FRIDAY Plus 3 Months | `friday_plus_3_month` | plus-3-month | P3M | ₹499/3 months |
| 6 | FRIDAY Plus Yearly | `friday_plus_yearly` | plus-yearly | P1Y | ₹1,499/year |

Base plans + offers: one offer per subscription above (matching period).
For each product document in Console: base plan ID, billing period, price,
offer ID (if any offer is added later), introductory offer terms (if any),
offer eligibility rules, activation state. **No offers, trials, or discounts
exist until actually configured here — the app only displays what Play
returns; it never invents promotional text.**
Google Play's checkout price is authoritative (taxes/region may differ).

## Steps

- [ ] App `com.friday.ai` created in Play Console (production or internal testing track).
- [ ] All 6 subscription products created with the EXACT IDs above.
- [ ] Prices set per table (Play may localize; that price wins at checkout).
- [ ] Products activated and available to the test track.
- [ ] Service account created with **Google Play Android Developer** access
      (monitoring-only role is NOT enough for purchase verification).
- [ ] Service-account JSON downloaded and set as server env
      `PLAY_SERVICE_ACCOUNT_JSON` (single line). NEVER in the APK/repo.
- [ ] Server deployed with `NODE_ENV=production` (disables `PLAN_GRANTS`).
- [ ] License-tester purchase completed on a real device (test card, no charge).
- [ ] Backend log shows `v1 billing verify` success and `/api/v1/account`
      returns PRO/PLUS with the full entitlement map.
- [ ] App shows CURRENT PLAN correctly; ads disabled for PRO/PLUS.
- [ ] Restore Purchases tested (reinstall → restore → plan returns).
- [ ] Expiry/cancel tested (or simulated via revoked test purchase).
- [ ] Only then: mark `playConsoleConfigured` live and announce billing.

## Lifecycle verification (test track)

Exercise each state on a tester account and confirm the app's honest UI:

- [ ] ACTIVE → premium unlocked, ads off
- [ ] PENDING → "payment pending", Free features only
- [ ] CANCELLED → access continues until verified date, no renewal date shown
- [ ] Grace period → grace message, entitlement per verified state
- [ ] Account hold → attention message, downgraded unless Play entitles
- [ ] Paused → paused message, retained only till verified future expiry
- [ ] Expired → FREE, ads return, all user data intact
- [ ] Refunded/revoked → FREE, data intact
- [ ] Renewal → expiry extends after account refresh (no restart needed)
- [ ] Upgrade/downgrade (monthly ↔ yearly, Pro ↔ Plus) via Play replacement
- [ ] Restore after reinstall returns the verified plan
- [ ] Offline → cached/confirmed/unavailable states shown honestly

## Notes

- `BILLING_PRODUCTS_JSON` may override intended DISPLAY strings only; it can
  never change product IDs, plans, or grant premium.
- `PLAN_GRANTS` works in development servers only; production ignores it.
- Purchase tokens are verified with the Play Developer API
  (`purchases.subscriptionsv2.get`); client claims alone never unlock premium.
