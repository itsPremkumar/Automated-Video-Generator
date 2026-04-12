import { Request } from 'express';
import { SetupStatus } from '../types/server.types';
import { mediaAppService } from './media-app.service';
import { setupService } from './setup.service';

export class PortalAppService {
    getHomePageData(req: Request): {
        videos: ReturnType<typeof mediaAppService.listPublishedVideoRecords>;
        setupStatus: SetupStatus;
        musicFiles: string[];
        voiceFiles: string[];
    } {
        return {
            videos: mediaAppService.listPublishedVideoRecords(req),
            setupStatus: setupService.getSetupStatus(),
            musicFiles: mediaAppService.listMusicFiles(),
            voiceFiles: mediaAppService.listVoiceFiles(),
        };
    }

    getWatchVideo(videoId: string, req: Request) {
        return mediaAppService.getPublishedVideoFile(videoId, req);
    }

    listSitemapVideos(req: Request) {
        return mediaAppService.listPublishedVideoRecords(req);
    }
}

export const portalAppService = new PortalAppService();
