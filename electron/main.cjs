const { app, BrowserWindow, ipcMain, session, webContents } = require("electron");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const appIconPath = path.join(__dirname, "assets", "app-icon.png");

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "true";

function loadLocalEnvFile(fileName) {
  const filePath = path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(filePath)) return;

  try {
    const content = fs.readFileSync(filePath, "utf8");
    content.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex < 0) return;

      const key = trimmed.slice(0, separatorIndex).trim();
      const rawValue = trimmed.slice(separatorIndex + 1).trim();
      if (!key || process.env[key]) return;

      process.env[key] = rawValue.replace(/^["']|["']$/g, "");
    });
  } catch (error) {
    console.warn(`[env] Failed to load ${fileName}:`, error?.message || error);
  }
}

loadLocalEnvFile(".env");
loadLocalEnvFile(".env.local");

function getUploadBody(details) {
  const uploadData = details.uploadData || [];
  const bytes = uploadData
    .map((item) => item.bytes)
    .filter(Boolean);

  if (bytes.length === 0) return undefined;

  try {
    return Buffer.concat(bytes).toString("utf8").slice(0, 2000);
  } catch {
    return "[unreadable upload body]";
  }
}

const SENSITIVE_KEY_PATTERN =
  /(password|passwd|pwd|token|access[_-]?token|refresh[_-]?token|authorization|cookie|secret|api[_-]?key|session|jwt|ssn|resident|phone|mobile|email)/i;

function truncateForPrompt(value, maxLength = 1800) {
  if (typeof value !== "string") return value;
  return value.length > maxLength ? `${value.slice(0, maxLength)}... [truncated]` : value;
}

function redactSensitive(value, key = "") {
  if (SENSITIVE_KEY_PATTERN.test(key)) return "***";
  if (typeof value === "string") return truncateForPrompt(value);
  if (typeof value === "number" || typeof value === "boolean" || value == null) return value;

  if (Array.isArray(value)) {
    return value.slice(0, 40).map((item) => redactSensitive(item, key));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 80)
        .map(([entryKey, entryValue]) => [entryKey, redactSensitive(entryValue, entryKey)])
    );
  }

  return String(value);
}

function extractResponseText(responseBody) {
  if (typeof responseBody?.output_text === "string" && responseBody.output_text.trim()) {
    return responseBody.output_text.trim();
  }

  const chunks = [];
  (responseBody?.output || []).forEach((item) => {
    if (typeof item?.text === "string") chunks.push(item.text);
    if (typeof item?.output_text === "string") chunks.push(item.output_text);

    (item.content || []).forEach((content) => {
      if (typeof content.text === "string") chunks.push(content.text);
      if (typeof content.output_text === "string") chunks.push(content.output_text);
      if (content.parsed && typeof content.parsed === "object") {
        chunks.push(JSON.stringify(content.parsed));
      }
    });
  });

  return chunks.join("\n").trim();
}

function extractResponseRefusal(responseBody) {
  for (const item of responseBody?.output || []) {
    for (const content of item.content || []) {
      if (typeof content.refusal === "string" && content.refusal.trim()) {
        return content.refusal.trim();
      }
    }
  }

  return "";
}

function getOpenAiResponseProblem(responseBody) {
  if (responseBody?.error?.message) return responseBody.error.message;

  const refusal = extractResponseRefusal(responseBody);
  if (refusal) return `OpenAI가 분석 요청을 거절했습니다: ${refusal}`;

  if (responseBody?.status === "incomplete") {
    const reason = responseBody?.incomplete_details?.reason || "unknown";
    if (reason === "max_output_tokens") {
      return "OpenAI 응답이 토큰 제한으로 중단되었습니다. 출력 토큰 여유를 늘려 다시 시도하세요.";
    }

    return `OpenAI 응답이 완료되지 않았습니다. reason=${reason}`;
  }

  return "";
}

function parseJsonFromText(text) {
  if (!text) return undefined;

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return undefined;

    try {
      return JSON.parse(match[0]);
    } catch {
      return undefined;
    }
  }
}

