const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const net = require("net");
const path = require("path");
const readline = require("readline");

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
const managedRuntimeDir = path.join(rootDir, ".debug-browser-runtimes");

const electronChromiumMap = {
  "42.0.0": "148.0.7778.96",
  "41.0.0": "146.0.7680.65",
  "40.0.0": "144.0.7559.60",
  "39.0.0": "142.0.7444.52",
  "38.0.0": "140.0.7339.41",
};

const managedElectronOptions = [
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
];

function run(command, args, options = {}) {
  return spawn(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
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

function formatVersionLabel(electronVersion, chromiumVersion) {
  const electronText = electronVersion ? `Electron ${electronVersion}` : "Electron";
  const chromiumText = chromiumVersion ? `Chromium ${chromiumVersion}` : "Chromium 앱 실행 후 확인";
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

async function ensureManagedElectron(version) {
  if (version === "bundled" || version === getBundledElectronVersion()) {
    return electronPath;
  }

  const command = getManagedElectronCommand(version);

  if (fs.existsSync(command)) {
    return command;
  }

  if (!process.stdin.isTTY) {
    throw new Error(`Electron ${version} 런타임이 없습니다. 터미널에서 실행해 다운로드를 승인하세요.`);
  }

  const approved = await askQuestion(
    `\nElectron ${version} 런타임이 없습니다. 지금 다운로드할까요? 데이터가 수백 MB 사용될 수 있습니다. [y/N]: `
  );

  if (!["y", "yes"].includes(approved.toLowerCase())) {
    throw new Error(`Electron ${version} 다운로드가 취소되었습니다.`);
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
          });
        });
      }
    } catch (error) {
      console.warn(`[browser-runtime] browser-runtimes.json parse failed: ${error?.message || error}`);
    }
  }

  return options;
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
  if (!process.stdin.isTTY) return options[0];

  return selectRuntimeWithKeyboard(options);
}

async function prepareRuntime(runtime) {
  if (!runtime.managedVersion) return runtime;

  const command = await ensureManagedElectron(runtime.managedVersion);
  return {
    ...runtime,
    command,
    args: [],
  };
}

async function main() {
  const selectedRuntime = await prepareRuntime(await selectRuntime());
  const port = await findAvailablePort(preferredPort);
  const devServerUrl = `http://${host}:${port}/`;

  vite = run("npx", ["vite", "--host", host, "--port", String(port), "--strictPort"]);

  vite.on("exit", (code) => {
    if (code !== 0) {
      process.exit(code ?? 1);
    }
  });

  waitForPort(port).then(() => {
    const electronEnv = {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      VITE_DEV_SERVER_URL: devServerUrl,
      DEBUG_BROWSER_RUNTIME_LABEL: selectedRuntime.runtimeLabel || selectedRuntime.label,
      DEBUG_BROWSER_RUNTIME_ID: selectedRuntime.id,
    };
    delete electronEnv.ELECTRON_RUN_AS_NODE;

    const electron = run(selectedRuntime.command, [...selectedRuntime.args, "electron/main.cjs"], {
      env: electronEnv,
    });

    electron.on("exit", (code) => {
      vite.kill();
      process.exit(code ?? 0);
    });
  });
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
