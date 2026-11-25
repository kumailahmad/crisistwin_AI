"use client";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";
import { Circle, LayerGroup, LayersControl, MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";

export type Pin = { lat: number; lon: number; accuracy?: number | null };
const pinIcon = L.divIcon({ className: "", html: '<div class="report-pin"><span></span></div>', iconSize: [34, 44], iconAnchor: [17, 42] });
const ESRI = "Tiles &copy; Esri";

function Clicker({ onPick }: { onPick: (p: Pin) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lon: e.latlng.lng }) });
  return null;
}
function Fly({ pin, nonce }: { pin: Pin | null; nonce: number }) {
  const map = useMap(); const last = useRef(0);
  useEffect(() => {
    if (!pin || nonce === last.current) return; last.current = nonce;
    const z = pin.accuracy && pin.accuracy > 500 ? 13 : 16; map.flyTo([pin.lat, pin.lon], Math.max(map.getZoom(), z), { duration: 0.8 });
  }, [pin, nonce, map]);
  return null;
}

export default function LocationPickerInner({ pin, onChange, flyNonce }: { pin: Pin | null; onChange: (p: Pin) => void; flyNonce: number }) {
  return (
    <MapContainer center={[28.4, 65.6]} zoom={6} minZoom={5} maxZoom={19} className="h-full w-full" scrollWheelZoom>
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Satellite + labels">
          <LayerGroup>
            <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution={ESRI} maxZoom={18} />
            <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" maxZoom={18} />
          </LayerGroup>
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Streets">
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap contributors' maxZoom={19} />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Terrain">
          <TileLayer url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png" attribution="&copy; OpenTopoMap" maxZoom={17} />
        </LayersControl.BaseLayer>
      </LayersControl>
      <Clicker onPick={onChange} />
      <Fly pin={pin} nonce={flyNonce} />
      {pin && (
        <>
          {pin.accuracy ? <Circle center={[pin.lat, pin.lon]} radius={pin.accuracy} pathOptions={{ color: "#22d3ee", weight: 1, fillOpacity: 0.12 }} /> : null}
          <Marker position={[pin.lat, pin.lon]} icon={pinIcon} draggable eventHandlers={{ dragend: (e) => { const ll = (e.target as L.Marker).getLatLng(); onChange({ lat: ll.lat, lon: ll.lng }); } }} />
        </>
      )}
    </MapContainer>
  );
}
