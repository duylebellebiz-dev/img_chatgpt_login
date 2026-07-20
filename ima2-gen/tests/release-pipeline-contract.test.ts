import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildPreviewVersion,
  classifyPublish,
  parsePackOutput,
  validateProvenance,
  validateRemoteRefs,
  verifyArtifactDigest,
} from "../scripts/release-contract.mjs";
import { validateBundleParity, validateInstallPolicy } from "../scripts/check-install-policy.mjs";
import { npmInvocation } from "../scripts/npm-subprocess.mjs";

const SHA = "a".repeat(40);

describe("release channel contract", () => {
  it("accepts only preview branch pushes and matching stable tag pushes", () => {
    const preview = classifyPublish({
      eventName: "push", ref: "refs/heads/preview", sha: SHA,
      packageVersion: "2.0.13", latestVersion: "2.0.13", latestGitHead: SHA,
      runId: "123", runAttempt: "1", date: new Date("2026-07-10T00:00:00Z"),
    });
    assert.equal(preview.version, "2.0.14-preview.260710.123.1");
    assert.deepEqual(
      classifyPublish({
        eventName: "push", ref: "refs/tags/v2.0.14", sha: SHA,
        packageVersion: "2.0.14", latestVersion: "2.0.13", latestGitHead: SHA,
      }),
      { shouldPublish: true, shouldVerify: false, channel: "latest", npmTag: "latest", version: "2.0.14" },
    );
    assert.deepEqual(
      classifyPublish({
        eventName: "push", ref: "refs/tags/v2.0.14", sha: SHA,
        packageVersion: "2.0.14", latestVersion: "2.0.14", latestGitHead: SHA,
      }),
      { shouldPublish: false, shouldVerify: true, channel: "latest", npmTag: "latest", version: "2.0.14" },
    );
    assert.throws(
      () => classifyPublish({
        eventName: "push", ref: "refs/tags/v2.0.12", sha: SHA,
        packageVersion: "2.0.12", latestVersion: "2.0.13", latestGitHead: SHA,
      }),
      /must be newer/,
    );
    assert.throws(() => classifyPublish({ eventName: "workflow_dispatch", ref: "refs/heads/main" }), /unsupported publish event/);
    assert.throws(() => classifyPublish({ eventName: "push", ref: "refs/heads/main" }), /unsupported publish ref/);
    assert.throws(
      () => classifyPublish({ eventName: "push", ref: "refs/tags/v2.0.15", packageVersion: "2.0.14" }),
      /does not match/,
    );
  });

  it("makes same-day runs and reruns immutable-version safe", () => {
    const base = { packageVersion: "2.0.14", latestVersion: "2.0.13", date: new Date("2026-07-10T12:00:00Z") };
    const first = buildPreviewVersion({ ...base, runId: "900", runAttempt: "1" });
    const rerun = buildPreviewVersion({ ...base, runId: "900", runAttempt: "2" });
    const next = buildPreviewVersion({ ...base, runId: "901", runAttempt: "1" });
    assert.equal(new Set([first, rerun, next]).size, 3);
  });

  it("skips a stable-tagged SHA synced back to preview", () => {
    const plan = classifyPublish({
      eventName: "push", ref: "refs/heads/preview", sha: SHA,
      packageVersion: "2.0.14", latestVersion: "2.0.14", latestGitHead: SHA,
      tagsAtHead: ["v2.0.14"], runId: "1", runAttempt: "1",
    });
    assert.equal(plan.shouldPublish, false);
    assert.equal(plan.shouldVerify, false);
  });

  it("requires every live stable ref to identify the preview-proven SHA", () => {
    const refs = { main: SHA, dev: SHA, preview: SHA, "v2.0.14": SHA };
    assert.doesNotThrow(() => validateRemoteRefs({ ref: "refs/tags/v2.0.14", sha: SHA, refs }));
    assert.throws(
      () => validateRemoteRefs({ ref: "refs/tags/v2.0.14", sha: SHA, refs: { ...refs, preview: "b".repeat(40) } }),
      /remote preview/,
    );
  });
});

