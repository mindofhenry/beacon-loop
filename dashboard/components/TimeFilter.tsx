'use client'

type TimeFilterOption = '7d' | '30d' | '90d' | '6mo' | '1yr'

const OPTIONS: TimeFilterOption[] = ['7d', '30d', '90d', '6mo', '1yr']

type Props = {
  value: string
  onChange: (value: string) => void
}

export default function TimeFilter({ value, onChange }: Props) {
  return (
    <div style={{ display: 'flex', gap: '4px' }}>
      {OPTIONS.map((opt) => {
        const active = value === opt
        return (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className="font-mono text-[13px] rounded cursor-pointer transition-colors duration-150"
            style={{
              padding: '4px 10px',
              border: active ? '1px solid #252525' : '1px solid transparent',
              background: active ? '#161616' : 'transparent',
              color: active ? '#e5e5e5' : '#444',
            }}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.color = '#888'
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.color = '#444'
            }}
          >
            {opt}
          </button>
        )
      })}
    </div>
  )
}
