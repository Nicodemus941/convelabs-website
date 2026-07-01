# ConveLabs Pro — Phlebotomist App Store Submission Runbook

The field app for phlebotomists. **Brand-new listing on both stores — does not touch
the existing patient app or E‑Labus apps** because it ships under its own identity:

| | Value |
|---|---|
| App name (stores) | **ConveLabs Pro** |
| iOS bundle ID | `com.convelabs.phleb` |
| Android applicationId | `com.convelabs.phleb` |
| In-app landing | `/phleb-app` (today's route) |
| Sign-in | `/phleb-login` (direct in-app email + password) |

> ⚠️ Never reuse an existing bundle ID. Creating a *new* app record with the ID above
> is what keeps the patient / E‑Labus listings safe.

---

## 0. Build the app (already automated)

```bash
# from convelabs-website/
npm run cap:phleb        # builds phleb web + syncs iOS & Android with com.convelabs.phleb
npm run icons:phleb      # regenerates the red ConveLabs Pro icon/splash (only if art changed)
```

- Open Android Studio: `npm run cap:open:android` → Build > Generate Signed Bundle (AAB).
- Open Xcode (Mac / Codemagic): `npm run cap:open:ios` → Archive.

---

## 1. Apple — App Store Connect (new app)

1. Sign in to **App Store Connect** → **My Apps** → **＋ → New App**.
2. Platform **iOS**; Name **ConveLabs Pro**; Primary language **English (U.S.)**.
3. **Bundle ID:** pick `com.convelabs.phleb`.
   - If it isn't in the dropdown: go to **developer.apple.com → Certificates, IDs & Profiles
     → Identifiers → ＋** and register an App ID with bundle `com.convelabs.phleb` first,
     then come back. **Do not** edit the existing patient/E‑Labus identifiers.
4. **SKU:** `convelabs-pro` (internal only).
5. Create. Then fill: category **Medical** (or **Business**), privacy policy URL
   `https://convelabs.com/privacy`, and mark it as a **staff/internal tool** in the review notes.
6. Upload the Archive from Xcode → it appears under **TestFlight**. Add your phlebotomists
   as internal testers to test before public release.
7. For public release: complete screenshots (6.7" + 5.5"), description, and submit for review.

**Reviewer note to paste:** *"ConveLabs Pro is a staff-only companion app for ConveLabs
mobile phlebotomists to view their daily assigned appointments. Login requires a
ConveLabs staff account provisioned by an administrator. Test credentials: <provide>."*

---

## 2. Google — Play Console (new app)

1. **Play Console** → **All apps** → **Create app**.
2. App name **ConveLabs Pro**; Default language **English (US)**; App type **App**; Free.
3. Complete the declarations, then **Dashboard → Set up your app**.
4. **Release → Testing → Internal testing → Create new release.**
5. Upload the **AAB** (`com.convelabs.phleb`) from Android Studio.
   - First upload: let Play generate the signing key (Play App Signing).
6. Add tester emails (your phlebotomists) → roll out to Internal testing → share the opt-in link.
7. For production: fill Store listing, Content rating, Data safety, Target audience, then
   promote the internal release to Production.

> The Convenient Laboratories org Play account gates **Create app** behind identity /
> website / phone verification. Website is already verified via Search Console; if
> **Create app** is still greyed out, finish the identity + phone steps first.

**Data safety / permissions:** the app reads appointment data over HTTPS and needs no
device sensors beyond what the WebView uses. No ads, no third-party sharing.

---

## 3. What's already done in code

- Two-app scaffold (`CAP_TARGET=phleb`) → `com.convelabs.phleb` / "ConveLabs Pro".
- Native iOS + Android projects synced.
- **Direct in-app login** (`/phleb-login`): field-branded, email + password, no marketing
  chrome, lands on `/phleb-app`. Auth guard is target-aware so the phleb app never bounces
  to the marketing login or the patient dashboard.

## 4. Still owner-only (I can't do these — accounts / irreversible submits)

- Registering the App ID and creating the two store records.
- Uploading builds, entering signing credentials, and pressing **Submit for review**.
- Adding tester emails and rolling out.
