import { execFile, ChildProcess } from 'child_process';
import { jobStore } from '../../infrastructure/persistence/job-store';
import { resolveProjectPath } from '../../shared/runtime/paths';

const ALLOWED_COMMANDS = ['generate', 'resume', 'segment', 'remotion:render', 'remotion:studio'];

export async function runPipelineCommand(command: string, args: string[] = []) {
    if (!ALLOWED_COMMANDS.includes(command)) {
        throw new Error(`Command "${command}" is not whitelisted. Allowed: ${ALLOWED_COMMANDS.join(', ')}`);
    }

    // SECURITY: pass args as an argv array to execFile so they are NEVER
    // interpreted by a shell. The previous `exec(\`npm run ${command} -- ${args.join(' ')}\`)`
    // was a command-injection/RCE: a malicious `args` value like `"; rm -rf ~`
    // would execute. npm receives the args verbatim as script flags.
    const jobId = `exec_${Date.now()}_${command}`;
    jobStore.set(jobId, { status: 'pending', progress: 0, message: `Running command: npm run ${command}` });

    const child: ChildProcess = execFile(
        'npm',
        ['run', command, '--', ...args],
        { cwd: resolveProjectPath() },
        (error, stdout, stderr) => {
            if (error) {
                jobStore.set(jobId, { status: 'failed', error: error.message, message: stderr });
                return;
            }
            jobStore.set(jobId, { status: 'completed', progress: 100, message: stdout, endTime: Date.now() });
        },
    );

    // Return the full command string for callers/audit (informational only —
    // the actual execution above uses argv, not a shell).
    const commandStr = `npm run ${command}${args.length ? ' -- ' + args.join(' ') : ''}`;
    return { jobId, command: commandStr };
}
