import { runHealthCheck } from '../services/health.service';

export type RepairRuntimeResult = {
    ok: boolean;
    supported: boolean;
    message: string;
};

export class DiagnosticsService {
    getSetupStatus() {
        return runHealthCheck();
    }

    async repairRuntimeDependencies(): Promise<RepairRuntimeResult> {
        return {
            ok: false,
            supported: false,
            message: 'Automatic runtime repair is only available from the desktop setup flow right now.',
        };
    }
}

export const diagnosticsService = new DiagnosticsService();
