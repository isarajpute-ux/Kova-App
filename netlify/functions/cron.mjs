/* Every 5 minutes: scheduled posts, reminders, who is due a wellness
   audit, and (every half hour) traction. The slow parts are handed to
   the background worker; this one must finish in 30 seconds. */
import admin from 'firebase-admin';
import { getStore } from '@netlify/blobs';
import netlify from '../../functions/netlify.js';

const handler = netlify.makeCron({ admin, getStore });

export default async () => {
  const out = await handler();
  console.log('cron', JSON.stringify(out));
};

export const config = { schedule: '*/5 * * * *' };
