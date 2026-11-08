// Géodésie WGS84 du moteur (MODELE § 9). Angles en radians, longueurs en m.
// Une position géographique est {lat, lon, alt} ; une position cartésienne géocentrique (ECEF) est {x, y, z}.

export const A = 6_378_137;
export const F = 1 / 298.257223563;
export const B = A * (1 - F);
const E2 = F * (2 - F);
const DEG = Math.PI / 180;

/** Rendre une position géographique à partir de degrés décimaux et d'une altitude en m. */
export const geo_deg = (latDeg, lonDeg, alt = 0) => ({lat: latDeg * DEG, lon: lonDeg * DEG, alt});
export const vers_degres = (radians) => radians / DEG;
export const vers_radians = (degres) => degres * DEG;

/** Rendre les rayons de courbure méridien M et normal N à la latitude `lat`, en m. */
export function rayons_courbure(lat) {
  const s = Math.sin(lat);
  const w = Math.sqrt(1 - E2 * s * s);
  return {meridien: (A * (1 - E2)) / w ** 3, normal: A / w};
}

/** Rendre la position ECEF (m) d'une position géographique. */
export function vers_ecef({lat, lon, alt}) {
  const {normal} = rayons_courbure(lat);
  const c = Math.cos(lat);
  return {
    x: (normal + alt) * c * Math.cos(lon),
    y: (normal + alt) * c * Math.sin(lon),
    z: (normal * (1 - E2) + alt) * Math.sin(lat),
  };
}

/** Rendre la position géographique d'un point ECEF (itération de Bowring, précision submillimétrique). */
export function depuis_ecef({x, y, z}) {
  const p = Math.hypot(x, y);
  let lat = Math.atan2(z, p * (1 - E2));
  for (let i = 0; i < 8; i++) {
    const {normal} = rayons_courbure(lat);
    lat = Math.atan2(z + E2 * normal * Math.sin(lat), p);
  }
  const s = Math.sin(lat);
  // Forme stable de l'altitude, valable aussi près des pôles (où p / cos(lat) diverge).
  const alt = p * Math.cos(lat) + z * s - A * Math.sqrt(1 - E2 * s * s);
  return {lat, lon: Math.atan2(y, x), alt};
}

export const soustraire = (a, b) => ({x: a.x - b.x, y: a.y - b.y, z: a.z - b.z});
export const ajouter = (a, b, facteur = 1) => ({x: a.x + facteur * b.x, y: a.y + facteur * b.y, z: a.z + facteur * b.z});
export const produit_scalaire = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const norme = (v) => Math.hypot(v.x, v.y, v.z);
/** Rendre la distance en ligne droite (oblique) entre deux points ECEF, en m : celle que mesure un capteur. */
export const distance_oblique = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Rendre le cap (rad, depuis le nord, sens horaire) de `a` vers `b` sur la sphère : il oriente une silhouette, l'écart à l'ellipsoïde ne se voit pas. */
export function cap_vers(a, b) {
  const dLon = b.lon - a.lon;
  return Math.atan2(Math.sin(dLon) * Math.cos(b.lat), Math.cos(a.lat) * Math.sin(b.lat) - Math.sin(a.lat) * Math.cos(b.lat) * Math.cos(dLon));
}

/** Rendre le vecteur ECEF `v` exprimé dans le repère local Est-Nord-Haut de `origine` (géographique). */
export function vers_enu(origine, v) {
  const [sl, cl, so, co] = [Math.sin(origine.lat), Math.cos(origine.lat), Math.sin(origine.lon), Math.cos(origine.lon)];
  return {
    e: -so * v.x + co * v.y,
    n: -sl * co * v.x - sl * so * v.y + cl * v.z,
    u: cl * co * v.x + cl * so * v.y + sl * v.z,
  };
}

/** Rendre le vecteur ENU `v` (repère local de `origine`) exprimé en ECEF. */
export function depuis_enu(origine, {e, n, u}) {
  const [sl, cl, so, co] = [Math.sin(origine.lat), Math.cos(origine.lat), Math.sin(origine.lon), Math.cos(origine.lon)];
  return {
    x: -so * e - sl * co * n + cl * co * u,
    y: co * e - sl * so * n + cl * so * u,
    z: cl * n + sl * u,
  };
}

