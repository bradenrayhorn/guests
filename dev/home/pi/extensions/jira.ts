import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  getAgentDir,
  truncateHead,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
} from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";

const CONFIG_PATH = join(getAgentDir(), "jira.json");
const JSON_OBJECT = Type.Record(Type.String(), Type.Unknown());
const PROPERTY = Type.Object({
  key: Type.String({ minLength: 1 }),
  value: Type.Unknown(),
});

const GET_ISSUE_SCHEMA = Type.Object({
  issueIdOrKey: Type.String({ minLength: 1, description: "Jira issue key or ID, for example PROJ-123" }),
  fields: Type.Optional(
    Type.Array(Type.String(), {
      description: "Optional Jira field names. Omit this to return all fields.",
    }),
  ),
  expand: Type.Optional(Type.String({ description: "Comma-separated Jira expansions" })),
  fieldsByKeys: Type.Optional(Type.Boolean()),
});

type GetIssueInput = Static<typeof GET_ISSUE_SCHEMA>;

const CREATE_ISSUE_SCHEMA = Type.Object({
  fields: Type.Object({}, {
    description: "Jira REST v3 fields, including project, issuetype, summary, description, and custom fields",
    additionalProperties: true,
  }),
  update: Type.Optional(JSON_OBJECT),
  historyMetadata: Type.Optional(JSON_OBJECT),
  properties: Type.Optional(Type.Array(PROPERTY)),
});

type CreateIssueInput = Static<typeof CREATE_ISSUE_SCHEMA>;

const EDIT_ISSUE_SCHEMA = Type.Object({
  issueIdOrKey: Type.String({ minLength: 1, description: "Jira issue key or ID, for example PROJ-123" }),
  fields: Type.Optional(Type.Object({}, {
    description: "Fields to replace",
    additionalProperties: true,
  })),
  update: Type.Optional(JSON_OBJECT),
  historyMetadata: Type.Optional(JSON_OBJECT),
  properties: Type.Optional(Type.Array(PROPERTY)),
});

type EditIssueInput = Static<typeof EDIT_ISSUE_SCHEMA>;

type JiraConfig = {
  enabled: boolean;
  baseUrl: string;
  email: string;
  apiToken: string;
};

type ConfigStatus = {
  config?: JiraConfig;
  error?: string;
};

type JiraResponse = {
  status: number;
  data: unknown;
};

function validateConfig(value: unknown): JiraConfig {
  if (!value || typeof value !== "object") {
    throw new Error("configuration must be a JSON object");
  }

  const input = value as Record<string, unknown>;
  if (input.enabled !== true) {
    throw new Error("enabled must be true");
  }
  if (typeof input.baseUrl !== "string" || input.baseUrl.trim() === "") {
    throw new Error("baseUrl is required");
  }
  if (typeof input.email !== "string" || input.email.trim() === "") {
    throw new Error("email is required");
  }
  if (typeof input.apiToken !== "string" || input.apiToken.trim() === "") {
    throw new Error("apiToken is required");
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(input.baseUrl);
  } catch {
    throw new Error("baseUrl must be a valid URL");
  }
  if (baseUrl.protocol !== "https:") {
    throw new Error("baseUrl must use HTTPS");
  }
  if (!baseUrl.hostname) {
    throw new Error("baseUrl must include a hostname");
  }

  return {
    enabled: true,
    baseUrl: input.baseUrl.replace(/\/+$/, ""),
    email: input.email.trim(),
    apiToken: input.apiToken.trim(),
  };
}

async function loadConfig(): Promise<ConfigStatus> {
  let raw: string;
  try {
    raw = await readFile(CONFIG_PATH, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { error: `configuration file not found: ${CONFIG_PATH}` };
    }
    return { error: `could not read configuration file: ${String(error)}` };
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    return { error: `invalid JSON in ${CONFIG_PATH}: ${String(error)}` };
  }

  if (value && typeof value === "object" && (value as Record<string, unknown>).enabled !== true) {
    return { error: "disabled" };
  }

  try {
    return { config: validateConfig(value) };
  } catch (error) {
    return { error: `invalid Jira configuration: ${String(error)}` };
  }
}