function createAnalysisPrompt(payload = {}) {
  const sanitizedPayload = redactSensitive(payload);

  return [
    "아래는 Electron webview 안에서 수집한 프론트엔드 디버깅 trace입니다.",
    "에러 메시지, stack trace, 직전 함수 scope, API 요청/응답, initiator stack을 근거로 실제 원인 후보를 좁혀주세요.",
    "추측은 근거와 분리하고, 확인 가능한 데이터 중심으로 답하세요.",
    "summary/rootCause는 한 문장으로 답하세요.",
    "inspectFirst/fixSuggestion은 각각 45자 이내의 짧은 문장으로 답하세요.",
    "긴 URL은 쓰지 말고 파일명:줄번호 형식으로 줄여 쓰세요. 괄호 설명도 길게 붙이지 마세요.",
    "debugSteps는 정말 필요한 핵심 1개만 적으세요.",
    "반드시 아래 JSON 형태로만 응답하세요. markdown 코드블록은 쓰지 마세요.",
    JSON.stringify({
      summary: "한 문장 결론",
      rootCause: "가장 가능성 높은 원인",
      evidence: ["확인된 단서", "관련 trace"],
      inspectFirst: "먼저 확인할 위치",
      debugSteps: ["핵심 확인 1"],
      fixSuggestion: "짧은 수정 방향",
      confidence: "low | medium | high",
      missingData: ["추가로 있으면 좋은 데이터"],
    }),
    "",
    "TRACE:",
    JSON.stringify(sanitizedPayload, null, 2),
  ].join("\n");
}

const AI_ANALYSIS_JSON_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    rootCause: { type: "string" },
    evidence: {
      type: "array",
      items: { type: "string" },
    },
    inspectFirst: { type: "string" },
    debugSteps: {
      type: "array",
      items: { type: "string" },
    },
    fixSuggestion: { type: "string" },
    confidence: {
      type: "string",
      enum: ["low", "medium", "high"],
    },
    missingData: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "summary",
    "rootCause",
    "evidence",
    "inspectFirst",
    "debugSteps",
    "fixSuggestion",
    "confidence",
    "missingData",
  ],
  additionalProperties: false,
};

async function analyzeErrorWithOpenAI(payload = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      code: "missing_api_key",
      message: "OPENAI_API_KEY가 설정되어 있지 않습니다. 프로젝트 루트의 .env 또는 실행 환경변수에 추가해주세요.",
    };
  }

  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const prompt = createAnalysisPrompt(payload);
  const isGpt5Model = /^gpt-5/i.test(model);
  const requestBody = {
    model,
    input: [
      {
        role: "developer",
        content:
          "You are a senior frontend debugging assistant. Return concise, specific Korean JSON only. Do not include markdown.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "debug_trace_analysis",
        description: "Structured Korean frontend debugging analysis result.",
        strict: true,
        schema: AI_ANALYSIS_JSON_SCHEMA,
      },
    },
    max_output_tokens: 1800,
  };

  if (isGpt5Model) {
    requestBody.reasoning = {
      effort: "low",
    };
    requestBody.text.verbosity = "low";
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const responseBody = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        ok: false,
        code: responseBody?.error?.code || "openai_error",
        message: responseBody?.error?.message || `OpenAI API request failed (${response.status}).`,
      };
    }

    const responseProblem = getOpenAiResponseProblem(responseBody);
    if (responseProblem) {
      return {
        ok: false,
        provider: "openai",
        model,
        code: responseBody?.status === "incomplete" ? "openai_incomplete" : "openai_empty_response",
        message: responseProblem,
      };
    }

    const rawText = extractResponseText(responseBody);
    const analysis = parseJsonFromText(rawText);

    if (!analysis) {
      return {
        ok: false,
        provider: "openai",
        model,
        code: "openai_empty_response",
        message: rawText
          ? "OpenAI 응답을 JSON으로 해석하지 못했습니다."
          : "OpenAI 응답 텍스트가 비어 있습니다. 출력 토큰 제한 또는 모델 응답 형식을 확인하세요.",
        rawText,
      };
    }

    return {
      ok: true,
      provider: "openai",
      model,
      analysis,
      rawText,
    };
  } catch (error) {
    return {
      ok: false,
      code: "network_error",
      message: error?.message || "OpenAI API 호출에 실패했습니다.",
    };
  }
}

async function analyzeErrorWithConfiguredProvider(payload = {}) {
  return analyzeErrorWithOpenAI(payload);
}

function sendToMainWindow(mainWindow, channel, payload) {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return false;

    const targetWebContents = mainWindow.webContents;
    if (!targetWebContents || targetWebContents.isDestroyed()) return false;

    targetWebContents.send(channel, payload);
    return true;
  } catch (error) {
    if (String(error?.message || error).includes("destroyed")) {
      return false;
    }

    console.error(`[main-window:${channel}]`, error);
    return false;
  }
}

