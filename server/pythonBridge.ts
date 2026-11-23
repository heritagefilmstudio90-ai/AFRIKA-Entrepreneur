import { spawn } from 'node:child_process';
import path from 'node:path';

const PYTHON_SCRIPT_PATH = path.resolve(process.cwd(), 'python', 'africa_engine.py');

export async function runPythonEngine<T>(task: string, payload: unknown, timeoutMs = 3500): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const child = spawn('python3', [PYTHON_SCRIPT_PATH], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill('SIGKILL');
        reject(new Error(`Python engine timeout (${task})`));
      }
    }, timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(err);
      }
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Python exited with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout) as T);
      } catch (parseErr) {
        reject(parseErr);
      }
    });

    child.stdin.write(JSON.stringify({ task, payload }));
    child.stdin.end();
  });
}
