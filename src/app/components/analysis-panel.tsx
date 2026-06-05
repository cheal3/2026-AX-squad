import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import {
  AlertCircle,
  Bot,
  ChevronDown,
  Clock,
  Code2,
  GitBranch,
  Globe,
  Maximize2,
  MousePointer,
  PanelBottomClose,
  PanelBottomOpen,
  PanelRightClose,
  PanelRightOpen,
  Search,
  Server,
  Sparkles,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { ErrorCard } from "./error-card";
import { JSONViewer } from "./json-viewer";
import { TimelineItem } from "./timeline-item";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import type {
  NetworkResourceFilter,
  NetworkResourceFilterSelection,
  TraceApiCall,
  TraceError,
  TraceFunctionNode,
  TraceSession,
  TraceTimelineEvent,
} from "../lib/trace-data";

interface AnalysisPanelProps {
  trace: TraceSession;
  debuggerScripts: DebuggerScript[];
  logpointStatus?: string;
  networkResourceFilter: NetworkResourceFilterSelection;
  onNetworkResourceFilterChange: (filter: NetworkResourceFilterSelection) => void;
  onApplyLogpoints: (options: LogpointFormValue) => void;
  onLoadScriptSource: (scriptId: string) => Promise<DebuggerScriptSource>;
}

type DebugTab = "timeline" | "network" | "flow" | "errors";
type FlowStoryType = "scenario" | "action" | "function" | "api" | "error" | "page" | "dom";

interface FlowStoryItem {
  id: string;
  type: FlowStoryType;
  title: string;
  subtitle?: string;
  timestamp: string;
  status?: "success" | "error";
  functionNode?: TraceFunctionNode;
  apiCall?: TraceApiCall;
  error?: TraceError;
  event?: TraceTimelineEvent;
}

interface AiDebugAnalysis {
  summary?: string;
  rootCause?: string;
  evidence?: string[];
  inspectFirst?: string;
  debugSteps?: string[];
  fixSuggestion?: string;
  confidence?: string;
  missingData?: string[];
}

export interface DebuggerScript {
  scriptId: string;
  url: string;
  sourceMapURL?: string;
  startLine?: number;
  endLine?: number;
}

export interface LogpointFormValue {
  url: string;
  startLine: number;
  endLine: number;
}

export interface DebuggerScriptSource {
  ok: boolean;
  scriptId?: string;
  source: string;
  message?: string;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="h-full flex items-center justify-center p-6 text-center">
      <div>
        <div className="text-sm text-foreground mb-1">{title}</div>
        <div className="text-xs text-muted-foreground max-w-xs">{description}</div>
      </div>
    </div>
  );
}

