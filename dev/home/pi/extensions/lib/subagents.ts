import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Usage } from "@earendil-works/pi-ai";
import {
  getAgentDir,
  parseFrontmatter,
  type JsonAgentSessionEvent,
} from "@earendil-works/pi-coding-agent";

export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
const BUILTIN_TOOLS = new Set(["read", "bash", "edit", "write", "grep", "find", "ls"]);
const DEFAULT_TOOLS = [...BUILTIN_TOOLS];
export const MODEL_SLOTS = ["fast", "capable"] as const;
export type ModelDefaults = Partial<Record<typeof MODEL_SLOTS[number], string>>;

export function subagentsConfigDir(): string {
  return join(getAgentDir(), "config", "extensions", "subagents");
}

export async function loadModelDefaults(configDir = subagentsConfigDir()): Promise<ModelDefaults> {
  const path = join(configDir, "overrides", "models.json");
  const contents = await readFile(path, "utf8").catch((error) => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
  if (contents === undefined) return {};
  let config: unknown;
  try {
    config = JSON.parse(contents);
  } catch (error) {
    throw new Error(`${path}: invalid JSON: ${String(error)}`);
  }
  const isObject = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  if (!isObject(config) || Object.keys(config).some((key) => key !== "models") || !isObject(config.models)) {
    throw new Error(`${path}: expected an object with a "models" object`);
  }
  if (Object.keys(config.models).some((key) => !MODEL_SLOTS.includes(key as typeof MODEL_SLOTS[number]))) {
    throw new Error(`${path}: models only supports "fast" and "capable"`);
  }
  const defaults: ModelDefaults = {};
  for (const slot of MODEL_SLOTS) {
    const value = config.models[slot];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string" || !value.trim() || MODEL_SLOTS.includes(value.trim() as typeof MODEL_SLOTS[number])) {
      throw new Error(`${path}: models.${slot} must be a model ID or null (unset), not another slot`);
    }
    defaults[slot] = value.trim();
  }
  return defaults;
}

export function resolveAgentModel(requested: string, defaults: ModelDefaults): string {
  if (!MODEL_SLOTS.includes(requested as typeof MODEL_SLOTS[number])) return requested;
  const model = defaults[requested as typeof MODEL_SLOTS[number]];
  if (!model) {
    throw new Error(`Subagent model slot "${requested}" is not configured. Set models.${requested} in ${join(subagentsConfigDir(), "overrides", "models.json")} and /reload, or pass an explicit model override. No parent-model fallback is used.`);
  }
  return model;
}

type Frontmatter = {
  description?: unknown;
  model?: unknown;
  thinking?: unknown;
  tools?: unknown;
};

export type AgentProfile = {
  name: string;
  description: string;
  prompt: string;
  model?: string;
  thinking?: string;
  tools: string[];
};

export async function loadProfiles(
  configDir = subagentsConfigDir(),
): Promise<AgentProfile[]> {
  const files = new Map<string, string>();
  for (const directory of ["defaults", "overrides"]) {
    const path = join(configDir, directory);
    const entries = await readdir(path, { withFileTypes: true }).catch((error) => {
      if (directory === "overrides" && error.code === "ENOENT") return [];
      throw error;
    });
    for (const entry of entries) {
      if (entry.name.endsWith(".md") && (entry.isFile() || entry.isSymbolicLink())) {
        files.set(entry.name, join(path, entry.name));
      }
    }
  }

  const profiles: AgentProfile[] = [];
  for (const [filename, path] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    const name = filename.slice(0, -3);
    const { frontmatter, body } = parseFrontmatter<Frontmatter>(await readFile(path, "utf8"));
    const invalid = (reason: string): never => { throw new Error(`${path}: ${reason}`); };
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(name)) invalid("invalid agent filename");
    for (const key of Object.keys(frontmatter)) {
      if (!["description", "model", "thinking", "tools"].includes(key)) invalid(`unknown field "${key}"`);
    }
    if (typeof frontmatter.description !== "string" || !frontmatter.description.trim()) {
      invalid("description must be a nonempty string");
    }
    if (!body.trim()) invalid("prompt must not be empty");
    if (frontmatter.model !== undefined &&
        (typeof frontmatter.model !== "string" || !frontmatter.model.trim())) {
      invalid("model must be a nonempty string");
    }
    if (frontmatter.thinking !== undefined &&
        !THINKING_LEVELS.includes(frontmatter.thinking as typeof THINKING_LEVELS[number])) {
      invalid(`thinking must be one of: ${THINKING_LEVELS.join(", ")}`);
    }
    const tools = frontmatter.tools === undefined ? DEFAULT_TOOLS :
      typeof frontmatter.tools === "string" ? frontmatter.tools.split(",").map((tool) => tool.trim()) :
      Array.isArray(frontmatter.tools) ? frontmatter.tools : invalid("tools must be a list or comma-separated string");
    if (tools.some((tool) => typeof tool !== "string" || !BUILTIN_TOOLS.has(tool))) {
      invalid(`tools must contain only: ${DEFAULT_TOOLS.join(", ")}`);
    }
    profiles.push({
      name,
      description: (frontmatter.description as string).trim(),
      prompt: body.trim(),
      model: (frontmatter.model as string | undefined)?.trim(),
      thinking: frontmatter.thinking as string | undefined,
      tools,
    });
  }
  if (!profiles.some((profile) => profile.name === "worker")) {
    throw new Error(`${configDir}: a worker profile is required`);
  }
  return profiles;
}

