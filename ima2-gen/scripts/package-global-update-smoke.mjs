import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";

import { spawnNpmSync } from "./npm-subprocess.mjs";
import { parsePackOutput } from "./release-artifact-contract.mjs";

function commandOptions(options = {}) {
  return {
    encoding: "utf8",
    ...options,
    env: {
      ...process.env,
      npm_config_loglevel: "error",
      ...(options.env || {}),
    },
  };
}

function assertSuccess(result, label) {
  assert.equal(
    result.status,
    0,
    `${label} failed\nerror:\n${result.error?.message || ""}\nstdout:\n${result.stdout || ""}\nstderr:\n${result.stderr || ""}`,
  );
  return result;
}

function run(command, args, options = {}) {
  return assertSuccess(spawnSync(command, args, commandOptions(options)), `${command} ${args.join(" ")}`);
}

function runNpm(args, options = {}) {
  return assertSuccess(spawnNpmSync(args, commandOptions(options)), `npm ${args.join(" ")}`);
}

function npmMajor() {
  return Number(runNpm(["--version"]).stdout.trim().split(".")[0]);
}

function installGlobal(prefix, spec) {
  const args = ["install", "--global", "--prefix", prefix, spec];
  if (npmMajor() >= 12) args.push("--allow-scripts=ima2-gen,better-sqlite3,sharp");
  runNpm(args);
}

function candidateTarball(root) {
  if (process.env.IMA2_PACKAGE_TARBALL) {
    assert.equal(existsSync(process.env.IMA2_PACKAGE_TARBALL), true);
    return process.env.IMA2_PACKAGE_TARBALL;
  }
  const packDir = join(root, "pack");
  mkdirSync(packDir, { recursive: true });
  const packed = runNpm(["pack", "--json", "--pack-destination", packDir], { cwd: process.cwd() });
  return join(packDir, parsePackOutput(packed.stdout).filename);
}

function assertPackagedZod(prefix) {
  const globalRoot = runNpm(["root", "--global", "--prefix", prefix]).stdout.trim();
  const packageRoot = join(globalRoot, "ima2-gen");
  const installedRequire = createRequire(join(packageRoot, "package.json"));
  const zodRoot = realpathSync(join(packageRoot, "node_modules", "zod"));
  const zodV4Entry = realpathSync(installedRequire.resolve("zod/v4"));
  assert.ok(
    zodV4Entry.startsWith(`${zodRoot}${sep}`),
    `zod/v4 should resolve from the packaged ima2-gen tree: ${zodV4Entry}`,
  );
  return packageRoot;
}

function runGlobalShim(prefix, args, options = {}) {
  const shim = process.platform === "win32" ? join(prefix, "ima2.cmd") : join(prefix, "bin", "ima2");
  assert.equal(existsSync(shim), true, `global ima2 shim should exist: ${shim}`);
  return assertSuccess(
    spawnSync(shim, args, commandOptions({ ...options, shell: process.platform === "win32" })),
    `${shim} ${args.join(" ")}`,
  );
}

function main() {
  const root = mkdtempSync(join(tmpdir(), "ima2-global-update-"));
  const prefix = join(root, "prefix");
  const home = join(root, "home");
  const config = join(root, "config");
  const unrelatedCwd = join(root, "unrelated cwd");
  try {
    mkdirSync(join(home, ".codex"), { recursive: true });
    mkdirSync(config, { recursive: true });
    mkdirSync(unrelatedCwd, { recursive: true });
    writeFileSync(join(config, "config.json"), JSON.stringify({ provider: "oauth" }));

    const tarball = candidateTarball(root);
    const cleanPrefix = join(root, "clean-prefix");
    installGlobal(cleanPrefix, tarball);
    assertPackagedZod(cleanPrefix);

    const baseline = process.env.IMA2_UPDATE_BASELINE || "ima2-gen@latest";
    installGlobal(prefix, baseline);
    const baselineVersion = runGlobalShim(prefix, ["--version"], { cwd: unrelatedCwd }).stdout.trim();

    installGlobal(prefix, tarball);
    const packageRoot = assertPackagedZod(prefix);
    const cliPath = join(packageRoot, "bin", "ima2.js");
    const installed = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
    const installedRequire = createRequire(join(packageRoot, "package.json"));
    const codexManifestPath = installedRequire.resolve("@openai/codex/package.json");
    const codexManifest = JSON.parse(readFileSync(codexManifestPath, "utf8"));
    const codexBin = join(dirname(codexManifestPath), codexManifest.bin.codex);

    const env = {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      CODEX_HOME: join(home, ".codex"),
      IMA2_CONFIG_DIR: config,
      IMA2_GENERATED_DIR: join(root, "generated"),
      IMA2_DB_PATH: join(config, "sessions.db"),
      IMA2_ADVERTISE_FILE: join(config, "server.json"),
      PATH: "",
    };
    const codexStatus = spawnSync(process.execPath, [codexBin, "login", "status"], commandOptions({
      cwd: unrelatedCwd,
      env,
    }));
    assert.equal(codexStatus.error, undefined);
    assert.equal(codexStatus.status, 1);
    assert.match(`${codexStatus.stdout}\n${codexStatus.stderr}`, /Not logged in/i);
    const status = run(process.execPath, [cliPath, "status"], { cwd: unrelatedCwd, env });
    assert.doesNotMatch(status.stdout, /codex CLI not found/i);
    assert.match(status.stdout, /not logged in/i);
    const doctor = spawnSync(process.execPath, [cliPath, "doctor"], commandOptions({ cwd: unrelatedCwd, env }));
    assert.equal(doctor.status, 1, "doctor should fail when OAuth is configured without a file-backed session");
    assert.match(doctor.stdout, /runtime dependencies resolvable/i);
    assert.match(doctor.stdout, /no file-backed Codex session/i);

    const updatedVersion = runGlobalShim(prefix, ["--version"], { cwd: unrelatedCwd }).stdout.trim();
    assert.equal(updatedVersion, installed.version);
    console.log(JSON.stringify({ baselineVersion, updatedVersion, packageRoot, oauthProbe: "unauthed" }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

main();
