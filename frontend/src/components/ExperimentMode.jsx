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

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

function ExperimentMode() {
    const mapRef = useRef(null)
    const mapInstanceRef = useRef(null)
    const originalLayerRef = useRef(null)
    const correctedLayerRef = useRef(null)
    
    const [experiment, setExperiment] = useState(null)
    const [progress, setProgress] = useState(null)
    const [loading, setLoading] = useState(false)
    const [rating, setRating] = useState(5)
    const [notes, setNotes] = useState('')
    const [generating, setGenerating] = useState(false)
    const [stats, setStats] = useState(null)

    useEffect(() => {
        loadStats()
        
        // Initiera kartan
        if (!mapInstanceRef.current && mapRef.current) {
            const map = L.map(mapRef.current, {
                center: [59.334, 18.066],
                zoom: 13,
                zoomControl: true
            })

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            }).addTo(map)

            mapInstanceRef.current = map
        }

        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove()
                mapInstanceRef.current = null
            }
        }
    }, [])

    const loadStats = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/ml/experiments/stats`)
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
            const res = await fetch(`${API_BASE_URL}/api/ml/experiments/batch/generate`, {
                method: 'POST'
            })
            const data = await res.json()
            
            if (data.status === 'success') {
                alert(`Genererade ${data.generated} experiment från ${data.total_tracks} kundspår`)
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
            const res = await fetch(`${API_BASE_URL}/api/ml/experiments/next`)
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
            }
        } catch (err) {
            alert('Fel vid laddning: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    // Rita om kartan när experiment ändras
    useEffect(() => {
        if (!mapInstanceRef.current || !experiment) return

        const map = mapInstanceRef.current

        // Ta bort gamla lager
        if (originalLayerRef.current) {
            map.removeLayer(originalLayerRef.current)
        }
        if (correctedLayerRef.current) {
            map.removeLayer(correctedLayerRef.current)
        }

        // Skapa layer group för original track
        const originalGroup = L.layerGroup()
        
        // Rita original track (grå, streckad)
        const originalPositions = experiment.original_track.positions.map(p => [p.lat, p.lng])
        L.polyline(originalPositions, {
            color: 'gray',
            weight: 3,
            opacity: 0.6,
            dashArray: '5, 5'
        }).addTo(originalGroup)

        // Rita original punkter
        experiment.original_track.positions.forEach((p, idx) => {
            L.circleMarker([p.lat, p.lng], {
                radius: 4,
                fillColor: 'gray',
                color: 'white',
                weight: 1,
                fillOpacity: 0.6
            })
            .bindPopup(`
                <div style="font-size: 12px;">
                    <strong>Original</strong><br/>
                    Punkt ${idx + 1}<br/>
                    ${p.timestamp || ''}
                </div>
            `)
            .addTo(originalGroup)
        })

        originalGroup.addTo(map)
        originalLayerRef.current = originalGroup

        // Skapa layer group för corrected track
        const correctedGroup = L.layerGroup()
        
        // Rita corrected track (röd)
        const correctedPositions = experiment.corrected_track.positions.map(p => [p.lat, p.lng])
        L.polyline(correctedPositions, {
            color: 'red',
            weight: 3,
            opacity: 0.8
        }).addTo(correctedGroup)

        // Rita corrected punkter
        experiment.corrected_track.positions.forEach((p, idx) => {
            L.circleMarker([p.lat, p.lng], {
                radius: 5,
                fillColor: 'red',
                color: 'white',
                weight: 1,
                fillOpacity: 0.8
            })
            .bindPopup(`
                <div style="font-size: 12px;">
                    <strong>Korrigerad (ML)</strong><br/>
                    Punkt ${idx + 1}<br/>
                    Korrigering: ${p.predicted_correction_distance?.toFixed(2) || '?'} m
                </div>
            `)
            .addTo(correctedGroup)
        })

        correctedGroup.addTo(map)
        correctedLayerRef.current = correctedGroup

        // Anpassa zoom för att visa båda spåren
        const allPositions = [...originalPositions, ...correctedPositions]
        if (allPositions.length > 0) {
            const bounds = L.latLngBounds(allPositions)
            map.fitBounds(bounds, { padding: [50, 50] })
        }

    }, [experiment])

    const saveRating = async () => {
        if (!experiment) return

        setLoading(true)
        try {
            const res = await fetch(`${API_BASE_URL}/api/ml/experiments/${experiment.id}/rate`, {
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
            const res = await fetch(`${API_BASE_URL}/api/ml/experiments/${experiment.id}/skip`, {
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
            {/* Header */}
            <div className="bg-white border-b px-6 py-4">
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
                    {/* Progress bar */}
                    {progress && (
                        <div className="bg-white border-b px-6 py-3">
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

                    {/* Map */}
                    <div className="flex-1 relative">
                        <div ref={mapRef} className="h-full w-full" />

                        {/* Track info overlay */}
                        {experiment && (
                            <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg p-4 max-w-xs z-[1000]">
                                <h3 className="font-semibold text-gray-800 mb-2">
                                    {experiment.original_track.track_name}
                                </h3>
                                <div className="text-sm text-gray-600 space-y-1">
                                    <div>
                                        <span className="font-medium">Positioner:</span>{' '}
                                        {experiment.original_track.positions.length}
                                    </div>
                                    <div>
                                        <span className="font-medium">Modell:</span>{' '}
                                        {experiment.model_version}
                                    </div>
                                    <div className="mt-2 pt-2 border-t">
                                        <div className="flex items-center gap-2 mb-1">
                                            <div className="w-4 h-0.5 bg-gray-400 border-t-2 border-dashed"></div>
                                            <span className="text-xs">Original (kundspår)</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="w-4 h-0.5 bg-red-500"></div>
                                            <span className="text-xs">Korrigerad (ML)</span>
                                        </div>
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