function setupTargetNetworkCapture(mainWindow) {
  const targetSession = session.fromPartition("persist:debug-agent-target");
  const requests = new Map();
  const filter = { urls: ["http://*/*", "https://*/*"] };

  targetSession.webRequest.onBeforeRequest(filter, (details, callback) => {
    requests.set(details.id, {
      startedAt: Date.now(),
      method: details.method,
      url: details.url,
      resourceType: details.resourceType,
      uploadBody: getUploadBody(details),
    });
    callback({});
  });

  targetSession.webRequest.onCompleted(filter, (details) => {
    const request = requests.get(details.id) || {};
    requests.delete(details.id);

    sendToMainWindow(mainWindow, "debug-agent:network-event", {
      transport: "webRequest",
      method: details.method || request.method || "GET",
      url: details.url,
      status: details.statusCode,
      statusText: details.statusLine || "",
      ok: details.statusCode >= 200 && details.statusCode < 400,
      latencyMs: request.startedAt ? Date.now() - request.startedAt : 0,
      request: {
        method: details.method || request.method || "GET",
        url: details.url,
        resourceType: details.resourceType || request.resourceType,
        body: request.uploadBody,
        initiator: findInitiatorForUrl(details.url),
      },
      response: {
        fromCache: details.fromCache,
        ip: details.ip,
      },
    });
  });

  targetSession.webRequest.onErrorOccurred(filter, (details) => {
    const request = requests.get(details.id) || {};
    requests.delete(details.id);

    sendToMainWindow(mainWindow, "debug-agent:network-event", {
      transport: "webRequest",
      method: details.method || request.method || "GET",
      url: details.url,
      status: 0,
      statusText: details.error || "Request failed",
      ok: false,
      latencyMs: request.startedAt ? Date.now() - request.startedAt : 0,
      request: {
        method: details.method || request.method || "GET",
        url: details.url,
        resourceType: details.resourceType || request.resourceType,
        body: request.uploadBody,
        initiator: findInitiatorForUrl(details.url),
      },
      error: details.error,
    });
  });
}

const debuggerTargets = new Map();
let activeDebuggerTargetId = null;
const cdpNetworkInitiators = new Map();

function normalizeUrlForMatch(url) {
  try {
    const parsedUrl = new URL(url);
    return `${parsedUrl.origin}${parsedUrl.pathname}${parsedUrl.search}`;
  } catch {
    return url;
  }
}

function stackTraceToFrames(stack) {
  const frames = [];
  let currentStack = stack;

  while (currentStack) {
    (currentStack.callFrames || []).forEach((frame) => {
      frames.push({
        functionName: frame.functionName || "(anonymous)",
        sourceFile: frame.url || "",
        line: typeof frame.lineNumber === "number" ? frame.lineNumber + 1 : undefined,
        column: typeof frame.columnNumber === "number" ? frame.columnNumber + 1 : undefined,
      });
    });
    currentStack = currentStack.parent;
  }

  return frames.slice(0, 30);
}

function findInitiatorForUrl(url) {
  const normalizedUrl = normalizeUrlForMatch(url);
  const exact = cdpNetworkInitiators.get(normalizedUrl);
  if (exact) {
    cdpNetworkInitiators.delete(normalizedUrl);
    return exact;
  }

  const fallbackEntry = [...cdpNetworkInitiators.entries()].find(([candidateUrl]) => {
    return (
      candidateUrl === normalizedUrl ||
      candidateUrl.includes(normalizedUrl) ||
      normalizedUrl.includes(candidateUrl)
    );
  });

  if (!fallbackEntry) return undefined;

  cdpNetworkInitiators.delete(fallbackEntry[0]);
  return fallbackEntry[1];
}

function remoteObjectToValue(remoteObject) {
  if (!remoteObject) return undefined;
  if ("value" in remoteObject) return remoteObject.value;
  if (remoteObject.unserializableValue) return remoteObject.unserializableValue;
  if (remoteObject.description) return remoteObject.description;
  return remoteObject.type;
}

async function getScopeVariables(debuggerApi, scope) {
  if (!scope?.object?.objectId) return {};

  try {
    const properties = await debuggerApi.sendCommand("Runtime.getProperties", {
      objectId: scope.object.objectId,
      ownProperties: true,
      accessorPropertiesOnly: false,
      generatePreview: true,
    });

    return Object.fromEntries(
      (properties.result || [])
        .filter((property) => property.enumerable !== false && property.name)
        .slice(0, 80)
        .map((property) => [property.name, remoteObjectToValue(property.value)])
    );
  } catch {
    return {};
  }
}

