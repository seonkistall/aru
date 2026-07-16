import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const input = process.env.ARU_ANDROID_CERT_FINGERPRINTS || "";
const fingerprints = [...new Set(input.split(",").map((value) => {
  const trimmed = value.trim();
  if (!trimmed || !/^[0-9a-f:]+$/i.test(trimmed)) return "";
  const compact = trimmed.replaceAll(":", "").toUpperCase();
  if (compact.length !== 64) return "";
  return compact.match(/.{2}/g).join(":");
}).filter(Boolean))];

if (!fingerprints.length || input.split(",").filter((value) => value.trim()).length !== fingerprints.length) {
  console.error("[assetlinks] ARU_ANDROID_CERT_FINGERPRINTS must contain unique SHA-256 fingerprints in 64-hex or colon format.");
  process.exit(1);
}

const assetlinks = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "com.seonkistall.aru",
      sha256_cert_fingerprints: fingerprints,
    },
  },
];
const output = resolve(import.meta.dirname, "../public/.well-known/assetlinks.json");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(assetlinks, null, 2)}\n`, "utf8");
console.log(`[assetlinks] Wrote ${fingerprints.length} certificate fingerprint(s).`);
