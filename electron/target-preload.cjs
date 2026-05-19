function reportDebugAgentError(type, payload) {
  try {
    console.error(`[AI_FLOW_DEBUG:${type}] ${JSON.stringify(payload)}`);
  } catch {
    console.error(`[AI_FLOW_DEBUG:${type}] Failed to serialize error payload`);
  }
}

function reportDebugAgentNetwork(payload) {
  try {
    console.error(`[AI_FLOW_DEBUG:network] ${JSON.stringify(payload)}`);
  } catch {
    console.error("[AI_FLOW_DEBUG:network] Failed to serialize network payload");
  }
}

function reportDebugAgentFunction(payload) {
  try {
    console.error(`[AI_FLOW_DEBUG:function] ${JSON.stringify(payload)}`);
  } catch {
    console.error("[AI_FLOW_DEBUG:function] Failed to serialize function payload");
  }
}

function reportDebugAgentAction(payload) {
  try {
    console.error(`[AI_FLOW_DEBUG:action] ${JSON.stringify(payload)}`);
  } catch {
    console.error("[AI_FLOW_DEBUG:action] Failed to serialize action payload");
  }
}

let lastDebugAgentAction = null;

function reportDebugAgentDom(payload) {
  try {
    console.error(`[AI_FLOW_DEBUG:dom] ${JSON.stringify(payload)}`);
  } catch {
    console.error("[AI_FLOW_DEBUG:dom] Failed to serialize dom payload");
  }
}

