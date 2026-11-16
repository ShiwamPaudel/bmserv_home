// Files go straight from the browser to R2 with a presigned link, with progress.
import { allowedMimeTypes, maxBytesFor, type FileKind, type FileOwnerType } from "@bmserv/shared/enums";
import { t } from "@bmserv/shared/terms";
import { get, post } from "./api";

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function checkFile(file: File, kind: FileKind): string | null {
  if (!(allowedMimeTypes as readonly string[]).includes(file.type)) return t.files.wrongType;
  const max = maxBytesFor(kind);
  if (file.size > max) return t.files.tooBig(formatBytes(max));
  return null;
}

export async function uploadFile(
  file: File,
  meta: { ownerType: FileOwnerType; ownerId: string; kind: FileKind; title: string; note: string | null },
  onProgress: (loaded: number, total: number) => void,
): Promise<string> {
  const { fileId, uploadUrl } = await post<{ fileId: string; uploadUrl: string }>("/files/upload", {
    ...meta,
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  });
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded, e.total);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(t.files.failed)));
    xhr.onerror = () => reject(new Error(t.files.failed));
    xhr.send(file);
  });
  await post(`/files/${fileId}/ready`);
  return fileId;
}

/** Opens a short-lived link to the file. */
export async function openFile(id: string, download = false) {
  const win = download ? null : window.open("", "_blank");
  try {
    const { url } = await get<{ url: string }>(`/files/${id}/link${download ? "?download=1" : ""}`);
    if (win) win.location.href = url;
    else window.location.href = url;
  } catch (err) {
    win?.close();
    throw err;
  }
}
