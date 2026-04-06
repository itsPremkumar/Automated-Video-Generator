import { exec, ChildProcess } from 'child_process';
import { jobStore } from '../../infrastructure/persistence/job-store';
import { resolveProjectPath } from '../../shared/runtime/paths';

const ALLOWED_COMMANDS = ['generate', 'resume', 'segment', 'remotion:render', 'remotion:studio'];

export async function runPipelineCommand(command: string, args: string[] = []) {
    if (!ALLOWED_COMMANDS.includes(command)) {
        throw new Error(`Command "${command}" is not whitelisted. Allowed: ${ALLOWED_COMMANDS.join(', ')}`);
    }

    const cmd = `npm run ${command} -- ${args.join(' ')}`;
    const jobId = `exec_${Date.now()}_${command}`;
    jobStore.set(jobId, { status: 'pending', progress: 0, message: `Running command: ${cmd}` });

    const child: ChildProcess = exec(cmd, { cwd: resolveProjectPath() }, (error, stdout, stderr) => {
        if (error) {
            jobStore.set(jobId, { status: 'failed', error: error.message, message: stderr });
            return;
        }
        jobStore.set(jobId, { status: 'completed', progress: 100, message: stdout, endTime: Date.now() });
    });

    return { jobId, command: cmd };
}