function serializeDebugAgentValue(value, maxDepth = 3, seen = new WeakSet()) {
  if (value == null) return value;
  if (typeof value === "string") return truncateValue(value, 1000);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return `${value.toString()}n`;
  if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[Circular]";
  if (maxDepth <= 0) return Array.isArray(value) ? "[Array]" : "[Object]";

  seen.add(value);

  if (Array.isArray(value)) {
    return value.slice(0, 30).map((item) => serializeDebugAgentValue(item, maxDepth - 1, seen));
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (value instanceof Event) {
    return getEventParameters(value);
  }

  const output = {};
  Object.keys(value)
    .slice(0, 50)
    .forEach((key) => {
      try {
        output[key] = serializeDebugAgentValue(value[key], maxDepth - 1, seen);
      } catch {
        output[key] = "[Unreadable]";
      }
    });

  return output;
}

function getStackLocation(stack, skipPatterns = []) {
  if (!stack) return {};

  const lines = String(stack).split("\n").slice(1);
  const line = lines.find((stackLine) => {
    return ![
      "getStackLocation",
      "traceFunctionCall",
      "wrapFunction",
      "__AI_FLOW_DEBUG__",
      "target-preload.cjs",
      ...skipPatterns,
    ].some((pattern) => stackLine.includes(pattern));
  });

  if (!line) return {};

  const match =
    line.match(/\(?(.+):(\d+):(\d+)\)?$/) ||
    line.match(/at\s+(.+)\s+\((.+):(\d+):(\d+)\)/);

  if (!match) return { sourceFile: line.trim() };

  if (match.length === 5) {
    return {
      sourceFile: match[2],
      line: Number(match[3]),
      column: Number(match[4]),
    };
  }

  return {
    sourceFile: match[1],
    line: Number(match[2]),
    column: Number(match[3]),
  };
}

function getFunctionName(fn, fallbackName) {
  return fallbackName || fn?.displayName || fn?.name || "anonymous";
}

function traceFunctionCall(meta, fn, args, thisArg) {
  const startedAt = performance.now();
  const location = {
    ...getStackLocation(new Error().stack),
    ...(meta.sourceFile ? { sourceFile: meta.sourceFile } : {}),
    ...(meta.line ? { line: meta.line } : {}),
    ...(meta.column ? { column: meta.column } : {}),
  };

  try {
    const result = fn.apply(thisArg, args);

    if (result && typeof result.then === "function") {
      return result.then(
        (resolvedValue) => {
          reportDebugAgentFunction({
            callType: "instrumented",
            functionName: getFunctionName(fn, meta.name),
            sourceFile: location.sourceFile,
            line: location.line,
            column: location.column,
            parameters: serializeDebugAgentValue(args),
            returnValue: serializeDebugAgentValue(resolvedValue),
            durationMs: Math.round(performance.now() - startedAt),
            hasError: false,
            pageUrl: window.location.href,
          });
          return resolvedValue;
        },
        (error) => {
          reportDebugAgentFunction({
            callType: "instrumented",
            functionName: getFunctionName(fn, meta.name),
            sourceFile: location.sourceFile,
            line: location.line,
            column: location.column,
            parameters: serializeDebugAgentValue(args),
            error: serializeDebugAgentValue(error),
            durationMs: Math.round(performance.now() - startedAt),
            hasError: true,
            pageUrl: window.location.href,
          });
          throw error;
        }
      );
    }

    reportDebugAgentFunction({
      callType: "instrumented",
      functionName: getFunctionName(fn, meta.name),
      sourceFile: location.sourceFile,
      line: location.line,
      column: location.column,
      parameters: serializeDebugAgentValue(args),
      returnValue: serializeDebugAgentValue(result),
      durationMs: Math.round(performance.now() - startedAt),
      hasError: false,
      pageUrl: window.location.href,
    });

    return result;
  } catch (error) {
    reportDebugAgentFunction({
      callType: "instrumented",
      functionName: getFunctionName(fn, meta.name),
      sourceFile: location.sourceFile,
      line: location.line,
      column: location.column,
      parameters: serializeDebugAgentValue(args),
      error: serializeDebugAgentValue(error),
      durationMs: Math.round(performance.now() - startedAt),
      hasError: true,
      pageUrl: window.location.href,
    });
    throw error;
  }
}

function truncateValue(value, maxLength = 2000) {
  if (value == null) return value;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function headersToObject(headers) {
  try {
    return Object.fromEntries(new Headers(headers).entries());
  } catch {
    return {};
  }
}

function getFetchRequest(input, init) {
  const request = input instanceof Request ? input : null;
  const url = request?.url || String(input);
  const method = init?.method || request?.method || "GET";
  const headers = init?.headers || request?.headers;
  const body = init?.body;

  return {
    url,
    method,
    headers: headersToObject(headers),
    body: truncateValue(body),
  };
}

function getElementSelector(target) {
  if (!target || target === window) return "window";
  if (target === document) return "document";
  if (!target.tagName) return target.constructor?.name || "unknown";

  const tagName = target.tagName.toLowerCase();
  const id = target.id ? `#${target.id}` : "";
  const className =
    typeof target.className === "string" && target.className.trim()
      ? `.${target.className.trim().split(/\s+/).slice(0, 3).join(".")}`
      : "";
  const name = target.getAttribute?.("name");
  const role = target.getAttribute?.("role");
  const extra = name ? `[name="${name}"]` : role ? `[role="${role}"]` : "";

  return `${tagName}${id}${className}${extra}`;
}

function getNodeSelector(node) {
  if (!node) return "unknown";
  if (node.nodeType === Node.TEXT_NODE) return `${getElementSelector(node.parentElement)}::text`;
  if (node.nodeType !== Node.ELEMENT_NODE) return node.nodeName || "node";
  return getElementSelector(node);
}

function getNodePreview(node) {
  if (!node) return "";
  if (node.nodeType === Node.TEXT_NODE) return truncateValue(node.textContent?.trim() || "", 160);
  if (node.nodeType !== Node.ELEMENT_NODE) return node.nodeName || "";

  const text = node.innerText || node.textContent || "";
  const html = node.outerHTML || text;
  return truncateValue(text.trim() || html.replace(/\s+/g, " ").trim(), 220);
}

function getRecentDomTrigger() {
  if (!lastDebugAgentAction) return undefined;

  const ageMs = Date.now() - lastDebugAgentAction.time;
  if (ageMs > 3000) return undefined;

  return {
    type: "user-action",
    actionType: lastDebugAgentAction.actionType,
    label: lastDebugAgentAction.label,
    target: lastDebugAgentAction.target,
    ageMs,
  };
}

function startDomMutationObserver() {
  const root = document.documentElement || document.body;
  if (!root || typeof MutationObserver !== "function") return;

  let pending = {
    addedCount: 0,
    removedCount: 0,
    attributeCount: 0,
    textCount: 0,
    samples: [],
  };
  let flushTimer = null;

  const addSample = (sample) => {
    if (pending.samples.length >= 8) return;
    pending.samples.push(sample);
  };

  const flush = () => {
    flushTimer = null;
    const total =
      pending.addedCount +
      pending.removedCount +
      pending.attributeCount +
      pending.textCount;

    if (total === 0) return;

    reportDebugAgentDom({
      addedCount: pending.addedCount,
      removedCount: pending.removedCount,
      attributeCount: pending.attributeCount,
      textCount: pending.textCount,
      samples: pending.samples,
      trigger: getRecentDomTrigger(),
      pageUrl: window.location.href,
    });

    pending = {
      addedCount: 0,
      removedCount: 0,
      attributeCount: 0,
      textCount: 0,
      samples: [],
    };
  };

  const scheduleFlush = () => {
    if (flushTimer) return;
    flushTimer = window.setTimeout(flush, 250);
  };

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === "childList") {
        pending.addedCount += mutation.addedNodes.length;
        pending.removedCount += mutation.removedNodes.length;

        if (mutation.addedNodes.length > 0) {
          addSample({
            type: "added",
            target: getElementSelector(mutation.target),
            nodes: Array.from(mutation.addedNodes).slice(0, 3).map((node) => ({
              selector: getNodeSelector(node),
              preview: getNodePreview(node),
            })),
          });
        }

        if (mutation.removedNodes.length > 0) {
          addSample({
            type: "removed",
            target: getElementSelector(mutation.target),
            nodes: Array.from(mutation.removedNodes).slice(0, 3).map((node) => ({
              selector: getNodeSelector(node),
              preview: getNodePreview(node),
            })),
          });
        }
      }

      if (mutation.type === "attributes") {
        pending.attributeCount += 1;
        addSample({
          type: "attribute",
          target: getElementSelector(mutation.target),
          attributeName: mutation.attributeName,
          oldValue: truncateValue(mutation.oldValue, 300),
          newValue: truncateValue(mutation.target.getAttribute?.(mutation.attributeName), 300),
        });
      }

      if (mutation.type === "characterData") {
        pending.textCount += 1;
        addSample({
          type: "text",
          target: getNodeSelector(mutation.target),
          oldValue: truncateValue(mutation.oldValue, 300),
          newValue: truncateValue(mutation.target.textContent, 300),
        });
      }
    });

    scheduleFlush();
  });

  observer.observe(root, {
    attributes: true,
    attributeOldValue: true,
    childList: true,
    characterData: true,
    characterDataOldValue: true,
    subtree: true,
  });
}

