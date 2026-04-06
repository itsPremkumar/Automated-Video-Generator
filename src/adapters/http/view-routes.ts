import { Router } from 'express';
import * as ViewController from './view-controller';

const router = Router();

router.get('/', ViewController.renderHome);
router.get('/videos/:videoId', ViewController.renderWatch);
router.get('/jobs/:jobId', ViewController.renderJob);
router.get('/robots.txt', ViewController.renderRobots);
router.get('/sitemap.xml', ViewController.renderSitemap);
router.get('/og-image.svg', ViewController.renderOgImage);
router.get('/llms.txt', ViewController.renderLlmsTxt);
router.get('/llms-full.txt', ViewController.renderLlmsFullTxt);

export default router;
