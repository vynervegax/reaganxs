export const FFmpegUtils = {
  getSVTAV1Command: (crf = 28, preset = 6) => 
    `-c:v libsvtav1 -crf ${crf} -preset ${preset} -pix_fmt yuv420p`,
  
  getVP9Fallback: () => `-c:v libvpx-vp9 -crf 30 -b:v 0`,
};