// npm run r2:cors — lets the browser upload to and read from the bucket, from APP_URL only.
// Extra origins (for example the local dev address) can be added as arguments.
import { env, loadEnvFiles } from "../env";
import { setBucketCors } from "../lib/r2";

loadEnvFiles();

async function main() {
  const origins = [...new Set([env().APP_URL, ...process.argv.slice(2).map((o) => o.replace(/\/+$/, ""))])];
  try {
    await setBucketCors(origins);
    console.log(`ok  CORS set on ${env().R2_BUCKET} for: ${origins.join(", ")}`);
  } catch (err) {
    const e = err as { name?: string; message?: string };
    console.error(`FAIL  ${e.name}: ${e.message}`);
    console.error(
      "The R2 token may not be allowed to change bucket settings. Either set the CORS policy in the Cloudflare dashboard (bucket > Settings > CORS policy) or use a token with Admin Read & Write.",
    );
    process.exit(1);
  }
}

void main();
