/**
 * motion-effects.tsx — cinematic motion blur via @remotion/motion-blur
 * (CameraMotionBlur). Wraps a moving layer to add camera-style motion blur.
 * License-clean (Remotion package, free for solo use).
 *
 * NOTE: @remotion/motion-blur's <Trail> requires explicit layer config
 * (layers/lagInFrames/trailOpacity) tied to specific animated elements, so it
 * is not a drop-in wrapper; we expose only the generic CameraMotionBlur here.
 */
import React from 'react';
import { CameraMotionBlur } from '@remotion/motion-blur';

/** Wrap a moving layer to add camera-style motion blur (cinematic). */
export const MotionBlur: React.FC<{ children: React.ReactNode; samples?: number }> = ({ children, samples = 10 }) => (
    <CameraMotionBlur samples={samples}>{children}</CameraMotionBlur>
);
