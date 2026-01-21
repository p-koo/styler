const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

const isDev = process.env.NODE_ENV === "development";
const PORT = 3000;

let mainWindow;
let nextServer;

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    // Someone tried to run a second instance, focus our window instead
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
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

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function startNextServer() {
  return new Promise((resolve, reject) => {
    // In production, the standalone server is in resources
    const basePath = isDev
      ? path.join(__dirname, "..")
      : path.join(process.resourcesPath);

    const serverPath = path.join(basePath, ".next", "standalone", "server.js");

    // Copy static files to standalone if needed (handled by build process)
    // Only pass essential env vars - don't leak user's API keys from shell
    // Set USER_DATA_PATH so the app stores data in the right place
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

    // Use Electron's node to run the server
    // process.execPath points to Electron, but we can use the ELECTRON_RUN_AS_NODE env var
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

    // Fallback: resolve after timeout
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

// Only proceed if we got the single instance lock
if (gotTheLock) {
  app.whenReady().then(async () => {
    if (!isDev) {
      console.log("Starting Next.js server...");
      await startNextServer();
      await waitForServer(`http://localhost:${PORT}`);
    }

    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on("window-all-closed", () => {
    if (nextServer) {
      nextServer.kill();
    }
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("before-quit", () => {
    if (nextServer) {
      nextServer.kill("SIGTERM");
    }
  });
}
