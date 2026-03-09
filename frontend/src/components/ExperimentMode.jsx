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
        }

        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove()
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
        <div className="h-full flex flex-col bg-gray-50">
            {/* Header - kompakt */}
            <div className="bg-white border-b px-4 py-2">
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
                <div className="mt-3 flex gap-2">
                    {!experiment && stats?.by_status?.pending === 0 && (
                        <button
                            onClick={generateBatch}
                            disabled={generating}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                        >
                            {generating ? 'Genererar...' : 'Generera batch'}
                        </button>
                    )}
                    {!experiment && stats?.by_status?.pending > 0 && (
                        <button
                            onClick={loadNextExperiment}
                            disabled={loading}
                            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                        >
                            Starta bedömning
                        </button>
                    )}
                </div>
            </div>

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

                    {/* Map - tar mer plats */}
                    <div className="flex-1 relative min-h-0">
                        <div ref={mapRef} className="h-full w-full" />

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
                    <div className="bg-white border-t px-6 py-4">
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
                            <div className="flex gap-3">
                                <button
                                    onClick={skipExperiment}
                                    disabled={loading}
                                    className="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 disabled:opacity-50"
                                >
                                    Hoppa över
                                </button>
                                <button
                                    onClick={saveRating}
                                    disabled={loading}
                                    className="flex-1 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-semibold"
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
