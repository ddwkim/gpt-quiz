(globalThis as any).DOMPurify = {
  sanitize: (input: string) => input,
  addHook: () => {}
};
