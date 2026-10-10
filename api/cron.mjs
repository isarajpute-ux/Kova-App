/* /api/cron - the timer: scheduled posts, reminders, who is due an
   audit, AI-team routines. GitHub Actions calls it every 5 minutes
   (.github/workflows/timer.yml) and Vercel's own timer once a day; both
   send CRON_SECRET. See functions/vercel.js. */
import admin from 'firebase-admin';
import vercel from '../functions/vercel.js';

const handler = vercel.makeCron({ admin });

export default { fetch: (request) => handler(request) };
