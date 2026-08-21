import debug from 'debug';

import { FileModel } from '@/database/models/file';
import { getServerDB } from '@/database/server';
import { FileService } from '@/server/services/file';

const log = debug('lobe-file:proxy');

type Params = Promise<{ id: string }>;

/**
 * File proxy service
 * GET /f/:id
 *
 * Features:
 * - Query database to get file record (without userId filter for public access)
 * - Resolve a browser-reachable object URL via FileService.getFullFileUrl
 *   (public S3_PUBLIC_DOMAIN when S3_SET_ACL=1, otherwise cached presigned URL)
 * - Return 302 redirect
 *
 * NOTE: This endpoint is intentionally unauthenticated. The proxy URL is
 * embedded in bare `<img>` tags, download links, and links shared to AI — none
 * of which can attach auth headers/cookies. Adding `checkAuth` here would break
 * every previously-shared `/f/:id` link, so access stays public by id.
 */
export const GET = async (_req: Request, segmentData: { params: Params }) => {
  try {
    const params = await segmentData.params;
    const { id } = params;

    log('File proxy request: %s', id);

    // Get database connection
    const db = await getServerDB();

    // Query file record without userId filter (public access)
    const file = await FileModel.getFileById(db, id);

    if (!file) {
      log('File not found: %s', id);
      return new Response('File not found', {
        status: 404,
      });
    }

    // Create file service with file owner's userId
    const fileService = new FileService(db, file.userId);

    // Prefer getFullFileUrl so commercial deploys with an internal S3_ENDPOINT
    // (e.g. http://rustfs:9000) still redirect browsers to S3_PUBLIC_DOMAIN.
    const redirectUrl = await fileService.getFullFileUrl(file.url);
    if (!redirectUrl) {
      log('Empty redirect URL for file: %s', id);
      return new Response('File unavailable', { status: 404 });
    }
    log('File redirect URL resolved');

    // Return 302 redirect
    return Response.redirect(redirectUrl, 302);
  } catch (error) {
    console.error('File proxy error:', error);
    return new Response('Internal server error', {
      status: 500,
    });
  }
};
