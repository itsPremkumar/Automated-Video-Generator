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
import { PieChart } from './compositions/PieChart';
import { LogoReveal } from './compositions/LogoReveal';
import { AudioReactiveSpectrum } from './compositions/AudioReactiveSpectrum';
import { LowerThird } from './compositions/LowerThird';
import { TimelineRoadmap } from './compositions/TimelineRoadmap';
import { LoadingSpinner } from './compositions/LoadingSpinner';

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
      <Composition
        id="PieChart"
        component={PieChart}
        durationInFrames={120}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="LogoReveal"
        component={LogoReveal}
        durationInFrames={120}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="AudioReactiveSpectrum"
        component={AudioReactiveSpectrum}
        durationInFrames={150}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="LowerThird"
        component={LowerThird}
        durationInFrames={120}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="TimelineRoadmap"
        component={TimelineRoadmap}
        durationInFrames={150}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="LoadingSpinner"
        component={LoadingSpinner}
        durationInFrames={120}
        fps={FPS}
        width={1920}
        height={1080}
      />
    </>
  );
};
