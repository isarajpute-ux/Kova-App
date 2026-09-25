/* Netlify Function entry. Everything under /api/* lands here.
   Firebase Admin is initialised once per warm container from the
   FIREBASE_SERVICE_ACCOUNT env var (the JSON key, raw or base64). */
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { createApp } from '../../server/app.mjs';
import { firebaseStore } from '../../server/store.mjs';

const DEFAULT_DB = 'https://kova-ee9d5-default-rtdb.firebaseio.com';
let handler;

function serviceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  return JSON.parse(text);
}

function build() {
  const env = process.env;
  const sa = serviceAccount();
  let store = null, auth = null;
  if (sa) {
    const app = getApps()[0] || initializeApp({ credential: cert(sa), databaseURL: env.FIREBASE_DATABASE_URL || DEFAULT_DB });
    store = firebaseStore(getDatabase(app));
    auth = getAuth(app);
  }
  return createApp({
    env,
    store,
    fetch: globalThis.fetch,
    async verifyIdToken(tok) {
      if (!auth) throw new Error('auth not configured');
      const d = await auth.verifyIdToken(tok);
      return { uid: d.uid, email: d.email || '', anonymous: d.firebase && d.firebase.sign_in_provider === 'anonymous' };
    },
    users: {
      async findOrCreateByEmail(email) {
        try {
          const u = await auth.getUserByEmail(email);
          return { uid: u.uid, name: u.displayName || '' };
        } catch (e) {
          if (e.code !== 'auth/user-not-found') throw e;
          const u = await auth.createUser({ email, emailVerified: true });
          return { uid: u.uid, name: '' };
        }
      },
      customToken: uid => auth.createCustomToken(uid)
    }
  });
}

export default async (req) => {
  if (!handler) handler = build();
  return handler(req);
};

export const config = { path: '/api/*' };