function getEventParameters(event) {
  return {
    eventType: event?.type,
    target: getElementSelector(event?.target),
    currentTarget: getElementSelector(event?.currentTarget),
    value:
      event?.target &&
      "value" in event.target &&
      typeof event.target.value === "string"
        ? truncateValue(event.target.value, 300)
        : undefined,
    checked:
      event?.target && "checked" in event.target ? event.target.checked : undefined,
    key: event?.key,
    button: event?.button,
    href: event?.target?.closest?.("a")?.href,
    pageUrl: window.location.href,
  };
}

function getElementLabel(target) {
  if (!target || !target.closest) return "";

  const element = target.closest(
    "button, a, input, textarea, select, [role='button'], [aria-label], [data-testid]"
  );

  if (!element) return "";

  const ariaLabel = element.getAttribute?.("aria-label");
  const testId = element.getAttribute?.("data-testid");
  const placeholder = element.getAttribute?.("placeholder");
  const name = element.getAttribute?.("name");
  const value =
    "value" in element && typeof element.value === "string"
      ? truncateValue(element.value, 120)
      : "";
  const text = element.innerText || element.textContent || "";

  return truncateValue(
    ariaLabel || text.trim() || placeholder || name || testId || value || element.tagName,
    160
  );
}

function getMeaningfulActionTarget(event) {
  const target = event?.target;
  if (!target || !target.closest) return null;

  if (event.type === "submit") {
    return target.closest("form");
  }

  if (event.type === "keydown") {
    if (event.key !== "Enter") return null;
    return target.closest("input, textarea, [contenteditable='true']");
  }

  if (event.type === "change") {
    return target.closest("input, textarea, select");
  }

  return target.closest("button, a, [role='button'], input[type='button'], input[type='submit']");
}

function reportMeaningfulAction(event) {
  const actionTarget = getMeaningfulActionTarget(event);
  if (!actionTarget) return;

  const label = getElementLabel(actionTarget);
  const params = getEventParameters(event);
  const payload = {
    actionType:
      event.type === "keydown"
        ? "enter"
        : event.type === "submit"
          ? "submit"
          : event.type,
    label,
    target: getElementSelector(actionTarget),
    parameters: params,
    pageUrl: window.location.href,
  };

  lastDebugAgentAction = {
    ...payload,
    time: Date.now(),
  };

  reportDebugAgentAction(payload);
}

