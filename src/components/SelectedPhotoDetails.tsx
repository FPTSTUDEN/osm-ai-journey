import type { Place, PlacePhoto } from '../types/domain'

type Props = {
  photo: PlacePhoto
  destination: Place
  onBack: () => void
}

export function SelectedPhotoDetails({ photo, destination, onBack }: Props) {
  return (
    <aside className="place-detail photo-detail" aria-label="Selected photo">
      <button type="button" className="back-button" onClick={onBack}>← Back to {destination.name}</button>
      <img className="photo-detail-image" src={photo.thumbnailUrl} alt={photo.title} />
      <p className="eyebrow">Photo</p><h3 className="photo-detail-title">{photo.title}</h3>
      <dl className="place-facts">
        <div><dt>Distance</dt><dd>{photo.distanceMeters === undefined ? 'Unknown' : photo.distanceMeters < 50 ? 'At destination' : `${(photo.distanceMeters / 1000).toFixed(1)} km away`}</dd></div>
        <div><dt>Location</dt><dd>{photo.photoCoordinates ? `${photo.photoCoordinates[1].toFixed(5)}, ${photo.photoCoordinates[0].toFixed(5)}` : 'No geotag'}</dd></div>
        {photo.author && <div><dt>Author</dt><dd>{photo.author}</dd></div>}
        {photo.license && <div><dt>Licence</dt><dd>{photo.license}{photo.licenseUrl && <> · <a href={photo.licenseUrl} target="_blank" rel="noreferrer">details</a></>}</dd></div>}
        {photo.publishedAt && <div><dt>Date</dt><dd>{photo.publishedAt}</dd></div>}
      </dl>
      {photo.description && <p className="context-summary">{photo.description}</p>}
      <p className="photo-note">This photo is in the companion's context for your next message. Going back removes it.</p>
      <div className="context-links"><a href={photo.sourceUrl} target="_blank" rel="noreferrer">View on Wikimedia</a></div>
    </aside>
  )
}
