import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { basename } from "node:path";
import { getTmuxState, markTmuxWindow } from "./lib/tmux";

const execFileAsync = promisify(execFile);

async function notifyTaskComplete() {
  try {
    await execFileAsync("vzm-notify", [
      "send",
      "--from",
      `pi🤖 ${basename(process.cwd())}`,
      "--message",
      "Done ✅",
    ]);
  } catch {
    // Ignore notification failures so pi can keep working.
  }
}

export default function (pi: ExtensionAPI) {
  let attentionNeeded = false;

  pi.events.on("attention_needed", () => {
    attentionNeeded = true;
  });

  pi.on("agent_settled", async () => {
    if (attentionNeeded) {
      attentionNeeded = false;
      return;
    }

    const { windowActive, clientFocused } = await getTmuxState();

    await Promise.all([
      windowActive
        ? undefined
        : markTmuxWindow("✓  done", "fg=colour2,bold"),
      clientFocused ? undefined : notifyTaskComplete(),
    ]);
  });
}
