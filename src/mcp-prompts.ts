import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerPrompts(server: McpServer) {
  // create-marketing-video
  server.registerPrompt(
    "create-marketing-video",
    {
      title: "Create Marketing Video",
      description: "Template for creating a marketing video on a specific topic",
      argsSchema: {
        topic: z.string().describe("The subject of the video"),
        duration: z.string().optional().describe("Requested duration (e.g., 30s, 1m)"),
        orientation: z.enum(['portrait', 'landscape']).default('portrait').describe("Video layout"),
        voice: z.string().optional().describe("Voice ID (e.g., en-US-JennyNeural)"),
      } as any
    },
    ({ topic, duration, orientation, voice }: any) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `I want to create a ${orientation} marketing video about ${topic}. ${duration ? `Target length is ${duration}.` : ``} ${voice ? `Use the voice ${voice}.` : ``}
            
            Please:
            1. Write a professional script with [Visual: query] tags.
            2. Call 'generate_video' with the script and settings.
            3. Monitor the job until it's completed.
            4. Provide the final .mp4 path.`,
          },
        },
      ],
    })
  );

  // create-youtube-short
  server.registerPrompt(
    "create-youtube-short",
    {
      title: "Create YouTube Short",
      description: "Optimized template for 9:16 YouTube Shorts",
      argsSchema: {
        topic: z.string().describe("Topic for the Short"),
        voice: z.string().optional().describe("Voice ID"),
      } as any
    },
    ({ topic, voice }: any) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Generate a viral YouTube Short (9:16 portrait) about ${topic}. ${voice ? `Use voice ${voice}.` : ``}
            
            Include:
            - Engaging, fast-paced script
            - Specific stock footage keywords in [Visual: ...] tags
            - On-screen subtitles enabled (showText=true)`,
          },
        },
      ],
    })
  );

  // batch-generate
  server.registerPrompt(
    "batch-generate",
    {
      title: "Batch Generate",
      description: "Generate multiple videos from a comma-separated list of topics",
      argsSchema: {
        topics: z.string().describe("Comma-separated topics (e.g., 'Nature, Future, Tech')"),
        orientation: z.enum(['portrait', 'landscape']).default('landscape').describe("Video layout for all"),
      } as any
    },
    ({ topics, orientation }: any) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `I need to generate a series of ${orientation} videos for these topics: ${topics}.
            
            For EACH topic:
            1. Create a script.
            2. Run 'generate_video'.
            3. Report the completion status.`,
          },
        },
      ],
    })
  );

  // debug-pipeline
  server.registerPrompt(
    "debug-pipeline",
    {
      title: "Debug Pipeline",
      description: "Troubleshoot the video generation system",
    },
    () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `The video generator seems to have an issue. Please:
            1. Run 'health_check' to verify dependencies.
            2. Run 'get_system_info' to check the environment.
            3. List recent jobs using 'list_jobs' and check for failures.
            4. Read the .env config to ensure API keys are set.`,
          },
        },
      ],
    })
  );
}
