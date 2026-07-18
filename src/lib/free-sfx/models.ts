export type SfxKind =
    'whoosh' | 'ding' | 'impact' | 'notification' | 'click' | 'pop' | 'transition' | 'swish' | 'bounce';

export interface SfxClip {
    kind: SfxKind;
    localPath: string;
    durationMs: number;
    description: string;
}

export interface SfxProvider {
    readonly name: string;
    getSfx(kind: SfxKind): Promise<SfxClip | null>;
}
