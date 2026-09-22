const { haversineKm, buildRoute } = require('./gis');

const WEIGHTS = {
  expiry: 0.35,
  distance: 0.3,
  urgency: 0.2,
  capacity: 0.15,
};

const URGENCY_SCORE = { critical: 1.0, high: 0.75, medium: 0.5, low: 0.25 };
const MAX_DISTANCE_KM = 30;

function expiryScore(listing, now = Date.now()) {
  const expiry = new Date(listing.expiry_at).getTime();
  const hoursLeft = (expiry - now) / 3600000;
  if (hoursLeft <= 0) return 0;
  if (hoursLeft <= 2) return 1.0;
  if (hoursLeft <= 6) return 0.85;
  if (hoursLeft <= 12) return 0.7;
  if (hoursLeft <= 24) return 0.5;
  return 0.3;
}

function distanceScore(km) {
  if (km == null) return 0;
  if (km <= 1) return 1.0;
  if (km >= MAX_DISTANCE_KM) return 0;
  return 1 - (km - 1) / (MAX_DISTANCE_KM - 1);
}

function capacityScore(courier, portions) {
  if (!courier.capacity || courier.capacity <= 0) return 0;
  const ratio = portions / courier.capacity;
  if (ratio <= 1) return 1.0;
  if (ratio <= 1.5) return 0.6;
  return 0.2;
}

function scoreTriplet(listing, need, courier) {
  const d = donorLatLng(listing);
  const r = needLatLng(need);
  const c = courierLatLng(courier);
  const leg1 = haversineKm(c.lat, c.lng, d.lat, d.lng);
  const leg2 = haversineKm(d.lat, d.lng, r.lat, r.lng);
  const km = leg1 != null && leg2 != null ? leg1 + leg2 : null;
  const sExpiry = expiryScore(listing);
  const sDist = distanceScore(km);
  const sUrgency = URGENCY_SCORE[need.urgency] ?? 0.5;
  const sCap = capacityScore(courier, listing.portions);
  const total =
    WEIGHTS.expiry * sExpiry +
    WEIGHTS.distance * sDist +
    WEIGHTS.urgency * sUrgency +
    WEIGHTS.capacity * sCap;
  return {
    km,
    sExpiry,
    sDist,
    sUrgency,
    sCap,
    total: Number(total.toFixed(4)),
  };
}

function donorLatLng(l) {
  return { lat: l.lat ?? l.donor_lat, lng: l.lng ?? l.donor_lng };
}
function needLatLng(n) {
  return { lat: n.lat ?? n.recipient_lat, lng: n.lng ?? n.recipient_lng };
}
function courierLatLng(c) {
  return { lat: c.lat, lng: c.lng };
}

function computeMatches({ listings, needs, couriers, now = Date.now() }) {
  const candidates = [];

  for (const listing of listings) {
    if (listing.status !== 'available') continue;
    if (new Date(listing.expiry_at).getTime() <= now) continue;

    for (const need of needs) {
      if (need.status !== 'open') continue;
      if (need.portions_needed > listing.portions * 1.5) continue;
      if (need.recipient_id === listing.donor_id) continue;

      for (const courier of couriers) {
        const s = scoreTriplet(listing, need, courier);
        if (s.km == null || s.km > MAX_DISTANCE_KM) continue;
        if (s.total < 0.3) continue;
        candidates.push({
          listing_id: listing.id,
          need_id: need.id,
          courier_id: courier.id,
          score: s.total,
          score_expiry: s.sExpiry,
          score_distance: s.sDist,
          score_urgency: s.sUrgency,
          score_capacity: s.sCap,
          distance_km: Number(s.km.toFixed(2)),
          _listing: listing,
          _need: need,
          _courier: courier,
        });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const usedListings = new Set();
  const usedNeeds = new Set();
  const usedCouriers = new Set();
  const selected = [];

  for (const c of candidates) {
    if (usedListings.has(c.listing_id)) continue;
    if (usedNeeds.has(c.need_id)) continue;
    if (usedCouriers.has(c.courier_id)) continue;
    usedListings.add(c.listing_id);
    usedNeeds.add(c.need_id);
    usedCouriers.add(c.courier_id);

    const donor = {
      name: c._listing.donor_name ?? 'Donor',
      lat: c._listing.lat ?? c._listing.donor_lat,
      lng: c._listing.lng ?? c._listing.donor_lng,
    };
    const recipient = {
      name: c._need.recipient_name ?? 'Penerima',
      lat: c._need.lat ?? c._need.recipient_lat,
      lng: c._need.lng ?? c._need.recipient_lng,
    };
    const courier = {
      name: c._courier.name,
      lat: c._courier.lat,
      lng: c._courier.lng,
    };

    c.route_json = JSON.stringify(buildRoute({ donor, recipient, courier }));
    delete c._listing;
    delete c._need;
    delete c._courier;
    selected.push(c);
  }

  return selected;
}

module.exports = { computeMatches, WEIGHTS, scoreTriplet };
