import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const [packageText, viteConfig, readme] = await Promise.all([
  readFile(new URL("package.json", root), "utf8"),
  readFile(new URL("vite.config.ts", root), "utf8"),
  readFile(new URL("README.md", root), "utf8"),
]);
const packageJson = JSON.parse(packageText);

const forbiddenScaffolding = /cloudflare|\bd1\b|drizzle|wrangler/i;

test("local-only architecture excludes hosted persistence and deployment scaffolding", () => {
  const packageSurface = JSON.stringify({
    scripts: packageJson.scripts,
    dependencies: packageJson.dependencies,
    devDependencies: packageJson.devDependencies,
  });

  assert.doesNotMatch(packageSurface, forbiddenScaffolding);
  assert.doesNotMatch(viteConfig, forbiddenScaffolding);
});

test("documentation defines RECON//LAB as an account-based local-only product", () => {
  assert.match(readme, /account-based, local-only/i);
  assert.match(readme, /not a production multi-user service/i);
});
