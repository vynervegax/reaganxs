import { convertFileSrc } from '@tauri-apps/api/core';

type Props = {
  beforePath?: string | null;
  afterPath?: string | null;
};

export default function BeforeAfter({ beforePath, afterPath }: Props) {
  if (!beforePath && !afterPath) return null;

  let beforeSrc = '';
  let afterSrc = '';
  try {
    if (beforePath) beforeSrc = convertFileSrc(beforePath);
    if (afterPath) afterSrc = convertFileSrc(afterPath);
  } catch (e) {
    console.warn('convertFileSrc failed', e);
    return (
      <div className="backdrop-blur-2xl bg-white/5 border border-white/10 rounded-3xl p-6 text-sm text-white/50">
        Preview unavailable (path conversion failed). File was still saved on disk.
      </div>
    );
  }

  return (
    <div className="backdrop-blur-2xl bg-white/5 border border-white/10 rounded-3xl p-6">
      <h3 className="text-lg font-semibold mb-4">Before / After</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {beforeSrc ? (
          <div>
            <p className="text-xs text-white/40 mb-2">Before</p>
            <video
              src={beforeSrc}
              controls
              className="w-full rounded-xl bg-black/40 max-h-64 object-contain"
              onError={(e) => {
                (e.target as HTMLVideoElement).style.display = 'none';
              }}
            />
          </div>
        ) : null}
        {afterSrc ? (
          <div>
            <p className="text-xs text-white/40 mb-2">After</p>
            <video
              src={afterSrc}
              controls
              className="w-full rounded-xl bg-black/40 max-h-64 object-contain"
              onError={(e) => {
                (e.target as HTMLVideoElement).style.display = 'none';
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}