import { currencySchema, formatMoney, type Currency } from '@honsen/shared'
import { useState } from 'react'

const currencies: Currency[] = ['XOF', 'CNY', 'USD', 'EUR']

export function MoneyPreviewPage() {
  const [currency, setCurrency] = useState<Currency>('XOF')

  return (
    <main className="money-preview-page">
      <section
        className="money-preview-card"
        aria-labelledby="money-preview-title"
      >
        <p className="eyebrow">T01 · 共享金额契约</p>
        <h1 id="money-preview-title">货币格式测试</h1>
        <label htmlFor="preview-currency">预览货币</label>
        <select
          id="preview-currency"
          value={currency}
          onChange={(event) =>
            setCurrency(currencySchema.parse(event.target.value))
          }
        >
          {currencies.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <output aria-live="polite" data-testid="formatted-money">
          {formatMoney({ currency, minor: '1234' }, 'en-US')}
        </output>
        <p>传输值：整数 minor units `1234`；业务计算不使用浮点数。</p>
      </section>
    </main>
  )
}
