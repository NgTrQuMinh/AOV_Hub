/**
 * core/logger.js - Logger đơn giản, tránh console.* rải rác
 */
const PREFIX = '[AOV-HUB]';

function log(level, ...args) {
  try {
    const fn = console[level] || console.log;
    fn(PREFIX, ...args);
  } catch (_) {
    // ignore
  }
}

export const logger = {
  debug: (...args) => log('debug', ...args),
  info: (...args) => log('info', ...args),
  warn: (...args) => log('warn', ...args),
  error: (...args) => log('error', ...args),
};
