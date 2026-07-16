import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Android Digital Asset Links", () => {
  it("delegates the production origin to the immutable ARU package", () => {
    const path = "public/.well-known/assetlinks.json";
    expect(existsSync(path)).toBe(true);
    const assetlinks = JSON.parse(readFileSync(path, "utf8"));
    const twaManifest = JSON.parse(readFileSync("android/twa-manifest.json", "utf8"));

    expect(assetlinks).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "com.seonkistall.aru",
          sha256_cert_fingerprints: expect.arrayContaining([
            expect.stringMatching(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/),
          ]),
        },
      },
    ]);
    expect(twaManifest.fingerprints.map(({ value }: { value: string }) => value)).toEqual(
      assetlinks[0].target.sha256_cert_fingerprints,
    );
  });

  it("keeps the fingerprint writer and signing inputs separated", () => {
    const writer = readFileSync("scripts/write-assetlinks.mjs", "utf8");
    const signing = readFileSync("scripts/create-android-signing.mjs", "utf8");

    expect(writer).toContain("ARU_ANDROID_CERT_FINGERPRINTS");
    expect(writer).toContain("com.seonkistall.aru");
    expect(signing).toContain("randomBytes");
    expect(signing).toContain("aru-upload.jks");
    expect(signing).not.toMatch(/console\.log\([^)]*password/i);
  });
});
