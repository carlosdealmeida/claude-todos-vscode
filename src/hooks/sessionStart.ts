import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readStream } from '../services/readStream';
import { atomicWriteFileSync } from '../services/atomicWrite';

interface ClaudeHookInput {
  session_id: string;
  cwd: string;
  hook_event_name: string;
  [key: string]: unknown;
}

// Guard against a stdin that the parent never closes: resolve with whatever was
// received so the hook can never hang and stall session startup.
const STDIN_TIMEOUT_MS = 2000;

async function main(): Promise<void> {
  try {
    const raw = await readStream(process.stdin, STDIN_TIMEOUT_MS);
    if (!raw.trim()) {
      process.exit(0);
    }
    const input: ClaudeHookInput = JSON.parse(raw);

    const bridgeDir = path.join(os.homedir(), '.claude', '.vscode-todos-bridge');
    const bridgePath = path.join(bridgeDir, 'sessions.json');
    fs.mkdirSync(bridgeDir, { recursive: true });

    type Record = { cwd: string; sessionId: string; terminalPid: number | null; startedAt: number };
    let records: Record[] = [];
    if (fs.existsSync(bridgePath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(bridgePath, 'utf-8'));
        if (Array.isArray(parsed)) records = parsed;
      } catch { /* corrupt — overwrite */ }
    }

    const exists = records.some(r => r.sessionId === input.session_id && r.cwd === input.cwd);
    if (exists) {
      process.exit(0);
    }

    records.push({
      cwd: input.cwd,
      sessionId: input.session_id,
      terminalPid: parseInt(process.env.CLAUDE_TERMINAL_PID ?? '', 10) || null,
      startedAt: Date.now(),
    });

    if (records.length > 200) records = records.slice(-200);

    atomicWriteFileSync(bridgePath, JSON.stringify(records, null, 2));
  } catch (err) {
    try {
      const errDir = path.join(os.homedir(), '.claude', '.vscode-todos-bridge');
      fs.mkdirSync(errDir, { recursive: true });
      fs.appendFileSync(
        path.join(errDir, 'errors.log'),
        `${new Date().toISOString()} ${String(err)}\n`,
      );
    } catch { /* nothing to do */ }
  }
  process.exit(0);
}

main();
