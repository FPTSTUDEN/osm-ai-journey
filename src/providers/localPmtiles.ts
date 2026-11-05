import { FileSource, PMTiles, TileType } from 'pmtiles'

const LOCAL_ARCHIVE_KEY = 'osm-ai-journey-local-archive'

class LocalFileSource extends FileSource {
  getKey() {
    return LOCAL_ARCHIVE_KEY
  }
}

export type LocalPmtilesArchive = {
  fileName: string
  pmtiles: PMTiles
  tileType: TileType
  minZoom: number
  maxZoom: number
  bounds: [number, number, number, number]
  vectorLayers: string[]
  attribution?: string
}

type PmtilesMetadata = {
  vector_layers?: Array<{ id?: unknown }>
  attribution?: unknown
}

export async function openLocalPmtiles(file: File): Promise<LocalPmtilesArchive> {
  if (!file.name.toLowerCase().endsWith('.pmtiles')) throw new Error('Choose a file with the .pmtiles extension.')
  const pmtiles = new PMTiles(new LocalFileSource(file))
  const [header, metadata] = await Promise.all([pmtiles.getHeader(), pmtiles.getMetadata()])

  if (![TileType.Mvt, TileType.Png, TileType.Jpeg, TileType.Webp, TileType.Avif].includes(header.tileType)) {
    throw new Error('This archive must contain vector, PNG, JPEG, WebP, or AVIF map tiles.')
  }
  if (![header.minZoom, header.maxZoom, header.minLon, header.minLat, header.maxLon, header.maxLat].every(Number.isFinite)
    || header.minZoom > header.maxZoom || header.minLon >= header.maxLon || header.minLat >= header.maxLat) {
    throw new Error('This archive has invalid zoom or geographic bounds.')
  }

  const vectorLayers = (metadata as PmtilesMetadata)?.vector_layers
    ?.map((layer) => layer.id)
    .filter((id): id is string => typeof id === 'string') ?? []
  const attribution = (metadata as PmtilesMetadata)?.attribution
  if (header.tileType === TileType.Mvt && vectorLayers.length === 0) {
    throw new Error('This vector archive has no vector layer metadata, so it cannot be styled.')
  }

  return {
    fileName: file.name,
    pmtiles,
    tileType: header.tileType,
    minZoom: header.minZoom,
    maxZoom: header.maxZoom,
    bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat],
    vectorLayers,
    attribution: typeof attribution === 'string' ? attribution : undefined,
  }
}
