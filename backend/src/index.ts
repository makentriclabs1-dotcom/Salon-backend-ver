import { app } from "./app";
import { runReminderSweep } from "./services/reminder.service";

// This file is the entry point for local development AND for always-on hosts
// like Railway/Render. On Vercel, api/index.ts is used instead (see that file) —
// Vercel never runs this file, so this setInterval only exists where it can
// actually run continuously.
const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Bookwise API listening on port ${port}`);
});

const REMINDER_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
setInterval(runReminderSweep, REMINDER_SWEEP_INTERVAL_MS);
runReminderSweep();
