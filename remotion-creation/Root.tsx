import React from 'react';
import { Composition } from 'remotion';
import { KineticTypography } from './compositions/KineticTypography';
import { BarChartInfographic } from './compositions/BarChartInfographic';
import { ConfettiParticles } from './compositions/ConfettiParticles';
import { NeuralNetwork } from './compositions/NeuralNetwork';
import { HudRadar } from './compositions/HudRadar';
import { AuroraLoop } from './compositions/AuroraLoop';
import { TerminalTyping } from './compositions/TerminalTyping';
import { SpectrumVisualizer } from './compositions/SpectrumVisualizer';

const FPS = 30;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="KineticTypography"
        component={KineticTypography}
        durationInFrames={120}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="BarChartInfographic"
        component={BarChartInfographic}
        durationInFrames={120}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="ConfettiParticles"
        component={ConfettiParticles}
        durationInFrames={150}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="NeuralNetwork"
        component={NeuralNetwork}
        durationInFrames={150}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="HudRadar"
        component={HudRadar}
        durationInFrames={150}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="AuroraLoop"
        component={AuroraLoop}
        durationInFrames={120}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="TerminalTyping"
        component={TerminalTyping}
        durationInFrames={180}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="SpectrumVisualizer"
        component={SpectrumVisualizer}
        durationInFrames={150}
        fps={FPS}
        width={1920}
        height={1080}
      />
    </>
  );
};
