import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      "node_modules/**",
      "**/.next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "website/**",
      "vite-backup/**",
      ".claude/**",
    ],
  },
  {
    rules: {
      "max-lines": ["warn", { max: 400, skipBlankLines: true, skipComments: true }],
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrors: "none"
      }]
    }
  },
  {
    files: ["src/components/ui/**/*.tsx"],
    rules: {
      "max-lines": "off"
    }
  },
  {
    // One-off Node maintenance/debug scripts run directly via `node script.js`,
    // outside the Next.js bundler. The project isn't `"type": "module"`, so they
    // intentionally stay CommonJS rather than risk breaking at runtime.
    files: ["scripts/**/*.js", "*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off"
    }
  }
];

export default eslintConfig;
