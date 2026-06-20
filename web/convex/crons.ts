import { cronJobs } from "convex/server";
import { api } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "scrape jobs hourly",
  { hours: 1 },
  api.jobs.runAllCollectors,
  {},
);

export default crons;
