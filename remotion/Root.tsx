import React from 'react';
import { Composition } from 'remotion';
import { MainVideo } from './MainVideo';
import { SingleSceneVideo } from './SingleSceneVideo';
import { AgenticVideo } from './AgenticVideo';

export const RemotionRoot = () => {
    return (
        <>
            {/* Full video composition (original) */}
            <Composition
                id="SprouternVideo"
                component={MainVideo}
                durationInFrames={900}
                fps={30}
                width={1080}
                height={1350}
                defaultProps={{
                    sceneData: undefined as any,
                }}
            />
            {/* Single scene composition (for segmented rendering) */}
            <Composition
                id="SingleScene"
                component={SingleSceneVideo}
                durationInFrames={300}
                fps={30}
                width={1080}
                height={1350}
                defaultProps={{
                    scene: undefined as any,
                    isFirstScene: false,
                    isLastScene: false,
                }}
            />
            {/* Phase 1 — agentic pipeline composition (accepts the agentic manifest).
                durationInFrames is computed from the actual content via calculateMetadata
                so longer videos are NOT truncated at the static 300-frame default. */}
            <Composition
                id="AgenticVideo"
                component={AgenticVideo}
                durationInFrames={300}
                fps={30}
                width={1080}
                height={1920}
                calculateMetadata={({ props }: { props: any }) => {
                    const fps = (props as any).fps ?? 30;
                    const intro = ((props as any).introCard?.durationSec ?? 0) * fps;
                    const outro = ((props as any).outroCard?.durationSec ?? 0) * fps;
                    const scenes = ((props as any).assets ?? [])
                        .filter((a: any) => a.kind !== 'music')
                        .reduce((s: number, a: any) => s + Math.max(1, Math.round((a.durationSec ?? 4) * fps)), 0);
                    const total = Math.max(30, Math.round(intro + scenes + outro));
                    return { durationInFrames: total };
                }}
                defaultProps={{
                    title: 'Agentic Video',
                    orientation: 'portrait',
                    fps: 30,
                    assets: [],
                    brand: { primaryColor: '#0a0a12', accentColor: '#FF6B35', fontFamily: 'system-ui' },
                    kenBurns: true,
                }}
            />
        </>
    );
};

