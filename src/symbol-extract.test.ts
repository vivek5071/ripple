import { extractChangedSymbols } from './symbol-extract'
import type { ChangedFile } from './types'

function file(path: string, patch: string): ChangedFile {
  return { path, status: 'modified', patch }
}

describe('extractChangedSymbols', () => {
  it('extracts exported symbols from added lines only', () => {
    const patch = [
      '+export function createOrder(id: string) {',
      '-export function removedThing() {',
      ' export function contextLine() {',
      '+export const orderLimit = 50',
      '+const notExported = 1',
    ].join('\n')

    const symbols = extractChangedSymbols([file('src/orders.ts', patch)])
    expect(symbols.map(s => s.name)).toEqual(['createOrder', 'orderLimit'])
  })

  it('handles default, async, class, interface, type and enum exports', () => {
    const patch = [
      '+export default async function fetchUsers() {',
      '+export class PaymentGateway {',
      '+export interface OrderState {',
      '+export type OrderId = string',
      '+export enum OrderStatus {',
    ].join('\n')

    const symbols = extractChangedSymbols([file('src/api.tsx', patch)])
    expect(symbols.map(s => s.name)).toEqual([
      'fetchUsers',
      'PaymentGateway',
      'OrderState',
      'OrderId',
      'OrderStatus',
    ])
  })

  it('skips short names, non-source files, and files without a patch', () => {
    const symbols = extractChangedSymbols([
      file('src/short.ts', '+export const ab = 1'), // < 3 chars
      file('README.md', '+export function docsExample() {'),
      { path: 'src/nopatch.ts', status: 'modified' },
    ])
    expect(symbols).toEqual([])
  })

  it('dedupes the same symbol within a file and tags language', () => {
    const patch = ['+export function retryFetch() {', '+export function retryFetch() {'].join('\n')
    const [ts] = extractChangedSymbols([file('src/net.ts', patch)])
    const [js] = extractChangedSymbols([file('src/net.js', patch)])

    expect(extractChangedSymbols([file('src/net.ts', patch)])).toHaveLength(1)
    expect(ts.language).toBe('typescript')
    expect(js.language).toBe('javascript')
  })
})
