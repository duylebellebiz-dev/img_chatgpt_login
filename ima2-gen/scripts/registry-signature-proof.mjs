import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function commandName(name) {
  return process.platform === "win32" ? `${name}.cmd` : name;
}

function runNpm(args, cwd) {
  const result = spawnSync(commandName("npm"), args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
    timeout: 120_000,
  });
  if (result.status !== 0) {
    throw new Error(`npm ${args.join(" ")} failed (${result.status})\n${result.stdout || ""}${result.stderr || ""}${result.error?.message || ""}`);
  }
  return result;
}

export function verifyRegistrySignatures({ version, packageName, provenanceType }) {
  const auditDir = mkdtempSync(join(tmpdir(), "ima2-signature-audit-"));
  try {
    writeFileSync(join(auditDir, "package.json"), `${JSON.stringify({
      name: "ima2-signature-audit",
      version: "1.0.0",
      private: true,
      dependencies: { [packageName]: version },
    }, null, 2)}\n`);
    runNpm(["install", "--ignore-scripts", "--no-audit", "--no-fund"], auditDir);
    const audit = JSON.parse(runNpm(["audit", "signatures", "--json", "--include-attestations"], auditDir).stdout);
    const verified = audit.verified?.find((item) => item.name === packageName && item.version === version);
    if (!verified || verified.attestations?.provenance?.predicateType !== provenanceType) {
      throw new Error(`npm Sigstore verification missing for ${packageName}@${version}`);
    }
    if (audit.invalid?.length || audit.missing?.length) {
      throw new Error(`npm signature audit reported invalid=${audit.invalid?.length || 0} missing=${audit.missing?.length || 0}`);
    }
    return true;
  } finally {
    rmSync(auditDir, { recursive: true, force: true });
  }
}
