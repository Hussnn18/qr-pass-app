import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { VENUE_TYPES } from '../data/constants';

// GNDEC Ludhiana campus on OpenStreetMap.
export const CAMPUS_CENTER = [30.8596, 75.8616];
const MAX_BOUNDS = [[30.851, 75.855], [30.869, 75.869]];

export const hasPosition = (p) => typeof p?.lat === 'number' && typeof p?.lng === 'number';
export const directionsUrl = (p) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=walking`;

function pinIcon(type, active, draft) {
  const t = VENUE_TYPES[type] || VENUE_TYPES.OTHER;
  return L.divIcon({
    className: 'map-pin-wrap',
    html: `<span class="map-pin ${active ? 'active' : ''} ${draft ? 'draft' : ''}" style="--c:${t.color}"><i class="bi bi-${t.icon}"></i></span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 36],
    popupAnchor: [0, -34],
  });
}

function FlyTo({ target, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), zoom), { duration: 0.5 });
  }, [target?.id, target?.lat, target?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function ClickCapture({ onClick }) {
  useMapEvents({ click: (e) => onClick(e.latlng) });
  return null;
}

/** Fixes grey tiles when the map is mounted inside a tab or modal that was hidden. */
function SizeFix() {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 200);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

/**
 * Leaflet map of the campus. `places` need { id, name, type, lat, lng }; places without coordinates are skipped.
 * `draft` is an extra, draggable marker used by the admin "place on map" editor.
 */
export default function CampusMap({
  places, selectedId, onSelect, height = 520, zoom = 17, renderPopup, onMapClick, onDragEnd, draft, className = '', interactive = true,
}) {
  const markers = useRef({});
  const located = useMemo(() => places.filter(hasPosition), [places]);
  const selected = useMemo(() => located.find((p) => p.id === selectedId) || (hasPosition(draft) ? draft : null), [located, selectedId, draft]);

  useEffect(() => {
    if (selectedId && renderPopup) {
      const t = setTimeout(() => markers.current[selectedId]?.openPopup(), 550);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [selectedId, renderPopup]);

  return (
    <MapContainer
      center={selected ? [selected.lat, selected.lng] : CAMPUS_CENTER}
      zoom={zoom}
      minZoom={15}
      maxBounds={MAX_BOUNDS}
      style={{ height }}
      className={`campus-map ${className}`}
      scrollWheelZoom={interactive}
      dragging={interactive}
      zoomControl={interactive}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      {located.map((p) => (
        <Marker
          key={p.id}
          position={[p.lat, p.lng]}
          icon={pinIcon(p.type, p.id === selectedId)}
          title={p.name}
          alt={p.name}
          ref={(m) => { if (m) markers.current[p.id] = m; }}
          eventHandlers={{ click: () => onSelect?.(p.id) }}
        >
          {renderPopup && <Popup>{renderPopup(p)}</Popup>}
        </Marker>
      ))}
      {hasPosition(draft) && (
        <Marker position={[draft.lat, draft.lng]} icon={pinIcon(draft.type, true, true)} draggable title="New position"
          eventHandlers={{ dragend: (e) => onDragEnd?.(e.target.getLatLng()) }} />
      )}
      <FlyTo target={selected} zoom={zoom} />
      <SizeFix />
      {onMapClick && <ClickCapture onClick={onMapClick} />}
    </MapContainer>
  );
}
