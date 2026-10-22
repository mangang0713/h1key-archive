/**
 * 이 컨트롤러는 지도 이동을 취소하고 축소·국가 이동·확대의 순서로 해외 지역을 안내합니다.
 */

import { LngLatBounds, Map as MapLibreMap } from 'maplibre-gl';
import { archiveRegions } from './archiveMapData';
import type { CountryCode } from '../../types/archive';

/** 지역 이동 중 다른 카메라 요청을 취소하고 선택 상태를 동기화하는 연결입니다. */
type RegionNavigationControllerOptions = {
  map: MapLibreMap;
  duration: () => number;
  discardSelection: () => void;
  nextCameraRequest: () => number;
  isCameraRequestCurrent: (request: number) => boolean;
  onNavigateStart: (countryCode: CountryCode) => void;
};

/** 이동 중 카메라 요청을 무효화하고 대상 국가가 보이도록 단계별로 이동합니다. */
export function createRegionNavigationController({
  map,
  duration,
  discardSelection,
  nextCameraRequest,
  isCameraRequestCurrent,
  onNavigateStart,
}: RegionNavigationControllerOptions) {
  const runCameraTransition = (
    request: number,
    milliseconds: number,
    apply: (durationMs: number) => void,
  ) =>
    new Promise<boolean>((resolve) => {
      if (!isCameraRequestCurrent(request)) {
        resolve(false);
        return;
      }
      const durationMs = duration() === 0 ? 0 : milliseconds;
      if (durationMs === 0) {
        apply(0);
        resolve(isCameraRequestCurrent(request));
        return;
      }
      let completed = false;
      const finish = () => {
        if (completed) return;
        completed = true;
        map.off('moveend', finish);
        resolve(isCameraRequestCurrent(request));
      };
      map.once('moveend', finish);
      apply(durationMs);
      if (!map.isMoving()) finish();
    });

  const navigate = (countryCode: CountryCode) => {
    const region = archiveRegions.find(
      (candidate) => candidate.countryCode === countryCode,
    );
    if (!region || region.locations.length === 0) return;

    onNavigateStart(countryCode);
    const bounds = region.locations.reduce(
      (result, location) => result.extend(location.coordinates),
      new LngLatBounds(
        region.locations[0].coordinates,
        region.locations[0].coordinates,
      ),
    );
    const request = nextCameraRequest();
    map.stop();
    discardSelection();
    const current = map.getCenter();
    const overviewZoom = Math.min(map.getZoom(), 3.5);

    const transition = async () => {
      const zoomedOut = await runCameraTransition(
        request,
        300,
        (durationMs) => {
          const camera = {
            center: [current.lng, current.lat] as [number, number],
            zoom: overviewZoom,
            bearing: 0,
            pitch: 0,
          };
          if (durationMs === 0) map.jumpTo(camera);
          else map.easeTo({ ...camera, duration: durationMs });
        },
      );
      if (!zoomedOut) return;

      const movedAcross = await runCameraTransition(
        request,
        480,
        (durationMs) => {
          const camera = {
            center: bounds.getCenter().toArray() as [number, number],
            zoom: overviewZoom,
            bearing: 0,
            pitch: 0,
          };
          if (durationMs === 0) map.jumpTo(camera);
          else map.easeTo({ ...camera, duration: durationMs });
        },
      );
      if (!movedAcross) return;

      await runCameraTransition(request, 500, (durationMs) => {
        map.fitBounds(bounds, {
          padding: { top: 88, right: 84, bottom: 88, left: 24 },
          maxZoom: 8,
          duration: durationMs,
        });
      });
    };

    void transition();
  };

  return { navigate };
}
