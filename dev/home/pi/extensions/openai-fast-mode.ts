import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";

const STATUS_KEY = "zz-openai-fast-mode";
const OPENAI_PROVIDERS = new Set(["openai", "openai-codex"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export default function (pi: ExtensionAPI) {
  let enabled = false;

  function updateStatus(ctx: ExtensionContext) {
    const text = `fast: ${enabled ? "on" : "off"}`;
    ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("dim", text));
  }

  function toggle(ctx: ExtensionContext) {
    enabled = !enabled;
    updateStatus(ctx);
    ctx.ui.notify(`OpenAI Fast Mode ${enabled ? "enabled" : "disabled"}.`, "info");
  }

  pi.registerCommand("fast", {
    description: "Toggle OpenAI Fast Mode for this session",
    handler: async (_args, ctx) => toggle(ctx),
  });

  pi.registerShortcut(Key.ctrl("f"), {
    description: "Toggle OpenAI Fast Mode",
    handler: async (ctx) => toggle(ctx),
  });

  pi.on("session_start", async (_event, ctx) => updateStatus(ctx));

  pi.on("before_provider_request", (event, ctx) => {
    if (!enabled || !OPENAI_PROVIDERS.has(ctx.model?.provider ?? "") || !isRecord(event.payload)) {
      return;
    }

    return { ...event.payload, service_tier: "priority" };
  });
}
