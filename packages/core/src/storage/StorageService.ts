export class StorageService {
  async upload(buffer: ArrayBuffer, isLocal = false) {
    if (isLocal) {
      // Desktop local save
      return { url: 'local://processed-video.mp4' };
    }
    // Cloud R2 upload logic
    return { url: `https://r2.reaganxs.com/temp/${Date.now()}.mp4` };
  }
}