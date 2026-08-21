// @vitest-environment node
import type { LobeChatDatabase } from '@lobechat/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FileModel } from '@/database/models/file';
import type { FileItem } from '@/database/schemas';
import { getServerDB } from '@/database/server';
import { FileService } from '@/server/services/file';

import { GET } from './route';

const fileServiceMocks = vi.hoisted(() => {
  const instance = {
    getFileByteArray: vi.fn(),
  };

  return {
    FileService: vi.fn(() => instance),
    instance,
  };
});

vi.mock('@/database/models/file', () => ({
  FileModel: {
    getFileById: vi.fn(),
  },
}));

vi.mock('@/database/server', () => ({
  getServerDB: vi.fn(),
}));

vi.mock('@/server/services/file', () => ({
  FileService: fileServiceMocks.FileService,
}));

describe('file proxy route', () => {
  const db = {} as LobeChatDatabase;
  const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getServerDB).mockResolvedValue(db);
    vi.mocked(FileModel.getFileById).mockResolvedValue({
      fileType: 'image/png',
      id: 'file-id',
      url: 'files/user-id/image.png',
      userId: 'owner-user-id',
    } as FileItem);
    fileServiceMocks.instance.getFileByteArray.mockResolvedValue(pngBytes);
  });

  it('should stream object bytes so internal S3 endpoints never reach the browser', async () => {
    const response = await GET(new Request('https://lobehub.com/f/file-id'), {
      params: Promise.resolve({ id: 'file-id' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('content-length')).toBe(String(pngBytes.byteLength));
    expect(response.headers.get('cache-control')).toContain('immutable');
    expect(response.headers.get('location')).toBeNull();
    expect(FileModel.getFileById).toHaveBeenCalledWith(db, 'file-id');
    expect(FileService).toHaveBeenCalledWith(db, 'owner-user-id');
    expect(fileServiceMocks.instance.getFileByteArray).toHaveBeenCalledWith(
      'files/user-id/image.png',
    );

    const body = new Uint8Array(await response.arrayBuffer());
    expect(body).toEqual(pngBytes);
  });

  it('should return 404 when file record is missing', async () => {
    vi.mocked(FileModel.getFileById).mockResolvedValue(undefined as never);

    const response = await GET(new Request('https://lobehub.com/f/missing'), {
      params: Promise.resolve({ id: 'missing' }),
    });

    expect(response.status).toBe(404);
    expect(fileServiceMocks.instance.getFileByteArray).not.toHaveBeenCalled();
  });

  it('should return 500 when storage read fails', async () => {
    fileServiceMocks.instance.getFileByteArray.mockRejectedValue(new Error('NoSuchKey'));

    const response = await GET(new Request('https://lobehub.com/f/file-id'), {
      params: Promise.resolve({ id: 'file-id' }),
    });

    expect(response.status).toBe(500);
  });
});
