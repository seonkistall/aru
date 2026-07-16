import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Android Trusted Web Activity configuration", () => {
  it("pins the immutable package and production web origin", () => {
    const manifest = JSON.parse(read("android/twa-manifest.json"));

    expect(manifest).toMatchObject({
      packageId: "com.seonkistall.aru",
      host: "aru-beauty.vercel.app",
      startUrl: "/",
      orientation: "portrait",
      minSdkVersion: 23,
      appVersion: "1.1.0",
      appVersionCode: 11000,
    });
  });

  it("targets Android 16 and requests no unrelated permission", () => {
    const gradle = read("android/app/build.gradle");
    const androidManifest = read("android/app/src/main/AndroidManifest.xml");

    expect(gradle).toMatch(/compileSdk(?:Version)?\s+36/);
    expect(gradle).toMatch(/targetSdk(?:Version)?\s+36/);
    expect(gradle).toMatch(/minSdk(?:Version)?\s+23/);
    expect(androidManifest).not.toMatch(
      /READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|READ_MEDIA_|ACCESS_FINE_LOCATION|ACCESS_COARSE_LOCATION|RECORD_AUDIO|READ_CONTACTS|AD_ID/,
    );
  });

  it("keeps generated resources reproducible and local secrets out of Git", () => {
    const gradle = read("android/app/build.gradle");
    const gitignore = read(".gitignore");
    const packageJson = JSON.parse(read("package.json"));

    expect(gradle).toContain("name: 'ARU 아루'");
    expect(gradle).toContain(
      "resValue \"string\", \"webManifestUrl\", 'https://aru-beauty.vercel.app/manifest.webmanifest'",
    );
    expect(gradle).not.toContain("127.0.0.1");
    expect(gitignore).toContain("/.env.android.local");
    expect(gitignore).toContain("/android/*.jks");
    expect(gitignore).toContain("*.aab");
    expect(gitignore).toContain("*.apk");
    expect(packageJson.scripts["android:check"]).toBe("node scripts/android-check.mjs");
  });
});
