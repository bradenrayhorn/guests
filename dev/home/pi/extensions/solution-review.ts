import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  truncateHead,
} from "@earendil-works/pi-coding-agent";
import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { Type } from "typebox";

const TOOL_NAME = "review_solution";
const STATE_TYPE = "solution-review-state";
const MAX_REVIEW_CYCLES = 3;
const THINKING_LEVELS = new Set(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
const REVIEWER_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

const CONFIG_PATH_PARTS = ["config", "extensions", "solution-review"] as const;

type ReviewReport = {
  name: string;
  output: string;
  error: boolean;
};

type Reviewer = {
  name: string;
  prompt: string;
};

type ReviewerConfig = {
  model: string;
  thinking: string;
  reviewers: Reviewer[];
};

type Settings = {
  model?: unknown;
  thinking?: unknown;
};

function solutionReviewConfigDir(): string {
  const agentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
  return join(agentDir, ...CONFIG_PATH_PARTS);
}

function isMissingFile(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "ENOENT";
}

async function readText(path: string, optional = false): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (optional && isMissingFile(error)) return undefined;
    throw new Error(`Cannot read solution review config at ${path}: ${String(error)}`);
  }
}

async function readSettings(path: string, optional = false): Promise<Settings | undefined> {
  const contents = await readText(path, optional);
  if (contents === undefined) return undefined;

  let settings: unknown;
  try {
    settings = JSON.parse(contents);
  } catch (error) {
    throw new Error(`Invalid JSON in solution review config at ${path}: ${String(error)}`);
  }

  if (settings === null || typeof settings !== "object" || Array.isArray(settings)) {
    throw new Error(`Solution review config at ${path} must be a JSON object.`);
  }

  const unknownKeys = Object.keys(settings).filter((key) => key !== "model" && key !== "thinking");
  if (unknownKeys.length > 0) {
    throw new Error(`Solution review config at ${path} has unknown settings: ${unknownKeys.join(", ")}.`);
  }

  return settings as Settings;
}

function validateSettings(settings: Settings, path: string, requireAll: boolean): void {
  if (requireAll && settings.model === undefined) {
    throw new Error(`Solution review defaults at ${path} must define "model".`);
  }
  if (requireAll && settings.thinking === undefined) {
    throw new Error(`Solution review defaults at ${path} must define "thinking".`);
  }
  if (
    settings.model !== undefined &&
    (typeof settings.model !== "string" || settings.model.trim() === "")
  ) {
    throw new Error(`Solution review config at ${path} has an invalid "model" value.`);
  }
  if (
    settings.thinking !== undefined &&
    (typeof settings.thinking !== "string" || !THINKING_LEVELS.has(settings.thinking))
  ) {
    throw new Error(
      `Solution review config at ${path} has an invalid "thinking" value. ` +
        `Use one of: ${[...THINKING_LEVELS].join(", ")}.`,
    );
  }
}

