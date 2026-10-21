"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";

type SceneClip = {
  title: string;
  startSeconds: number;
  endSeconds: number;
  timeLabel: string;
};

const ScenePlaybackContext = createContext<(clip: SceneClip) => void>(() => {});

export function LabScenePlayback({ videoSrc, posterSrc, children }: { videoSrc: string; posterSrc: string; children: ReactNode }) {
  const { tr } = useI18n();
  const [clip, setClip] = useState<SceneClip | null>(null);
  const [playError, setPlayError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);

  const playFromStart = useCallback((selected: SceneClip) => {
    const video = videoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_METADATA) return;
    document.querySelectorAll("video").forEach((other) => {
      if (other !== video) other.pause();
    });
    video.pause();
    video.currentTime = selected.startSeconds;
    setPlayError("");
    void video.play().catch(() => setPlayError("Press play to start this clip."));
  }, []);

  useEffect(() => {
    if (clip) playFromStart(clip);
  }, [clip, playFromStart]);

  useEffect(() => {
    if (!clip) return;
    const video = videoRef.current;
    if (!video) return;
    let frame = 0;
    const stopAtEnd = () => {
      if (video.currentTime >= clip.endSeconds - 0.02) {
        video.pause();
        video.currentTime = Math.min(clip.endSeconds, video.duration || clip.endSeconds);
        return;
      }
      if (!video.paused) frame = requestAnimationFrame(stopAtEnd);
    };
    const onPlay = () => {
      if (video.currentTime < clip.startSeconds || video.currentTime >= clip.endSeconds - 0.02) {
        video.currentTime = clip.startSeconds;
      }
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(stopAtEnd);
    };
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", stopAtEnd);
    return () => {
      cancelAnimationFrame(frame);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", stopAtEnd);
    };
  }, [clip]);

  function close() {
    videoRef.current?.pause();
    setClip(null);
    setPlayError("");
  }

  return <ScenePlaybackContext.Provider value={setClip}>
    {children}
    {clip && <aside className="lab-floating-player" aria-label={tr(`Video clip: ${clip.title}`, `影片片段：${clip.title}`)}>
      <div className="lab-floating-player-heading">
        <div><span className="detail-label">{tr("Scene preview", "片段預覽")} · {clip.timeLabel}</span><strong>{clip.title}</strong></div>
        <button type="button" className="lab-floating-close" onClick={close} aria-label={tr("Close scene video", "關閉片段影片")}>×</button>
      </div>
      <video ref={videoRef} src={videoSrc} poster={posterSrc} controls playsInline preload="metadata"
        aria-label={`${clip.title}, ${clip.timeLabel}`}
        onLoadedMetadata={() => playFromStart(clip)}
        onError={() => setPlayError("The saved video could not be loaded.")} />
      {playError && <p className="lab-floating-error" role="status">{tr(playError, playError === "Press play to start this clip." ? "請按播放以開始片段。" : "無法載入已儲存的影片。")}</p>}
    </aside>}
  </ScenePlaybackContext.Provider>;
}

export function LabScenePlayButton({ title, startSeconds, endSeconds, timeLabel }: SceneClip) {
  const { tr } = useI18n();
  const playScene = useContext(ScenePlaybackContext);
  return <button className="lab-scene-play" type="button" onClick={() => playScene({ title, startSeconds, endSeconds, timeLabel })}
    aria-label={tr(`Play ${title} scene, ${timeLabel}`, `播放片段「${title}」，${timeLabel}`)} title={tr(`Play scene ${timeLabel}`, `播放片段 ${timeLabel}`)}>
    <span aria-hidden="true">▶</span><time>{timeLabel}</time>
  </button>;
}
