import PouchDB from 'pouchdb-core'
import memory from 'pouchdb-adapter-memory'
import mapReduce from 'pouchdb-mapreduce'

import { renderHook, renderHookWithMultiDbContext, act } from './test-utils'
import useAllDocs from './useAllDocs'

PouchDB.plugin(memory)
PouchDB.plugin(mapReduce)

let myPouch: PouchDB.Database

beforeEach(() => {
  myPouch = new PouchDB('test', { adapter: 'memory' })
})

afterEach(async () => {
  await myPouch.destroy()
})

test('should throw an error if there is no pouchdb context', () => {
  const { result } = renderHook(() => useAllDocs())

  expect(result.error).toBeInstanceOf(Error)
  expect(result.error.message).toBe(
    'could not find PouchDB context value; please ensure the component is wrapped in a <Provider>'
  )
})

test('should load all documents', async () => {
  const putResult = await myPouch.bulkDocs([
    { _id: 'a', test: 'value' },
    { _id: 'b', test: 'other' },
  ])

  const { result, waitForNextUpdate } = renderHook(() => useAllDocs(), {
    pouchdb: myPouch,
  })

  expect(result.current).toEqual({
    error: null,
    loading: true,
    state: 'loading',
    offset: 0,
    rows: [],
    total_rows: 0,
  })

  await waitForNextUpdate()

  expect(result.current).toEqual({
    error: null,
    loading: false,
    state: 'done',
    offset: 0,
    rows: [
      { id: 'a', key: 'a', value: { rev: putResult[0].rev } },
      { id: 'b', key: 'b', value: { rev: putResult[1].rev } },
    ],
    total_rows: 2,
  })
})

test('should subscribe to changes', async () => {
  const [{ rev: revA }, { rev: revB }] = await myPouch.bulkDocs([
    { _id: 'a', test: 'value' },
    { _id: 'b', test: 'other' },
  ])

  const { result, waitForNextUpdate } = renderHook(() => useAllDocs(), {
    pouchdb: myPouch,
  })

  await waitForNextUpdate()

  expect(result.current.state).toBe('done')
  expect(result.current.rows).toEqual([
    { id: 'a', key: 'a', value: { rev: revA } },
    { id: 'b', key: 'b', value: { rev: revB } },
  ])
  expect(result.current.total_rows).toBe(2)

  let revC: string
  let revD: string
  act(() => {
    myPouch
      .bulkDocs([
        { _id: 'c', test: 'Hallo!' },
        { _id: 'd', test: 'world!' },
      ])
      .then(result => {
        revC = result[0].rev
        revD = result[1].rev
      })
  })

  await waitForNextUpdate()

  expect(result.current.loading).toBeTruthy()

  await waitForNextUpdate()

  expect(result.current.rows).toEqual([
    { id: 'a', key: 'a', value: { rev: revA } },
    { id: 'b', key: 'b', value: { rev: revB } },
    { id: 'c', key: 'c', value: { rev: revC } },
    { id: 'd', key: 'd', value: { rev: revD } },
  ])
  expect(result.current.total_rows).toBe(4)

  await waitForNextUpdate()

  let secondUpdateRev = ''
  act(() => {
    myPouch
      .put({
        _id: 'a',
        _rev: revA,
        test: 'newValue',
      })
      .then(result => {
        secondUpdateRev = result.rev
      })
  })

  await waitForNextUpdate()

  expect(result.current.loading).toBeTruthy()

  await waitForNextUpdate()

  expect(result.current.state).toBe('done')
  expect(result.current.rows).toEqual([
    { id: 'a', key: 'a', value: { rev: secondUpdateRev } },
    { id: 'b', key: 'b', value: { rev: revB } },
    { id: 'c', key: 'c', value: { rev: revC } },
    { id: 'd', key: 'd', value: { rev: revD } },
  ])
  expect(result.current.total_rows).toBe(4)

  act(() => {
    myPouch.remove('b', revB)
  })

  await waitForNextUpdate()

  expect(result.current.state).toBe('done')
  expect(result.current.rows).toEqual([
    { id: 'a', key: 'a', value: { rev: secondUpdateRev } },
    { id: 'c', key: 'c', value: { rev: revC } },
    { id: 'd', key: 'd', value: { rev: revD } },
  ])
  expect(result.current.total_rows).toBe(3)
})

