import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import { truncateHead, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { loadModelDefaults, loadProfiles, MODEL_SLOTS, resolveAgentModel, runChild, THINKING_LEVELS } from "./lib/subagents.ts";

const TOOL_NAME = "subagent";
const STATE_TYPE = "subagents-state";

export default async function (pi: ExtensionAPI) {
  const profiles = await loadProfiles();
  const models = await loadModelDefaults();
  let enabled = true;
  const active = new Set<AbortController>();

  function updateStatus(ctx: ExtensionContext) {
    const text = `subagents: ${enabled ? "on" : "off"}${active.size ? ` (${active.size} running)` : ""}`;
    ctx.ui.setStatus("subagents", ctx.ui.theme.fg("dim", text));
  }

  function updateActiveTools() {
    const otherTools = pi.getActiveTools().filter((name) => name !== TOOL_NAME);
    pi.setActiveTools(enabled ? [...otherTools, TOOL_NAME] : otherTools);
  }

  function toggle(ctx: ExtensionContext) {
    enabled = !enabled;
    updateActiveTools();
    updateStatus(ctx);
    pi.appendEntry(STATE_TYPE, { enabled });
    ctx.ui.notify(`Subagents ${enabled ? "enabled" : "disabled"}.${!enabled && active.size ? " Running workers will finish." : ""}`, "info");
  }

  function restoreState(ctx: ExtensionContext) {
    enabled = true;
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type !== "custom" || entry.customType !== STATE_TYPE) continue;
      const value = (entry.data as { enabled?: boolean } | undefined)?.enabled;
      if (typeof value === "boolean") enabled = value;
    }
    updateActiveTools();
    updateStatus(ctx);
  }

  pi.on("session_shutdown", async () => {
    for (const controller of active) controller.abort();
  });

  pi.registerTool({
    name: TOOL_NAME,
    label: "Subagent",
    description: [
      "Delegate one self-contained task to a named Pi worker with fresh context. Only its final report is returned.",
      "Runs in the foreground, shares the filesystem, and can edit files if its profile permits it. No parent conversation is inherited.",
      "Models must be explicitly configured: call override, then profile model or shared slot (capable if omitted). No parent-model fallback. Thinking defaults to the profile, then parent session. Available profiles:",
      ...profiles.map((profile) => {
        const model = profile.model ?? "capable";
        const configured = MODEL_SLOTS.includes(model as typeof MODEL_SLOTS[number])
          ? `${model}: ${models[model as typeof MODEL_SLOTS[number]] ?? "not configured"}` : model;
        return `- ${profile.name}: ${profile.description} [model: ${configured}]`;
      }),
    ].join("\n"),
    promptSnippet: "Delegate bounded research, implementation, or independent review to an isolated worker",
    promptGuidelines: [
      "Use subagent when independent review, specialization, parallel work, or keeping substantial exploration out of your context justifies delegation. Work directly on trivial tasks.",
      "Give each subagent a self-contained task, relevant background, clear scope, and a specific deliverable. It does not see your conversation.",
      "Workers share your filesystem. Do not run overlapping edits concurrently, including your own edits. Give parallel workers distinct file ownership.",
      "Treat subagent reports as advisory. Evaluate findings and verify important changes; do not assume a successful tool call proves correctness.",
    ],
    parameters: Type.Object({
      task: Type.String({ minLength: 1, description: "Self-contained task, background, scope, and desired report" }),
      agent: Type.Optional(StringEnum(profiles.map((profile) => profile.name), {
        description: "Agent profile; defaults to worker",
      })),
      cwd: Type.Optional(Type.String({ minLength: 1, description: "Working directory; relative paths resolve from the parent cwd. Defaults to parent cwd" })),
      model: Type.Optional(Type.String({ minLength: 1, description: "Override model (prefer provider/model), or shared slot fast/capable; otherwise use profile's configured model slot" })),
      thinking: Type.Optional(StringEnum(THINKING_LEVELS, { description: "Override thinking level" })),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      if (!enabled) throw new Error("Subagents are disabled. Enable them with /subagents.");
      const profile = profiles.find((item) => item.name === (params.agent ?? "worker"));
      if (!profile) throw new Error(`Unknown agent: ${params.agent}`);
      if (!params.task.trim()) throw new Error("Task must not be blank.");
      if (params.model !== undefined && !params.model.trim()) throw new Error("Model must not be blank.");
      const model = resolveAgentModel(params.model?.trim() ?? profile.model ?? "capable", models);
      const thinking = params.thinking ?? profile.thinking ?? pi.getThinkingLevel();
      const cwd = resolve(ctx.cwd, params.cwd === "~" ? homedir() :
        params.cwd?.startsWith("~/") ? join(homedir(), params.cwd.slice(2)) : params.cwd ?? ".");
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
      active.add(controller);
      let promptDir: string | undefined;
      try {
        updateStatus(ctx);
        promptDir = await mkdtemp(join(tmpdir(), "pi-subagent-prompt-"));
        const promptPath = join(promptDir, "system.md");
        await writeFile(promptPath, `You are a delegated worker with no parent conversation. Complete only the assigned task.\nUnless the profile below specifies a different report format, finish with a concise report of findings or changes, verification performed, and any uncertainty or unfinished work.\n\n${profile.prompt}\n`, { mode: 0o600 });
        const args = [
          "--print", "--mode", "json", "--no-session", "--no-extensions",
          "--no-skills", "--no-prompt-templates", "--no-context-files", "--no-approve",
          "--thinking", thinking, "--append-system-prompt", promptPath,
        ];
        args.push("--model", model);
        if (profile.tools.length) args.push("--tools", profile.tools.join(","));
        else args.push("--no-tools");
        const details = { agent: profile.name, model, thinking, cwd };
        const progress = (text: string) => onUpdate?.({
          content: [{ type: "text", text: `${profile.name}: ${text}` }], details,
        });
        progress("Starting...");
        const result = await runChild(args, params.task, cwd, controller.signal, progress);
        const report = [result.error ? `Subagent failed: ${result.error}` : undefined, result.output].filter(Boolean).join("\n\n");
        const truncated = truncateHead(report, { maxBytes: 12000, maxLines: 300 });
        let outputPath: string | undefined;
        if (truncated.truncated) {
          const reportDir = await mkdtemp(join(tmpdir(), "pi-subagent-report-"));
          outputPath = join(reportDir, "report.md");
          await writeFile(outputPath, report, { mode: 0o600 });
        }
        return {
          content: [{ type: "text", text: `${profile.name} (${result.turns} turns)\n\n${truncated.content}${outputPath ? `\n\n[Report truncated. Full report: ${outputPath}]` : ""}` }],
          details: { ...details, turns: result.turns, outputPath },
          usage: result.usage,
          isError: result.error !== undefined,
        };
      } finally {
        signal?.removeEventListener("abort", abort);
        active.delete(controller);
        if (promptDir) await rm(promptDir, { recursive: true, force: true });
        updateStatus(ctx);
      }
    },
  });

  pi.registerCommand("subagents", {
    description: "Toggle subagents for this session (on by default)",
    handler: async (_args, ctx) => toggle(ctx),
  });
  pi.registerShortcut("ctrl+alt+s", {
    description: "Toggle subagents",
    handler: async (ctx) => toggle(ctx),
  });
  pi.on("session_start", async (_event, ctx) => restoreState(ctx));
  pi.on("session_tree", async (_event, ctx) => restoreState(ctx));
}
