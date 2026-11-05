type ArrivalCardProps = {
  placeName: string
  sceneNumber: number
}

export function ArrivalCard({ placeName, sceneNumber }: ArrivalCardProps) {
  return (
    <div className="arrival-card" role="status" aria-live="polite">
      <p className="eyebrow">Scene {String(sceneNumber).padStart(2, '0')} · arrival</p>
      <strong>You arrive at {placeName}</strong>
    </div>
  )
}
