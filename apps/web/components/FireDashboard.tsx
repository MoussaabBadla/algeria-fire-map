"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import useSWR from "swr";
import { fetchFires, fetchRisk, firesKey, riskKey, type FireCollection, type FireFeature, type RiskData, type RiskWilaya, type SelectedFire } from "@/lib/api";
import { durationFor, passesFilter, withinAge, type DurationKey } from "@/lib/fire";
import { rankWilayas, type WilayaCount } from "@/lib/wilayaAssign";
import type { MapStyleKey } from "@/lib/mapStyles";
import { useIsMobile } from "@/lib/useIsMobile";
import TopBar from "./TopBar";
import Legend from "./Legend";
import FireDetailPanel from "./FireDetailPanel";
import WilayaRanking from "./WilayaRanking";
import TimelineScrubber from "./TimelineScrubber";
import RiskLegend from "./RiskLegend";
import RiskPanel from "./RiskPanel";
import LatestFires from "./LatestFires";

const FireMap = dynamic(() => import("./FireMap"), {
  ssr: false,
  loading: () => (
    <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "var(--text-muted)", fontSize: 14 }}>
      Loading map…
    </div>
  ),
});

const HISTORY_DAYS = 5; // FIRMS Area API caps the look-back at 5 days
const HISTORY_SPAN = HISTORY_DAYS * 24 * 3600 * 1000;
const HISTORY_WINDOW = 12 * 3600 * 1000; // rolling window shown at the cursor
const PLAYBACK_STEPS = 150;
const PLAYBACK_TICK = 80;

type Focus = { lng: number; lat: number; zoom: number; nonce: number } | null;

