import { useCallback, useEffect, useRef, useState } from "react";
import { EnvironmentBadge } from "./components/environment-badge";
import { TraceStatusBadge } from "./components/trace-status-badge";
import { BrowserView } from "./components/browser-view";
import type {
  BrowserConsoleErrorEvent,
  BrowserDomMutationEvent,
  BrowserFunctionEvent,
  BrowserNetworkEvent,
  BrowserPageEvent,
  BrowserUserActionEvent,
} from "./components/browser-view";
import { AnalysisPanel } from "./components/analysis-panel";
import type {
  DebuggerScript,
  DebuggerScriptSource,
  LogpointFormValue,
} from "./components/analysis-panel";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "./components/ui/resizable";
import { Activity, BarChart3, Moon, Play, Square, Sun } from "lucide-react";
import {
  emptyTraceSession,
  type NetworkResourceFilterSelection,
  type TraceApiCall,
  type TraceError,
  type TraceFunctionNode,
  type TraceSession,
  type TraceStatus,
  type TraceTimelineEvent,
} from "./lib/trace-data";

const DEFAULT_TARGET_URL = "https://ims.hwgeneralins.com/general/jsp/smartScanner.jsp";
const MAX_TIMELINE_EVENTS = 600;
const MAX_API_CALLS = 400;
const MAX_FUNCTION_EVENTS = 400;
const MAX_ERRORS = 120;
const MAX_CODE_LOCATIONS = 160;

function getDefaultTargetUrl() {
  return DEFAULT_TARGET_URL;
}

function appendBounded<T>(items: T[], item: T, limit: number) {
  const nextItems = [...items, item];
  return nextItems.length > limit ? nextItems.slice(nextItems.length - limit) : nextItems;
}