test('should reload if a change did happen while a query is running', async () => {
  const [{ rev: revA }, { rev: revB }] = await myPouch.bulkDocs([
    { _id: 'a', test: 'value' },
    { _id: 'b', test: 'other' },
  ])

  const { result, waitForNextUpdate } = renderHook(() => useAllDocs(), {
    pouchdb: myPouch,
  })

  await waitForNextUpdate()

  expect(result.current.state).toBe('done')
  expect(result.current.rows).toEqual([
    { id: 'a', key: 'a', value: { rev: revA } },
    { id: 'b', key: 'b', value: { rev: revB } },
  ])

  let revC: string
  let revD: string
  act(() => {
    myPouch
      .bulkDocs([
        { _id: 'c', test: 'Hallo!' },
        { _id: 'd', test: 'world!' },
      ])
      .then(result => {
        revC = result[0].rev
        revD = result[1].rev
      })
  })

  await waitForNextUpdate()

  expect(result.current.state).toBe('loading')
  expect(result.current.rows).toEqual([
    { id: 'a', key: 'a', value: { rev: revA } },
    { id: 'b', key: 'b', value: { rev: revB } },
  ])

  let revE: string
  act(() => {
    myPouch.put({ _id: 'e', test: 'Hallo!' }).then(result => {
      revE = result.rev
    })
  })

  await waitForNextUpdate()

  expect(result.current.loading).toBeTruthy()
  expect(result.current.rows).toEqual([
    { id: 'a', key: 'a', value: { rev: revA } },
    { id: 'b', key: 'b', value: { rev: revB } },
    { id: 'c', key: 'c', value: { rev: revC } },
    { id: 'd', key: 'd', value: { rev: revD } },
  ])

  await waitForNextUpdate()

  expect(result.current.state).toBe('done')
  expect(result.current.rows).toEqual([
    { id: 'a', key: 'a', value: { rev: revA } },
    { id: 'b', key: 'b', value: { rev: revB } },
    { id: 'c', key: 'c', value: { rev: revC } },
    { id: 'd', key: 'd', value: { rev: revD } },
    { id: 'e', key: 'e', value: { rev: revE } },
  ])

  await waitForNextUpdate()
})

