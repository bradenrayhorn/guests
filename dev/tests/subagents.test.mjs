import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";

const packageDir = process.env.PI_PACKAGE_DIR ?? join(
  execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim(),
  "@earendil-works/pi-coding-agent",
);
const requirePi = createRequire(join(packageDir, "package.json"));
const { createJiti } = requirePi("jiti");
const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: {
    "@earendil-works/pi-coding-agent": join(packageDir, "dist/index.js"),
    "@earendil-works/pi-ai": join(packageDir, "node_modules/@earendil-works/pi-ai/dist/compat.js"),
    typebox: requirePi.resolve("typebox"),
  },
});
const { loadModelDefaults, loadProfiles, resolveAgentModel, runChild } = await jiti.import(resolve("home/pi/extensions/lib/subagents.ts"));
const extension = await jiti.import(resolve("home/pi/extensions/subagents.ts"), { default: true });
const { Value } = await import(requirePi.resolve("typebox/value"));
const workspace = await mkdtemp(join(tmpdir(), "subagents-test-"));
const originalEnv = { ...process.env };
after(async () => {
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
  await rm(workspace, { recursive: true, force: true });
});
const agentDir = join(workspace, "agent");
const configDir = join(agentDir, "config/extensions/subagents");
const binDir = join(workspace, "bin");
await mkdir(binDir, { recursive: true });
await mkdir(join(configDir, "defaults"), { recursive: true });
await mkdir(join(configDir, "overrides"), { recursive: true });
const modelsPath = join(configDir, "overrides/models.json");
const configuredModels = { models: { fast: "fast/model", capable: "capable/model" } };
await writeFile(modelsPath, JSON.stringify(configuredModels));
for (const name of ["worker", "scout", "logical-reviewer", "conciseness-reviewer", "oracle"]) {
  await writeFile(join(configDir, "defaults", `${name}.md`),
    await readFile(`home/pi/config/extensions/subagents/defaults/${name}.md`));
}
process.env.PI_CODING_AGENT_DIR = agentDir;
process.env.PATH = `${binDir}:${process.env.PATH}`;
process.env.TEST_CAPTURE = join(workspace, "capture.json");
await writeFile(join(binDir, "pi"), `#!${process.execPath}
const fs = require("node:fs");
let task = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => task += chunk);
process.stdin.on("end", () => {
  const args = process.argv.slice(2);
  const prompt = args[args.indexOf("--append-system-prompt") + 1];
  fs.writeFileSync(process.env.TEST_CAPTURE, JSON.stringify({ args, task, cwd: process.cwd(),
    prompt, system: prompt ? fs.readFileSync(prompt, "utf8") : "" }));
  const usage = { input: 10, output: 5, cacheRead: 2, cacheWrite: 1, totalTokens: 18,
    cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, total: 3 } };
  const emit = event => process.stdout.write(JSON.stringify(event) + "\\n");
  const message = (text, stopReason = "stop") => emit({ type: "message_end",
    message: { role: "assistant", content: [{ type: "text", text }], usage, stopReason,
      errorMessage: stopReason === "error" ? "Model unavailable" : undefined } });
  const mode = process.env.TEST_MODE;
  if (mode === "wait") {
    process.on("SIGTERM", () => {});
    emit({ type: "tool_execution_start", toolName: "waiting" });
    setInterval(() => {}, 1000);
    return;
  }
  if (mode === "badjson") { process.stdout.write("not json\\n"); return; }
  if (mode === "error") { message("", "error"); return; }
  if (mode === "length") { message("partial answer", "length"); return; }
  if (mode === "empty") { message(""); return; }
  if (mode === "incomplete") { message("intermediate", "toolUse"); return; }
  if (mode === "exit") { message("partial result"); process.stderr.write("Child process failed"); process.exitCode = 1; return; }
  if (mode === "retry") message("", "error");
  message("INTERMEDIATE_SECRET", "toolUse");
  emit({ type: "tool_execution_start", toolName: "read" });
  emit({ type: "message_end", message: { role: "toolResult", content: [{ type: "text", text: "TOOL_SECRET" }] } });
  message(mode === "long" ? "long report\\n".repeat(3000) : "Found 😀\\u2028source\\u2029end");
  emit({ type: "agent_settled" });
});
`);
await chmod(join(binDir, "pi"), 0o755);

