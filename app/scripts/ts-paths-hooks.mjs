import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const srcRoot = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "..", "src")).href;

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith("@/")) return nextResolve(specifier, context);
  const rel = specifier.slice(2);
  const withExt = /\.[cm]?[jt]sx?$/.test(rel);
  const candidates = withExt ? [rel] : [rel, `${rel}.ts`, `${rel}.tsx`, `${rel}.js`];
  let lastErr;
  for (const candidate of candidates) {
    try {
      return await nextResolve(new URL(candidate, `${srcRoot}/`).href, context);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}
