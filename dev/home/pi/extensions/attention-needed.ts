import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { basename } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getTmuxState, markTmuxWindow } from "./lib/tmux";

const execFileAsync = promisify(execFile);

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "attention_needed",
    label: "Attention Needed",
    description: "Notify the user that human attention or action is needed.",
    parameters: Type.Object({
      message: Type.String({
        description: "What the user needs to know or do",
      }),
    }),

    async execute(_id, params, _signal, _onUpdate, ctx) {
      // Set this before invoking vzm-notify so failures still suppress Done ✅.
      pi.events.emit("attention_needed");

      const { windowActive, clientFocused } = await getTmuxState();

      if (!windowActive) {
        await markTmuxWindow("⚠  attn", "fg=colour3,bold");
      }

      if (clientFocused) {
        return {
          content: [{ type: "text", text: "Already visible." }],
          details: {},
        };
      }

      await execFileAsync("vzm-notify", [
        "send",
        "--from",
        `⚠️ pi🤖 ${basename(ctx.cwd)} ⚠️`,
        "--message",
        params.message,
      ]);

      return {
        content: [{ type: "text", text: "Sent." }],
        details: {},
      };
    },
  });
}
