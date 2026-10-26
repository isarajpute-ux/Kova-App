/* /api/* - every route in functions/api.js, on Netlify.
   See functions/netlify.js for how it is wired. */
import admin from 'firebase-admin';
import { getStore } from '@netlify/blobs';
import netlify from '../../functions/netlify.js';

const handler = netlify.makeApi({ admin, getStore });

export default (request, context) => handler(request, context);
