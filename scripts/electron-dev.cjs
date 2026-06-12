const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");
const readline = require("readline");
const { URL } = require("url");

function hasRequiredNodeVersion() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  return major > 22 || (major === 22 && minor >= 12);
}

function findNode22Binary() {
  const candidates = [
    "/opt/homebrew/opt/node@22/bin/node",
    "/usr/local/opt/node@22/bin/node",
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

if (!hasRequiredNodeVersion()) {
  const node22 = findNode22Binary();

  if (!node22) {
    console.error(
      `Electron 42 requires Node >=22.12.0, but current Node is ${process.versions.node}.`
    );
    console.error("Install Node 22 or run: brew install node@22");
    process.exit(1);
  }

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;

  const result = spawnSync(node22, [__filename, ...process.argv.slice(2)], {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status ?? 0);
}

const electronPath = require("electron");

const rootDir = path.resolve(__dirname, "..");
const host = "127.0.0.1";
const preferredPort = 5173;
const launcherPreferredPort = 5172;
const managedRuntimeDir = path.join(rootDir, ".debug-browser-runtimes");
const commentCacheDir = path.join(managedRuntimeDir, ".ai-comments");
const commentCacheVersion = 7;

const electronChromiumMap = {
  "43.0.0-alpha.1": "149.0.7827.0",
  "42.0.0": "148.0.7778.96",
  "41.0.0": "146.0.7680.65",
  "40.0.0": "144.0.7559.60",
  "39.0.0": "142.0.7444.52",
  "38.0.0": "140.0.7339.41",
  "37.0.0": "138.0.7204.35",
  "36.0.0": "136.0.7103.48",
  "35.0.0": "134.0.6998.44",
  "34.0.0": "132.0.6834.83",
};

const managedElectronOptions = [
  {
    id: "electron-43-alpha-1",
    electronVersion: "43.0.0-alpha.1",
    description: "Chromium 149 계열 확인용 알파 런타임",
  },
  {
    id: "electron-42",
    electronVersion: "42.0.0",
    description: "최신 계열 테스트용",
  },
  {
    id: "electron-41",
    electronVersion: "41.0.0",
    description: "직전 계열 호환성 확인",
  },
  {
    id: "electron-40",
    electronVersion: "40.0.0",
    description: "중간 버전 재현용",
  },
  {
    id: "electron-39",
    electronVersion: "39.0.0",
    description: "구버전 문의 재현용",
  },
  {
    id: "electron-38",
    electronVersion: "38.0.0",
    description: "더 낮은 Chromium 계열 확인",
  },
  {
    id: "electron-37",
    electronVersion: "37.0.0",
    description: "Chromium 138 계열 재현용",
  },
  {
    id: "electron-36",
    electronVersion: "36.0.0",
    description: "Chromium 136 계열 재현용",
  },
  {
    id: "electron-35",
    electronVersion: "35.0.0",
    description: "Chromium 134 계열 재현용",
  },
  {
    id: "electron-34",
    electronVersion: "34.0.0",
    description: "Chromium 132 계열 재현용",
  },
];

function run(command, args, options = {}) {
  return spawn(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
}

function runDetached(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: rootDir,
    detached: true,
    stdio: "ignore",
    shell: process.platform === "win32",
    ...options,
  });
  child.unref();
  return child;
}

function findAvailablePort(startPort) {
  return new Promise((resolve) => {
    const tryPort = (port) => {
      const server = net.createServer();

      server.once("error", () => {
        tryPort(port + 1);
      });

      server.once("listening", () => {
        server.close(() => resolve(port));
      });

      server.listen(port, host);
    };

    tryPort(startPort);
  });
}

function waitForPort(port) {
  return new Promise((resolve) => {
    const tryConnect = () => {
      const socket = net.createConnection({ host, port }, () => {
        socket.end();
        resolve();
      });

      socket.on("error", () => {
        setTimeout(tryConnect, 150);
      });
    };

    tryConnect();
  });
}

let vite;

function getBundledElectronVersion() {
  try {
    return require("electron/package.json").version;
  } catch {
    return undefined;
  }
}

function getChromiumVersion(electronVersion) {
  return electronVersion ? electronChromiumMap[electronVersion] : undefined;
}

function parseVersionParts(version) {
  return String(version || "")
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
}

function compareVersionsDesc(leftVersion, rightVersion) {
  if (!leftVersion && !rightVersion) return 0;
  if (!leftVersion) return 1;
  if (!rightVersion) return -1;

  const leftParts = parseVersionParts(leftVersion);
  const rightParts = parseVersionParts(rightVersion);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = leftParts[index] || 0;
    const rightPart = rightParts[index] || 0;

    if (leftPart !== rightPart) {
      return rightPart - leftPart;
    }
  }

  return 0;
}

function sortRuntimeOptionsByChromiumDesc(options) {
  return [...options].sort((left, right) => {
    const chromiumOrder = compareVersionsDesc(left.chromiumVersion, right.chromiumVersion);
    if (chromiumOrder !== 0) return chromiumOrder;

    return compareVersionsDesc(left.electronVersion, right.electronVersion);
  });
}

function formatVersionLabel(electronVersion, chromiumVersion) {
  const electronText = electronVersion ? `Electron ${electronVersion}` : "Electron";
  const chromiumText = chromiumVersion ? `Chromium ${chromiumVersion}` : "Chromium 버전 확인 필요";
  return `${electronText} / ${chromiumText}`;
}

function getManagedElectronRoot(version) {
  return path.join(managedRuntimeDir, `electron-v${version}`);
}

function getManagedElectronCommand(version) {
  const runtimeRoot = getManagedElectronRoot(version);

  if (process.platform === "darwin") {
    return path.join(runtimeRoot, "Electron.app", "Contents", "MacOS", "Electron");
  }

  if (process.platform === "win32") {
    return path.join(runtimeRoot, "electron.exe");
  }

  return path.join(runtimeRoot, "electron");
}

function getManagedRuntimeStatus(version) {
  if (version === "bundled" || version === getBundledElectronVersion()) {
    return "설치됨";
  }

  return fs.existsSync(getManagedElectronCommand(version)) ? "설치됨" : "미설치";
}

function getRuntimeSources(option) {
  const electronVersion = option.electronVersion;
  if (!electronVersion) return [];

  return [
    `https://github.com/electron/electron/releases/tag/v${electronVersion}`,
    `https://github.com/electron/electron/issues?q=${encodeURIComponent(`${electronVersion} is:issue`)}`,
    `https://releases.electronjs.org/release/v${electronVersion}`,
  ];
}

function toPublicRuntimeOption(option) {
  const status = option.managedVersion ? getManagedRuntimeStatus(option.managedVersion) : "준비됨";

  return {
    id: option.id,
    label: option.label,
    runtimeLabel: option.runtimeLabel,
    description: option.description,
    electronVersion: option.electronVersion,
    chromiumVersion: option.chromiumVersion,
    managedVersion: option.managedVersion,
    status,
    installed: status === "설치됨" || status === "준비됨",
    sources: getRuntimeSources(option),
  };
}

function extractZip(zipPath, destination) {
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(destination, { recursive: true });

  const result = spawnSync("unzip", ["-q", zipPath, "-d", destination], {
    cwd: rootDir,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Electron 압축 해제 실패: unzip exit code ${result.status}`);
  }
}

async function ensureManagedElectron(version, options = {}) {
  const promptDownload = options.promptDownload ?? true;

  if (version === "bundled" || version === getBundledElectronVersion()) {
    return electronPath;
  }

  const command = getManagedElectronCommand(version);

  if (fs.existsSync(command)) {
    return command;
  }

  if (!promptDownload && !process.stdin.isTTY) {
    console.log(`\n[browser-runtime] Electron ${version} 런타임을 다운로드합니다.`);
  } else if (!process.stdin.isTTY) {
    throw new Error(`Electron ${version} 런타임이 없습니다. 터미널에서 실행해 다운로드를 승인하세요.`);
  } else if (promptDownload) {
    const approved = await askQuestion(
      `\nElectron ${version} 런타임이 없습니다. 지금 다운로드할까요? 데이터가 수백 MB 사용될 수 있습니다. [y/N]: `
    );

    if (!["y", "yes"].includes(approved.toLowerCase())) {
      throw new Error(`Electron ${version} 다운로드가 취소되었습니다.`);
    }
  }

  console.log(`\n[browser-runtime] Electron ${version} 다운로드를 시작합니다.`);
  const { download } = await import("@electron/get");
  const zipPath = await download(version, {
    cacheRoot: path.join(managedRuntimeDir, ".download-cache"),
  });

  console.log(`[browser-runtime] 다운로드 완료: ${zipPath}`);
  console.log(`[browser-runtime] ${getManagedElectronRoot(version)}에 압축을 해제합니다.`);
  extractZip(zipPath, getManagedElectronRoot(version));

  if (!fs.existsSync(command)) {
    throw new Error(`Electron 실행 파일을 찾지 못했습니다: ${command}`);
  }

  fs.chmodSync(command, 0o755);
  return command;
}

function loadRuntimeOptions() {
  const bundledElectronVersion = getBundledElectronVersion();
  const bundledChromiumVersion = getChromiumVersion(bundledElectronVersion);
  const options = [
    {
      id: "bundled",
      label: formatVersionLabel(bundledElectronVersion, bundledChromiumVersion),
      runtimeLabel: `Electron ${bundledElectronVersion}`,
      command: "",
      args: [],
      electronVersion: bundledElectronVersion,
      chromiumVersion: bundledChromiumVersion,
      managedVersion: "bundled",
    },
    ...managedElectronOptions
      .filter((runtime) => runtime.electronVersion !== bundledElectronVersion)
      .map((runtime) => {
        const chromiumVersion = getChromiumVersion(runtime.electronVersion);

        return {
          id: runtime.id,
          label: formatVersionLabel(runtime.electronVersion, chromiumVersion),
          runtimeLabel: `Electron ${runtime.electronVersion}`,
          command: "",
          args: [],
          electronVersion: runtime.electronVersion,
          chromiumVersion,
          managedVersion: runtime.electronVersion,
        };
      }),
  ];

  if (process.env.DEBUG_BROWSER_ELECTRON_BIN) {
    options.push({
      id: "env",
      label: "환경변수 Electron",
      runtimeLabel: "환경변수 Electron",
      command: process.env.DEBUG_BROWSER_ELECTRON_BIN,
      args: [],
    });
  }

  const configPath = path.join(rootDir, "browser-runtimes.json");
  if (fs.existsSync(configPath)) {
    try {
      const configured = JSON.parse(fs.readFileSync(configPath, "utf8"));
      if (Array.isArray(configured)) {
        configured.forEach((runtime, index) => {
          if (!runtime?.command) return;
          options.push({
            id: runtime.id || `config-${index}`,
            label: runtime.label || runtime.command,
            runtimeLabel: runtime.runtimeLabel || runtime.label || runtime.command,
            command: runtime.command,
            args: Array.isArray(runtime.args) ? runtime.args : [],
            electronVersion: runtime.electronVersion,
            chromiumVersion: runtime.chromiumVersion,
            description: runtime.description,
          });
        });
      }
    } catch (error) {
      console.warn(`[browser-runtime] browser-runtimes.json parse failed: ${error?.message || error}`);
    }
  }

  return sortRuntimeOptionsByChromiumDesc(options);
}

function formatRuntimeOption(option, index, selectedIndex) {
  const prefix = index === selectedIndex ? ">" : " ";
  const status = option.managedVersion ? getManagedRuntimeStatus(option.managedVersion) : "준비됨";
  const row = `${prefix} ${option.label}  |  ${status}`;

  if (index !== selectedIndex) return `  ${row}`;

  return `\x1B[38;5;208m  ${row}\x1B[0m`;
}

function renderRuntimeMenu(options, selectedIndex, previousLineCount) {
  if (previousLineCount > 0) {
    process.stdout.write(`\x1B[${previousLineCount}A\x1B[0J`);
  }

  const lines = [
    "디버깅 브라우저 런타임을 선택하세요.",
    "↑/↓ 이동, Enter 선택, Ctrl+C 종료",
    "",
    ...options.map((option, index) => formatRuntimeOption(option, index, selectedIndex)),
  ];

  process.stdout.write(`${lines.join("\n")}\n`);
  return lines.length;
}

function selectRuntimeWithKeyboard(options) {
  return new Promise((resolve, reject) => {
    let selectedIndex = 0;
    let renderedLines = 0;
    let onData;

    const cleanup = () => {
      if (onData) {
        process.stdin.off("data", onData);
      }
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\x1B[?25h");
    };

    const finish = (option) => {
      cleanup();
      process.stdout.write(`\n선택됨: ${option.label}\n`);
      resolve(option);
    };

    process.stdout.write("\x1B[?25l");
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    renderedLines = renderRuntimeMenu(options, selectedIndex, renderedLines);

    onData = (key) => {
      if (key === "\u0003") {
        cleanup();
        reject(new Error("런타임 선택이 취소되었습니다."));
        return;
      }

      if (key === "\r" || key === "\n") {
        finish(options[selectedIndex]);
        return;
      }

      if (key === "\u001B[A" || key === "k") {
        selectedIndex = selectedIndex === 0 ? options.length - 1 : selectedIndex - 1;
        renderedLines = renderRuntimeMenu(options, selectedIndex, renderedLines);
        return;
      }

      if (key === "\u001B[B" || key === "j") {
        selectedIndex = selectedIndex === options.length - 1 ? 0 : selectedIndex + 1;
        renderedLines = renderRuntimeMenu(options, selectedIndex, renderedLines);
      }
    };

    process.stdin.on("data", onData);
  });
}

function askQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function selectRuntime() {
  const options = loadRuntimeOptions();
  const requestedRuntime = process.env.DEBUG_BROWSER_RUNTIME;
  const requestedOption = requestedRuntime
    ? options.find((option) => option.id === requestedRuntime)
    : undefined;

  if (requestedOption) return requestedOption;
  if (!process.stdin.isTTY) {
    return options.find((option) => option.id === "bundled") || options[0];
  }

  return selectRuntimeWithKeyboard(options);
}

async function prepareRuntime(runtime) {
  if (!runtime.managedVersion) return runtime;

  const command = await ensureManagedElectron(runtime.managedVersion, {
    promptDownload: runtime.promptDownload,
  });
  return {
    ...runtime,
    command,
    args: [],
  };
}

function getOpenCommand(url) {
  if (process.platform === "darwin") return { command: "open", args: [url] };
  if (process.platform === "win32") return { command: "cmd", args: ["/c", "start", "", url] };
  return { command: "xdg-open", args: [url] };
}

function openLauncherUrl(url) {
  if (process.env.DEBUG_BROWSER_NO_OPEN === "1") return;

  try {
    const { command, args } = getOpenCommand(url);
    runDetached(command, args);
  } catch (error) {
    console.warn(`[browser-runtime] 런처 브라우저 열기 실패: ${error?.message || error}`);
  }
}

function createJsonResponse(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function createHtmlResponse(response, html) {
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(html);
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text ? JSON.parse(text) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 9000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: options.accept || "text/plain, application/json",
        "User-Agent": "ai-flow-debug-agent-runtime-launcher",
      },
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function stripMarkdownLinks(text) {
  return String(text || "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function uniqueNonEmpty(items) {
  return [...new Set(items.map((item) => String(item || "").trim()).filter(Boolean))];
}

function includesAny(text, patterns) {
  const lowerText = String(text || "").toLowerCase();
  return patterns.some((pattern) => lowerText.includes(String(pattern).toLowerCase()));
}

function getChromiumMilestone(option) {
  const milestone = Number.parseInt(String(option.chromiumVersion || "").split(".")[0], 10);
  return Number.isFinite(milestone) ? milestone : undefined;
}

function stripJsonProtectionPrefix(text) {
  return String(text || "").replace(/^\)\]\}'\n?/, "");
}

function normalizeFeature(feature) {
  return {
    id: feature.id,
    name: stripMarkdownLinks(feature.name),
    summary: stripMarkdownLinks(feature.summary).slice(0, 700),
    milestone: feature.milestone,
    enterpriseMilestone: feature.first_enterprise_notification_milestone,
    components: feature.blink_components || [],
    bug: feature.browsers?.chrome?.bug,
    breakingChange: Boolean(feature.breaking_change),
    enterpriseImpact: feature.enterprise_impact,
    url: feature.id ? `https://chromestatus.com/feature/${feature.id}` : undefined,
  };
}

function getFeatureArea(feature) {
  const componentText = (feature.components || []).join(" ").toLowerCase();
  const nameText = String(feature.name || "").toLowerCase();
  const primaryText = `${componentText} ${nameText}`;
  const fullText = `${primaryText} ${feature.summary || ""}`.toLowerCase();

  if (includesAny(primaryText, ["performance", "profiling", "observer", "timing"])) {
    return "성능";
  }

  if (includesAny(primaryText, ["network", "websocket", "webtransport", "fetch", "cors", "cookie", "direct sockets", "clienthints", "user-agent"])) {
    return "네트워크";
  }

  if (includesAny(primaryText, ["security", "sanitizer", "permission", "credential", "webauthn", "privacy", "allowlist", "opaque origin", "gpc"])) {
    return "보안/권한";
  }

  if (includesAny(primaryText, ["css", "canvas", "dom", "view-transition", "render", "svg", "iframe", "layout"])) {
    return "렌더링/DOM";
  }

  if (includesAny(primaryText, ["webrtc", "camera", "media", "audio", "video", "capture"])) {
    return "미디어";
  }

  if (includesAny(primaryText, ["blink>ai", "prompt api", "summarizer", "embedding api", "embedder"])) {
    return "AI API";
  }

  if (includesAny(primaryText, ["storage", "worker", "service worker", "bfcache"])) {
    return "스토리지/라이프사이클";
  }

  if (includesAny(primaryText, ["platformintegration", "macos", "chromeos", "webapps", "appmanifest"])) {
    return "플랫폼";
  }

  if (includesAny(fullText, ["network", "websocket", "webtransport", "fetch", "cors", "cookie", "direct sockets", "clienthints", "user-agent"])) {
    return "네트워크";
  }

  if (includesAny(fullText, ["security", "sanitizer", "permission", "credential", "webauthn", "privacy", "allowlist", "opaque origin", "gpc"])) {
    return "보안/권한";
  }

  return "플랫폼";
}

function summarizeFeature(feature) {
  const area = getFeatureArea(feature);
  const name = feature.name.replace(/\s+/g, " ").trim();
  const summary = feature.summary.replace(/\s+/g, " ").trim();

  if (includesAny(`${name} ${summary}`, ["Disconnect WebSockets on BFCache entry"])) {
    return `${area}: BFCache 진입 시 WebSocket 연결을 끊는 변경이 있어 뒤로가기/앞으로가기 복원 흐름에서 실시간 연결 재연결 처리를 확인해야 합니다.`;
  }

  if (includesAny(`${name} ${summary}`, ["Reduced User-Agent"])) {
    return `${area}: User-Agent 문자열 축소가 기본 동작으로 전환되어 브라우저/OS 판별 로직은 Client Hints 기준으로 재확인해야 합니다.`;
  }

  if (includesAny(`${name} ${summary}`, ["WebTransport", "incomingHighWaterMark", "outgoingHighWaterMark"])) {
    return `${area}: WebTransport datagram의 water mark 옵션이 deprecated되어 관련 옵션을 쓰는 코드에서는 경고나 동작 차이를 확인해야 합니다.`;
  }

  if (includesAny(`${name} ${summary}`, ["direct-sockets-private", "local-network", "loopback-network"])) {
    return `${area}: Direct Sockets 권한 정책이 local-network/loopback-network 기준으로 병합되어 로컬 네트워크 접근 권한 선언을 다시 확인해야 합니다.`;
  }

  if (includesAny(`${name} ${summary}`, ["User-Agent header"])) {
    return `${area}: JavaScript 요청 API에서 User-Agent 헤더 변경이 허용되는 흐름이 추가되어 서버 분기나 봇 탐지 로직 재현 결과가 달라질 수 있습니다.`;
  }

  if (includesAny(`${name} ${summary}`, ["Connection Allowlists"])) {
    return `${area}: 외부 연결 대상을 allowlist로 제한하는 기능이 추가되어 엔드포인트 접근 실패가 정책 문제인지 네트워크 문제인지 분리해야 합니다.`;
  }

  if (includesAny(`${name} ${summary}`, ["Device Bound Session Credentials"])) {
    return `${area}: SSO 세션을 장치에 묶는 인증 흐름이 추가되어 쿠키 탈취/세션 이동 관련 재현 조건이 더 엄격해질 수 있습니다.`;
  }

  if (includesAny(`${name} ${summary}`, ["Sanitizer API"])) {
    return `${area}: Sanitizer API가 들어가 HTML 문자열 정제 로직을 브라우저 기본 API로 처리하는 경로를 검증할 수 있습니다.`;
  }

  if (includesAny(`${name} ${summary}`, ["Global Privacy Control"])) {
    return `${area}: Global Privacy Control 신호가 추가되어 개인정보 보호 선호값에 따라 요청/동의 처리 분기가 달라질 수 있습니다.`;
  }

  if (includesAny(`${name} ${summary}`, ["virtual cameras"])) {
    return `${area}: macOS의 오래된 가상 카메라 지원 제거가 예정되어 카메라 선택/권한 흐름이 달라질 수 있습니다.`;
  }

  if (includesAny(`${name} ${summary}`, ["macOS 12"])) {
    return `${area}: macOS 12 지원 종료가 예고되어 오래된 macOS 환경에서는 브라우저 업데이트와 재현 가능 범위를 따로 봐야 합니다.`;
  }

  if (includesAny(`${name} ${summary}`, ["WebRequest.SecurityInfo"])) {
    return `${area}: Controlled Frame에서 보안 정보 조회 API가 추가되어 인증서/보안 상태 진단 경로를 더 직접적으로 확인할 수 있습니다.`;
  }

  const areaFallbacks = {
    "네트워크": `${area}: ${name} 변경이 포함되어 요청 헤더, 연결 유지, BFCache 이동 시 네트워크 상태를 함께 확인해야 합니다.`,
    "보안/권한": `${area}: ${name} 변경이 포함되어 권한 정책, origin 처리, 인증/세션 조건이 재현 결과에 영향을 줄 수 있습니다.`,
    "렌더링/DOM": `${area}: ${name} 변경이 포함되어 DOM 탐색, 스타일 계산, 화면 표시 결과가 이전 milestone과 달라질 수 있습니다.`,
    "미디어": `${area}: ${name} 변경이 포함되어 카메라, 오디오, 입력 미디어 권한 또는 장치 선택 흐름을 확인해야 합니다.`,
    "성능": `${area}: ${name} 변경이 포함되어 성능 지표 수집이나 프로파일링 방식이 달라질 수 있습니다.`,
    "AI API": `${area}: ${name} 변경이 포함되어 브라우저 내장 AI API 호출 옵션과 응답 품질 조건을 확인해야 합니다.`,
    "스토리지/라이프사이클": `${area}: ${name} 변경이 포함되어 worker, storage, BFCache 같은 페이지 생명주기 흐름을 확인해야 합니다.`,
    "플랫폼": `${area}: ${name} 변경이 포함되어 OS 통합 또는 브라우저 플랫폼 동작 차이를 확인해야 합니다.`,
  };

  return areaFallbacks[area] || areaFallbacks["플랫폼"];
}

function createChromiumChangeInsights(research) {
  const preferredAreas = ["네트워크", "보안/권한", "렌더링/DOM", "스토리지/라이프사이클", "미디어", "성능", "AI API", "플랫폼"];
  const seenAreas = new Set();
  const selected = [];

  for (const area of preferredAreas) {
    const feature = (research.features || []).find((candidate) => getFeatureArea(candidate) === area);
    if (feature && !seenAreas.has(area)) {
      selected.push(summarizeFeature(feature));
      seenAreas.add(area);
    }
    if (selected.length >= 5) break;
  }

  return uniqueNonEmpty(selected).slice(0, 5);
}

function describeChromiumFeatureRisk(feature) {
  const area = getFeatureArea(feature);
  const text = `${feature.name} ${feature.summary} ${(feature.components || []).join(" ")}`;

  if (includesAny(text, ["Disconnect WebSockets on BFCache entry"])) {
    return `${area}: BFCache에 들어갈 때 WebSocket이 끊기는 흐름이 있어, 뒤로가기 복원 후 실시간 연결이 자동으로 회복되는지 확인해야 합니다.`;
  }

  if (includesAny(text, ["WebTransport", "incomingHighWaterMark", "outgoingHighWaterMark"])) {
    return `${area}: WebTransport datagram 옵션 변경이 추적 중이라, 스트리밍/저지연 통신 코드에서 버퍼 설정 경고나 동작 차이를 확인해야 합니다.`;
  }

  if (includesAny(text, ["Opaque origin for data", "data: URLs"])) {
    return `${area}: data: URL 기반 worker의 origin 처리 변경이 있어, 임시 스크립트나 blob/data URL worker를 쓰는 코드에서 권한 차이가 날 수 있습니다.`;
  }

  if (includesAny(text, ["direct-sockets-private", "local-network", "loopback-network"])) {
    return `${area}: 로컬 네트워크/loopback 접근 권한 정책이 바뀌는 항목이라, 사내망·로컬 에이전트 연동 실패를 권한 문제로 분리해 봐야 합니다.`;
  }

  if (includesAny(text, ["Reduced User-Agent"])) {
    return `${area}: User-Agent 문자열 축소 정책이 연결되어 있어, UA 기반 브라우저/OS 판별 코드는 Client Hints로 대체되는지 확인해야 합니다.`;
  }

  if (includesAny(text, ["User-Agent header"])) {
    return `${area}: User-Agent 처리 변경이 연결되어 있어, 서버가 UA 문자열로 브라우저를 판별하는 경우 Client Hints 기준으로 재확인해야 합니다.`;
  }

  if (includesAny(text, ["Connection Allowlists"])) {
    return `${area}: 연결 allowlist 기능이 연결되어 있어, 특정 API endpoint만 실패하면 정책 차단인지 네트워크 장애인지 분리해야 합니다.`;
  }

  if (includesAny(text, ["Device Bound Session Credentials"])) {
    return `${area}: 장치에 묶인 SSO 세션 흐름이 연결되어 있어, 로그인 유지나 세션 이동 재현에서 기기 조건을 함께 확인해야 합니다.`;
  }

  if (includesAny(text, ["Sanitizer API"])) {
    return `${area}: Sanitizer API 변경이 연결되어 있어, HTML 문자열을 정제하는 코드에서 제거되는 태그/속성이 달라지는지 확인해야 합니다.`;
  }

  if (includesAny(text, ["Global Privacy Control"])) {
    return `${area}: Global Privacy Control 신호가 연결되어 있어, 개인정보 동의나 추적 차단 분기가 달라지는지 확인해야 합니다.`;
  }

  if (includesAny(text, ["virtual cameras"])) {
    return `${area}: macOS 가상 카메라 지원 변경이 연결되어 있어, 카메라 목록이 비거나 권한 요청 흐름이 달라질 수 있습니다.`;
  }

  if (includesAny(text, ["macOS 12"])) {
    return `${area}: macOS 12 지원 종료 예고가 연결되어 있어, 오래된 macOS 사용자 문제는 브라우저 업데이트 가능 여부까지 함께 확인해야 합니다.`;
  }

  if (includesAny(text, ["SecurityInfo", "Controlled Frame"])) {
    return `${area}: Controlled Frame 보안 정보 조회가 연결되어 있어, 인증서/보안 상태 표시 로직을 프레임 단위로 확인해야 합니다.`;
  }

  if (feature.breakingChange) {
    return `${area}: ${feature.name} 항목은 breaking change로 표시되어 같은 API 호출도 이전 milestone과 다르게 실패할 수 있습니다.`;
  }

  if (Number(feature.enterpriseImpact || 0) >= 3) {
    return `${area}: ${feature.name} 항목은 엔터프라이즈 영향도가 높아 정책/권한/배포 환경에 따라 증상이 달라질 수 있습니다.`;
  }

  return `${area}: ${feature.name}에 연결된 Chromium issue가 있어, 같은 영역의 증상이 나오면 해당 feature와 bug 링크를 기준으로 재현 범위를 좁혀야 합니다.`;
}

function createChromiumIssueInsights(research) {
  const riskyFeatures = (research.features || [])
    .filter((feature) => feature.bug || feature.breakingChange || Number(feature.enterpriseImpact || 0) >= 3)
    .slice(0, 5);

  return uniqueNonEmpty(riskyFeatures.map(describeChromiumFeatureRisk)).slice(0, 5);
}

async function loadChromeStatusFeatures(milestone) {
  const featuresUrl = "https://chromestatus.com/features.json";
  const raw = await fetchText(featuresUrl, { accept: "application/json", timeoutMs: 12000 });
  const allFeatures = JSON.parse(stripJsonProtectionPrefix(raw));
  const features = allFeatures
    .filter((feature) => {
      return (
        Number(feature.milestone) === milestone ||
        Number(feature.first_enterprise_notification_milestone) === milestone
      );
    })
    .map(normalizeFeature);

  return {
    features,
    source: featuresUrl,
  };
}

async function loadChromeReleaseFeed(milestone) {
  const feedUrl = "https://chromereleases.googleblog.com/feeds/posts/default/-/Stable%20updates?alt=json&max-results=40";
  const raw = await fetchText(feedUrl, { accept: "application/json", timeoutMs: 12000 });
  const feed = JSON.parse(raw);
  const entries = feed.feed?.entry || [];
  const releasePosts = entries
    .map((entry) => {
      const content = stripMarkdownLinks(entry.content?.$t || entry.summary?.$t || "");
      const title = stripMarkdownLinks(entry.title?.$t || "");
      const url = entry.link?.find((link) => link.rel === "alternate")?.href;
      return {
        title,
        content: content.slice(0, 1200),
        url,
        updated: entry.updated?.$t,
      };
    })
    .filter((entry) => {
      return `${entry.title}\n${entry.content}`.includes(`${milestone}.`);
    })
    .slice(0, 5);

  return {
    releasePosts,
    source: feedUrl,
  };
}

async function loadRuntimeResearch(option) {
  const milestone = getChromiumMilestone(option);
  if (!milestone) {
    return {
      milestone,
      branch: {},
      releases: [],
      releasePosts: [],
      features: [],
      sources: getRuntimeSources(option),
    };
  }

  const milestoneUrl = `https://chromiumdash.appspot.com/fetch_milestones?mstone=${milestone}`;
  const releasesUrl = `https://chromiumdash.appspot.com/fetch_releases?milestone=${milestone}&platform=Windows&channel=Stable&num=6`;

  const [milestoneResult, releasesResult, featuresResult, feedResult] = await Promise.allSettled([
    fetchText(milestoneUrl, { accept: "application/json" }),
    fetchText(releasesUrl, { accept: "application/json" }),
    loadChromeStatusFeatures(milestone),
    loadChromeReleaseFeed(milestone),
  ]);

  let branch = {};
  if (milestoneResult.status === "fulfilled") {
    branch = JSON.parse(milestoneResult.value)?.[0] || {};
  }

  let releases = [];
  if (releasesResult.status === "fulfilled") {
    releases = JSON.parse(releasesResult.value)
      .slice(0, 6)
      .map((release) => ({
        version: release.version,
        previousVersion: release.previous_version,
        channel: release.channel,
        platform: release.platform,
        time: release.time,
      }));
  }

  const featuresPayload =
    featuresResult.status === "fulfilled" ? featuresResult.value : { features: [], source: undefined };
  const feedPayload =
    feedResult.status === "fulfilled" ? feedResult.value : { releasePosts: [], source: undefined };

  const featureSources = featuresPayload.features
    .flatMap((feature) => [feature.url, feature.bug])
    .filter(Boolean)
    .slice(0, 12);

  return {
    milestone,
    branch,
    releases,
    releasePosts: feedPayload.releasePosts,
    features: featuresPayload.features,
    sources: uniqueNonEmpty([
      milestoneUrl,
      releasesUrl,
      featuresPayload.source,
      feedPayload.source,
      ...featureSources,
    ]),
  };
}

function getCommentCachePath(option) {
  const cacheKey = option.id.replace(/[^a-z0-9_.-]/gi, "_");
  return path.join(commentCacheDir, `${cacheKey}.json`);
}

function readCachedAiComment(option) {
  const cachePath = getCommentCachePath(option);
  if (!fs.existsSync(cachePath)) return undefined;

  try {
    const cached = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    const ageMs = Date.now() - Number(cached.createdAt || 0);
    if (cached.version !== commentCacheVersion) return undefined;
    if (ageMs > 1000 * 60 * 60 * 24) return undefined;
    return cached.comment;
  } catch {
    return undefined;
  }
}

function writeCachedAiComment(option, comment) {
  fs.mkdirSync(commentCacheDir, { recursive: true });
  fs.writeFileSync(
    getCommentCachePath(option),
    JSON.stringify({ version: commentCacheVersion, createdAt: Date.now(), comment }, null, 2)
  );
}

function createFallbackRuntimeComment(option, research) {
  const changes = createChromiumChangeInsights(research);
  const issues = createChromiumIssueInsights(research);

  return {
    provider: "local",
    summary: `Chromium ${option.chromiumVersion || "버전 확인 필요"} 분석 결과입니다.`,
    changes: changes.length
      ? changes
      : ["패치 정보: 해당 milestone의 ChromeStatus 항목을 충분히 가져오지 못해 Chromium 버전/branch 정보만 확인했습니다."],
    issues: issues.length
      ? issues
      : ["공유 이슈: 이 milestone에서 연결된 Chromium bug 항목이 적어, ChromeStatus feature 링크와 Stable update 로그를 함께 확인해야 합니다."],
    recommendation: "사용자 환경의 Chromium 버전과 가장 가까운 항목을 먼저 선택하고, 증상이 사라지는 경계 버전을 찾는 방식이 좋습니다.",
    sources: research.sources,
  };
}

async function createAiRuntimeComment(option) {
  const cached = readCachedAiComment(option);
  if (cached) return cached;

  const research = await loadRuntimeResearch(option);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const fallback = createFallbackRuntimeComment(option, research);
    writeCachedAiComment(option, fallback);
    return fallback;
  }

  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const prompt = [
    "아래 Chromium 런타임 정보를 바탕으로 디버깅 브라우저 선택 화면에 보여줄 짧은 한국어 분석문을 작성하세요.",
    "Chromium 버전 분석 리포트처럼 정리하되, 번역문이 아니라 의미를 해석한 분석 결과를 쓰세요.",
    "UI에는 Electron 버전이 전면에 보이지 않으므로 summary와 recommendation에는 Chromium 버전 중심으로 설명하세요.",
    "Electron 릴리즈나 Electron 이슈는 분석하지 마세요. Chromium milestone, ChromeStatus feature, 연결된 Chromium issue만 근거로 쓰세요.",
    "ChromeStatus feature와 Chromium issue 제목을 그대로 복사하지 말고, 어떤 문제가 생길 수 있는지 한국어로 해석해서 설명하세요.",
    "예: 'Disconnect WebSockets on BFCache entry'를 그대로 쓰지 말고 'BFCache 복원 시 WebSocket 재연결 처리를 확인해야 한다'처럼 원인과 영향으로 바꾸세요.",
    "changes 배열은 반드시 개조식으로 쓰고 최대 5개까지 작성하세요. 형식은 '영역: 구체적인 변경 내용과 영향'입니다. 예: '네트워크: 인증서/쿠키/CORS 처리 차이로 요청 재현 결과가 달라질 수 있습니다.'",
    "보안/권한, 네트워크, 렌더링/DOM, 미디어, 성능, 스토리지/라이프사이클 중 실제 근거가 있는 항목만 고르세요.",
    "issues 배열은 연결된 Chromium bug나 enterprise impact가 있는 feature를 근거로, 해당 이슈가 앱에서 어떤 위험으로 나타나는지 최대 5개까지 쓰세요.",
    "change, issue, next 같은 영어 라벨 표현을 값 안에 넣지 마세요.",
    "영어 원문 문장, 마크다운 헤더, 백틱 코드 조각을 그대로 길게 넣지 마세요.",
    "반드시 JSON만 반환하세요.",
    JSON.stringify({
      summary: "Chromium 버전 기준의 짧은 분석 제목",
	      changes: [
	        "네트워크: 구체적인 패치 영향",
	        "보안/권한: 구체적인 변경 영향",
	        "렌더링/DOM: 구체적인 변경 영향",
	        "미디어: 구체적인 변경 영향",
	        "스토리지/라이프사이클: 구체적인 변경 영향",
	      ],
	      issues: [
	        "네트워크: 공개 이슈가 앱에서 보일 수 있는 증상",
	        "보안/권한: 공개 이슈가 앱에서 보일 수 있는 증상",
	        "렌더링/DOM: 공개 이슈가 앱에서 보일 수 있는 증상",
	        "미디어: 공개 이슈가 앱에서 보일 수 있는 증상",
	        "스토리지/라이프사이클: 공개 이슈가 앱에서 보일 수 있는 증상",
	      ],
      recommendation: "선택 조언을 자연어 한 문장으로 설명",
      sources: ["참고 URL"],
    }),
    "",
    "RUNTIME:",
    JSON.stringify(toPublicRuntimeOption(option), null, 2),
    "",
    "CHROMIUM_RESEARCH:",
    JSON.stringify(
      {
        milestone: research.milestone,
        branch: research.branch,
        releases: research.releases,
        releasePosts: research.releasePosts,
        features: research.features,
      },
      null,
      2
    ),
  ].join("\n");

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "developer",
            content: "You write concise, polished Korean JSON for a browser runtime chooser. Explain meaning, not literal translations. Use Chromium in English.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "runtime_comment",
            strict: true,
            schema: {
              type: "object",
              properties: {
                summary: { type: "string" },
                changes: { type: "array", items: { type: "string" } },
                issues: { type: "array", items: { type: "string" } },
                recommendation: { type: "string" },
                sources: { type: "array", items: { type: "string" } },
              },
              required: ["summary", "changes", "issues", "recommendation", "sources"],
              additionalProperties: false,
            },
          },
        },
	        max_output_tokens: 1600,
      }),
    });

    const responseBody = await response.json().catch(() => ({}));
    const rawText =
      responseBody.output_text ||
      (responseBody.output || [])
        .flatMap((item) => item.content || [])
        .map((content) => content.text || content.output_text || "")
        .join("\n");
    const comment = JSON.parse(rawText);
    comment.provider = "openai";
    comment.model = model;
    comment.sources = Array.from(new Set([...(comment.sources || []), ...research.sources]));
    writeCachedAiComment(option, comment);
    return comment;
  } catch (error) {
    const fallback = createFallbackRuntimeComment(option, research);
    fallback.warning = `AI 코멘트 생성 실패: ${error?.message || error}`;
    writeCachedAiComment(option, fallback);
    return fallback;
  }
}

