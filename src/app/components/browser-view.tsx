import { RefreshCw, ArrowLeft, ArrowRight, Home } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";

interface BrowserViewProps {
  url: string;
  isRecording: boolean;
  onUrlChange: (url: string) => void;
  onConsoleError: (event: BrowserConsoleErrorEvent) => void;
  onFunctionEvent: (event: BrowserFunctionEvent) => void;
  onNetworkEvent: (event: BrowserNetworkEvent) => void;
  onPageEvent: (event: BrowserPageEvent) => void;
  onUserActionEvent: (event: BrowserUserActionEvent) => void;
  onDomMutationEvent: (event: BrowserDomMutationEvent) => void;
}

export interface BrowserConsoleErrorEvent {
  message: string;
  sourceId?: string;
  line?: number;
  column?: number;
  level?: number;
  type?: string;
  stackTrace?: string;
}

export interface BrowserPageEvent {
  type: "load-start" | "load-stop" | "load-fail";
  url: string;
  errorDescription?: string;
}

export interface BrowserNetworkEvent {
  transport: "fetch" | "xhr" | "webRequest";
  method: string;
  url: string;
  status: number;
  statusText?: string;
  ok: boolean;
  latencyMs: number;
  request: Record<string, unknown>;
  response?: Record<string, unknown>;
  error?: string;
  initiator?: Record<string, unknown>;
  pageUrl?: string;
}

export interface BrowserFunctionEvent {
  functionName: string;
  callType?: "instrumented" | "manual" | "event-listener" | "devtools-paused";
  pauseReason?: string;
  sourceFile?: string;
  line?: number;
  column?: number;
  eventType?: string;
  target?: string;
  parameters?: Record<string, unknown>;
  returnValue?: unknown;
  durationMs?: number;
  hasError?: boolean;
  error?: unknown;
  pageUrl?: string;
}

export interface BrowserUserActionEvent {
  actionType: string;
  label?: string;
  target?: string;
  parameters?: Record<string, unknown>;
  pageUrl?: string;
}

export interface BrowserDomMutationEvent {
  addedCount: number;
  removedCount: number;
  attributeCount: number;
  textCount: number;
  samples?: Array<Record<string, unknown>>;
  trigger?: Record<string, unknown>;
  pageUrl?: string;
}

