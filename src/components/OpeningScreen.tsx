type OpeningScreenProps = {
  query: string
  onQueryChange: (value: string) => void
  onSearchLoadedPlaces: () => void
  onOnlineShortcut: (placeName: string) => void
}

const dropInPlaces = [
  { name: 'Trevi Fountain', location: 'Rome · Italy' },
  { name: 'Shibuya Crossing', location: 'Tokyo · Japan' },
  { name: 'Bryggen Wharf', location: 'Bergen · Norway' },
]

export function OpeningScreen({ query, onQueryChange, onSearchLoadedPlaces, onOnlineShortcut }: OpeningScreenProps) {
  return (
    <section className="opening-screen" aria-labelledby="opening-title">
      <div className="opening-pins" aria-hidden="true"><i /><i /><i /><i /></div>
      <p className="eyebrow">A map. A companion. Wherever you point.</p>
      <h2 id="opening-title">Every place on Earth is a <em>doorway</em> into a story.</h2>
      <p className="opening-description">Pick a real location, learn what’s actually there, and roleplay a journey with a companion you create. No fixed path — you can wander anywhere.</p>
      <form className="opening-search" onSubmit={(event) => { event.preventDefault(); onSearchLoadedPlaces() }}>
        <label htmlFor="opening-place-search">Choose where your story begins</label>
        <div><span className="opening-search-icon" aria-hidden="true">⌕</span><input id="opening-place-search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search loaded map places, a city, a landmark…" /><button type="submit">Begin <span aria-hidden="true">→</span></button></div>
      </form>
      <div className="drop-in-places">
        <span>— or drop in somewhere —</span>
        {dropInPlaces.map((place) => <button key={place.name} type="button" onClick={() => onOnlineShortcut(place.name)}><strong>{place.name}</strong><small>{place.location}</small></button>)}
        <button type="button" onClick={() => onOnlineShortcut(dropInPlaces[Math.floor(Math.random() * dropInPlaces.length)].name)}><strong>Surprise me</strong><small>A random doorway</small></button>
      </div>
      <p className="opening-fine">Typing searches loaded map data first. Shortcuts make one explicit online lookup when selected.</p>
    </section>
  )
}
