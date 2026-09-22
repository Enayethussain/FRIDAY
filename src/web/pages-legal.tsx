import { PageShell } from './layout';

const CONTACT_EMAIL = (import.meta as any).env?.VITE_CONTACT_EMAIL || '';
const SUPPORT_URL = (import.meta as any).env?.VITE_SUPPORT_URL || '';

export function ContactBlock() {
  return (
    <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-5 text-sm text-slate-300">
      <h2 className="font-bold text-slate-100">Contact / Support</h2>
      {CONTACT_EMAIL ? (
        <p className="mt-1">Email: <a className="text-amber-300 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></p>
      ) : (
        <p className="mt-1 text-slate-400">Support email is being set up — please check back soon.</p>
      )}
      {SUPPORT_URL && (
        <p className="mt-1">Support portal: <a className="text-amber-300 hover:underline" href={SUPPORT_URL} target="_blank" rel="noreferrer">{SUPPORT_URL}</a></p>
      )}
      <p className="mt-1 text-slate-400">App: FRIDAY AI (Android package com.friday.ai)</p>
    </div>
  );
}

export function ContactPage() {
  return (
    <PageShell title="Contact" description="Contact FRIDAY AI support.">
      <h1 className="font-display font-black text-3xl">Contact / Support</h1>
      <p className="mt-2 text-slate-400">Questions about FRIDAY AI, subscriptions or technical issues — reach us below.</p>
      <ContactBlock />
    </PageShell>
  );
}

export function PrivacyPage() {
  return (
    <PageShell title="Privacy Policy" description="FRIDAY AI privacy policy: what data is collected, where it goes, and your rights.">
      <h1 className="font-display font-black text-3xl">Privacy Policy</h1>
      <p className="mt-1 font-mono text-xs text-slate-500">Effective date: September 2026 · App: FRIDAY AI (com.friday.ai)</p>
      <div className="mt-4 space-y-5 text-slate-300 leading-relaxed max-w-2xl text-[15px]">
        <section>
          <h2 className="font-bold text-slate-100">1. What FRIDAY does</h2>
          <p>FRIDAY is a voice-first AI assistant: conversation via our backend server to Gemini AI, phone control (calls, SMS, apps, volume, flashlight), notification reading (opt-in), optional Screen Assist (which app is open, opt-in), device pairing, memory, 3D holograms and app building.</p>
        </section>
        <section>
          <h2 className="font-bold text-slate-100">2. Data collected</h2>
          <ul className="list-disc ml-5 space-y-1">
            <li><b>Voice/text commands</b> — when you talk to FRIDAY; sent to our backend, forwarded to Gemini AI, not stored on the server.</li>
            <li><b>Contacts, SMS, call log</b> — only on your command, read on-device only, never sent to the server.</li>
            <li><b>Notifications</b> — only with Notification Access enabled, read on-device only.</li>
            <li><b>Foreground app</b> — only with Screen Assist ON; no screenshots saved or uploaded.</li>
            <li><b>Notes, tasks, PIN hash</b> — device storage; PINs are never stored in plaintext (Argon2id/PBKDF2).</li>
            <li><b>Pairing codes</b> — temporary backend relay queue, deleted after delivery.</li>
            <li><b>Subscription state</b> — plan and entitlement verified server-side; purchase tokens are verified with Google Play and never stored raw.</li>
          </ul>
        </section>
        <section>
          <h2 className="font-bold text-slate-100">3. What never happens</h2>
          <ul className="list-disc ml-5 space-y-1">
            <li>No background surveillance; Screen Assist defaults OFF.</li>
            <li>No screen recording; no screenshot saving/uploading.</li>
            <li>No data sold or shared with advertisers or third parties.</li>
            <li>API keys (Gemini, payment secrets) live only on the backend — never in the app or browser code.</li>
          </ul>
        </section>
        <section>
          <h2 className="font-bold text-slate-100">4. Permissions (Android)</h2>
          <p>Microphone, contacts, phone, SMS, notifications, usage stats, overlay, camera, storage, location and Bluetooth are each used only for the feature you invoke. Denying a permission never crashes the app — the feature stays politely unavailable.</p>
        </section>
        <section>
          <h2 className="font-bold text-slate-100">5. Deletion &amp; children</h2>
          <p>Uninstalling removes on-device data. Memories can be deleted inside the app; expiry of a subscription only changes entitlements, never deletes your data. FRIDAY is not for children under 13.</p>
        </section>
      </div>
      <ContactBlock />
    </PageShell>
  );
}

