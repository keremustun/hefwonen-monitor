// Cloudflare Worker die elke 5 minuten de GitHub-workflow "check.yml" start.
// GitHub's eigen cron is te onbetrouwbaar (soms uren niks); Cloudflare-cron is stipt.
// Secret GH_TOKEN: fine-grained PAT, alleen repo woning-alerts, Actions: read & write.
const DISPATCH_URL =
  "https://api.github.com/repos/keremustun/woning-alerts/actions/workflows/check.yml/dispatches";

async function dispatch(env) {
  const res = await fetch(DISPATCH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "woning-alerts-trigger",
    },
    body: JSON.stringify({ ref: "main", inputs: { mode: "run" } }),
  });
  if (res.status !== 204) throw new Error(`GitHub dispatch gaf HTTP ${res.status}: ${await res.text()}`);
}

export default {
  async scheduled(_event, env) {
    await dispatch(env);
  },
  async fetch() {
    return new Response("woning-alerts-trigger draait");
  },
};
