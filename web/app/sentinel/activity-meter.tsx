import { activitySeries } from "./model";
import type { ProtocolCheck } from "./model";

export function ActivityMeter({ checks, now, unavailable }: { checks: ProtocolCheck[]; now: number; unavailable: boolean }) {
  const points = activitySeries(checks, now);
  const value = unavailable ? null : points.at(-1)?.value ?? null;
  const start = Math.min(now - 30 * 60_000, points[0]?.time ?? now);
  const x = (time: number) => 36 + 724 * (time - start) / (now - start);
  const y = (amount: number) => 155 - amount * 25;
  const paths: string[] = [];
  let segment = "";
  for (const point of points) {
    if (point.value === null) { if (segment) paths.push(segment); segment = ""; continue; }
    segment += `${segment ? " L" : "M"}${x(point.time).toFixed(1)},${y(point.value).toFixed(1)}`;
  }
  if (segment) paths.push(segment);
  return <section className="sentinel-card sentinel-activity" aria-labelledby="activity-title">
    <div className="sentinel-monitor-heading"><div><p className="sentinel-eyebrow">LIVE GAMEPLAY ACTIVITY</p><h2 id="activity-title">VMH activity</h2></div><div className="sentinel-activity-value" role="status"><strong>{value === null ? "—" : value.toFixed(2)}</strong><span>{value === null ? "Unavailable" : value === 0 ? "Idle · VMH" : "Activity · VMH"}</span></div></div>
    <div className="sentinel-gauge" role="meter" aria-label="Gameplay activity VMH" aria-valuemin={0} aria-valuemax={5} aria-valuenow={value ?? undefined} aria-valuetext={value === null ? "Unavailable" : `${value.toFixed(2)} out of 5 VMH`}><span style={{ width: `${(value ?? 0) * 20}%` }} /></div>
    <svg viewBox="0 0 780 190" className="sentinel-activity-chart" role="img" aria-label="Recorded VMH activity history. Gaps mean unavailable data.">
      {[0, 2.5, 5].map((amount) => <g key={amount}><line x1="36" x2="760" y1={y(amount)} y2={y(amount)} stroke="#244057"/><text x="8" y={y(amount) + 4} fill="#93afc6" fontSize="12">{amount}</text></g>)}
      {paths.map((path, index) => <path key={index} d={path} fill="none" stroke="#70deed" strokeWidth="2.5" />)}
      {points.filter((point) => point.value !== null).map((point) => <circle key={point.time} cx={x(point.time)} cy={y(point.value!)} r="2" fill="#a2f4ff" />)}
      <text x="36" y="183" fill="#93afc6" fontSize="12">{new Date(start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</text><text x="760" y="183" textAnchor="end" fill="#93afc6" fontSize="12">Now</text>
    </svg>
    <p className="sentinel-caption">Shared protocol activity, on a 0–5 scale. Confirmed manual and autoplay entries raise the meter; a two-minute grace period bridges quiet gaps. Missing readings leave gaps in the chart.</p>
    <details><summary>How the meter works</summary><p>For an open round, the index is the square root of its confirmed entry count, capped at 5. After observed play stops, it eases to zero over two minutes. Checks run approximately once a minute, so very short rounds may fall between observations. This visual index does not change your fixed reward weight or rewards.</p></details>
  </section>;
}
