import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { platform } from "node:os";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const problems = [];

function problem(name, cause, fix) {
  problems.push({ name, cause, fix });
}

function read(path) {
  const absolute = join(root, path);
  if (!existsSync(absolute)) {
    problem("missing file", `${path} does not exist`, "Regenerate the wrapper with Bubblewrap 1.24.1.");
    return "";
  }
  return readFileSync(absolute, "utf8");
}

function expectValue(condition, name, cause, fix) {
  if (!condition) problem(name, cause, fix);
}

const packageJson = JSON.parse(read("package.json") || "{}");
const twaManifest = JSON.parse(read("android/twa-manifest.json") || "{}");
const gradle = read("android/app/build.gradle");
const androidManifest = read("android/app/src/main/AndroidManifest.xml");
const gitignore = read(".gitignore");

expectValue(twaManifest.packageId === "com.seonkistall.aru", "wrong package", "The TWA package ID changed.", "Restore com.seonkistall.aru before creating the Play app.");
expectValue(twaManifest.host === "aru-beauty.vercel.app", "wrong origin", "The wrapper points at a non-production host.", "Restore aru-beauty.vercel.app.");
expectValue(twaManifest.startUrl === "/", "wrong launch path", "The app no longer opens the consumer entry route.", "Restore startUrl to /.");
expectValue(twaManifest.orientation === "portrait", "wrong orientation", "The wrapper is not portrait-first.", "Restore orientation to portrait.");
expectValue(twaManifest.minSdkVersion === 23, "wrong minimum SDK", "The supported-device floor changed.", "Restore minSdkVersion to 23 and rerun device QA.");
expectValue(twaManifest.appVersion === packageJson.version, "version mismatch", `Android ${twaManifest.appVersion ?? "missing"} differs from package.json ${packageJson.version ?? "missing"}.`, "Update both release versions together.");
expectValue(Number.isInteger(twaManifest.appVersionCode) && twaManifest.appVersionCode >= 11000, "invalid version code", "Android versionCode is missing or lower than the first release.", "Use a monotonically increasing integer, starting at 11000.");
expectValue(twaManifest.enableNotifications === false, "unexpected notification delegation", "The wrapper enables a permission-backed feature ARU does not use.", "Set enableNotifications to false.");
expectValue(twaManifest.fallbackType === "customtabs", "unsafe fallback", "The wrapper fallback is not a browser Custom Tab.", "Set fallbackType to customtabs.");

expectValue(/compileSdk(?:Version)?\s+36/.test(gradle), "wrong compile SDK", "Generated Gradle does not compile against API 36.", "Set compileSdkVersion to 36.");
expectValue(/targetSdk(?:Version)?\s+36/.test(gradle), "wrong target SDK", "Generated Gradle does not target API 36.", "Set targetSdkVersion to 36 before the August 2026 Play deadline.");
expectValue(/minSdk(?:Version)?\s+23/.test(gradle), "Gradle minimum SDK mismatch", "Generated Gradle does not use minSdk 23.", "Set minSdkVersion to 23.");
expectValue(gradle.includes("https://aru-beauty.vercel.app/manifest.webmanifest") && !gradle.includes("127.0.0.1"), "non-production manifest URL", "Generated resources reference a local or different web manifest.", "Regenerate from the production manifest URL.");

const forbiddenPermissions = /READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|READ_MEDIA_|ACCESS_FINE_LOCATION|ACCESS_COARSE_LOCATION|RECORD_AUDIO|READ_CONTACTS|AD_ID/;
expectValue(!forbiddenPermissions.test(androidManifest), "broad Android permission", "The wrapper requests unrelated user data or hardware access.", "Remove the permission and regenerate the merged-manifest evidence.");

for (const required of [
  "android/gradlew.bat",
  "android/gradle/wrapper/gradle-wrapper.jar",
  "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png",
  "android/app/src/main/res/mipmap-xxxhdpi/ic_maskable.png",
]) {
  expectValue(existsSync(join(root, required)), "incomplete wrapper", `${required} is missing.`, "Run Bubblewrap update and keep all generated wrapper sources.");
}

for (const ignored of [".toolchains/", "/.env.android.local", "/android/*.jks", "*.aab", "*.apk"]) {
  expectValue(gitignore.includes(ignored), "missing ignore rule", `${ignored} is not excluded from Git.`, "Restore the Android secret/artifact ignore rules.");
}

const safeRoot = root.replaceAll("\\", "/");
const tracked = spawnSync("git", ["-c", `safe.directory=${safeRoot}`, "ls-files"], { cwd: root, encoding: "utf8" });
if (tracked.status !== 0) {
  problem("Git inspection failed", tracked.stderr.trim() || "git ls-files failed", "Run android:check inside the ARU Git worktree.");
} else {
  const leaked = tracked.stdout.split(/\r?\n/).filter((path) =>
    /(^|\/)\.env\.android\.local$|\.jks$|\.keystore$|\.aab$|\.apk$|(^|\/)\.toolchains\//i.test(path),
  );
  expectValue(leaked.length === 0, "tracked Android secret or artifact", leaked.join(", "), "Remove these files from Git without deleting the local signing backup.");
}

const toolchainsRoot = join(root, ".toolchains");
const detectedJdk = process.env.JAVA_HOME || (() => {
  const jdkRoot = join(toolchainsRoot, "jdk");
  if (!existsSync(jdkRoot)) return "";
  const directory = readdirSync(jdkRoot, { withFileTypes: true }).find((entry) => entry.isDirectory());
  return directory ? join(jdkRoot, directory.name) : "";
})();
const androidSdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(toolchainsRoot, "android-sdk");
const executable = platform() === "win32" ? ".exe" : "";

expectValue(Boolean(detectedJdk) && existsSync(join(detectedJdk, "bin", `java${executable}`)), "JDK 17 missing", "No local Java runtime was found.", "Install JDK 17 or set JAVA_HOME.");
if (detectedJdk && existsSync(join(detectedJdk, "release"))) {
  expectValue(/JAVA_VERSION="17\./.test(readFileSync(join(detectedJdk, "release"), "utf8")), "unsupported JDK", "The configured Java runtime is not JDK 17.", "Point JAVA_HOME at a JDK 17 installation.");
}
expectValue(existsSync(join(androidSdk, "platforms", "android-36", "android.jar")), "Android API 36 missing", "The Android 16 platform is not installed.", "Install platforms;android-36 with sdkmanager.");
expectValue(existsSync(join(androidSdk, "build-tools", "36.0.0", `aapt2${executable}`)), "Build Tools 36 missing", "Android packaging tools are not installed.", "Install build-tools;36.0.0 with sdkmanager.");
expectValue(existsSync(join(androidSdk, "platform-tools", `adb${executable}`)), "ADB missing", "Android platform tools are not installed.", "Install platform-tools with sdkmanager.");

if (problems.length) {
  for (const item of problems) {
    console.error(`[android:check] ${item.name}\n  cause: ${item.cause}\n  fix: ${item.fix}`);
  }
  process.exit(1);
}

console.log(`[android:check] PASS ${twaManifest.packageId} v${twaManifest.appVersion} (${twaManifest.appVersionCode}), target API 36`);
console.log(`[android:check] toolchains ${relative(root, detectedJdk)} | ${relative(root, androidSdk)}`);
