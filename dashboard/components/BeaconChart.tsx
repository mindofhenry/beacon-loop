'use client'

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from 'recharts'

export type ChartSpec = {
  type: 'bar' | 'line' | 'table'
  data: Record<string, unknown>[]
  title: string
  xLabel?: string
  yLabel?: string
}

const COLORS = ['#2563EB', '#16A34A', '#F59E0B', '#7C3AED', '#DC2626', '#0891B2', '#DB2777']

const tooltipStyle = {
  contentStyle: {
    background: '#FFFFFF',
    border: '2px solid #1A1A1A',
    borderRadius: '6px',
    fontSize: '13px',
    fontFamily: "'JetBrains Mono', monospace",
    color: '#525252',
  },
  itemStyle: { color: '#525252' },
  labelStyle: { color: '#737373' },
}

function inferKeys(data: Record<string, unknown>[]): { nameKey: string; valueKeys: string[] } {
  if (!data.length) return { nameKey: 'name', valueKeys: [] }
  const keys = Object.keys(data[0])
  // First string-valued key is the name/category key
  const nameKey = keys.find((k) => typeof data[0][k] === 'string') ?? keys[0]
  const valueKeys = keys.filter((k) => k !== nameKey && typeof data[0][k] === 'number')
  return { nameKey, valueKeys }
}

function BarChartRenderer({ spec }: { spec: ChartSpec }) {
  const { nameKey, valueKeys } = inferKeys(spec.data)
  const horizontal = spec.data.length > 6

  if (horizontal) {
    return (
      <ResponsiveContainer width="100%" height={Math.max(250, spec.data.length * 36)}>
        <BarChart data={spec.data} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" horizontal={false} />
          <YAxis
            dataKey={nameKey}
            type="category"
            tick={{ fill: '#525252', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}
            width={120}
            axisLine={false}
            tickLine={false}
          />
          <XAxis
            type="number"
            tick={{ fill: '#737373', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}
            axisLine={false}
            tickLine={false}
            label={spec.xLabel ? { value: spec.xLabel, position: 'insideBottom', fill: '#737373', fontSize: 11, dy: 10 } : undefined}
          />
          <Tooltip {...tooltipStyle} />
          {valueKeys.map((key, i) => (
            <Bar key={key} dataKey={key} radius={[0, 3, 3, 0]} maxBarSize={24}>
              {spec.data.map((_, idx) => (
                <Cell key={idx} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={spec.data} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" />
        <XAxis
          dataKey={nameKey}
          tick={{ fill: '#525252', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}
          axisLine={false}
          tickLine={false}
          label={spec.xLabel ? { value: spec.xLabel, position: 'insideBottom', fill: '#737373', fontSize: 11, dy: 10 } : undefined}
        />
        <YAxis
          tick={{ fill: '#737373', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}
          axisLine={false}
          tickLine={false}
          label={spec.yLabel ? { value: spec.yLabel, position: 'insideLeft', angle: -90, fill: '#737373', fontSize: 11 } : undefined}
        />
        <Tooltip {...tooltipStyle} />
        {valueKeys.map((key, i) => (
          <Bar key={key} dataKey={key} radius={[3, 3, 0, 0]} maxBarSize={40}>
            {spec.data.map((_, idx) => (
              <Cell key={idx} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

function LineChartRenderer({ spec }: { spec: ChartSpec }) {
  const keys = spec.data.length ? Object.keys(spec.data[0]) : []
  const xKey = keys.find((k) => k === 'x') ?? keys[0] ?? 'x'
  const yKeys = keys.filter((k) => k !== xKey && typeof spec.data[0]?.[k] === 'number')

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={spec.data} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" />
        <XAxis
          dataKey={xKey}
          tick={{ fill: '#525252', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}
          axisLine={false}
          tickLine={false}
          label={spec.xLabel ? { value: spec.xLabel, position: 'insideBottom', fill: '#737373', fontSize: 11, dy: 10 } : undefined}
        />
        <YAxis
          tick={{ fill: '#737373', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}
          axisLine={false}
          tickLine={false}
          label={spec.yLabel ? { value: spec.yLabel, position: 'insideLeft', angle: -90, fill: '#737373', fontSize: 11 } : undefined}
        />
        <Tooltip {...tooltipStyle} />
        {yKeys.map((key, i) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3, fill: COLORS[i % COLORS.length] }}
            activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

function TableRenderer({ spec }: { spec: ChartSpec }) {
  if (!spec.data.length) return <p className="font-mono text-[13px] text-[#737373]">No data</p>
  const columns = Object.keys(spec.data[0])

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                className="font-mono text-[11px] uppercase"
                style={{
                  textAlign: 'left',
                  padding: '8px 12px',
                  borderBottom: '2px solid #1A1A1A',
                  color: '#737373',
                  letterSpacing: '0.06em',
                }}
              >
                {col.replace(/_/g, ' ')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {spec.data.map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #E5E5E5' }}>
              {columns.map((col) => (
                <td
                  key={col}
                  className="font-mono text-[13px]"
                  style={{ padding: '8px 12px', color: '#525252' }}
                >
                  {String(row[col] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function BeaconChart({ spec }: { spec: ChartSpec }) {
  if (!spec || !spec.data || !Array.isArray(spec.data)) {
    return (
      <p className="font-mono text-[13px] text-[#737373] py-2">
        Unable to render chart — invalid specification.
      </p>
    )
  }

  return (
    <div
      style={{
        background: '#FFFFFF',
        border: '2px solid #1A1A1A',
        borderRadius: '8px',
        padding: '16px',
        marginTop: '12px',
      }}
    >
      {spec.title && (
        <h4
          className="font-sans text-[15px] font-medium"
          style={{ color: '#1A1A1A', marginBottom: '12px' }}
        >
          {spec.title}
        </h4>
      )}
      {spec.type === 'bar' && <BarChartRenderer spec={spec} />}
      {spec.type === 'line' && <LineChartRenderer spec={spec} />}
      {spec.type === 'table' && <TableRenderer spec={spec} />}
      {!['bar', 'line', 'table'].includes(spec.type) && (
        <p className="font-mono text-[13px] text-[#737373]">
          Unsupported chart type: {spec.type}
        </p>
      )}
    </div>
  )
}
