const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

const isDev = process.env.NODE_ENV === "development";
const PORT = 3000;

let mainWindow = null;
let nextServer = null;
let isQuitting = false;

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  const url = `http://localhost:${PORT}`;
  mainWindow.loadURL(url);

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  // On macOS, hide window instead of closing (standard behavior)
  mainWindow.on("close", (event) => {
    if (process.platform === "darwin" && !isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function startNextServer() {
  return new Promise((resolve, reject) => {
    const basePath = isDev
      ? path.join(__dirname, "..")
      : path.join(process.resourcesPath);

    const serverPath = path.join(basePath, ".next", "standalone", "server.js");

    const userDataPath = app.getPath("userData");
    const cleanEnv = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      USER: process.env.USER,
      LANG: process.env.LANG,
      PORT: PORT.toString(),
      NODE_ENV: "production",
      USER_DATA_PATH: userDataPath
    };

    const nodeEnv = {
      ...cleanEnv,
      ELECTRON_RUN_AS_NODE: "1"
    };

    nextServer = spawn(process.execPath,
      [serverPath], {
      env: nodeEnv,
      cwd: path.join(basePath, ".next", "standalone"),
      stdio: ["ignore", "pipe", "pipe"]
    });

    nextServer.stdout.on("data", (data) => {
      const output = data.toString();
      console.log(`Next.js: ${output}`);
      if (output.includes("Ready") || output.includes("started") || output.includes("Listening")) {
        resolve();
      }
    });

    nextServer.stderr.on("data", (data) => {
      console.error(`Next.js: ${data}`);
    });

    nextServer.on("error", (err) => {
      console.error("Failed to start Next.js server:", err);
      reject(err);
    });

    setTimeout(resolve, 5000);
  });
}

async function waitForServer(url, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const http = require("http");
      await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
          resolve(res);
        });
        req.on("error", reject);
        req.setTimeout(1000, () => {
          req.destroy();
          reject(new Error("timeout"));
        });
      });
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return false;
}

if (gotTheLock) {
  app.whenReady().then(async () => {
    if (!isDev) {
      console.log("Starting Next.js server...");
      await startNextServer();
      await waitForServer(`http://localhost:${PORT}`);
    }

    createWindow();
  });

  // macOS: clicking dock icon when window is hidden should show it
  app.on("activate", () => {
    if (mainWindow === null) {
      createWindow();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("before-quit", () => {
    isQuitting = true;
    if (nextServer) {
      nextServer.kill("SIGTERM");
    }
  });
}
