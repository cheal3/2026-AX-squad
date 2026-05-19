const { spawn } = require("child_process");
const fs = require("fs");
const net = require("net");
const path = require("path");
const readline = require("readline");
const electronPath = require("electron");

const rootDir = path.resolve(__dirname, "..");
const host = "127.0.0.1";
const preferredPort = 5173;

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

function loadRuntimeOptions() {
  const options = [
    {
      id: "bundled",
      label: "현재 프로젝트 Electron",
      command: electronPath,
      args: [],
      description: "package.json의 electron 버전으로 실행",
    },
  ];

  if (process.env.DEBUG_BROWSER_ELECTRON_BIN) {
    options.push({
      id: "env",
      label: "환경변수 Electron",
      command: process.env.DEBUG_BROWSER_ELECTRON_BIN,
      args: [],
      description: "DEBUG_BROWSER_ELECTRON_BIN 경로로 실행",
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
            command: runtime.command,
            args: Array.isArray(runtime.args) ? runtime.args : [],
            description: runtime.description || "browser-runtimes.json 등록 런타임",
          });
        });
      }
    } catch (error) {
      console.warn(`[browser-runtime] browser-runtimes.json parse failed: ${error?.message || error}`);
    }
  }

  if (process.stdin.isTTY) {
    options.push({
      id: "custom",
      label: "직접 경로 입력",
      command: "",
      args: [],
      description: "설치된 Electron 실행 파일 경로를 직접 입력",
    });
  }

  return options;
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

  if (requestedOption && requestedOption.id !== "custom") return requestedOption;
  if (!process.stdin.isTTY) return options[0];

  console.log("\n디버깅 브라우저 런타임을 선택하세요.");
  options.forEach((option, index) => {
    console.log(`  ${index + 1}. ${option.label} - ${option.description}`);
  });

  const answer = await askQuestion(`선택 [1-${options.length}] (기본 1): `);
  const selectedIndex = answer ? Number(answer) - 1 : 0;
  const selectedOption = options[selectedIndex] || options[0];

  if (selectedOption.id !== "custom") return selectedOption;

  const customCommand = await askQuestion("Electron 실행 파일 경로: ");
  if (!customCommand) return options[0];

  return {
    id: "custom",
    label: "직접 입력 Electron",
    command: customCommand,
    args: [],
    description: "직접 입력한 Electron 실행 파일",
  };
}

async function main() {
  const selectedRuntime = await selectRuntime();
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
      DEBUG_BROWSER_RUNTIME_LABEL: selectedRuntime.label,
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
