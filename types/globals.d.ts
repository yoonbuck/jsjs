declare const process: {
  argv: string[];
  exitCode?: number;
  stdout: {
    write(chunk: string): void;
  };
};
