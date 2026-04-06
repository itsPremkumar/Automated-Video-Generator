import { getSetupStatus, updateEnvValues } from '../services/env.service';
import { EditableEnvKey } from '../types/server.types';
import { diagnosticsService } from './diagnostics.service';

export class SetupService {
    getSetupStatus() {
        return getSetupStatus();
    }

    updateEnvValues(updates: Partial<Record<EditableEnvKey, string>>) {
        updateEnvValues(updates);
        return this.getSetupStatus();
    }

    getDiagnostics() {
        return diagnosticsService.getSetupStatus();
    }

    async repairRuntimeDependencies() {
        return diagnosticsService.repairRuntimeDependencies();
    }
}

export const setupService = new SetupService();
