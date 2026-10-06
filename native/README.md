# Kova for iPhone and Android

This wraps the same `index.html` in a native shell ([Capacitor 8](https://capacitorjs.com)). It adds what a web app can't have on iPhone:

- **Apple Health** on iOS and **Health Connect** on Android. You get sleep and stages, HRV, resting heart rate, steps, energy, exercise minutes, SpO2, respiratory rate, VO2 max, weight and wrist temperature.
  - Access is read-only. Kova never writes to Health.
  - The page's `KovaNative` bridge (`p08_native.js`) feeds these readings into `KovaHealth.ingest`. That is the same path the Health Auto Export JSON uses, so every screen works unchanged.
  - It also writes each night into the sleep log that the "How it connects" cards read.
  - Wrist temperature arrives as a deviation from your own recent nights. The cycle view uses it for the retrospective ovulation estimate.
- **Heart rate during a workout** (the Apple Watch case).
  - While the workout screen is open, the bridge reads new heart-rate samples every 10 s and passes them to `KovaHR`.
  - HealthKit receives Watch readings in batches, so this can lag a Bluetooth strap by up to a minute.
  - A chest strap in Chrome on Android, Mac or Windows is live to the second.
- **An App Store / Play Store listing** and a proper home-screen icon, with no "Add to Home Screen" steps.

Nothing else changes: the same Firebase project, the same server and the same account.

## What you need

- A Mac with Xcode 26+ (for iOS) and/or Android Studio (for Android)
- Node 22+
- An Apple Developer account ($99/yr) to put it on the App Store, or a free account to run it on your own phone
- A Google Play developer account ($25 once) for Android

## First build

```bash
cd native
npm install
npx cap add ios        # once
npx cap add android    # once
npm run ios            # copies ../index.html into www/, syncs, opens Xcode
```

Then, **once, in Xcode:**

1. Open **App → Signing & Capabilities**, pick your team, and add the **HealthKit** capability.
2. Paste the three keys from `ios-Info.plist-additions.xml` into `ios/App/App/Info.plist`.
3. Change the bundle id `com.kova.app` (in `capacitor.config.json` and Xcode) to one you own.

**Android:**
- The plugin already declares the Health Connect permissions.
- Health Connect requires a privacy policy screen. The plugin README explains how.
- Android 13 and older needs the Health Connect app from the Play Store.

Every time you change the web app, run `npm run sync`, then build again from Xcode or Android Studio.

## Push reminders

Bedtime, water, meal, training and medication reminders arrive with Kova closed. The page registers the phone with Firebase Cloud Messaging (free) through `@capacitor-firebase/messaging`. That plugin gives an FCM token on iPhone and on Android, which is what the Kova server sends to. `@capacitor/push-notifications` gives a raw APNs token on iPhone, which FCM cannot use.

Once, in the Firebase console (Project settings):
1. **iOS:** add an iOS app with your bundle id, download `GoogleService-Info.plist` and drag it into `ios/App/App` in Xcode. Upload your APNs key under **Cloud Messaging > Apple app configuration**. In Xcode add the **Push Notifications** capability and **Background Modes > Remote notifications**.
2. **Android:** add an Android app with the same id, download `google-services.json` into `android/app/`.

Kova asks for notification permission only when you switch a reminder on, never on launch. Tapping a notification opens its screen.

**Kova's own alert sound.** Every reminder and alert plays Kova's one sound (two glass notes, rising), like Snapchat's sound is Snapchat's. There is nothing to pick.
- `npm run sync` renders it from the app's own synth (`src/p08_chime.js`) into `android/app/src/main/res/raw/kova_kova.wav` and into `native/sounds/`.
- On Android the app makes the `kova_kova` notification channel on start, and the server sends every push on it.
- On iPhone the app writes the same `.wav` file into its `Library/Sounds` folder on start (with `@capacitor/filesystem`), which is where iOS looks for a push's sound. Nothing to add in Xcode.
- Websites cannot give a notification its own sound, so on the web a push with Kova closed uses the system sound. While Kova is open, its own sound plays.

## Things to know

- **Sign-in:** the email code sign-in works inside the app. A Google or Apple sign-in popup cannot open inside an app web view. If you add those later, use a native sign-in plugin (for example `@capacitor-firebase/authentication`).
- **The service worker is switched off inside the app.** `scripts/copy-web.mjs` does this, because the files are already on the device. The website keeps its worker.
- **App Store review:**
  - Apple needs a privacy policy URL.
  - The Health wording must say exactly what is read and why. The provided strings do this.
  - Apps that only wrap a website can be rejected under guideline 4.2. The HealthKit features, heart rate and offline use are what make this more than a website.
- **Store health rules:** health data may not be used for advertising or sold (App Store 5.1.3, Google Play Health Connect policy). Kova does neither.

## Why Capacitor and not React Native

Kova is one HTML file. Capacitor runs that file as-is and adds native plugins where they're needed, so there's one codebase and nothing gets rewritten. React Native or Flutter would mean rebuilding every screen.

The health plugin is [`@capgo/capacitor-health`](https://www.npmjs.com/package/@capgo/capacitor-health) (MIT, HealthKit + Health Connect).