async function handleDebuggerPaused(mainWindow, targetId, params) {
  const target = debuggerTargets.get(targetId);
  if (!target) return;

  const callFrames = params.callFrames || [];
  const topFrame = callFrames[0];
  if (!topFrame) return;

  const localScope =
    topFrame.scopeChain?.find((scope) => scope.type === "local") || topFrame.scopeChain?.[0];
  const closureScope = topFrame.scopeChain?.find((scope) => scope.type === "closure");
  const localVariables = await getScopeVariables(target.debuggerApi, localScope);
  const closureVariables = await getScopeVariables(target.debuggerApi, closureScope);

  sendToMainWindow(mainWindow, "debug-agent:function-event", {
    callType: "devtools-paused",
    pauseReason: params.reason,
    functionName: topFrame.functionName || "(anonymous)",
    sourceFile: topFrame.url || target.scripts.get(topFrame.location?.scriptId) || "",
    line: typeof topFrame.location?.lineNumber === "number" ? topFrame.location.lineNumber + 1 : undefined,
    column:
      typeof topFrame.location?.columnNumber === "number"
        ? topFrame.location.columnNumber + 1
        : undefined,
    parameters: {
      pauseReason: params.reason,
      hitBreakpoints: params.hitBreakpoints || [],
      local: localVariables,
      closure: closureVariables,
      callStack: callFrames.slice(0, 20).map((frame) => ({
        functionName: frame.functionName || "(anonymous)",
        sourceFile: frame.url || target.scripts.get(frame.location?.scriptId) || "",
        line:
          typeof frame.location?.lineNumber === "number"
            ? frame.location.lineNumber + 1
            : undefined,
        column:
          typeof frame.location?.columnNumber === "number"
            ? frame.location.columnNumber + 1
            : undefined,
      })),
    },
    durationMs: 0,
    hasError: params.reason === "exception",
    error: params.data ? remoteObjectToValue(params.data) : undefined,
  });

  try {
    await target.debuggerApi.sendCommand("Debugger.resume");
  } catch {
    // The page may already have resumed through another debugger action.
  }
}

async function attachTargetDebugger(mainWindow, targetId) {
  if (!targetId || debuggerTargets.has(targetId)) return;

  const targetContents = webContents.fromId(targetId);
  if (!targetContents || targetContents.isDestroyed()) return;

  const debuggerApi = targetContents.debugger;
  const target = {
    debuggerApi,
    scripts: new Map(),
    breakpoints: [],
  };

  try {
    if (!debuggerApi.isAttached()) {
      debuggerApi.attach("1.3");
    }

    debuggerTargets.set(targetId, target);
    activeDebuggerTargetId = targetId;

    debuggerApi.on("detach", () => {
      debuggerTargets.delete(targetId);
      if (activeDebuggerTargetId === targetId) {
        activeDebuggerTargetId = null;
      }
    });

    debuggerApi.on("message", (_event, method, params) => {
      if (method === "Debugger.scriptParsed") {
        target.scripts.set(params.scriptId, params.url || params.sourceMapURL || "");
        if (params.url) {
          sendToMainWindow(mainWindow, "debug-agent:debugger-script", {
            scriptId: params.scriptId,
            url: params.url,
            sourceMapURL: params.sourceMapURL,
            startLine: params.startLine,
            endLine: params.endLine,
          });
        }
        return;
      }

      if (method === "Debugger.paused") {
        handleDebuggerPaused(mainWindow, targetId, params).catch((error) => {
          console.error("[debugger:paused-handler]", error);
        });
        return;
      }

      if (method === "Network.requestWillBeSent") {
        const stack = stackTraceToFrames(params.initiator?.stack);
        const caller = stack.find((frame) => frame.sourceFile && frame.functionName);
        const requestUrl = normalizeUrlForMatch(params.request?.url || params.documentURL || "");

        if (requestUrl) {
          cdpNetworkInitiators.set(requestUrl, {
            type: params.initiator?.type || "unknown",
            caller,
            stack,
          });
        }
      }
    });

    await debuggerApi.sendCommand("Runtime.enable");
    await debuggerApi.sendCommand("Debugger.enable");
    await debuggerApi.sendCommand("Network.enable");
    await debuggerApi.sendCommand("Debugger.setPauseOnExceptions", { state: "uncaught" });
  } catch (error) {
    debuggerTargets.delete(targetId);
    console.error("[debugger:attach-failed]", error);
  }
}

