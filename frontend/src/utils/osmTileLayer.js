import L from 'leaflet'

/**
 * OSM public tiles are only valid to ~z19; Leaflet should scale above that via maxNativeZoom,
 * but we also cap the zoom used in tile URLs so misconfiguration never requests z>19.
 */
export function osmTileLayer(url, options = {}) {
    const merged = {
        maxZoom: 26,
        maxNativeZoom: 19,
        ...options,
    }
    const maxNative = merged.maxNativeZoom ?? 19
    merged.maxNativeZoom = maxNative
    const layer = L.tileLayer(url, merged)
    const orig = L.TileLayer.prototype._getZoomForUrl
    layer._getZoomForUrl = function () {
        return Math.min(orig.call(this), maxNative)
    }
    return layer
}
