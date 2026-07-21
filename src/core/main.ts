import * as readline from 'readline';
import { createDispatcher, type CoreCommand, type CoreEvent } from './dispatcher';

function emit(ev: CoreEvent): void {
  process.stdout.write(JSON.stringify(ev) + '\n');
}

const dispatch = createDispatcher(emit);
const rl = readline.createInterface({ input: process.stdin });

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let cmd: CoreCommand;
  try {
    cmd = JSON.parse(trimmed) as CoreCommand;
  } catch {
    emit({ ev: 'error', message: 'invalid json' });
    return;
  }
  try {
    dispatch(cmd);
  } catch (err) {
    emit({ ev: 'error', message: String(err), ...(cmd.id !== undefined ? { id: cmd.id } : {}) });
  }
});
