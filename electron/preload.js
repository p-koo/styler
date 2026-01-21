const { contextBridge } = require("electron");

// Expose any APIs to the renderer process here
contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
});
