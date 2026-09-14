import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readdir, stat, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const MAX_SESSION_AGE_MS = 14 * 24 * 60 * 60 * 1000;

function sessionsRoot(): string {
  const agentDir = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
  return process.env.PI_CODING_AGENT_SESSION_DIR || join(agentDir, "sessions");
}

async function sessionFiles(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return [];
    throw error;
  }

  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await sessionFiles(path)));
    } else if (entry.isSymbolicLink()) {
      // Session directories may themselves be symlinks. Never delete symlinked
      // files, since that could remove data outside the sessions directory.
      try {
        if ((await stat(path)).isDirectory()) files.push(...(await sessionFiles(path)));
      } catch (error) {
        if ((error as { code?: string }).code !== "ENOENT") throw error;
      }
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      files.push(path);
    }
  }

  return files;
}

async function pruneSessions(ctx: ExtensionContext): Promise<number> {
  const directory = resolve(sessionsRoot());
  const currentSession = ctx.sessionManager.getSessionFile();
  const currentSessionPath = currentSession ? resolve(currentSession) : undefined;
  const cutoff = Date.now() - MAX_SESSION_AGE_MS;
  let pruned = 0;

  for (const path of await sessionFiles(directory)) {
    if (path === currentSessionPath) continue;

    let modified;
    try {
      modified = await stat(path);
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") continue;
      throw error;
    }

    if (modified.mtimeMs >= cutoff) continue;

    try {
      await unlink(path);
      pruned++;
    } catch (error) {
      if ((error as { code?: string }).code !== "ENOENT") throw error;
    }
  }

  return pruned;
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    try {
      const pruned = await pruneSessions(ctx);
      if (pruned > 0) {
        ctx.ui.notify(
          `Pruned ${pruned} pi session${pruned === 1 ? "" : "s"} older than 14 days.`,
          "info",
        );
      }
    } catch (error) {
      console.error(`Unable to prune old pi sessions: ${String(error)}`);
    }
  });
}
