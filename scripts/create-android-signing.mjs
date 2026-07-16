import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join, resolve } from "node:path";
import { platform } from "node:os";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const envPath = join(root, ".env.android.local");
const keyPath = join(root, "android", "aru-upload.jks");
const jdkRoot = join(root, ".toolchains", "jdk");
const localJdk = existsSync(jdkRoot)
  ? readdirSync(jdkRoot, { withFileTypes: true }).find((entry) => entry.isDirectory())
  : undefined;
const javaHome = process.env.JAVA_HOME || (localJdk ? join(jdkRoot, localJdk.name) : "");
const keytool = join(javaHome, "bin", platform() === "win32" ? "keytool.exe" : "keytool");

const envExists = existsSync(envPath);
const keyExists = existsSync(keyPath);
if (envExists || keyExists) {
  if (envExists && keyExists) {
    console.log("[android-signing] Existing ignored upload key and environment found; nothing was overwritten.");
    process.exit(0);
  }
  console.error("[android-signing] Refusing to continue because only one signing file exists. Restore the missing backup instead of replacing the upload key.");
  process.exit(1);
}
if (!javaHome || !existsSync(keytool)) {
  console.error("[android-signing] JDK 17 keytool not found. Set JAVA_HOME or install the local Android toolchain first.");
  process.exit(1);
}

const storePassword = randomBytes(32).toString("base64url");
const keyPassword = randomBytes(32).toString("base64url");
mkdirSync(join(root, "android"), { recursive: true });

const generated = spawnSync(keytool, [
  "-genkeypair",
  "-keystore", keyPath,
  "-storetype", "JKS",
  "-storepass:env", "ARU_TMP_STORE_PASSWORD",
  "-keypass:env", "ARU_TMP_KEY_PASSWORD",
  "-alias", "aru-upload",
  "-keyalg", "RSA",
  "-keysize", "4096",
  "-validity", "9125",
  "-dname", "CN=ARU Upload, OU=Mobile, O=ARU, L=Seoul, ST=Seoul, C=KR",
], {
  encoding: "utf8",
  env: {
    ...process.env,
    ARU_TMP_STORE_PASSWORD: storePassword,
    ARU_TMP_KEY_PASSWORD: keyPassword,
  },
  windowsHide: true,
});

if (generated.status !== 0 || !existsSync(keyPath)) {
  console.error(`[android-signing] keytool failed: ${(generated.stderr || generated.stdout || "unknown error").trim()}`);
  process.exit(1);
}

const envFile = [
  `ARU_KEYSTORE_PATH=${keyPath.replaceAll("\\", "/")}`,
  `ARU_KEYSTORE_PASSWORD=${storePassword}`,
  "ARU_KEY_ALIAS=aru-upload",
  `ARU_KEY_PASSWORD=${keyPassword}`,
  "",
].join("\n");
writeFileSync(envPath, envFile, { encoding: "utf8", mode: 0o600, flag: "wx" });

// Verify that no accidental empty value was persisted without printing secrets.
const saved = readFileSync(envPath, "utf8");
if (!saved.includes("ARU_KEYSTORE_PASSWORD=") || !saved.includes("ARU_KEY_PASSWORD=")) {
  console.error("[android-signing] The local signing environment was not written correctly.");
  process.exit(1);
}

console.log("[android-signing] Created ignored RSA-4096 upload key and local environment. Back up both files securely before Play enrollment.");
