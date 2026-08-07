/**
 * A thin promise wrapper over IndexedDB. Deliberately small — the app needs
 * get-all, put, delete and clear over two object stores, nothing more.
 */

const DB_NAME = 'expense-tracker'
const DB_VERSION = 1

export const STORE_EXPENSES = 'expenses'
export const STORE_CATEGORIES = 'categories'

let dbPromise: Promise<IDBDatabase> | null = null

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION)

    open.onupgradeneeded = () => {
      const db = open.result
      if (!db.objectStoreNames.contains(STORE_EXPENSES)) {
        const expenses = db.createObjectStore(STORE_EXPENSES, { keyPath: 'id' })
        expenses.createIndex('date', 'date')
      }
      if (!db.objectStoreNames.contains(STORE_CATEGORIES)) {
        db.createObjectStore(STORE_CATEGORIES, { keyPath: 'id' })
      }
    }

    open.onsuccess = () => {
      const db = open.result
      // A newer tab upgrading the schema would otherwise leave this one holding a
      // stale connection.
      db.onversionchange = () => db.close()
      resolve(db)
    }
    open.onerror = () => reject(open.error)
  })

  // A failed open must not be cached, or every later call inherits the rejection.
  dbPromise.catch(() => {
    dbPromise = null
  })

  return dbPromise
}

function tx(db: IDBDatabase, stores: string[], mode: IDBTransactionMode) {
  const t = db.transaction(stores, mode)
  const done = new Promise<void>((resolve, reject) => {
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error ?? new Error('Transaction aborted'))
  })
  return { t, done }
}

export async function getAll<T>(store: string): Promise<T[]> {
  const db = await openDB()
  const { t } = tx(db, [store], 'readonly')
  return req<T[]>(t.objectStore(store).getAll())
}

export async function putMany<T>(store: string, items: T[]): Promise<void> {
  if (items.length === 0) return
  const db = await openDB()
  const { t, done } = tx(db, [store], 'readwrite')
  const os = t.objectStore(store)
  for (const item of items) os.put(item)
  await done
}

export async function put<T>(store: string, item: T): Promise<void> {
  return putMany(store, [item])
}

export async function deleteMany(store: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const db = await openDB()
  const { t, done } = tx(db, [store], 'readwrite')
  const os = t.objectStore(store)
  for (const id of ids) os.delete(id)
  await done
}

export async function clearStores(stores: string[]): Promise<void> {
  const db = await openDB()
  const { t, done } = tx(db, stores, 'readwrite')
  for (const s of stores) t.objectStore(s).clear()
  await done
}

/** Replaces the full contents of both stores in one transaction — used by import. */
export async function replaceAll(payload: {
  expenses: unknown[]
  categories: unknown[]
}): Promise<void> {
  const db = await openDB()
  const { t, done } = tx(db, [STORE_EXPENSES, STORE_CATEGORIES], 'readwrite')
  const ex = t.objectStore(STORE_EXPENSES)
  const cat = t.objectStore(STORE_CATEGORIES)
  ex.clear()
  cat.clear()
  for (const e of payload.expenses) ex.put(e)
  for (const c of payload.categories) cat.put(c)
  await done
}
