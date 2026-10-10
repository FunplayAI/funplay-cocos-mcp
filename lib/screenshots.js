'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const crypto = require('crypto');
const { resolveProjectFilePath } = require('./path-safety');
const electronTools = require('./electron-tools');
const { pngDimensions, readVisualState, registerCapture } = require('./visual-coordinates');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function screenshotPath(projectPath, options, kind) {
  const outputDir = resolveProjectFilePath(projectPath, 'temp/mcp-captures');
  const fileName = options.fileName || `${kind}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.png`;
  if (typeof fileName !== 'string' || fileName.length > 180 || /[\\/\0<>:"|?*\r\n]/.test(fileName) || !fileName.toLowerCase().endsWith('.png') || fileName === '.png') {
    throw new Error('fileName must be a plain PNG filename under temp/mcp-captures.');
  }
  ensureDir(outputDir);
  return checkedScreenshotPath(projectPath, path.join(outputDir, fileName));
}

function checkedScreenshotPath(projectPath, destination) {
  const filePath = resolveProjectFilePath(projectPath, destination);
  try {
    if (fs.lstatSync(filePath).isSymbolicLink()) throw new Error('Screenshot destination cannot be a symbolic link.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return filePath;
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
  const filePath = screenshotPath(projectPath, options, 'desktop');

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
      $bitmap.Save('${filePath.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png)
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
    imageSize: pngDimensions(fs.readFileSync(filePath)),
    interactive: false,
    reason: 'Desktop capture has no Electron window calibration.',
  };
}

async function captureEditorWindowScreenshot(projectPath, options = {}) {
  const filePath = screenshotPath(projectPath, options, 'editor');
  const target = electronTools.pickWindow(options);
  const before = await readVisualState(target, null, options.getContext);
  const image = await target.capturePage();
  const png = image.toPNG();
  const after = await readVisualState(target, null, options.getContext);
  const geometry = registerCapture(target, png, before, after, { ...options, panel: null, projectPath });
  fs.writeFileSync(checkedScreenshotPath(projectPath, filePath), png);

  return {
    filePath,
    dataUri: `data:image/png;base64,${png.toString('base64')}`,
    size: png.length,
    title: typeof target.getTitle === 'function' ? target.getTitle() : '',
    captureId: geometry.captureId,
    geometry,
  };
}

async function capturePanelScreenshot(projectPath, options = {}) {
  const panel = options.panel || 'scene';
  const filePath = screenshotPath(projectPath, options, panel);
  const target = electronTools.pickWindow(options);
  const before = await readVisualState(target, panel, options.getContext);
  const image = await target.capturePage(before.inputBounds);
  const png = image.toPNG();
  const after = await readVisualState(target, panel, options.getContext);
  const geometry = registerCapture(target, png, before, after, { ...options, panel, projectPath });
  fs.writeFileSync(checkedScreenshotPath(projectPath, filePath), png);

  return {
    filePath,
    dataUri: `data:image/png;base64,${png.toString('base64')}`,
    size: png.length,
    title: typeof target.getTitle === 'function' ? target.getTitle() : '',
    bounds: before.panelBounds,
    captureId: geometry.captureId,
    geometry,
  };
}

module.exports = {
  captureDesktopScreenshot,
  captureEditorWindowScreenshot,
  capturePanelScreenshot,
};
