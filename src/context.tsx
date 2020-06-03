import React, {
  createContext,
  useContext as useReactContext,
  useMemo,
  useEffect,
  ReactNode,
} from 'react'

import SubscriptionManager from './subscription'

export const PouchContext = createContext<{
  pouchdb: PouchDB.Database
  subscriptionManager: SubscriptionManager
} | null>(null)

export interface ProviderArguments {
  children: JSX.Element | ReactNode
  pouchdb: PouchDB.Database
}

export function Provider({
  children,
  pouchdb,
}: ProviderArguments): React.ReactElement {
  const context = useMemo(() => {
    const subscriptionManager = new SubscriptionManager(pouchdb)

    return {
      pouchdb,
      subscriptionManager,
    }
  }, [pouchdb])

  useEffect(() => {
    const listener = () => {
      context.subscriptionManager.unsubscribeAll()
    }
    pouchdb.once('destroyed', listener)
    return () => {
      pouchdb.removeListener('destroyed', listener)
      context.subscriptionManager.unsubscribeAll()
    }
  }, [pouchdb, context.subscriptionManager])

  return (
    <PouchContext.Provider value={context}>{children}</PouchContext.Provider>
  )
}

export function useContext(): {
  pouchdb: PouchDB.Database<Record<string, unknown>>
  subscriptionManager: SubscriptionManager
} {
  const context = useReactContext(PouchContext)

  if (!context || !context.pouchdb) {
    throw new Error(
      'could not find PouchDB context value; please ensure the component is wrapped in a <Provider>'
    )
  }

  return context
}
