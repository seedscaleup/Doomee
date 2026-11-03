'use client';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export function RateChart({ data, height = 200, label }: { data: { label: string; rate: number | null }[]; height?: number; label: string }) {
  const rows = data.map((d) => ({ ...d, value: d.rate ?? 0 }));
  const summary = data.map((d) => `${d.label} : ${d.rate == null ? '—' : d.rate + ' %'}`).join(', ');
  return (
    <div role="img" aria-label={`${label}. ${summary}`} style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 18, right: 4, left: -24, bottom: 0 }}>
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fontWeight: 700, fill: '#5F6368' }} />
          <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#5F6368' }} width={40} />
          <Tooltip cursor={{ fill: '#F5F5F2' }} formatter={(_v, _n, p) => [p.payload.rate == null ? '—' : `${p.payload.rate} %`, label]} />
          <Bar dataKey="value" radius={[8, 8, 8, 8]} label={{ position: 'top', fontSize: 11, fontWeight: 800, fill: '#202124', formatter: (v: number) => (v ? `${v}` : '') }}>
            {rows.map((r, i) => (
              <Cell key={i} fill={i === rows.length - 1 ? '#FFD43B' : r.rate == null ? '#ECECE7' : '#202124'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