function TabButton({
  icon: Icon,
  label,
  badge,
  active,
  onClick,
}: {
  icon: typeof Clock;
  label: string;
  badge: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs transition-colors whitespace-nowrap ${
        active
          ? "bg-[var(--color-electric-blue)]/20 text-[var(--color-electric-blue)]"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
      {badge > 0 && (
        <span className="px-1.5 py-0.5 bg-[var(--color-error)] text-white rounded text-[10px] font-medium">
          {badge}
        </span>
      )}
    </button>
  );
}

function getUrlParts(url: string) {
  try {
    const parsedUrl = new URL(url);
    const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
    const pathTail = pathParts.slice(-2).join("/");
    const search = parsedUrl.search
      ? parsedUrl.search.length > 70
        ? `${parsedUrl.search.slice(0, 70)}...`
        : parsedUrl.search
      : "";

    return {
      primary: pathTail ? `/${pathTail}${search}` : `${parsedUrl.hostname}${search || "/"}`,
      secondary: parsedUrl.hostname,
    };
  } catch {
    return { primary: url, secondary: "" };
  }
}

function getFileLineLabel(file: string, line?: number) {
  const lineSuffix = line ? `:${line}` : "";

  try {
    const parsedUrl = new URL(file);
    const fileName = parsedUrl.pathname.split("/").filter(Boolean).pop();
    return `${fileName || parsedUrl.hostname}${lineSuffix}`;
  } catch {
    return `${file}${lineSuffix}`;
  }
}

function NetworkItem({
  apiCall,
  expanded,
  onToggle,
}: {
  apiCall: TraceApiCall;
  expanded: boolean;
  onToggle: () => void;
}) {
  const latencyMs = apiCall.request.latencyMs;
  const resourceType = apiCall.request.resourceType;
  const urlParts = getUrlParts(apiCall.endpoint);
  const callerLabel = getCallerLabel(apiCall);

  return (
    <div
      className={`border rounded bg-card overflow-hidden ${
        expanded ? "border-[var(--color-electric-blue)]" : "border-border"
      }`}
    >
      <button onClick={onToggle} className="w-full p-3 text-left">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-[var(--color-electric-blue)]">
                {apiCall.method}
              </span>
              {typeof resourceType === "string" && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
                  {resourceType}
                </span>
              )}
              <span className="text-sm text-foreground break-all">{urlParts.primary}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1 break-all">
              {urlParts.secondary || apiCall.endpoint}
            </div>
            {callerLabel && (
              <div className="text-[11px] text-foreground mt-1 break-all">
                Called by {callerLabel}
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <div
              className={`text-xs ${
                apiCall.statusType === "error"
                  ? "text-[var(--color-error)]"
                  : "text-[var(--color-success)]"
              }`}
            >
              {apiCall.status}
            </div>
            {typeof latencyMs === "number" && (
              <div className="text-xs text-muted-foreground mt-1">{latencyMs}ms</div>
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border p-3 space-y-3">
          <JSONViewer title="Request / Parameters" data={apiCall.request} />
          {apiCall.response && (
            <JSONViewer
              title={
                apiCall.request.transport === "webRequest"
                  ? "Response Metadata"
                  : "Response Preview"
              }
              data={
                apiCall.request.transport === "webRequest"
                  ? {
                      note:
                        "Electron webRequest captures response metadata, not response body. fetch/XHR hooks can provide body previews when available.",
                      ...apiCall.response,
                    }
                  : apiCall.response
              }
            />
          )}
        </div>
      )}
    </div>
  );
}

function FunctionItem({
  functionNode,
  expanded,
  onToggle,
}: {
  functionNode: TraceFunctionNode;
  expanded: boolean;
  onToggle: () => void;
}) {
  const eventType = functionNode.parameters?.eventType;
  const target = functionNode.parameters?.target;
  const sourceLocation = functionNode.sourceFile
    ? `${functionNode.sourceFile}${functionNode.line ? `:${functionNode.line}` : ""}${
        functionNode.column ? `:${functionNode.column}` : ""
      }`
    : "";
  const secondary = sourceLocation || [eventType, target].filter(Boolean).join(" · ");
  const parameters = functionNode.parameters || {};
  const localVariables =
    parameters.local && typeof parameters.local === "object"
      ? (parameters.local as Record<string, unknown>)
      : {};
  const closureVariables =
    parameters.closure && typeof parameters.closure === "object"
      ? (parameters.closure as Record<string, unknown>)
      : {};
  const callStack = Array.isArray(parameters.callStack) ? parameters.callStack : [];

  return (
    <div
      className={`border rounded bg-card overflow-hidden ${
        expanded ? "border-[var(--color-electric-blue)]" : "border-border"
      }`}
    >
      <button onClick={onToggle} className="w-full p-3 text-left">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm text-foreground font-mono truncate">
                {functionNode.functionName}()
              </span>
              {functionNode.callType && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground shrink-0">
                  {functionNode.callType}
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-1 truncate">{secondary}</div>
          </div>
          {typeof functionNode.executionTime === "number" && (
            <div className="text-xs text-muted-foreground shrink-0">
              {functionNode.executionTime}ms
            </div>
          )}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-border p-3 space-y-3">
          {(sourceLocation || functionNode.callType) && (
            <JSONViewer
              title="Code Location"
              data={{
                callType: functionNode.callType,
                sourceFile: functionNode.sourceFile,
                line: functionNode.line,
                column: functionNode.column,
              }}
            />
          )}
          <VariableTable title="Local Variables / Parameters" values={localVariables} />
          <VariableTable title="Closure Variables" values={closureVariables} />
          {callStack.length > 0 && (
            <div className="border border-border rounded overflow-hidden">
              <div className="px-3 py-2 bg-secondary text-xs text-secondary-foreground">
                Call Stack
              </div>
              <div className="divide-y divide-border">
                {callStack.slice(0, 12).map((frame, index) => {
                  const item = frame as {
                    functionName?: string;
                    sourceFile?: string;
                    line?: number;
                    column?: number;
                  };

                  return (
                    <div key={`${item.functionName}-${index}`} className="px-3 py-2">
                      <div className="text-xs font-mono text-foreground">
                        {item.functionName || "(anonymous)"}()
                      </div>
                      <div className="text-[11px] text-muted-foreground break-all mt-0.5">
                        {item.sourceFile}
                        {item.line ? `:${item.line}` : ""}
                        {item.column ? `:${item.column}` : ""}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <JSONViewer title="Raw Scope Data" data={functionNode.parameters || {}} />
          {functionNode.returnValue && (
            <JSONViewer title="Result / Error" data={functionNode.returnValue} />
          )}
        </div>
      )}
    </div>
  );
}

function formatValue(value: unknown) {
  if (value == null) return String(value);
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function truncateText(value: string, maxLength = 120) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function formatLongDomValue(value: unknown, maxLength = 180) {
  const text = String(value ?? "(empty)");

  if (text.startsWith("data:")) {
    const commaIndex = text.indexOf(",");
    const header = commaIndex >= 0 ? text.slice(0, commaIndex) : text.slice(0, 80);
    return `${header}, ... (${Math.ceil(text.length / 1024)}KB)`;
  }

  if (text.length > maxLength) {
    return `${text.slice(0, maxLength)}... (${text.length.toLocaleString()} chars)`;
  }

  return text;
}

function getDomMutationBadges(event?: TraceTimelineEvent) {
  const domMutation = event?.domMutation;
  if (!domMutation) return [];

  return [
    { label: "추가", value: domMutation.addedCount, className: "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8] dark:border-[#7f9fba] dark:bg-[#54616c] dark:text-[#eaf4ff]" },
    { label: "삭제", value: domMutation.removedCount, className: "border-[#fecaca] bg-[#fff1f2] text-[#b91c1c] dark:border-[#a98787] dark:bg-[#5f5555] dark:text-[#ffecec]" },
    { label: "속성", value: domMutation.attributeCount, className: "border-[#fed7aa] bg-[#fff7ed] text-[#c2410c] dark:border-[#ad8460] dark:bg-[#5f564e] dark:text-[#ffe5cc]" },
    { label: "텍스트", value: domMutation.textCount, className: "border-[#c7d2fe] bg-[#eef2ff] text-[#4338ca] dark:border-[#8992b0] dark:bg-[#565b68] dark:text-[#edf0ff]" },
  ].filter((item) => item.value > 0);
}

function formatDomMutationType(type: unknown) {
  if (type === "added") return "추가";
  if (type === "removed") return "삭제";
  if (type === "attribute") return "속성";
  if (type === "text") return "텍스트";
  return "변경";
}

function getDomMutationTargetGroups(samples: Array<Record<string, unknown>>) {
  const groupMap = new Map<string, { target: string; count: number; types: Set<string> }>();

  samples.forEach((sample) => {
    const target = String(sample.target || "unknown target");
    const type = formatDomMutationType(sample.type);
    const group = groupMap.get(target) || { target, count: 0, types: new Set<string>() };
    group.count += 1;
    group.types.add(type);
    groupMap.set(target, group);
  });

  return [...groupMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)
    .map((group) => ({
      target: group.target,
      count: group.count,
      types: [...group.types],
    }));
}

function formatDomNodeSummary(node: unknown) {
  if (typeof node === "string") return { selector: node, preview: "" };
  if (node && typeof node === "object") {
    const record = node as Record<string, unknown>;
    return {
      selector: String(record.selector || "unknown node"),
      preview: record.preview ? formatLongDomValue(record.preview, 180) : "",
    };
  }

  return { selector: "unknown node", preview: "" };
}

function VariableTable({
  title,
  values,
}: {
  title: string;
  values: Record<string, unknown>;
}) {
  const entries = Object.entries(values).filter(([name]) => name !== "arguments");

  if (entries.length === 0) {
    return (
      <div className="border border-border rounded p-3">
        <div className="text-xs text-foreground">{title}</div>
        <div className="text-[11px] text-muted-foreground mt-1">수집된 값이 없습니다.</div>
      </div>
    );
  }

  return (
    <div className="border border-border rounded overflow-hidden">
      <div className="px-3 py-2 bg-secondary text-xs text-secondary-foreground">{title}</div>
      <div className="divide-y divide-border">
        {entries.slice(0, 40).map(([name, value]) => (
          <div key={name} className="grid grid-cols-[120px_1fr] gap-3 px-3 py-2">
            <div className="text-xs font-mono text-[var(--color-electric-blue)] truncate">
              {name}
            </div>
            <div className="text-xs text-foreground break-all">
              {truncateText(formatValue(value), 160)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function parseTimestamp(timestamp: string) {
  const value = Number(String(timestamp).replace("ms", ""));
  return Number.isFinite(value) ? value : 0;
}

function formatElapsedTime(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return "0ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)}s`;

  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function getApiPath(url: string) {
  try {
    const parsedUrl = new URL(url);
    return `${parsedUrl.pathname}${parsedUrl.search}`;
  } catch {
    return url;
  }
}

function getApiInitiator(apiCall?: TraceApiCall) {
  const initiator = apiCall?.request?.initiator;
  if (!initiator || typeof initiator !== "object") return undefined;

  return initiator as {
    type?: string;
    caller?: {
      functionName?: string;
      sourceFile?: string;
      line?: number;
      column?: number;
    };
    stack?: Array<{
      functionName?: string;
      sourceFile?: string;
      line?: number;
      column?: number;
    }>;
  };
}

function getCallerLabel(apiCall?: TraceApiCall) {
  const initiator = getApiInitiator(apiCall);
  const caller = initiator?.caller || initiator?.stack?.find((frame) => frame.functionName);
  if (!caller) return "";

  const location = caller.sourceFile
    ? `${caller.sourceFile}${caller.line ? `:${caller.line}` : ""}`
    : "";

  return `${caller.functionName || "(anonymous)"}()${location ? ` · ${location}` : ""}`;
}

function getCallerFrame(apiCall?: TraceApiCall) {
  const initiator = getApiInitiator(apiCall);
  return initiator?.caller || initiator?.stack?.find((frame) => frame.sourceFile && frame.line);
}

function parseMaybeStructuredValue(value: unknown) {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (!text) return value;

  try {
    return JSON.parse(text);
  } catch {
    try {
      const params = new URLSearchParams(text);
      const entries = [...params.entries()];
      return entries.length > 0 ? Object.fromEntries(entries) : value;
    } catch {
      return value;
    }
  }
}

function getRequestQuery(endpoint: string) {
  try {
    return Object.fromEntries(new URL(endpoint).searchParams.entries());
  } catch {
    return {};
  }
}

function getRequestBody(request: Record<string, unknown>) {
  return parseMaybeStructuredValue(request.body);
}

function getResourceTypeFromUrl(url?: string) {
  if (!url) return "";

  try {
    const extension = new URL(url).pathname.split(".").pop()?.toLowerCase() || "";
    if (["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "avif"].includes(extension)) {
      return "image";
    }
    if (["woff", "woff2", "ttf", "otf", "eot"].includes(extension)) return "font";
    if (["js", "mjs", "cjs"].includes(extension)) return "script";
    if (["css"].includes(extension)) return "stylesheet";
    if (["html", "htm"].includes(extension)) return "document";
  } catch {
    return "";
  }

  return "";
}

function getApiResourceType(apiCall?: TraceApiCall) {
  const resourceType = apiCall?.request?.resourceType;
  if (typeof resourceType === "string" && resourceType) return resourceType;

  const transport = apiCall?.request?.transport;
  if (transport === "fetch" || transport === "xhr") return "xhr";

  return getResourceTypeFromUrl(apiCall?.endpoint) || "other";
}

function normalizeResourceType(resourceType: string) {
  const normalized = resourceType.toLowerCase();
  if (normalized === "mainframe" || normalized === "subframe") return "document";
  if (normalized === "xmlhttprequest") return "xhr";
  return normalized;
}

function getApiFilterCategory(apiCall: TraceApiCall): NetworkResourceFilter {
  const resourceType = normalizeResourceType(getApiResourceType(apiCall));
  const extensionType = getResourceTypeFromUrl(apiCall.endpoint);
  const effectiveType = resourceType === "other" && extensionType ? extensionType : resourceType;

  if (["xhr", "fetch"].includes(effectiveType)) return "xhr-fetch";
  if (effectiveType === "document") return "document";
  if (effectiveType === "script") return "script";
  if (effectiveType === "stylesheet") return "stylesheet";
  if (effectiveType === "image") return "image";
  if (effectiveType === "font") return "font";

  return "other";
}

function shouldShowApiCall(apiCall: TraceApiCall, filters: NetworkResourceFilterSelection) {
  return filters.includes(getApiFilterCategory(apiCall));
}

function stringifySearchValue(value: unknown, depth = 0): string {
  if (value === null || value === undefined) return "";
  if (depth > 4) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => stringifySearchValue(item, depth + 1)).join(" ");
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${key} ${stringifySearchValue(item, depth + 1)}`)
      .join(" ");
  }

  return "";
}

function getApiSearchText(apiCall: TraceApiCall) {
  const query = getRequestQuery(apiCall.endpoint);
  const body = getRequestBody(apiCall.request);

  return [
    apiCall.method,
    apiCall.endpoint,
    getApiPath(apiCall.endpoint),
    apiCall.status,
    getCallerLabel(apiCall),
    stringifySearchValue(query),
    stringifySearchValue(apiCall.request),
    stringifySearchValue(body),
    stringifySearchValue(apiCall.response),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchesSearchText(searchText: string, query: string) {
  const terms = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  if (terms.length === 0) return true;
  return terms.every((term) => searchText.includes(term));
}

function matchesApiCallSearch(apiCall: TraceApiCall, query: string) {
  return matchesSearchText(getApiSearchText(apiCall), query);
}

function getFunctionSearchText(functionNode: TraceFunctionNode) {
  return [
    functionNode.functionName,
    functionNode.callType,
    functionNode.sourceFile,
    functionNode.line,
    functionNode.column,
    stringifySearchValue(functionNode.parameters),
    stringifySearchValue(functionNode.returnValue),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getFlowItemSearchText(item: FlowStoryItem) {
  return [
    item.title,
    item.subtitle,
    item.timestamp,
    item.status,
    item.apiCall ? getApiSearchText(item.apiCall) : "",
    item.functionNode ? getFunctionSearchText(item.functionNode) : "",
    item.error
      ? [
          item.error.message,
          item.error.type,
          item.error.file,
          item.error.line,
          item.error.column,
          item.error.stackTrace,
        ].join(" ")
      : "",
    item.event ? stringifySearchValue(item.event) : "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchesFlowItemSearch(item: FlowStoryItem, query: string) {
  if (!query.trim()) return false;
  return matchesSearchText(getFlowItemSearchText(item), query);
}

const networkFilterOptions: Array<{ value: NetworkResourceFilter; label: string; description: string }> = [
  { value: "xhr-fetch", label: "XHR/Fetch", description: "API 통신" },
  { value: "document", label: "Doc", description: "문서 이동" },
  { value: "script", label: "JS", description: "스크립트" },
  { value: "stylesheet", label: "CSS", description: "스타일" },
  { value: "image", label: "Img", description: "이미지" },
  { value: "font", label: "Font", description: "폰트" },
  { value: "other", label: "Other", description: "기타" },
];

function NetworkResourceFilterBar({
  value,
  totalCount,
  visibleCount,
  searchQuery,
  onChange,
  onSearchChange,
  variant = "panel",
}: {
  value: NetworkResourceFilterSelection;
  totalCount: number;
  visibleCount: number;
  searchQuery: string;
  onChange: (filter: NetworkResourceFilterSelection) => void;
  onSearchChange: (query: string) => void;
  variant?: "panel" | "compact";
}) {
  const allSelected = value.length === networkFilterOptions.length;
  const compact = variant === "compact";
  const [draftQuery, setDraftQuery] = useState(searchQuery);
  const toggleFilter = (filter: NetworkResourceFilter) => {
    if (value.includes(filter)) {
      onChange(value.filter((currentFilter) => currentFilter !== filter));
      return;
    }

    onChange([...value, filter]);
  };
  const applySearch = () => {
    onSearchChange(draftQuery.trim());
  };
  const clearSearch = () => {
    setDraftQuery("");
    onSearchChange("");
  };

  useEffect(() => {
    setDraftQuery(searchQuery);
  }, [searchQuery]);

  return (
    <div
      className={
        compact
          ? "rounded border border-border bg-muted px-3 py-2 dark:border-border dark:bg-card"
          : "px-3 py-2 border-b border-border bg-muted dark:border-border dark:bg-card"
      }
    >
      <div className={`flex items-center justify-between gap-3 mb-2 ${compact ? "px-1" : ""}`}>
        <div className="text-xs font-medium text-foreground dark:text-foreground">
          Network Filter
          <span className="ml-2 text-[11px] font-normal text-muted-foreground dark:text-muted-foreground">
            {searchQuery
              ? `"${truncateText(searchQuery, 24)}" 검색 중`
              : allSelected
                ? "전체 표시 중"
                : "선택한 타입만 표시"}
          </span>
        </div>
        <div className="text-[11px] text-muted-foreground dark:text-muted-foreground">
          {visibleCount}/{totalCount} requests 표시
        </div>
      </div>
      <div className="mb-2 flex items-center gap-1.5">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground dark:text-muted-foreground" />
          <input
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") applySearch();
              if (event.key === "Escape") clearSearch();
            }}
            placeholder="URL, query, request/response 검색"
            className="h-8 w-full rounded border border-border bg-card pl-8 pr-7 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-border focus:ring-2 focus:ring-muted dark:border-border dark:bg-card dark:text-foreground dark:placeholder:text-muted-foreground dark:focus:border-border dark:focus:ring-[#5a5a5a]"
          />
          {draftQuery && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground"
              title="검색어 지우기"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={applySearch}
          className="h-8 shrink-0 rounded border border-border bg-muted px-3 text-xs font-medium text-foreground hover:bg-muted dark:border-border dark:bg-card dark:text-foreground dark:hover:bg-muted"
        >
          검색
        </button>
      </div>
      <div
        className={
          compact
            ? "flex flex-wrap gap-1.5"
            : "flex flex-wrap gap-1.5"
        }
      >
        {networkFilterOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => toggleFilter(option.value)}
            title={option.description}
            className={`h-7 min-w-[64px] px-2.5 rounded-full border text-center text-[11px] transition-colors ${
              value.includes(option.value)
                ? "border-[#b8c9dd] bg-[#eef4fb] text-[#3f6389] shadow-[inset_0_0_0_1px_rgba(63,99,137,0.08)] dark:border-[#8b98a5] dark:bg-[#5b636b] dark:text-[#eef5fb]"
                : "border-border bg-card text-muted-foreground opacity-70 hover:opacity-100 hover:border-border hover:text-foreground dark:border-border dark:bg-card dark:text-muted-foreground dark:hover:border-border dark:hover:bg-muted dark:hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function getFlowVisual(item: Pick<FlowStoryItem, "type" | "status">) {
  if (item.status === "error") {
    return {
      accent: "#b91c1c",
      edge: "#f87171",
      tone: "border-[#fecaca] bg-[#fff1f2] dark:border-[#a98787] dark:bg-[#5f5555]",
      iconTone: "bg-[#b91c1c] text-white",
      node: "border-[#fecaca] bg-[#fff1f2] text-[#991b1b] dark:border-[#a98787] dark:bg-[#5f5555] dark:text-[#ffecec]",
      chip: "bg-[#fee2e2] border-[#fecaca] text-[#991b1b] dark:border-[#a98787] dark:bg-[#665a5a] dark:text-[#ffecec]",
      label: "ERROR",
    };
  }

  if (item.type === "api") {
    return {
      accent: "#c2410c",
      edge: "#fdba74",
      tone: "border-[#fed7aa] bg-[#ffedd5] dark:border-[#ad8460] dark:bg-[#5f564e]",
      iconTone: "bg-[#c2410c] text-white",
      node: "border-[#fed7aa] bg-[#ffedd5] text-[#9a3412] dark:border-[#ad8460] dark:bg-[#5f564e] dark:text-[#ffe5cc]",
      chip: "bg-white/80 border-[#fed7aa] text-[#9a3412] dark:border-[#ad8460] dark:bg-[#675b50] dark:text-[#ffe5cc]",
      label: "API",
    };
  }

  if (item.type === "action") {
    return {
      accent: "var(--color-foreground)",
      edge: "#8a8a8a",
      tone: "border-border bg-muted",
      iconTone: "bg-[#5f5f5f] text-white",
      node: "border-border bg-muted text-foreground",
      chip: "bg-card border-border text-foreground",
      label: "EVENT",
    };
  }

  if (item.type === "dom") {
    return {
      accent: "#0284c7",
      edge: "#7dd3fc",
      tone: "border-[#bae6fd] bg-[#f0f9ff] dark:border-[#7295a3] dark:bg-[#51616a]",
      iconTone: "bg-[#0284c7] text-white",
      node: "border-[#bae6fd] bg-[#f0f9ff] text-[#075985] dark:border-[#7295a3] dark:bg-[#51616a] dark:text-[#dff7ff]",
      chip: "bg-white/80 border-[#bae6fd] text-[#075985] dark:border-[#7295a3] dark:bg-[#5a6870] dark:text-[#dff7ff]",
      label: "DOM",
    };
  }

  if (item.type === "function") {
    return {
      accent: "#f36910",
      edge: "#fb923c",
      tone: "border-[#fed7aa] bg-card dark:border-[#ad8460] dark:bg-card",
      iconTone: "bg-[#f36910] text-white",
      node: "border-[#fed7aa] bg-card text-[#9a3412] dark:border-[#ad8460] dark:bg-card dark:text-[#ffe5cc]",
      chip: "bg-[#fff7ed] border-[#fed7aa] text-[#9a3412] dark:border-[#ad8460] dark:bg-[#5f564e] dark:text-[#ffe5cc]",
      label: "FUNCTION",
    };
  }

  return {
    accent: "var(--color-muted-foreground)",
    edge: "#8a8a8a",
    tone: "border-border bg-card",
    iconTone: "bg-[#5f5f5f] text-white",
    node: "border-border bg-card text-foreground",
    chip: "bg-card border-border text-muted-foreground",
    label: item.type === "scenario" ? "START" : "PAGE",
  };
}

function getImportantEntries(values: Record<string, unknown>, limit = 5) {
  const ignored = new Set([
    "callStack",
    "closure",
    "eventType",
    "hitBreakpoints",
    "local",
    "pageUrl",
    "pauseReason",
    "target",
  ]);

  return Object.entries(values)
    .filter(([name, value]) => !ignored.has(name) && value !== undefined)
    .slice(0, limit);
}

function getFunctionSummary(functionNode: TraceFunctionNode) {
  const parameters = functionNode.parameters || {};
  const local =
    parameters.local && typeof parameters.local === "object"
      ? (parameters.local as Record<string, unknown>)
      : {};
  const summaryEntries = getImportantEntries(local).length
    ? getImportantEntries(local)
    : getImportantEntries(parameters);

  return summaryEntries;
}

function buildFlowStory(
  trace: TraceSession,
  networkFilter: NetworkResourceFilterSelection
): FlowStoryItem[] {
  const functionQueue = [...trace.functions];
  const apiQueue = [...trace.apiCalls];
  const errorQueue = [...trace.errors];

  const items = trace.timeline
    .map((event) => {
      if (event.type === "function") {
        const matchingIndex = functionQueue.findIndex(
          (functionNode) => functionNode.functionName === event.title
        );
        const functionNode =
          matchingIndex >= 0 ? functionQueue.splice(matchingIndex, 1)[0] : functionQueue.shift();

        return {
          id: event.id,
          type: "function" as const,
          title: functionNode?.functionName || event.title,
          subtitle:
            functionNode?.sourceFile ||
            event.details ||
            functionNode?.callType ||
            "function call",
          timestamp: event.timestamp,
          status: event.status || (functionNode?.hasError ? "error" : "success"),
          functionNode,
          event,
        };
      }

      if (event.type === "api") {
        const apiCall = apiQueue.shift();
        if (apiCall && !shouldShowApiCall(apiCall, networkFilter)) return null;

        return {
          id: event.id,
          type: "api" as const,
          title: apiCall ? `${apiCall.method} ${getApiPath(apiCall.endpoint)}` : event.title,
          subtitle: apiCall?.status || event.details,
          timestamp: event.timestamp,
          status: event.status || apiCall?.statusType,
          apiCall,
          event,
        };
      }

      if (event.type === "error") {
        const error = errorQueue.shift();

        return {
          id: event.id,
          type: "error" as const,
          title: error?.message || event.title,
          subtitle: error ? `${error.type} · ${error.file}:${error.line}` : event.details,
          timestamp: event.timestamp,
          status: "error" as const,
          error,
          event,
        };
      }

      if (event.type === "action") {
        return {
          id: event.id,
          type: "action" as const,
          title: event.title,
          subtitle: event.details,
          timestamp: event.timestamp,
          status: event.status,
          event,
        };
      }

      if (event.type === "dom") {
        return {
          id: event.id,
          type: "dom" as const,
          title: event.title,
          subtitle: event.details,
          timestamp: event.timestamp,
          status: event.status,
          event,
        };
      }

      return {
        id: event.id,
        type: event.title === "Trace started" ? ("scenario" as const) : ("page" as const),
        title: event.title === "Trace started" ? "시나리오 시작" : event.title,
        subtitle: event.details,
        timestamp: event.timestamp,
        status: event.status,
        event,
      };
    })
    .filter((item): item is FlowStoryItem => Boolean(item));

  functionQueue.forEach((functionNode, index) => {
    items.push({
      id: functionNode.id,
      type: "function",
      title: functionNode.functionName,
      subtitle: functionNode.sourceFile || functionNode.callType,
      timestamp: `${trace.durationMs + index}ms`,
      status: functionNode.hasError ? "error" : "success",
      functionNode,
    });
  });

  apiQueue
    .filter((apiCall) => shouldShowApiCall(apiCall, networkFilter))
    .forEach((apiCall, index) => {
      items.push({
        id: apiCall.id,
        type: "api",
        title: `${apiCall.method} ${getApiPath(apiCall.endpoint)}`,
        subtitle: apiCall.status,
        timestamp: `${trace.durationMs + index}ms`,
        status: apiCall.statusType,
        apiCall,
      });
    });

  errorQueue.forEach((error, index) => {
    items.push({
      id: error.id,
      type: "error",
      title: error.message,
      subtitle: `${error.type} · ${error.file}:${error.line}`,
      timestamp: `${trace.durationMs + index}ms`,
      status: "error",
      error,
    });
  });

  return items.sort((a, b) => parseTimestamp(a.timestamp) - parseTimestamp(b.timestamp));
}

function FlowDiagnosis({ trace, story }: { trace: TraceSession; story: FlowStoryItem[] }) {
  const failedApi = story.find((item) => item.apiCall?.statusType === "error")?.apiCall;
  const firstError = trace.errors[0];
  const visibleApiCount = story.filter((item) => item.apiCall).length;
  const lastFunctionBeforeError = firstError
    ? [...story]
        .reverse()
        .find((item) => item.type === "function" && parseTimestamp(item.timestamp) <= parseTimestamp(story.find((storyItem) => storyItem.error?.id === firstError.id)?.timestamp || "0ms"))
    : undefined;

  const title = firstError
    ? "에러 발생 흐름이 감지되었습니다"
    : failedApi
      ? "실패한 API 요청이 감지되었습니다"
      : story.length > 1
        ? "시나리오 흐름이 수집되고 있습니다"
        : "수집할 흐름을 기다리는 중입니다";

  const description = firstError
    ? `${lastFunctionBeforeError?.title || "직전 함수"} 이후 ${firstError.type}가 발생했습니다. 에러 직전 함수의 local 변수와 실패 API를 함께 확인하세요.`
    : failedApi
      ? `${failedApi.method} ${getApiPath(failedApi.endpoint)} 요청이 ${failedApi.status}로 종료되었습니다. 이 요청 직전의 함수 파라미터가 원인 후보입니다.`
      : "사용자 행동이 시나리오 시작점으로 기록되고, 이어지는 함수/API/에러가 하나의 이야기처럼 연결됩니다.";

  return (
    <div className="border border-border bg-muted rounded p-3 text-foreground">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-[#f36910]" />
        <div className="text-sm font-medium">{title}</div>
      </div>
      <div className="text-xs text-muted-foreground mt-1">{description}</div>
      <div className="flex flex-wrap gap-2 mt-3 text-[11px]">
        <span className="px-2 py-1 rounded bg-card border border-border">
          함수 {trace.functions.length}
        </span>
        <span className="px-2 py-1 rounded bg-card border border-border">
          API {visibleApiCount}/{trace.apiCalls.length}
        </span>
        <span className="px-2 py-1 rounded bg-card border border-border">
          에러 {trace.errors.length}
        </span>
      </div>
    </div>
  );
}

function FlowStoryCard({
  item,
  index,
  expanded,
  searchMatched,
  onToggle,
  onTraceApiCaller,
  onInspectError,
}: {
  item: FlowStoryItem;
  index: number;
  expanded: boolean;
  searchMatched: boolean;
  onToggle: () => void;
  onTraceApiCaller: (apiCall: TraceApiCall) => void;
  onInspectError: (errorId: string) => void;
}) {
  const Icon =
    item.type === "function"
      ? Code2
      : item.type === "api"
        ? Server
        : item.type === "error"
          ? AlertCircle
          : item.type === "dom"
            ? Code2
          : item.type === "scenario" || item.type === "action"
            ? MousePointer
            : Globe;
  const visual = getFlowVisual(item);

  return (
    <div className="relative">
      {index > 0 && <div className="absolute -top-3 left-5 w-px h-3 bg-border" />}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onToggle();
          }
        }}
        className={`relative w-full border rounded p-3 text-left transition-shadow ${visual.tone}`}
      >
        {searchMatched && (
          <span
            className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full border border-white bg-[#0284c7] shadow-[0_0_0_1px_rgba(2,132,199,0.22)]"
            title="검색 결과"
          />
        )}
        <div className="flex gap-3">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${visual.iconTone}`}
          >
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <span style={{ color: visual.accent }}>{visual.label}</span>
                <span>· {item.timestamp}</span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {item.error && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onInspectError(item.error!.id);
                    }}
                    onKeyDown={(event) => event.stopPropagation()}
                    className="inline-flex items-center gap-1 rounded bg-[#eff6ff] px-2 py-0.5 text-[10px] font-medium text-[#1d4ed8] hover:bg-[#dbeafe] dark:bg-[#54616c] dark:text-[#eaf4ff]"
                  >
                    <Bot className="h-3 w-3" />
                    AI 분석
                  </button>
                )}
              </div>
            </div>
            <div className="text-sm text-foreground font-medium mt-1 break-words">
              {item.title}
            </div>
            {item.subtitle && (
              <div className="text-xs text-muted-foreground mt-1 break-all">{item.subtitle}</div>
            )}
            {item.functionNode && getFunctionSummary(item.functionNode).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {getFunctionSummary(item.functionNode).map(([name, value]) => (
                  <span
                    key={name}
                    className={`px-2 py-1 rounded border text-[11px] ${visual.chip}`}
                  >
                    {name}: {truncateText(formatValue(value), 60)}
                  </span>
                ))}
              </div>
            )}
            {item.apiCall && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {getCallerLabel(item.apiCall) && (
                  <span className={`px-2 py-1 rounded border text-[11px] ${visual.chip}`}>
                    Called by {getCallerLabel(item.apiCall)}
                  </span>
                )}
                <span className={`px-2 py-1 rounded border text-[11px] ${visual.chip}`}>
                  {item.apiCall.status}
                </span>
                {typeof item.apiCall.request.latencyMs === "number" && (
                  <span className={`px-2 py-1 rounded border text-[11px] ${visual.chip}`}>
                    {String(item.apiCall.request.latencyMs)}ms
                  </span>
                )}
              </div>
            )}
            {item.event?.type === "dom" && getDomMutationBadges(item.event).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {getDomMutationBadges(item.event).map((badge) => (
                  <span
                    key={badge.label}
                    className={`px-2 py-1 rounded border text-[11px] ${badge.className}`}
                  >
                    {badge.label} {badge.value}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {expanded && (
        <div className="ml-12 mt-2 border border-border bg-card rounded p-3 space-y-3">
          {item.functionNode && <FunctionStoryDetail functionNode={item.functionNode} />}
          {item.apiCall && (
            <>
              <ApiParameterSummary apiCall={item.apiCall} onTraceCaller={onTraceApiCaller} />
              {getApiInitiator(item.apiCall) && (
                <JSONViewer title="Called By / Initiator Stack" data={getApiInitiator(item.apiCall)} />
              )}
              <JSONViewer title="Request" data={item.apiCall.request} />
              {item.apiCall.response && <JSONViewer title="Response" data={item.apiCall.response} />}
            </>
          )}
          {item.error && (
            <ErrorCard
              message={item.error.message}
              type={item.error.type}
              file={item.error.file}
              line={item.error.line}
              column={item.error.column}
              stackTrace={item.error.stackTrace}
            />
          )}
          {!item.functionNode && !item.apiCall && !item.error && item.event && (
            <TimelineInlineDetail event={item.event} />
          )}
        </div>
      )}
    </div>
  );
}

function FunctionStoryDetail({ functionNode }: { functionNode: TraceFunctionNode }) {
  const parameters = functionNode.parameters || {};
  const localVariables =
    parameters.local && typeof parameters.local === "object"
      ? (parameters.local as Record<string, unknown>)
      : {};
  const closureVariables =
    parameters.closure && typeof parameters.closure === "object"
      ? (parameters.closure as Record<string, unknown>)
      : {};

  return (
    <>
      <JSONViewer
        title="Code Location"
        data={{
          callType: functionNode.callType,
          sourceFile: functionNode.sourceFile,
          line: functionNode.line,
          column: functionNode.column,
        }}
      />
      <VariableTable title="Local Variables / Parameters" values={localVariables} />
      <VariableTable title="Closure Variables" values={closureVariables} />
      <JSONViewer title="Raw Scope Data" data={functionNode.parameters || {}} />
    </>
  );
}

function ApiParameterSummary({
  apiCall,
  onTraceCaller,
  showTraceButton = true,
}: {
  apiCall: TraceApiCall;
  onTraceCaller: (apiCall: TraceApiCall) => void;
  showTraceButton?: boolean;
}) {
  const caller = getCallerFrame(apiCall);
  const query = getRequestQuery(apiCall.endpoint);
  const body = getRequestBody(apiCall.request);
  const hasBody = body !== undefined && body !== "";

  return (
    <div className="border border-border bg-muted rounded p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">API Parameter Summary</div>
          <div className="text-xs text-muted-foreground mt-1 break-all">
            {caller
              ? truncateText(
                  `Called by ${caller.functionName || "(anonymous)"}() · ${
                    caller.sourceFile || ""
                  }${caller.line ? `:${caller.line}` : ""}`,
                  180
                )
              : "호출 함수 후보를 찾지 못했습니다."}
          </div>
        </div>
        {showTraceButton && caller?.sourceFile && caller.line && (
          <button
            type="button"
            onClick={() => onTraceCaller(apiCall)}
            className="shrink-0 px-3 py-1.5 rounded bg-[#f36910] text-white text-xs hover:bg-[#d85a0d]"
          >
            이 호출 지점 추적
          </button>
        )}
      </div>

      {showTraceButton && caller?.sourceFile && caller.line && (
        <div className="text-[11px] text-muted-foreground bg-card border border-border rounded p-2">
          버튼을 누르면 다음 실행부터 이 API 호출 라인 주변에 logpoint가 걸리고, 해당
          함수의 local 변수/파라미터가 Flow 함수 카드로 수집됩니다.
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="border border-border bg-card rounded overflow-hidden">
          <div className="px-3 py-2 bg-muted text-xs text-foreground">Query Params</div>
          <KeyValuePreview values={query} emptyText="query parameter가 없습니다." />
        </div>
        <div className="border border-border bg-card rounded overflow-hidden">
          <div className="px-3 py-2 bg-muted text-xs text-foreground">Request Body</div>
          {hasBody && typeof body === "object" && body !== null ? (
            <KeyValuePreview values={body as Record<string, unknown>} emptyText="body가 없습니다." />
          ) : (
            <div className="p-3 text-xs text-muted-foreground break-all">
              {hasBody ? truncateText(formatValue(body), 220) : "body가 없습니다."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type TraceFindingSeverity = "critical" | "warning" | "info";

interface TraceFinding {
  id: string;
  severity: TraceFindingSeverity;
  title: string;
  description: string;
  evidence?: string;
}

function getNumberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace("ms", "").trim());
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function getDomMutationTotal(event?: TraceTimelineEvent) {
  const domMutation = event?.domMutation;
  if (!domMutation) return 0;

  return (
    domMutation.addedCount +
    domMutation.removedCount +
    domMutation.attributeCount +
    domMutation.textCount
  );
}

function buildTraceFindings(trace: TraceSession, story: FlowStoryItem[]): TraceFinding[] {
  const findings: TraceFinding[] = [];
  const storyApis = story
    .map((item) => item.apiCall)
    .filter((apiCall): apiCall is TraceApiCall => Boolean(apiCall));
  const failedApis = storyApis.filter((apiCall) => apiCall.statusType === "error");
  const slowApis = storyApis
    .map((apiCall) => ({
      apiCall,
      latencyMs: getNumberValue(apiCall.request.latencyMs) || 0,
    }))
    .filter((item) => item.latencyMs >= 1000)
    .sort((a, b) => b.latencyMs - a.latencyMs);
  const domEvents = story.filter((item) => item.event?.domMutation);
  const largeDomEvents = domEvents
    .map((item) => ({ item, total: getDomMutationTotal(item.event) }))
    .filter(({ total }) => total >= 50)
    .sort((a, b) => b.total - a.total);
  const firstErrorItem = trace.errors[0]
    ? story.find((item) => item.error?.id === trace.errors[0].id)
    : undefined;
  const firstErrorTime = firstErrorItem ? parseTimestamp(firstErrorItem.timestamp) : undefined;
  const domBeforeError =
    firstErrorTime !== undefined
      ? [...domEvents]
          .reverse()
          .find((item) => {
            const time = parseTimestamp(item.timestamp);
            return time <= firstErrorTime && firstErrorTime - time <= 1500;
          })
      : undefined;

  failedApis.slice(0, 3).forEach((apiCall, index) => {
    findings.push({
      id: `failed-api-${index}`,
      severity: "critical",
      title: "실패 API 감지",
      description: `${apiCall.method} ${getApiPath(apiCall.endpoint)} 요청이 ${apiCall.status} 상태로 종료되었습니다.`,
      evidence: getCallerLabel(apiCall) || apiCall.endpoint,
    });
  });

  slowApis.slice(0, 3).forEach(({ apiCall, latencyMs }, index) => {
    findings.push({
      id: `slow-api-${index}`,
      severity: latencyMs >= 3000 ? "warning" : "info",
      title: "느린 API 응답",
      description: `${apiCall.method} ${getApiPath(apiCall.endpoint)} 응답에 ${Math.round(latencyMs)}ms가 걸렸습니다.`,
      evidence: apiCall.status,
    });
  });

  largeDomEvents.slice(0, 3).forEach(({ item, total }, index) => {
    const trigger = item.event?.domMutation?.trigger;
    findings.push({
      id: `dom-burst-${index}`,
      severity: total >= 200 ? "warning" : "info",
      title: "DOM 변경 집중 발생",
      description: `${item.timestamp}에 DOM 변경 ${total}건이 짧은 시간 안에 발생했습니다.`,
      evidence: trigger?.label
        ? `추정 트리거: ${String(trigger.label)}`
        : item.subtitle || item.title,
    });
  });

  if (trace.errors.length > 0 && domBeforeError) {
    findings.push({
      id: "dom-before-error",
      severity: "warning",
      title: "에러 직전 DOM 변경",
      description: `첫 에러 직전 ${domBeforeError.timestamp}에 DOM 변경이 감지되었습니다.`,
      evidence: domBeforeError.title,
    });
  }

  if (trace.functions.length === 0 && storyApis.length > 0) {
    findings.push({
      id: "no-function-flow",
      severity: "info",
      title: "함수 Flow 수집 부족",
      description: "API와 DOM 변화는 수집됐지만 함수 호출 정보가 거의 없습니다.",
      evidence: "스크립트 목록에서 핵심 라인에 logpoint를 추가하면 원인 추적 정확도가 올라갑니다.",
    });
  }

  if (story.filter((item) => item.type === "action").length === 0 && story.length > 3) {
    findings.push({
      id: "no-user-action",
      severity: "info",
      title: "사용자 액션 기준점 없음",
      description: "수집된 흐름에 클릭, 입력, 제출 같은 사용자 액션이 없습니다.",
      evidence: "자동 실행/초기 렌더링 문제인지, 사용자 조작 이후 문제인지 구분이 어려울 수 있습니다.",
    });
  }

  if (findings.length === 0) {
    findings.push({
      id: "no-major-finding",
      severity: "info",
      title: "큰 이상징후 없음",
      description: "실패 API, 긴 응답 시간, DOM 변경 폭주, console error가 두드러지게 보이지 않습니다.",
      evidence: "재현 조건을 좁히거나 특정 함수 라인에 logpoint를 추가해 세부 값을 확인하세요.",
    });
  }

  return findings.slice(0, 8);
}

function TraceReport({ trace, story }: { trace: TraceSession; story: FlowStoryItem[] }) {
  const storyApis = story
    .map((item) => item.apiCall)
    .filter((apiCall): apiCall is TraceApiCall => Boolean(apiCall));
  const failedApis = storyApis.filter((apiCall) => apiCall.statusType === "error");
  const domCount = story.filter((item) => item.type === "dom").length;
  const firstError = trace.errors[0];
  const firstAction = story.find((item) => item.type === "action");
  const firstErrorItem = firstError
    ? story.find((item) => item.error?.id === firstError.id)
    : undefined;
  const candidateApi = failedApis[0];
  const maxStoryTimestamp = Math.max(0, ...story.map((item) => parseTimestamp(item.timestamp)));
  const elapsedMs = trace.durationMs || maxStoryTimestamp;

  return (
    <div className="border border-border bg-card rounded overflow-hidden">
      <div className="px-4 py-3 bg-muted border-b border-border">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-foreground">Trace Report</div>
            <div className="text-xs text-muted-foreground mt-1">
              Trace 종료 후 수집된 흐름을 요약한 리포트입니다.
            </div>
          </div>
          <span
            className={`px-2 py-1 rounded text-xs ${
              firstError || candidateApi
                ? "bg-muted text-foreground"
                : "bg-muted text-foreground"
            }`}
          >
            {firstError || candidateApi ? "확인 필요" : "정상 종료"}
          </span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
          <ReportMetric label="걸린 시간" value={formatElapsedTime(elapsedMs)} />
          <ReportMetric label="사용자 행동" value={story.filter((item) => item.type === "action").length} />
          <ReportMetric label="함수" value={trace.functions.length} />
          <ReportMetric label="API" value={storyApis.length} />
          <ReportMetric label="DOM" value={domCount} />
          <ReportMetric label="에러" value={trace.errors.length} />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="border border-border rounded p-3">
            <div className="text-xs text-muted-foreground">시작 행동</div>
            <div className="text-sm text-foreground mt-1 break-words">
              {firstAction?.title || "사용자 행동이 수집되지 않았습니다."}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
              <span className="rounded bg-muted px-2 py-1">
                시점 {firstAction?.timestamp || "0ms"}
              </span>
              {firstAction?.subtitle && (
                <span className="min-w-0 rounded bg-muted px-2 py-1 break-all">
                  {truncateText(firstAction.subtitle, 120)}
                </span>
              )}
            </div>
          </div>
          <div className="border border-border rounded p-3">
            <div className="text-xs text-muted-foreground">실행 시간</div>
            <div className="text-sm text-foreground mt-1 break-words">
              전체 Trace는 {formatElapsedTime(elapsedMs)} 동안 수집되었습니다.
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
              {trace.startedAt && <span className="rounded bg-muted px-2 py-1">시작 {trace.startedAt}</span>}
              {trace.completedAt && <span className="rounded bg-muted px-2 py-1">종료 {trace.completedAt}</span>}
              {firstErrorItem && (
                <span className="rounded bg-muted px-2 py-1">첫 에러 {firstErrorItem.timestamp}</span>
              )}
            </div>
          </div>
        </div>

        {(candidateApi || firstError) && (
          <div className="border border-border bg-muted rounded p-3">
            <div className="text-sm font-medium text-foreground">Root Cause Candidate</div>
            <div className="text-xs text-muted-foreground mt-1">
              {candidateApi
                ? `${candidateApi.method} ${getApiPath(candidateApi.endpoint)} (${candidateApi.status}) 요청과 직전 함수 파라미터를 우선 확인하세요.`
                : `${firstError?.file}:${firstError?.line} 에서 발생한 ${firstError?.type}를 우선 확인하세요.`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function analyzeErrorMessage(error: TraceError, story: FlowStoryItem[]) {
  const message = error.message.toLowerCase();
  const failedApi = story.find((item) => item.apiCall?.statusType === "error")?.apiCall;
  const previousFunction = [...story]
    .reverse()
    .find(
      (item) =>
        item.type === "function" &&
        parseTimestamp(item.timestamp) <=
          parseTimestamp(story.find((storyItem) => storyItem.error?.id === error.id)?.timestamp || "0ms")
    )?.functionNode;

  if (message.includes("timeout") || message.includes("timed out")) {
    return {
      cause: "요청 시간이 초과되었습니다. 네트워크 지연, 서버 응답 지연, 또는 클라이언트 timeout 설정이 원인 후보입니다.",
      focus: failedApi
        ? `${failedApi.method} ${getApiPath(failedApi.endpoint)} 응답 시간과 서버 로그를 먼저 확인하세요.`
        : "에러 직전에 발생한 API 요청의 latency와 retry 여부를 먼저 확인하세요.",
      actions: [
        "동일 요청을 재현해 평균 latency와 실패율을 확인",
        "서버 처리 시간이 긴 구간 또는 외부 연동 지연 여부 확인",
        "클라이언트 timeout/retry 정책이 현재 업무 플로우에 맞는지 확인",
      ],
    };
  }

  if (message.includes("already been declared")) {
    const declaredName = error.message.match(/Identifier '([^']+)'/)?.[1];
    const targetName = declaredName ? `'${declaredName}'` : "같은 식별자";

    return {
      cause: `${targetName}가 같은 스코프에서 중복 선언된 SyntaxError입니다.`,
      focus: `${getFileLineLabel(error.file, error.line)}의 선언부와 스크립트 중복 로드를 확인하세요.`,
      actions: [
        "동일 스크립트가 두 번 삽입되는지 확인",
        "let/const/class 재선언을 var 또는 단일 선언으로 정리",
      ],
    };
  }

  if (message.includes("cannot read") || message.includes("undefined") || message.includes("null")) {
    return {
      cause: "객체가 비어 있거나 예상한 응답/상태 값이 들어오지 않은 상태에서 속성을 읽은 가능성이 큽니다.",
      focus: previousFunction
        ? `${previousFunction.functionName}()의 local 변수와 API 응답 shape를 같이 확인하세요.`
        : "에러 직전 함수의 파라미터와 API 응답 body 구조를 같이 확인하세요.",
      actions: [
        "에러 라인에서 접근한 객체가 undefined/null이 될 수 있는 경로 확인",
        "API 응답이 성공/실패 케이스에서 동일한 필드 구조를 보장하는지 확인",
        "렌더링 또는 후속 함수 호출 전에 guard/default value 추가 검토",
      ],
    };
  }

  if (message.includes("cors") || message.includes("blocked by")) {
    return {
      cause: "브라우저 보안 정책 또는 CORS 설정으로 요청이 차단된 가능성이 큽니다.",
      focus: failedApi
        ? `${getUrlParts(failedApi.endpoint).secondary || failedApi.endpoint} 응답 헤더의 CORS 설정을 확인하세요.`
        : "요청 대상 origin과 응답 헤더를 확인하세요.",
      actions: [
        "Access-Control-Allow-Origin / Credentials 설정 확인",
        "preflight OPTIONS 요청의 status와 response header 확인",
        "Electron webview 환경과 일반 브라우저 환경의 쿠키/헤더 차이 확인",
      ],
    };
  }

  if (message.includes("404") || message.includes("500") || message.includes("failed to fetch")) {
    return {
      cause: "API 요청 실패가 화면 오류로 이어졌을 가능성이 있습니다.",
      focus: failedApi
        ? `${failedApi.method} ${getApiPath(failedApi.endpoint)} 상태값 ${failedApi.status}를 우선 확인하세요.`
        : "실패한 API 요청과 직전 함수 호출을 같이 확인하세요.",
      actions: [
        "요청 URL, query, request body가 기대값과 일치하는지 확인",
        "서버 응답 status와 에러 payload 확인",
        "실패 응답을 처리하는 catch/error branch가 화면 상태를 안전하게 갱신하는지 확인",
      ],
    };
  }

  return {
    cause: "에러 메시지만으로 단정하기는 어렵지만, 발생 위치와 직전 함수/API 흐름을 함께 보면 원인 후보를 좁힐 수 있습니다.",
    focus: previousFunction
      ? `${previousFunction.functionName}() 실행 시점의 local 변수와 closure 값을 먼저 확인하세요.`
      : `${error.file}:${error.line} 주변 코드와 call stack의 상위 함수를 확인하세요.`,
    actions: [
      "에러 발생 라인의 입력값과 예상 타입 비교",
      "직전 API 요청의 request/response와 화면 상태 변경 순서 확인",
      "동일 행동을 다시 수행해 같은 call stack으로 재현되는지 확인",
    ],
  };
}

function getPlainObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function compactFunctionNode(functionNode?: TraceFunctionNode) {
  if (!functionNode) return undefined;

  const parameters = functionNode.parameters || {};
  const local = getPlainObject(parameters.local);
  const closure = getPlainObject(parameters.closure);
  const callStack = Array.isArray(parameters.callStack) ? parameters.callStack.slice(0, 12) : [];

  return {
    functionName: functionNode.functionName,
    callType: functionNode.callType,
    sourceFile: functionNode.sourceFile,
    line: functionNode.line,
    column: functionNode.column,
    local,
    closure,
    callStack,
    returnValue: functionNode.returnValue,
    hasError: functionNode.hasError,
  };
}

function compactApiCall(apiCall?: TraceApiCall) {
  if (!apiCall) return undefined;

  return {
    method: apiCall.method,
    endpoint: apiCall.endpoint,
    status: apiCall.status,
    statusType: apiCall.statusType,
    request: apiCall.request,
    response: apiCall.response,
    caller: getCallerLabel(apiCall),
    initiator: getApiInitiator(apiCall),
  };
}

function createAiAnalysisPayload({
  trace,
  story,
  selectedError,
}: {
  trace: TraceSession;
  story: FlowStoryItem[];
  selectedError: TraceError;
}) {
  const errorTimestamp = story.find((item) => item.error?.id === selectedError.id)?.timestamp;
  const previousFunctions = [...story]
    .filter(
      (item) =>
        item.functionNode &&
        (!errorTimestamp || parseTimestamp(item.timestamp) <= parseTimestamp(errorTimestamp))
    )
    .slice(-5)
    .map((item) => compactFunctionNode(item.functionNode));
  const nearbyApis = story
    .filter(
      (item) =>
        item.apiCall &&
        (!errorTimestamp || parseTimestamp(item.timestamp) <= parseTimestamp(errorTimestamp) + 3000)
    )
    .slice(-8)
    .map((item) => compactApiCall(item.apiCall));
  const nearbyFlow = story.slice(-16).map((item) => ({
    type: item.type,
    title: item.title,
    subtitle: item.subtitle,
    timestamp: item.timestamp,
    status: item.status,
  }));
  const nearbyDom = story
    .filter((item) => item.event?.domMutation)
    .slice(-8)
    .map((item) => ({
      timestamp: item.timestamp,
      title: item.title,
      trigger: item.event?.domMutation?.trigger,
      counts: {
        added: item.event?.domMutation?.addedCount,
        removed: item.event?.domMutation?.removedCount,
        attributes: item.event?.domMutation?.attributeCount,
        text: item.event?.domMutation?.textCount,
      },
      samples: item.event?.domMutation?.samples?.slice(0, 4),
    }));

  return {
    traceSummary: {
      name: trace.name,
      status: trace.status,
      durationMs: trace.durationMs,
      functionCount: trace.functions.length,
      apiCount: trace.apiCalls.length,
      errorCount: trace.errors.length,
    },
    automaticFindings: buildTraceFindings(trace, story).map((finding) => ({
      severity: finding.severity,
      title: finding.title,
      description: finding.description,
      evidence: finding.evidence,
    })),
    selectedError,
    previousFunctions,
    nearbyApis,
    nearbyDom,
    nearbyFlow,
  };
}

function normalizeAiAnalysis(value: unknown): AiDebugAnalysis {
  const data = getPlainObject(value);

  return {
    summary: typeof data.summary === "string" ? data.summary : "",
    rootCause: typeof data.rootCause === "string" ? data.rootCause : "",
    evidence: Array.isArray(data.evidence) ? data.evidence.map(String) : [],
    inspectFirst: typeof data.inspectFirst === "string" ? data.inspectFirst : "",
    debugSteps: Array.isArray(data.debugSteps) ? data.debugSteps.map(String) : [],
    fixSuggestion: typeof data.fixSuggestion === "string" ? data.fixSuggestion : "",
    confidence: typeof data.confidence === "string" ? data.confidence : "",
    missingData: Array.isArray(data.missingData) ? data.missingData.map(String) : [],
  };
}

function isUsableAiAnalysis(result?: AiDebugAnalysis | null) {
  if (!result) return false;

  const text = [result.summary, result.rootCause, result.inspectFirst, result.fixSuggestion]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (!text) return false;

  return ![
    "OpenAI 응답 텍스트가 비어 있습니다",
    "응답 텍스트가 비어 있습니다",
    "OpenAI 응답을 JSON으로 해석하지 못했습니다",
  ].some((message) => text.includes(message));
}

type AiAnalysisStatus = "idle" | "loading" | "success" | "error";

interface AiAnalysisState {
  status: AiAnalysisStatus;
  result: AiDebugAnalysis | null;
  message: string;
}

function ErrorAnalysisTool({
  trace,
  story,
  selectedErrorId,
  expandedErrorId,
  aiAnalysisByErrorId,
  autoAnalysisKey,
  onSelectError,
  onToggleError,
  onUpdateAiAnalysis,
  onAutoAnalysisKeyChange,
}: {
  trace: TraceSession;
  story: FlowStoryItem[];
  selectedErrorId: string | null;
  expandedErrorId: string | null;
  aiAnalysisByErrorId: Record<string, AiAnalysisState>;
  autoAnalysisKey: string;
  onSelectError: (errorId: string | null) => void;
  onToggleError: (errorId: string | null) => void;
  onUpdateAiAnalysis: (errorId: string, nextState: AiAnalysisState) => void;
  onAutoAnalysisKeyChange: (key: string) => void;
}) {
  const selectedError =
    trace.errors.find((error) => error.id === selectedErrorId) || trace.errors[0];
  const selectedAiAnalysis = selectedError ? aiAnalysisByErrorId[selectedError.id] : undefined;
  const aiStatus = selectedAiAnalysis?.status || "idle";
  const runAiAnalysis = async (targetError: TraceError) => {
    const errorId = targetError.id;

    const runtime = (window as any).debugAgentRuntime;
    if (!runtime?.analyzeError) {
      onUpdateAiAnalysis(errorId, {
        status: "error",
        result: null,
        message: "Electron AI 분석 API가 연결되어 있지 않습니다.",
      });
      return;
    }

    onUpdateAiAnalysis(errorId, {
      status: "loading",
      result: null,
      message: "",
    });

    try {
      const result = await runtime.analyzeError(
        createAiAnalysisPayload({ trace, story, selectedError: targetError })
      );

      if (!result?.ok) {
        onUpdateAiAnalysis(errorId, {
          status: "error",
          result: null,
          message: result?.message || "AI 분석에 실패했습니다.",
        });
        return;
      }

      const normalizedAnalysis = normalizeAiAnalysis(result.analysis);
      if (!isUsableAiAnalysis(normalizedAnalysis)) {
        onUpdateAiAnalysis(errorId, {
          status: "error",
          result: null,
          message: "AI 응답이 비어 있어 로컬 분석을 표시합니다.",
        });
        return;
      }

      onUpdateAiAnalysis(errorId, {
        status: "success",
        result: normalizedAnalysis,
        message: result.model
          ? `OpenAI · ${result.model} 분석 완료`
          : "OpenAI 분석 완료",
      });
    } catch (error) {
      onUpdateAiAnalysis(errorId, {
        status: "error",
        result: null,
        message: error instanceof Error ? error.message : "AI 분석에 실패했습니다.",
      });
    }
  };

  useEffect(() => {
    if (!selectedErrorId && trace.errors[0]) {
      onSelectError(trace.errors[0].id);
    }
  }, [onSelectError, selectedErrorId, trace.errors]);

  useEffect(() => {
    if (trace.status !== "completed" || !selectedError) return;

    const nextKey = `${trace.id}:${selectedError.id}`;
    const existingAnalysis = aiAnalysisByErrorId[selectedError.id];
    if (existingAnalysis || autoAnalysisKey === nextKey || aiStatus === "loading") return;

    onAutoAnalysisKeyChange(nextKey);
    void runAiAnalysis(selectedError);
  }, [trace.status, trace.id, selectedError?.id, autoAnalysisKey, aiStatus, aiAnalysisByErrorId]);

  return (
    <div className="border border-[#fed7aa] bg-card rounded overflow-hidden dark:border-[#ad8460] dark:bg-card">
      <div className="px-4 py-3 bg-[#fff7ed] border-b border-[#fed7aa] dark:border-[#ad8460] dark:bg-[#5f564e]">
        <div className="flex items-center gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium text-[#9a3412] dark:text-[#ffe5cc]">
              <Sparkles className="w-4 h-4 text-[#f36910]" />
              자동 AI 분석
            </div>
            <div className="text-xs mt-1 break-words" style={{ color: "var(--analysis-body-text)" }}>
              Trace 종료 후 에러, 직전 함수, 실패 API, DOM 변화를 기반으로 원인 후보를 정리합니다.
            </div>
          </div>
        </div>
      </div>

      {selectedError ? (
        <div className="p-4 space-y-4">
          <ErrorAccordionList
            errors={trace.errors}
            selectedErrorId={selectedError.id}
            expandedErrorId={expandedErrorId}
            aiAnalysisByErrorId={aiAnalysisByErrorId}
            story={story}
            onSelect={onSelectError}
            onToggle={onToggleError}
          />
        </div>
      ) : (
        <div className="p-4 space-y-4">
          <div className="rounded border border-border bg-card p-5 text-center dark:border-border dark:bg-card">
            <div className="text-sm text-foreground">분석할 에러가 없습니다</div>
            <div className="text-xs text-muted-foreground mt-1">
              Trace 중 console error, window error, unhandled rejection이 잡히면 자동 AI 분석이 실행됩니다.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ErrorAccordionList({
  errors,
  selectedErrorId,
  expandedErrorId,
  aiAnalysisByErrorId,
  story,
  onSelect,
  onToggle,
}: {
  errors: TraceError[];
  selectedErrorId?: string;
  expandedErrorId?: string | null;
  aiAnalysisByErrorId: Record<string, AiAnalysisState>;
  story: FlowStoryItem[];
  onSelect: (errorId: string) => void;
  onToggle: (errorId: string | null) => void;
}) {
  return (
    <div className="min-w-0 rounded border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-foreground">에러 목록</div>
          <div className="text-xs text-muted-foreground mt-1">
            항목을 누르면 해당 에러 기준으로 AI 코멘트를 확인합니다.
          </div>
        </div>
        <span className="rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">
          {errors.length}개
        </span>
      </div>
      <div className="mt-3 grid gap-2">
        {errors.map((error, index) => {
          const selected = selectedErrorId === error.id;
          const expanded = expandedErrorId === error.id;
          const aiState = aiAnalysisByErrorId[error.id];
          const itemAnalysis = analyzeErrorMessage(error, story);
          const statusLabel =
            aiState?.status === "loading"
              ? "분석 중"
              : aiState?.status === "success"
                ? "코멘트"
                : aiState?.status === "error"
                  ? "확인"
                  : "대기";

          return (
            <div
              key={error.id}
              className={`min-w-0 overflow-hidden rounded border transition-colors ${
                selected
                  ? "border-[#b8c9dd] bg-[#eef4fb] dark:border-[#8b98a5] dark:bg-[#5b636b]"
                  : "border-border bg-muted hover:bg-card dark:bg-muted dark:hover:bg-card"
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  onSelect(error.id);
                  onToggle(expanded ? null : error.id);
                }}
                className="flex w-full min-w-0 items-start gap-3 px-3 py-3 text-left"
                aria-expanded={expanded}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-medium uppercase ${
                        selected
                          ? "text-[#3f6389] dark:text-[#eef5fb]"
                          : "text-[#991b1b] dark:text-[#ffecec]"
                      }`}
                    >
                      Error {index + 1}
                    </span>
                    <span className="rounded bg-card px-2 py-0.5 text-[10px] text-muted-foreground">
                      {statusLabel}
                    </span>
                  </div>
                  <div className="mt-1 text-sm font-medium text-foreground break-words [overflow-wrap:anywhere]">
                    {truncateText(error.message, 180)}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground break-all">
                    {error.type} · {error.file}:{error.line}
                    {error.column ? `:${error.column}` : ""}
                  </div>
                </div>
                <ChevronDown
                  className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                    expanded ? "rotate-180" : ""
                  }`}
                />
              </button>

              {expanded && (
                <div className="border-t border-[#fecaca] bg-card p-3 dark:border-[#a98787] dark:bg-card">
                  <div className="grid gap-3">
                    <AiAnalysisComment
                      error={error}
                      status={aiState?.status || "idle"}
                      message={aiState?.message || ""}
                      result={aiState?.result || null}
                      analysis={itemAnalysis}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AiAnalysisComment({
  error,
  status,
  message,
  result,
  analysis,
}: {
  error: TraceError;
  status: AiAnalysisStatus;
  message: string;
  result: AiDebugAnalysis | null;
  analysis: { cause: string; focus: string; actions: string[] };
}) {
  const location = `${error.file}:${error.line}${error.column ? `:${error.column}` : ""}`;
  const usableResult = isUsableAiAnalysis(result) ? result : null;
  const analysisSummary =
    usableResult?.summary ||
    usableResult?.rootCause ||
    analysis.cause ||
    "아직 분석 결과가 없습니다.";
  const actionItems = buildCompactActionItems(usableResult, analysis, location);
  const typingEnabled = status !== "loading";
  const typedAnalysisSummary = useTypewriterText(analysisSummary, typingEnabled, 1300);
  const typedActionText = useTypewriterText(actionItems.join("\n"), typingEnabled, 1900);
  const typedActionItems = typedActionText.split("\n").filter(Boolean);

  if (status === "loading") {
    return <WorkingRobotAnimation />;
  }

  return (
    <div className="ai-result-stage rounded border border-border bg-card p-4">
      <div className="ai-robot-result-move">
        <RobotHeadAvatar />
      </div>

      <div className="ai-result-layout">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-h-7 pl-9 text-sm font-semibold leading-7 text-foreground">
            AI 디버깅 코멘트
          </div>
          {message && status !== "error" && (
            <span className="rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground dark:bg-[#3f3f3f] dark:text-foreground">
              {message}
            </span>
          )}
        </div>

        <div className="mt-3 grid gap-3">
          <div className="rounded border border-border bg-muted/50 p-3 dark:bg-[#3f3f3f]">
            <div className="text-[11px] font-semibold uppercase text-muted-foreground">Error</div>
            <div className="mt-1 text-sm text-foreground break-words [overflow-wrap:anywhere]">
              {error.message}
            </div>
            <div className="mt-1 text-xs text-muted-foreground break-all">{location}</div>
          </div>

          <div className="rounded border border-border bg-muted/50 p-3 dark:bg-[#3f3f3f]">
            <div className="text-[11px] font-semibold uppercase text-muted-foreground">Analysis</div>
            <div className="ai-typing-text mt-1 min-h-[1.25rem] text-sm text-foreground break-words [overflow-wrap:anywhere]">
              {typedAnalysisSummary}
            </div>
            {message && status === "error" && (
              <div className="mt-2 rounded border border-[#fecaca] bg-[#fff1f2] px-3 py-2 text-xs text-[#991b1b] dark:border-[#a98787] dark:bg-[#5f5555] dark:text-[#ffecec]">
                {message}
              </div>
            )}
          </div>

          <div className="rounded border border-border bg-muted/50 p-3 dark:bg-[#3f3f3f]">
            <div className="text-[11px] font-semibold uppercase text-muted-foreground">
              확인 / 수정 포인트
            </div>
            <ul className="mt-2 grid gap-2">
              {typedActionItems.map((item, index) => (
                <li key={`${item}-${index}`} className="flex gap-2 text-sm text-foreground">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#2563eb]" />
                  <span className="ai-typing-text min-w-0 break-words [overflow-wrap:anywhere]">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function useTypewriterText(text: string, enabled: boolean, delayMs = 240) {
  const [visibleText, setVisibleText] = useState("");

  useEffect(() => {
    if (!enabled) {
      setVisibleText("");
      return;
    }

    setVisibleText("");
    if (!text) return;

    let intervalId: number | undefined;
    const timeoutId = window.setTimeout(() => {
      let index = 0;
      intervalId = window.setInterval(() => {
        index = Math.min(text.length, index + 2);
        setVisibleText(text.slice(0, index));

        if (index >= text.length && intervalId !== undefined) {
          window.clearInterval(intervalId);
        }
      }, 14);
    }, delayMs);

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, [delayMs, enabled, text]);

  return visibleText;
}

function buildCompactActionItems(
  result: AiDebugAnalysis | null,
  analysis: { cause: string; focus: string; actions: string[] },
  location: string
) {
  const items = result
    ? [
        result.inspectFirst ? `확인: ${result.inspectFirst}` : `확인: ${location} 주변 코드`,
        result.debugSteps[0] ? `절차: ${result.debugSteps[0]}` : "",
        result.fixSuggestion ? `수정: ${result.fixSuggestion}` : "",
      ]
    : [
        analysis.focus ? `확인: ${analysis.focus}` : `확인: ${location} 주변 코드`,
        analysis.actions[0] ? `수정: ${analysis.actions[0]}` : "",
        analysis.actions[1] ? `추가: ${analysis.actions[1]}` : "",
      ];

  return items
    .filter((item): item is string => Boolean(item))
    .slice(0, 3);
}

function RobotHeadAvatar() {
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] text-[#2563eb] dark:border-[#7f9fba] dark:bg-[#54616c] dark:text-[#eaf4ff]">
      <Bot className="h-4 w-4" />
    </div>
  );
}

function RobotGearAvatar() {
  return (
    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 animate-spin text-[#2563eb] dark:text-[#bfdbfe]"
        style={{ animationDuration: "5.5s" }}
        aria-hidden="true"
      >
        <path
          fill="currentColor"
          fillRule="evenodd"
          d="M56.5 7 59 17.8a33.6 33.6 0 0 1 7.1 2.9l9.3-5.9 9.8 9.8-5.9 9.3a33.6 33.6 0 0 1 2.9 7.1L93 43.5v13l-10.8 2.5a33.6 33.6 0 0 1-2.9 7.1l5.9 9.3-9.8 9.8-9.3-5.9a33.6 33.6 0 0 1-7.1 2.9L56.5 93h-13L41 82.2a33.6 33.6 0 0 1-7.1-2.9l-9.3 5.9-9.8-9.8 5.9-9.3a33.6 33.6 0 0 1-2.9-7.1L7 56.5v-13L17.8 41a33.6 33.6 0 0 1 2.9-7.1l-5.9-9.3 9.8-9.8 9.3 5.9a33.6 33.6 0 0 1 7.1-2.9L43.5 7h13ZM50 72a22 22 0 1 0 0-44 22 22 0 0 0 0 44Z"
        />
        <circle cx="50" cy="50" r="26" fill="#dbeafe" className="dark:fill-[#3b4f66]" />
        <circle cx="50" cy="50" r="21" fill="white" className="dark:fill-[#27384b]" />
      </svg>
      <div className="relative flex h-8 w-8 items-center justify-center rounded-full text-[#2563eb] dark:text-[#eaf4ff]">
        <Bot className="h-5 w-5" />
      </div>
    </div>
  );
}

function WorkingRobotAnimation() {
  return (
    <div className="overflow-hidden rounded border border-[#bfdbfe] bg-[#eff6ff] px-4 py-5 dark:border-[#7f9fba] dark:bg-[#54616c]">
      <div className="flex items-center justify-center gap-3">
        <RobotGearAvatar />
        <div className="min-w-0">
          <div className="text-sm font-medium leading-6 text-[#1d4ed8] dark:text-[#eaf4ff]">
            AI가 trace를 분석 중입니다
          </div>
          <div className="text-xs text-[#3f6389] dark:text-[#eaf4ff]">
            원인 후보와 확인 지점을 정리하고 있습니다.
          </div>
        </div>
      </div>
    </div>
  );
}

function FlowGraphDialog({
  open,
  onOpenChange,
  story,
  trace,
  networkResourceFilter,
  networkSearchQuery,
  visibleApiCount,
  aiAnalysisByErrorId,
  onNetworkResourceFilterChange,
  onNetworkSearchChange,
  onInspectError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  story: FlowStoryItem[];
  trace: TraceSession;
  networkResourceFilter: NetworkResourceFilterSelection;
  networkSearchQuery: string;
  visibleApiCount: number;
  aiAnalysisByErrorId: Record<string, AiAnalysisState>;
  onNetworkResourceFilterChange: (filter: NetworkResourceFilterSelection) => void;
  onNetworkSearchChange: (query: string) => void;
  onInspectError: (errorId: string) => void;
}) {
  const [dialogSize, setDialogSize] = useState(() => ({
    width: typeof window === "undefined" ? 1280 : Math.round(window.innerWidth * 0.94),
    height: typeof window === "undefined" ? 820 : Math.round(window.innerHeight * 0.9),
  }));
  const [diagramLayout, setDiagramLayout] = useState(() => ({
    sideWidth: 360,
    detailHeight: 260,
  }));
  const [sideCollapsed, setSideCollapsed] = useState(false);
  const [detailCollapsed, setDetailCollapsed] = useState(false);
  const [canvasZoom, setCanvasZoom] = useState(1);
  const resizeStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    width: number;
    height: number;
  } | null>(null);
  const layoutResizeRef = useRef<
    | {
        type: "side";
        pointerX: number;
        sideWidth: number;
      }
    | {
        type: "detail";
        pointerY: number;
        detailHeight: number;
      }
    | null
  >(null);
  const panStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const graphViewportRef = useRef<HTMLDivElement | null>(null);
  const graphItems = story
    .filter((item) => ["action", "function", "api", "error", "scenario", "dom"].includes(item.type))
    .slice(0, 32);
  const [selectedId, setSelectedId] = useState<string | null>(graphItems[0]?.id || null);
  const selectedItem = graphItems.find((item) => item.id === selectedId) || graphItems[0];
  const nodeWidth = 260;
  const nodeHeight = 96;
  const xGap = 80;
  const yBase = 76;
  const yOffsets: Record<FlowStoryType, number> = {
    scenario: 0,
    action: 0,
    function: 130,
    api: 260,
    error: 390,
    page: 0,
    dom: 130,
  };
  const canvasWidth = Math.max(980, graphItems.length * (nodeWidth + xGap) + 120);
  const canvasHeight = 560;
  const scaledCanvasWidth = canvasWidth * canvasZoom;
  const scaledCanvasHeight = canvasHeight * canvasZoom;
  const selectedIndex = graphItems.findIndex((item) => item.id === selectedItem?.id);
  const mainGridColumns = sideCollapsed
    ? "minmax(0, 1fr)"
    : `minmax(0, 1fr) 8px ${diagramLayout.sideWidth}px`;
  const clampZoom = (value: number) => Math.min(1.8, Math.max(0.5, value));
  const applyCanvasZoom = (
    nextZoom: number,
    anchor?: { clientX: number; clientY: number }
  ) => {
    const viewport = graphViewportRef.current;
    const clampedZoom = clampZoom(nextZoom);
    const previousZoom = canvasZoom;
    if (Math.abs(clampedZoom - previousZoom) < 0.001) return;

    if (!viewport || !anchor) {
      setCanvasZoom(clampedZoom);
      return;
    }

    const rect = viewport.getBoundingClientRect();
    const anchorX = anchor.clientX - rect.left;
    const anchorY = anchor.clientY - rect.top;
    const contentX = (viewport.scrollLeft + anchorX) / previousZoom;
    const contentY = (viewport.scrollTop + anchorY) / previousZoom;

    setCanvasZoom(clampedZoom);
    requestAnimationFrame(() => {
      viewport.scrollLeft = Math.max(0, contentX * clampedZoom - anchorX);
      viewport.scrollTop = Math.max(0, contentY * clampedZoom - anchorY);
    });
  };
  const zoomIn = () => applyCanvasZoom(canvasZoom + 0.1);
  const zoomOut = () => applyCanvasZoom(canvasZoom - 0.1);
  const resetZoom = () => applyCanvasZoom(1);
  const selectAndFocusNode = (itemId: string) => {
    const index = graphItems.findIndex((item) => item.id === itemId);
    if (index < 0) return;

    const item = graphItems[index];
    const viewport = graphViewportRef.current;
    setSelectedId(itemId);
    viewport?.scrollTo({
      left: Math.max(
        0,
        (60 + index * (nodeWidth + xGap) + nodeWidth / 2) * canvasZoom -
          viewport.clientWidth / 2
      ),
      top: Math.max(
        0,
        (yBase + yOffsets[item.type] + nodeHeight / 2) * canvasZoom -
          viewport.clientHeight / 2
      ),
      behavior: "smooth",
    });
  };
  const handleGraphItemClick = (item: FlowStoryItem) => {
    selectAndFocusNode(item.id);
  };
  const startResize = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    resizeStartRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      width: dialogSize.width,
      height: dialogSize.height,
    };

    const resize = (moveEvent: PointerEvent) => {
      const start = resizeStartRef.current;
      if (!start) return;

      const maxWidth = window.innerWidth - 24;
      const maxHeight = window.innerHeight - 24;
      setDialogSize({
        width: Math.min(maxWidth, Math.max(900, start.width + moveEvent.clientX - start.pointerX)),
        height: Math.min(maxHeight, Math.max(620, start.height + moveEvent.clientY - start.pointerY)),
      });
    };

    const stopResize = () => {
      resizeStartRef.current = null;
      window.removeEventListener("pointermove", resize);
      window.removeEventListener("pointerup", stopResize);
    };

    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stopResize);
  };
  const startLayoutResize = (type: "side" | "detail", event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    layoutResizeRef.current =
      type === "side"
        ? {
            type,
            pointerX: event.clientX,
            sideWidth: diagramLayout.sideWidth,
          }
        : {
            type,
            pointerY: event.clientY,
            detailHeight: diagramLayout.detailHeight,
          };

    const resize = (moveEvent: PointerEvent) => {
      const start = layoutResizeRef.current;
      if (!start) return;

      if (start.type === "side") {
        setDiagramLayout((currentLayout) => ({
          ...currentLayout,
          sideWidth: Math.min(620, Math.max(260, start.sideWidth - (moveEvent.clientX - start.pointerX))),
        }));
        return;
      }

      setDiagramLayout((currentLayout) => ({
        ...currentLayout,
        detailHeight: Math.min(420, Math.max(180, start.detailHeight - (moveEvent.clientY - start.pointerY))),
      }));
    };

    const stopResize = () => {
      layoutResizeRef.current = null;
      window.removeEventListener("pointermove", resize);
      window.removeEventListener("pointerup", stopResize);
    };

    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stopResize);
  };
  const startPan = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;

    const viewport = graphViewportRef.current;
    if (!viewport) return;

    event.preventDefault();

    panStartRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
    viewport.setPointerCapture(event.pointerId);
  };
  const movePan = (event: PointerEvent<HTMLDivElement>) => {
    const start = panStartRef.current;
    const viewport = graphViewportRef.current;
    if (!start || !viewport) return;

    viewport.scrollLeft = start.scrollLeft - (event.clientX - start.pointerX);
    viewport.scrollTop = start.scrollTop - (event.clientY - start.pointerY);
  };
  const stopPan = (event: PointerEvent<HTMLDivElement>) => {
    if (!panStartRef.current) return;

    panStartRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const handleCanvasWheel = (event: WheelEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;

    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    applyCanvasZoom(canvasZoom + direction * 0.08, {
      clientX: event.clientX,
      clientY: event.clientY,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!max-w-none p-0 overflow-hidden flex flex-col"
        hideCloseButton
        style={{
          width: dialogSize.width,
          height: dialogSize.height,
          maxWidth: "calc(100vw - 24px)",
          maxHeight: "calc(100vh - 24px)",
        }}
      >
        <DialogHeader className="px-5 py-3 border-b border-border bg-card">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2">
                <GitBranch className="w-5 h-5 text-[#f36910]" />
                Flow 분석
              </DialogTitle>
              <DialogDescription>
                사용자 행동, 함수, API, 에러를 노드와 연결선으로 도식화합니다.
              </DialogDescription>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setSideCollapsed((current) => !current)}
                className="flex items-center gap-1.5 rounded border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground"
                title={sideCollapsed ? "전체 흐름 열기" : "전체 흐름 접기"}
              >
                {sideCollapsed ? (
                  <PanelRightOpen className="w-3.5 h-3.5" />
                ) : (
                  <PanelRightClose className="w-3.5 h-3.5" />
                )}
                전체 흐름
              </button>
              <button
                type="button"
                onClick={() => setDetailCollapsed((current) => !current)}
                className="flex items-center gap-1.5 rounded border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground"
                title={detailCollapsed ? "Node Detail 열기" : "Node Detail 접기"}
              >
                {detailCollapsed ? (
                  <PanelBottomOpen className="w-3.5 h-3.5" />
                ) : (
                  <PanelBottomClose className="w-3.5 h-3.5" />
                )}
                Detail
              </button>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="flex items-center gap-1.5 rounded border border-border bg-muted px-3 py-1.5 text-xs text-foreground hover:bg-muted"
              >
                <X className="w-3.5 h-3.5" />
                닫기
              </button>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 flex flex-col">
          <NetworkResourceFilterBar
            value={networkResourceFilter}
            totalCount={trace.apiCalls.length}
            visibleCount={visibleApiCount}
            searchQuery={networkSearchQuery}
            onChange={onNetworkResourceFilterChange}
            onSearchChange={onNetworkSearchChange}
            variant="compact"
          />
          <div
            className="grid min-h-0 flex-1"
            style={{ gridTemplateColumns: mainGridColumns }}
          >
            <div
              ref={graphViewportRef}
              onPointerDown={startPan}
              onPointerMove={movePan}
              onPointerUp={stopPan}
              onPointerCancel={stopPan}
              onWheel={handleCanvasWheel}
              className="flow-canvas-viewport relative overflow-auto bg-muted cursor-grab active:cursor-grabbing select-none"
            >
              <div className="sticky left-3 top-3 z-40 h-0 w-fit">
                <div className="inline-flex items-center gap-1 rounded border border-border bg-card p-1 shadow-sm backdrop-blur">
                  <button
                    type="button"
                    onClick={zoomOut}
                    className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                    disabled={canvasZoom <= 0.5}
                    title="축소"
                  >
                    <ZoomOut className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={resetZoom}
                    className="h-7 min-w-12 rounded px-2 text-[11px] font-medium text-foreground hover:bg-muted"
                    title="100%로 초기화"
                  >
                    {Math.round(canvasZoom * 100)}%
                  </button>
                  <button
                    type="button"
                    onClick={zoomIn}
                    className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                    disabled={canvasZoom >= 1.8}
                    title="확대"
                  >
                    <ZoomIn className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {graphItems.length > 0 ? (
                <div
                  className="relative"
                  style={{ width: scaledCanvasWidth, height: scaledCanvasHeight }}
                >
                <div
                  className="absolute left-0 top-0"
                  style={{
                    width: canvasWidth,
                    height: canvasHeight,
                    transform: `scale(${canvasZoom})`,
                    transformOrigin: "0 0",
                  }}
                >
                  <svg
                    className="absolute inset-0 pointer-events-none"
                    width={canvasWidth}
                    height={canvasHeight}
                  >
                  <defs>
                    <marker
                      id="flow-arrow-muted"
                      viewBox="0 0 10 10"
                      refX="8"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="#8a8a8a" />
                    </marker>
                    <marker
                      id="flow-arrow-active"
                      viewBox="0 0 10 10"
                      refX="8"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="#f36910" />
                    </marker>
                  </defs>
                  {graphItems.slice(0, -1).map((item, index) => {
                    const isFocusedEdge =
                      selectedIndex >= 0 && (index === selectedIndex - 1 || index === selectedIndex);
                    const fromX = 60 + index * (nodeWidth + xGap) + nodeWidth;
                    const fromY = yBase + yOffsets[item.type] + nodeHeight / 2;
                    const next = graphItems[index + 1];
                    const toX = 60 + (index + 1) * (nodeWidth + xGap);
                    const toY = yBase + yOffsets[next.type] + nodeHeight / 2;
                    const midX = fromX + (toX - fromX) / 2;

                    return (
                      <path
                        key={`${item.id}-${next.id}`}
                        d={`M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`}
                        fill="none"
                        stroke={getFlowVisual(next).edge}
                        strokeWidth={isFocusedEdge ? "3" : "1.5"}
                        markerEnd={isFocusedEdge ? "url(#flow-arrow-active)" : "url(#flow-arrow-muted)"}
                        opacity={selectedIndex >= 0 ? (isFocusedEdge ? "0.95" : "0.2") : "0.75"}
                        strokeDasharray={isFocusedEdge ? "8 10" : undefined}
                      >
                        {isFocusedEdge && (
                          <animate
                            attributeName="stroke-dashoffset"
                            from="18"
                            to="0"
                            dur="0.9s"
                            repeatCount="indefinite"
                          />
                        )}
                      </path>
                    );
                  })}
                  </svg>

                  {graphItems.map((item, index) => {
                    const selected = selectedItem?.id === item.id;
                    const adjacent =
                      selectedIndex >= 0 && Math.abs(index - selectedIndex) === 1;
                    const dimmed = selectedIndex >= 0 && !selected && !adjacent;

                    return (
                      <FlowGraphNode
                        key={item.id}
                        item={item}
                        selected={selected}
                        adjacent={adjacent}
                        dimmed={dimmed}
                        searchMatched={matchesFlowItemSearch(item, networkSearchQuery)}
                        x={60 + index * (nodeWidth + xGap)}
                        y={yBase + yOffsets[item.type]}
                        width={nodeWidth}
                        onClick={() => handleGraphItemClick(item)}
                      />
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                도식화할 Flow 데이터가 없습니다.
              </div>
            )}
            </div>

            {!sideCollapsed && (
              <>
                <ResizeDivider
                  orientation="vertical"
                  title="드래그해서 전체 흐름 영역 너비 조절"
                  onPointerDown={(event) => startLayoutResize("side", event)}
                />

                <div className="border-l border-border bg-card overflow-auto p-4">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-foreground">전체 흐름</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          항목을 클릭하면 해당 노드 위치로 이동합니다.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSideCollapsed(true)}
                        className="rounded border border-border bg-card p-1.5 text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground"
                        title="전체 흐름 접기"
                      >
                        <PanelRightClose className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="mt-3 space-y-2">
                      {graphItems.length > 0 ? (
                        graphItems.map((item, index) => {
                          const visual = getFlowVisual(item);
                          const searchMatched = matchesFlowItemSearch(item, networkSearchQuery);

                          return (
                            <button
                              key={`summary-${item.id}`}
                              type="button"
                              onClick={() => handleGraphItemClick(item)}
                              className={`relative w-full text-left rounded border px-3 py-2 transition-colors ${
                                selectedItem?.id === item.id
                                  ? "border-[#f36910] bg-muted"
                                  : "border-border bg-card hover:bg-muted"
                              }`}
                            >
                              {searchMatched && (
                                <span
                                  className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border border-white bg-[#0284c7] shadow-[0_0_0_1px_rgba(2,132,199,0.22)]"
                                  title="검색 결과"
                                />
                              )}
                              <div className="flex items-center justify-between gap-2 pr-3">
                                <span className="text-[10px] uppercase" style={{ color: visual.accent }}>
                                  {index + 1}. {visual.label}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  {item.timestamp}
                                </span>
                              </div>
                              <div className="text-xs text-foreground truncate mt-1">{item.title}</div>
                            </button>
                          );
                        })
                      ) : (
                        <div className="text-xs text-muted-foreground">표시할 흐름이 없습니다.</div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
          {!detailCollapsed && (
            <>
              <ResizeDivider
                orientation="horizontal"
                title="드래그해서 상세 영역 높이 조절"
                onPointerDown={(event) => startLayoutResize("detail", event)}
              />
              <FlowNodeDetailPanel
                selectedItem={selectedItem}
                height={diagramLayout.detailHeight}
                aiAnalysisByErrorId={aiAnalysisByErrorId}
                onCollapse={() => setDetailCollapsed(true)}
                onInspectError={onInspectError}
              />
            </>
          )}
        </div>
        <div
          onPointerDown={startResize}
          className="absolute right-1.5 bottom-1.5 w-5 h-5 cursor-nwse-resize rounded border-r-2 border-b-2 border-[#f36910] opacity-80"
          title="드래그해서 창 크기 조절"
        />
      </DialogContent>
    </Dialog>
  );
}

function FlowGraphNode({
  item,
  selected,
  adjacent,
  dimmed,
  searchMatched,
  x,
  y,
  width,
  onClick,
}: {
  item: FlowStoryItem;
  selected: boolean;
  adjacent: boolean;
  dimmed: boolean;
  searchMatched: boolean;
  x: number;
  y: number;
  width: number;
  onClick: () => void;
}) {
  const visual = getFlowVisual(item);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`absolute rounded border p-3 text-left shadow-sm transition-all duration-200 ${visual.node} ${
        selected
          ? "ring-2 ring-[#f36910] shadow-lg scale-[1.02] z-20"
          : adjacent
            ? "ring-1 ring-border z-10"
            : "hover:shadow-md"
      } ${
        dimmed ? "opacity-35 blur-[0.3px] saturate-50" : "opacity-100 blur-0 saturate-100"
      }`}
      style={{
        left: x,
        top: y,
        width,
      }}
    >
      {searchMatched && (
        <span
          className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full border border-white bg-[#0284c7] shadow-[0_0_0_1px_rgba(2,132,199,0.22)]"
          title="검색 결과"
        />
      )}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 truncate text-[10px] uppercase opacity-80">
          {visual.label} · {item.timestamp}
        </div>
      </div>
      <div className="text-sm font-medium mt-1 truncate">{item.title}</div>
      {item.subtitle && (
        <div className="text-[11px] opacity-80 mt-1 truncate">{item.subtitle}</div>
      )}
      {item.apiCall && getCallerLabel(item.apiCall) && (
        <div className="text-[10px] mt-2 truncate">Called by {getCallerLabel(item.apiCall)}</div>
      )}
    </button>
  );
}

function ResizeDivider({
  orientation,
  title,
  onPointerDown,
}: {
  orientation: "vertical" | "horizontal";
  title: string;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
}) {
  if (orientation === "vertical") {
    return (
      <div
        role="separator"
        aria-orientation="vertical"
        title={title}
        onPointerDown={onPointerDown}
        className="group relative cursor-col-resize bg-muted hover:bg-muted transition-colors"
      >
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border group-hover:w-1 group-hover:bg-[#f36910] transition-all" />
        <div className="absolute top-1/2 left-1/2 h-12 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-border opacity-0 group-hover:opacity-100 group-hover:bg-[#f36910] transition-opacity" />
      </div>
    );
  }

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      title={title}
      onPointerDown={onPointerDown}
      className="group relative h-2 cursor-row-resize bg-muted hover:bg-muted transition-colors"
    >
      <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-border group-hover:h-1 group-hover:bg-[#f36910] transition-all" />
      <div className="absolute left-1/2 top-1/2 h-1.5 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-border opacity-0 group-hover:opacity-100 group-hover:bg-[#f36910] transition-opacity" />
    </div>
  );
}

function FlowNodeDetailPanel({
  selectedItem,
  height,
  aiAnalysisByErrorId,
  onCollapse,
  onInspectError,
}: {
  selectedItem?: FlowStoryItem;
  height: number;
  aiAnalysisByErrorId: Record<string, AiAnalysisState>;
  onCollapse: () => void;
  onInspectError: (errorId: string) => void;
}) {
  const selectedErrorAnalysis = selectedItem?.error
    ? aiAnalysisByErrorId[selectedItem.error.id]?.result
    : undefined;
  const usableSelectedErrorAnalysis = isUsableAiAnalysis(selectedErrorAnalysis)
    ? selectedErrorAnalysis
    : undefined;
  const selectedErrorAnalysisText =
    usableSelectedErrorAnalysis?.summary || usableSelectedErrorAnalysis?.rootCause || "";

  return (
    <div className="border-t border-border bg-card p-4 overflow-auto" style={{ height }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-foreground">Node Detail</div>
          <div className="text-xs text-muted-foreground mt-1">
            선택한 노드의 상세 정보입니다.
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedItem && (
            <span className="px-2 py-1 rounded bg-muted border border-border text-[11px] text-foreground uppercase">
              {getFlowVisual(selectedItem).label}
            </span>
          )}
          {selectedItem?.error && (
            <button
              type="button"
              onClick={() => onInspectError(selectedItem.error!.id)}
              className="rounded bg-[#ef4444] px-2.5 py-1.5 text-xs text-white hover:bg-[#dc2626]"
            >
              AI 분석에서 보기
            </button>
          )}
          <button
            type="button"
            onClick={onCollapse}
            className="rounded border border-border bg-card p-1.5 text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground"
            title="Node Detail 접기"
          >
            <PanelBottomClose className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {selectedItem ? (
        <div className="mt-4 grid grid-cols-[minmax(240px,340px)_1fr] gap-4 items-start">
          <div className="border border-border rounded p-3 bg-muted">
            <div className="text-[11px] uppercase" style={{ color: getFlowVisual(selectedItem).accent }}>
              {getFlowVisual(selectedItem).label}
            </div>
            <div className="text-sm text-foreground mt-1 break-words">{selectedItem.title}</div>
            {selectedItem.subtitle && (
              <div className="text-xs text-muted-foreground mt-1 break-all">
                {selectedItem.subtitle}
              </div>
            )}
          </div>

          <div className="min-w-0 space-y-3">
            {selectedItem.error && (
              <RobotAnalysisSummary
                text={
                  selectedErrorAnalysisText ||
                  "아직 AI 분석 결과가 없습니다. AI 분석에서 보기를 눌러 분석을 실행하세요."
                }
              />
            )}
            {selectedItem.functionNode && (
              <FunctionStoryDetail functionNode={selectedItem.functionNode} />
            )}
            {selectedItem.apiCall && (
              <>
                <ApiParameterSummary
                  apiCall={selectedItem.apiCall}
                  onTraceCaller={() => undefined}
                  showTraceButton={false}
                />
                {getApiInitiator(selectedItem.apiCall) && (
                  <JSONViewer
                    title="Called By / Initiator Stack"
                    data={getApiInitiator(selectedItem.apiCall)}
                  />
                )}
              </>
            )}
            {!selectedItem.functionNode && !selectedItem.apiCall && !selectedItem.error && selectedItem.event && (
              <TimelineInlineDetail event={selectedItem.event} />
            )}
          </div>
        </div>
      ) : (
        <div className="mt-4 text-xs text-muted-foreground">선택된 노드가 없습니다.</div>
      )}
    </div>
  );
}

function RobotAnalysisSummary({ text }: { text: string }) {
  return (
    <div className="rounded border border-[#bfdbfe] bg-[#eff6ff] p-3 dark:border-[#7f9fba] dark:bg-[#54616c]">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#93c5fd] bg-white text-[#2563eb] dark:border-[#7f9fba] dark:bg-[#27384b] dark:text-[#eaf4ff]">
          <Bot className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-[#1d4ed8] dark:text-[#eaf4ff]">
            AI 분석 결과
          </div>
          <div className="mt-1 text-sm text-foreground break-words [overflow-wrap:anywhere]">
            {text}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReportMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="min-w-0 border border-border bg-card rounded p-3">
      <div className="whitespace-nowrap break-keep text-[11px] text-muted-foreground">{label}</div>
      <div className="text-lg font-medium text-foreground mt-1">{value}</div>
    </div>
  );
}

function KeyValuePreview({
  values,
  emptyText,
}: {
  values: Record<string, unknown>;
  emptyText: string;
}) {
  const entries = Object.entries(values);

  if (entries.length === 0) {
    return <div className="p-3 text-xs text-muted-foreground">{emptyText}</div>;
  }

  return (
    <div className="divide-y divide-border">
      {entries.slice(0, 12).map(([name, value]) => (
        <div key={name} className="grid grid-cols-[110px_1fr] gap-2 px-3 py-2">
          <div className="text-xs font-mono text-foreground truncate">{name}</div>
          <div className="text-xs text-foreground break-all">
            {truncateText(formatValue(value), 160)}
          </div>
        </div>
      ))}
    </div>
  );
}

function TimelineInlineDetail({ event }: { event: TraceTimelineEvent }) {
  if (event.type === "dom" && event.domMutation) {
    const badges = getDomMutationBadges(event);
    const samples = event.domMutation.samples || [];
    const targetGroups = getDomMutationTargetGroups(samples);

    return (
      <div className="border border-[#bae6fd] rounded bg-[#f0f9ff] p-3 dark:border-[#7295a3] dark:bg-[#51616a]">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-medium text-[#075985] dark:text-[#dff7ff]">DOM 변경 요약</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{event.timestamp}</div>
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            {badges.map((badge) => (
              <span
                key={badge.label}
                className={`rounded border px-2 py-0.5 text-[11px] ${badge.className}`}
              >
                {badge.label} {badge.value}
              </span>
            ))}
          </div>
        </div>

        {event.domMutation.trigger && (
          <div className="mt-3 rounded border border-[#bfdbfe] bg-white p-2 dark:border-[#7295a3] dark:bg-[#5a6870]">
            <div className="text-[11px] font-medium text-[#075985] dark:text-[#dff7ff]">추정 트리거</div>
            <div className="mt-1 text-xs text-foreground break-words">
              {String(event.domMutation.trigger.actionType || "user-action")}
              {event.domMutation.trigger.label
                ? ` · ${String(event.domMutation.trigger.label)}`
                : ""}
            </div>
            {event.domMutation.trigger.target && (
              <div className="mt-1 text-[11px] text-muted-foreground break-all">
                {String(event.domMutation.trigger.target)}
              </div>
            )}
          </div>
        )}

        {targetGroups.length > 0 && (
          <div className="mt-3 rounded border border-[#bfdbfe] bg-white p-2 dark:border-[#7295a3] dark:bg-[#5a6870]">
            <div className="text-[11px] font-medium text-[#075985] dark:text-[#dff7ff]">주요 변경 영역</div>
            <div className="mt-2 grid gap-1.5">
              {targetGroups.map((group) => (
                <div key={group.target} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 text-xs">
                  <div className="min-w-0 break-all text-foreground [overflow-wrap:anywhere]">{group.target}</div>
                  <div className="shrink-0 text-[11px] text-muted-foreground">
                    {group.types.join(", ")} · {group.count}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {samples.length > 0 && (
          <div className="mt-3 space-y-2">
            {samples.slice(0, 6).map((sample, index) => {
              const nodes = Array.isArray(sample.nodes) ? sample.nodes : [];

              return (
                <div key={`${String(sample.type)}-${index}`} className="min-w-0 overflow-hidden rounded border border-[#dbeafe] bg-white p-2 dark:border-[#7295a3] dark:bg-[#5a6870]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded bg-[#e0f2fe] px-2 py-0.5 text-[10px] text-[#0369a1] dark:bg-[#61717a] dark:text-[#dff7ff]">
                      {formatDomMutationType(sample.type)}
                    </span>
                    {sample.attributeName && (
                      <span className="text-[10px] text-muted-foreground">
                        {String(sample.attributeName)}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 min-w-0 break-all text-xs text-foreground [overflow-wrap:anywhere]">
                    {String(sample.target || "unknown target")}
                  </div>
                  {nodes.length > 0 && (
                    <div className="mt-2 grid gap-1.5">
                      {nodes.map((node, nodeIndex) => {
                        const nodeSummary = formatDomNodeSummary(node);

                        return (
                          <div
                            key={`${nodeSummary.selector}-${nodeIndex}`}
                            className="min-w-0 overflow-hidden rounded bg-[#f8fafc] px-2 py-1 dark:bg-[#51616a]"
                          >
                            <div className="min-w-0 break-all text-[11px] text-muted-foreground [overflow-wrap:anywhere]">
                              {nodeSummary.selector}
                            </div>
                            {nodeSummary.preview && (
                              <div className="mt-0.5 max-h-16 min-w-0 overflow-hidden break-all text-[11px] text-foreground [overflow-wrap:anywhere]">
                                {truncateText(nodeSummary.preview, 180)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {("oldValue" in sample || "newValue" in sample) && (
                    <div className="mt-2 grid gap-1 text-[11px]">
                      <div className="min-w-0 overflow-hidden rounded bg-[#f8fafc] px-2 py-1 text-muted-foreground dark:bg-[#51616a]">
                        이전:{" "}
                        <span className="break-all text-foreground [overflow-wrap:anywhere]">
                          {formatLongDomValue(sample.oldValue, 140)}
                        </span>
                      </div>
                      <div className="min-w-0 overflow-hidden rounded bg-[#eff6ff] px-2 py-1 text-[#1d4ed8] dark:bg-[#51616a] dark:text-[#dff7ff]">
                        이후:{" "}
                        <span className="break-all text-foreground [overflow-wrap:anywhere]">
                          {formatLongDomValue(sample.newValue, 140)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {event.domMutation.pageUrl && (
          <div className="mt-3 text-[11px] text-muted-foreground break-all">
            {event.domMutation.pageUrl}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="ml-9 border border-border rounded bg-card p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-xs text-muted-foreground">{event.type}</div>
        <div className="text-xs text-muted-foreground">{event.timestamp}</div>
      </div>
      {event.details && (
        <div className="text-xs text-muted-foreground break-words">{event.details}</div>
      )}
    </div>
  );
}

function getScriptLabel(url: string) {
  try {
    const parsedUrl = new URL(url);
    const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
    return pathParts.slice(-2).join("/") || parsedUrl.hostname;
  } catch {
    const pathParts = url.split("/").filter(Boolean);
    return pathParts.slice(-2).join("/") || url;
  }
}

function LogpointControls({
  scripts,
  status,
  onApply,
  onLoadScriptSource,
}: {
  scripts: DebuggerScript[];
  status?: string;
  onApply: (options: LogpointFormValue) => void;
  onLoadScriptSource: (scriptId: string) => Promise<DebuggerScriptSource>;
}) {
  const [url, setUrl] = useState("");
  const [scriptFilter, setScriptFilter] = useState("");
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null);
  const [startLine, setStartLine] = useState("1");
  const [endLine, setEndLine] = useState("1");
  const [scriptSource, setScriptSource] = useState("");
  const [sourceStatus, setSourceStatus] = useState("");
  const recentScripts = scripts
    .filter((script) => script.url && !script.url.startsWith("extensions::"))
    .slice(-80)
    .reverse();
  const filteredScripts = recentScripts.filter((script) => {
    const keyword = scriptFilter.trim().toLowerCase();
    if (!keyword) return true;

    return script.url.toLowerCase().includes(keyword);
  });

  const selectScript = async (script: DebuggerScript) => {
    const firstLine = typeof script.startLine === "number" ? script.startLine + 1 : 1;
    const lastLine =
      typeof script.endLine === "number" && script.endLine >= firstLine
        ? Math.min(script.endLine + 1, firstLine + 20)
        : firstLine;

    setSelectedScriptId(script.scriptId);
    setUrl(script.url);
    setStartLine(String(firstLine));
    setEndLine(String(lastLine));
    setScriptSource("");
    setSourceStatus("코드 불러오는 중...");

    try {
      const result = await onLoadScriptSource(script.scriptId);
      if (result.ok) {
        setScriptSource(result.source);
        setSourceStatus("");
      } else {
        setSourceStatus(result.message || "코드를 불러오지 못했습니다.");
      }
    } catch (error) {
      setSourceStatus(error instanceof Error ? error.message : "코드를 불러오지 못했습니다.");
    }
  };

  const selectLine = (lineNumber: number) => {
    const currentStart = Number(startLine);
    const currentEnd = Number(endLine);

    if (!Number.isFinite(currentStart) || lineNumber < currentStart || lineNumber < currentEnd) {
      setStartLine(String(lineNumber));
      setEndLine(String(lineNumber));
      return;
    }

    setEndLine(String(lineNumber));
  };

  const apply = () => {
    const parsedStart = Number(startLine);
    const parsedEnd = Number(endLine || startLine);
    if (!url.trim() || !Number.isFinite(parsedStart)) return;

    onApply({
      url: url.trim(),
      startLine: parsedStart,
      endLine: Number.isFinite(parsedEnd) ? parsedEnd : parsedStart,
    });
  };

  return (
    <div className="border border-border rounded bg-muted text-foreground p-3 space-y-3">
      <div>
        <div className="text-sm font-medium text-foreground">선택 구간 Logpoint</div>
        <div className="text-xs text-muted-foreground mt-1">
          아래 순서대로 스크립트와 라인을 선택한 뒤 Trace를 시작하세요.
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div className="rounded border border-border bg-card p-2">
          <div className="font-medium text-[#f36910]">1. 스크립트 선택</div>
          <div className="text-muted-foreground mt-1">목록에서 실행 파일을 클릭</div>
        </div>
        <div className="rounded border border-border bg-card p-2">
          <div className="font-medium text-[#f36910]">2. 라인 지정</div>
          <div className="text-muted-foreground mt-1">시작/종료 라인 입력</div>
        </div>
        <div className="rounded border border-border bg-card p-2">
          <div className="font-medium text-[#f36910]">3. 적용 후 실행</div>
          <div className="text-muted-foreground mt-1">Start Trace 후 페이지 조작</div>
        </div>
      </div>

      <div className="space-y-2">
        <input
          value={scriptFilter}
          onChange={(event) => setScriptFilter(event.target.value)}
          placeholder="스크립트 검색: LoginForm, auth, /assets/index"
          className="w-full bg-card border border-border rounded px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-[#f36910] focus:ring-2 focus:ring-[#f36910]/15"
        />

        <div className="border border-border rounded overflow-hidden bg-card">
          <div className="px-2 py-1.5 border-b border-border bg-muted text-[11px] text-muted-foreground flex items-center justify-between gap-2">
            <span>감지된 스크립트 목록</span>
            <span>{filteredScripts.length}개 표시</span>
          </div>
          <div className="max-h-48 overflow-auto">
            {filteredScripts.length > 0 ? (
              filteredScripts.slice(0, 60).map((script) => {
                const selected = selectedScriptId === script.scriptId;
                const start = typeof script.startLine === "number" ? script.startLine + 1 : "?";
                const end = typeof script.endLine === "number" ? script.endLine + 1 : "?";

                return (
                  <button
                    key={`${script.scriptId}-${script.url}`}
                    type="button"
                    onClick={() => selectScript(script)}
                    className={`w-full px-2 py-2 text-left border-b border-border last:border-b-0 ${
                      selected
                        ? "bg-muted"
                        : "bg-card hover:bg-muted"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-foreground truncate font-medium">
                        {getScriptLabel(script.url)}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {start}-{end}
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                      {script.url}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                감지된 스크립트가 없거나 검색 결과가 없습니다.
              </div>
            )}
          </div>
        </div>

        {url ? (
          <div className="rounded border border-border bg-muted p-2">
            <div className="text-[11px] font-medium text-[#f36910] mb-1">선택된 스크립트</div>
            <div className="text-[11px] text-foreground break-all">{url}</div>
          </div>
        ) : (
          <div className="rounded border border-border bg-muted p-2 text-[11px] text-muted-foreground">
            아직 스크립트가 선택되지 않았습니다. 위 목록에서 항목을 먼저 클릭하세요.
          </div>
        )}

        <input
          value={url}
          onChange={(event) => {
            setSelectedScriptId(null);
            setUrl(event.target.value);
          }}
          placeholder="선택된 script URL"
          className="w-full bg-card border border-border rounded px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-[#f36910] focus:ring-2 focus:ring-[#f36910]/15"
        />
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <input
            value={startLine}
            onChange={(event) => setStartLine(event.target.value)}
            inputMode="numeric"
            placeholder="시작 라인"
            className="min-w-0 bg-card border border-border rounded px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-[#f36910] focus:ring-2 focus:ring-[#f36910]/15"
          />
          <input
            value={endLine}
            onChange={(event) => setEndLine(event.target.value)}
            inputMode="numeric"
            placeholder="종료 라인"
            className="min-w-0 bg-card border border-border rounded px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-[#f36910] focus:ring-2 focus:ring-[#f36910]/15"
          />
          <button
            type="button"
            onClick={apply}
            disabled={!url.trim()}
            className="px-3 py-1.5 rounded bg-[#f36910] text-white text-xs hover:bg-[#d85a0d] disabled:bg-[#777777] disabled:cursor-not-allowed"
          >
            적용
          </button>
        </div>

        <div className="border border-border rounded overflow-hidden bg-[#3f3f3f]">
          <div className="px-2 py-1.5 border-b border-border bg-card text-[11px] text-foreground flex items-center justify-between gap-2">
            <span>코드 라인 선택</span>
            <span>라인을 클릭하면 시작/종료 범위가 지정됩니다</span>
          </div>
          {scriptSource ? (
            <div className="max-h-80 overflow-auto font-mono text-[11px]">
              {scriptSource.split("\n").slice(0, 1200).map((line, index) => {
                const lineNumber = index + 1;
                const selected =
                  lineNumber >= Number(startLine) && lineNumber <= Number(endLine);

                return (
                  <button
                    key={lineNumber}
                    type="button"
                    onClick={() => selectLine(lineNumber)}
                    className={`w-full grid grid-cols-[56px_1fr] text-left ${
                      selected ? "bg-[#f36910]" : "bg-transparent hover:bg-card"
                    }`}
                  >
                    <span className="px-2 py-0.5 text-right text-muted-foreground select-none border-r border-border">
                      {lineNumber}
                    </span>
                    <span className="px-2 py-0.5 text-foreground whitespace-pre overflow-visible">
                      {line || " "}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-4 text-xs text-muted-foreground text-center">
              {sourceStatus || "스크립트를 선택하면 코드가 여기에 표시됩니다."}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>{scripts.length} scripts detected</span>
        {status && <span className="text-right break-words text-[#f36910]">{status}</span>}
      </div>
    </div>
  );
}

export function AnalysisPanel({
  trace,
  debuggerScripts,
  logpointStatus,
  networkResourceFilter,
  onNetworkResourceFilterChange,
  onApplyLogpoints,
  onLoadScriptSource,
}: AnalysisPanelProps) {
  const [expandedStoryId, setExpandedStoryId] = useState<string | null>(null);
  const [graphOpen, setGraphOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<"flow" | "analysis">("flow");
  const [networkSearchQuery, setNetworkSearchQuery] = useState("");
  const [selectedAnalysisErrorId, setSelectedAnalysisErrorId] = useState<string | null>(
    trace.errors[0]?.id || null
  );
  const [expandedAnalysisErrorId, setExpandedAnalysisErrorId] = useState<string | null>(
    trace.errors[0]?.id || null
  );
  const [aiAnalysisByErrorId, setAiAnalysisByErrorId] = useState<Record<string, AiAnalysisState>>({});
  const [autoAnalysisKey, setAutoAnalysisKey] = useState("");
  const flowStory = buildFlowStory(trace, networkResourceFilter);
  const visibleApiCount = trace.apiCalls.filter((apiCall) =>
    shouldShowApiCall(apiCall, networkResourceFilter)
  ).length;
  const traceApiCaller = (apiCall: TraceApiCall) => {
    const caller = getCallerFrame(apiCall);
    if (!caller?.sourceFile || !caller.line) return;

    onApplyLogpoints({
      url: caller.sourceFile,
      startLine: Math.max(1, caller.line - 1),
      endLine: caller.line,
    });
  };
  const updateAiAnalysis = (errorId: string, nextState: AiAnalysisState) => {
    setAiAnalysisByErrorId((current) => ({
      ...current,
      [errorId]: nextState,
    }));
  };
  const openErrorInAnalysis = (errorId: string) => {
    setSelectedAnalysisErrorId(errorId);
    setExpandedAnalysisErrorId(errorId);
    setPanelTab("analysis");
    setGraphOpen(false);
  };

  useEffect(() => {
    const firstErrorId = trace.errors[0]?.id || null;
    setSelectedAnalysisErrorId(firstErrorId);
    setExpandedAnalysisErrorId(firstErrorId);
    setAiAnalysisByErrorId({});
    setAutoAnalysisKey("");
  }, [trace.id]);

  return (
    <div className="h-full flex flex-col bg-background dark:bg-background">
      <div className="grid grid-cols-2 gap-2 p-2 border-b border-border bg-muted dark:border-border dark:bg-[#3f3f3f]">
        <button
          type="button"
          onClick={() => setPanelTab("flow")}
          className={`rounded border px-3 py-2.5 text-left transition-colors ${
            panelTab === "flow"
              ? "border-[#f36910] bg-[#fff7ed] shadow-sm dark:border-[#ad8460] dark:bg-[#5f564e]"
              : "border-border bg-card hover:border-border hover:bg-muted/40 dark:border-border dark:bg-card dark:hover:border-border dark:hover:bg-muted"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className={`flex items-center gap-1.5 text-sm font-medium ${
                panelTab === "flow" ? "text-[#c2410c] dark:text-[#ffe5cc]" : "text-foreground dark:text-foreground"
              }`}
            >
              <GitBranch className="w-4 h-4" />
              Flow
            </span>
            <span className={`text-[11px] ${panelTab === "flow" ? "text-[#9a3412] dark:text-[#ffe5cc]" : "text-foreground dark:text-muted-foreground"}`}>{flowStory.length}</span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-1 dark:text-muted-foreground">실행 흐름과 노드</div>
        </button>
        <button
          type="button"
          onClick={() => setPanelTab("analysis")}
          className={`rounded border px-3 py-2.5 text-left transition-colors ${
            panelTab === "analysis"
              ? "border-[#f36910] bg-[#fff7ed] shadow-sm dark:border-[#ad8460] dark:bg-[#5f564e]"
              : "border-border bg-card hover:border-border hover:bg-muted/40 dark:border-border dark:bg-card dark:hover:border-border dark:hover:bg-muted"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className={`flex items-center gap-1.5 text-sm font-medium ${
                panelTab === "analysis" ? "text-[#c2410c] dark:text-[#ffe5cc]" : "text-foreground dark:text-foreground"
              }`}
            >
              <Sparkles className="w-4 h-4" />
              분석
            </span>
            <span className={`text-[11px] ${panelTab === "analysis" ? "text-[#9a3412] dark:text-[#ffe5cc]" : "text-foreground dark:text-muted-foreground"}`}>{trace.errors.length}</span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-1 dark:text-muted-foreground">리포트와 원인 후보</div>
        </button>
      </div>

      <div className="flex-1 overflow-hidden">
        <FlowGraphDialog
          open={graphOpen}
          onOpenChange={setGraphOpen}
          story={flowStory}
          trace={trace}
          networkResourceFilter={networkResourceFilter}
          networkSearchQuery={networkSearchQuery}
          visibleApiCount={visibleApiCount}
          aiAnalysisByErrorId={aiAnalysisByErrorId}
          onNetworkResourceFilterChange={onNetworkResourceFilterChange}
          onNetworkSearchChange={setNetworkSearchQuery}
          onInspectError={openErrorInAnalysis}
        />
        {panelTab === "flow" ? (
          <div className="h-full flex flex-col overflow-hidden">
            <NetworkResourceFilterBar
              value={networkResourceFilter}
              totalCount={trace.apiCalls.length}
              visibleCount={visibleApiCount}
              searchQuery={networkSearchQuery}
              onChange={onNetworkResourceFilterChange}
              onSearchChange={setNetworkSearchQuery}
            />
            <div className="flex-1 overflow-auto p-4 space-y-3">
              <div>
                <div className="text-sm text-foreground">Scenario Flow</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  함수, API, 에러를 시간순으로 연결해 한 번의 실행 이야기로 보여줍니다.
                </div>
              </div>

              {flowStory.length > 0 ? (
                <div className="space-y-3">
                  {flowStory.map((item, index) => (
                    <FlowStoryCard
                      key={item.id}
                      item={item}
                      index={index}
                      expanded={expandedStoryId === item.id}
                      searchMatched={matchesFlowItemSearch(item, networkSearchQuery)}
                      onToggle={() =>
                        setExpandedStoryId(expandedStoryId === item.id ? null : item.id)
                      }
                      onTraceApiCaller={traceApiCaller}
                      onInspectError={openErrorInAnalysis}
                    />
                  ))}
                </div>
              ) : (
                <div className="border border-border rounded bg-card p-6 text-center">
                  <div className="text-sm text-foreground mb-1">아직 시나리오가 없습니다</div>
                  <div className="text-xs text-muted-foreground">
                    Start Trace를 누른 뒤 페이지를 조작하면 흐름이 여기에 연결됩니다.
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="h-full overflow-auto p-4 space-y-4">
            <div className="flex items-center justify-between gap-3 rounded border border-border bg-card p-3 dark:border-border dark:bg-card">
              <div>
                <div className="text-sm font-medium text-foreground dark:text-foreground">분석 도구</div>
                <div className="text-xs text-muted-foreground mt-1 dark:text-muted-foreground">
                  에러 원인 후보를 보고 필요하면 전체 Flow 도식을 별도로 확인합니다.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setGraphOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#f36910] text-white text-xs hover:bg-[#d85a0d]"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                Flow 분석
              </button>
            </div>

            {trace.status === "completed" ? (
              <TraceReport trace={trace} story={flowStory} />
            ) : (
              <div className="border border-border bg-muted rounded p-4 dark:border-border dark:bg-card">
                <div className="text-sm font-medium text-foreground dark:text-foreground">분석 대기 중</div>
                <div className="text-xs text-muted-foreground mt-1 dark:text-muted-foreground">
                  Trace를 Stop하면 도식화 리포트와 원인 후보가 여기에 표시됩니다.
                </div>
              </div>
            )}
            <ErrorAnalysisTool
              trace={trace}
              story={flowStory}
              selectedErrorId={selectedAnalysisErrorId}
              expandedErrorId={expandedAnalysisErrorId}
              aiAnalysisByErrorId={aiAnalysisByErrorId}
              autoAnalysisKey={autoAnalysisKey}
              onSelectError={setSelectedAnalysisErrorId}
              onToggleError={setExpandedAnalysisErrorId}
              onUpdateAiAnalysis={updateAiAnalysis}
              onAutoAnalysisKeyChange={setAutoAnalysisKey}
            />
          </div>
        )}
      </div>
    </div>
  );
}
