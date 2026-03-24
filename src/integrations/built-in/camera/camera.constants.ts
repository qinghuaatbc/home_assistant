export const DOMAIN_CAMERA = 'camera';

export const STATE_IDLE       = 'idle';
export const STATE_STREAMING  = 'streaming';

/** FFmpeg output frame-rate for MJPEG stream */
export const FFMPEG_FPS = 10;

/** Milliseconds to wait before restarting a failed FFmpeg process */
export const FFMPEG_RESTART_DELAY = 5000;

/** Milliseconds of inactivity before stopping an on-demand stream */
export const STREAM_IDLE_TIMEOUT = 30000;
