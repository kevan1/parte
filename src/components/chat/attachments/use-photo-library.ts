import {
  AssetField,
  MediaType,
  Query,
  usePermissions,
  type PermissionResponse,
} from 'expo-media-library';
import { useCallback, useEffect, useState } from 'react';
import type { LocalEvidenceAttachment } from '@/domain/types';
import { GRID } from './constants';

export type LibraryPhoto = LocalEvidenceAttachment;

export type LibraryStatus = 'loading' | 'denied' | 'empty' | 'ready';

export interface PhotoLibrary {
  photos: LibraryPhoto[];
  status: LibraryStatus;
}

function isReadable(permission: PermissionResponse | null) {
  return !!permission && (permission.granted || permission.accessPrivileges === 'limited');
}

/**
 * The most recent photos from the device library, newest first.
 *
 * `exeForMetadata()` is deliberate: it reads straight from the media store
 * without resolving file paths, so a full page comes back in one call. The id
 * it returns is already a loadable uri, which is why there is no per-asset
 * `getUri()` round trip here.
 */
export function usePhotoLibrary(): PhotoLibrary {
  const [permission, requestPermission] = usePermissions({ granularPermissions: ['photo'] });
  const [photos, setPhotos] = useState<LibraryPhoto[]>([]);
  const [status, setStatus] = useState<LibraryStatus>('loading');

  const load = useCallback(async () => {
    try {
      const assets = await new Query()
        .eq(AssetField.MEDIA_TYPE, MediaType.IMAGE)
        .orderBy({ key: AssetField.CREATION_TIME, ascending: false })
        .limit(GRID.pageSize)
        .exeForMetadata();

      setPhotos(
        assets.map((asset) => ({
          id: asset.id,
          fileName: asset.filename,
          width: asset.width,
          height: asset.height,
          creationTime: asset.creationTime,
        })),
      );
      setStatus(assets.length ? 'ready' : 'empty');
    } catch {
      setStatus('denied');
    }
  }, []);

  // Ask once on mount — the grid has nothing to show without it.
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  useEffect(() => {
    if (!permission) return;
    if (isReadable(permission)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      load();
    } else if (!permission.canAskAgain) {
      setStatus('denied');
    }
  }, [permission, load]);

  return { photos, status };
}
