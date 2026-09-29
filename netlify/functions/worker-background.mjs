/* The long jobs: publishing a post to every platform, wellness audits,
   reading traction back. Background functions run for up to 15 minutes
   and answer 202 at once; the api and the timer start this one. */
import admin from 'firebase-admin';
import { getStore } from '@netlify/blobs';
import netlify from '../../functions/netlify.js';

const handler = netlify.makeWorker({ admin, getStore });

export default (request) => handler(request);
