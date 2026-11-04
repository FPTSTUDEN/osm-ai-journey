type OpeningScreenProps = {
  query: string
  onQueryChange: (value: string) => void
  onSearchLoadedPlaces: () => void
  onOnlineShortcut: (placeName: string) => void
}

const dropInPlaces = ['Trevi Fountain', 'Shibuya Crossing', 'Bryggen Wharf']

export function OpeningScreen({ query, onQueryChange, onSearchLoadedPlaces, onOnlineShortcut }: OpeningScreenProps) {
  return (
    <section className="opening-screen" aria-labelledby="opening-title">
      <div className="opening-pins" aria-hidden="true"><i /><i /><i /><i /></div>
      <p className="eyebrow">A story with a real-world setting</p>
      <h2 id="opening-title">Where shall we begin?</h2>
      <p>Choose a place or start chatting. No destination is required.</p>
      <form className="opening-search" onSubmit={(event) => { event.preventDefault(); onSearchLoadedPlaces() }}>
        <label htmlFor="opening-place-search">Search loaded map places</label>
        <div><input id="opening-place-search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Try a place name" /><button type="submit">Search map</button></div>
      </form>
      <div className="drop-in-places">
        <span>Drop in · online search starts only when selected</span>
        {dropInPlaces.map((place) => <button key={place} type="button" onClick={() => onOnlineShortcut(place)}>{place}</button>)}
        <button type="button" onClick={() => onOnlineShortcut(dropInPlaces[Math.floor(Math.random() * dropInPlaces.length)])}>Surprise me</button>
      </div>
    </section>
  )
}
