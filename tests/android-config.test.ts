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
      orientation: "any",
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
    expect(androidManifest).not.toMatch(/<manifest[^>]*\spackage=/s);
  });

  it("does not lock target API 36 devices to portrait", () => {
    const launcher = read("android/app/src/main/java/com/seonkistall/aru/LauncherActivity.java");
    const gradle = read("android/app/build.gradle");

    expect(launcher).not.toMatch(/SCREEN_ORIENTATION_(?:USER_|REVERSE_)?(?:PORTRAIT|LANDSCAPE)/);
    expect(launcher).toContain("SCREEN_ORIENTATION_UNSPECIFIED");
    expect(gradle).toContain("orientation: 'any'");
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
    expect(packageJson.devDependencies["@bubblewrap/cli"]).toBe("1.24.1");
  });

  it("loads release signing only from the environment", () => {
    const gradle = read("android/app/build.gradle");
    const rootGradle = read("android/build.gradle");

    for (const name of [
      "ARU_KEYSTORE_PATH",
      "ARU_KEYSTORE_PASSWORD",
      "ARU_KEY_ALIAS",
      "ARU_KEY_PASSWORD",
    ]) {
      expect(gradle).toContain(`System.getenv('${name}')`);
    }
    expect(gradle).toContain("Missing Android release signing environment");
    expect(gradle).toContain("signingConfig signingConfigs.release");
    expect(gradle).not.toMatch(/storePassword\s+["'][^$]/);
    expect(gradle).not.toMatch(/keyPassword\s+["'][^$]/);
    expect(rootGradle).not.toContain("jcenter()");
    expect(rootGradle.match(/mavenCentral\(\)/g)).toHaveLength(2);
  });
});
