declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  exitCode?: number;
  pid: number;
  version: string;
  stdout: {
    write(chunk: string): void;
  };
  stderr: {
    write(chunk: string): void;
  };
};