export function TermsPage() {
  return (
    <PageShell title="Terms & Conditions" description="FRIDAY AI terms of use.">
      <h1 className="font-display font-black text-3xl">Terms &amp; Conditions</h1>
      <div className="mt-4 space-y-5 text-slate-300 leading-relaxed max-w-2xl text-[15px]">
        <section>
          <h2 className="font-bold text-slate-100">1. The service</h2>
          <p>FRIDAY AI (“the app”) provides a voice-first AI assistant with chat, device control, sharing, memory, holograms and subscription plans (Free, Pro, Plus). Features depend on your plan, Android permissions you grant, and backend availability.</p>
        </section>
        <section>
          <h2 className="font-bold text-slate-100">2. Acceptable use</h2>
          <p>Use FRIDAY lawfully and only on devices you own or administer. Do not attempt to bypass entitlement checks, misuse pairing codes, or abuse rate limits — accounts engaging in abuse may be rate-limited or disabled.</p>
        </section>
        <section>
          <h2 className="font-bold text-slate-100">3. Subscriptions</h2>
          <p>Pro and Plus are sold through Google Play (Android) and verified server-side. Prices shown in-app come from the live product catalog; Google Play checkout prices are final. Premium unlocks only after backend verification — client-side modifications grant nothing.</p>
        </section>
        <section>
          <h2 className="font-bold text-slate-100">4. Availability</h2>
          <p>Cloud AI requires internet; phone-native commands may work offline where Android permits. We do not guarantee uninterrupted service; maintenance is announced via backend status where possible. Quotas follow the configured provider limits.</p>
        </section>
        <section>
          <h2 className="font-bold text-slate-100">5. Liability</h2>
          <p>FRIDAY executes real phone actions (calls, messages, settings) only on your command with your confirmation where required. You are responsible for reviewing confirmations. To the extent permitted by law, liability is limited to the subscription fees paid in the current term.</p>
        </section>
      </div>
      <ContactBlock />
    </PageShell>
  );
}

export function RefundPage() {
  return (
    <PageShell title="Refund Policy" description="FRIDAY AI refund and cancellation policy.">
      <h1 className="font-display font-black text-3xl">Refund / Cancellation Policy</h1>
      <div className="mt-4 space-y-5 text-slate-300 leading-relaxed max-w-2xl text-[15px]">
        <section>
          <h2 className="font-bold text-slate-100">1. Android (Google Play)</h2>
          <p>Subscriptions bought through Google Play are billed, cancelled and refunded under Google Play policies. Cancel in the Play Store; access continues until the verified expiry date. Refunds are issued by Google where their policy allows — we cannot override Play refund decisions.</p>
        </section>
        <section>
          <h2 className="font-bold text-slate-100">2. Web (when enabled)</h2>
          <p>Web payments are not active yet. When a web payment provider is connected, its terms will be stated here before you pay, and every payment will be verified server-side before any entitlement is granted.</p>
        </section>
        <section>
          <h2 className="font-bold text-slate-100">3. Expiry &amp; data</h2>
          <p>When a subscription expires or is refunded, premium entitlements end and the account returns to Free. Your conversations, memory, vault data, files, Share data and settings are never deleted because of expiry or refund.</p>
        </section>
      </div>
      <ContactBlock />
    </PageShell>
  );
}
