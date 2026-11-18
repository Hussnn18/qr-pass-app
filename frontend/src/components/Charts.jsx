import {
  Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

/** Portal palette: navy, red, green, gold, teal, violet, grey. */
export const CHART_COLORS = ['#262a7a', '#c0282d', '#1f7a4d', '#b98b2e', '#0f6f86', '#5b3f99', '#7b8190'];
const axis = { fontSize: 12, fill: '#5f6672' };
const tooltipStyle = { borderRadius: 6, border: '1px solid #d6d8dc', fontSize: 13 };

function NoData({ height }) {
  return <div className="chart-box d-grid small-2 text-muted-2" style={{ height, placeItems: 'center' }}>No data yet</div>;
}

/** Grouped bars, e.g. registered vs attended per department. keys = [[dataKey, label], …]. */
export function CompareBars({ data, keys, height = 260, layout = 'horizontal', labelWidth = 150 }) {
  if (!data?.length) return <NoData height={height} />;
  const vertical = layout === 'vertical';
  return (
    <div className="chart-box" style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} layout={layout} margin={{ top: 8, right: 12, left: vertical ? 8 : -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eceef2" horizontal={!vertical} vertical={vertical} />
          {vertical ? (
            <>
              <XAxis type="number" tick={axis} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={axis} width={labelWidth} />
            </>
          ) : (
            <>
              <XAxis dataKey="name" tick={axis} interval={0} />
              <YAxis tick={axis} allowDecimals={false} />
            </>
          )}
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(38,42,122,.06)' }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {keys.map(([k, label], i) => (
            <Bar key={k} dataKey={k} name={label} fill={CHART_COLORS[i]} radius={vertical ? [0, 3, 3, 0] : [3, 3, 0, 0]} maxBarSize={28} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** data = [{ name, value, color? }] */
export function Donut({ data, height = 260, colors = CHART_COLORS }) {
  const total = data?.reduce((a, b) => a + b.value, 0) || 0;
  if (!total) return <NoData height={height} />;
  return (
    <div className="chart-box" style={{ height }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data.filter((d) => d.value > 0)} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={2} stroke="#fff">
            {data.filter((d) => d.value > 0).map((d, i) => <Cell key={d.name} fill={d.color || colors[i % colors.length]} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [`${v} (${Math.round((v * 100) / total)}%)`, n]} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Entries per time slot (bars) and everyone inside so far (area). data = [{ name, entries, total }] */
export function EntriesTimeline({ data, height = 260 }) {
  if (!data?.length) return <NoData height={height} />;
  return (
    <div className="chart-box" style={{ height }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="entriesFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#262a7a" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#262a7a" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#eceef2" vertical={false} />
          <XAxis dataKey="name" tick={axis} minTickGap={16} />
          <YAxis tick={axis} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Area type="monotone" dataKey="total" name="Inside so far" stroke="#262a7a" fill="url(#entriesFill)" strokeWidth={2} />
          <Bar dataKey="entries" name="Entries in slot" fill="#c0282d" maxBarSize={22} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrendLines({ data, height = 260, lines }) {
  if (!data?.length) return <NoData height={height} />;
  return (
    <div className="chart-box" style={{ height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eceef2" vertical={false} />
          <XAxis dataKey="name" tick={axis} minTickGap={12} />
          <YAxis tick={axis} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {lines.map(([k, label], i) => (
            <Line key={k} type="monotone" dataKey={k} name={label} stroke={CHART_COLORS[i]} strokeWidth={2} dot={data.length < 20} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