export type ChildResult = {
  output: string;
  error?: string;
  turns: number;
  usage: Usage;
};

/** Consume JSONL without retaining the child's transcript or intermediate output. */
export function runChild(
  args: string[],
  task: string,
  cwd: string,
  signal: AbortSignal | undefined,
  onProgress: (text: string) => void,
): Promise<ChildResult> {
  return new Promise((resolve) => {
    const usage: Usage = {
      input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    };
    let output = "";
    let stopReason: string | undefined;
    let modelError: string | undefined;
    let processError: string | undefined;
    let stderr = "";
    let buffer = "";
    let turns = 0;
    let aborted = signal?.aborted === true;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    if (aborted) {
      resolve({ output, error: "Subagent aborted before launch.", turns, usage });
      return;
    }

    const child = spawn("pi", args, {
      cwd, stdio: ["pipe", "pipe", "pipe"], detached: process.platform !== "win32",
    });
    const kill = (force = false) => {
      try {
        if (process.platform !== "win32" && child.pid) {
          process.kill(-child.pid, force ? "SIGKILL" : "SIGTERM");
        } else {
          child.kill(force ? "SIGKILL" : "SIGTERM");
        }
      } catch { /* The process may already have exited. */ }
    };
    const abort = () => {
      aborted = true;
      kill();
      killTimer = setTimeout(() => kill(true), 2000);
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();

    const addUsage = (value: Usage) => {
      for (const key of ["input", "output", "cacheRead", "cacheWrite", "totalTokens", "reasoning", "cacheWrite1h"] as const) {
        if (value[key] !== undefined) usage[key] = (usage[key] ?? 0) + value[key]!;
      }
      for (const key of ["input", "output", "cacheRead", "cacheWrite", "total"] as const) {
        usage.cost[key] += value.cost?.[key] ?? 0;
      }
    };
    const processLine = (line: string) => {
      if (!line.trim()) return;
      let event: JsonAgentSessionEvent;
      try {
        event = JSON.parse(line);
      } catch {
        processError = "Invalid JSON from child Pi process.";
        return;
      }
      if (event.type === "message_end" && event.message.role === "assistant") {
        const message = event.message;
        turns++;
        addUsage(message.usage);
        output = message.content.filter((part) => part.type === "text").map((part) => part.text).join("\n").trim();
        stopReason = message.stopReason;
        modelError = message.errorMessage;
      } else if (event.type === "compaction_end" && event.result?.usage) {
        addUsage(event.result.usage);
      } else if (event.type === "tool_execution_start") {
        onProgress(`Running ${event.toolName} (turn ${turns})`);
      } else if (event.type === "auto_retry_start") {
        onProgress(`Retrying model request (attempt ${event.attempt})`);
      }
    };

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buffer += chunk;
      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        processLine(line);
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => { stderr = (stderr + chunk).slice(-8192); });
    child.on("error", (error) => { processError = error.message; });
    child.stdin.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "EPIPE") processError = error.message;
    });
    // Stdin avoids argv limits and interpreting task text as CLI options or @file attachments.
    child.stdin.end(task);
    child.on("close", (code, exitSignal) => {
      signal?.removeEventListener("abort", abort);
      if (killTimer) clearTimeout(killTimer);
      if (aborted) kill(true);
      processLine(buffer);
      const error = aborted ? "Subagent aborted. Any edits already made remain on disk." :
        processError ?? (code !== 0 ? stderr.trim() || `Pi exited with ${exitSignal ?? code}.` :
        stopReason !== "stop" ? modelError || `Subagent did not finish (stop reason: ${stopReason ?? "none"}).` :
        !output ? "Subagent produced no final report." : undefined);
      resolve({ output, error, turns, usage });
    });
  });
}
