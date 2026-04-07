export {
    dataRoot,
    ensureProjectRootCwd,
    inMcpRuntime,
    isElectron,
    projectRoot,
    resolvePublicFilePath,
    resolveProjectPath,
    resolveResourcePath,
    resolveRuntimePublicPath,
} from './shared/runtime/paths';

export {
    logError,
    logInfo,
    logWarn,
    writeProgress,
} from './shared/logging/runtime-logging';

export {
    jobStore,
    JobStore,
} from './infrastructure/persistence/job-store';

export type {
    JobPhase,
    JobRequestOptions,
    JobState,
    JobStatus,
    JobTextConfig,
    StoredJobRequest,
} from './shared/contracts/job.contract';
