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
 * - Stream object bytes from storage via the server's S3 credentials
 * - Return 200 with Content-Type so <img src="/f/..."> never depends on
 *   browser-reachable S3 endpoints or cached 302 Location headers
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
        headers: { 'Cache-Control': 'private, no-store' },
        status: 404,
      });
    }

    // Create file service with file owner's userId
    const fileService = new FileService(db, file.userId);

    // Serve bytes through the app so commercial deploys with an internal
    // S3_ENDPOINT (e.g. http://rustfs:9000) never require the browser to
    // follow a redirect to an unreachable host. Also avoids sticky 302
    // caches that previously pointed at rustfs.
    const bytes = await fileService.getFileByteArray(file.url);
    const contentType = file.fileType || 'application/octet-stream';

    log('File proxy streaming %s bytes (%s)', bytes.byteLength, contentType);

    return new Response(bytes, {
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Length': String(bytes.byteLength),
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
      },
      status: 200,
    });
  } catch (error) {
    console.error('File proxy error:', error);
    return new Response('Internal server error', {
      headers: { 'Cache-Control': 'private, no-store' },
      status: 500,
    });
  }
};
