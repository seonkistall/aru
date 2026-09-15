// Evidence for docs/share-preview-findings.md: a URL fragment never reaches the
// server, so a link scraper cannot see the skin levels in ARU's share URL
// (`/#m=NNN`, lib/share-link.ts). That is what makes a per-result link preview
// structurally impossible while the levels live in the fragment — and it is the
// same property that keeps them off the server.
//
//   node scripts/fragment-probe.mjs
//
// Expected: the query string arrives, the fragment does not.
import { createServer } from "node:http";

const PORT = Number(process.env.FRAGMENT_PROBE_PORT ?? 3199);

const server = createServer((req, res) => {
  console.log(`server received request-target: ${req.url}`);
  res.end("ok");
});

server.listen(PORT, "127.0.0.1", async () => {
  const base = `http://127.0.0.1:${PORT}`;
  for (const url of [`${base}/?m=210`, `${base}/#m=210`, `${base}/studio#m=210`]) {
    console.log(`client asked for:            ${url}`);
    await fetch(url).then((response) => response.text());
  }
  server.close();
});
