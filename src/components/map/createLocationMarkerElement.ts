type LocationMarkerOptions = {
  isCluster: boolean
  count: number
  locationName?: string
  isActiveTimeTravelLocation?: boolean
}

export function createLocationMarkerElement({
  isCluster,
  count,
  locationName,
  isActiveTimeTravelLocation = false,
}: LocationMarkerOptions): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'

  if (isCluster) {
    button.className = 'cluster-marker'
    button.textContent = String(count)
    button.setAttribute('aria-label', `가까운 장소 ${count}곳, 확대하여 장소 보기`)
    return button
  }

  button.className = 'pin-marker'
  if (isActiveTimeTravelLocation) button.classList.add('journey-active-marker')

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 44 44')
  svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', 'M22 2C12 2 6 9 6 18c0 12 16 26 16 26s16-14 16-26C38 9 32 2 22 2Z')
  const center = document.createElementNS('http://www.w3.org/2000/svg', count === 1 ? 'circle' : 'text')
  if (count === 1) {
    center.setAttribute('cx', '22')
    center.setAttribute('cy', '18')
    center.setAttribute('r', '6')
  } else {
    center.setAttribute('x', '22')
    center.setAttribute('y', '23')
    center.setAttribute('text-anchor', 'middle')
    center.textContent = String(count)
  }
  svg.append(path, center)
  button.append(svg)
  button.setAttribute('aria-label', `${locationName ?? '장소'}, 스케줄 ${count}개 보기`)
  button.setAttribute('aria-haspopup', 'dialog')
  return button
}