describe('options', () => {
  test('should handle the include_docs option', async () => {
    const [{ rev: revA }, { rev: revB }] = await myPouch.bulkDocs([
      { _id: 'a', test: 'value' },
      { _id: 'b', test: 'other' },
    ])

    const { result, waitForNextUpdate, rerender } = renderHook(
      (include_docs: boolean) => useAllDocs({ include_docs }),
      {
        initialProps: false,
        pouchdb: myPouch,
      }
    )

    await waitForNextUpdate()

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'a', key: 'a', value: { rev: revA } },
      { id: 'b', key: 'b', value: { rev: revB } },
    ])

    rerender(true)

    await waitForNextUpdate()

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      {
        id: 'a',
        key: 'a',
        value: { rev: revA },
        doc: { _id: 'a', _rev: revA, test: 'value' },
      },
      {
        id: 'b',
        key: 'b',
        value: { rev: revB },
        doc: { _id: 'b', _rev: revB, test: 'other' },
      },
    ])
  })

  test('should handle the conflicts option', async () => {
    const [{ rev: revA }] = await myPouch.bulkDocs([
      { _id: 'a', test: 'value' },
      { _id: 'b', test: 'other' },
    ])

    const updateResult = await myPouch.put({
      _id: 'a',
      _rev: revA,
      test: 'update',
      type: 'tester',
    })

    const conflictResult = await myPouch.put(
      {
        _id: 'a',
        _rev: revA,
        test: 'conflict',
        type: 'tester',
      },
      { force: true }
    )

    const { result, waitForNextUpdate, rerender } = renderHook(
      (conflicts: boolean) => useAllDocs({ include_docs: true, conflicts }),
      {
        initialProps: false,
        pouchdb: myPouch,
      }
    )

    await waitForNextUpdate()

    expect(result.current.state).toBe('done')
    expect(result.current.rows[0].doc._conflicts).toBeUndefined()

    rerender(true)

    await waitForNextUpdate()

    expect(result.current.state).toBe('done')
    expect(result.current.rows[0].doc._conflicts).toEqual(
      result.current.rows[0].doc._rev === updateResult.rev
        ? [conflictResult.rev]
        : [updateResult.rev]
    )
    expect(result.current.rows[1].doc._conflicts).toBeUndefined()
  })

  test('should handle the attachments option', async () => {
    await myPouch.bulkDocs([
      {
        _attachments: {
          'info.txt': {
            content_type: 'text/plain',
            data: Buffer.from('Is there life on Mars?\n'),
          },
        },
        _id: 'a',
        test: 'value',
      },
      { _id: 'b', test: 'other' },
    ])

    const { result, waitForNextUpdate, rerender } = renderHook(
      (attachments: boolean) => useAllDocs({ include_docs: true, attachments }),
      {
        initialProps: false,
        pouchdb: myPouch,
      }
    )

    await waitForNextUpdate()

    expect(result.current.state).toBe('done')
    expect(result.current.rows[0].doc._attachments['info.txt']).toEqual({
      content_type: 'text/plain',
      digest: 'md5-knhR9rrbyHqrdPJYmv/iAg==',
      length: 23,
      revpos: 1,
      stub: true,
    })

    rerender(true)

    await waitForNextUpdate()

    expect(result.current.state).toBe('done')
    expect(result.current.rows[0].doc._attachments['info.txt']).toEqual({
      content_type: 'text/plain',
      data: 'SXMgdGhlcmUgbGlmZSBvbiBNYXJzPwo=',
      digest: 'md5-knhR9rrbyHqrdPJYmv/iAg==',
      revpos: 1,
    })
  })

  test('should handle the binary option', async () => {
    await myPouch.bulkDocs([
      {
        _attachments: {
          'info.txt': {
            content_type: 'text/plain',
            data: Buffer.from('Is there life on Mars?\n'),
          },
        },
        _id: 'a',
        test: 'value',
        type: 'tester',
      },
      { _id: 'b', test: 'other', type: 'checker' },
    ])

    const { result, waitForNextUpdate, rerender } = renderHook(
      (binary: boolean) =>
        useAllDocs({
          include_docs: true,
          attachments: true,
          binary,
        }),
      {
        initialProps: false,
        pouchdb: myPouch,
      }
    )

    await waitForNextUpdate()

    expect(result.current.state).toBe('done')
    expect(result.current.rows[0].doc._attachments['info.txt']).toEqual({
      content_type: 'text/plain',
      data: 'SXMgdGhlcmUgbGlmZSBvbiBNYXJzPwo=',
      digest: 'md5-knhR9rrbyHqrdPJYmv/iAg==',
      revpos: 1,
    })

    rerender(true)

    await waitForNextUpdate()

    expect(result.current.state).toBe('done')
    expect(result.current.rows[0].doc._attachments['info.txt']).toEqual({
      content_type: 'text/plain',
      data: Buffer.from('Is there life on Mars?\n'),
      digest: 'md5-knhR9rrbyHqrdPJYmv/iAg==',
      revpos: 1,
    })
  })

  test('should handle the startkey option', async () => {
    const [{ rev: revA }, { rev: revB }] = await myPouch.bulkDocs([
      { _id: 'a', test: 'value' },
      { _id: 'b', test: 'other' },
    ])

    const { result, waitForNextUpdate, rerender } = renderHook(
      (startkey: string) => useAllDocs({ startkey, endkey: 'x' }),
      {
        initialProps: 'b',
        pouchdb: myPouch,
      }
    )

    await waitForNextUpdate()

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'b', key: 'b', value: { rev: revB } },
    ])

    let revAA: string
    act(() => {
      myPouch.put({ _id: 'aa' }).then(result => {
        revAA = result.rev
      })
    })

    await new Promise(resolve => {
      setTimeout(resolve, 10)
    })

    expect(result.current.rows).toEqual([
      { id: 'b', key: 'b', value: { rev: revB } },
    ])

    rerender('a')

    await waitForNextUpdate()

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'a', key: 'a', value: { rev: revA } },
      { id: 'aa', key: 'aa', value: { rev: revAA } },
      { id: 'b', key: 'b', value: { rev: revB } },
    ])
  })

  test('should handle the endkey option', async () => {
    const [{ rev: revA }, { rev: revB }] = await myPouch.bulkDocs([
      { _id: 'a', test: 'value' },
      { _id: 'b', test: 'other' },
    ])

    const { result, waitForNextUpdate, rerender } = renderHook(
      (endkey: string) => useAllDocs({ startkey: 'a', endkey }),
      {
        initialProps: 'x',
        pouchdb: myPouch,
      }
    )

    await waitForNextUpdate()

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'a', key: 'a', value: { rev: revA } },
      { id: 'b', key: 'b', value: { rev: revB } },
    ])

    rerender('a')

    await waitForNextUpdate()

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'a', key: 'a', value: { rev: revA } },
    ])

    act(() => {
      myPouch.put({ _id: 'c', test: 'moar' })
    })

    await new Promise(resolve => {
      setTimeout(resolve, 10)
    })

    expect(result.current.rows).toEqual([
      { id: 'a', key: 'a', value: { rev: revA } },
    ])
  })

  test('should handle the inclusive_end option', async () => {
    const [{ rev: revA }, { rev: revB }] = await myPouch.bulkDocs([
      { _id: 'a', test: 'value' },
      { _id: 'b', test: 'other' },
    ])

    const { result, waitForNextUpdate, rerender } = renderHook(
      (inclusive_end: boolean) =>
        useAllDocs({ startkey: 'a', endkey: 'b', inclusive_end }),
      {
        initialProps: true,
        pouchdb: myPouch,
      }
    )

    await waitForNextUpdate()

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'a', key: 'a', value: { rev: revA } },
      { id: 'b', key: 'b', value: { rev: revB } },
    ])

    act(() => {
      myPouch.put({ _id: 'c', test: 'moar' })
    })

    await new Promise(resolve => {
      setTimeout(resolve, 10)
    })

    expect(result.current.rows).toEqual([
      { id: 'a', key: 'a', value: { rev: revA } },
      { id: 'b', key: 'b', value: { rev: revB } },
    ])

    rerender(false)

    await waitForNextUpdate()

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'a', key: 'a', value: { rev: revA } },
    ])
  })

  test('should handle the limit option', async () => {
    const [{ rev: revA }, { rev: revB }] = await myPouch.bulkDocs([
      { _id: 'a', test: 'value' },
      { _id: 'b', test: 'other' },
    ])

    const { result, waitForNextUpdate, rerender } = renderHook(
      (limit?: number) => useAllDocs({ limit }),
      {
        initialProps: 1,
        pouchdb: myPouch,
      }
    )

    await waitForNextUpdate()

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'a', key: 'a', value: { rev: revA } },
    ])

    rerender(5)

    await waitForNextUpdate()

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'a', key: 'a', value: { rev: revA } },
      { id: 'b', key: 'b', value: { rev: revB } },
    ])
  })

  test('should handle the skip option', async () => {
    const [{ rev: revA }, { rev: revB }] = await myPouch.bulkDocs([
      { _id: 'a', test: 'value' },
      { _id: 'b', test: 'other' },
    ])

    const { result, waitForNextUpdate, rerender } = renderHook(
      (skip?: number) => useAllDocs({ skip }),
      {
        initialProps: 1,
        pouchdb: myPouch,
      }
    )

    await waitForNextUpdate()

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'b', key: 'b', value: { rev: revB } },
    ])
    expect(result.current.offset).toBe(1)

    rerender(5)

    await waitForNextUpdate()

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([])
    expect(result.current.offset).toBe(5)

    rerender(0)

    await waitForNextUpdate()

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'a', key: 'a', value: { rev: revA } },
      { id: 'b', key: 'b', value: { rev: revB } },
    ])
    expect(result.current.offset).toBe(0)
  })

  test('should handle the descending option', async () => {
    const [{ rev: revA }, { rev: revB }] = await myPouch.bulkDocs([
      { _id: 'a', test: 'value' },
      { _id: 'b', test: 'other' },
    ])

    const { result, waitForNextUpdate, rerender } = renderHook(
      (descending: boolean) => useAllDocs({ descending }),
      {
        initialProps: false,
        pouchdb: myPouch,
      }
    )

    await waitForNextUpdate()

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'a', key: 'a', value: { rev: revA } },
      { id: 'b', key: 'b', value: { rev: revB } },
    ])

    rerender(true)

    await waitForNextUpdate()

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'b', key: 'b', value: { rev: revB } },
      { id: 'a', key: 'a', value: { rev: revA } },
    ])
  })

  test('should handle updates with the descending option', async () => {
    const [{ rev: revA }, { rev: revB }] = await myPouch.bulkDocs([
      { _id: 'a', test: 'value' },
      { _id: 'b', test: 'other' },
    ])

    const { result, waitForNextUpdate } = renderHook(
      () => useAllDocs({ descending: true }),
      {
        pouchdb: myPouch,
      }
    )

    await waitForNextUpdate()

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'b', key: 'b', value: { rev: revB } },
      { id: 'a', key: 'a', value: { rev: revA } },
    ])

    let revC: string
    act(() => {
      myPouch.put({ _id: 'c', test: 'moar' }).then(result => {
        revC = result.rev
      })
    })

    await waitForNextUpdate()

    expect(result.current.state).toBe('loading')

    await waitForNextUpdate()

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'c', key: 'c', value: { rev: revC } },
      { id: 'b', key: 'b', value: { rev: revB } },
      { id: 'a', key: 'a', value: { rev: revA } },
    ])
  })

  test('should handle the key option', async () => {
    const [{ rev: revA }, { rev: revB }] = await myPouch.bulkDocs([
      { _id: 'a', test: 'value' },
      { _id: 'b', test: 'other' },
    ])

    const { result, waitForNextUpdate, rerender } = renderHook(
      (key: string) => useAllDocs({ key }),
      {
        initialProps: 'a',
        pouchdb: myPouch,
      }
    )

    await waitForNextUpdate()

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'a', key: 'a', value: { rev: revA } },
    ])

    rerender('b')

    await waitForNextUpdate()

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'b', key: 'b', value: { rev: revB } },
    ])

    act(() => {
      myPouch.put({ _id: 'c', test: 'moar' })
    })

    await new Promise(resolve => {
      setTimeout(resolve, 10)
    })

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'b', key: 'b', value: { rev: revB } },
    ])
  })

  test('should handle the keys option', async () => {
    const [{ rev: revA }, { rev: revB }, { rev: revC }] =
      await myPouch.bulkDocs([
        { _id: 'a', test: 'value' },
        { _id: 'b', test: 'other' },
        { _id: 'c', test: 'moar' },
      ])

    const { result, waitForNextUpdate, rerender } = renderHook(
      (keys: string[]) => useAllDocs({ keys }),
      {
        initialProps: ['a'],
        pouchdb: myPouch,
      }
    )

    await waitForNextUpdate()

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'a', key: 'a', value: { rev: revA } },
    ])

    rerender(['c', 'b'])

    await waitForNextUpdate()

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'c', key: 'c', value: { rev: revC } },
      { id: 'b', key: 'b', value: { rev: revB } },
    ])

    act(() => {
      myPouch.put({ _id: 'd', test: 'moar' })
    })

    await new Promise(resolve => {
      setTimeout(resolve, 10)
    })

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'c', key: 'c', value: { rev: revC } },
      { id: 'b', key: 'b', value: { rev: revB } },
    ])
  })

  test("shouldn't query if keys content didn't change", async () => {
    const [{ rev: revA }] = await myPouch.bulkDocs([
      { _id: 'a', test: 'value' },
      { _id: 'b', test: 'other' },
      { _id: 'c', test: 'moar' },
    ])

    const { result, waitForNextUpdate, rerender } = renderHook(
      (keys: string[]) => useAllDocs({ keys }),
      {
        initialProps: ['a'],
        pouchdb: myPouch,
      }
    )

    await waitForNextUpdate()

    expect(result.current.state).toBe('done')
    expect(result.current.rows).toEqual([
      { id: 'a', key: 'a', value: { rev: revA } },
    ])

    rerender(['a'])

    expect(result.current.loading).toBe(false)
  })

  test('should handle the update_seq option', async () => {
    await myPouch.bulkDocs([
      { _id: 'a', test: 'value' },
      { _id: 'b', test: 'other' },
    ])

    const { result, waitForNextUpdate, rerender } = renderHook(
      (update_seq: boolean) => useAllDocs({ update_seq }),
      {
        initialProps: false,
        pouchdb: myPouch,
      }
    )

    await waitForNextUpdate()

    expect(result.current.state).toBe('done')
    expect(result.current.update_seq).toBeUndefined()

    rerender(true)

    await waitForNextUpdate()

    expect(result.current.state).toBe('done')
    expect(result.current.update_seq).not.toBeUndefined()
  })

  test('should support the selection of a database in the context to be used', async () => {
    const other = new PouchDB('other', { adapter: 'memory' })

    await myPouch.put({
      _id: 'test',
      value: 'myPouch',
    })

    await other.put({
      _id: 'test',
      value: 'other',
    })

    const { result, waitForNextUpdate, rerender } =
      renderHookWithMultiDbContext(
        (name?: string) => useAllDocs({ db: name, include_docs: true }),
        {
          initialProps: undefined,
          main: myPouch,
          other: other,
        }
      )

    await waitForNextUpdate()

    // No db selection
    expect(result.current.loading).toBeFalsy()
    expect(result.current.rows).toEqual([
      {
        id: 'test',
        key: 'test',
        value: { rev: expect.anything() },
        doc: {
          _id: 'test',
          _rev: expect.anything(),
          value: 'myPouch',
        },
      },
    ])

    // selecting a database that is not the default
    rerender('other')
    expect(result.current.loading).toBeTruthy()
    await waitForNextUpdate()

    expect(result.current.loading).toBeFalsy()
    expect(result.current.rows).toEqual([
      {
        id: 'test',
        key: 'test',
        value: { rev: expect.anything() },
        doc: {
          _id: 'test',
          _rev: expect.anything(),
          value: 'other',
        },
      },
    ])

    // selecting the default db by it's name
    rerender('main')
    expect(result.current.loading).toBeTruthy()
    await waitForNextUpdate()

    expect(result.current.loading).toBeFalsy()
    expect(result.current.rows).toEqual([
      {
        id: 'test',
        key: 'test',
        value: { rev: expect.anything() },
        doc: {
          _id: 'test',
          _rev: expect.anything(),
          value: 'myPouch',
        },
      },
    ])

    // reset to other db
    rerender('other')
    expect(result.current.loading).toBeTruthy()
    await waitForNextUpdate()

    // selecting by special _default key
    rerender('_default')
    await waitForNextUpdate()

    expect(result.current.rows).toEqual([
      {
        id: 'test',
        key: 'test',
        value: { rev: expect.anything() },
        doc: {
          _id: 'test',
          _rev: expect.anything(),
          value: 'myPouch',
        },
      },
    ])

    await other.destroy()
  })
})
