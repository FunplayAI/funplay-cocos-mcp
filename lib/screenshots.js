'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { getPanelBounds, pickWindow } = require('./electron-tools');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function exec(file, args) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || stdout || error.message));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function captureDesktopScreenshot(projectPath, options = {}) {
  const outputDir = path.join(projectPath, 'temp', 'mcp-captures');
  ensureDir(outputDir);
  const filePath = path.join(outputDir, options.fileName || `desktop-${Date.now()}.png`);

  if (process.platform === 'darwin') {
    await exec('screencapture', ['-x', filePath]);
  } else if (process.platform === 'win32') {
    const script = `
      Add-Type -AssemblyName System.Windows.Forms
      Add-Type -AssemblyName System.Drawing
      $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
      $bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
      $bitmap.Save('${filePath.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)
      $graphics.Dispose()
      $bitmap.Dispose()
    `;
    await exec('powershell', ['-NoProfile', '-Command', script]);
  } else {
    try {
      await exec('gnome-screenshot', ['-f', filePath]);
    } catch (error) {
      await exec('import', ['-window', 'root', filePath]);
    }
  }

  const data = fs.readFileSync(filePath).toString('base64');
  return {
    filePath,
    dataUri: `data:image/png;base64,${data}`,
    size: fs.statSync(filePath).size,
    platform: os.platform(),
  };
}

async function captureEditorWindowScreenshot(projectPath, options = {}) {
  const outputDir = path.join(projectPath, 'temp', 'mcp-captures');
  ensureDir(outputDir);
  const filePath = path.join(outputDir, options.fileName || `editor-${Date.now()}.png`);

  const target = pickWindow(options);

  const image = await target.capturePage();
  const png = image.toPNG();
  fs.writeFileSync(filePath, png);

  return {
    filePath,
    dataUri: `data:image/png;base64,${png.toString('base64')}`,
    size: png.length,
    title: typeof target.getTitle === 'function' ? target.getTitle() : '',
  };
}

async function capturePanelScreenshot(projectPath, options = {}) {
  const outputDir = path.join(projectPath, 'temp', 'mcp-captures');
  ensureDir(outputDir);
  const filePath = path.join(outputDir, options.fileName || `${options.panel || 'panel'}-${Date.now()}.png`);

  const target = pickWindow(options);
  const bounds = await getPanelBounds(target, options.panel || 'scene');
  const image = await target.capturePage({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  });
  const png = image.toPNG();
  fs.writeFileSync(filePath, png);

  return {
    filePath,
    dataUri: `data:image/png;base64,${png.toString('base64')}`,
    size: png.length,
    title: typeof target.getTitle === 'function' ? target.getTitle() : '',
    bounds,
  };
}

module.exports = {
  captureDesktopScreenshot,
  captureEditorWindowScreenshot,
  capturePanelScreenshot,
};
