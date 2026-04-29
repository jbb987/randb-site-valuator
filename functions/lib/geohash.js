"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encode = encode;
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
function encode(lat, lng, precision = 7) {
    let latMin = -90, latMax = 90;
    let lngMin = -180, lngMax = 180;
    let hash = '';
    let bit = 0;
    let ch = 0;
    let isLng = true;
    while (hash.length < precision) {
        const mid = isLng ? (lngMin + lngMax) / 2 : (latMin + latMax) / 2;
        if (isLng) {
            if (lng >= mid) {
                ch = ch | (1 << (4 - bit));
                lngMin = mid;
            }
            else {
                lngMax = mid;
            }
        }
        else {
            if (lat >= mid) {
                ch = ch | (1 << (4 - bit));
                latMin = mid;
            }
            else {
                latMax = mid;
            }
        }
        isLng = !isLng;
        if (bit < 4) {
            bit++;
        }
        else {
            hash += BASE32[ch];
            bit = 0;
            ch = 0;
        }
    }
    return hash;
}
//# sourceMappingURL=geohash.js.map