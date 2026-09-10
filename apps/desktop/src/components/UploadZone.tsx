import { useCallback, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';

interface UploadZoneProps {
  onUpload: (filePath: string) => void;
  disabled?: boolean;
}

export default function UploadZone({ onUpload, disabled = false }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const pickFile = useCallback(async () => {
    if (disabled) return;
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: 'Video',
            extensions: ['mp4', 'mov', 'webm', 'mkv', 'avi'],
          },
        ],
      });

      if (selected && typeof selected === 'string') {
        onUpload(selected);
      }
    } catch (err) {
      console.error('Failed to open file dialog', err);
    }
  }, [onUpload, disabled]);

  return (
    <div
      onClick={pickFile}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        // Tauri file drop needs special handling; for now use dialog
        pickFile();
      }}
      className={`
        relative border-2 border-dashed rounded-2xl p-14 text-center cursor-pointer
        transition-all duration-200 glass
        ${isDragging
          ? 'border-orange-500 bg-orange-500/10'
          : 'border-white/15 hover:border-orange-500/50 hover:bg-white/5'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <div className="space-y-3">
        <div className="text-5xl">🎬</div>
        <div>
          <p className="text-xl font-medium text-white">
            {isDragging ? 'Drop your video here' : 'Select a video to process'}
          </p>
          <p className="text-sm text-zinc-400 mt-2">
            MP4, MOV, WebM, MKV · Local GPU processing
          </p>
        </div>
        <button
          type="button"
          className="mt-4 px-5 py-2 rounded-lg bg-orange-500 text-black font-medium text-sm hover:bg-orange-400 transition"
        >
          Browse files
        </button>
      </div>
    </div>
  );
}