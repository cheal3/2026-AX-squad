export type TraceStatus = "idle" | "recording" | "completed" | "error" | "analyzing";

export type TimelineEventType = "action" | "function" | "api" | "error" | "page" | "dom";
export type NetworkResourceFilter =
  | "xhr-fetch"
  | "document"
  | "script"
  | "stylesheet"
  | "image"
  | "font"
  | "other";
export type NetworkResourceFilterSelection = NetworkResourceFilter[];

export interface TraceFunctionNode {
  id: string;
  functionName: string;
  callType?: "instrumented" | "manual" | "event-listener" | "devtools-paused";
  sourceFile?: string;
  line?: number;
  column?: number;
  parameters?: Record<string, unknown>;
  returnValue?: unknown;
  executionTime?: number;
  hasError?: boolean;
  children?: TraceFunctionNode[];
}

export interface TraceTimelineEvent {
  id: string;
  type: TimelineEventType;
  title: string;
  timestamp: string;
  details?: string;
  status?: "success" | "error";
  domMutation?: {
    addedCount: number;
    removedCount: number;
    attributeCount: number;
    textCount: number;
    samples?: Array<Record<string, unknown>>;
    trigger?: Record<string, unknown>;
    pageUrl?: string;
  };
}

export interface TraceError {
  id: string;
  message: string;
  type: string;
  file: string;
  line: number;
  column?: number;
  stackTrace?: string;
}

export interface TraceApiCall {
  id: string;
  method: string;
  endpoint: string;
  status: string;
  statusType: "success" | "error";
  request: Record<string, unknown>;
  response?: Record<string, unknown>;
}

export interface TraceInsight {
  id: string;
  type: "analysis" | "suggestion" | "warning" | "fix";
  title: string;
  content: string;
  codeSnippet?: string;
}

export interface TraceSession {
  id: string;
  name: string;
  environment: "development" | "staging" | "production";
  status: TraceStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs: number;
  functions: TraceFunctionNode[];
  timeline: TraceTimelineEvent[];
  errors: TraceError[];
  apiCalls: TraceApiCall[];
  insights: TraceInsight[];
  codeLocations: Array<{ file: string; line: number; column?: number }>;
}

export const emptyTraceSession: TraceSession = {
  id: "trace-empty",
  name: "New Trace Session",
  environment: "development",
  status: "idle",
  durationMs: 0,
  functions: [],
  timeline: [],
  errors: [],
  apiCalls: [],
  insights: [],
  codeLocations: [],
};

export const demoTraceSession: TraceSession = {
  id: "trace-login-demo",
  name: "Login Flow Trace",
  environment: "development",
  status: "completed",
  startedAt: "10:24:12",
  completedAt: "10:24:13",
  durationMs: 245,
  functions: [
    {
      id: "fn-login-submit",
      functionName: "handleLoginSubmit",
      parameters: { email: "user@example.com", password: "***" },
      executionTime: 245,
      children: [
        {
          id: "fn-validate",
          functionName: "validateCredentials",
          parameters: { email: "user@example.com" },
          executionTime: 12,
        },
        {
          id: "fn-authenticate",
          functionName: "authenticateUser",
          parameters: { userId: 12345 },
          executionTime: 156,
          hasError: true,
          children: [
            {
              id: "fn-profile",
              functionName: "fetchUserProfile",
              parameters: { userId: 12345 },
              executionTime: 89,
              hasError: true,
            },
          ],
        },
        {
          id: "fn-redirect",
          functionName: "redirectToDashboard",
          parameters: { route: "/dashboard" },
          executionTime: 5,
        },
      ],
    },
  ],
  timeline: [
    {
      id: "event-submit",
      type: "function",
      title: "handleLoginSubmit",
      timestamp: "0ms",
      details: "User initiated login",
    },
    {
      id: "event-validate",
      type: "function",
      title: "validateCredentials",
      timestamp: "12ms",
      details: "Email format validated",
    },
    {
      id: "event-login-api",
      type: "api",
      title: "POST /api/auth/login",
      timestamp: "24ms",
      details: "Authentication request",
    },
    {
      id: "event-auth",
      type: "function",
      title: "authenticateUser",
      timestamp: "48ms",
      details: "Processing authentication",
    },
    {
      id: "event-profile-api",
      type: "api",
      title: "GET /api/users/12345",
      timestamp: "156ms",
      details: "Fetching user profile",
    },
    {
      id: "event-profile-error",
      type: "error",
      title: "fetchUserProfile failed",
      timestamp: "180ms",
      details: "Network timeout",
      status: "error",
    },
    {
      id: "event-auth-error",
      type: "function",
      title: "handleAuthError",
      timestamp: "182ms",
      details: "Error boundary triggered",
    },
  ],
  errors: [
    {
      id: "error-timeout",
      message: "Failed to fetch user profile: Network request timed out after 5000ms",
      type: "NetworkError",
      file: "src/services/auth.ts",
      line: 142,
      column: 15,
      stackTrace: `Error: Network request timed out
    at fetchUserProfile (auth.ts:142:15)
    at authenticateUser (auth.ts:98:22)
    at handleLoginSubmit (LoginForm.tsx:56:10)`,
    },
    {
      id: "error-user-id",
      message: "Cannot read property 'userId' of undefined",
      type: "TypeError",
      file: "src/components/LoginForm.tsx",
      line: 78,
      stackTrace: `TypeError: Cannot read property 'userId' of undefined
    at onLoginSuccess (LoginForm.tsx:78:25)
    at handleResponse (auth.ts:165:8)`,
    },
  ],
  apiCalls: [
    {
      id: "api-login",
      method: "POST",
      endpoint: "/api/auth/login",
      status: "200 OK",
      statusType: "success",
      request: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer ***",
        },
        body: {
          email: "user@example.com",
          password: "***",
        },
      },
      response: {
        success: true,
        token: "eyJhbGciOiJIUzI1NiIsInR5cCI6***",
        userId: 12345,
      },
    },
    {
      id: "api-profile",
      method: "GET",
      endpoint: "/api/users/12345",
      status: "408 Timeout",
      statusType: "error",
      request: {
        method: "GET",
        headers: {
          Authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6***",
        },
      },
    },
  ],
  insights: [
    {
      id: "insight-root-cause",
      type: "analysis",
      title: "Root Cause Identified",
      content:
        "The fetchUserProfile function is timing out due to a missing await keyword, causing the promise to be handled incorrectly in the error boundary.",
    },
    {
      id: "insight-race",
      type: "warning",
      title: "Potential Race Condition",
      content:
        "The authenticateUser function doesn't wait for token validation before proceeding. This could lead to unauthorized access if the validation fails.",
    },
    {
      id: "insight-cache",
      type: "suggestion",
      title: "Performance Optimization",
      content:
        "Consider implementing request caching for user profiles to reduce network calls and improve response time.",
    },
    {
      id: "insight-fix",
      type: "fix",
      title: "Suggested Fix",
      content: "Add proper async/await handling and increase timeout threshold:",
      codeSnippet: `async function fetchUserProfile(userId) {
  try {
    const response = await fetch(\`/api/users/\${userId}\`, {
      timeout: 10000 // Increase from 5000ms
    });
    return await response.json();
  } catch (error) {
    console.error('Profile fetch failed:', error);
    throw error;
  }
}`,
    },
  ],
  codeLocations: [
    { file: "src/services/auth.ts", line: 142, column: 15 },
    { file: "src/components/LoginForm.tsx", line: 56 },
    { file: "src/components/LoginForm.tsx", line: 78 },
    { file: "src/utils/api.ts", line: 89 },
  ],
};
