export type PersonaSpriteMetadata = {
  id: string
  personaName: string
  styleName: string
  label: string
  description: string
}

const spriteFilenamePattern = /^([a-z0-9]+(?:-[a-z0-9]+)*)-sprite-([a-z0-9]+(?:-[a-z0-9]+)*)\.(?:png|webp|jpe?g)$/i

function titleCase(value: string): string {
  return value.split('-').map((word) => `${word[0]?.toLocaleUpperCase() ?? ''}${word.slice(1)}`).join(' ')
}

export function parsePersonaSpriteFilename(filename: string): PersonaSpriteMetadata | null {
  const match = filename.split(/[\\/]/).at(-1)?.match(spriteFilenamePattern)
  if (!match) return null
  const [, rawPersonaSlug, rawStyleSlug] = match
  const personaSlug = rawPersonaSlug.toLocaleLowerCase()
  const styleSlug = rawStyleSlug.toLocaleLowerCase()
  const personaName = titleCase(personaSlug)
  const styleName = titleCase(styleSlug)
  return {
    id: styleSlug === 'classic' ? personaSlug : `${personaSlug}-${styleSlug}`,
    personaName,
    styleName,
    label: `${personaName} · ${styleName}`,
    description: `${styleName} style portrait for ${personaName}.`,
  }
}