let tool;
let branch = [];
let activeTools = ["read", "bash"];
const handlers = new Map();
const commands = new Map();
const shortcuts = new Map();
const statuses = new Map();
const notifications = [];
const pi = {
  registerTool: (definition) => {
    tool = definition;
    if (!activeTools.includes(definition.name)) activeTools.push(definition.name);
  },
  registerCommand: (name, command) => commands.set(name, command),
  registerShortcut: (key, shortcut) => shortcuts.set(key, shortcut),
  getActiveTools: () => [...activeTools],
  setActiveTools: (tools) => { activeTools = [...tools]; },
  appendEntry: (customType, data) => branch.push({ type: "custom", customType, data }),
  getThinkingLevel: () => "high",
  on: (event, handler) => handlers.set(event, handler),
};
await extension(pi);
const ctx = {
  cwd: workspace,
  model: { provider: "parent", id: "model" },
  sessionManager: { getBranch: () => branch },
  ui: {
    theme: { fg: (_color, text) => text },
    setStatus: (name, text) => statuses.set(name, text),
    notify: (text) => notifications.push(text),
  },
};
const execute = (params, signal, updates = []) => tool.execute("call", params, signal,
  (update) => updates.push(update), ctx);
const capture = async () => JSON.parse(await readFile(process.env.TEST_CAPTURE, "utf8"));

test("defaults on; command and shortcut toggle visibility without changing other tools", async () => {
  await handlers.get("session_start")({}, ctx);
  assert.deepEqual(activeTools, ["read", "bash", "subagent"]);
  assert.equal(statuses.get("subagents"), "subagents: on");
  await commands.get("subagents").handler("", ctx);
  assert.deepEqual(activeTools, ["read", "bash"]);
  assert.equal(statuses.get("subagents"), "subagents: off");
  assert.deepEqual(branch.at(-1), { type: "custom", customType: "subagents-state", data: { enabled: false } });
  await assert.rejects(execute({ task: "Should not launch" }), /Subagents are disabled/);
  assert.equal(existsSync(process.env.TEST_CAPTURE), false);
  await shortcuts.get("ctrl+alt+s").handler(ctx);
  assert.deepEqual(activeTools, ["read", "bash", "subagent"]);
  assert.equal(branch.at(-1).data.enabled, true);
  assert.match(notifications.at(-1), /enabled/);
  branch = [];
});

test("restores saved state after reload/resume and follows the active branch", async () => {
  await commands.get("subagents").handler("", ctx);
  await extension(pi);
  await handlers.get("session_start")({}, ctx);
  assert.deepEqual(activeTools, ["read", "bash"]);
  assert.equal(statuses.get("subagents"), "subagents: off");
  await assert.rejects(execute({ task: "Still disabled" }), /Subagents are disabled/);
  branch = [
    { type: "custom", customType: "subagents-state", data: { enabled: false } },
    { type: "custom", customType: "subagents-state", data: { enabled: true } },
  ];
  await handlers.get("session_tree")({}, ctx);
  assert.deepEqual(activeTools, ["read", "bash", "subagent"]);
  branch = branch.slice(0, 1);
  await handlers.get("session_tree")({}, ctx);
  assert.deepEqual(activeTools, ["read", "bash"]);
  branch = [];
  await handlers.get("session_start")({}, ctx);
  assert.deepEqual(activeTools, ["read", "bash", "subagent"]);
  assert.equal(statuses.get("subagents"), "subagents: on");
});

test("loads profiles and advertises names/descriptions without full prompts", async () => {
  const profiles = await loadProfiles(configDir);
  assert.equal(profiles.length, 5);
  assert.equal(profiles.find(p => p.name === "worker").tools.includes("edit"), true);
  assert.equal(profiles.find(p => p.name === "scout").tools.includes("edit"), false);
  assert.match(tool.description, /logical-reviewer/);
  assert.doesNotMatch(tool.description, /Do not gold-plate/);
  assert.equal(Value.Check(tool.parameters, { task: "Find code", agent: "missing" }), false);
});

test("Pi's native extension loader registers the tool", async () => {
  const { loadExtensions } = await import(join(packageDir, "dist/core/extensions/loader.js"));
  const loaded = await loadExtensions([resolve("home/pi/extensions/subagents.ts")], process.cwd());
  assert.deepEqual(loaded.errors, []);
  assert.ok(loaded.extensions[0].tools.has("subagent"));
  assert.ok(loaded.extensions[0].commands.has("subagents"));
  assert.ok(loaded.extensions[0].shortcuts.has("ctrl+alt+s"));
});

test("fresh child returns only final text, sums usage, reports progress, and cleans prompt", async () => {
  delete process.env.TEST_MODE;
  const updates = [];
  const task = "@not-a-file --dangerous-option\nFind authentication";
  const result = await execute({ task }, undefined, updates);
  assert.equal(result.isError, false);
  assert.match(result.content[0].text, /Found 😀\u2028source\u2029end/);
  assert.doesNotMatch(JSON.stringify(result), /INTERMEDIATE_SECRET|TOOL_SECRET/);
  assert.equal(result.usage.totalTokens, 36);
  assert.equal(result.usage.cost.total, 6);
  assert.match(updates.at(-1).content[0].text, /Running read/);
  const child = await capture();
  assert.equal(child.task, task);
  assert.equal(child.args[child.args.indexOf("--model") + 1], "capable/model");
  assert.equal(child.args[child.args.indexOf("--thinking") + 1], "medium");
  for (const flag of ["--no-session", "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-context-files", "--no-approve"]) {
    assert.ok(child.args.includes(flag));
  }
  assert.match(child.system, /Do not gold-plate/);
  assert.equal(existsSync(child.prompt), false);
});

