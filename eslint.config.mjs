import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "coverage/**"] },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    rules: {
      // T-10: the only place allowed to spawn a process is core/src/exec.ts.
      "no-restricted-imports": ["error", {
        paths: [
          { name: "child_process", message: "Spawn only through core/src/exec.ts (T-10)." },
          { name: "node:child_process", message: "Spawn only through core/src/exec.ts (T-10)." },
        ],
      }],
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    files: ["core/src/exec.ts"],
    rules: { "no-restricted-imports": "off" },
  },
);
