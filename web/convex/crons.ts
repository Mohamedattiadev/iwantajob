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

export default crons;
