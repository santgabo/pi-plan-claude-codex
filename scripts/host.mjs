import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { delimiter, dirname, join, resolve } from "node:path";

// Development only: reuse the installed host without installing or copying it.
export function findHost() {
  const require = createRequire(import.meta.url);
  const candidates = [];
  if (process.env.PI_PLAN_HOST_ROOT) candidates.push(resolve(process.env.PI_PLAN_HOST_ROOT));
  try {
    candidates.push(dirname(require.resolve("@earendil-works/pi-coding-agent/package.json")));
  } catch {
    try {
      candidates.push(dirname(dirname(require.resolve("@earendil-works/pi-coding-agent"))));
    } catch { /* Fall back to the Pi launcher on PATH. */ }
  }
  for (const entry of (process.env.PATH ?? "").split(delimiter)) {
    const launcher = join(entry, process.platform === "win32" ? "pi.cmd" : "pi");
    if (!existsSync(launcher)) continue;
    const real = realpathSync(launcher);
    let parent = dirname(real);
    while (parent !== dirname(parent)) {
      candidates.push(parent);
      parent = dirname(parent);
    }
    const install = process.env.PI_MANAGED_INSTALL_ROOT ?? join(dirname(dirname(real)), "install");
    const versionFile = join(install, "current-version");
    if (existsSync(versionFile)) {
      const version = readFileSync(versionFile, "utf8").trim();
      if (/^[a-zA-Z0-9._+-]+$/.test(version)) {
        candidates.push(join(install, "releases", version, "node_modules", "@earendil-works/pi-coding-agent"));
      }
    }
  }
  for (const root of candidates) {
    const file = join(root, "package.json");
    if (!existsSync(file)) continue;
    const info = JSON.parse(readFileSync(file, "utf8"));
    if (info.name === "@earendil-works/pi-coding-agent") return { root, version: info.version };
  }
  throw new Error("Could not find Pi. Install it or set PI_PLAN_HOST_ROOT to its package root.");
}

export function hostRequire(root) {
  return createRequire(join(root, "package.json"));
}

export function hostModule(root, name, kind = "import") {
  for (const modules of hostRequire(root).resolve.paths(name) ?? []) {
    const directory = join(modules, name);
    const manifest = join(directory, "package.json");
    if (!existsSync(manifest)) continue;
    const info = JSON.parse(readFileSync(manifest, "utf8"));
    const entry = kind === "types" ? info.types : info.exports?.["."]?.import ?? info.main;
    if (typeof entry === "string") return join(directory, entry);
  }
  throw new Error(`Could not find ${name} (${kind}) in the Pi installation.`);
}