async function loadReviewerConfig(): Promise<ReviewerConfig> {
  const configDir = solutionReviewConfigDir();
  const defaultsDir = join(configDir, "defaults");
  const overridesDir = join(configDir, "overrides");
  const defaultSettingsPath = join(defaultsDir, "settings.json");
  const overrideSettingsPath = join(overridesDir, "settings.json");

  const defaultSettings = (await readSettings(defaultSettingsPath))!;
  const overrideSettings = (await readSettings(overrideSettingsPath, true)) ?? {};
  validateSettings(defaultSettings, defaultSettingsPath, true);
  validateSettings(overrideSettings, overrideSettingsPath, false);

  let defaultEntries: Dirent[];
  try {
    defaultEntries = await readdir(defaultsDir, { withFileTypes: true });
  } catch (error) {
    throw new Error(`Cannot list solution review defaults at ${defaultsDir}: ${String(error)}`);
  }

  const promptFiles = defaultEntries
    .filter((entry) => entry.name.endsWith(".md") && (entry.isFile() || entry.isSymbolicLink()))
    .map((entry) => entry.name)
    .sort();
  if (promptFiles.length === 0) {
    throw new Error(`No solution reviewer prompts were found in ${defaultsDir}.`);
  }

  let overrideEntries: Dirent[];
  try {
    overrideEntries = await readdir(overridesDir, { withFileTypes: true });
  } catch (error) {
    if (!isMissingFile(error)) {
      throw new Error(`Cannot list solution review overrides at ${overridesDir}: ${String(error)}`);
    }
    overrideEntries = [];
  }

  const promptFileSet = new Set(promptFiles);
  const unknownOverrides = overrideEntries
    .filter((entry) => entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .filter((name) => !promptFileSet.has(name));
  if (unknownOverrides.length > 0) {
    throw new Error(
      `Unknown solution reviewer prompt overrides in ${overridesDir}: ${unknownOverrides.join(", ")}.`,
    );
  }

  const reviewers = await Promise.all(
    promptFiles.map(async (filename): Promise<Reviewer> => {
      const name = filename.slice(0, -".md".length);
      if (!REVIEWER_NAME_PATTERN.test(name)) {
        throw new Error(`Invalid solution reviewer filename: ${join(defaultsDir, filename)}.`);
      }

      const defaultPath = join(defaultsDir, filename);
      const overridePath = join(overridesDir, filename);
      const defaultPrompt = (await readText(defaultPath))!.trim();
      const overridePrompt = (await readText(overridePath, true))?.trim();
      if (defaultPrompt === "") {
        throw new Error(`Solution reviewer prompt at ${defaultPath} is empty.`);
      }
      if (overridePrompt === "") {
        throw new Error(`Solution reviewer prompt override at ${overridePath} is empty.`);
      }

      return { name, prompt: overridePrompt ?? defaultPrompt };
    }),
  );

  return {
    model: (overrideSettings.model ?? defaultSettings.model) as string,
    thinking: (overrideSettings.thinking ?? defaultSettings.thinking) as string,
    reviewers,
  };
}

async function runReviewer(
  pi: ExtensionAPI,
  reviewer: Reviewer,
  config: ReviewerConfig,
  task: string,
  cwd: string,
  signal: AbortSignal | undefined,
): Promise<ReviewReport> {
  const result = await pi.exec(
    "pi",
    [
      "--print",
      "--mode",
      "text",
      "--no-session",
      "--no-extensions",
      "--no-skills",
      "--no-prompt-templates",
      "--no-context-files",
      "--model",
      config.model,
      "--thinking",
      config.thinking,
      "--tools",
      "read,bash,grep,find,ls",
      "--append-system-prompt",
      reviewer.prompt,
      `The implementing agent believes the solution is finished. Review the current implementation for this task:\n\n${task}`,
    ],
    { cwd, signal },
  );

  const output = result.stdout.trim();
  if (result.code !== 0 || result.killed || output === "") {
    return {
      name: reviewer.name,
      output: result.stderr.trim() || output || "Reviewer produced no output.",
      error: true,
    };
  }

  return { name: reviewer.name, output, error: false };
}

function formatReports(reports: ReviewReport[]): string {
  return reports
    .map((report) => `## ${report.name}${report.error ? " (failed)" : ""}\n\n${report.output}`)
    .join("\n\n");
}

export default function (pi: ExtensionAPI) {
  let enabled = false;
  let running = false;
  let reviewCycles = 0;

  function updateStatus(ctx: ExtensionContext) {
    const text = running
      ? `reviews: running ${reviewCycles}/${MAX_REVIEW_CYCLES}`
      : enabled && reviewCycles >= MAX_REVIEW_CYCLES
        ? `reviews: limit ${reviewCycles}/${MAX_REVIEW_CYCLES}`
        : enabled
          ? "reviews: on"
          : "reviews: off";
    ctx.ui.setStatus("solution-review", ctx.ui.theme.fg("dim", text));
  }

  function updateActiveTools() {
    const otherTools = pi.getActiveTools().filter((name) => name !== TOOL_NAME);
    const available = enabled && reviewCycles < MAX_REVIEW_CYCLES;
    pi.setActiveTools(available ? [...otherTools, TOOL_NAME] : otherTools);
  }

  function toggle(ctx: ExtensionContext) {
    enabled = !enabled;
    updateActiveTools();
    updateStatus(ctx);
    pi.appendEntry(STATE_TYPE, { enabled });
    ctx.ui.notify(`Solution reviews ${enabled ? "enabled" : "disabled"}.`, "info");
  }

  pi.registerTool({
    name: TOOL_NAME,
    label: "Review Solution",
    description: "Run all configured read-only reviewers after implementation and verification are complete.",
    promptSnippet: "Submit a finished implementation to all configured code reviewers",
    promptGuidelines: [
      "When review_solution is active, call it only after implementation and verification are complete and you believe the solution is ready to deliver.",
      "Call review_solution in its own tool-call turn. Never batch it with edits, tests, or other tool calls.",
      "When review_solution is active, do not give the final completion response before it succeeds.",
      "Reviewer subagents are not authoritative. Evaluate their advisory feedback; do not apply a suggestion solely because a reviewer made it. The reviewers are giving suggestions, not requirements. Then call review_solution again when the solution is ready.",
      `Call review_solution at most ${MAX_REVIEW_CYCLES} times for one user request. After the final cycle, do not call it again; finish the task and disclose any unresolved findings or review failure.`,
    ],
    parameters: Type.Object({
      task: Type.String({ description: "A neutral summary of the requested solution and its intended behavior" }),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      if (!enabled) throw new Error("Solution reviews are disabled.");
      if (running) throw new Error("A solution review is already running.");
      if (reviewCycles >= MAX_REVIEW_CYCLES) {
        throw new Error("The review limit has been reached for this user request.");
      }

      running = true;
      updateStatus(ctx);

      try {
        const config = await loadReviewerConfig();
        reviewCycles++;
        updateStatus(ctx);
        onUpdate?.({
          content: [{ type: "text", text: `Running ${config.reviewers.length} solution reviewers...` }],
          details: {},
        });

        const reports = await Promise.all(
          config.reviewers.map((reviewer) =>
            runReviewer(pi, reviewer, config, params.task, ctx.cwd, signal),
          ),
        );
        const combined = formatReports(reports);
        const failed = reports.some((report) => report.error);
        const truncated = truncateHead(combined, {
          maxBytes: DEFAULT_MAX_BYTES,
          maxLines: DEFAULT_MAX_LINES,
        });
        const reportText = truncated.truncated
          ? `${truncated.content}\n\n[Review output truncated.${failed ? "" : " Full reports are retained in tool details."}]`
          : combined;
        const finalCycle = reviewCycles >= MAX_REVIEW_CYCLES;
        const text = `Review cycle ${reviewCycles}/${MAX_REVIEW_CYCLES}.${
          finalCycle
            ? " This is the final cycle. Do not call review_solution again for this user request."
            : ""
        }\n\n${reportText}`;

        if (failed) {
          throw new Error(`Solution review is incomplete. Do not claim that review passed.\n\n${text}`);
        }

        return {
          content: [{ type: "text", text }],
          details: { reports, cycle: reviewCycles, maxCycles: MAX_REVIEW_CYCLES },
        };
      } finally {
        running = false;
        updateActiveTools();
        updateStatus(ctx);
      }
    },
  });

  pi.registerCommand("reviews", {
    description: "Toggle solution reviews for this session",
    handler: async (_args, ctx) => toggle(ctx),
  });

  pi.registerShortcut("ctrl+alt+r", {
    description: "Toggle solution reviews",
    handler: async (ctx) => toggle(ctx),
  });

  pi.on("input", async (event, ctx) => {
    if (event.source === "extension" || event.streamingBehavior !== undefined) return;
    reviewCycles = 0;
    updateActiveTools();
    updateStatus(ctx);
  });

  function restoreState(ctx: ExtensionContext) {
    enabled = false;
    running = false;
    reviewCycles = 0;

    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "custom" && entry.customType === STATE_TYPE) {
        enabled = (entry.data as { enabled?: boolean } | undefined)?.enabled === true;
      }
    }

    updateActiveTools();
    updateStatus(ctx);
  }

  pi.on("session_start", async (_event, ctx) => restoreState(ctx));
  pi.on("session_tree", async (_event, ctx) => restoreState(ctx));
}
