import { Unzip, UnzipInflate } from "fflate";

export interface ExtractedFile {
  name: string;
  bytes: Uint8Array;
}

// Returns the wanted files from a mix of plain files and .zip archives. Zips are streamed so a
// multi-gigabyte Takeout archive never sits in memory; entries that don't match are never inflated.
export async function extractWanted(files: File[], wanted: RegExp): Promise<{ files: ExtractedFile[]; ignored: string[] }> {
  const out: ExtractedFile[] = [];
  const ignored: string[] = [];
  for (const file of files) {
    if (/\.zip$/i.test(file.name)) {
      const found = await unzipWanted(file, wanted);
      if (!found.length) ignored.push(`${file.name} (no matching files inside)`);
      out.push(...found);
    } else if (wanted.test(file.name)) {
      out.push({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
    } else {
      ignored.push(file.name);
    }
  }
  return { files: out, ignored };
}

async function unzipWanted(file: File, wanted: RegExp): Promise<ExtractedFile[]> {
  const found: ExtractedFile[] = [];
  const pending: Promise<void>[] = [];
  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  unzip.onfile = (entry) => {
    if (!wanted.test(entry.name)) return;
    const chunks: Uint8Array[] = [];
    pending.push(
      new Promise((resolve, reject) => {
        entry.ondata = (err, chunk, final) => {
          if (err) return reject(err);
          chunks.push(chunk);
          if (final) {
            found.push({ name: entry.name.split("/").slice(-2).join("/"), bytes: concat(chunks) });
            resolve();
          }
        };
      }),
    );
    entry.start();
  };

  const reader = file.stream().getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    unzip.push(value);
  }
  unzip.push(new Uint8Array(0), true);
  await Promise.all(pending);
  return found;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

export const decodeText = (bytes: Uint8Array) => new TextDecoder("utf-8").decode(bytes);
