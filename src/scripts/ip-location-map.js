/*
文件说明: IP 位置地图前端逻辑，负责懒加载 MapLibre 并使用 OpenFreeMap 底图渲染经纬度点位。
*/

import 'maplibre-gl/dist/maplibre-gl.css';

const defaultCenter = [0, 18];
let maplibreModule;
const mapByElement = new WeakMap();

export async function renderIpLocationMap(options) {
  const maplibre = await loadMaplibre();
  const latitude = Number(options.location?.latitude);
  const longitude = Number(options.location?.longitude);
  const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);
  const mapCenter = hasCoordinates ? [longitude, latitude] : defaultCenter;
  const locationText = formatLocation(options.location);
  const styleUrl = getOpenFreeMapStyleUrl();
  const state = mapByElement.get(options.element) || createMapState(maplibre, options.element, mapCenter, hasCoordinates ? 8 : 1.2, styleUrl);

  mapByElement.set(options.element, state);
  if (state.styleUrl !== styleUrl) {
    state.map.setStyle(styleUrl);
    state.styleUrl = styleUrl;
  }
  state.map.setCenter(mapCenter);
  state.map.setZoom(hasCoordinates ? getLocationZoom(options.location) : 1.2);

  state.marker?.remove();
  state.popup?.remove();
  state.marker = undefined;
  state.popup = undefined;

  if (hasCoordinates) {
    state.popup = new maplibre.Popup({ closeButton: false, offset: 20 }).setHTML(createPopupHtml({
      ip: options.ip,
      locationText,
      latitude,
      longitude,
    }));
    state.marker = new maplibre.Marker({ color: '#0f766e' })
      .setLngLat([longitude, latitude])
      .setPopup(state.popup)
      .addTo(state.map);
    state.marker.togglePopup();
  }

  if (options.captionElement) {
    options.captionElement.textContent = hasCoordinates
      ? `${locationText} · ${formatCoordinate(latitude)}, ${formatCoordinate(longitude)}`
      : options.emptyCaption || '暂无位置坐标。';
  }
}

export function clearIpLocationMap(element) {
  const state = mapByElement.get(element);
  if (!state) return;

  state.marker?.remove();
  state.popup?.remove();
  state.marker = undefined;
  state.popup = undefined;
  state.map.setCenter(defaultCenter);
  state.map.setZoom(1.2);
}

export function resizeIpLocationMap(element) {
  mapByElement.get(element)?.map.resize();
}

function createMapState(maplibre, element, center, zoom) {
  const styleUrl = arguments[4];
  const map = new maplibre.Map({
    container: element,
    style: styleUrl,
    center,
    zoom,
    attributionControl: {
      compact: true,
    },
  });

  map.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');
  return { map, styleUrl };
}

async function loadMaplibre() {
  if (maplibreModule) return maplibreModule;
  maplibreModule = await import('maplibre-gl');
  return maplibreModule;
}

function getOpenFreeMapStyleUrl() {
  const theme = document.documentElement.getAttribute('data-theme') || 'light';
  return theme === 'dark'
    ? 'https://tiles.openfreemap.org/styles/dark'
    : 'https://tiles.openfreemap.org/styles/positron';
}

function getLocationZoom(location) {
  if (location?.city) return 9;
  if (location?.region) return 6;
  if (location?.countryCode) return 4;
  return 8;
}

function createPopupHtml(params) {
  const rows = [
    params.ip ? `<strong>${escapeHtml(params.ip)}</strong>` : '',
    `<span>${escapeHtml(params.locationText)}</span>`,
    `<span>${formatCoordinate(params.latitude)}, ${formatCoordinate(params.longitude)}</span>`,
  ].filter(Boolean);

  return `<div class="ip-purity-map-popup">${rows.join('')}</div>`;
}

function formatLocation(location) {
  const parts = [
    location?.countryCode,
    location?.region,
    location?.city,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' · ') : 'IP 位置';
}

function formatCoordinate(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(4);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => {
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      '\'': '&#39;',
    };
    return entities[character] || character;
  });
}
