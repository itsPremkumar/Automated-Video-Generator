import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);

export default {
    // Video settings
    width: 1080,
    height: 1350,
    fps: 30,
    durationInFrames: 900, // 30 seconds at 30 fps

    // Output settings
    codec: 'h264',
    quality: 80,

    // Composition ID
    id: 'SprouternVideo',

    // Default props
    defaultProps: {
        scenesData: './output/scene-data.json',
    },
};
