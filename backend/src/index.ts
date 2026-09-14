```ts
import { app } from "./app";
import { runReminderSweep } from "./services/reminder.service";

/**
 * Bookwise Backend
 *
 * This file is used for:
 * - Local development
 * - Railway
 * - Render
 * - Other always-on Node.js hosting
 *
 * Vercel uses /api/index.ts instead.
 */

const port = Number(process.env.PORT) || 4000;

// Start the Express server
app.listen(port, () => {
  console.log(`Bookwise API listening on port ${port}`);
});

/**
 * Reminder System
 *
 * Run the reminder sweep every 5 minutes.
 *
 * This is suitable for always-on hosting such as
 * Railway or Render.
 *
 * Vercel should use a Cron Job instead because
 * serverless functions are not continuously running.
 */

const REMINDER_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

// Run once when the server starts
runReminderSweep().catch((error) => {
  console.error("Initial reminder sweep failed:", error);
});

// Run every 5 minutes
setInterval(() => {
  runReminderSweep().catch((error) => {
    console.error("Reminder sweep failed:", error);
  });
}, REMINDER_SWEEP_INTERVAL_MS);
```


