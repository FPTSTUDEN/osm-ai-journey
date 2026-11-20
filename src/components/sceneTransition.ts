import { flushSync } from 'react-dom'

type ViewTransitionDocument = Document & { startViewTransition?: (update: () => void) => { finished: Promise<void> } }

/** Root class present while the new scene is being captured; SceneArt shows the image instantly instead of fading. */
export const SCENE_VIEW_TRANSITION_CLASS = 'vt-scene-new'

function preload(url: string, timeoutMs: number) {
  return new Promise<void>((resolve) => {
    const image = new Image()
    const timer = window.setTimeout(resolve, timeoutMs)
    const done = () => { window.clearTimeout(timer); resolve() }
    image.onload = done
    image.onerror = done
    image.src = url
  })
}

/**
 * Grow a thumbnail into the full-screen scene art with the View Transitions API.
 * Falls back to a plain update (SceneArt then crossfades) when motion is off, there is no source element,
 * or the browser has no View Transitions support.
 */
export async function transitionIntoScene(source: HTMLElement | null | undefined, sceneUrl: string, motionEnabled: boolean, apply: () => void) {
  const doc = document as ViewTransitionDocument
  if (!motionEnabled || !source || typeof doc.startViewTransition !== 'function') {
    apply()
    return
  }
  // Without the full image decoded, the thumbnail would grow into an empty frame.
  await preload(sceneUrl, 900)
  const root = document.documentElement
  source.style.viewTransitionName = 'scene-photo'
  try {
    const transition = doc.startViewTransition(() => {
      source.style.viewTransitionName = ''
      root.classList.add(SCENE_VIEW_TRANSITION_CLASS)
      flushSync(apply)
    })
    await transition.finished
  } catch {
    apply()
  } finally {
    source.style.viewTransitionName = ''
    root.classList.remove(SCENE_VIEW_TRANSITION_CLASS)
  }
}
