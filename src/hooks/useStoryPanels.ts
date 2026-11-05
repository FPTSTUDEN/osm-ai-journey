import { useEffect, useRef, useState } from 'react'

export type StoryPanel = 'map' | 'destination' | 'travelogue'

export function useStoryPanels() {
  const [storyMode, setStoryMode] = useState(true)
  const [storyPanels, setStoryPanels] = useState<StoryPanel[]>([])
  const [fieldNotesOpen, setFieldNotesOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const dockButtons = useRef<Partial<Record<StoryPanel, HTMLButtonElement | null>>>({})
  const settingsButton = useRef<HTMLButtonElement | null>(null)

  function toggleStoryPanel(panel: StoryPanel) {
    setStoryPanels((current) => current.includes(panel) ? current.filter((item) => item !== panel) : [...current, panel])
  }

  function closeStoryPanel(panel: StoryPanel) {
    setStoryPanels((current) => current.filter((item) => item !== panel))
  }

  function closeAllPanels() {
    setStoryPanels([])
    setFieldNotesOpen(false)
  }

  function toggleMode() {
    setStoryPanels(storyMode ? ['map'] : [])
    setFieldNotesOpen(false)
    setStoryMode(!storyMode)
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (settingsOpen) {
        setSettingsOpen(false)
        settingsButton.current?.focus()
        return
      }
      if (fieldNotesOpen) {
        setFieldNotesOpen(false)
        dockButtons.current.destination?.focus()
        return
      }
      const topmost = storyPanels.at(-1)
      if (!topmost) return
      setStoryPanels((current) => current.filter((panel) => panel !== topmost))
      dockButtons.current[topmost]?.focus()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [fieldNotesOpen, settingsOpen, storyPanels])

  return {
    storyMode,
    storyPanels,
    fieldNotesOpen,
    settingsOpen,
    setSettingsOpen,
    setFieldNotesOpen,
    toggleStoryPanel,
    closeStoryPanel,
    closeAllPanels,
    toggleMode,
    dockButtons,
    settingsButton,
  }
}
