import { Provider, usePouch, useDoc } from './index'

test('should export the provider', () => {
  expect(Provider).toBeTruthy()
  expect(typeof Provider).toBe('function')
})

test('should export usePouchDB', () => {
  expect(usePouch).toBeTruthy()
  expect(typeof usePouch).toBe('function')
})

test('should export useDoc', () => {
  expect(useDoc).toBeTruthy()
  expect(typeof useDoc).toBe('function')
})