const coefficients = (u2) => ({
  a: 1 + (u2 / 16384) * (4096 + u2 * (-768 + u2 * (320 - 175 * u2))),
  b: (u2 / 1024) * (256 + u2 * (-128 + u2 * (74 - 47 * u2))),
});

const delta_sigma = (b, sinS, cosS, cos2Sm) =>
  b * sinS * (cos2Sm + (b / 4) * (cosS * (-1 + 2 * cos2Sm ** 2) - (b / 6) * cos2Sm * (-3 + 4 * sinS ** 2) * (-3 + 4 * cos2Sm ** 2)));

/**
 * Rendre la distance géodésique (m, sur l'ellipsoïde) et les azimuts de départ et d'arrivée (rad) entre deux points
 * (méthode de Vincenty). Lève une erreur pour deux points quasi antipodaux, où la méthode ne converge pas.
 */
export function inverse(p1, p2) {
  const L = p2.lon - p1.lon;
  const U1 = Math.atan((1 - F) * Math.tan(p1.lat));
  const U2 = Math.atan((1 - F) * Math.tan(p2.lat));
  const [sinU1, cosU1, sinU2, cosU2] = [Math.sin(U1), Math.cos(U1), Math.sin(U2), Math.cos(U2)];
  let lambda = L;
  for (let iteration = 0; iteration < 200; iteration++) {
    const [sinL, cosL] = [Math.sin(lambda), Math.cos(lambda)];
    const sinS = Math.hypot(cosU2 * sinL, cosU1 * sinU2 - sinU1 * cosU2 * cosL);
    if (sinS === 0) return {distance: 0, azimut_depart: 0, azimut_arrivee: 0};
    const cosS = sinU1 * sinU2 + cosU1 * cosU2 * cosL;
    const sigma = Math.atan2(sinS, cosS);
    const sinAlpha = (cosU1 * cosU2 * sinL) / sinS;
    const cos2Alpha = 1 - sinAlpha ** 2;
    // Ligne géodésique équatoriale : cos²α = 0 et le terme cos 2σm n'a pas de sens, on le prend nul.
    const cos2Sm = cos2Alpha === 0 ? 0 : cosS - (2 * sinU1 * sinU2) / cos2Alpha;
    const C = (F / 16) * cos2Alpha * (4 + F * (4 - 3 * cos2Alpha));
    const precedent = lambda;
    lambda = L + (1 - C) * F * sinAlpha * (sigma + C * sinS * (cos2Sm + C * cosS * (-1 + 2 * cos2Sm ** 2)));
    if (Math.abs(lambda - precedent) < 1e-12) {
      const {a, b} = coefficients((cos2Alpha * (A * A - B * B)) / (B * B));
      return {
        distance: B * a * (sigma - delta_sigma(b, sinS, cosS, cos2Sm)),
        azimut_depart: Math.atan2(cosU2 * Math.sin(lambda), cosU1 * sinU2 - sinU1 * cosU2 * Math.cos(lambda)),
        azimut_arrivee: Math.atan2(cosU1 * Math.sin(lambda), -sinU1 * cosU2 + cosU1 * sinU2 * Math.cos(lambda)),
      };
    }
  }
  throw new Error("géodésique non convergente : points quasi antipodaux");
}

/** Rendre le point atteint depuis `depart` en suivant la géodésique d'azimut `azimut` (rad) sur `distance` m (Vincenty). */
export const direct = (depart, azimut, distance) => direct_avec_azimut(depart, azimut, distance).position;

