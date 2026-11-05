import { useState } from 'react'
import { openLocalPmtiles, type LocalPmtilesArchive } from '../providers/localPmtiles'

export function useLocalPmtiles() {
  const [archive, setArchive] = useState<LocalPmtilesArchive | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function selectFile(file: File | undefined) {
    if (!file) return
    setLoading(true)
    setError('')
    try {
      setArchive(await openLocalPmtiles(file))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to open the PMTiles archive')
    } finally {
      setLoading(false)
    }
  }

  function clear() {
    setArchive(null)
    setError('')
  }

  return { archive, error, loading, selectFile, clear }
}
