import { Request } from 'express';
import { getJobData, getVideo, listMusicFiles, listVoiceFiles, listVideos, publicVideo } from '../services/video.service';
import { JobStatus } from '../shared/contracts/job.contract';
import { NotFoundError } from '../lib/errors';

export class MediaAppService {
    listPublishedVideos(req: Request) {
        return listVideos(req).map(publicVideo);
    }

    listPublishedVideoRecords(req: Request) {
        return listVideos(req);
    }

    getPublishedVideo(videoId: string, req: Request) {
        const video = getVideo(videoId, req);
        if (!video) {
            throw new NotFoundError('Video not found.');
        }

        return publicVideo(video);
    }

    getPublishedVideoFile(videoId: string, req: Request) {
        const video = getVideo(videoId, req);
        if (!video) {
            throw new NotFoundError('Video not found.');
        }

        return video;
    }

    buildJobResponse(job: JobStatus, req: Request) {
        return getJobData(job, req);
    }

    buildJobLinks(jobId: string, req: Request) {
        return {
            statusUrl: `/api/jobs/${encodeURIComponent(jobId)}`,
            statusPageUrl: `/jobs/${encodeURIComponent(jobId)}`,
        };
    }

    listMusicFiles() {
        return listMusicFiles();
    }

    listVoiceFiles() {
        return listVoiceFiles();
    }
}

export const mediaAppService = new MediaAppService();