/** Rendre le point atteint par direct() et l'azimut (rad) de la géodésique à l'arrivée. */
export function direct_avec_azimut(depart, azimut, distance) {
  const U1 = Math.atan((1 - F) * Math.tan(depart.lat));
  const [sinU1, cosU1, sinA1, cosA1] = [Math.sin(U1), Math.cos(U1), Math.sin(azimut), Math.cos(azimut)];
  const sigma1 = Math.atan2(Math.tan(U1), cosA1);
  const sinAlpha = cosU1 * sinA1;
  const cos2Alpha = 1 - sinAlpha ** 2;
  const {a, b} = coefficients((cos2Alpha * (A * A - B * B)) / (B * B));
  let sigma = distance / (B * a);
  let cos2Sm = 0;
  for (let iteration = 0; iteration < 200; iteration++) {
    cos2Sm = Math.cos(2 * sigma1 + sigma);
    const suivant = distance / (B * a) + delta_sigma(b, Math.sin(sigma), Math.cos(sigma), cos2Sm);
    if (Math.abs(suivant - sigma) < 1e-12) break;
    sigma = suivant;
  }
  const [sinS, cosS] = [Math.sin(sigma), Math.cos(sigma)];
  const reste = sinU1 * sinS - cosU1 * cosS * cosA1;
  const lat = Math.atan2(sinU1 * cosS + cosU1 * sinS * cosA1, (1 - F) * Math.hypot(sinAlpha, reste));
  const lambda = Math.atan2(sinS * sinA1, cosU1 * cosS - sinU1 * sinS * cosA1);
  const C = (F / 16) * cos2Alpha * (4 + F * (4 - 3 * cos2Alpha));
  const L = lambda - (1 - C) * F * sinAlpha * (sigma + C * sinS * (cos2Sm + C * cosS * (-1 + 2 * cos2Sm ** 2)));
  return {
    position: {lat, lon: normaliser_longitude(depart.lon + L), alt: depart.alt},
    azimut: Math.atan2(sinAlpha, -reste),
  };
}

/** Rendre `point` décalé de `decalage` m perpendiculairement (vers la gauche si positif) à la direction `azimut`. */
export function decaler_lateralement(point, azimut, decalage) {
  return decalage >= 0 ? direct(point, azimut - Math.PI / 2, decalage) : direct(point, azimut + Math.PI / 2, -decalage);
}

/** Rendre le point à `distance` m de `origine` dans l'azimut `azimut`, décalé latéralement de `decalage` m. */
export function point_radial(origine, azimut, distance, decalage) {
  const {position, azimut: local} = direct_avec_azimut(origine, azimut, distance);
  return decaler_lateralement(position, local, decalage);
}

/** Rendre une longitude ramenée dans ]−π, π]. */
export function normaliser_longitude(lon) {
  return lon - 2 * Math.PI * Math.floor((lon + Math.PI) / (2 * Math.PI));
}

/**
 * Rendre l'écart horizontal local (m) entre `position` (d'ECEF `ecefPosition`) et le point ECEF `ecefBut`, pris à la
 * même altitude, et la position après un pas de `pas` m vers lui à altitude constante — null si l'écart est inférieur
 * au pas (MODELE § 9.3). La direction, recalculée à chaque pas dans le plan tangent, suit la géodésique.
 */
export function avancer_horizontalement(position, ecefPosition, ecefBut, pas) {
  const local = vers_enu(position, soustraire(ecefBut, ecefPosition));
  const ecart = Math.hypot(local.e, local.n);
  if (ecart <= pas) return {ecart, position: null};
  const {meridien, normal} = rayons_courbure(position.lat);
  const lat = position.lat + (pas * local.n) / ecart / (meridien + position.alt);
  const lon = position.lon + (pas * local.e) / ecart / ((normal + position.alt) * Math.cos(position.lat));
  return {ecart, position: {lat, lon: normaliser_longitude(lon), alt: position.alt}};
}

/** Rendre la position après un pas horizontal de `pas` m vers `but`, à altitude constante, et si le but est atteint. */
export function pas_vers(position, but, pas) {
  const ecefBut = vers_ecef({...but, alt: position.alt});
  const {position: suivante} = avancer_horizontalement(position, vers_ecef(position), ecefBut, pas);
  return suivante ? {...suivante, atteint: false} : {lat: but.lat, lon: but.lon, alt: position.alt, atteint: true};
}

/** Rendre la distance horizontale locale (m) de `position` à `but`, mesurée dans le plan tangent de `position`. */
export function distance_horizontale(position, but) {
  return avancer_horizontalement(position, vers_ecef(position), vers_ecef({...but, alt: position.alt}), Infinity).ecart;
}
