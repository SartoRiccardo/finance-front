export type Direction = 'spend' | 'earn'

const eur = (signDisplay: Intl.NumberFormatOptions['signDisplay']) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', signDisplay })

const plain = eur('auto')
const signed = eur('always')

/** it-IT € — direction carries the sign (spend −, earn +). Without direction: bare amount. */
export function money(amount: number | string, direction?: Direction) {
  const n = Number(amount) * (direction === 'spend' ? -1 : 1)
  return (direction ? signed : plain).format(n)
}
