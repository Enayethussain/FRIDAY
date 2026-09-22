# JARVIS — Privacy Policy

**App:** JARVIS — AI Phone Assistant
**Package:** com.friday.ai
**Effective date:** September 2026
**Contact:** (apna support email yahan likho)

> Play Console me publish karne se pehle is file ko kisi public URL par host karo
> (GitHub Pages / apni website / Google Sites) aur wahi link Play Console →
> App content → Privacy policy me daalo.

---

## 1. JARVIS kya karta hai

JARVIS ek on-device AI phone assistant hai: voice conversation (Gemini AI backend
ke through), phone control (calls, SMS, app launch, volume, flashlight), notification
reading, optional Screen Assist (kaun sa app khula hai), aur device pairing.

## 2. Kaunsa data collect hota hai

| Data | Kab | Kahan jata hai |
|---|---|---|
| Voice/text commands | Jab tum JARVIS se baat karte ho | Hamare backend server (`friday-4-y2yb.onrender.com`) → Gemini AI. Server par save nahi hota. |
| Contacts (naam, number) | Sirf jab tum "call karo / SMS bhejo" bologe | Sirf tumhare phone me padha jata hai. Server ko nahi bheja jata. |
| SMS / call log | Sirf tumhare command par (padho / bhejo) | Sirf on-device. Server ko nahi bheja jata. |
| Notifications (WhatsApp, Instagram, SMS, Gmail) | Sirf Notification Access ON karne par | Sirf on-device padha/sunaya jata hai. Server ko nahi bheja jata. |
| Current foreground app | Sirf Screen Assist ON karne par | Sirf on-device. Koi screenshot save/upload nahi hota. |
| Notes / tasks / PIN hash | Tumhare use par | Phone storage (localStorage) me. PIN kabhi plaintext me store nahi hota (Argon2id/PBKDF2 hash). |
| Device pairing code | Device Link use par | Backend par temporary relay queue (inbox poll hone ke baad delete). |

## 3. Kya NAHI hota

- Background surveillance nahi: Screen Assist default OFF hai, explicit toggle se hi chalta hai, band karne par poori tarah ruk jata hai.
- Screen recording nahi, screenshots save/upload nahi.
- Banking / payment / OTP / password apps kabhi watch nahi hote.
- Koi data advertisers ya third-party ko becha/share nahi hota.
- Gemini API key app me nahi hoti — sirf backend server par rehti hai.

## 4. Permissions kyun chahiye

- **Microphone:** voice commands ke liye.
- **Contacts / Phone / Call log:** naam se call lagane ke liye.
- **SMS:** message padhne/bhejne ke liye (tumhare command par).
- **Notifications:** WhatsApp/Instagram/SMS sunane ke liye (opt-in).
- **Usage stats:** Screen Assist ke liye (opt-in).
- **Overlay:** floating sphere ke liye (opt-in).
- **Camera / Storage / Location / Bluetooth:** photo, files, weather, Bluetooth toggle jaise features ke liye — sirf use ke waqt.

Har permission deny karne par app crash nahi karta — feature politely unavailable rehta hai.

## 5. Data delete

App uninstall karne par saara on-device data delete ho jata hai. Server par koi
account/data store nahi hota, isliye delete request ki zaroorat nahi. Phir bhi
koi sawaal ho to upar diye contact par likho.

## 6. Bachche

JARVIS 13 saal se kam umra ke bachchon ke liye nahi hai.

## 7. Changes

Policy badlegi to yahi page update hoga.
