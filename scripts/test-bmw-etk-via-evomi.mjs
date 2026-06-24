// Verify the modified server/scraper.ts module routes bmw-etk.info via Evomi.
// We can't easily import the .ts module directly here, but we CAN re-run the
// underlying helper smoke + add a fresh end-to-end fetch of an actual catalog
// landing page (the same shape server/scraper.ts will call in production).
import { HttpsProxyAgent } from "https-proxy-agent";
import nodeFetch from "node-fetch";

const host = process.env.EVOMI_PROXY_HOST;
const port = process.env.EVOMI_PROXY_PORT;
const user = process.env.EVOMI_PROXY_USERNAME;
const pass = process.env.EVOMI_PROXY_PASSWORD;
if (!host || !port || !user || !pass) { console.error("Evomi not configured"); process.exit(2); }

const url = `https://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`;
const agent = new HttpsProxyAgent(url, { keepAlive: true });

const targets = [
  // Catalog landing page (the same URL pattern server/scraper.ts walks for car detail).
  "https://www.bmw-etk.info/parts-catalog/BMW/A/cat/VT/G80/Lim/M3%20Comp.%20M%20xDrive/ECE/R/N/2020/09/62188/",
  // Discovery page (variant-discovery.ts pattern).
  "https://www.bmw-etk.info/parts-catalog/BMW/A/sm/VT/E63/",
];

let failed = 0;
for (const t of targets) {
  const start = Date.now();
  try {
    const res = await nodeFetch(t, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      agent,
      redirect: "follow",
    });
    const txt = await res.text();
    const title = (txt.match(/<title[^>]*>([^<]+)/i) || [])[1] || "(none)";
    const dur = Date.now() - start;
    const ok = res.ok && txt.length > 1000;
    console.log(`${ok ? "PASS" : "FAIL"}  HTTP ${res.status}  ${txt.length}b  ${dur}ms  title="${title.trim().slice(0,80)}"`);
    console.log(`      url: ${t}`);
    if (!ok) failed++;
  } catch (e) {
    console.error(`FAIL  ${e.message}`); console.error(`      url: ${t}`);
    failed++;
  }
}
process.exit(failed ? 1 : 0);
