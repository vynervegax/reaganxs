// For Tauri / Rust side
export const nativeFFmpeg = {
  compress: async (path: string) => {
    // Call Rust command
    console.log("Native FFmpeg compress called for", path);
  }
};