async function setTargetLogpoints(options = {}) {
  const targetId = options.targetId || activeDebuggerTargetId;
  const target = debuggerTargets.get(targetId);

  if (!target) {
    return { ok: false, message: "No attached debugger target.", count: 0 };
  }

  const urlText = String(options.url || "").trim();
  const startLine = Number(options.startLine);
  const endLine = Number(options.endLine || options.startLine);

  if (!urlText || !Number.isFinite(startLine) || startLine < 1) {
    return { ok: false, message: "URL and start line are required.", count: 0 };
  }

  for (const breakpointId of target.breakpoints) {
    try {
      await target.debuggerApi.sendCommand("Debugger.removeBreakpoint", { breakpointId });
    } catch {
      // Ignore stale breakpoint ids from navigated pages.
    }
  }
  target.breakpoints = [];

  const allScripts = [...target.scripts.values()].filter(Boolean);
  const matchedUrls = allScripts.filter((scriptUrl) => scriptUrl.includes(urlText));
  const breakpointUrl = matchedUrls[0] || urlText;
  const fromLine = Math.min(startLine, endLine);
  const toLine = Math.max(startLine, endLine);
  let count = 0;

  for (let lineNumber = fromLine; lineNumber <= toLine; lineNumber += 1) {
    try {
      const result = await target.debuggerApi.sendCommand("Debugger.setBreakpointByUrl", {
        url: breakpointUrl,
        lineNumber: lineNumber - 1,
        columnNumber: 0,
      });

      if (result.breakpointId) {
        target.breakpoints.push(result.breakpointId);
        count += 1;
      }
    } catch {
      // Some lines are not executable. Keep trying the rest of the range.
    }
  }

  return {
    ok: count > 0,
    count,
    matchedUrl: breakpointUrl,
    message:
      count > 0
        ? `${count} logpoint candidate(s) applied.`
        : "No breakpoint could be applied for that URL/line range.",
  };
}

async function getTargetScriptSource(options = {}) {
  const targetId = options.targetId || activeDebuggerTargetId;
  const target = debuggerTargets.get(targetId);

  if (!target) {
    return { ok: false, message: "No attached debugger target.", source: "" };
  }

  const scriptId = String(options.scriptId || "").trim();
  if (!scriptId) {
    return { ok: false, message: "scriptId is required.", source: "" };
  }

  try {
    const result = await target.debuggerApi.sendCommand("Debugger.getScriptSource", {
      scriptId,
    });

    return {
      ok: true,
      scriptId,
      source: result.scriptSource || "",
      bytecode: result.bytecode,
    };
  } catch (error) {
    return {
      ok: false,
      scriptId,
      message: error?.message || "Failed to load script source.",
      source: "",
    };
  }
}

app.on("web-contents-created", (_event, contents) => {
  if (typeof contents.setWindowOpenHandler === "function") {
    contents.setWindowOpenHandler(({ url }) => {
      if (contents.getType() === "webview" && url) {
        contents.loadURL(url).catch(() => undefined);
      }
      return { action: "deny" };
    });
  }
});

function createWindow() {
  if (process.platform === "darwin" && app.dock) {
    app.dock.setIcon(appIconPath);
  }

  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    title: "AI Debugging Browser",
    icon: appIconPath,
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      additionalArguments: [
        `--debug-agent-target-preload=${pathToFileURL(path.join(__dirname, "target-preload.cjs")).toString()}`,
      ],
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  mainWindow.webContents.on("before-input-event", (event, input) => {
    const key = String(input.key || "").toLowerCase();
    const isToggleDevTools =
      key === "f12" ||
      (key === "i" &&
        ((input.control && input.shift) || (input.meta && input.alt)));

    if (!isToggleDevTools) return;

    event.preventDefault();
    mainWindow.webContents.toggleDevTools();
  });

  setupTargetNetworkCapture(mainWindow);

  ipcMain.removeHandler("debug-agent:attach-target-debugger");
  ipcMain.handle("debug-agent:attach-target-debugger", (_event, targetId) => {
    return attachTargetDebugger(mainWindow, targetId);
  });

  ipcMain.removeHandler("debug-agent:set-logpoints");
  ipcMain.handle("debug-agent:set-logpoints", (_event, options) => {
    return setTargetLogpoints(options);
  });

  ipcMain.removeHandler("debug-agent:get-script-source");
  ipcMain.handle("debug-agent:get-script-source", (_event, options) => {
    return getTargetScriptSource(options);
  });

  ipcMain.removeHandler("debug-agent:analyze-error");
  ipcMain.handle("debug-agent:analyze-error", (_event, payload) => {
    return analyzeErrorWithConfiguredProvider(payload);
  });

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
      console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
    });
    mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
      console.error(`[renderer:load-fail] ${errorCode} ${errorDescription} ${validatedURL}`);
    });
    mainWindow.webContents.on("render-process-gone", (_event, details) => {
      console.error("[renderer:gone]", details);
    });
    return;
  }

  mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  app.quit();
});