function buildUrl(config: JiraConfig, path: string, query?: URLSearchParams): string {
  const url = `${config.baseUrl}/rest/api/3${path}`;
  return query && [...query].length > 0 ? `${url}?${query.toString()}` : url;
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function jiraRequest(
  config: JiraConfig,
  method: "GET" | "POST" | "PUT",
  path: string,
  signal: AbortSignal | undefined,
  body?: unknown,
  query?: URLSearchParams,
): Promise<JiraResponse> {
  const auth = Buffer.from(`${config.email}:${config.apiToken}`, "utf8").toString("base64");
  const response = await fetch(buildUrl(config, path, query), {
    method,
    signal,
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${auth}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await parseResponse(response);

  if (!response.ok) {
    const errorBody = typeof data === "string" ? data : JSON.stringify(data);
    throw new Error(
      `Jira API request failed (${response.status} ${response.statusText}): ${errorBody || "no response body"}`,
    );
  }

  return { status: response.status, data };
}

async function saveFullResponse(text: string): Promise<string> {
  const directory = join(tmpdir(), "pi-jira");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, `${Date.now()}-${randomUUID()}.json`);
  await writeFile(path, text, { encoding: "utf8", mode: 0o600 });
  return path;
}

async function formatResponse(data: unknown): Promise<string> {
  const full = JSON.stringify(data, null, 2) ?? "null";
  const result = truncateHead(full, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });
  if (!result.truncated) return full;

  const path = await saveFullResponse(full);
  return `${result.content}\n\n[Response truncated at ${formatSize(DEFAULT_MAX_BYTES)} or ${DEFAULT_MAX_LINES} lines. Full response saved to: ${path}]`;
}

function issuePath(issueIdOrKey: string): string {
  return `/issue/${encodeURIComponent(issueIdOrKey)}`;
}

function toolError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(String(error));
}

export default async function (pi: ExtensionAPI) {
  pi.registerCommand("jira", {
    description: "Check Jira extension status and authentication",
    handler: async (_args, ctx) => {
      const status = await loadConfig();
      if (!status.config) {
        if (status.error === "disabled") {
          ctx.ui.notify(`Jira disabled. Set enabled to true in ${CONFIG_PATH}, then run /reload.`, "info");
        } else {
          ctx.ui.notify(`Jira unavailable: ${status.error}`, "error");
        }
        return;
      }

      try {
        const response = await jiraRequest(status.config, "GET", "/myself", undefined);
        const account = response.data as { displayName?: string; accountId?: string };
        ctx.ui.notify(
          `Jira authenticated as ${account.displayName ?? "unknown user"} (${account.accountId ?? "no account ID"})`,
          "info",
        );
      } catch (error) {
        ctx.ui.notify(`Jira authentication check failed: ${toolError(error).message}`, "error");
      }
    },
  });

  const status = await loadConfig();
  if (!status.config) return;
  const config = status.config;

  pi.registerTool({
    name: "jira_get_issue",
    label: "Jira Get Issue",
    description: "Get a Jira issue. Returns all Jira fields by default; provide fields only to limit the response.",
    promptSnippet: "Get a Jira issue with all fields by default",
    parameters: GET_ISSUE_SCHEMA,
    async execute(_toolCallId, params: GetIssueInput, signal) {
      try {
        const query = new URLSearchParams();
        if (params.fields !== undefined) query.set("fields", params.fields.join(","));
        if (params.expand !== undefined) query.set("expand", params.expand);
        if (params.fieldsByKeys !== undefined) query.set("fieldsByKeys", String(params.fieldsByKeys));

        const response = await jiraRequest(config, "GET", issuePath(params.issueIdOrKey), signal, undefined, query);
        return {
          content: [{ type: "text", text: await formatResponse(response.data) }],
          details: { status: response.status, operation: "get_issue" },
        };
      } catch (error) {
        throw toolError(error);
      }
    },
  });

  pi.registerTool({
    name: "jira_create_issue",
    label: "Jira Create Issue",
    description: "Create a Jira issue",
    promptSnippet: "Create a Jira issue",
    parameters: CREATE_ISSUE_SCHEMA,
    async execute(_toolCallId, params: CreateIssueInput, signal) {
      try {
        const body: Record<string, unknown> = { fields: params.fields };
        if (params.update !== undefined) body.update = params.update;
        if (params.historyMetadata !== undefined) body.historyMetadata = params.historyMetadata;
        if (params.properties !== undefined) body.properties = params.properties;

        const response = await jiraRequest(config, "POST", "/issue", signal, body);
        return {
          content: [{ type: "text", text: await formatResponse(response.data) }],
          details: { status: response.status, operation: "create_issue" },
        };
      } catch (error) {
        throw toolError(error);
      }
    },
  });

  pi.registerTool({
    name: "jira_edit_issue",
    label: "Jira Edit Issue",
    description: "Edit a Jira issue",
    promptSnippet: "Edit a Jira issue",
    parameters: EDIT_ISSUE_SCHEMA,
    async execute(_toolCallId, params: EditIssueInput, signal) {
      try {
        if (params.fields === undefined && params.update === undefined && params.properties === undefined && params.historyMetadata === undefined) {
          throw new Error("at least one of fields, update, properties, or historyMetadata is required");
        }

        const body: Record<string, unknown> = {};
        if (params.fields !== undefined) body.fields = params.fields;
        if (params.update !== undefined) body.update = params.update;
        if (params.historyMetadata !== undefined) body.historyMetadata = params.historyMetadata;
        if (params.properties !== undefined) body.properties = params.properties;

        const response = await jiraRequest(config, "PUT", issuePath(params.issueIdOrKey), signal, body);
        const data = response.data ?? { status: response.status, message: "Issue updated successfully" };
        return {
          content: [{ type: "text", text: await formatResponse(data) }],
          details: { status: response.status, operation: "edit_issue" },
        };
      } catch (error) {
        throw toolError(error);
      }
    },
  });
}
