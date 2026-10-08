import { useEffect, useRef } from 'react'
import { Map, setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import './App.css'

setWorkerUrl(workerUrl)

function App() {
  const mapContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!mapContainerRef.current) return

    const map = new Map({
      container: mapContainerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [127.8, 36.3],
      zoom: 6,
      pitch: 0,
      minPitch: 0,
      maxPitch: 0,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    })

    map.touchZoomRotate.disableRotation()

    return () => {
      map.remove()
    }
  }, [])

  return (
    <main>
      <div
        ref={mapContainerRef}
        className="map-container"
        role="region"
        aria-label="H1-KEY Activity Archive 대한민국 지도"
      />
    </main>
  )
}

export default App
