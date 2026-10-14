# Matokeo Platform v2.2

> Mfumo wa Kisasa wa Kusimamia Matokeo ya Wanafunzi

Sistema ya usimamizi wa matokeo ya shule yenye Firebase Auth, Firestore Security Rules, na role-based access (Admin + Teacher).

## Vipengele (Features)

### v2.2 — Usalama (Security Audit)
- **Firebase Authentication** — Hakuna tena akaunti za localStorage; kila mtumiaji ana email + nywila (min herufi 8)
- **Firestore Security Rules** — Ruhusa zinateliziwa **kwenye server**, sio JavaScript. Teacher hawezi kufuta mwanafunzi au kubadilisha settings hata akihariri JS ya browser
- **Roles: Admin + Teacher** — Admin anaunda shule anapewa **Join Code**; wanafunzi wanajiunga kwa code hiyo. Kuinua role (privilege escalation) imezuiwa kwenye rules
- **Session timeout** — Kiotomatiki baada ya dakika 30 (inaonyesha onyo kabla)
- **SRI + CSP** — Maktaba za CDN zina Subresource Integrity hashes; Content-Security-Policy inazuia script za kigeni
- **Multi-tenant** — Kila shule data yake iko pekee (`schools/{schoolId}/students`)

### v2.0 - Data & Reports
- **Cloud Sync (offline-first)** — Data inahifadhiwa local, inapelekwa cloud ukiwa na mtandao; mgongano wa data unaulizwa, hauvunjiki kimya
- **Report Cards PDF** — Mwanafunzi mmoja au darasa nzima
- **Bulk Import** — Excel (.xlsx)/CSV na **preview**: mistari yenye makosa inaonyeshwa kwa sababu, haingizwi kimya kimya
- **Backup JSON** — Import ya backup inaonyesha kwanzi wataongezwa/watabadilishwa; hutabadilisha kimya

### v1.0 - Msingi
- Dashboard, analytics (Chart.js), positions zenye kushughulikia sare (1,2,2,4)
- Gredi na wastani zinaweza kubadilishwa na admin (Settings → Mipaka ya Gredi)

## Usanidi (Setup) — kwa Mmiliki wa Shule

1. Fungua app, bonyeza **Fungua Akaunti ya Shule**
   - Jina kamili, barua pepe, nywila (8+), jina la shule
   - Utapewa **Join Code** — nakili na wape walimu wako
2. Ingia kama **Admin**: ongeza wanafunzi, alama, settings, gredi
3. Walimu wanajiandikisha kwa **"Jiunge na Shule"** wakitumia Join Code
4. Backup: **Settings → Export Data (JSON)** mara kwa mara

> **Hakuna akaunti ya default.** Kila shule inaunda akaunti yake mwenyewe.

## Usanidi wa Developer (Firebase)

App inatumia Firebase project (config iko kwenye `index.html` — API key ya web ni public by design; usalama unatoka kwenye Security Rules).

1. Firebase Console → **Authentication → Sign-in method** → wezesha **Email/Password**
2. **Firestore Database** → unda database (production mode)
3. Deploy rules:
   ```
   firebase deploy --only firestore:rules
   ```
   (au copy maudhui ya `firestore.rules` kwenda Console → Firestore → Rules → Publish)
4. (Hiari) Analytics: project ina `measurementId` — inafanya kazi yenyewe

## Tests

```bash
node tests/run-tests.js   # 51 unit tests za core logic (grading, avg, ranking, import validation)
```

## Masomo (Subjects)
Hisabati, Kiswahili, English, Jiografia na Michezo, Sayansi, Historia na Maadili

## Teknolojia (Tech Stack)
- HTML5 / CSS3 / Vanilla JavaScript (hakuna build step)
- Firebase Auth + Firestore (compat SDK 10.7.1)
- Chart.js 4.4 · jsPDF + AutoTable · SheetJS (xlsx)
- Tests: Node test runner bila dependencies (`tests/run-tests.js`)

## License
MIT
