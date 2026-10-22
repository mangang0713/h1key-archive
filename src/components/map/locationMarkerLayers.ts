/**
 * 이 모듈은 장소 마커와 클러스터를 MapLibre의 지도 레이어로 생성하고 표시 상태를 관리합니다.
 */

import type { AddLayerObject, Map as MapLibreMap } from 'maplibre-gl';

/** 지도 스타일 갱신 때 각 마커 레이어를 찾아 변경·정리하는 ID입니다. */
export const clusterCircleLayerId = 'archive-location-clusters';
export const clusterCountLayerId = 'archive-location-cluster-counts';
export const locationPinLayerId = 'archive-location-pins';
export const locationCountLayerId = 'archive-location-counts';

const markerImageIds = {
  normal: 'archive-location-pin',
};

function createPinImage(fill: string, stroke: string) {
  const scale = 2;
  const size = 44 * scale;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('지도 마커 이미지를 만들 수 없습니다.');

  context.scale(scale, scale);
  context.shadowColor = 'rgb(21 33 15 / 32%)';
  context.shadowBlur = 3;
  context.shadowOffsetY = 2;
  const pin = new Path2D(
    'M22 2C12 2 6 9 6 18c0 12 16 26 16 26s16-14 16-26C38 9 32 2 22 2Z',
  );
  context.fillStyle = fill;
  context.fill(pin);
  context.shadowColor = 'transparent';
  context.lineWidth = 2.5;
  context.strokeStyle = stroke;
  context.stroke(pin);
  context.beginPath();
  context.arc(22, 18, 6, 0, Math.PI * 2);
  context.fillStyle = '#31551f';
  context.fill();

  return context.getImageData(0, 0, size, size);
}

function addPinImages(map: MapLibreMap) {
  map.addImage(markerImageIds.normal, createPinImage('#fff9e8', '#31551f'), {
    pixelRatio: 2,
  });
}

function addLayer(map: MapLibreMap, layer: AddLayerObject) {
  map.addLayer(layer);
}

/** 일정 장소의 클러스터·핀·일정 수 표시를 지도 스타일에 등록합니다. */
export function addLocationMarkerLayers(map: MapLibreMap, sourceId: string) {
  addPinImages(map);

  addLayer(map, {
    id: 'archive-location-cluster-halo',
    type: 'circle',
    source: sourceId,
    filter: ['has', 'point_count'],
    paint: {
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['zoom'],
        3,
        21,
        9,
        23,
        14,
        25,
      ],
      'circle-color': '#31551f',
      'circle-opacity': 0.72,
    },
  });
  addLayer(map, {
    id: clusterCircleLayerId,
    type: 'circle',
    source: sourceId,
    filter: ['has', 'point_count'],
    paint: {
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['zoom'],
        3,
        18,
        9,
        20,
        14,
        22,
      ],
      'circle-color': '#ed9a82',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  });
  addLayer(map, {
    id: clusterCountLayerId,
    type: 'symbol',
    source: sourceId,
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['to-string', ['get', 'point_count']],
      'text-font': ['Noto Sans Bold'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 3, 14, 9, 16, 14, 18],
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: {
      'text-color': '#233224',
      'text-halo-color': '#ffffff',
      'text-halo-width': 1,
    },
  });
  addLayer(map, {
    id: 'archive-location-active-halo',
    type: 'circle',
    source: sourceId,
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-radius': [
        'case',
        ['boolean', ['feature-state', 'journeyActive'], false],
        25,
        0,
      ],
      'circle-color': '#f59e0b',
      'circle-opacity': 0.4,
    },
  });
  addLayer(map, {
    id: locationPinLayerId,
    type: 'symbol',
    source: sourceId,
    filter: ['!', ['has', 'point_count']],
    layout: {
      'icon-image': markerImageIds.normal,
      'icon-anchor': 'bottom',
      'icon-size': ['interpolate', ['linear'], ['zoom'], 4, 0.88, 12, 1],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  });
  addLayer(map, {
    id: locationCountLayerId,
    type: 'symbol',
    source: sourceId,
    filter: [
      'all',
      ['!', ['has', 'point_count']],
      ['>', ['get', 'scheduleCount'], 1],
    ],
    layout: {
      'text-field': ['to-string', ['get', 'scheduleCount']],
      'text-font': ['Noto Sans Bold'],
      'text-size': 13,
      'text-offset': [0, -1],
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: {
      'text-color': '#31551f',
      'text-halo-color': '#fff9e8',
      'text-halo-width': 0.75,
    },
  });
}

/** 시간순 여정 중 일반 핀을 숨기거나 다시 보여 카메라 연출을 분리합니다. */
export function setLocationMarkerLayersVisible(
  map: MapLibreMap,
  visible: boolean,
) {
  const visibility = visible ? 'visible' : 'none';
  for (const id of [
    'archive-location-cluster-halo',
    clusterCircleLayerId,
    clusterCountLayerId,
    'archive-location-active-halo',
    locationPinLayerId,
    locationCountLayerId,
  ]) {
    if (
      map.getLayer(id) &&
      map.getLayoutProperty(id, 'visibility') !== visibility
    ) {
      map.setLayoutProperty(id, 'visibility', visibility);
    }
  }
}
