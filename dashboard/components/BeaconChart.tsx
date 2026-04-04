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

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899']

const tooltipStyle = {
  contentStyle: {
    background: '#141414',
    border: '1px solid #252525',
    borderRadius: '6px',
    fontSize: '13px',
    fontFamily: "'Fira Code', monospace",
    color: '#aaa',
  },
  itemStyle: { color: '#aaa' },
  labelStyle: { color: '#555' },
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
          <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1c" horizontal={false} />
          <YAxis
            dataKey={nameKey}
            type="category"
            tick={{ fill: '#aaa', fontSize: 12, fontFamily: "'Fira Code', monospace" }}
            width={120}
            axisLine={false}
            tickLine={false}
          />
          <XAxis
            type="number"
            tick={{ fill: '#555', fontSize: 11, fontFamily: "'Fira Code', monospace" }}
            axisLine={false}
            tickLine={false}
            label={spec.xLabel ? { value: spec.xLabel, position: 'insideBottom', fill: '#555', fontSize: 11, dy: 10 } : undefined}
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
        <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1c" />
        <XAxis
          dataKey={nameKey}
          tick={{ fill: '#aaa', fontSize: 12, fontFamily: "'Fira Code', monospace" }}
          axisLine={false}
          tickLine={false}
          label={spec.xLabel ? { value: spec.xLabel, position: 'insideBottom', fill: '#555', fontSize: 11, dy: 10 } : undefined}
        />
        <YAxis
          tick={{ fill: '#555', fontSize: 11, fontFamily: "'Fira Code', monospace" }}
          axisLine={false}
          tickLine={false}
          label={spec.yLabel ? { value: spec.yLabel, position: 'insideLeft', angle: -90, fill: '#555', fontSize: 11 } : undefined}
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
        <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1c" />
        <XAxis
          dataKey={xKey}
          tick={{ fill: '#aaa', fontSize: 12, fontFamily: "'Fira Code', monospace" }}
          axisLine={false}
          tickLine={false}
          label={spec.xLabel ? { value: spec.xLabel, position: 'insideBottom', fill: '#555', fontSize: 11, dy: 10 } : undefined}
        />
        <YAxis
          tick={{ fill: '#555', fontSize: 11, fontFamily: "'Fira Code', monospace" }}
          axisLine={false}
          tickLine={false}
          label={spec.yLabel ? { value: spec.yLabel, position: 'insideLeft', angle: -90, fill: '#555', fontSize: 11 } : undefined}
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
  if (!spec.data.length) return <p className="font-mono text-[13px] text-[#555]">No data</p>
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
                  borderBottom: '1px solid #252525',
                  color: '#555',
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
            <tr key={i} style={{ borderBottom: '1px solid #1c1c1c' }}>
              {columns.map((col) => (
                <td
                  key={col}
                  className="font-mono text-[13px]"
                  style={{ padding: '8px 12px', color: '#aaa' }}
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
      <p className="font-mono text-[13px] text-[#555] py-2">
        Unable to render chart — invalid specification.
      </p>
    )
  }

  return (
    <div
      style={{
        background: '#0d0d0d',
        border: '1px solid #1c1c1c',
        borderRadius: '8px',
        padding: '16px',
        marginTop: '12px',
      }}
    >
      {spec.title && (
        <h4
          className="font-sans text-[15px] font-medium"
          style={{ color: '#ccc', marginBottom: '12px' }}
        >
          {spec.title}
        </h4>
      )}
      {spec.type === 'bar' && <BarChartRenderer spec={spec} />}
      {spec.type === 'line' && <LineChartRenderer spec={spec} />}
      {spec.type === 'table' && <TableRenderer spec={spec} />}
      {!['bar', 'line', 'table'].includes(spec.type) && (
        <p className="font-mono text-[13px] text-[#555]">
          Unsupported chart type: {spec.type}
        </p>
      )}
    </div>
  )
}
