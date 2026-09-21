import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const host = "127.0.0.1";
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const pythonCmd = process.env.PYTHON ?? "python";

const mlFiles = [
  "ml/prepare_crop_dataset.py",
  "ml/train_visible_attributes.py",
  "ml/evaluate_dataset.py",
  "ml/calibrate.py",
  "ml/run_pipeline.py",
  "ml/aru_axes.py",
  "ml/subgroups.py",
  "ml/ita.py",
  "ml/licensing.py",
  "ml/external_manifest.py",
  "ml/model_contract.py",
  "ml/skin_indices.py",
  "ml/ordinal_metrics.py",
  "ml/qwk_noise.py",
  "ml/heuristic_baseline.py",
  "ml/selftest.py",
];

const routeChecks = [
  { method: "GET", path: "/scan", status: 200 },
  { method: "GET", path: "/privacy", status: 200 },
  { method: "GET", path: "/offline.html", status: 200, bodyIncludes: "ARU needs a connection" },
  { method: "GET", path: "/sw.js", status: 200, bodyIncludes: "aru-mediapipe-v1" },
  { method: "GET", path: "/pilot", status: 404 },
  { method: "GET", path: "/ops", status: 404 },
  { method: "GET", path: "/eval", status: 404 },
  { method: "GET", path: "/api/out?sku=tn1&merchant=oliveyoung&placement=smoke", status: 302, redirect: "manual", locationIncludes: "www.oliveyoung.co.kr" },
  { method: "GET", path: "/api/sync", status: 200 },
  // 401 when no sync token is configured; 403 when the env-based origin guard
  // rejects first (local .env.local present). Both mean unauthenticated POSTs
  // are blocked, which is what this check asserts.
  { method: "POST", path: "/api/sync", status: [401, 403] },
  { method: "GET", path: "/api/funnel", status: 200, bodyIncludes: '"maxEvents"', bodyExcludes: '"aggregate"' },
  // The public ingest route, checked from outside the process: a POST with no Origin
  // header did not come from a page fetch, and the origin guard refuses it before the
  // body is read. 403 here is the guard working, not a misconfiguration.
  { method: "POST", path: "/api/funnel", status: 403, headers: { "content-type": "application/json" }, body: "{}" },
];

async function run(command, args) {
  console.log(`\n> ${[command, ...args].join(" ")}`);
  await new Promise((resolve, reject) => {
    const isWindowsCmd = process.platform === "win32" && command.endsWith(".cmd");
    const child = spawn(
      isWindowsCmd ? "C:\\Windows\\System32\\cmd.exe" : command,
      isWindowsCmd ? ["/d", "/s", "/c", command, ...args] : args,
      {
      cwd: rootDir,
      stdio: "inherit",
      shell: false,
      env: process.env,
      }
    );

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function findOpenPort(startPort) {
  for (let port = startPort; port < startPort + 20; port += 1) {
    const available = await new Promise((resolve) => {
      const server = createServer();
      server.once("error", () => resolve(false));
      server.once("listening", () => {
        server.close(() => resolve(true));
      });
      server.listen(port, host);
    });

    if (available) return port;
  }

  throw new Error(`No open smoke-test port found from ${startPort}`);
}

async function waitForServer(baseUrl, child) {
  const deadline = Date.now() + 60_000;
  let lastError = "server did not respond";

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next server exited before smoke checks: ${child.exitCode}`);
    }

    try {
      const response = await fetch(`${baseUrl}/api/sync`, { cache: "no-store" });
      if (response.status === 200) return;
      lastError = `GET /api/sync returned ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await delay(750);
  }

  throw new Error(`Timed out waiting for Next server: ${lastError}`);
}

async function checkRoute(baseUrl, check) {
  const response = await fetch(`${baseUrl}${check.path}`, {
    method: check.method,
    headers: check.headers,
    body: check.body,
    cache: "no-store",
    redirect: check.redirect,
  });

  const expected = Array.isArray(check.status) ? check.status : [check.status];
  if (!expected.includes(response.status)) {
    throw new Error(`${check.method} ${check.path} returned ${response.status}, expected ${expected.join("/")}`);
  }

  if (check.locationIncludes) {
    const location = response.headers.get("location") || "";
    if (!location.includes(check.locationIncludes)) {
      throw new Error(`${check.method} ${check.path} redirected to ${location}, expected ${check.locationIncludes}`);
    }
  }

  if (check.bodyIncludes || check.bodyExcludes) {
    const body = await response.text();
    if (check.bodyIncludes && !body.includes(check.bodyIncludes)) {
      throw new Error(`${check.method} ${check.path} did not include ${check.bodyIncludes}`);
    }
    // Token-gated fields, checked from outside the process rather than only in a unit
    // test: what matters is what the running server actually serves to a caller who
    // presented no credential.
    if (check.bodyExcludes && body.includes(check.bodyExcludes)) {
      throw new Error(`${check.method} ${check.path} leaked ${check.bodyExcludes} without a token`);
    }
  }

  console.log(`ok ${check.method} ${check.path} -> ${response.status}`);
}

async function stopServer(child) {
  if (!child.pid || child.exitCode !== null) return;

  const waitForExit = () => new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve();
      return;
    }
    child.once("exit", resolve);
  });

  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("C:\\Windows\\System32\\taskkill.exe", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        shell: false,
      });
      killer.on("exit", resolve);
      killer.on("error", resolve);
    });
    await Promise.race([waitForExit(), delay(5_000)]);
    return;
  }

  child.kill("SIGTERM");
  await Promise.race([waitForExit(), delay(5_000)]);
}

async function smokeHttp() {
  const port = await findOpenPort(Number(process.env.SMOKE_PORT ?? 3017));
  const baseUrl = `http://${host}:${port}`;
  const nextBin = path.join(rootDir, "node_modules", "next", "dist", "bin", "next");

  console.log(`\n> ${process.execPath} ${nextBin} start -H ${host} -p ${port}`);
  const server = spawn(process.execPath, [nextBin, "start", "-H", host, "-p", String(port)], {
    cwd: rootDir,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    env: process.env,
  });

  let logs = "";
  server.stdout.on("data", (chunk) => {
    logs += chunk.toString();
    if (process.env.SMOKE_VERBOSE) process.stdout.write(chunk);
  });
  server.stderr.on("data", (chunk) => {
    logs += chunk.toString();
    if (process.env.SMOKE_VERBOSE) process.stderr.write(chunk);
  });

  try {
    await waitForServer(baseUrl, server);
    for (const check of routeChecks) {
      await checkRoute(baseUrl, check);
    }
  } catch (error) {
    if (logs.trim()) {
      console.error("\nNext server output:");
      console.error(logs.trim().slice(-4000));
    }
    throw error;
  } finally {
    await stopServer(server);
  }
}

async function main() {
  await run(npmCmd, ["run", "lint"]);
  await run(npmCmd, ["test"]);
  await run(npmCmd, ["run", "test:mobile-ui"]);
  await run(npmCmd, ["run", "build"]);
  await run(pythonCmd, ["-m", "py_compile", ...mlFiles]);
  // py_compile only proves the files parse. selftest.py exercises the rules they
  // enforce — licence tiers, tone bands, fold leakage, adapter spec validation —
  // using the standard library only, so it needs no torch install.
  await run(pythonCmd, ["ml/selftest.py"]);
  await smokeHttp();
  console.log("\nSmoke test passed.");
  process.exit(0);
}

main().catch((error) => {
  console.error(`\nSmoke test failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
