/* App Store and Play readiness: the privacy manifest, the permission
   strings the camera and noise meter need, the Android permissions, the
   store privacy answers, and Google / Apple sign-in inside the app (the
   phone's own sign-in sheets, never a web pop-up that cannot open; no
   buttons at all in a build without the plugin). */
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { serve, openPage } from './harness.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const rd = (p) => readFileSync(join(root, p), 'utf8');

/* ---- the files ---- */
const man = rd('native/store/PrivacyInfo.xcprivacy');
let lint = true; try { execFileSync('plutil', ['-lint', join(root, 'native/store/PrivacyInfo.xcprivacy')]); } catch (e) { lint = !/command not found|ENOENT/.test(String(e)) ? false : true; }
ck('the privacy manifest is a valid plist that says no tracking', lint && /<key>NSPrivacyTracking<\/key>\s*<false\/>/.test(man));
const types = [...man.matchAll(/NSPrivacyCollectedDataType<\/key><string>(NSPrivacyCollectedDataType\w+)/g)].map((m) => m[1].replace('NSPrivacyCollectedDataType', ''));
ck('it declares what Kova collects (' + types.join(', ') + ')', ['Health', 'Fitness', 'EmailAddress', 'UserID', 'PhotosorVideos', 'PurchaseHistory', 'DeviceID', 'ProductInteraction'].every((t) => types.includes(t)));
ck('nothing is declared as used for tracking', !/NSPrivacyCollectedDataTypeTracking<\/key><true\/>/.test(man));
ck('no audio is declared collected (loudness stays on the phone)', !/AudioData/.test(man));
ck('the required-reason APIs have their reasons', /NSPrivacyAccessedAPICategoryUserDefaults[\s\S]*CA92\.1/.test(man) && /NSPrivacyAccessedAPICategoryFileTimestamp[\s\S]*C617\.1/.test(man));
ck('npm run sync puts it next to Info.plist', /store', 'PrivacyInfo\.xcprivacy'/.test(rd('native/scripts/copy-web.mjs')) && !existsSync(join(root, 'native/ios/PrivacyInfo.xcprivacy')));
const plist = rd('native/ios-Info.plist-additions.xml');
ck('iPhone permission strings for the camera and the microphone say what they are for', /NSCameraUsageDescription<\/key>\s*<string>[^<]{40,}/.test(plist) && /NSMicrophoneUsageDescription<\/key>\s*<string>[^<]*nothing is recorded/.test(plist));
const am = rd('native/android-manifest-additions.xml');
ck('Android declares camera, microphone, notifications and the exact alarm', ['CAMERA', 'RECORD_AUDIO', 'POST_NOTIFICATIONS', 'SCHEDULE_EXACT_ALARM'].every((p) => am.includes('android.permission.' + p)));
const ap = rd('native/store/APP_PRIVACY.md');
ck('the store privacy answers cover App Store Connect and Play Data safety, and match the manifest', /App Store Connect/.test(ap) && /Data safety/.test(ap) && /Tracking:\*\* none/.test(ap) && /Audio Data/.test(ap));
const cfg = JSON.parse(rd('native/capacitor.config.json')), pkg = JSON.parse(rd('native/package.json'));
ck('the app ships the native sign-in plugin (Google and Apple, credential handed to the web SDK)', !!pkg.dependencies['@capacitor-firebase/authentication'] && cfg.plugins.FirebaseAuthentication.skipNativeAuth === true
  && cfg.plugins.FirebaseAuthentication.providers.join() === 'google.com,apple.com');

/* ---- sign-in inside the app ---- */
const b = await chromium.launch();
const site = await serve(join(root, 'dist'));
async function app(withPlugin) {
  const o = await openPage(b, null, { storage: {} });
  await o.context.addInitScript((wp) => {
    window.__calls = [];
    const P = { signInWithGoogle: (x) => { window.__calls.push(['google', x]); return Promise.resolve({ credential: { idToken: 'g-id', accessToken: 'g-at' } }); },
      signInWithApple: (x) => { window.__calls.push(['apple', x]); return Promise.resolve({ credential: { idToken: 'a-id', nonce: 'n1' } }); } };
    /* any other plugin behaves like one this build does not have: every
       call is refused, the way Capacitor answers for a missing plugin */
    const missing = new Proxy({}, { get: (t, k) => (k === 'then' ? undefined : () => Promise.reject(new Error('not implemented'))) });
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', isPluginAvailable: (n) => wp && n === 'FirebaseAuthentication', registerPlugin: (n) => (n === 'FirebaseAuthentication' && wp ? P : missing), Plugins: {} };
  }, withPlugin);
  await o.page.goto(site.url + '/index.html', { waitUntil: 'load' });
  await o.page.waitForSelector('#afEmail', { timeout: 15000 });
  return o;
}
let o = await app(false);
ck('in an app build without the plugin: email sign-in only, no Google or Apple button that would fail', !(await o.page.$('#authGoogle')) && !(await o.page.$('#authApple')) && !!(await o.page.$('#afSend')));
await o.context.close();

o = await app(true);
const { page, pageErrors } = o;
ck('with the plugin, both Google and Apple are offered (Apple is required when Google is)', !!(await page.$('#authGoogle')) && !!(await page.$('#authApple')));
/* the test pages run without Firebase (harness.mjs answers it with an
   empty file), so the sign-in pieces this flow uses are set up here */
await page.evaluate(() => {
  window.firebase = window.firebase || {};
  firebase.auth = firebase.auth || {};
  firebase.auth.GoogleAuthProvider = { credential: (i, a) => ({ provider: 'google.com', idToken: i, accessToken: a }) };
  firebase.auth.OAuthProvider = function (id) { this.addScope = () => {}; this.credential = (x) => Object.assign({ provider: id }, x); };
  KOVA_FB.ok = true;
  KOVA_FB.auth = { currentUser: null, signInWithCredential: (c) => { window.__cred = c; return Promise.resolve({ user: { uid: 'u9', email: 'sam@example.com', displayName: 'Sam', providerData: [] } }); },
    signInWithPopup: () => { window.__popup = 1; return Promise.reject(new Error('no pop-ups in the app')); }, signInWithRedirect: () => { window.__popup = 1; } };
});
await page.click('#authApple');
if (await page.$('#afYear')) { await page.selectOption('#afYear', String(new Date().getFullYear() - 30)); await page.click('#afAgeGo'); }
await page.waitForFunction(() => window.__cred, null, { timeout: 5000 }).catch(() => {});
const r = await page.evaluate(() => ({ calls: window.__calls, cred: window.__cred, popup: !!window.__popup, err: (document.getElementById('afErr') || {}).textContent || '' }));
ck('Apple opens the phone\'s own sign-in sheet, not a web pop-up', r.calls.length === 1 && r.calls[0][0] === 'apple' && r.calls[0][1].skipNativeAuth === true && !r.popup);
ck('its credential signs in to the same Firebase account (apple.com, id token and nonce)', r.cred && r.cred.provider === 'apple.com' && r.cred.idToken === 'a-id' && r.cred.rawNonce === 'n1');
ck('no page errors', pageErrors.length === 0 || (console.error(pageErrors), false));
await o.context.close();
await b.close(); site.close();
const failed = R.filter((x) => !x[1]);
R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
console.log(`\n${R.length - failed.length}/${R.length} passing`);
process.exit(failed.length ? 1 : 0);
