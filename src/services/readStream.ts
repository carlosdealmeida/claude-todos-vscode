// Reads a UTF-8 stream to completion, resolving with everything received so far
// if the stream does not end within `timeoutMs`. Without the timeout a hook
// whose stdin is never closed by the parent would hang indefinitely, stalling
// session startup (the symptom reported on Windows in claude-code#34457).
export function readStream(stream: NodeJS.ReadableStream, timeoutMs: number): Promise<string> {
  return new Promise(resolve => {
    let data = '';
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(data);
    };
    const timer = setTimeout(finish, timeoutMs);
    stream.setEncoding('utf-8');
    stream.on('data', chunk => { data += chunk; });
    stream.on('end', finish);
  });
}
