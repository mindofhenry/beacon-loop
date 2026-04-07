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
              border: active ? '2px solid #1A1A1A' : '2px solid #D4D4D4',
              background: active ? '#1A1A1A' : '#FFFFFF',
              color: active ? '#FFFFFF' : '#525252',
            }}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.color = '#1A1A1A'
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.color = '#525252'
            }}
          >
            {opt}
          </button>
        )
      })}
    </div>
  )
}