export default function FireDashboard() {
  const isMobile = useIsMobile();
  const [duration, setDuration] = useState<DurationKey>("24h");
  const [styleKey, setStyleKey] = useState<MapStyleKey>("dark");
  const [selected, setSelected] = useState<SelectedFire | null>(null);
  const [focus, setFocus] = useState<Focus>(null);
  const focusNonce = useRef(0);

  const [rankingOpen, setRankingOpen] = useState(false);
  const [latestOpen, setLatestOpen] = useState(false);
  const [showRisk, setShowRisk] = useState(false);
  const [historyMode, setHistoryMode] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const needInit = useRef(false);

  const dur = durationFor(duration);

  const { data: liveData, error, isLoading } = useSWR<FireCollection>(firesKey(dur.apiDays), fetchFires, {
    refreshInterval: 5 * 60 * 1000,
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
  const { data: historyData } = useSWR<FireCollection>(historyMode ? firesKey(HISTORY_DAYS) : null, fetchFires, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
  const { data: riskData } = useSWR<RiskData>(showRisk ? riskKey() : null, fetchRisk, {
    refreshInterval: 30 * 60 * 1000,
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  // 7-day confirmed fires (for the timeline histogram).
  const historyConfirmed = useMemo(
    () => (historyData ? historyData.features.filter((f) => passesFilter(f.properties, "confirmed")) : []),
    [historyData]
  );

  // Timeline range comes from the actual detection times (satellite data lags
  // wall-clock, so "now" is often empty). Cursor starts at the latest detection.
  const { minTime, maxTime } = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const f of historyConfirmed) {
      const iso = f.properties.acq_datetime;
      if (!iso) continue;
      const t = new Date(iso).getTime();
      if (t < lo) lo = t;
      if (t > hi) hi = t;
    }
    if (!isFinite(lo)) return { minTime: Date.now() - HISTORY_SPAN, maxTime: Date.now() };
    return { minTime: lo, maxTime: hi };
  }, [historyConfirmed]);

  // Initialise the cursor to the latest detection once history data arrives.
  useEffect(() => {
    if (historyMode && needInit.current && historyConfirmed.length) {
      needInit.current = false;
      setCursor(maxTime);
    }
  }, [historyMode, historyConfirmed.length, maxTime]);

  // Currently displayed fires: history window or live recency.
  const displayed = useMemo<FireCollection | undefined>(() => {
    if (historyMode) {
      if (!historyData) return undefined;
      const winStart = cursor - HISTORY_WINDOW;
      const features = historyConfirmed.filter((f) => {
        const iso = f.properties.acq_datetime;
        if (!iso) return false;
        const t = new Date(iso).getTime();
        return t <= cursor && t >= winStart;
      });
      return { ...historyData, features, properties: { ...historyData.properties, count: features.length } };
    }
    if (!liveData) return liveData;
    const confirmed = liveData.features.filter((f) => passesFilter(f.properties, "confirmed"));
    let features;
    if (duration === "live") {
      // Satellite data lags wall-clock, so "Live" = the freshest available data:
      // detections within the window of the LATEST detection (never empty when data exists).
      let latest = 0;
      for (const f of confirmed) {
        const iso = f.properties.acq_datetime;
        if (iso) latest = Math.max(latest, Date.parse(iso));
      }
      const cutoff = latest - dur.maxAgeHours * 3_600_000;
      features = confirmed.filter((f) => {
        const iso = f.properties.acq_datetime;
        return iso ? Date.parse(iso) >= cutoff : false;
      });
    } else {
      features = confirmed.filter((f) => withinAge(f.properties.acq_datetime, dur.maxAgeHours));
    }
    return { ...liveData, features, properties: { ...liveData.properties, count: features.length } };
  }, [historyMode, historyData, historyConfirmed, cursor, liveData, dur.maxAgeHours, duration]);

  const ranking = useMemo(() => rankWilayas(displayed?.features ?? []), [displayed]);

  // 3 most recent detections (newest first).
  const latest = useMemo<FireFeature[]>(() => {
    const feats = displayed?.features ?? [];
    return [...feats]
      .sort((a, b) => {
        const ta = a.properties.acq_datetime ? Date.parse(a.properties.acq_datetime) : 0;
        const tb = b.properties.acq_datetime ? Date.parse(b.properties.acq_datetime) : 0;
        return tb - ta;
      })
      .slice(0, 3);
  }, [displayed]);

  const selectFire = (f: SelectedFire) => {
    setSelected(f);
    setLatestOpen(false);
    setRankingOpen(false);
  };

  // Playback loop.
  useEffect(() => {
    if (!playing || !historyMode) return;
    const step = (maxTime - minTime) / PLAYBACK_STEPS;
    const id = setInterval(() => {
      setCursor((c) => {
        const n = c + step;
        if (n >= maxTime) {
          setPlaying(false);
          return maxTime;
        }
        return n;
      });
    }, PLAYBACK_TICK);
    return () => clearInterval(id);
  }, [playing, historyMode, minTime, maxTime]);

  const flyTo = (lng: number, lat: number, zoom: number) => {
    focusNonce.current += 1;
    setFocus({ lng, lat, zoom, nonce: focusNonce.current });
  };

  const selectWilaya = (w: WilayaCount) => {
    flyTo(w.lng, w.lat, 8.2);
    setRankingOpen(false);
  };

  const selectRiskWilaya = (w: RiskWilaya) => {
    flyTo(w.lng, w.lat, 8.2);
    setRankingOpen(false);
  };

  const enterHistory = () => {
    needInit.current = true;
    setHistoryMode(true);
    setPlaying(false);
    setRankingOpen(false);
    setSelected(null);
  };

  const exitHistory = () => {
    setHistoryMode(false);
    setPlaying(false);
  };

  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
    } else {
      if (cursor >= maxTime - 1000) setCursor(minTime);
      setPlaying(true);
    }
  };

  return (
    <main style={{ position: "fixed", inset: 0, background: "var(--bg)" }}>
      <FireMap data={displayed} selected={selected} onSelect={setSelected} styleKey={styleKey} isMobile={isMobile} focus={focus} riskData={riskData} showRisk={showRisk} />

      <TopBar
        isMobile={isMobile}
        styleKey={styleKey}
        onStyleChange={setStyleKey}
        duration={duration}
        onDurationChange={(d) => {
          setDuration(d);
          setSelected(null);
        }}
        shownCount={displayed?.features.length ?? 0}
        totalCount={liveData?.properties.count ?? 0}
        generatedAt={liveData?.properties.generated_at}
        loading={isLoading}
        error={error ? String(error.message ?? error) : undefined}
        historyMode={historyMode}
        onEnterHistory={enterHistory}
        onToggleRanking={() => {
          setRankingOpen((v) => !v);
          setLatestOpen(false);
        }}
        onToggleLatest={() => {
          setLatestOpen((v) => !v);
          setRankingOpen(false);
        }}
        showRisk={showRisk}
        onToggleRisk={() => setShowRisk((v) => !v)}
      />

      {!isMobile && (showRisk ? <RiskLegend /> : <Legend />)}

      {!isMobile && !historyMode && <LatestFires fires={latest} onSelect={selectFire} isMobile={false} />}
      {isMobile && latestOpen && <LatestFires fires={latest} onSelect={selectFire} isMobile onClose={() => setLatestOpen(false)} />}

      {!isMobile && !selected && !historyMode &&
        (showRisk ? (
          <RiskPanel items={riskData?.wilayas ?? []} onSelect={selectRiskWilaya} isMobile={false} />
        ) : (
          <WilayaRanking items={ranking} onSelect={selectWilaya} isMobile={false} />
        ))}
      {isMobile && rankingOpen &&
        (showRisk ? (
          <RiskPanel items={riskData?.wilayas ?? []} onSelect={selectRiskWilaya} isMobile onClose={() => setRankingOpen(false)} />
        ) : (
          <WilayaRanking items={ranking} onSelect={selectWilaya} isMobile onClose={() => setRankingOpen(false)} />
        ))}

      {historyMode && historyData && (
        <TimelineScrubber
          features={historyConfirmed}
          minTime={minTime}
          maxTime={maxTime}
          cursor={cursor}
          shownCount={displayed?.features.length ?? 0}
          playing={playing}
          onCursor={(t) => {
            setPlaying(false);
            setCursor(t);
          }}
          onPlayToggle={togglePlay}
          onExit={exitHistory}
          isMobile={isMobile}
        />
      )}

      {selected && <FireDetailPanel fire={selected} onClose={() => setSelected(null)} isMobile={isMobile} />}
    </main>
  );
}
