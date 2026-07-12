import { ElementType, LibraryCategory, LibraryItem } from '../types';
import { createLibraryItem } from './elements';
import { fileTypeToElementType, getMediaDuration } from './media';
import { importBlob } from '../services/storage';

/**
 * Import files into the library: blob goes to IndexedDB (survives refresh),
 * an object URL is created for this session, duration is probed.
 */
export const importFiles = async (
  files: File[],
  targetCategory: LibraryCategory = 'IMAGE',
): Promise<LibraryItem[]> => {
  const items: LibraryItem[] = [];
  for (const file of files) {
    let type = fileTypeToElementType(file.type);
    let category = targetCategory;

    if (file.type === 'image/gif') {
      type = ElementType.IMAGE;
      category = 'GIF';
    } else if (targetCategory === 'OVERLAY' || targetCategory === 'GIF') {
      type = ElementType.IMAGE;
    } else {
      if (type === ElementType.VIDEO) category = 'VIDEO';
      else if (type === ElementType.AUDIO) category = 'AUDIO';
    }

    const { mediaId, url } = await importBlob(file);
    const duration = await getMediaDuration(url, type);
    items.push(
      createLibraryItem({ type, src: url, mediaId, name: file.name, category, duration }),
    );
  }
  return items;
};

/** Attach a library item to a drag event so the timeline can receive it. */
export const setDragData = (e: React.DragEvent, item: LibraryItem): void => {
  e.dataTransfer.setData('type', item.type);
  e.dataTransfer.setData('src', item.src);
  e.dataTransfer.setData('name', item.name);
  if (item.mediaId) e.dataTransfer.setData('mediaId', item.mediaId);
  if (item.duration) e.dataTransfer.setData('duration', item.duration.toString());
};