export default function App() {
  const [url, setUrl] = useState(getDefaultTargetUrl);
  const [trace, setTrace] = useState<TraceSession>(emptyTraceSession);
  const [debuggerScripts, setDebuggerScripts] = useState<DebuggerScript[]>([]);
  const [logpointStatus, setLogpointStatus] = useState<string>("");
  const [themeMode, setThemeMode] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    return window.localStorage.getItem("debug-agent-theme") === "dark" ? "dark" : "light";
  });
  const [runtimeInfo, setRuntimeInfo] = useState<{
    platform: string;
    runtimeLabel?: string;
    chromiumVersion?: string;
    electronVersion?: string;
  }>({ platform: "browser" });
  const [networkResourceFilter, setNetworkResourceFilter] = useState<NetworkResourceFilterSelection>([
    "xhr-fetch",
    "document",
    "script",
    "stylesheet",
    "image",
    "font",
    "other",
  ]);
  const traceStartedAtRef = useRef<number | null>(null);

  const isRecording = trace.status === "recording";
  const visibleTraceStatus: TraceStatus = trace.status;
  const runtimeLabelIncludesChromium =
    runtimeInfo.runtimeLabel?.toLowerCase().includes("chromium") ||
    (runtimeInfo.chromiumVersion ? runtimeInfo.runtimeLabel?.includes(runtimeInfo.chromiumVersion) : false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", themeMode === "dark");
    window.localStorage.setItem("debug-agent-theme", themeMode);
  }, [themeMode]);

  useEffect(() => {
    const runtime = (window as any).debugAgentRuntime;
    const chromeMatch = navigator.userAgent.match(/(?:Chrome|Chromium)\/([\d.]+)/);

    setRuntimeInfo(
      runtime?.runtimeInfo || {
        platform: runtime?.platform || "browser",
        chromiumVersion: chromeMatch?.[1],
      }
    );
  }, []);

  const getElapsedMs = useCallback(() => {
    if (!traceStartedAtRef.current) return 0;
    return Date.now() - traceStartedAtRef.current;
  }, []);

  const createEventId = useCallback((prefix: string) => {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }, []);

  const getTraceName = useCallback((targetUrl: string) => {
    try {
      return `${new URL(targetUrl).hostname} Trace`;
    } catch {
      return "Web Service Trace";
    }
  }, []);

  const handleToggleRecording = () => {
    if (isRecording) {
      const durationMs = getElapsedMs();
      setTrace((currentTrace) => ({
        ...currentTrace,
        status: "completed",
        durationMs,
        completedAt: new Date().toLocaleTimeString(),
      }));
      traceStartedAtRef.current = null;
      return;
    }

    traceStartedAtRef.current = Date.now();
    setTrace({
      ...emptyTraceSession,
      id: `trace-${Date.now()}`,
      name: getTraceName(url),
      status: "recording",
      startedAt: new Date().toLocaleTimeString(),
      timeline: [
        {
          id: createEventId("event"),
          type: "page",
          title: "Trace started",
          timestamp: "0ms",
          details: url,
        },
      ],
    });
  };

  const appendTimelineEvent = useCallback(
    (event: Omit<TraceTimelineEvent, "id" | "timestamp">) => {
      const durationMs = getElapsedMs();
      setTrace((currentTrace) => {
        if (currentTrace.status !== "recording") return currentTrace;

        return {
          ...currentTrace,
          durationMs,
          timeline: appendBounded(
            currentTrace.timeline,
            {
              ...event,
              id: createEventId("event"),
              timestamp: `${durationMs}ms`,
            },
            MAX_TIMELINE_EVENTS
          ),
        };
      });
    },
    [createEventId, getElapsedMs]
  );

  const handlePageEvent = useCallback(
    (event: BrowserPageEvent) => {
      if (event.type === "load-start") {
        appendTimelineEvent({
          type: "page",
          title: "Page load started",
          details: event.url,
        });
        return;
      }

      if (event.type === "load-stop") {
        appendTimelineEvent({
          type: "page",
          title: "Page load completed",
          details: event.url,
        });
        return;
      }

      appendTimelineEvent({
        type: "error",
        title: "Page load failed",
        details: event.errorDescription || event.url,
        status: "error",
      });
    },
    [appendTimelineEvent]
  );

  const handleConsoleError = useCallback(
    (event: BrowserConsoleErrorEvent) => {
      const durationMs = getElapsedMs();
      const source = event.sourceId || url;
      const line = event.line ?? 0;
      const error: TraceError = {
        id: createEventId("error"),
        type:
          event.type === "window-error"
            ? "WindowError"
            : event.type === "unhandled-rejection"
              ? "UnhandledPromiseRejection"
              : "ConsoleError",
        message: event.message,
        file: source,
        line,
        column: event.column,
        stackTrace: event.stackTrace || `${event.message}\n    at ${source}:${line}`,
      };

      setTrace((currentTrace) => {
        if (currentTrace.status !== "recording") return currentTrace;

        return {
          ...currentTrace,
          durationMs,
          errors: appendBounded(currentTrace.errors, error, MAX_ERRORS),
          timeline: appendBounded(
            currentTrace.timeline,
            {
              id: createEventId("event"),
              type: "error",
              title: "Console error",
              timestamp: `${durationMs}ms`,
              details: event.message,
              status: "error",
            },
            MAX_TIMELINE_EVENTS
          ),
          codeLocations: appendBounded(
            currentTrace.codeLocations,
            {
              file: source,
              line,
            },
            MAX_CODE_LOCATIONS
          ),
        };
      });
    },
    [createEventId, getElapsedMs, url]
  );

  const handleNetworkEvent = useCallback(
    (event: BrowserNetworkEvent) => {
      const durationMs = getElapsedMs();
      const statusLabel = event.status
        ? `${event.status} ${event.statusText || ""}`.trim()
        : event.statusText || "Request failed";
      const apiCall: TraceApiCall = {
        id: createEventId("api"),
        method: event.method,
        endpoint: event.url,
        status: statusLabel,
        statusType: event.ok ? "success" : "error",
        request: {
          ...event.request,
          transport: event.transport,
          latencyMs: event.latencyMs,
          pageUrl: event.pageUrl,
          initiator: event.initiator || event.request.initiator,
        },
        response: event.response || (event.error ? { error: event.error } : undefined),
      };

      setTrace((currentTrace) => {
        if (currentTrace.status !== "recording") return currentTrace;

        return {
          ...currentTrace,
          durationMs,
          apiCalls: appendBounded(currentTrace.apiCalls, apiCall, MAX_API_CALLS),
          timeline: appendBounded(
            currentTrace.timeline,
            {
              id: createEventId("event"),
              type: "api",
              title: `${event.method} ${event.url}`,
              timestamp: `${durationMs}ms`,
              details: `${statusLabel} · ${event.latencyMs}ms · ${event.transport}`,
              status: event.ok ? "success" : "error",
            },
            MAX_TIMELINE_EVENTS
          ),
        };
      });
    },
    [createEventId, getElapsedMs]
  );

  const handleFunctionEvent = useCallback(
    (event: BrowserFunctionEvent) => {
      const durationMs = getElapsedMs();
      const functionNode: TraceFunctionNode = {
        id: createEventId("fn"),
        functionName: event.functionName || "anonymous handler",
        callType: event.callType,
        sourceFile: event.sourceFile,
        line: event.line,
        column: event.column,
        parameters: {
          ...(event.pauseReason ? { pauseReason: event.pauseReason } : {}),
          ...(event.eventType ? { eventType: event.eventType } : {}),
          ...(event.target ? { target: event.target } : {}),
          pageUrl: event.pageUrl,
          ...(event.parameters || {}),
        },
        executionTime: event.durationMs,
        hasError: event.hasError,
        returnValue: event.error ? { error: event.error } : event.returnValue,
      };

      setTrace((currentTrace) => {
        if (currentTrace.status !== "recording") return currentTrace;

        return {
          ...currentTrace,
          durationMs,
          functions: appendBounded(currentTrace.functions, functionNode, MAX_FUNCTION_EVENTS),
          timeline: appendBounded(
            currentTrace.timeline,
            {
              id: createEventId("event"),
              type: "function",
              title: functionNode.functionName,
              timestamp: `${durationMs}ms`,
              details:
                event.sourceFile ||
                event.eventType ||
                event.target ||
                event.callType ||
                "function call",
              status: event.hasError ? "error" : "success",
            },
            MAX_TIMELINE_EVENTS
          ),
        };
      });
    },
    [createEventId, getElapsedMs]
  );

  const handleUserActionEvent = useCallback(
    (event: BrowserUserActionEvent) => {
      const durationMs = getElapsedMs();
      const label = event.label || event.target || "User action";
      const actionTitle =
        event.actionType === "enter"
          ? `Enter: ${label}`
          : event.actionType === "submit"
            ? `Submit: ${label}`
            : `${event.actionType}: ${label}`;

      setTrace((currentTrace) => {
        if (currentTrace.status !== "recording") return currentTrace;

        return {
          ...currentTrace,
          durationMs,
          timeline: appendBounded(
            currentTrace.timeline,
            {
              id: createEventId("event"),
              type: "action",
              title: actionTitle,
              timestamp: `${durationMs}ms`,
              details: `${event.target || "unknown target"} · ${event.pageUrl || ""}`,
            },
            MAX_TIMELINE_EVENTS
          ),
        };
      });
    },
    [createEventId, getElapsedMs]
  );

  const handleDomMutationEvent = useCallback(
    (event: BrowserDomMutationEvent) => {
      const total =
        event.addedCount + event.removedCount + event.attributeCount + event.textCount;
      if (total === 0) return;

      const summary = [
        event.addedCount ? `added ${event.addedCount}` : "",
        event.removedCount ? `removed ${event.removedCount}` : "",
        event.attributeCount ? `attrs ${event.attributeCount}` : "",
        event.textCount ? `text ${event.textCount}` : "",
      ]
        .filter(Boolean)
        .join(" · ");

      appendTimelineEvent({
        type: "dom",
        title: `DOM changed: ${summary || `${total} mutations`}`,
        details:
          event.samples?.length
            ? String(event.samples[0].target || event.samples[0].type || event.pageUrl || "")
            : event.pageUrl,
        domMutation: {
          addedCount: event.addedCount,
          removedCount: event.removedCount,
          attributeCount: event.attributeCount,
          textCount: event.textCount,
          samples: event.samples,
          trigger: event.trigger,
          pageUrl: event.pageUrl,
        },
      });
    },
    [appendTimelineEvent]
  );

  const handleApplyLogpoints = useCallback(async (options: LogpointFormValue) => {
    const runtime = (window as any).debugAgentRuntime;
    if (!runtime?.setLogpoints) {
      setLogpointStatus("Electron Debugger 연결이 필요합니다.");
      return;
    }

    setLogpointStatus("Logpoint 적용 중...");

    try {
      const result = await runtime.setLogpoints(options);
      setLogpointStatus(
        result?.message ||
          (result?.ok ? `${result.count}개 logpoint 적용됨` : "Logpoint 적용 실패")
      );
    } catch (error) {
      setLogpointStatus(error instanceof Error ? error.message : "Logpoint 적용 실패");
    }
  }, []);

  const handleLoadScriptSource = useCallback(
    async (scriptId: string): Promise<DebuggerScriptSource> => {
      const runtime = (window as any).debugAgentRuntime;
      if (!runtime?.getScriptSource) {
        return {
          ok: false,
          source: "",
          message: "Electron Debugger 연결이 필요합니다.",
        };
      }

      return runtime.getScriptSource({ scriptId });
    },
    []
  );

  useEffect(() => {
    const runtime = (window as any).debugAgentRuntime;
    if (!runtime?.onNetworkEvent) return;

    return runtime.onNetworkEvent((event: BrowserNetworkEvent) => {
      handleNetworkEvent(event);
    });
  }, [handleNetworkEvent]);

  useEffect(() => {
    const runtime = (window as any).debugAgentRuntime;
    if (!runtime?.onFunctionEvent) return;

    return runtime.onFunctionEvent((event: BrowserFunctionEvent) => {
      handleFunctionEvent(event);
    });
  }, [handleFunctionEvent]);

  useEffect(() => {
    const runtime = (window as any).debugAgentRuntime;
    if (!runtime?.onDebuggerScript) return;

    return runtime.onDebuggerScript((script: DebuggerScript) => {
      if (!script.url) return;

      setDebuggerScripts((currentScripts) => {
        if (currentScripts.some((currentScript) => currentScript.scriptId === script.scriptId)) {
          return currentScripts;
        }

        return [...currentScripts, script].slice(-300);
      });
    });
  }, []);

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3 dark:bg-muted">
            <div className="flex items-center gap-3">
              <h1 className="flex items-center gap-2 text-foreground">
                <Activity className="w-5 h-5 text-[var(--color-electric-blue)]" />
                AI Debugging Browser
              </h1>
              <EnvironmentBadge environment={trace.environment} />
              <TraceStatusBadge status={visibleTraceStatus} />
              {runtimeInfo.chromiumVersion && (
                <span
                  className="rounded border border-border bg-muted px-2 py-1 text-[11px] text-muted-foreground dark:border-border dark:bg-card dark:text-foreground"
                  title={
                    runtimeInfo.electronVersion
                      ? `Electron ${runtimeInfo.electronVersion}`
                      : runtimeInfo.platform
                  }
                >
                  {runtimeInfo.runtimeLabel
                    ? runtimeLabelIncludesChromium
                      ? runtimeInfo.runtimeLabel
                      : `${runtimeInfo.runtimeLabel} · Chromium ${runtimeInfo.chromiumVersion}`
                    : `Chromium ${runtimeInfo.chromiumVersion}`}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <BarChart3 className="w-3.5 h-3.5" />
                <span>{trace.name}</span>
                <span>Duration: {trace.durationMs}ms</span>
                <span className="text-[var(--color-error)]">{trace.errors.length} errors</span>
                <span className="text-[var(--color-electric-blue)]">
                  {trace.apiCalls.length} requests
                </span>
                <span className="text-[var(--color-success)]">
                  {trace.timeline.length} events
                </span>
              </div>
              <button
                type="button"
                onClick={() => setThemeMode((currentMode) => (currentMode === "dark" ? "light" : "dark"))}
                className="flex h-8 w-8 items-center justify-center rounded border border-border bg-card text-muted-foreground transition-colors hover:border-[var(--color-electric-blue)] hover:text-[var(--color-electric-blue)] dark:border-border dark:bg-card dark:text-foreground dark:hover:border-[var(--color-electric-blue)] dark:hover:text-white"
                title={themeMode === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
                aria-label={themeMode === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
              >
                {themeMode === "dark" ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </button>
              <button
                type="button"
                onClick={handleToggleRecording}
                className={`flex items-center gap-2 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                  isRecording
                    ? "bg-[var(--color-error)] text-white hover:bg-[var(--color-error)]/85"
                    : "bg-[var(--color-electric-blue)] text-white hover:bg-[var(--color-electric-blue)]/85"
                }`}
              >
                {isRecording ? (
                  <>
                    <Square className="h-3.5 w-3.5 fill-current" />
                    Stop
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 fill-current" />
                    Start Trace
                  </>
                )}
              </button>
            </div>
          </div>

          <ResizablePanelGroup direction="horizontal" className="flex-1 overflow-hidden">
            <ResizablePanel defaultSize={62} minSize={35}>
              <BrowserView
                url={url}
                isRecording={isRecording}
                onUrlChange={setUrl}
                onConsoleError={handleConsoleError}
                onFunctionEvent={handleFunctionEvent}
                onNetworkEvent={handleNetworkEvent}
                onPageEvent={handlePageEvent}
                onUserActionEvent={handleUserActionEvent}
                onDomMutationEvent={handleDomMutationEvent}
              />
            </ResizablePanel>
            <ResizableHandle
              withHandle
              className="w-2 cursor-col-resize bg-muted transition-colors after:w-px after:bg-border hover:after:w-1 hover:after:bg-[#f36910] data-[resize-handle-active]:after:w-1 data-[resize-handle-active]:after:bg-[#f36910] dark:bg-muted dark:after:bg-[#686868] [&>div]:h-9 [&>div]:w-1.5 [&>div]:rounded-full [&>div]:border-border [&>div]:bg-border [&>div]:text-transparent [&>div]:transition-colors hover:[&>div]:border-[#f36910] hover:[&>div]:bg-[#f36910] data-[resize-handle-active]:[&>div]:border-[#f36910] data-[resize-handle-active]:[&>div]:bg-[#f36910] dark:[&>div]:border-border dark:[&>div]:bg-[#686868]"
            />
            <ResizablePanel defaultSize={38} minSize={28}>
              <AnalysisPanel
                trace={trace}
                debuggerScripts={debuggerScripts}
                logpointStatus={logpointStatus}
                networkResourceFilter={networkResourceFilter}
                onNetworkResourceFilterChange={setNetworkResourceFilter}
                onApplyLogpoints={handleApplyLogpoints}
                onLoadScriptSource={handleLoadScriptSource}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
    </div>
  );
}