export function BrowserView({
  url,
  isRecording,
  onUrlChange,
  onConsoleError,
  onFunctionEvent,
  onNetworkEvent,
  onPageEvent,
  onUserActionEvent,
  onDomMutationEvent,
}: BrowserViewProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [webviewReady, setWebviewReady] = useState(false);
  const [draftUrl, setDraftUrl] = useState(url);
  const webviewRef = useRef<any>(null);
  const isWebviewReadyRef = useRef(false);
  const normalizedUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  const homeUrlRef = useRef(normalizedUrl);
  const initialWebviewUrlRef = useRef(normalizedUrl);
  const lastRequestedUrlRef = useRef(normalizedUrl);
  const runtime = (window as any).debugAgentRuntime;
  const isElectron = Boolean(runtime);
  const targetPreloadPath = runtime?.targetPreloadPath;

  useEffect(() => {
    setDraftUrl(url);
  }, [url]);

  const normalizeForCompare = (targetUrl: string) => {
    try {
      const parsedUrl = new URL(targetUrl);
      return `${parsedUrl.origin}${parsedUrl.pathname.replace(/\/$/, "")}${parsedUrl.search}${parsedUrl.hash}`;
    } catch {
      return targetUrl.replace(/\/$/, "");
    }
  };

  const getCurrentUrl = () => {
    const webview = webviewRef.current;
    if (!webview || !isWebviewReadyRef.current) return normalizedUrl;

    try {
      return webview.getURL?.() || normalizedUrl;
    } catch {
      return normalizedUrl;
    }
  };

  const syncNavigationState = () => {
    const webview = webviewRef.current;
    if (!webview || !isWebviewReadyRef.current) return;

    try {
      setCanGoBack(Boolean(webview.canGoBack?.()));
      setCanGoForward(Boolean(webview.canGoForward?.()));

      const currentUrl = webview.getURL?.();
      if (currentUrl) {
        lastRequestedUrlRef.current = currentUrl;
        onUrlChange(currentUrl);
      }
    } catch {
      setCanGoBack(false);
      setCanGoForward(false);
    }
  };

  const reloadPage = () => {
    const webview = webviewRef.current;
    if (!webview || !isWebviewReadyRef.current) return;

    setIsLoading(true);
    webview.reload();
  };

  const goBack = () => {
    const webview = webviewRef.current;
    if (isWebviewReadyRef.current && webview?.canGoBack?.()) {
      webview.goBack();
    }
  };

  const goForward = () => {
    const webview = webviewRef.current;
    if (isWebviewReadyRef.current && webview?.canGoForward?.()) {
      webview.goForward();
    }
  };

  const goHome = () => {
    const webview = webviewRef.current;
    if (!webview || !isWebviewReadyRef.current) return;

    lastRequestedUrlRef.current = homeUrlRef.current;
    webview.loadURL(homeUrlRef.current).catch?.(() => undefined);
  };

  const navigateToDraftUrl = (event: FormEvent) => {
    event.preventDefault();
    const nextUrl = draftUrl.trim();
    if (!nextUrl) return;

    onUrlChange(nextUrl);
  };

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    const handleDomReady = () => {
      isWebviewReadyRef.current = true;
      setWebviewReady(true);
      syncNavigationState();

      try {
        const webContentsId = webview.getWebContentsId?.();
        runtime?.attachTargetDebugger?.(webContentsId);
      } catch {
        // The webview may not expose a webContents id in non-Electron fallbacks.
      }
    };

    const handleLoadStart = () => {
      setIsLoading(true);
      onPageEvent({ type: "load-start", url: getCurrentUrl() });
    };

    const handleLoadStop = () => {
      setIsLoading(false);
      syncNavigationState();
      onPageEvent({ type: "load-stop", url: getCurrentUrl() });
    };

    const handleLoadFail = (event: any) => {
      setIsLoading(false);
      onPageEvent({
        type: "load-fail",
        url: event.validatedURL || event.url || normalizedUrl,
        errorDescription: event.errorDescription,
      });
    };

    const handleNavigate = () => {
      syncNavigationState();
    };

    const handleConsoleMessage = (event: any) => {
      const level = Number(event.level ?? event.detail?.level ?? 0);
      if (level < 2) return;

      const message = event.message || event.detail?.message || "Unknown console error";
      const debugAgentMatch = message.match(/^\[AI_FLOW_DEBUG:([^\]]+)\]\s+(.+)$/);

      if (debugAgentMatch) {
        try {
          const payload = JSON.parse(debugAgentMatch[2]);
          if (debugAgentMatch[1] === "network") {
            onNetworkEvent(payload);
            return;
          }

          if (debugAgentMatch[1] === "function") {
            onFunctionEvent(payload);
            return;
          }

          if (debugAgentMatch[1] === "action") {
            onUserActionEvent(payload);
            return;
          }

          if (debugAgentMatch[1] === "dom") {
            onDomMutationEvent(payload);
            return;
          }

          onConsoleError({
            level,
            type: debugAgentMatch[1],
            message: payload.message || message,
            sourceId: payload.source || payload.url || event.sourceId || event.detail?.sourceId,
            line: payload.line || event.line || event.detail?.line,
            column: payload.column,
            stackTrace: payload.stack,
          });
          return;
        } catch {
          // Fall through to regular console error handling.
        }
      }

      onConsoleError({
        level,
        message,
        sourceId: event.sourceId || event.detail?.sourceId,
        line: event.line || event.detail?.line,
      });
    };

    const handleNewWindow = (event: any) => {
      event.preventDefault?.();
      const targetUrl = event.url || event.detail?.url;
      if (!targetUrl) return;

      lastRequestedUrlRef.current = targetUrl;
      webview.loadURL(targetUrl).catch?.(() => undefined);
      onPageEvent({
        type: "load-start",
        url: targetUrl,
      });
    };

    webview.addEventListener("dom-ready", handleDomReady);
    webview.addEventListener("did-start-loading", handleLoadStart);
    webview.addEventListener("did-stop-loading", handleLoadStop);
    webview.addEventListener("did-fail-load", handleLoadFail);
    webview.addEventListener("did-navigate", handleNavigate);
    webview.addEventListener("did-navigate-in-page", handleNavigate);
    webview.addEventListener("console-message", handleConsoleMessage);
    webview.addEventListener("new-window", handleNewWindow);

    return () => {
      webview.removeEventListener("dom-ready", handleDomReady);
      webview.removeEventListener("did-start-loading", handleLoadStart);
      webview.removeEventListener("did-stop-loading", handleLoadStop);
      webview.removeEventListener("did-fail-load", handleLoadFail);
      webview.removeEventListener("did-navigate", handleNavigate);
      webview.removeEventListener("did-navigate-in-page", handleNavigate);
      webview.removeEventListener("console-message", handleConsoleMessage);
      webview.removeEventListener("new-window", handleNewWindow);
    };
  }, [
    normalizedUrl,
    onConsoleError,
    onFunctionEvent,
    onNetworkEvent,
    onPageEvent,
    onUrlChange,
    onUserActionEvent,
    onDomMutationEvent,
  ]);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview || !isElectron || !webviewReady) return;

    const currentUrl = getCurrentUrl();
    const requestedUrl = normalizeForCompare(normalizedUrl);
    const lastRequestedUrl = normalizeForCompare(lastRequestedUrlRef.current);

    if (requestedUrl === lastRequestedUrl) return;

    if (
      currentUrl &&
      normalizeForCompare(currentUrl) !== requestedUrl
    ) {
      lastRequestedUrlRef.current = normalizedUrl;
      webview.loadURL(normalizedUrl).catch?.(() => undefined);
    }
  }, [isElectron, normalizedUrl, webviewReady]);

  return (
    <div className="h-full flex flex-col bg-background dark:bg-[#444444]">
      {/* Browser Controls */}
      <form
        onSubmit={navigateToDraftUrl}
        className="flex items-center gap-2 border-b border-border bg-muted px-3 py-2 dark:border-border dark:bg-[#3f3f3f]"
      >
        <button
          type="button"
          onClick={goBack}
          disabled={!canGoBack}
          className="rounded p-1.5 transition-colors hover:bg-muted disabled:opacity-40 dark:hover:bg-muted"
        >
          <ArrowLeft className="w-4 h-4 text-muted-foreground" />
        </button>
        <button
          type="button"
          onClick={goForward}
          disabled={!canGoForward}
          className="rounded p-1.5 transition-colors hover:bg-muted disabled:opacity-40 dark:hover:bg-muted"
        >
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
        </button>
        <button
          type="button"
          onClick={reloadPage}
          className="rounded p-1.5 transition-colors hover:bg-muted dark:hover:bg-muted"
        >
          <RefreshCw className={`w-4 h-4 text-muted-foreground ${isLoading ? "animate-spin" : ""}`} />
        </button>
        <button
          type="button"
          onClick={goHome}
          className="rounded p-1.5 transition-colors hover:bg-muted dark:hover:bg-muted"
        >
          <Home className="w-4 h-4 text-muted-foreground" />
        </button>
        <input
          type="text"
          value={draftUrl}
          onChange={(event) => setDraftUrl(event.target.value)}
          className="flex-1 rounded border border-border bg-card px-3 py-1.5 text-xs text-foreground shadow-sm focus:border-[var(--color-electric-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--color-electric-blue)]/15 dark:border-border dark:bg-card dark:text-foreground"
          placeholder="https://ims.hwgeneralins.com/general/jsp/smartScanner.jsp"
        />
        <button
          type="submit"
          className="px-2 py-1.5 rounded text-xs bg-[var(--color-electric-blue)] text-white hover:bg-[var(--color-electric-blue)]/80 transition-colors"
        >
          Go
        </button>
      </form>

      {/* Browser Content */}
      <div className="relative flex-1 overflow-hidden bg-background dark:bg-[#444444]">
        {isElectron ? (
          <webview
            ref={webviewRef}
            src={initialWebviewUrlRef.current}
            className="absolute inset-2 h-[calc(100%-1rem)] w-[calc(100%-1rem)] border border-border bg-card shadow-sm dark:border-border"
            allowpopups="true"
            partition="persist:debug-agent-target"
            preload={targetPreloadPath}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-background p-8">
            <div className="max-w-md text-center">
              <h1 className="text-2xl font-semibold text-foreground mb-3">
                Electron webview is required
              </h1>
              <p className="text-sm text-muted-foreground leading-6">
                External sites like Naver often block iframe embedding in a normal browser.
                Run the Electron test environment to load {normalizedUrl} inside the app.
              </p>
              <div className="mt-5 rounded border border-border bg-card px-3 py-2 text-sm font-mono text-muted-foreground">
                npm run electron:dev
              </div>
            </div>
          </div>
        )}

        {/* Recording Overlay */}
        {isRecording && (
          <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1.5 bg-red-500 text-white rounded-full text-xs font-medium shadow-lg">
            <span className="w-2 h-2 bg-card rounded-full animate-pulse" />
            Recording
          </div>
        )}
      </div>
    </div>
  );
}