test("routes builtin profiles through shared slots and picks up model upgrades after reload", async () => {
  for (const agent of ["scout", "worker", "logical-reviewer", "conciseness-reviewer", "oracle"]) {
    const result = await execute({ task: "Test model routing", agent });
    const model = agent === "scout" ? "fast/model" : "capable/model";
    const thinking = agent === "scout" ? "low" : agent === "worker" ? "medium" : "high";
    assert.equal(result.details.model, model);
    assert.equal(result.details.thinking, thinking);
    const child = await capture();
    assert.equal(child.args[child.args.indexOf("--model") + 1], model);
    assert.equal(child.args[child.args.indexOf("--thinking") + 1], thinking);
  }
  const overridden = await execute({ task: "Override worker thinking", thinking: "off" });
  assert.equal(overridden.details.thinking, "off");
  const child = await capture();
  assert.equal(child.args[child.args.indexOf("--thinking") + 1], "off");
  try {
    await writeFile(modelsPath, JSON.stringify({ models: { ...configuredModels.models, capable: "capable/new-model" } }));
    await extension(pi);
    assert.match(tool.description, /capable: capable\/new-model/);
    assert.equal((await execute({ task: "Use upgraded model" })).details.model, "capable/new-model");
    assert.equal((await execute({ task: "Use slot override", model: "fast" })).details.model, "fast/model");
  } finally {
    await writeFile(modelsPath, JSON.stringify(configuredModels));
    await extension(pi);
  }
});

test("unset slots never fall back to the parent; explicit models still work", async () => {
  try {
    for (const config of [undefined, { models: { fast: null, capable: null } }]) {
      if (config === undefined) await rm(modelsPath);
      else await writeFile(modelsPath, JSON.stringify(config));
      await extension(pi);
      assert.match(tool.description, /capable: not configured/);
      await rm(process.env.TEST_CAPTURE, { force: true });
      await assert.rejects(execute({ task: "No configured model" }), /slot "capable" is not configured/);
      await assert.rejects(execute({ task: "Scout", agent: "scout" }), /slot "fast" is not configured/);
      assert.equal(existsSync(process.env.TEST_CAPTURE), false);
      const result = await execute({ task: "Explicit model", model: "explicit/model" });
      assert.equal(result.details.model, "explicit/model");
    }
    await writeFile(modelsPath, JSON.stringify({ models: { fast: "fast/model" } }));
    await extension(pi);
    assert.equal((await execute({ task: "Scout", agent: "scout" })).details.model, "fast/model");
    await assert.rejects(execute({ task: "Worker" }), /slot "capable" is not configured/);
  } finally {
    await writeFile(modelsPath, JSON.stringify(configuredModels));
    await extension(pi);
  }
});

test("validates model configuration instead of guessing or silently falling back", async () => {
  try {
    for (const config of ["not json", "[]", '{"models":[]}', '{"models":{"unknown":"model"}}',
      '{"models":{"fast":42}}', '{"models":{"fast":" "}}', '{"models":{"fast":"capable"}}']) {
      await writeFile(modelsPath, config);
      await assert.rejects(loadModelDefaults(configDir), /models\.json:/);
    }
    await writeFile(modelsPath, '{"models":{"fast":" fast/model "}}');
    assert.deepEqual(await loadModelDefaults(configDir), { fast: "fast/model" });
    assert.equal(resolveAgentModel("explicit/model", {}), "explicit/model");
  } finally {
    await writeFile(modelsPath, JSON.stringify(configuredModels));
  }
});

test("whole-file overrides and custom profiles; call defaults beat profile defaults", async () => {
  await writeFile(join(configDir, "overrides/scout.md"),
    "---\ndescription: Cheap scout\nmodel: cheap/model\nthinking: low\ntools: [read, grep]\n---\nCustom scout prompt\n");
  await writeFile(join(configDir, "overrides/custom.md"),
    "---\ndescription: No tools\ntools: []\n---\nCustom task\n");
  await extension(pi);
  assert.match(tool.description, /Cheap scout \[model: cheap\/model\]/);
  let result = await execute({ task: "Scout", agent: "scout", cwd: "bin" });
  assert.equal(result.details.model, "cheap/model");
  assert.equal(result.details.thinking, "low");
  let child = await capture();
  assert.equal(child.cwd, await realpath(binDir));
  assert.equal(child.args[child.args.indexOf("--tools") + 1], "read,grep");
  assert.match(child.system, /Custom scout prompt/);
  result = await execute({ task: "Scout", agent: "scout", model: "override/model", thinking: "off" });
  assert.equal(result.details.model, "override/model");
  assert.equal(result.details.thinking, "off");
  await execute({ task: "Custom", agent: "custom" });
  child = await capture();
  assert.ok(child.args.includes("--no-tools"));
});

