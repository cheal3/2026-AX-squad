const { contextBridge, ipcRenderer } = require("electron");

const targetPreloadArg = process.argv.find((arg) =>
  arg.startsWith("--debug-agent-target-preload=")
);

contextBridge.exposeInMainWorld("debugAgentRuntime", {
  platform: "electron",
  runtimeInfo: {
    platform: "electron",
    runtimeId: process.env.DEBUG_BROWSER_RUNTIME_ID,
    runtimeLabel: process.env.DEBUG_BROWSER_RUNTIME_LABEL,
    chromiumVersion: process.versions.chrome,
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
  },
  targetPreloadPath: targetPreloadArg?.replace("--debug-agent-target-preload=", ""),
  onNetworkEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("debug-agent:network-event", listener);

    return () => {
      ipcRenderer.removeListener("debug-agent:network-event", listener);
    };
  },
  attachTargetDebugger: (webContentsId) => {
    return ipcRenderer.invoke("debug-agent:attach-target-debugger", webContentsId);
  },
  onFunctionEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("debug-agent:function-event", listener);

    return () => {
      ipcRenderer.removeListener("debug-agent:function-event", listener);
    };
  },
  onDebuggerScript: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("debug-agent:debugger-script", listener);

    return () => {
      ipcRenderer.removeListener("debug-agent:debugger-script", listener);
    };
  },
  setLogpoints: (options) => {
    return ipcRenderer.invoke("debug-agent:set-logpoints", options);
  },
  getScriptSource: (options) => {
    return ipcRenderer.invoke("debug-agent:get-script-source", options);
  },
  analyzeError: (payload) => {
    return ipcRenderer.invoke("debug-agent:analyze-error", payload);
  },
});
