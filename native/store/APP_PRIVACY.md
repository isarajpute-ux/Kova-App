# Store privacy answers for Kova

The answers to type into **App Store Connect → App Privacy** and **Google Play Console → Data safety**. They match `privacy.html` and `PrivacyInfo.xcprivacy` (next to this file). If you change what Kova collects, change all three together.

The basics, the same in both stores:

- **Tracking:** none. Kova does not link data with other companies' data for ads, does not share it with data brokers, and has no ads.
- **Data sold:** none.
- **Encrypted in transit:** yes (HTTPS everywhere).
- **Deletion:** in the app, under Settings → Data & privacy → Delete my account. Cycle data has its own delete button in Vitals.
- **Privacy policy URL:** `https://<your site>/privacy.html`

"Collected" means it leaves the phone and is kept. Some things stay only on the phone, so they are **not** collected:
- loudness readings (only the decibel numbers, on the phone, no sound);
- cycle data while cycle sync is off;
- lab results;
- GLP-1 doses;
- everything you log while signed out.

## App Store Connect: App Privacy

Answer **"Yes, we collect data"**. For every type below:
- **Linked to the user:** yes.
- **Used for tracking:** no.

| Apple data type | When | Purposes to tick |
|---|---|---|
| Health & Fitness → **Health** | Signed in: sleep, heart rate, HRV and readings from Apple Health that you allow. Cycle data only with cycle sync on. | App Functionality |
| Health & Fitness → **Fitness** | Signed in: workouts, sets, steps, activity | App Functionality |
| Sensitive Info → **Sensitive Info** | Only with cycle sync on: pregnancy and contraception status | App Functionality |
| Contact Info → **Email Address** | When you sign in | App Functionality |
| Contact Info → **Name** | Optional (Google or Apple may share it at sign-in) | App Functionality |
| Identifiers → **User ID** | When you sign in (also the analytics user, only after "Allow analytics") | App Functionality, Analytics |
| Identifiers → **Device ID** | The push token, when you turn reminders on | App Functionality |
| User Content → **Photos or Videos** | A meal photo you send to be read; Studio media you choose to post | App Functionality |
| User Content → **Other User Content** | Work OS tasks, notes and posts; messages to Kova; the friends feed if you turn it on | App Functionality |
| Purchases → **Purchase History** | The Kova Pro subscription | App Functionality |
| Usage Data → **Product Interaction** | Only after "Allow analytics" | Analytics |

Everything else gets **No**:
- Location, Contacts, Browsing History and Search History;
- Audio Data (Kova measures loudness on the phone and records nothing);
- Diagnostics, Financial Info and Advertising Data.

## Google Play Console: Data safety

- **Does your app collect or share any of the required user data types?** Yes.
- **Is all of the user data collected by your app encrypted in transit?** Yes.
- **Do you provide a way for users to request that their data is deleted?** Yes, in the app, and by email to the support address.
- **Shared with third parties:** none. The services Kova uses on its own behalf count as service providers, not sharing: Firebase, Netlify, Anthropic, RevenueCat and Google Analytics with consent.

| Play category → type | Collected | Optional? | Purposes |
|---|---|---|---|
| Health and fitness → Health info | Yes | Yes | App functionality |
| Health and fitness → Fitness info | Yes | Yes | App functionality |
| Personal info → Email address | Yes | Yes (Kova works without an account) | Account management, App functionality |
| Personal info → Name | Yes | Yes | Account management |
| Personal info → User IDs | Yes | Yes | Account management, Analytics |
| Photos and videos → Photos, Videos | Yes | Yes | App functionality |
| App activity → App interactions | Yes | Yes (only after "Allow analytics") | Analytics |
| App activity → Other user-generated content | Yes | Yes | App functionality |
| Financial info → Purchase history | Yes | Yes | App functionality |
| Device or other IDs → Device or other IDs | Yes | Yes (reminders) | App functionality |

Answer **No** for:
- Location, Messages, Contacts, Calendar events, Files and docs, App info and performance, and Web browsing;
- **Audio**: the noise meter keeps only decibel numbers, on the phone.

**Health Connect:** Play also asks for a declaration of what Kova reads and why.
- Kova reads only (sleep, heart rate, HRV, steps, activity and skin temperature) to show readiness, sleep and cycle insights.
- It writes nothing, and the data is never used for ads.
