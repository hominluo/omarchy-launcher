// Filesystem helpers that never trust a pathname twice.
import * as fs from "node:fs"
import * as path from "node:path"
import { randomBytes } from "node:crypto"

const { O_WRONLY, O_CREAT, O_EXCL, O_NOFOLLOW } = fs.constants

// Replace `file` with `data` through an unpredictable O_EXCL|O_NOFOLLOW temp
// beside it: a symlink planted at a guessable name can never redirect the
// write, the descriptor is checked to be our own fresh regular file, and the
// temp is fsynced before it is renamed into place.
export function atomicWrite(file: string, data: string | Buffer, mode = 0o600) {
  const dir = path.dirname(file)
  fs.mkdirSync(dir, { recursive: true })
  let tmp = "", fd = -1
  for (let i = 0; i < 32 && fd < 0; i++) {
    tmp = path.join(dir, `.${path.basename(file)}.${randomBytes(8).toString("hex")}.tmp`)
    try { fd = fs.openSync(tmp, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, mode) } catch (e: any) { if (e.code !== "EEXIST") throw e }
  }
  if (fd < 0) throw new Error(`could not create a temporary file beside ${file}`)
  try {
    const st = fs.fstatSync(fd)
    if (!st.isFile() || st.uid !== process.getuid!() || st.nlink !== 1) throw new Error(`unexpected file at ${tmp}; refusing to write`)
    fs.writeSync(fd, data as any)
    fs.fsyncSync(fd)
    fs.closeSync(fd); fd = -1
    fs.renameSync(tmp, file)
  } catch (e) {
    if (fd >= 0) try { fs.closeSync(fd) } catch {}
    try { fs.unlinkSync(tmp) } catch {}
    throw e
  }
}
