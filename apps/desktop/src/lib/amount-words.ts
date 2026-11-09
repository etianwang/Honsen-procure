export type AmountLanguage = 'zh' | 'fr' | 'en'
const enSmall = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
]
const frSmall = [
  'zéro',
  'un',
  'deux',
  'trois',
  'quatre',
  'cinq',
  'six',
  'sept',
  'huit',
  'neuf',
  'dix',
  'onze',
  'douze',
  'treize',
  'quatorze',
  'quinze',
  'seize',
]
function en(n: bigint): string {
  if (n < 20n) return enSmall[Number(n)]!
  if (n < 100n)
    return (
      [
        '',
        '',
        'twenty',
        'thirty',
        'forty',
        'fifty',
        'sixty',
        'seventy',
        'eighty',
        'ninety',
      ][Number(n / 10n)]! + (n % 10n ? '-' + en(n % 10n) : '')
    )
  for (const [v, label] of [
    [1000000000000000000n, 'quintillion'],
    [1000000000000000n, 'quadrillion'],
    [1000000000000n, 'trillion'],
    [1000000000n, 'billion'],
    [1000000n, 'million'],
    [1000n, 'thousand'],
    [100n, 'hundred'],
  ] as const)
    if (n >= v) return en(n / v) + ' ' + label + (n % v ? ' ' + en(n % v) : '')
  throw new Error('Invalid amount')
}
function fr(n: bigint, terminal = true): string {
  if (n < 17n) return frSmall[Number(n)]!
  if (n < 20n) return 'dix-' + fr(n - 10n)
  if (n < 70n) {
    const r = n % 10n
    return (
      ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'][
        Number(n / 10n)
      ]! + (r === 1n ? '-et-un' : r ? '-' + fr(r) : '')
    )
  }
  if (n < 80n) return 'soixante' + (n === 71n ? '-et-onze' : '-' + fr(n - 60n))
  if (n < 100n)
    return (
      'quatre-vingt' + (n === 80n ? (terminal ? 's' : '') : '-' + fr(n - 80n))
    )
  if (n < 1000n)
    return (
      (n / 100n === 1n ? '' : fr(n / 100n) + '-') +
      'cent' +
      (n % 100n
        ? '-' + fr(n % 100n, terminal)
        : n >= 200n && terminal
          ? 's'
          : '')
    )
  for (const [v, label] of [
    [1000000000000000000n, 'trillion'],
    [1000000000000000n, 'billiard'],
    [1000000000000n, 'billion'],
    [1000000000n, 'milliard'],
    [1000000n, 'million'],
    [1000n, 'mille'],
  ] as const)
    if (n >= v)
      return (
        (v === 1000n && n / v === 1n ? '' : fr(n / v, v !== 1000n) + '-') +
        label +
        (v !== 1000n && n / v > 1n ? 's' : '') +
        (n % v ? '-' + fr(n % v, terminal) : '')
      )
  throw new Error('Invalid amount')
}
const digits = '零壹贰叁肆伍陆柒捌玖'
function zh(n: bigint): string {
  if (!n) return '零'
  const groups: string[] = []
  let gap = false
  let i = 0
  while (n) {
    const g = Number(n % 10000n)
    if (g) {
      let s = ''
      let zero = false
      for (let p = 3; p >= 0; p--) {
        const d = Math.floor(g / 10 ** p) % 10
        if (d) {
          if (zero) s += '零'
          s += digits[d] + ['', '拾', '佰', '仟'][p]!
          zero = false
        } else if (s) zero = true
      }
      groups.unshift(
        s + ['', '万', '亿', '万亿', '亿亿'][i]! + (gap ? '零' : ''),
      )
      gap = g < 1000
    } else if (groups.length) gap = true
    n /= 10000n
    i++
  }
  return groups.join('').replace(/零+/g, '零').replace(/零$/, '')
}
const currencies: Record<
  string,
  {
    scale: bigint
    zh: string
    en: string
    fr: string
    subEn: string
    subFr: string
  }
> = {
  XOF: {
    scale: 1n,
    zh: '西非法郎',
    en: 'West African CFA franc',
    fr: 'franc CFA BCEAO',
    subEn: '',
    subFr: '',
  },
  XAF: {
    scale: 1n,
    zh: '中非法郎',
    en: 'Central African CFA franc',
    fr: 'franc CFA BEAC',
    subEn: '',
    subFr: '',
  },
  CNY: {
    scale: 100n,
    zh: '人民币',
    en: 'Chinese yuan',
    fr: 'yuan chinois',
    subEn: 'fen',
    subFr: 'fen',
  },
  USD: {
    scale: 100n,
    zh: '美元',
    en: 'US dollar',
    fr: 'dollar américain',
    subEn: 'cent',
    subFr: 'centime',
  },
  EUR: {
    scale: 100n,
    zh: '欧元',
    en: 'euro',
    fr: 'euro',
    subEn: 'cent',
    subFr: 'centime',
  },
  ETB: {
    scale: 100n,
    zh: '埃塞俄比亚比尔',
    en: 'Ethiopian birr',
    fr: 'birr éthiopien',
    subEn: 'santim',
    subFr: 'santim',
  },
}
export function amountInWords(
  minor: string,
  currency: string,
  language: AmountLanguage,
): string {
  if (!/^-?\d+$/.test(minor)) throw new Error('Invalid integer minor amount')
  const raw = BigInt(minor)
  if (raw < -9223372036854775808n || raw > 9223372036854775807n)
    throw new Error('Amount outside signed i64 range')
  const c = currencies[currency]
  if (!c) throw new Error('Unsupported currency')
  const n = raw < 0n ? -raw : raw,
    whole = n / c.scale,
    part = n % c.scale
  if (language === 'zh')
    return (
      (raw < 0n ? '负' : '') +
      c.zh +
      zh(whole) +
      (c.scale === 1n
        ? '整'
        : '元' +
          (part
            ? (part / 10n ? digits[Number(part / 10n)] + '角' : '零') +
              (part % 10n ? digits[Number(part % 10n)] + '分' : '')
            : '整'))
    )
  const plural = (name: string, count: bigint) =>
    name + (count !== 1n && !['Chinese yuan', 'fen'].includes(name) ? 's' : '')
  if (language === 'en')
    return (
      (raw < 0n ? 'minus ' : '') +
      en(whole) +
      ' ' +
      plural(c.en, whole) +
      (part ? ' and ' + en(part) + ' ' + plural(c.subEn, part) : '')
    )
  if (language === 'fr')
    return (
      (raw < 0n ? 'moins ' : '') +
      fr(whole) +
      (whole > 0n && whole % 1000000n === 0n ? ' de ' : ' ') +
      (whole > 1n
        ? c.fr
            .replace(/^franc /, 'francs ')
            .replace(/^dollar américain$/, 'dollars américains')
            .replace(/^yuan chinois$/, 'yuans chinois')
            .replace(/^euro$/, 'euros')
            .replace(/^birr éthiopien$/, 'birrs éthiopiens')
        : c.fr) +
      (part ? ' et ' + fr(part) + ' ' + plural(c.subFr, part) : '')
    )
  throw new Error('Unsupported language')
}
