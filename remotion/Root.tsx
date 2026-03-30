import React from 'react';
import { Composition } from 'remotion';
import { MainVideo } from './MainVideo';
import { SingleSceneVideo } from './SingleSceneVideo';

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
        </>
    );
};
