import { localFilesystem, PickedFileType } from '../infrastructure/filesystem/local-filesystem';

export class FilesystemAppService {
    listFiles(rawPath?: string) {
        return localFilesystem.listFiles(rawPath);
    }

    pickFile(sourcePath: string, type: PickedFileType) {
        return localFilesystem.pickFile(sourcePath, type);
    }

    listGalleryAssets() {
        return localFilesystem.listGalleryAssets();
    }

    deleteAsset(filename: string) {
        localFilesystem.deleteAsset(filename);
    }

    getViewFile(rawPath: string, range?: string) {
        return localFilesystem.getViewFile(rawPath, range);
    }

    async listDrives() {
        return localFilesystem.listDrives();
    }

    getHomeDirs() {
        return localFilesystem.getHomeDirs();
    }

    copyFileTo(sourcePath: string, targetDirectory: string) {
        return localFilesystem.copyFileTo(sourcePath, targetDirectory);
    }
}

export const filesystemAppService = new FilesystemAppService();
