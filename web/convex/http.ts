import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { webhook as telegramWebhook } from "./telegram";

const http = httpRouter();

auth.addHttpRoutes(http);

http.route({
  path: "/telegram/cb",
  method: "POST",
  handler: telegramWebhook,
});

export default http;
