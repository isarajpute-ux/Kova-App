/* /api/* - every route in functions/api.js, on Vercel.
   vercel.json rewrites /api/anything here as /api/index?__p=/anything.
   See functions/vercel.js for how it is wired. */
import admin from 'firebase-admin';
import { waitUntil } from '@vercel/functions';
import vercel from '../functions/vercel.js';

const handler = vercel.makeApi({ admin, waitUntil });

export default { fetch: (request) => handler(request) };
