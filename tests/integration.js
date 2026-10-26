/* Checks the wiring that lives OUTSIDE the backend module: analytics
   hooked to real actions, the settings sync row, and the auth modal not
   carrying the rejected palette. These are string-level assertions on
   purpose - they are about whether the call site exists at all, which is
   precisely what went wrong with saveHealthData(). */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = [];
const ck = (n, c) => R.push([n, !!c]);

ck('screen_view hooked into the router', /function go\(id,opts\)\{[\s\S]{0,520}KovaAnalytics\.screen\(id\)/.test(src));
ck('chat opens are still logged', /screen_name:'chat'/.test(src));
ck('log_food fires on a real meal add', /KovaAnalytics\.track\('log_food'/.test(src));
ck('workout_complete fires on session finish', /KovaAnalytics\.track\('workout_complete'/.test(src));
ck('strength_baseline_saved fires on save', /KovaAnalytics\.track\('strength_baseline_saved'/.test(src));
ck('media_upload fires from KovaMedia', /KovaAnalytics\.track\('media_upload'/.test(src));
ck('login / sign_up / logout instrumented',
   /track\('login'/.test(src) && /track\('sign_up'/.test(src) && /track\('logout'/.test(src));

ck('settings sync host exists in markup', /id="pfSync"/.test(src));
ck('settings paints sync state from KovaCloud', /KovaCloud\.status\(\)/.test(src));
ck('sync-now control wired', /pfSyncNow/.test(src) && /KovaCloud\.pushAll\(\)/.test(src));

ck('auth modal dropped the rejected purple', !/#7B4AE2/.test(src));
ck('auth modal has a google path', /KovaCloudAuth\.google\(\)/.test(src));
ck('auth modal has a guest path', /KovaCloudAuth\.guest\(\)/.test(src));
ck('auth modal surfaces errors', /id="kova-auth-err"/.test(src));
ck('password reset available', /KovaCloudAuth\.reset\(/.test(src));

ck('dead saveHealthData removed', !/function saveHealthData/.test(src));
ck('KP exposes reload', /reload:reload/.test(src));
ck('KovaFuel exposes emit', /emit:function\(\)\{ LIS\.forEach/.test(src));

// the old block initialised firebase then never used it; the new one
// must actually reference the db from the sync layer
ck('cloud layer writes to users/<uid>', /ref\('users\/'\+uid\)/.test(src));
ck('cloud layer stores under /store', /child\('store\/'\+enc\(k\)\)/.test(src));

// KovaMedia had zero call sites when it was first written; guard that
ck('KovaMedia is actually called somewhere', /KovaMedia\.attach\(/.test(src));
ck('avatar no longer stored as a base64 data URL', /indexOf\('data:'\)===0/.test(src));

let pass = 0, fail = 0;
R.forEach(([n, o]) => { console.log((o ? 'PASS' : 'FAIL') + ' - ' + n); o ? pass++ : fail++; });
console.log('\n' + pass + '/' + (pass + fail) + ' passing');
process.exit(fail ? 1 : 0);
