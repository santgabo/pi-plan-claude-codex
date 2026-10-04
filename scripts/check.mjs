import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { findHost, hostModule } from "./host.mjs";

const { root, version } = findHost();
const paths = {};
for (const name of ["@earendil-works/pi-ai", "@earendil-works/pi-coding-agent", "@earendil-works/pi-tui", "typebox"]) {
  paths[name] = [hostModule(root, name, "types")];
}
const scratch = mkdtempSync(join(tmpdir(), "pi-plan-check-"));
try {
  const config = join(scratch, "tsconfig.json");
  writeFileSync(config, JSON.stringify({
    compilerOptions: {
      target: "ES2023", module: "NodeNext", moduleResolution: "NodeNext",
      strict: true, noUnusedLocals: true, noUnusedParameters: true, noEmit: true, allowImportingTsExtensions: true,
      erasableSyntaxOnly: true, skipLibCheck: true, paths,
      types: ["node"], typeRoots: [dirname(dirname(hostModule(root, "@types/node", "types")))],
    },
    include: [resolve("extensions/**/*.ts"), resolve("test/**/*.ts")],
  }));
  execFileSync(process.env.PI_PLAN_TSC ?? "tsc", ["-p", config], { stdio: "inherit" });
  process.stdout.write(`Types checked against Pi ${version}.\n`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
