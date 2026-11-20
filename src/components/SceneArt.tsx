import { useEffect, useState } from 'react'
import type { PlacePhoto } from '../types/domain'
import { SCENE_VIEW_TRANSITION_CLASS } from './sceneTransition'

const FADE_MS = 650

function sceneUrl(photo: PlacePhoto) {
  return photo.sceneUrl ?? photo.imageUrl
}

/**
 * Scene background. A new photo fades in over the previous one (or over the ambient gradient) once it has
 * loaded, then drifts very slowly (CSS `scene-drift`). The outgoing photo lives in a separate `.scene-art-fade`
 * layer, so `.scene-art img` always matches exactly one image.
 */
export function SceneArt({ photo }: { photo: PlacePhoto | null }) {
  const [current, setCurrent] = useState<PlacePhoto | null>(photo)
  const [previous, setPrevious] = useState<PlacePhoto | null>(null)
  const [loadedId, setLoadedId] = useState<string | null>(null)
  // When the photo changes, keep the old one as the layer underneath. Done during render (derived state),
  // not in an effect, so there is no frame where the new photo shows without its fade.
  if ((photo?.id ?? null) !== (current?.id ?? null)) {
    setPrevious(current)
    setCurrent(photo)
  }

  useEffect(() => {
    if (!previous) return
    if (photo && loadedId !== photo.id) return
    const timer = window.setTimeout(() => setPrevious(null), FADE_MS)
    return () => window.clearTimeout(timer)
  }, [loadedId, photo, previous])

  // A view transition is animating this change already: show the image at once.
  const viewTransition = document.documentElement.classList.contains(SCENE_VIEW_TRANSITION_CLASS)
  const ready = viewTransition || loadedId === photo?.id

  return (
    <>
      {previous && <div className={`scene-art-fade ${photo ? '' : 'scene-art-fade-out'}`} aria-hidden="true">
        <img src={sceneUrl(previous)} alt="" />
        <div className="scene-art-shade" />
      </div>}
      {photo && <div className="scene-art" aria-label="Illustrative destination scene art">
        <img key={photo.id} className={ready ? 'scene-img-ready' : 'scene-img-loading'} src={sceneUrl(photo)} alt="" onLoad={() => setLoadedId(photo.id)} onError={() => setLoadedId(photo.id)} />
        <div className="scene-art-shade" />
        <p className="scene-art-note">Illustrative photo · not a live view · {photo.author && `${photo.author} · `}{photo.license && <>{photo.license} · </>}<a href={photo.sourceUrl} target="_blank" rel="noreferrer">source</a></p>
      </div>}
    </>
  )
}
