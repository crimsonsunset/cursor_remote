#!/usr/bin/env node

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import chokidar from 'chokidar';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { platform } from 'os';

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}[DEV] ${message}${colors.reset}`);
}

// Store process references
let clientProcess = null;
let serverProcess = null;

// Kill processes by port
async function killPort(port) {
  try {
    // Try lsof first (more reliable on macOS)
    const { stdout } = await execAsync(`lsof -ti:${port}`);
    if (stdout.trim()) {
      const pids = stdout.trim().split('\n');
      for (const pid of pids) {
        try {
          await execAsync(`kill -9 ${pid}`);
          log(`Killed process ${pid} on port ${port}`, 'yellow');
        } catch (error) {
          // Process might already be dead
        }
      }
    }
  } catch (error) {
    // Port not in use, which is fine
  }
}

// Kill processes by name pattern
async function killByName(pattern) {
  try {
    const { stdout } = await execAsync(`ps aux | grep "${pattern}" | grep -v grep | awk '{print $2}'`);
    if (stdout.trim()) {
      const pids = stdout.trim().split('\n');
      for (const pid of pids) {
        try {
          await execAsync(`kill -9 ${pid}`);
          log(`Killed process ${pid} matching "${pattern}"`, 'yellow');
        } catch (error) {
          // Process might already be dead
        }
      }
    }
  } catch (error) {
    // No processes found, which is fine
  }
}

// Start client HTTP server
function startClient() {
  log('Starting client HTTP server on port 8080...', 'green');
  
  // Ensure public directory has proper env config
  try {
    execAsync('cp client/env-config.js public/env-config.js');
    log('✅ Copied environment configuration to public directory', 'green');
  } catch (error) {
    log(`⚠️  Warning: Could not copy env-config.js: ${error.message}`, 'yellow');
  }
  
  clientProcess = spawn('python3', ['-m', 'http.server', '8080', '--directory', 'public'], {
    cwd: rootDir,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  clientProcess.stdout.on('data', (data) => {
    log(`[CLIENT] ${data.toString().trim()}`, 'cyan');
  });

  clientProcess.stderr.on('data', (data) => {
    log(`[CLIENT ERROR] ${data.toString().trim()}`, 'red');
  });

  clientProcess.on('close', (code) => {
    log(`Client process exited with code ${code}`, 'yellow');
    clientProcess = null;
  });

  clientProcess.on('error', (error) => {
    log(`Client process error: ${error.message}`, 'red');
  });
}

// Start Node.js server
function startServer() {
  log('Starting Node.js server...', 'green');
  
  serverProcess = spawn('node', ['src/services/supabaseService.js'], {
    cwd: join(rootDir, 'server'),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  serverProcess.stdout.on('data', (data) => {
    log(`[SERVER] ${data.toString().trim()}`, 'magenta');
  });

  serverProcess.stderr.on('data', (data) => {
    log(`[SERVER ERROR] ${data.toString().trim()}`, 'red');
  });

  serverProcess.on('close', (code) => {
    log(`Server process exited with code ${code}`, 'yellow');
    serverProcess = null;
  });

  serverProcess.on('error', (error) => {
    log(`Server process error: ${error.message}`, 'red');
  });
}

// Open browser
async function openBrowser(url) {
  const currentPlatform = platform();
  let command;
  
  switch (currentPlatform) {
    case 'darwin': // macOS
      command = `open "${url}"`;
      break;
    case 'win32': // Windows
      command = `start "" "${url}"`;
      break;
    default: // Linux and others
      command = `xdg-open "${url}"`;
      break;
  }
  
  try {
    await execAsync(command);
    log(`Browser opened: ${url}`, 'green');
  } catch (error) {
    log(`Failed to open browser: ${error.message}`, 'red');
    log(`Please manually open: ${url}`, 'cyan');
  }
}

// Stop all processes
function stopAll() {
  log('Stopping all processes...', 'yellow');
  
  if (clientProcess) {
    clientProcess.kill('SIGTERM');
    clientProcess = null;
  }
  
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
}

// Restart server only (for server file changes)
function restartServer() {
  log('Restarting server due to file changes...', 'yellow');
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
  setTimeout(startServer, 1000);
}

// Restart client only (for client file changes)
function restartClient() {
  log('Restarting client due to file changes...', 'yellow');
  if (clientProcess) {
    clientProcess.kill('SIGTERM');
  }
  setTimeout(startClient, 1000);
}

// Main startup function
async function main() {
  log('🚀 Starting Cursor Remote development server...', 'green');
  
  // Kill any existing processes
  log('Cleaning up existing processes...', 'yellow');
  await killPort(8080);
  await killByName('http.server.*8080');
  await killByName('supabaseService.js');
  
  // Wait a moment for cleanup
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Start services
  startClient();
  startServer();
  
  // Set up file watchers
  log('Setting up file watchers...', 'blue');
  
  // Watch client files
  const clientWatcher = chokidar.watch(['client/**/*.js', 'client/**/*.html', 'client/**/*.css'], {
    cwd: rootDir,
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: true
  });
  
  clientWatcher.on('change', (path) => {
    log(`Client file changed: ${path}`, 'blue');
    restartClient();
  });
  
  // Watch server files
  const serverWatcher = chokidar.watch(['server/**/*.js'], {
    cwd: rootDir,
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: true
  });
  
  serverWatcher.on('change', (path) => {
    log(`Server file changed: ${path}`, 'blue');
    restartServer();
  });
  
  // Handle process termination
  process.on('SIGINT', () => {
    log('Received SIGINT, shutting down...', 'yellow');
    stopAll();
    clientWatcher.close();
    serverWatcher.close();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    log('Received SIGTERM, shutting down...', 'yellow');
    stopAll();
    clientWatcher.close();
    serverWatcher.close();
    process.exit(0);
  });
  
  // Show status and open browser
  setTimeout(async () => {
    const url = 'http://localhost:8080';
    log('✅ Development server started!', 'green');
    log(`📱 Client: ${url}`, 'cyan');
    log('⚙️  Server: Node.js service running', 'magenta');
    log('👀 Watching for file changes...', 'blue');
    log('🛑 Press Ctrl+C to stop', 'yellow');
    
    // Wait a moment for server to be fully ready, then open browser
    setTimeout(async () => {
      await openBrowser(url);
    }, 1000);
  }, 2000);
}

// Run
main().catch(error => {
  log(`Startup error: ${error.message}`, 'red');
  process.exit(1);
});
