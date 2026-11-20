import type { ChatEntry, StoryBlock, StoryPresentationMode, StoryProgress } from '../types/domain'
import type { SpeakerResolver } from '../hooks/useEntrySpeakers'

type Props = {
  entries: ChatEntry[]
  mode: StoryPresentationMode
  /** Who wrote an entry: its own persona, or the active one for older entries. */
  speakerFor: SpeakerResolver
  animatedEntryId: string | null
  revealedLength: number
  reduceMotion: boolean
  isTyping: boolean
  expanded: boolean
  storyProgress: StoryProgress | null
  onAdvance: () => void
}

function visibleText(entry: ChatEntry, props: Props) {
  if (entry.role === 'assistant' && entry.id === props.animatedEntryId && !props.reduceMotion && entry.storyTurn?.format !== 'structured') {
    return entry.text.slice(0, props.revealedLength)
  }
  return entry.text
}

const sameName = (a: string, b: string | undefined) => Boolean(b) && a.trim().toLocaleLowerCase() === b!.trim().toLocaleLowerCase()

/** A dialogue speaker is the entry's author if it matches the author's current name or the name used when it was written. */
function isAuthor(speaker: string, entry: ChatEntry, authorName: string) {
  return sameName(speaker, authorName) || sameName(speaker, entry.persona?.name)
}

function CharacterAvatar({ imageUrl, side }: { name: string; imageUrl?: string | null; side?: string }) {
  return <span className={`story-avatar ${imageUrl ? '' : 'story-avatar-empty'} ${side ? `story-avatar-${side}` : ''}`} aria-hidden="true">
    {imageUrl && <img src={imageUrl} alt="" />}
  </span>
}

function NovelEntry({ entry, props }: { entry: ChatEntry; props: Props }) {
  const roleClass = entry.role === 'event' ? 'narration event' : entry.role === 'user' ? 'user-action' : 'narration'
  const shouldAnimate = entry.role === 'user' || entry.id === props.animatedEntryId
  return <div className={`message ${roleClass} ${shouldAnimate ? 'story-entry-arrive' : ''}`} key={entry.id}><p>{visibleText(entry, props)}</p></div>
}

function ChatEntryView({ entry, props }: { entry: ChatEntry; props: Props }) {
  if (entry.role === 'event') return <div className="chat-narration chat-narration-event" key={entry.id}><span>Journey event</span><p>{entry.text}</p></div>
  if (entry.role === 'user') return <article className="chat-line chat-line-user story-entry-arrive" key={entry.id}>
    <div className="chat-bubble"><span className="chat-speaker">You</span><p>{entry.text}</p></div>
  </article>

  const blocks = entry.storyTurn?.blocks ?? [{ id: `${entry.id}:1`, type: 'prose' as const, text: visibleText(entry, props) }]
  const finalDialogueId = [...blocks].reverse().find((block) => block.type === 'dialogue')?.id
  return <div className={`chat-assistant-turn ${entry.id === props.animatedEntryId ? 'story-entry-arrive' : ''}`} key={entry.id}>
    {blocks.map((block) => {
      if (block.type === 'narration' || block.type === 'scene') return <div className={`chat-narration ${block.type === 'scene' ? `chat-narration-scene ${entry.id === props.animatedEntryId ? 'scene-transition' : ''}` : ''}`} key={block.id}>
        <span>{block.type === 'scene' ? 'Scene' : 'Narration'}</span><p>{block.text}</p>
      </div>
      const author = props.speakerFor(entry)
      const speaker = block.type === 'dialogue' ? block.speaker : author.name
      const imageUrl = isAuthor(speaker, entry, author.name) ? author.imageUrl : null
      return <article className={`chat-line ${entry.id === props.animatedEntryId && block.id === finalDialogueId ? 'speaker-focus' : ''}`} key={block.id}>
        <CharacterAvatar name={speaker} imageUrl={imageUrl} />
        <div className="chat-bubble"><span className="chat-speaker">{speaker}</span><p>{block.text}</p></div>
      </article>
    })}
  </div>
}

function VisualNovelEntry({ entry, props }: { entry: ChatEntry; props: Props }) {
  if (entry.role === 'event') return <div className="vn-event" key={entry.id}><span>Journey event</span><p>{entry.text}</p></div>
  if (entry.role === 'user') return <div className="vn-player-line story-entry-arrive" key={entry.id}><span>You</span><p>{entry.text}</p></div>
  const blocks = entry.storyTurn?.blocks ?? [{ id: `${entry.id}:1`, type: 'prose' as const, text: visibleText(entry, props) }]
  const finalDialogueId = [...blocks].reverse().find((block) => block.type === 'dialogue')?.id
  const currentBlock = props.storyProgress?.entryId === entry.id ? props.storyProgress.blockIndex : blocks.length - 1
  const activeBlockId = props.expanded ? null : blocks[currentBlock]?.id
  const presentedBlocks = props.expanded ? blocks : [blocks[currentBlock] ?? blocks.at(-1)].filter((block): block is StoryBlock => Boolean(block))
  return <div className="vn-story-turn" key={entry.id} onClick={(event) => {
    if (event.target instanceof Element && event.target.closest('button,a,input,textarea,select,[contenteditable="true"]')) return
    props.onAdvance()
  }}>
    {presentedBlocks.map((block) => {
      const isActiveBlock = block.id === activeBlockId
      if (block.type === 'scene') return <div className={`vn-event ${entry.id === props.animatedEntryId ? 'scene-transition' : ''} ${isActiveBlock ? 'story-block-arrive' : ''}`} key={block.id}><span>Scene</span><p>{block.text}</p></div>
      if (block.type === 'narration') return <p className={`vn-narration ${isActiveBlock ? 'story-block-arrive' : ''}`} key={block.id}>{block.text}</p>
      const speaker = block.type === 'dialogue' ? block.speaker : props.speakerFor(entry).name
      return <div className={`vn-dialogue ${entry.id === props.animatedEntryId && block.id === finalDialogueId ? 'speaker-focus' : ''} ${isActiveBlock ? 'story-block-arrive' : ''}`} key={block.id}>
        <span className="vn-nameplate">{speaker}</span>
        <p>{block.text}</p>
      </div>
    })}
  </div>
}

export function StoryMessageList(props: Props) {
  // The stage shows whoever wrote the reply on screen.
  const stageSpeaker = props.speakerFor([...props.entries].reverse().find((entry) => entry.role === 'assistant'))
  const conversationDepth = props.expanded || props.mode === 'chat' ? 'conversation-expanded' : 'conversation-latest'
  return <div className={`conversation ${conversationDepth} story-conversation story-conversation-${props.mode}`} role="log" aria-live="polite" aria-label="Journey story">
    {props.mode === 'visual-novel' && <div className="vn-character-stage" aria-label="Story character">
      <div className="vn-character vn-character-left"><CharacterAvatar name={stageSpeaker.name} imageUrl={stageSpeaker.imageUrl} side="left" /><span>{stageSpeaker.name}</span></div>
    </div>}
    <div className={`story-entry-list ${props.mode === 'visual-novel' ? 'story-entry-list-vn' : ''}`}>
      {props.entries.map((entry) => props.mode === 'chat'
        ? <ChatEntryView key={entry.id} entry={entry} props={props} />
        : props.mode === 'visual-novel'
          ? <VisualNovelEntry key={entry.id} entry={entry} props={props} />
          : <NovelEntry key={entry.id} entry={entry} props={props} />)}
      {props.isTyping && <div className="typing-indicator" role="status" aria-label="Companion is typing"><span>Typing</span><i /><i /><i /></div>}
    </div>
  </div>
}
