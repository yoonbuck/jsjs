// Minimal ambient declarations for the host APIs the tooling adapters use.
// The engine itself never touches these; only Node-side launchers and the
// JavaScriptCore adapter do, so a hand-written shim keeps the project free of
// a full platform type dependency.

declare module 'node:fs/promises' {
  export interface Dirent {
    name: string;
    isDirectory(): boolean;
    isFile(): boolean;
  }

  export function readFile(
    path: string | URL,
    encoding: string,
  ): Promise<string>;
  export function readdir(path: string | URL): Promise<string[]>;
  export function readdir(
    path: string | URL,
    options: { withFileTypes: true },
  ): Promise<Dirent[]>;
  export function writeFile(
    path: string | URL,
    data: string,
    encoding?: string,
  ): Promise<void>;
  export function mkdir(
    path: string | URL,
    options?: { recursive?: boolean },
  ): Promise<string | undefined>;
  export function rm(
    path: string | URL,
    options?: { force?: boolean; recursive?: boolean },
  ): Promise<void>;
}

declare module 'node:crypto' {
  export interface Hash {
    update(data: string, encoding?: string): Hash;
    digest(encoding: 'hex'): string;
  }

  export function createHash(algorithm: string): Hash;
}

declare module 'node:url' {
  export function pathToFileURL(path: string): URL;
  export function fileURLToPath(url: string | URL): string;
}

declare module 'node:fs' {
  export function existsSync(path: string | URL): boolean;
}

// The full local CI contract shells out to run every declared CI command for
// real, rather than grepping source text for its expected effect.
declare module 'node:child_process' {
  export function execFileSync(
    command: string,
    args?: string[],
    options?: { cwd?: string; encoding: 'utf8' },
  ): string;
  export function spawnSync(
    command: string,
    args?: string[],
    options?: {
      cwd?: string;
      encoding: 'utf8';
      maxBuffer?: number;
    },
  ): {
    status: number | null;
    stdout: string;
    stderr: string;
    error?: Error;
  };
}

// The workflow contract parses the generated YAML with a real parser instead of
// pattern-matching its text. js-yaml ships no typings of its own.
declare module 'js-yaml' {
  export function load(text: string): unknown;
}

// `jsc` shell globals (JavaScriptCore's command line interpreter).
declare var readFile: ((path: string) => string) | undefined;
declare var read: ((path: string) => string) | undefined;
declare var print: ((text: string) => void) | undefined;
declare var quit: ((code?: number) => void) | undefined;

// Optional launcher configuration for the JavaScriptCore adapter.
declare var jsjsTest262Root: string | undefined;
declare var jsjsTest262Features: string[] | undefined;

// JavaScriptCore exposes the running module's URL as `import.meta.filename`
// rather than `import.meta.url`.
interface ImportMeta {
  filename?: string;
}