function renderLauncherHtml() {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>디버깅 브라우저 런타임 선택</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #ffffff;
      --bg-soft: #f8fafc;
      --panel: #ffffff;
      --text: #172033;
      --muted: #667085;
      --border: #e4e7ec;
      --border-strong: #d0d5dd;
      --accent: #f36910;
      --accent-soft: #fff3eb;
      --accent-text: #8a3605;
      --danger: #dc2626;
      --danger-soft: #fff1f2;
      --ok: #16a34a;
      --code-bg: #f8fafc;
      --shadow: 0 12px 30px rgba(23, 32, 51, .08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background:
        linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      width: min(1080px, calc(100vw - 40px));
      margin: 0 auto;
      padding: 26px 0 38px;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      margin-bottom: 18px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 16px;
    }
    h1 {
      margin: 0 0 6px;
      font-size: 22px;
      line-height: 1.3;
      letter-spacing: 0;
      font-weight: 600;
    }
    p {
      margin: 0;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.6;
    }
    .status-bar {
      width: min(420px, 42vw);
      border: 1px solid var(--border);
      background: var(--panel);
      padding: 9px 11px;
      border-radius: 8px;
      font-size: 12px;
      color: var(--muted);
      box-shadow: 0 1px 2px rgba(23, 32, 51, .04);
    }
    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin: 0 0 10px;
      color: var(--muted);
      font-size: 12px;
    }
    .runtime-list {
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--panel);
      overflow: hidden;
      box-shadow: var(--shadow);
    }
    .runtime-item {
      border-top: 1px solid var(--border);
      background: var(--panel);
      position: relative;
      transition: background .18s ease, box-shadow .18s ease, border-color .18s ease;
    }
    .runtime-item:first-child { border-top: 0; }
    .runtime-item.selected,
    .runtime-item.expanded {
      background: #fffdfa;
    }
    .runtime-summary {
      width: 100%;
      appearance: none;
      border: 0;
      background: transparent;
      color: var(--text);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      padding: 14px 16px;
      text-align: left;
      font: inherit;
    }
    .runtime-summary:hover {
      background: var(--bg-soft);
    }
    .runtime-main {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .chevron {
      width: 18px;
      height: 18px;
      color: var(--muted);
      flex: 0 0 auto;
      transform: rotate(0deg);
      transition: transform .42s cubic-bezier(.2, .8, .2, 1), color .28s ease;
    }
    .runtime-item.expanded .chevron {
      color: var(--accent);
      transform: rotate(90deg);
    }
    .name {
      font-size: 15px;
      font-weight: 600;
      line-height: 1.35;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
      justify-content: flex-end;
      min-width: 280px;
    }
    .badge {
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 3px 8px;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.4;
      white-space: nowrap;
      background: #ffffff;
      flex: 0 0 auto;
    }
    .badge.ok {
      border-color: #bbf7d0;
      background: #f0fdf4;
      color: var(--ok);
    }
    .badge.missing {
      border-color: #fecaca;
      background: #fef2f2;
      color: var(--danger);
    }
    .runtime-detail {
      display: grid;
      grid-template-rows: 0fr;
      transition: grid-template-rows .52s cubic-bezier(.2, .8, .2, 1);
    }
    .runtime-item.expanded .runtime-detail {
      grid-template-rows: 1fr;
    }
    .runtime-detail-inner {
      overflow: hidden;
    }
    .detail-body {
      border-top: 1px solid var(--border);
      background: #ffffff;
      padding: 16px 16px 16px 46px;
      display: grid;
      gap: 12px;
      animation: detailFade .38s ease both;
    }
    @keyframes detailFade {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    button {
      border: 1px solid var(--border);
      border-radius: 6px;
      background: transparent;
      color: var(--text);
      cursor: pointer;
      font: inherit;
      font-size: 12px;
      padding: 7px 10px;
      transition: border-color .15s ease, color .15s ease, background .15s ease, transform .15s ease;
    }
    button:hover { border-color: var(--accent); color: var(--accent); }
    button:active { transform: translateY(1px); }
    button.primary {
      border-color: var(--accent);
      background: var(--accent);
      color: white;
    }
    button.primary:hover {
      color: white;
      background: #df5c0f;
    }
    button:disabled {
      cursor: wait;
      opacity: .55;
    }
    .comment-console {
      border: 1px solid #d8dee8;
      border-radius: 8px;
      background: #ffffff;
      overflow: hidden;
      max-width: 980px;
    }
    .comment-console.result {
      position: relative;
      padding: 18px 20px 20px 82px;
      min-height: 172px;
    }
    .console-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      border-bottom: 1px solid #e4e7ec;
      background: #f8fafc;
      padding: 9px 11px;
      color: #172033;
      font-size: 13px;
      font-weight: 600;
    }
    .comment-console.result .console-top {
      border-bottom: 0;
      background: transparent;
      padding: 0 0 12px;
      font-size: 16px;
    }
    .comment-action {
      border-color: #d8dee8;
      background: #ffffff;
      color: #344054;
      padding: 6px 9px;
      font-size: 12px;
    }
    .comment-action:hover {
      border-color: var(--accent);
      color: var(--accent);
      background: #fff7ed;
    }
    .console-body {
      padding: 10px 12px 11px;
      font-size: 12px;
      line-height: 1.55;
      color: #172033;
    }
    .comment-console.result .console-body {
      padding: 0;
    }
    .console-line {
      color: #172033;
    }
    .comment-console.empty {
      border-color: var(--border);
      background: var(--code-bg);
    }
    .comment-console.empty .console-top {
      border-bottom-color: var(--border);
      background: var(--bg-soft);
      color: var(--muted);
    }
    .comment-console.empty .console-body {
      color: var(--muted);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .comment-console.loading {
      border-color: #fed7aa;
      background: #fffaf5;
    }
    .comment-console.loading .console-top {
      border-bottom-color: #ffedd5;
      background: var(--accent-soft);
      color: var(--accent-text);
    }
    .comment-console.loading .console-body {
      padding: 0;
    }
    .analysis-stage {
      position: relative;
      min-height: 184px;
      overflow: hidden;
      background: linear-gradient(180deg, #fffaf5 0%, #ffffff 100%);
      color: #7c2d12;
    }
    .thinking-bot {
      position: absolute;
      left: 50%;
      top: 50%;
      width: 74px;
      height: 70px;
      transform: translate(-50%, -50%);
      animation: botMoveToCorner 2.35s cubic-bezier(.2, .8, .2, 1) forwards;
      z-index: 2;
    }
    .bot-face {
      position: absolute;
      left: 50%;
      top: 18px;
      width: 50px;
      height: 42px;
      border: 1px solid #fdba74;
      border-radius: 12px;
      background: #ffffff;
      box-shadow: 0 8px 18px rgba(124, 45, 18, .08);
      transform: translateX(-50%);
    }
    .bot-face::before {
      content: "";
      position: absolute;
      top: -7px;
      left: 50%;
      width: 1px;
      height: 7px;
      background: #fb923c;
      transform: translateX(-50%);
    }
    .bot-face::after {
      content: "";
      position: absolute;
      top: -10px;
      left: 50%;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--accent);
      transform: translateX(-50%);
    }
    .bot-eye {
      position: absolute;
      top: 15px;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--accent);
      animation: blink 1.9s ease-in-out infinite;
    }
    .bot-eye.left { left: 14px; }
    .bot-eye.right { right: 14px; }
    .bot-mouth {
      position: absolute;
      left: 50%;
      bottom: 10px;
      width: 14px;
      height: 2px;
      border-radius: 999px;
      background: #fdba74;
      transform: translateX(-50%);
    }
    .gear {
      position: absolute;
      border-radius: 50%;
      background:
        repeating-conic-gradient(from 0deg, #f97316 0deg 16deg, transparent 16deg 30deg),
        radial-gradient(circle, #fff 0 32%, #fdba74 33% 48%, transparent 49%);
      animation: gearSpin .8s linear infinite, gearFade 2.35s ease-in-out forwards;
    }
    .gear.one {
      width: 24px;
      height: 24px;
      left: 0;
      top: 2px;
    }
    .gear.two {
      width: 18px;
      height: 18px;
      right: 3px;
      top: 5px;
      animation-direction: reverse, normal;
    }
    .typing-board {
      position: absolute;
      left: 18px;
      right: 16px;
      top: 66px;
      min-height: 98px;
      border: 1px solid #ffedd5;
      border-radius: 8px;
      background: rgba(255, 255, 255, .82);
      padding: 12px 14px 12px 64px;
      opacity: 0;
      transform: translateY(8px);
      animation: boardIn 2.35s ease-in-out forwards;
    }
    .typing-copy {
      display: block;
      margin-bottom: 8px;
      color: #7c2d12;
      font-weight: 600;
    }
    .typing-lines {
      display: grid;
      gap: 5px;
    }
    .typing-line {
      height: 7px;
      border-radius: 999px;
      background: linear-gradient(90deg, #fed7aa 0%, #f97316 45%, #ffedd5 100%);
      background-size: 220% 100%;
      transform-origin: left;
      animation: typeLine 2.8s ease-in-out forwards;
    }
    .typing-line.short {
      width: 68%;
      animation-delay: .18s;
    }
    .typing-line.long {
      width: 92%;
    }
    @keyframes botMoveToCorner {
      0%, 36% {
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%) scale(1.08) rotate(-3deg);
      }
      54%, 100% {
        left: 44px;
        top: 36px;
        transform: translate(-50%, -50%) scale(.72) rotate(0deg);
      }
    }
    @keyframes blink {
      0%, 92%, 100% { transform: scaleY(1); }
      95% { transform: scaleY(.18); }
    }
    @keyframes gearSpin {
      to { transform: rotate(360deg); }
    }
    @keyframes gearFade {
      0%, 38% { opacity: 1; }
      58%, 100% { opacity: 0; }
    }
    @keyframes boardIn {
      0%, 45% { opacity: 0; transform: translateY(8px); }
      58%, 100% { opacity: 1; transform: translateY(0); }
    }
    @keyframes typeLine {
      0%, 55% { transform: scaleX(0); opacity: .45; }
      78%, 100% { transform: scaleX(1); opacity: 1; }
    }
    .console-section {
      border: 1px solid #e4e7ec;
      border-radius: 8px;
      background: #fbfcfe;
      padding: 12px 16px;
      margin-top: 10px;
    }
    .console-section-title {
      color: #667085;
      font-weight: 700;
      margin: 0 0 8px;
      font-size: 12px;
    }
    .analysis-list {
      margin: 0;
      padding-left: 18px;
      color: #172033;
      font-size: 13px;
      line-height: 1.65;
    }
    .analysis-list li + li {
      margin-top: 6px;
    }
    .analysis-rows {
      display: grid;
      gap: 0;
    }
    .analysis-row {
      display: grid;
      grid-template-columns: 108px minmax(0, 1fr);
      gap: 14px;
      align-items: start;
      padding: 10px 0;
    }
    .analysis-row + .analysis-row {
      border-top: 1px solid #e4e7ec;
    }
    .analysis-row-label {
      color: #2563eb;
      font-size: 12px;
      font-weight: 700;
      line-height: 1.45;
      white-space: nowrap;
    }
    .analysis-row-text {
      color: #172033;
      font-size: 13px;
      line-height: 1.62;
      word-break: keep-all;
      overflow-wrap: anywhere;
    }
    .provider-badge {
      border-radius: 6px;
      background: #f2f4f7;
      color: #667085;
      padding: 6px 9px;
      font-size: 12px;
      font-weight: 500;
      white-space: nowrap;
    }
    .console-actions {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .result-bot {
      position: absolute;
      left: 22px;
      top: 18px;
      width: 42px;
      height: 42px;
      border: 1px solid #bfdbfe;
      border-radius: 50%;
      background: #eff6ff;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .result-bot .bot-face {
      position: relative;
      left: auto;
      top: auto;
      width: 28px;
      height: 23px;
      border-color: #3b82f6;
      border-radius: 7px;
      box-shadow: none;
      transform: none;
    }
    .result-bot .bot-face::before {
      top: -5px;
      background: #2563eb;
    }
    .result-bot .bot-face::after {
      top: -8px;
      width: 5px;
      height: 5px;
      background: #2563eb;
    }
    .result-bot .bot-eye {
      top: 8px;
      width: 4px;
      height: 4px;
      background: #2563eb;
    }
    .result-bot .bot-eye.left { left: 8px; }
    .result-bot .bot-eye.right { right: 8px; }
    .result-bot .bot-mouth {
      bottom: 6px;
      width: 9px;
      background: #93c5fd;
    }
    .install-confirm-backdrop {
      position: fixed;
      inset: 0;
      display: none;
      place-items: center;
      padding: 20px;
      background: rgba(17, 24, 39, .32);
      backdrop-filter: blur(3px);
      z-index: 50;
    }
    .install-confirm-backdrop.visible {
      display: grid;
    }
    .install-confirm-dialog {
      width: min(440px, 100%);
      border: 1px solid var(--border);
      border-radius: 8px;
      background: #ffffff;
      box-shadow: 0 18px 48px rgba(15, 23, 42, .2);
      padding: 18px;
    }
    .install-confirm-title {
      margin: 0 0 8px;
      color: var(--text);
      font-size: 17px;
      line-height: 1.4;
    }
    .install-confirm-copy {
      margin: 0;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.6;
    }
    .install-confirm-size {
      margin-top: 14px;
      border: 1px solid #e4e7ec;
      border-radius: 8px;
      background: #f8fafc;
      padding: 10px 12px;
      color: #344054;
      font-size: 13px;
      font-weight: 600;
    }
    .install-confirm-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 16px;
    }
    button.secondary {
      background: #ffffff;
      color: var(--muted);
    }
    @media (max-width: 760px) {
      main { width: min(100vw - 24px, 1080px); padding-top: 18px; }
      header { display: grid; align-items: start; }
      .status-bar { width: 100%; }
      .runtime-summary { align-items: flex-start; }
      .runtime-main { align-items: flex-start; }
      .meta { min-width: 0; justify-content: flex-start; }
      .name { white-space: normal; }
      .detail-body { padding-left: 16px; }
      .comment-console.result { padding-left: 16px; padding-top: 70px; }
      .analysis-row { grid-template-columns: 1fr; gap: 4px; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>디버깅 브라우저 런타임 선택</h1>
        <p>Chromium 런타임을 선택하고 디버깅 브라우저를 시작합니다.</p>
      </div>
      <div class="status-bar" id="status">런타임 목록을 불러오는 중...</div>
    </header>
	  <div class="toolbar">
	    <span>사용 가능한 Chromium 런타임</span>
	    <span>호환성 분석 준비됨</span>
	  </div>
	  <section class="runtime-list" id="runtimeGrid"></section>
	</main>
  <div class="install-confirm-backdrop" id="installConfirm" aria-hidden="true">
    <section class="install-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="installConfirmTitle">
      <h2 class="install-confirm-title" id="installConfirmTitle">Chromium 런타임 설치가 필요합니다.</h2>
      <p class="install-confirm-copy" id="installConfirmCopy">아직 설치되지 않은 Chromium 런타임입니다. 다운로드 후 바로 브라우저를 실행합니다.</p>
      <div class="install-confirm-size" id="installConfirmSize">다운로드 약 120-180MB · 설치 후 약 350-500MB</div>
      <div class="install-confirm-actions">
        <button type="button" class="secondary" id="installCancel">취소</button>
        <button type="button" class="primary" id="installApprove">설치하고 실행</button>
      </div>
    </section>
  </div>
	  <script>
	    const grid = document.getElementById("runtimeGrid");
	    const statusEl = document.getElementById("status");
	    const installConfirm = document.getElementById("installConfirm");
	    const installConfirmTitle = document.getElementById("installConfirmTitle");
	    const installConfirmCopy = document.getElementById("installConfirmCopy");
	    const installConfirmSize = document.getElementById("installConfirmSize");
	    const installCancel = document.getElementById("installCancel");
	    const installApprove = document.getElementById("installApprove");
	    const comments = new Map();
	    const DEFAULT_STATUS = "Chromium 버전을 선택하여 브라우저 버전을 실행할 수 있습니다";
	    let runtimesCache = [];
	    let expandedId = null;
	    let didInitializeExpandedItem = false;
	    let loadingCommentId = null;
	    let launchInProgress = false;
	    let pendingInstallConfirmation = null;

    function setStatus(text) {
      statusEl.textContent = text;
    }

    function delay(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function escapeHtml(value) {
      return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      }[char]));
    }

    function chevronSvg() {
      return '<svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }

	    function getRuntimeTitle(runtime) {
	      return runtime.chromiumVersion
	        ? 'Chromium ' + runtime.chromiumVersion
	        : 'Chromium 버전 확인 필요';
	    }

	    function getInstallSizeText() {
	      return "다운로드 약 120-180MB · 설치 후 약 350-500MB";
	    }

	    function splitAnalysisText(text) {
	      const value = String(text || "").trim();
	      const separatorIndex = value.search(/[:：]/);
	      if (separatorIndex > 0 && separatorIndex <= 14) {
	        return {
	          label: value.slice(0, separatorIndex).trim(),
	          detail: value.slice(separatorIndex + 1).trim(),
	        };
	      }

	      return { label: "항목", detail: value };
	    }

	    function renderAnalysisRows(items) {
	      return '<div class="analysis-rows">' + items.map((text) => {
	        const item = splitAnalysisText(text);
	        return '<div class="analysis-row">' +
	          '<div class="analysis-row-label">' + escapeHtml(item.label) + '</div>' +
	          '<div class="analysis-row-text">' + escapeHtml(item.detail) + '</div>' +
	        '</div>';
	      }).join("") + '</div>';
	    }

	    function setRuntimeControlsDisabled(disabled) {
	      Array.from(grid.querySelectorAll("button")).forEach((control) => {
	        control.disabled = disabled;
	      });
	    }

	    function requestInstallConfirmation(runtime) {
	      if (runtime.installed) return Promise.resolve(true);

	      return new Promise((resolve) => {
	        pendingInstallConfirmation = resolve;
	        installConfirmTitle.textContent = getRuntimeTitle(runtime) + " 설치가 필요합니다.";
	        installConfirmCopy.textContent = "아직 설치되지 않은 Chromium 런타임입니다. 다운로드와 압축 해제가 끝나면 바로 브라우저를 실행합니다.";
	        installConfirmSize.textContent = getInstallSizeText();
	        installConfirm.classList.add("visible");
	        installConfirm.setAttribute("aria-hidden", "false");
	        installApprove.focus();
	      });
	    }

	    function closeInstallConfirmation(approved) {
	      if (!pendingInstallConfirmation) return;

	      const resolve = pendingInstallConfirmation;
	      pendingInstallConfirmation = null;
	      installConfirm.classList.remove("visible");
	      installConfirm.setAttribute("aria-hidden", "true");
	      resolve(approved);
	    }

	    function renderLoadingComment(runtime) {
	      return '<div class="comment-console loading">' +
	        '<div class="console-top"><span>Chromium 분석 중</span><button class="comment-action" data-action="comment" data-id="' + escapeHtml(runtime.id) + '" disabled>AI 분석</button></div>' +
        '<div class="console-body">' +
          '<div class="analysis-stage">' +
            '<span class="thinking-bot">' +
              '<span class="gear one"></span><span class="gear two"></span>' +
              '<span class="bot-face"><span class="bot-eye left"></span><span class="bot-eye right"></span><span class="bot-mouth"></span></span>' +
            '</span>' +
            '<div class="typing-board">' +
              '<span class="typing-copy">Chromium 패치와 공개 이슈를 대조해 의미를 정리하고 있습니다.</span>' +
              '<span class="typing-lines"><span class="typing-line long"></span><span class="typing-line short"></span><span class="typing-line long"></span></span>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    }

    function renderComment(runtime) {
      if (loadingCommentId === runtime.id) {
        return renderLoadingComment(runtime);
      }

      const comment = comments.get(runtime.id);
	      if (!comment) {
	        return '<div class="comment-console empty">' +
	          '<div class="console-top"><span>Chromium 분석</span><button class="comment-action" data-action="comment" data-id="' + escapeHtml(runtime.id) + '">AI 분석</button></div>' +
	          '<div class="console-body">AI가 이 Chromium 버전에 어떤 패치가 들어갔고 어떤 이슈가 공유됐는지 함께 분석합니다.</div>' +
	        '</div>';
	      }

	      const changeLines = (comment.changes || []).slice(0, 5);
	      const issueLines = (comment.issues || []).slice(0, 5);
      const providerLabel = comment.provider === "openai" ? "실제 AI 분석" : "자료 기반 분석";

	      return '<div class="comment-console result">' +
	        '<span class="result-bot"><span class="bot-face"><span class="bot-eye left"></span><span class="bot-eye right"></span><span class="bot-mouth"></span></span></span>' +
	        '<div class="console-top"><span>Chromium 버전 분석</span><span class="console-actions"><span class="provider-badge">' + providerLabel + '</span><button class="comment-action" data-action="comment" data-id="' + escapeHtml(runtime.id) + '">AI 분석</button></span></div>' +
	        '<div class="console-body">' +
	          (changeLines.length ? '<div class="console-section"><div class="console-section-title">패치 내용</div>' + renderAnalysisRows(changeLines) + '</div>' : '') +
	          (issueLines.length ? '<div class="console-section"><div class="console-section-title">주의할 이슈</div>' + renderAnalysisRows(issueLines) + '</div>' : '') +
	        '</div>' +
	      '</div>';
    }

    function render(runtimes) {
      runtimesCache = runtimes;
      if (!didInitializeExpandedItem && runtimes.length) {
        expandedId = runtimes[0].id;
        didInitializeExpandedItem = true;
      }

      grid.innerHTML = runtimes.map((runtime) => {
        const statusClass = runtime.installed ? "ok" : "missing";
        const expanded = runtime.id === expandedId;
        return '<article class="runtime-item ' + (expanded ? "expanded " : "") + '" data-id="' + escapeHtml(runtime.id) + '">' +
          '<button class="runtime-summary" type="button" data-action="toggle" data-id="' + escapeHtml(runtime.id) + '" aria-expanded="' + String(expanded) + '">' +
            '<span class="runtime-main">' +
              chevronSvg() +
              '<span class="badge ' + statusClass + '">' + escapeHtml(runtime.status) + '</span>' +
              '<span>' +
                '<span class="name">' + escapeHtml(getRuntimeTitle(runtime)) + '</span>' +
              '</span>' +
            '</span>' +
          '</button>' +
          '<div class="runtime-detail">' +
            '<div class="runtime-detail-inner">' +
              '<div class="detail-body">' +
                renderComment(runtime) +
                '<div class="actions">' +
                  '<button class="primary" data-action="launch" data-id="' + escapeHtml(runtime.id) + '">' + (runtime.installed ? "현재 버전으로 실행" : "설치 후 실행") + '</button>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</article>';
      }).join("");
    }

    async function loadRuntimes() {
      const response = await fetch("/api/runtimes");
      const data = await response.json();
      render(data.runtimes);
      setStatus(DEFAULT_STATUS);
    }

	    async function refreshAfterStatusChange() {
	      const response = await fetch("/api/runtimes");
	      const data = await response.json();
	      render(data.runtimes);
	    }

	    installCancel.addEventListener("click", () => closeInstallConfirmation(false));
	    installApprove.addEventListener("click", () => closeInstallConfirmation(true));
	    installConfirm.addEventListener("click", (event) => {
	      if (event.target === installConfirm) closeInstallConfirmation(false);
	    });
	    document.addEventListener("keydown", (event) => {
	      if (event.key === "Escape" && pendingInstallConfirmation) {
	        closeInstallConfirmation(false);
	      }
	    });

	    grid.addEventListener("click", async (event) => {
	      const button = event.target.closest("button");
	      if (!button || launchInProgress || pendingInstallConfirmation) return;

      const runtimeId = button.dataset.id;
      const action = button.dataset.action;
      const item = button.closest(".runtime-item");

      if (action === "toggle") {
        expandedId = expandedId === runtimeId ? null : runtimeId;
        render(runtimesCache);
        return;
      }

      if (action === "comment") {
        expandedId = runtimeId;
        loadingCommentId = runtimeId;
        render(runtimesCache);
        setStatus("Chromium 변경 내용과 공유 이슈를 분석 중입니다.");
        const startedAt = Date.now();
        try {
          const response = await fetch("/api/runtime-comment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ runtimeId }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.message || "AI 분석에 실패했습니다.");
          comments.set(runtimeId, data.comment);
          await delay(Math.max(0, 2600 - (Date.now() - startedAt)));
          loadingCommentId = null;
          await refreshAfterStatusChange();
          setStatus(DEFAULT_STATUS);
        } catch (error) {
          loadingCommentId = null;
          render(runtimesCache);
          setStatus(error.message || String(error));
        }
	      }

	      if (action === "launch") {
	        const runtime = runtimesCache.find((candidate) => candidate.id === runtimeId);
	        if (!runtime) {
	          setStatus("선택한 런타임을 찾지 못했습니다.");
	          return;
	        }

	        const needsInstall = !runtime.installed;
	        if (needsInstall) {
	          const approved = await requestInstallConfirmation(runtime);
	          if (!approved) {
	            setStatus(DEFAULT_STATUS);
	            return;
	          }
	        }

	        launchInProgress = true;
	        expandedId = runtimeId;
	        item?.classList.add("selected");
	        setRuntimeControlsDisabled(true);
	        setStatus(needsInstall
	          ? "Chromium 런타임을 다운로드하고 설치하는 중입니다. 완료되면 브라우저가 실행됩니다."
	          : "선택한 Chromium 런타임으로 브라우저를 실행하는 중입니다.");
	        try {
	          const response = await fetch("/api/launch", {
	            method: "POST",
	            headers: { "Content-Type": "application/json" },
	            body: JSON.stringify({ runtimeId }),
	          });
	          const data = await response.json();
	          if (!response.ok) throw new Error(data.message || "실행에 실패했습니다.");
	          setStatus(data.message || "디버깅 브라우저를 실행했습니다.");
	          await refreshAfterStatusChange();
	        } catch (error) {
	          setStatus(error.message || String(error));
	          await refreshAfterStatusChange().catch(() => undefined);
	        } finally {
	          launchInProgress = false;
	          item?.classList.remove("selected");
	          setRuntimeControlsDisabled(false);
	        }
	      }
    });

    loadRuntimes().catch((error) => setStatus(error.message || String(error)));
  </script>
</body>
</html>`;
}

let electronProcess;
let launcherServer;

async function launchElectronRuntime(selectedRuntime) {
  if (electronProcess && !electronProcess.killed) {
    return {
      ok: true,
      alreadyRunning: true,
      message: "디버깅 브라우저가 이미 실행 중입니다.",
    };
  }

  const preparedRuntime = await prepareRuntime({
    ...selectedRuntime,
    promptDownload: false,
  });
  const port = await findAvailablePort(preferredPort);
  const devServerUrl = `http://${host}:${port}/`;

  vite = run("npx", ["vite", "--host", host, "--port", String(port), "--strictPort"]);

  vite.on("exit", (code) => {
    if (code !== 0) {
      process.exit(code ?? 1);
    }
  });

  await waitForPort(port);

  const electronEnv = {
    ...process.env,
    ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
    VITE_DEV_SERVER_URL: devServerUrl,
    DEBUG_BROWSER_RUNTIME_LABEL: preparedRuntime.runtimeLabel || preparedRuntime.label,
    DEBUG_BROWSER_RUNTIME_ID: preparedRuntime.id,
  };
  delete electronEnv.ELECTRON_RUN_AS_NODE;

  electronProcess = run(preparedRuntime.command, [...preparedRuntime.args, "electron/main.cjs"], {
    env: electronEnv,
  });

  electronProcess.on("exit", (code) => {
    vite?.kill();
    launcherServer?.close();
    process.exit(code ?? 0);
  });

  return {
    ok: true,
    message: `선택한 Chromium 런타임으로 디버깅 브라우저를 실행했습니다.`,
    devServerUrl,
  };
}

async function handleLauncherRequest(request, response) {
  const requestUrl = new URL(request.url, `http://${host}`);

  try {
    if (request.method === "GET" && requestUrl.pathname === "/") {
      createHtmlResponse(response, renderLauncherHtml());
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/runtimes") {
      createJsonResponse(response, 200, {
        runtimes: loadRuntimeOptions().map(toPublicRuntimeOption),
      });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/runtime-comment") {
      const body = await readRequestBody(request);
      const option = loadRuntimeOptions().find((runtime) => runtime.id === body.runtimeId);

      if (!option) {
        createJsonResponse(response, 404, { ok: false, message: "선택한 런타임을 찾지 못했습니다." });
        return;
      }

      const comment = await createAiRuntimeComment(option);
      createJsonResponse(response, 200, { ok: true, comment });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/launch") {
      const body = await readRequestBody(request);
      const option = loadRuntimeOptions().find((runtime) => runtime.id === body.runtimeId);

      if (!option) {
        createJsonResponse(response, 404, { ok: false, message: "선택한 런타임을 찾지 못했습니다." });
        return;
      }

      const result = await launchElectronRuntime(option);
      createJsonResponse(response, 200, result);
      return;
    }

    createJsonResponse(response, 404, { ok: false, message: "Not found" });
  } catch (error) {
    createJsonResponse(response, 500, {
      ok: false,
      message: error?.message || String(error),
    });
  }
}

async function startLauncher() {
  const port = await findAvailablePort(launcherPreferredPort);
  const launcherUrl = `http://${host}:${port}/`;

  launcherServer = http.createServer((request, response) => {
    handleLauncherRequest(request, response);
  });

  await new Promise((resolve) => {
    launcherServer.listen(port, host, resolve);
  });

  console.log(`\n[browser-runtime] 런처: ${launcherUrl}`);
  console.log("[browser-runtime] DEBUG_BROWSER_NO_OPEN=1 로 자동 브라우저 열기를 끌 수 있습니다.");
  openLauncherUrl(launcherUrl);
}

async function main() {
  if (process.env.DEBUG_BROWSER_RUNTIME) {
    const selectedRuntime = await prepareRuntime(await selectRuntime());
    await launchElectronRuntime(selectedRuntime);
    return;
  }

  if (process.env.DEBUG_BROWSER_LEGACY_MENU === "1") {
    const selectedRuntime = await prepareRuntime(await selectRuntime());
    await launchElectronRuntime(selectedRuntime);
    return;
  }

  await startLauncher();
}

main().catch((error) => {
  vite?.kill();
  console.error(error);
  process.exit(1);
});

process.on("SIGINT", () => {
  vite?.kill();
  process.exit(0);
});
