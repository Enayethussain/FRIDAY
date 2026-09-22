# FRIDAY — AdMob Troubleshooting

No secrets in this document. App/Ad IDs below are public identifiers that
already ship inside the APK manifest.

## Configured IDs

| Item | Value | Stored in |
|---|---|---|
| AdMob App ID | `ca-app-pub-1105316876893505~5616376410` | `android/app/src/main/AndroidManifest.xml` (`APPLICATION_ID` meta-data, exactly once) |
| App Open Ad Unit (production) | `ca-app-pub-1105316876893505/1262198432` | `.../ads/AppOpenAdManager.java` (release builds only) |
| App Open Ad Unit (test) | `ca-app-pub-3940256099942544/9257395921` | same file (debuggable builds only — Google's official test unit) |

Rules enforced in code: App ID and Ad Unit ID are never swapped, never
duplicated, and debug builds cannot load production ads (selection is by
`FLAG_DEBUGGABLE`, no user setting exists).

## SDK

`play-services-ads:24.2.0` + `lifecycle-process:2.8.3` + `ump:4.0.0`
(`android/app/build.gradle`). Requires minSdk 23; project minSdk is 24
(Android 8+ preserved). Requires Google Play Services on the device.

## How to triage “ads not appearing”

1. **Check entitlement first** — call `FridayAds.getDiagnostics()` (or read
   `getAdsDiagnostics()` in JS). If `adsAllowed=false`, the verified plan is
   PRO/PLUS (correct: no ads) — not an ad bug.
2. **Check `criticalBusy`** — voice, calls, transfers, vault, camera,
   gestures, permissions and phone control suppress ads by design.
3. **Read logcat `FridayAds`** (debug build): event tags
   `ADMOB_INIT_START/SUCCESS/FAILURE`, `APP_OPEN_LOAD_START/SUCCESS/FAILURE`,
   `APP_OPEN_SHOW_START/SUCCESS/FAILURE`, `APP_OPEN_DISMISSED`, each with
   real SDK codes/messages and gate booleans
   (`alreadyShowing`, `entitlement`, `foreground`, `stale`, `criticalBusy`).
4. **Error codes** (`lastLoadCode`/`lastShowCode`):
   - `0` / `SUCCESS` — SDK confirmed; if no visual ad follows, check foreground/activity state.
   - `1` INVALID_REQUEST — wrong ad unit format or App ID problem; verify the table above.
   - `2` NETWORK_ERROR — device offline or DNS blocked.
   - `3` NO_FILL — account/inventory, see below. Most common on new ad units.
   - `8` APP_ID_MISSING — manifest meta-data missing (merged manifest must show it exactly once).
5. **Cold start shows nothing? Normal.** The first resume happens before the
   async consent→init→load chain finishes; the ad appears on the *next*
   background→foreground return (3-minute cooldown between shows).

## FREE / PRO / PLUS behavior

- FREE (or backend-unreachable): ads eligible.
- Verified PRO/PLUS: preloaded ad is discarded, nothing loads or shows.
- Source of truth is `shouldShowAds()` (JS) fed by server-verified
  `/api/v1/account`; there is no second subscription check and no
  local-storage unlock.

## Test procedure (real device)

1. Install debug APK (test ads forced). Cold-start, then background 5s and
   return → test App Open ad appears. Dismiss → FRIDAY continues.
2. Immediate re-entry → no second ad (cooldown). Airplane mode → normal
   start, no ad, no crash.
3. Backend PRO grant → return to app → no ads, preloaded ad discarded.
4. Release APK: same flow shows production unit (only after AdMob serves it).

## What “no fill” (code 3) means

Google has no ad to serve right now: new ad units need hours/days after
creation, the app must be added/linked in the AdMob dashboard, payments must
be verified, and `app-ads.txt` should exist for the listing domain. None of
these are code problems — do not rewrite working code for code 3; check the
AdMob dashboard (Mediation → ad unit status, Policy center, payment
verification) instead.

## Configuration errors

- `APP_ID_MISSING` / invalid-request on every load: re-check the manifest
  table above and the merged manifest under
  `app/build/intermediates/merged_manifests/<variant>/`.
- `Ad Unit ID` errors after copying IDs: the App ID contains `~`, the ad
  unit contains `/` — they are not interchangeable.
