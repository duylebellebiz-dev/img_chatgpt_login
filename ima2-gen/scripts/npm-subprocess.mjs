import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

export function npmInvocation(args, options = {}) {
  const platform = options.platform ?? process.platform;
  const nodeExecPath = options.nodeExecPath ?? process.execPath;
  const npmExecPath = options.npmExecPath !== undefined ? options.npmExecPath : process.env.npm_execpath;
  const pathExists = options.pathExists ?? existsSync;

  if (npmExecPath) return { command: nodeExecPath, args: [npmExecPath, ...args] };
  if (platform !== "win32") return { command: "npm", args };

  const adjacentCli = join(dirname(nodeExecPath), "node_modules", "npm", "bin", "npm-cli.js");
  if (!pathExists(adjacentCli)) {
    throw new Error("npm-cli.js could not be resolved on Windows; run this command through an npm script");
  }
  return { command: nodeExecPath, args: [adjacentCli, ...args] };
}

export function spawnNpmSync(args, options = {}) {
  const invocation = npmInvocation(args);
  return spawnSync(invocation.command, invocation.args, {
    ...options,
    shell: false,
  });
}
