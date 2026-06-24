import { cronJobs } from "convex/server";
import { api, internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "scrape jobs hourly",
  { hours: 1 },
  api.jobs.runAllCollectors,
  {},
);

// Daily 08:00 UTC: nudge users about applications still in `applied`
// status after 7 days. Routes through their Telegram bot if configured.
crons.cron(
  "follow-up reminders",
  "0 8 * * *",
  internal.telegram.sendFollowUpReminders,
  {},
);

// Storage maintenance. Convex free tier is ~0.5 GB DB; these keep the
// long-tail tables bounded so storage stays well under the cap.
crons.cron(
  "prune old jobs",
  "0 3 * * *", // daily 03:00 UTC
  internal.maintenance.pruneOldJobs,
  {},
);
crons.cron(
  "prune old messages",
  "30 3 * * *",
  internal.maintenance.pruneOldMessages,
  {},
);
crons.cron(
  "prune stale sketches",
  "0 4 * * 0", // weekly Sunday 04:00 UTC
  internal.maintenance.pruneStaleSketches,
  {},
);

export default crons;
