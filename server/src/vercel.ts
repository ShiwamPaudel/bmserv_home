// Vercel entry: one Node function serving /api/* and /health. Environment values come from Vercel.
import { getRequestListener } from "@hono/node-server";
import { createApp } from "./app";
import { env } from "./env";

env(); // refuses to start, naming any missing value
export default getRequestListener(createApp().fetch);
