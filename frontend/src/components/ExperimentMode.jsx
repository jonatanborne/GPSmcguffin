import React, { useState, useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix för Leaflet ikoner
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

const API_BASE = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/$/, '') : '/api'

// 1=Människaspår, 2=Hundspår, 3=Korrigerad människa, 4=Korrigerad hund
const TRACK_CONFIG = [
    { key: 'humanOriginal', label: '1. Människaspår (original)', color: '#059669', dash: false },
    { key: 'dogOriginal', label: '2. Hundspår (original)', color: '#2563eb', dash: true },
    { key: 'humanCorrected', label: '3. Korrigerad människa', color: '#8b5cf6', dash: false },
    { key: 'dogCorrected', label: '4. Korrigerad hund', color: '#dc2626', dash: false },
]

function ExperimentMode() {
    const mapRef = useRef(null)
    const mapInstanceRef = useRef(null)
    const layerRefs = useRef({})

    const [experiment, setExperiment] = useState(null)
    const [trackVisibility, setTrackVisibility] = useState(
        Object.fromEntries(TRACK_CONFIG.map(t => [t.key, true]))
    )
    const [progress, setProgress] = useState(null)
    const [loading, setLoading] = useState(false)
    const [rating, setRating] = useState(5)
    const [notes, setNotes] = useState('')
    const [generating, setGenerating] = useState(false)
    const [stats, setStats] = useState(null)
    const [notice, setNotice] = useState(null)
    const [purgePendingLoading, setPurgePendingLoading] = useState(false)

    useEffect(() => {
        loadStats()
    }, [])

    const loadStats = async () => {
        try {
            const res = await fetch(`${API_BASE}/ml/experiments/stats`)
            const data = await res.json()
            if (data.status === 'success') {
                setStats(data.stats)
            }
        } catch (err) {
            console.error('Fel vid laddning av statistik:', err)
        }
    }

    const generateBatch = async () => {
        if (!confirm('Generera experiment för alla kundspår? Detta kan ta en stund.')) {
            return
        }

        setGenerating(true)
        try {
            const res = await fetch(`${API_BASE}/ml/experiments/batch/generate`, {
                method: 'POST'
            })
            const data = await res.json()
            
            if (data.status === 'success') {
                alert(data.message || `Genererade ${data.generated} experiment`)
                loadStats()
                loadNextExperiment()
            } else {
                alert('Fel vid generering: ' + data.message)
            }
        } catch (err) {
            alert('Fel vid generering: ' + err.message)
        } finally {
            setGenerating(false)
        }
    }

    const loadNextExperiment = async () => {
        setLoading(true)
        try {
            const res = await fetch(`${API_BASE}/ml/experiments/next`)
            const data = await res.json()

            if (data.status === 'completed') {
                alert('Alla experiment är bedömda!')
                setExperiment(null)
                setProgress(data.progress)
            } else if (data.status === 'success') {
                setExperiment(data.experiment)
                setProgress(data.progress)
                setRating(5)
                setNotes('')
                setTrackVisibility(Object.fromEntries(TRACK_CONFIG.map(t => [t.key, true])))
            }
        } catch (err) {
            alert('Fel vid laddning: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const getLatLng = (p) => [p.lat ?? p.position_lat, p.lng ?? p.position_lng]
    const toPositions = (arr) => (arr || []).map(p => getLatLng(p)).filter(([lat, lng]) => lat != null && lng != null)

    // Ny struktur: original_track/corrected_track har .human och .dog med .positions
    const humanOrig = experiment?.original_track?.human?.positions || []
    const dogOrig = experiment?.original_track?.dog?.positions || []
    const humanCorr = experiment?.corrected_track?.human?.positions || []
    const dogCorr = experiment?.corrected_track?.dog?.positions || []

    const trackData = [
        { key: 'humanOriginal', positions: toPositions(humanOrig), raw: humanOrig },
        { key: 'dogOriginal', positions: toPositions(dogOrig), raw: dogOrig },
        { key: 'humanCorrected', positions: toPositions(humanCorr), raw: humanCorr },
        { key: 'dogCorrected', positions: toPositions(dogCorr), raw: dogCorr },
    ]

    const toggleTrack = (key) => {
        setTrackVisibility(prev => ({ ...prev, [key]: !prev[key] }))
    }

    useEffect(() => {
        if (!experiment) return
        if (!mapRef.current) return

        let map = mapInstanceRef.current
        if (!map) {
            map = L.map(mapRef.current, {
                center: [59.334, 18.066],
                zoom: 13,
                zoomControl: true,
                maxZoom: 22
            })
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap',
                maxZoom: 22
            }).addTo(map)
            mapInstanceRef.current = map
        }

        TRACK_CONFIG.forEach(({ key }) => {
            if (layerRefs.current[key]) {
                map.removeLayer(layerRefs.current[key])
            }
        })

        trackData.forEach(({ key, positions, raw }, idx) => {
            const cfg = TRACK_CONFIG[idx]
            if (!cfg || positions.length === 0) return
            const group = L.layerGroup()
            L.polyline(positions, {
                color: cfg.color,
                weight: 4,
                opacity: 0.9,
                dashArray: cfg.dash ? '10, 10' : null
            }).addTo(group)
            raw.slice(0, 50).forEach((p, i) => {
                const [lat, lng] = getLatLng(p)
                if (lat == null || lng == null) return
                L.circleMarker([lat, lng], {
                    radius: 3,
                    fillColor: cfg.color,
                    color: 'white',
                    weight: 1,
                    fillOpacity: 0.8
                })
                    .bindPopup(`<div style="font-size:11px"><strong>${cfg.label}</strong><br/>Punkt ${i + 1}</div>`)
                    .addTo(group)
            })
            if (trackVisibility[key]) {
                group.addTo(map)
            }
            layerRefs.current[key] = group
        })

        const allPos = trackData.flatMap(t => t.positions)
        if (allPos.length > 0) {
            map.fitBounds(L.latLngBounds(allPos), { padding: [40, 40] })
            requestAnimationFrame(() => {
                try {
                    map.invalidateSize()
                } catch { /* ignorerar */ }
            })
        }

        return () => {
            try {
                if (mapInstanceRef.current) {
                    mapInstanceRef.current.off()
                    mapInstanceRef.current.remove()
                    mapInstanceRef.current = null
                }
            } catch {
                mapInstanceRef.current = null
            }
        }
    }, [experiment])

    useEffect(() => {
        if (!mapInstanceRef.current) return
        TRACK_CONFIG.forEach(({ key }) => {
            const layer = layerRefs.current[key]
            if (layer) {
                if (trackVisibility[key]) {
                    mapInstanceRef.current.addLayer(layer)
                } else {
                    mapInstanceRef.current.removeLayer(layer)
                }
            }
        })
    }, [trackVisibility])

    const saveRating = async () => {
        if (!experiment) return

        setLoading(true)
        try {
            const res = await fetch(`${API_BASE}/ml/experiments/${experiment.id}/rate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    rating: rating,
                    feedback_notes: notes || null
                })
            })
            const data = await res.json()

            if (data.status === 'success') {
                loadStats()
                loadNextExperiment()
            } else {
                alert('Fel vid sparande: ' + data.message)
            }
        } catch (err) {
            alert('Fel vid sparande: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const disposeMapAndResetForm = () => {
        try {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.off()
                mapInstanceRef.current.remove()
                mapInstanceRef.current = null
            }
        } catch (e) {
            console.warn('ExperimentMode map cleanup:', e)
            mapInstanceRef.current = null
        }
        layerRefs.current = {}
        setExperiment(null)
        setProgress(null)
        setRating(5)
        setNotes('')
        setTrackVisibility(Object.fromEntries(TRACK_CONFIG.map(t => [t.key, true])))
    }

    const clearView = () => {
        const hadExperiment = experiment != null
        console.log('[ExperimentMode] Rensa vy', { hadExperiment })
        disposeMapAndResetForm()

        void loadStats().then(() => {
            if (hadExperiment) {
                setNotice('Experiment stängt. Välj "Börja bedöma" när du vill fortsätta.')
            } else {
                setNotice('Inget aktivt experiment var öppet. Statistik uppdaterad från servern.')
            }
            window.setTimeout(() => setNotice(null), 5000)
        })
    }

    const deleteAllPendingExperiments = async () => {
        const n = stats?.by_status?.pending ?? 0
        if (n <= 0) return
        if (
            !confirm(
                `Radera alla ${n} obedömda experiment från databasen?\n\nBedömda och överhoppade experiment behålls.\nDetta går inte att ångra.`
            )
        ) {
            return
        }
        setPurgePendingLoading(true)
        setNotice(null)
        try {
            // POST används först – vissa proxys/CDN blockerar DELETE mot backend
            let res = await fetch(`${API_BASE}/ml/experiments/purge-pending`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: '{}',
                cache: 'no-store',
            })
            if (res.status === 404) {
                res = await fetch(`${API_BASE}/ml/experiments/pending`, {
                    method: 'DELETE',
                    headers: { Accept: 'application/json' },
                    cache: 'no-store',
                })
            }
            const data = await res.json().catch(() => ({}))
            console.log('[ExperimentMode] purge response', res.status, data)
            if (!res.ok) {
                const d = data.detail
                const detailStr = typeof d === 'string' ? d : Array.isArray(d) ? d.map((x) => x.msg || x).join(' ') : JSON.stringify(d)
                throw new Error(detailStr || data.message || res.statusText)
            }
            if (data.status === 'success') {
                const deleted = typeof data.deleted === 'number' ? data.deleted : 0
                if (deleted === 0 && n > 0) {
                    alert(
                        'Backend raderade 0 rader trots att statistik visade pending. Kontrollera att senaste backend är deployad (purge-pending) och fliken Nätverk i devtools.'
                    )
                }
                disposeMapAndResetForm()
                await loadStats()
                setNotice(
                    deleted > 0
                        ? data.message || `Raderade ${deleted} experiment.`
                        : 'Inga obedömda experiment fanns att radera (kördes redan eller tom tabell).'
                )
                window.setTimeout(() => setNotice(null), 6000)
            } else {
                throw new Error(data.message || 'Okänt fel')
            }
        } catch (err) {
            console.error(err)
            alert('Kunde inte radera experiment: ' + (err.message || String(err)))
        } finally {
            setPurgePendingLoading(false)
        }
    }

    const skipExperiment = async () => {
        if (!experiment) return

        setLoading(true)
        try {
            const res = await fetch(`${API_BASE}/ml/experiments/${experiment.id}/skip`, {
                method: 'POST'
            })
            const data = await res.json()

            if (data.status === 'success') {
                loadStats()
                loadNextExperiment()
            }
        } catch (err) {
            alert('Fel vid överhoppning: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="h-full flex flex-col bg-gray-50 min-h-0">
            {/* Header: flex-shrink-0 + z över Leaflet (leaflet-controls z-index 1000) */}
            <div className="flex-shrink-0 relative z-[1100] bg-white border-b px-4 py-2 shadow-sm">
                <h2 className="text-2xl font-bold text-gray-800">Experiment Mode</h2>
                <p className="text-gray-600 mt-1">
                    Bedöm modellens korrigeringar av kundspår (1-10)
                </p>

                {/* Stats */}
                {stats && (
                    <div className="mt-3 flex gap-4 text-sm">
                        <div>
                            <span className="text-gray-600">Totalt:</span>{' '}
                            <span className="font-semibold">{stats.total}</span>
                        </div>
                        <div>
                            <span className="text-gray-600">Bedömda:</span>{' '}
                            <span className="font-semibold text-green-600">{stats.by_status?.rated || 0}</span>
                        </div>
                        <div>
                            <span className="text-gray-600">Pending:</span>{' '}
                            <span className="font-semibold text-blue-600">{stats.by_status?.pending || 0}</span>
                        </div>
                        {stats.average_rating && (
                            <div>
                                <span className="text-gray-600">Snittbetyg:</span>{' '}
                                <span className="font-semibold text-purple-600">{stats.average_rating.toFixed(1)}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Actions */}
                <div className="mt-3 flex gap-2 flex-wrap">
                    {experiment && (
                        <button
                            type="button"
                            onClick={() => clearView()}
                            className="px-4 py-2 bg-amber-500 text-white rounded hover:bg-amber-600"
                        >
                            Rensa vy
                        </button>
                    )}
                    {!experiment && stats?.by_status?.pending === 0 && (
                        <button
                            type="button"
                            onClick={generateBatch}
                            disabled={generating}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                        >
                            {generating ? 'Genererar...' : 'Generera batch'}
                        </button>
                    )}
                    {!experiment && stats?.by_status?.pending > 0 && (
                        <button
                            type="button"
                            onClick={loadNextExperiment}
                            disabled={loading}
                            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                        >
                            Starta bedömning
                        </button>
                    )}
                    {(stats?.by_status?.pending ?? 0) > 0 && (
                        <button
                            type="button"
                            onClick={deleteAllPendingExperiments}
                            disabled={purgePendingLoading || loading}
                            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                            title="Tar bort alla obedömda experiment permanent. Bedömda behålls."
                        >
                            {purgePendingLoading ? 'Raderar…' : `Radera alla obedömda (${stats.by_status.pending})`}
                        </button>
                    )}
                    {!experiment && (stats?.total > 0 || stats?.by_status?.pending > 0) && (
                        <button
                            type="button"
                            onClick={() => clearView()}
                            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                            title="Uppdaterar statistik. Om inget experiment är öppet ändras inte skärmen – du får en bekräftelse här under."
                        >
                            Uppdatera / rensa vy
                        </button>
                    )}
                </div>
            </div>

            {notice && (
                <div
                    className="flex-shrink-0 mx-4 my-2 px-4 py-2 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-900"
                    role="status"
                >
                    {notice}
                </div>
            )}

            {/* Main content */}
            {experiment ? (
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Progress bar - slimmare */}
                    {progress && (
                        <div className="bg-white border-b px-4 py-2">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-gray-700">
                                    Experiment {progress.current} / {progress.total}
                                </span>
                                <span className="text-sm text-gray-500">
                                    {progress.remaining} kvar
                                </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                    className="bg-blue-600 h-2 rounded-full transition-all"
                                    style={{ width: `${(progress.rated / progress.total) * 100}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Map - z-0 så header (z-1100) alltid får klick */}
                    <div className="flex-1 relative min-h-0 z-0 isolate">
                        <div ref={mapRef} className="h-full w-full z-0" />

                        {/* Track info + växlare */}
                        {experiment && (
                            <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg p-4 max-w-xs z-[1000]">
                                <h3 className="font-semibold text-gray-800 mb-2">
                                    {experiment.original_track?.track_name || 'Experiment'}
                                </h3>
                                <div className="text-sm text-gray-600 space-y-1">
                                    <div>
                                        <span className="font-medium">Modell:</span> {experiment.model_version}
                                    </div>
                                    <div className="mt-2 pt-2 border-t space-y-1">
                                        {TRACK_CONFIG.map((cfg) => {
                                            const count = trackData.find(t => t.key === cfg.key)?.positions?.length ?? 0
                                            if (count === 0) return null
                                            return (
                                                <label key={cfg.key} className="flex items-center gap-2 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={!!trackVisibility[cfg.key]}
                                                        onChange={() => toggleTrack(cfg.key)}
                                                        className="rounded"
                                                    />
                                                    <div
                                                        className="w-4 h-0.5 flex-shrink-0"
                                                        style={{ backgroundColor: cfg.color }}
                                                    />
                                                    <span className="text-xs">{cfg.label}</span>
                                                    <span className="text-gray-400 text-xs">({count})</span>
                                                </label>
                                            )
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Rating panel */}
                    <div className="flex-shrink-0 bg-white border-t px-6 py-4 relative z-[1100]">
                        <div className="max-w-4xl mx-auto">
                            {/* Rating buttons */}
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Hur bra är korrigeringen? (1 = dålig, 10 = perfekt)
                                </label>
                                <div className="flex gap-2">
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                                        <button
                                            key={num}
                                            type="button"
                                            onClick={() => setRating(num)}
                                            className={`flex-1 py-3 rounded font-semibold transition ${
                                                rating === num
                                                    ? 'bg-blue-600 text-white shadow-lg scale-105'
                                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                            }`}
                                        >
                                            {num}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Notes */}
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Kommentar (valfritt)
                                </label>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="T.ex. 'För mycket korrigering i kurvor' eller 'Bra jämnhet'"
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    rows={2}
                                />
                            </div>

                            {/* Action buttons */}
                            <div className="flex flex-wrap gap-3 items-center relative z-[1100]">
                                <button
                                    type="button"
                                    onClick={clearView}
                                    className="px-6 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600"
                                >
                                    Rensa vy
                                </button>
                                <button
                                    type="button"
                                    onClick={skipExperiment}
                                    disabled={loading}
                                    className="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 disabled:opacity-50"
                                >
                                    Hoppa över
                                </button>
                                <button
                                    type="button"
                                    onClick={saveRating}
                                    disabled={loading}
                                    className="flex-1 min-w-[200px] px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-semibold"
                                >
                                    {loading ? 'Sparar...' : 'Spara & Nästa'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                        {stats?.by_status?.pending > 0 ? (
                            <>
                                <h3 className="text-xl font-semibold text-gray-800 mb-2">
                                    {stats.by_status.pending} experiment redo att bedömas
                                </h3>
                                <button
                                    type="button"
                                    onClick={loadNextExperiment}
                                    disabled={loading}
                                    className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-semibold"
                                >
                                    Börja bedöma
                                </button>
                            </>
                        ) : stats?.total > 0 ? (
                            <>
                                <h3 className="text-xl font-semibold text-gray-800 mb-2">
                                    Alla experiment är bedömda!
                                </h3>
                                <p className="text-gray-600 mb-4">
                                    {stats.by_status?.rated || 0} experiment bedömda
                                    {stats.average_rating && ` (snitt: ${stats.average_rating.toFixed(1)})`}
                                </p>
                                <button
                                    type="button"
                                    onClick={generateBatch}
                                    disabled={generating}
                                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                                >
                                    Generera nya experiment
                                </button>
                            </>
                        ) : (
                            <>
                                <h3 className="text-xl font-semibold text-gray-800 mb-2">
                                    Inga experiment ännu
                                </h3>
                                <p className="text-gray-600 mb-4">
                                    Generera experiment från dina kundspår för att börja träna modellen med feedback.
                                </p>
                                <button
                                    type="button"
                                    onClick={generateBatch}
                                    disabled={generating}
                                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {generating ? 'Genererar...' : 'Generera experiment'}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

export default ExperimentMode
