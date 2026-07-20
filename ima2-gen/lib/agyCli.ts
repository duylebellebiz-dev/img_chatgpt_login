import { existsSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { homedir } from "node:os";

export function agyCommandName(platform = process.platform): string {
  return platform === "win32" ? "agy.cmd" : "agy";
}

export function agyLocalBinCandidates(
  home = homedir(),
  platform = process.platform,
): string[] {
  const command = agyCommandName(platform);
  return [
    join(home, ".local", "bin", command),
    join(home, ".npm-global", "bin", command),
  ];
}

export function resolveAgyBin(
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
  platform = process.platform,
): string {
  if (env.IMA2_AGY_BIN) {
    if (!existsSync(env.IMA2_AGY_BIN)) {
      console.warn(`[ima2-agy] IMA2_AGY_BIN is set to "${env.IMA2_AGY_BIN}" but the file does not exist. Falling back to PATH lookup.`);
    } else {
      return env.IMA2_AGY_BIN;
    }
  }
  return agyLocalBinCandidates(home, platform).find((candidate) => existsSync(candidate))
    ?? agyCommandName(platform);
}

export function buildAgyPathEnv(
  env: NodeJS.ProcessEnv = process.env,
  agyBin = resolveAgyBin(env),
): string {
  const basePath = env.PATH || "";
  if (agyBin === agyCommandName() || agyBin === "agy") return basePath;
  return `${dirname(agyBin)}${delimiter}${basePath}`;
}
