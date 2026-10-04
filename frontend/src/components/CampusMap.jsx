import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { LOCATION_TYPES } from '../data/constants';

// Centre and bounds of the campus polygon on OpenStreetMap.
export const CAMPUS_CENTER = [30.8596, 75.8616];
const MAX_BOUNDS = [[30.851, 75.855], [30.869, 75.869]];

function pinIcon(type, active, draft) {
  const t = LOCATION_TYPES[type] || LOCATION_TYPES.OTHER;
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

export default function CampusMap({
  locations, selectedId, onSelect, height = 520, zoom = 17, renderPopup, onMapClick, draggableId, onDragEnd, draft, className = '',
}) {
  const markers = useRef({});
  const selected = useMemo(() => locations.find((l) => l.id === selectedId) || draft || null, [locations, selectedId, draft]);

  useEffect(() => {
    if (selectedId && renderPopup) {
      const t = setTimeout(() => markers.current[selectedId]?.openPopup(), 550);
      return () => clearTimeout(t);
    }
  }, [selectedId, renderPopup]);

  return (
    <MapContainer
      center={selected ? [selected.lat, selected.lng] : CAMPUS_CENTER}
      zoom={zoom}
      minZoom={15}
      maxBounds={MAX_BOUNDS}
      style={{ height }}
      className={`campus-map ${className}`}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      {locations.map((l) => (
        <Marker
          key={l.id}
          position={[l.lat, l.lng]}
          icon={pinIcon(l.type, l.id === selectedId)}
          title={l.name}
          alt={l.name}
          draggable={draggableId === l.id}
          ref={(m) => { if (m) markers.current[l.id] = m; }}
          eventHandlers={{
            click: () => onSelect?.(l.id),
            dragend: (e) => onDragEnd?.(l.id, e.target.getLatLng()),
          }}
        >
          {renderPopup && <Popup>{renderPopup(l)}</Popup>}
        </Marker>
      ))}
      {draft && (
        <Marker position={[draft.lat, draft.lng]} icon={pinIcon(draft.type, true, true)} draggable eventHandlers={{ dragend: (e) => onDragEnd?.(null, e.target.getLatLng()) }} />
      )}
      <FlyTo target={selected} zoom={zoom} />
      <SizeFix />
      {onMapClick && <ClickCapture onClick={onMapClick} />}
    </MapContainer>
  );
}
