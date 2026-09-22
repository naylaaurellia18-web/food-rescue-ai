const EARTH_RADIUS_KM = 6371;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some((v) => v == null || Number.isNaN(v))) return null;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

function estimateDurationMin(distanceKm, speedKmh = 25) {
  if (distanceKm == null) return null;
  return Math.max(5, Math.round((distanceKm / speedKmh) * 60));
}

function buildRoute({ donor, recipient, courier }) {
  const leg1 = haversineKm(courier.lat, courier.lng, donor.lat, donor.lng);
  const leg2 = haversineKm(donor.lat, donor.lng, recipient.lat, recipient.lng);
  const total = leg1 != null && leg2 != null ? leg1 + leg2 : null;
  return {
    waypoints: [
      { label: 'Kurir (posisi awal)', lat: courier.lat, lng: courier.lng },
      { label: `Penjemputan: ${donor.name}`, lat: donor.lat, lng: donor.lng },
      { label: `Pengantaran: ${recipient.name}`, lat: recipient.lat, lng: recipient.lng },
    ],
    legs: [
      { from: 'Kurir', to: 'Donor', distance_km: Number((leg1 ?? 0).toFixed(2)), duration_min: estimateDurationMin(leg1) },
      { from: 'Donor', to: 'Penerima', distance_km: Number((leg2 ?? 0).toFixed(2)), duration_min: estimateDurationMin(leg2) },
    ],
    total_distance_km: Number((total ?? 0).toFixed(2)),
    total_duration_min: estimateDurationMin(total),
  };
}

module.exports = { haversineKm, buildRoute, estimateDurationMin };
