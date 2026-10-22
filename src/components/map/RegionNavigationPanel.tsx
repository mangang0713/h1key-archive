/**
 * 이 패널은 현재 지역 밖의 국가를 선택해 지도 카메라 이동을 요청합니다.
 */

import { useEffect, useRef } from 'react';
import type { CountryCode } from '../../types/archive';

/** 지역 메뉴에 실제 일정이 있는 국가만 보여주기 위한 표시 자료입니다. */
export type RegionNavigationOption = {
  countryCode: CountryCode;
  label: string;
  locationCount: number;
  scheduleCount: number;
};

type RegionNavigationPanelProps = {
  regions: RegionNavigationOption[];
  onClose: () => void;
  onSelect: (countryCode: CountryCode) => void;
};

/** 현재 국가를 제외한 지역 선택지를 보여주고 카메라 이동을 요청합니다. */
function RegionNavigationPanel({
  regions,
  onClose,
  onSelect,
}: RegionNavigationPanelProps) {
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  return (
    <aside
      ref={panelRef}
      id="region-navigation-panel"
      className="region-navigation-panel"
      aria-label="이동할 지역 선택"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <header>
        <h2>이동할 지역 선택</h2>
        <button
          type="button"
          className="region-navigation-close"
          aria-label="지역 선택 메뉴 닫기"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <ul>
        {regions.map((region) => (
          <li key={region.countryCode}>
            <button
              type="button"
              className="region-navigation-choice"
              onClick={() => onSelect(region.countryCode)}
            >
              <strong>{region.label}</strong>
              <span>
                장소 {region.locationCount}곳 · 일정 {region.scheduleCount}건
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export default RegionNavigationPanel;
