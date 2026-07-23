import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function tmux(args: string[]) {
  try {
    await execFileAsync("tmux", args, { timeout: 1000 });
  } catch {
    // Ignore tmux failures so pi can continue normally.
  }
}

async function tmuxFormat(target: string, format: string) {
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

export async function markTmuxWindow(message: string, style: string) {
  const pane = process.env.TMUX_PANE;
  if (!process.env.TMUX || !pane) return;

  await tmux([
    "set-window-option",
    "-t",
    pane,
    "@pi_complete_message",
    message,
  ]);

  for (const option of ["window-status-style", "window-status-current-style"]) {
    await tmux(["set-window-option", "-t", pane, option, style]);
  }
}

export async function getTmuxState() {
  const pane = process.env.TMUX_PANE;
  if (!process.env.TMUX || !pane) {
    return { windowActive: false, clientFocused: false };
  }

  const [windowActive, clientFlags] = await Promise.all([
    tmuxFormat(pane, "#{window_active}"),
    tmuxFormat(pane, "#{client_flags}"),
  ]);

  return {
    windowActive: windowActive === "1",
    clientFocused:
      clientFlags?.split(",").includes("focused") === true,
  };
}
