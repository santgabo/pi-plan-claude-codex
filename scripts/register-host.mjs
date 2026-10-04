import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { findHost, hostModule } from "./host.mjs";

const { root } = findHost();
const peers = new Set([
  "@earendil-works/pi-ai", "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-tui", "typebox",
]);
registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(peers.has(specifier) ? pathToFileURL(hostModule(root, specifier)).href : specifier, context);
  },
});
