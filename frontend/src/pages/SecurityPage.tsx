import { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import Hls from 'hls.js';
import { useHa } from '../context/HaContext';

interface StreamInfo {
  name: string;
  source: 'integration' | 'manual';
  entityId?: string;
  hlsUrl?: string;
}

type TileState = 'idle' | 'connecting' | 'playing' | 'error';
type StreamMode = 'whep' | 'hls';

// ── WHEP player — real WebRTC via RTCPeerConnection ───────────────────────────
// Works on all browsers: Chrome, Firefox, Safari (iOS + macOS + Windows)

function useWhepPlayer(
  videoRef: React.RefObject<HTMLVideoElement>,
  streamName: string,
  active: boolean,
) {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [state, setState] = useState<TileState>('idle');
  const [error, setError] = useState<string>();

  const disconnect = useCallback(() => {
    const owned = !!pcRef.current;
    pcRef.current?.close(); pcRef.current = null;
    if (owned && videoRef.current) videoRef.current.srcObject = null;
    setState('idle'); setError(undefined);
  }, [videoRef]);

  const connect = useCallback(async () => {
    if (pcRef.current) return;
    setState('connecting'); setError(undefined);
    try {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      pcRef.current = pc;

      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });

      pc.ontrack = e => {
        if (!e.streams[0] || !videoRef.current) return;
        videoRef.current.srcObject = e.streams[0];
        videoRef.current.play().catch(() => {});
        setState('playing');
      };

      pc.oniceconnectionstatechange = () => {
        const s = pc.iceConnectionState;
        if (s === 'failed' || s === 'disconnected') { setState('error'); setError('ICE failed — try HLS'); }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const res = await fetch(`/go2rtc/api/webrtc?src=${encodeURIComponent(streamName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: offer.sdp,
      });
      if (!res.ok) throw new Error(`WHEP ${res.status}`);
      if (!pcRef.current) return;
      await pc.setRemoteDescription({ type: 'answer', sdp: await res.text() });
    } catch (e) {
      pcRef.current?.close(); pcRef.current = null;
      setState('error'); setError((e as Error).message);
    }
  }, [streamName, videoRef]);

  useEffect(() => {
    if (active) connect(); else disconnect();
    return () => disconnect();
  }, [active]); // eslint-disable-line

  return { state, error, retry: () => { disconnect(); setTimeout(connect, 400); } };
}

// ── HLS player ────────────────────────────────────────────────────────────────

function useHlsPlayer(
  videoRef: React.RefObject<HTMLVideoElement>,
  hlsUrl: string | undefined,
  active: boolean,
) {
  const hlsRef = useRef<Hls | null>(null);
  const [state, setState] = useState<TileState>('idle');
  const [error, setError] = useState<string>();

  const disconnect = useCallback(() => {
    const owned = !!hlsRef.current;
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    if (owned && videoRef.current) { videoRef.current.src = ''; }
    setState('idle'); setError(undefined);
  }, [videoRef]);

  const connect = useCallback(() => {
    if (!hlsUrl || !videoRef.current) return;
    setState('connecting'); setError(undefined);
    if (Hls.isSupported()) {
      const hls = new Hls({ lowLatencyMode: false, liveSyncDurationCount: 2, liveMaxLatencyDurationCount: 4, maxBufferLength: 4, maxMaxBufferLength: 8, backBufferLength: 1, manifestLoadingMaxRetry: 6, manifestLoadingRetryDelay: 2000, levelLoadingMaxRetry: 6, levelLoadingRetryDelay: 2000, fragLoadingMaxRetry: 6, fragLoadingRetryDelay: 2000 });
      hlsRef.current = hls;
      hls.loadSource(hlsUrl);
      hls.attachMedia(videoRef.current);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { videoRef.current?.play().catch(() => {}); setState('playing'); });
      hls.on(Hls.Events.ERROR, (_, d) => {
        if (d.fatal) { setState('error'); setError(d.details ?? d.type); }
      });
    } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      videoRef.current.src = hlsUrl;
      videoRef.current.play().catch(() => {});
      setState('playing');
    } else {
      setState('error'); setError('HLS not supported');
    }
  }, [hlsUrl, videoRef]);

  useEffect(() => {
    if (active) connect(); else disconnect();
    return () => disconnect();
  }, [active]); // eslint-disable-line

  return { state, error, retry: () => { disconnect(); setTimeout(connect, 400); } };
}

// ── Unified camera tile ───────────────────────────────────────────────────────

function CameraTile({ stream }: { stream: StreamInfo }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mode, setMode] = useState<StreamMode>('hls');
  const [active, setActive] = useState(true);
  const [muted, setMuted] = useState(true);

  const hlsUrl = useMemo(() => `/hls/${stream.name}/index.m3u8`, [stream.name]);

  const whep = useWhepPlayer(videoRef, stream.name, active && mode === 'whep');
  const hls = useHlsPlayer(videoRef, hlsUrl, active && mode === 'hls');
  const { state, error, retry } = mode === 'whep' ? whep : hls;

  const switchMode = useCallback((m: StreamMode) => {
    setActive(false);
    setTimeout(() => { setMode(m); setActive(true); }, 300);
  }, []);

  const label = stream.entityId
    ? stream.entityId.replace(/^camera\.(rtsp2hls|rtsp2webrtc)_/, '').replace(/_/g, ' ')
    : stream.name.replace(/_/g, ' ');

  const toggleFullscreen = () => {
    const el = videoRef.current;
    if (!el) return;
    if (!document.fullscreenElement) el.requestFullscreen().catch(() => {});
    else document.exitFullscreen();
  };

  return (
    <div style={{ background: '#111', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', position: 'relative', minHeight: 0 }}>
      <video ref={videoRef} autoPlay muted={muted} playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />

      {state !== 'playing' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.82)', gap: 10 }}>
          {state === 'connecting' && (
            <>
              <div style={{ width: 32, height: 32, border: '3px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <span style={{ color: '#aaa', fontSize: 13 }}>{mode === 'whep' ? 'WebRTC connecting…' : 'HLS loading…'}</span>
            </>
          )}
          {state === 'error' && (
            <>
              <span style={{ fontSize: 26 }}>⚠️</span>
              <span style={{ color: '#f66', fontSize: 12, textAlign: 'center', padding: '0 16px', maxWidth: 200 }}>{error}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={retry} style={{ padding: '4px 12px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>Retry</button>
                {mode === 'whep' && (
                  <button onClick={() => switchMode('hls')} style={{ padding: '4px 12px', background: '#444', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>Use HLS</button>
                )}
              </div>
            </>
          )}
          {state === 'idle' && (
            <div style={{ width: 32, height: 32, border: '3px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          )}
        </div>
      )}

      {/* Bottom controls */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent,rgba(0,0,0,0.72))', padding: '18px 10px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {state === 'playing' && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4f4', display: 'inline-block' }} />}
          <span style={{ color: '#fff', fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>{label}</span>
        </div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          <button
            onClick={() => switchMode(mode === 'whep' ? 'hls' : 'whep')}
            style={{ background: mode === 'whep' ? 'rgba(0,122,255,0.6)' : 'rgba(100,100,100,0.5)', border: 'none', color: '#fff', borderRadius: 5, padding: '2px 6px', cursor: 'pointer', fontSize: 10, fontWeight: 700 }}>
            {mode === 'whep' ? 'RTC' : 'HLS'}
          </button>
          <button onClick={() => setMuted(m => !m)} style={{ background: 'rgba(0,0,0,0.4)', border: 'none', color: '#fff', borderRadius: 5, padding: '2px 6px', cursor: 'pointer', fontSize: 13 }}>{muted ? '🔇' : '🔊'}</button>
          <button onClick={toggleFullscreen} style={{ background: 'rgba(0,0,0,0.4)', border: 'none', color: '#fff', borderRadius: 5, padding: '2px 6px', cursor: 'pointer', fontSize: 13 }}>⛶</button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SecurityPage() {
  const { token } = useHa();
  const [streams, setStreams] = useState<StreamInfo[]>([]);
  const [cols, setCols] = useState(2);
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addUrl, setAddUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  const headers = useCallback(() =>
    token ? { Authorization: `Bearer ${token}` } : {} as Record<string, string>
  , [token]);

  const fetchStreams = useCallback(async () => {
    try {
      const res = await fetch('/api/webrtc/streams', { headers: headers() });
      if (res.ok) setStreams(await res.json());
    } catch {}
  }, [headers]);

  useEffect(() => { fetchStreams(); }, [fetchStreams]);

  const handleAdd = async () => {
    if (!addName.trim() || !addUrl.trim()) { setAddError('Name and URL required'); return; }
    const u = addUrl.trim();
    if (!u.startsWith('rtsp://') && !u.startsWith('http://') && !u.startsWith('https://')) {
      setAddError('URL must start with rtsp://, http://, or https://'); return;
    }
    setAdding(true); setAddError('');
    try {
      const res = await fetch('/api/webrtc/streams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({ name: addName.trim(), rtsp_url: addUrl.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      setAddName(''); setAddUrl(''); setShowAdd(false);
      fetchStreams();
    } catch (err) { setAddError((err as Error).message); }
    finally { setAdding(false); }
  };

  const handleRemove = async (name: string) => {
    await fetch(`/api/webrtc/streams/${encodeURIComponent(name)}`, { method: 'DELETE', headers: headers() });
    fetchStreams();
  };

  const inp: React.CSSProperties = {
    background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6,
    color: 'var(--text)', padding: '8px 12px', fontSize: 14, width: '100%', boxSizing: 'border-box',
  };

  const rows = Math.ceil(streams.length / cols);

  return (
    <div style={{ padding: 16, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10, flexShrink: 0 }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--text)' }}>Security Cameras</h2>
          <p style={{ margin: '2px 0 0', color: 'var(--muted)', fontSize: 13 }}>Add RTSP or HLS streams via Config → Integrations (rtsp2webrtc) or manually below</p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {[1, 2, 3].map(n => (
            <button key={n} onClick={() => setCols(n)} style={{
              padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)',
              background: cols === n ? 'var(--accent)' : 'var(--surface)',
              color: cols === n ? '#fff' : 'var(--text)', cursor: 'pointer', fontSize: 13,
            }}>{n}col</button>
          ))}
          <button onClick={() => setShowAdd(v => !v)} style={{
            padding: '6px 14px', borderRadius: 6, border: 'none',
            background: showAdd ? 'var(--surface)' : 'var(--accent)',
            color: showAdd ? 'var(--text)' : '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600,
          }}>{showAdd ? '✕' : '+ Add'}</button>
        </div>
      </div>

      {/* Add stream */}
      {showAdd && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 12, flexShrink: 0 }}>
          <h3 style={{ margin: '0 0 12px', color: 'var(--text)', fontSize: 15 }}>Add Stream (manual)</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ color: 'var(--muted)', fontSize: 12, display: 'block', marginBottom: 4 }}>Name</label>
              <input style={inp} placeholder="front_door" value={addName} onChange={e => setAddName(e.target.value)} />
            </div>
            <div>
              <label style={{ color: 'var(--muted)', fontSize: 12, display: 'block', marginBottom: 4 }}>Source URL (RTSP or HLS)</label>
              <input style={inp} placeholder="rtsp://user:pass@host/stream  or  https://host/stream.m3u8" value={addUrl} onChange={e => setAddUrl(e.target.value)} />
            </div>
          </div>
          {addError && <p style={{ color: '#f66', fontSize: 13, margin: '0 0 10px' }}>{addError}</p>}
          <button onClick={handleAdd} disabled={adding} style={{
            padding: '7px 20px', background: 'var(--accent)', color: '#fff', border: 'none',
            borderRadius: 6, cursor: adding ? 'not-allowed' : 'pointer', opacity: adding ? 0.6 : 1, fontSize: 14,
          }}>{adding ? 'Adding…' : 'Add'}</button>
        </div>
      )}

      {/* Manual stream chips */}
      {streams.filter(s => s.source === 'manual').length > 0 && (
        <div style={{ marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 8, flexShrink: 0 }}>
          {streams.filter(s => s.source === 'manual').map(s => (
            <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px' }}>
              <span style={{ color: 'var(--muted)', fontSize: 11 }}>manual</span>
              <span style={{ color: 'var(--text)', fontSize: 13 }}>{s.name}</span>
              <button onClick={() => handleRemove(s.name)} style={{ background: 'none', border: 'none', color: '#f66', cursor: 'pointer', fontSize: 14, padding: 0 }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Camera grid */}
      {streams.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📷</div>
          <p style={{ margin: 0 }}>No streams configured.</p>
          <p style={{ margin: '4px 0 0', fontSize: 13 }}>Add cameras via Config → Integrations (rtsp2webrtc), or click + Add above.</p>
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)`, gap: 10 }}>
          {streams.map(s => <CameraTile key={s.name} stream={s} />)}
        </div>
      )}
    </div>
  );
}
