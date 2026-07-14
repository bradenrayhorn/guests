import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function tmux(args: string[]) {
  if (!process.env.TMUX || !process.env.TMUX_PANE) return;

  try {
    await execFileAsync("tmux", args, { timeout: 1000 });
  } catch {
    // Ignore: pi should keep working outside tmux or if tmux is unavailable.
  }
}

async function tmuxFormat(target: string, format: string) {
  if (!process.env.TMUX || !process.env.TMUX_PANE) return undefined;

  try {
    const { stdout } = await execFileAsync(
      "tmux",
      ["display-message", "-p", "-t", target, format],
      { timeout: 1000 },
    );
    return stdout.trim();
  } catch {
    return undefined;
  }
}

async function alertTaskComplete() {
  const pane = process.env.TMUX_PANE;
  if (!pane) return;

  // If the pi window is already selected, there is nothing to notify.
  if ((await tmuxFormat(pane, "#{window_active}")) === "1") return;

  await tmux([
    "set-window-option",
    "-t",
    pane,
    "@pi_complete_message",
    "✓  done",
  ]);

  for (const option of ["window-status-style", "window-status-current-style"]) {
    await tmux(["set-window-option", "-t", pane, option, "fg=colour2,bold"]);
  }
}

export default function (pi: ExtensionAPI) {
  pi.on("agent_settled", async () => {
    await alertTaskComplete();
  });
}
