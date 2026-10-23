export function LineChart({ series, labels, format = (v) => Math.round(v), height = 220 }) {
  const W = 600, H = height, P = 34;
  const max = Math.max(1, ...series.flatMap((s) => s.data));
  const x = (i) => P + (i * (W - P * 2)) / Math.max(1, labels.length - 1);
  const y = (v) => H - P - (v / max) * (H - P * 2);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line x1={P} x2={W - P} y1={y(max * t)} y2={y(max * t)} stroke="#eef0f3" />
          <text x={P - 6} y={y(max * t) + 4} fontSize="10" textAnchor="end" fill="#9ca3af">{format(max * t)}</text>
        </g>
      ))}
      {labels.map((l, i) => (i % Math.ceil(labels.length / 7) === 0 ? <text key={i} x={x(i)} y={H - 8} fontSize="10" textAnchor="middle" fill="#9ca3af">{l}</text> : null))}
      {series.map((s) => (
        <g key={s.key}>
          <polyline fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" points={s.data.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
          {s.data.map((v, i) => (v > 0 ? <circle key={i} cx={x(i)} cy={y(v)} r="2.5" fill={s.color}><title>{`${labels[i]} · ${s.label}: ${format(v)}`}</title></circle> : null))}
        </g>
      ))}
    </svg>
  );
}

export function BarChart({ data, labels, color = '#0b66ff', format = (v) => v, height = 220, labelEvery = 3 }) {
  const W = 300, H = height, P = 22;
  const max = Math.max(1, ...data);
  const bw = (W - P * 2) / data.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      <line x1={P} x2={W - P} y1={H - P} y2={H - P} stroke="#e5e7eb" />
      {data.map((v, i) => {
        const h = (v / max) * (H - P * 2);
        return (
          <g key={i}>
            <rect x={P + i * bw + 1.5} y={H - P - h} width={Math.max(1, bw - 3)} height={h} rx="2" fill={color}><title>{`${labels?.[i] ?? i}: ${format(v)}`}</title></rect>
            {i % labelEvery === 0 && <text x={P + i * bw + bw / 2} y={H - 8} fontSize="9" textAnchor="middle" fill="#9ca3af">{labels?.[i] ?? i}</text>}
          </g>
        );
      })}
    </svg>
  );
}

export function Legend({ items }) {
  return <div className="legend">{items.map((s) => <span key={s.label}><i style={{ background: s.color }} />{s.label}</span>)}</div>;
}
