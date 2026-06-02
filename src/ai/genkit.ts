// Genkit AI is only available in server-side Genkit flows (run via genkit:dev).
// This stub prevents the package from being bundled into the Next.js server,
// which crashes due to google-auth-library incompatibilities with Turbopack.

export const ai = {
  generate: async () => { throw new Error('AI is not available in this context.'); },
  defineFlow: (config: any, fn: any) => fn,
  defineTool: (config: any, fn: any) => fn,
};
