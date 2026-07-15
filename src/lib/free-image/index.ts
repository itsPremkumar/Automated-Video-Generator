import { WikimediaImageProvider } from './providers/wikimedia.js';
import { ArchiveOrgImageProvider } from './providers/archive.js';
import { NasaImageProvider } from './providers/nasa.js';
import { MetMuseumImageProvider } from './providers/metmuseum.js';
import { FreeImageAdapter } from './adapter.js';

export const wikiImageProvider = new WikimediaImageProvider();
export const archiveImageProvider = new ArchiveOrgImageProvider();
export const nasaImageProvider = new NasaImageProvider();
export const metImageProvider = new MetMuseumImageProvider();
export const freeImageAdapter = new FreeImageAdapter();

export type { ImageResult, ImageSearchOptions, ImageProvider } from './models.js';