describe("release artifact and provenance contract", () => {
  it("rejects artifact bytes that differ from the recorded digest", () => {
    const dir = mkdtempSync(join(tmpdir(), "ima2-release-contract-"));
    try {
      const tarball = join(dir, "package.tgz");
      writeFileSync(tarball, "expected");
      const digest = createHash("sha512").update("expected").digest();
      const manifest = { sha512: digest.toString("hex"), integrity: `sha512-${digest.toString("base64")}` };
      assert.doesNotThrow(() => verifyArtifactDigest(manifest, tarball));
      writeFileSync(tarball, "changed");
      assert.throws(() => verifyArtifactDigest(manifest, tarball), /digest mismatch/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("parses only the trailing npm pack manifest after noisy lifecycle output", () => {
    const output = 'build log\n[{"not":"the manifest"}]\nmore output\n[\n  {"filename":"ima2-gen.tgz","bundled":[]}\n]\n';
    assert.equal(parsePackOutput(output).filename, "ima2-gen.tgz");
    const npm12Output = 'lifecycle log\n{\n  "ima2-gen": {"filename":"ima2-gen-12.tgz","bundled":[]}\n}\n';
    assert.equal(parsePackOutput(npm12Output).filename, "ima2-gen-12.tgz");
  });

  it("requires exact workflow, ref, commit, builder, run, and subject digest", () => {
    const statement: any = {
      _type: "https://in-toto.io/Statement/v1",
      predicateType: "https://slsa.dev/provenance/v1",
      subject: [{ name: "pkg:npm/ima2-gen@2.0.14", digest: { sha512: "digest" } }],
      predicate: {
        buildDefinition: {
          buildType: "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1",
          externalParameters: { workflow: { repository: "https://github.com/lidge-jun/ima2-gen", path: ".github/workflows/publish.yml", ref: "refs/tags/v2.0.14" } },
          internalParameters: { github: { event_name: "push" } },
          resolvedDependencies: [{ digest: { gitCommit: SHA } }],
        },
        runDetails: {
          builder: { id: "https://github.com/actions/runner/github-hosted" },
          metadata: { invocationId: "https://github.com/lidge-jun/ima2-gen/actions/runs/1/attempts/1" },
        },
      },
    };
    const identity = validateProvenance(statement, {
      ref: "refs/tags/v2.0.14", sha: SHA, sha512: "digest", version: "2.0.14", runId: "1", runAttempt: "1",
    });
    assert.deepEqual(identity, {
      runId: "1", runAttempt: "1", runUrl: "https://github.com/lidge-jun/ima2-gen/actions/runs/1",
    });
    assert.throws(() => validateProvenance(statement, {
      ref: "refs/tags/v2.0.14", sha: SHA, sha512: "digest", version: "2.0.14", runId: "1", runAttempt: "2",
    }), /invocation mismatch/);
    statement.predicate.buildDefinition.externalParameters.workflow.ref = "refs/heads/preview";
    assert.throws(() => validateProvenance(statement, {
      ref: "refs/tags/v2.0.14", sha: SHA, sha512: "digest", version: "2.0.14", runId: "1", runAttempt: "1",
    }), /source ref mismatch/);
    statement.predicate.buildDefinition.externalParameters.workflow.ref = "refs/tags/v2.0.14";
    statement.predicateType = "https://example.invalid/provenance";
    assert.throws(() => validateProvenance(statement, {
      ref: "refs/tags/v2.0.14", sha: SHA, sha512: "digest", version: "2.0.14", runId: "1", runAttempt: "1",
    }), /predicate type mismatch/);
  });
});

describe("package install policy contract", () => {
  it("preserves Windows npm argument boundaries without a command shell", () => {
    const args = ["install", "C:\\path with spaces\\ima2.tgz", "value&literal"];
    const invocation = npmInvocation(args, {
      platform: "win32",
      nodeExecPath: "C:\\Program Files\\nodejs\\node.exe",
      npmExecPath: "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js",
    });
    assert.equal(invocation.command, "C:\\Program Files\\nodejs\\node.exe");
    assert.deepEqual(invocation.args.slice(1), args);
    assert.match(invocation.args[0], /npm-cli\.js$/);
  });

  it("detects missing install-script approvals and bundle lock drift", () => {
    const lock = { packages: { "": { bundleDependencies: ["progrok"] }, "node_modules/sharp": { version: "1.2.3", hasInstallScript: true } } };
    assert.deepEqual(validateInstallPolicy({ allowScripts: {} }, lock, "root"), ["root: missing allowScripts approval for sharp@1.2.3"]);
    assert.equal(validateInstallPolicy({ allowScripts: { "sharp@1.2.3": true } }, lock, "root").length, 0);
    assert.equal(validateBundleParity({ bundleDependencies: ["progrok", "openai-oauth"] }, lock).length, 1);
  });

  it("keeps executable local release scripts out of npm publish", () => {
    for (const path of ["scripts/release.sh", "scripts/release-preview.sh"]) {
      const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
      const executableLines = source.split("\n").filter((line) => !line.trim().startsWith("#"));
      assert.ok(!executableLines.some((line) => /npm\s+publish/.test(line)), `${path} must not publish locally`);
      if (process.platform !== "win32") {
        assert.ok(statSync(new URL(`../${path}`, import.meta.url)).mode & 0o111, `${path} must remain executable`);
      }
    }
    const workflow = readFileSync(new URL("../.github/workflows/publish.yml", import.meta.url), "utf8");
    assert.doesNotMatch(workflow, /workflow_dispatch|(?:^|\n)\s*release:\s*(?:\n|$)/);
    assert.match(workflow, /branches:\s*\[preview\]/);
    assert.match(workflow, /tags:\s*\['v\*'\]/);
    assert.equal((workflow.match(/id-token:\s*write/g) || []).length, 1, "only publish job may mint OIDC tokens");
    assert.doesNotMatch(workflow, /uses:\s*[^\s]+@v\d/, "release actions must use immutable commit SHAs");
    assert.match(workflow, /verify-artifact release-artifact\/release-manifest\.json/);
    assert.match(workflow, /TARBALL=.*'\.\/release-artifact\/'[\s\S]*npm publish "\$TARBALL"/);
    assert.match(workflow, /verify-existing:/);
    assert.match(workflow, /windows-consumer:/);
    assert.match(workflow, /needs:\s*\[prepare, package, windows-consumer\]/);
    assert.match(workflow, /test:package-global-update/);
    assert.match(workflow, /assert-remote-ref/);
    assert.match(workflow, /id: registry[\s\S]*guard-publish/);
    assert.match(workflow, /if: steps\.registry\.outputs\.should_publish == 'true'[\s\S]*npm publish/);
    assert.match(workflow, /IMA2_EXPECT_CURRENT_PROVENANCE: \$\{\{ steps\.registry\.outputs\.should_publish \}\}/);
    assert.match(workflow, /create-github-release:/);
    assert.match(workflow, /needs:\s*\[prepare, publish\]/);
    assert.match(workflow, /ensure-github-release/);
    assert.match(workflow, /channel == 'latest'/);
    assert.match(workflow, /permissions:[\s\S]*contents:\s*write[\s\S]*id-token:\s*write/);

    const contract = readFileSync(new URL("../scripts/release-contract.mjs", import.meta.url), "utf8");
    assert.match(contract, /export async function ensureGithubRelease/);
    assert.match(contract, /command === "ensure-github-release"/);
    assert.match(contract, /gh.*release create|release", "create"/);

    const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    assert.match(manifest.scripts.prepublishOnly, /assert-publish-context/);

    const release = readFileSync(new URL("../scripts/release.sh", import.meta.url), "utf8");
    const commitIndex = release.indexOf("git commit -m");
    const previewIndex = release.indexOf("./scripts/release-preview.sh");
    const tagIndex = release.indexOf("git tag \"v$VERSION\"");
    assert.ok(commitIndex >= 0 && commitIndex < previewIndex, "release commit must exist before preview");
    assert.ok(previewIndex < tagIndex, "preview proof must finish before stable tag creation");
    assert.match(release, /release\.sh finalize X\.Y\.Z/);
    assert.match(release, /assert-toolchain/);
    assert.match(release, /ensure-github-release/);
    assert.doesNotMatch(release, /gh release create/);
    assert.doesNotMatch(release, /gh run list --workflow=publish\.yml --limit=30/);

    for (const path of ["scripts/install-mac.sh", "scripts/install-linux.sh", "scripts/install-windows.ps1"]) {
      const installer = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
      assert.match(installer, /allow-scripts=ima2-gen,better-sqlite3,sharp/);
      assert.match(installer, /ima2 doctor/);
    }
  });
});
