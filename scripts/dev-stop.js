#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}[STOP] ${message}${colors.reset}`);
}

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

// Main stop function
async function main() {
  log('🛑 Stopping Cursor Remote development servers...', 'yellow');
  
  // Kill client server (port 8080)
  log('Stopping client HTTP server...', 'yellow');
  await killPort(8080);
  await killByName('http.server.*8080');
  
  // Kill Node.js server
  log('Stopping Node.js server...', 'yellow');
  await killByName('supabaseService.js');
  await killByName('node.*supabaseService');
  
  // Kill any dev script processes
  await killByName('dev-start.js');
  
  log('✅ All development servers stopped', 'green');
}

// Run
main().catch(error => {
  log(`Stop error: ${error.message}`, 'red');
  process.exit(1);
});