window.addEventListener("error", (event) => {
  reportDebugAgentError("window-error", {
    message: event.message,
    source: event.filename,
    line: event.lineno,
    column: event.colno,
    stack: event.error?.stack,
    url: window.location.href,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;

  reportDebugAgentError("unhandled-rejection", {
    message:
      reason?.message ||
      reason?.toString?.() ||
      "Unhandled promise rejection",
    stack: reason?.stack,
    url: window.location.href,
  });
});

Object.defineProperty(window, "__AI_FLOW_DEBUG__", {
  configurable: true,
  value: {
    traceFunction(nameOrMeta, fn) {
      const meta =
        typeof nameOrMeta === "string" ? { name: nameOrMeta } : nameOrMeta || {};

      if (typeof fn !== "function") {
        throw new TypeError("__AI_FLOW_DEBUG__.traceFunction requires a function");
      }

      return function debugAgentInstrumentedFunction(...args) {
        return traceFunctionCall(meta, fn, args, this);
      };
    },
    recordFunction(meta = {}) {
      reportDebugAgentFunction({
        callType: "manual",
        functionName: meta.name || meta.functionName || "manual trace",
        sourceFile: meta.sourceFile,
        line: meta.line,
        column: meta.column,
        parameters: serializeDebugAgentValue(meta.parameters || {}),
        returnValue: serializeDebugAgentValue(meta.returnValue),
        error: serializeDebugAgentValue(meta.error),
        durationMs: meta.durationMs,
        hasError: Boolean(meta.error || meta.hasError),
        pageUrl: window.location.href,
      });
    },
  },
});

["click", "submit", "keydown", "change"].forEach((eventType) => {
  window.addEventListener(eventType, reportMeaningfulAction, true);
});

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", startDomMutationObserver, { once: true });
} else {
  startDomMutationObserver();
}

const originalFetch = window.fetch;
if (typeof originalFetch === "function") {
  window.fetch = async (...args) => {
    const startedAt = performance.now();
    const request = getFetchRequest(args[0], args[1]);

    try {
      const response = await originalFetch(...args);
      const responseClone = response.clone();
      let responsePreview;

      try {
        responsePreview = truncateValue(await responseClone.text());
      } catch {
        responsePreview = undefined;
      }

      reportDebugAgentNetwork({
        transport: "fetch",
        method: request.method,
        url: request.url,
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        latencyMs: Math.round(performance.now() - startedAt),
        request,
        response: {
          headers: headersToObject(response.headers),
          bodyPreview: responsePreview,
        },
        pageUrl: window.location.href,
      });

      return response;
    } catch (error) {
      reportDebugAgentNetwork({
        transport: "fetch",
        method: request.method,
        url: request.url,
        status: 0,
        statusText: "Request failed",
        ok: false,
        latencyMs: Math.round(performance.now() - startedAt),
        request,
        error: error?.message || String(error),
        pageUrl: window.location.href,
      });

      throw error;
    }
  };
}

const OriginalXMLHttpRequest = window.XMLHttpRequest;
if (typeof OriginalXMLHttpRequest === "function") {
  window.XMLHttpRequest = function DebugAgentXMLHttpRequest() {
    const xhr = new OriginalXMLHttpRequest();
    const meta = {
      method: "GET",
      url: "",
      headers: {},
      body: undefined,
      startedAt: 0,
    };

    const originalOpen = xhr.open;
    xhr.open = function open(method, url, ...rest) {
      meta.method = method || "GET";
      meta.url = String(url);
      return originalOpen.call(xhr, method, url, ...rest);
    };

    const originalSetRequestHeader = xhr.setRequestHeader;
    xhr.setRequestHeader = function setRequestHeader(name, value) {
      meta.headers[name] = value;
      return originalSetRequestHeader.call(xhr, name, value);
    };

    const originalSend = xhr.send;
    xhr.send = function send(body) {
      meta.body = truncateValue(body);
      meta.startedAt = performance.now();
      return originalSend.call(xhr, body);
    };

    xhr.addEventListener("loadend", () => {
      reportDebugAgentNetwork({
        transport: "xhr",
        method: meta.method,
        url: meta.url,
        status: xhr.status,
        statusText: xhr.statusText,
        ok: xhr.status >= 200 && xhr.status < 400,
        latencyMs: Math.round(performance.now() - meta.startedAt),
        request: {
          method: meta.method,
          url: meta.url,
          headers: meta.headers,
          body: meta.body,
        },
        response: {
          bodyPreview: truncateValue(xhr.responseText),
        },
        pageUrl: window.location.href,
      });
    });

    return xhr;
  };
}
