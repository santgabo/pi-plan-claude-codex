import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, realpath, unlink } from "node:fs/promises";
import { join } from "node:path";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";

async function ensureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error(`El directorio de planes no puede ser un enlace simbólico: ${path}`);
  }
}

export async function saveProposal(cwd: string, markdown: string, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  const root = await realpath(cwd);
  const piDirectory = join(root, ".pi");
  await ensureDirectory(piDirectory);
  const directory = join(piDirectory, "plans");
  await ensureDirectory(directory);
  const file = join(directory, `${randomUUID()}.md`);
  return withFileMutationQueue(file, async () => {
    signal?.throwIfAborted();
    const handle = await open(file, "wx", 0o600);
    try {
      await handle.writeFile(`${markdown.trim()}\n`, { encoding: "utf8", signal });
      signal?.throwIfAborted();
      return file;
    } catch (error) {
      await unlink(file).catch(() => {});
      throw error;
    } finally {
      await handle.close();
    }
  });
}
