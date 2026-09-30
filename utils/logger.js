'use strict';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function timestamp() {
  return new Date().toLocaleTimeString('vi-VN', { hour12: false });
}

const logger = {
  info: (tag, ...args) => {
    console.log(`${colors.dim}[${timestamp()}]${colors.reset} ${colors.cyan}[${tag}]${colors.reset}`, ...args);
  },
  success: (tag, ...args) => {
    console.log(`${colors.dim}[${timestamp()}]${colors.reset} ${colors.green}✔ [${tag}]${colors.reset}`, ...args);
  },
  warn: (tag, ...args) => {
    console.warn(`${colors.dim}[${timestamp()}]${colors.reset} ${colors.yellow}⚠ [${tag}]${colors.reset}`, ...args);
  },
  error: (tag, ...args) => {
    console.error(`${colors.dim}[${timestamp()}]${colors.reset} ${colors.red}✖ [${tag}]${colors.reset}`, ...args);
  },
  divider: () => {
    console.log(`${colors.dim}------------------------------------------------------------${colors.reset}`);
  }
};

module.exports = logger;