test("invalid configuration fails clearly", async () => {
  const bad = join(configDir, "overrides/bad.md");
  for (const [fields, error] of [
    ["description: Bad\nthinking: invalid", /thinking must be one of/],
    ["description: Bad\ntools: [subagent]", /tools must contain only/],
    ["model: cheap", /description must be/],
    ["description: Bad\nunknown: true", /unknown field/],
  ]) {
    await writeFile(bad, `---\n${fields}\n---\nPrompt\n`);
    await assert.rejects(loadProfiles(configDir), error);
  }
  await rm(bad);
});

for (const [mode, error] of [
  ["error", /Model unavailable/], ["length", /stop reason: length/],
  ["empty", /no final report/], ["incomplete", /stop reason: toolUse/],
  ["exit", /Child process failed/], ["badjson", /Invalid JSON/],
]) {
  test(`marks ${mode} as failure`, async () => {
    process.env.TEST_MODE = mode;
    const result = await execute({ task: "Test failure" });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, error);
  });
}

test("successful model retry does not retain an earlier failure", async () => {
  process.env.TEST_MODE = "retry";
  const result = await execute({ task: "Test retry" });
  assert.equal(result.isError, false);
  assert.equal(result.usage.totalTokens, 54);
});

test("large final report is bounded and full report is readable", async () => {
  process.env.TEST_MODE = "long";
  const result = await execute({ task: "Test long report" });
  assert.equal(result.isError, false);
  assert.ok(Buffer.byteLength(result.content[0].text) < 12500);
  assert.match(result.content[0].text, /Full report:/);
  assert.equal(await readFile(result.details.outputPath, "utf8"), "long report\n".repeat(3000).trim());
  await rm(dirname(result.details.outputPath), { recursive: true });
});

test("abort before launch, process launch failure, and cancellation escalation", async () => {
  const preAborted = new AbortController();
  preAborted.abort();
  let result = await runChild([], "Task", workspace, preAborted.signal, () => {});
  assert.match(result.error, /aborted before launch/);
  result = await runChild([], "Task", join(workspace, "nonexistent"), undefined, () => {});
  assert.match(result.error, /ENOENT/);
  process.env.TEST_MODE = "wait";
  const controller = new AbortController();
  result = await runChild([], "Task", workspace, controller.signal,
    () => controller.abort());
  assert.match(result.error, /aborted/);
});

test("session shutdown aborts active workers and cleans their prompts", async () => {
  process.env.TEST_MODE = "wait";
  const result = await tool.execute("call", { task: "Wait" }, undefined,
    (update) => {
      if (update.content[0].text.includes("waiting")) handlers.get("session_shutdown")();
    }, ctx);
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /aborted/);
  assert.equal(existsSync((await capture()).prompt), false);
});

test("disabling blocks new launches but does not cancel concurrent workers", { timeout: 10000 }, async () => {
  process.env.TEST_MODE = "wait";
  const controller = new AbortController();
  let readyCount = 0;
  let completed = 0;
  let ready;
  const started = new Promise((resolve) => { ready = resolve; });
  const update = (result) => {
    if (result.content[0].text.includes("waiting") && ++readyCount === 2) ready();
  };
  const workers = ["logical-reviewer", "conciseness-reviewer"].map((agent) =>
    tool.execute(agent, { task: "Review", agent }, controller.signal, update, ctx)
      .then((result) => { completed++; return result; }),
  );
  try {
    await started;
    assert.equal(statuses.get("subagents"), "subagents: on (2 running)");
    await commands.get("subagents").handler("", ctx);
    assert.equal(controller.signal.aborted, false);
    assert.equal(completed, 0);
    assert.equal(statuses.get("subagents"), "subagents: off (2 running)");
    assert.match(notifications.at(-1), /Running workers will finish/);
    await assert.rejects(execute({ task: "New worker" }), /Subagents are disabled/);
    controller.abort();
    const results = await Promise.all(workers);
    assert.ok(results.every((result) => result.isError));
    assert.equal(statuses.get("subagents"), "subagents: off");
  } finally {
    controller.abort();
    await Promise.all(workers);
    branch = [];
    await handlers.get("session_start")({}, ctx);
    delete process.env.TEST_MODE;
  }
});
