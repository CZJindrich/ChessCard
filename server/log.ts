/** Concise server log lines: `12:04:31 KWTR Ann joined`. */
export interface Logger {
  info(line: string): void;
  warn(line: string): void;
  error(line: string): void;
}

function time(): string {
  return new Date().toTimeString().slice(0, 8);
}

export const consoleLogger: Logger = {
  info: (line) => console.log(`${time()} ${line}`),
  warn: (line) => console.warn(`${time()} warning: ${line}`),
  error: (line) => console.error(`${time()} error: ${line}`),
};

export const silentLogger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/** Lines prefixed with a room code. */
export function roomLogger(log: Logger, code: string): Logger {
  return {
    info: (line) => log.info(`${code} ${line}`),
    warn: (line) => log.warn(`${code} ${line}`),
    error: (line) => log.error(`${code} ${line}`),
  };
}
