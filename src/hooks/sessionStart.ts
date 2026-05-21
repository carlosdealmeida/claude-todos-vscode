import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

interface ClaudeHookInput {
  session_id: string;
  cwd: string;
  hook_event_name: string;
  [key: string]: unknown;
}

function readStdin(): Promise<string> {
  return new Promise(resolve => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', chunk => (data += chunk));
    process.stdin.on('end', () => resolve(data));
  });
}

async function main(): Promise<void> {
  try {
    const raw = await readStdin();
    if (!raw.trim()) {
      process.exit(0);
    }
    const input: ClaudeHookInput = JSON.parse(raw);

    const bridgeDir = path.join(os.homedir(), '.claude', '.vscode-todos-bridge');
    const bridgePath = path.join(bridgeDir, 'sessions.json');
    fs.mkdirSync(bridgeDir, { recursive: true });

    let records: unknown[] = [];
    if (fs.existsSync(bridgePath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(bridgePath, 'utf-8'));
        if (Array.isArray(parsed)) records = parsed;
      } catch { /* corrupt — overwrite */ }
    }

    records.push({
      cwd: input.cwd,
      sessionId: input.session_id,
      terminalPid: parseInt(process.env.CLAUDE_TERMINAL_PID ?? '', 10) || null,
      startedAt: Date.now(),
    });

    if (records.length > 200) records = records.slice(-200);

    fs.writeFileSync(bridgePath, JSON.stringify(records, null, 2));
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
