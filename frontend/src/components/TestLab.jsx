import React, { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import axios from 'axios'

// Säkerställ att Leaflet använder CDN-ikoner (samma som GeofenceEditor)
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

const API_BASE = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/$/, '') : '/api'

const STATUS_LABELS = {
    pending: 'Ej märkt',
    correct: 'Korrekt',
    incorrect: 'Fel',
}

const STATUS_ICONS = {
    pending: '⏳',
    correct: '✅',
    incorrect: '❌',
}

const STATUS_COLORS = {
    pending: '#f59e0b', // Amber
    correct: '#22c55e', // Green
    incorrect: '#ef4444', // Red
}

const STATUS_BG_COLORS = {
    pending: '#fef3c7', // Light amber
    correct: '#d1fae5', // Light green
    incorrect: '#fee2e2', // Light red
}

const TestLab = () => {
    const mapRef = useRef(null)
    const mapInstanceRef = useRef(null)
    const markersLayerRef = useRef(null)
    const draggableMarkerRef = useRef(null)

    const [tracks, setTracks] = useState([])
    const [selectedTrackId, setSelectedTrackId] = useState('')
    const [selectedTrack, setSelectedTrack] = useState(null)
    const [positions, setPositions] = useState([])
    const [selectedPositionId, setSelectedPositionId] = useState(null)
    const [isAdjusting, setIsAdjusting] = useState(false)
    const [notes, setNotes] = useState('')
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState(null)
    const [error, setError] = useState(null)

    const selectedPosition = useMemo(
        () => positions.find((p) => p.id === selectedPositionId) || null,
        [positions, selectedPositionId],
    )

    useEffect(() => {
        initializeMap()
        loadTracks()

        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove()
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        if (!selectedTrackId) return
        fetchTrack(selectedTrackId)
    }, [selectedTrackId])

    useEffect(() => {
        renderMarkers()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [positions, selectedPositionId])

    useEffect(() => {
        updateDraggableMarker()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedPosition, isAdjusting])

    const initializeMap = () => {
        if (mapInstanceRef.current || !mapRef.current) return

        const map = L.map(mapRef.current).setView([59.334, 18.066], 14)

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
        }).addTo(map)

        markersLayerRef.current = L.layerGroup().addTo(map)

        mapInstanceRef.current = map
    }

    const loadTracks = async () => {
        try {
            const response = await axios.get(`${API_BASE}/tracks`)
            const sortedTracks = Array.isArray(response.data) ? response.data : []
            setTracks(sortedTracks)
        } catch (err) {
            console.error('Kunde inte hämta tracks:', err)
            setError('Kunde inte ladda spårlistan.')
        }
    }

    const fetchTrack = async (trackId) => {
        try {
            setLoading(true)
            const response = await axios.get(`${API_BASE}/tracks/${trackId}`)
            const track = response.data
            const withSortedPositions = Array.isArray(track.positions)
                ? [...track.positions].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
                : []

            setSelectedTrack(track)
            setPositions(withSortedPositions)

            if (withSortedPositions.length > 0) {
                setSelectedPositionId(withSortedPositions[0].id)
                setNotes(withSortedPositions[0].annotation_notes || '')
            } else {
                setSelectedPositionId(null)
                setNotes('')
            }
        } catch (err) {
            console.error('Kunde inte hämta spåret:', err)
            setError('Kunde inte ladda valt spår.')
        } finally {
            setLoading(false)
        }
    }

    const refreshCurrentTrack = async (positionIdToKeep = null) => {
        if (!selectedTrackId) return
        await fetchTrack(selectedTrackId)
        if (positionIdToKeep) {
            setSelectedPositionId(positionIdToKeep)
        }
    }

    const renderMarkers = () => {
        if (!markersLayerRef.current) return

        markersLayerRef.current.clearLayers()

        positions.forEach((pos) => {
            const originalLatLng = [pos.position.lat, pos.position.lng]
            const correctedLatLng = pos.corrected_position
                ? [pos.corrected_position.lat, pos.corrected_position.lng]
                : originalLatLng

            const status = pos.verified_status || 'pending'
            const color = STATUS_COLORS[status] || STATUS_COLORS.pending
            const icon = STATUS_ICONS[status] || STATUS_ICONS.pending
            const isSelected = selectedPositionId === pos.id

            // Original point marker (smaller, grey) - only show if corrected
            if (pos.corrected_position) {
                L.circleMarker(originalLatLng, {
                    radius: 5,
                    color: '#64748b',
                    fillColor: '#94a3b8',
                    fillOpacity: 0.5,
                    weight: 1.5,
                }).addTo(markersLayerRef.current)

                // Line showing correction offset
                L.polyline([originalLatLng, correctedLatLng], {
                    color: color,
                    dashArray: '5, 5',
                    weight: 2,
                    opacity: 0.6,
                }).addTo(markersLayerRef.current)
            }

            // Main marker with status color
            const radius = isSelected ? 8 : 6
            const marker = L.circleMarker(correctedLatLng, {
                radius,
                color: color,
                fillColor: color,
                fillOpacity: isSelected ? 0.9 : 0.7,
                weight: isSelected ? 4 : 2.5,
            })

            marker.on('click', () => {
                handleSelectPosition(pos.id)
            })

            // Enhanced tooltip with icon
            marker.bindTooltip(
                `<div style="text-align: center; font-weight: bold;">
                    ${icon} #${pos.id}<br/>
                    <span style="font-size: 11px; font-weight: normal;">${STATUS_LABELS[status]}</span>
                </div>`,
                {
                    direction: 'top',
                    offset: [0, -10],
                    className: 'custom-tooltip',
                }
            )

            marker.addTo(markersLayerRef.current)
        })
    }

    const handleSelectPosition = (positionId) => {
        setSelectedPositionId(positionId)
        setIsAdjusting(false)
        const position = positions.find((p) => p.id === positionId)
        if (position) {
            setNotes(position.annotation_notes || '')
        }
    }

    const updateDraggableMarker = () => {
        if (!mapInstanceRef.current) return

        if (!selectedPosition) {
            if (draggableMarkerRef.current) {
                draggableMarkerRef.current.remove()
                draggableMarkerRef.current = null
            }
            return
        }

        const latLng = selectedPosition.corrected_position || selectedPosition.position
        const point = [latLng.lat, latLng.lng]

        if (!draggableMarkerRef.current) {
            const marker = L.marker(point, { draggable: true })
            marker.on('dragend', handleCorrectionDragEnd)
            marker.addTo(mapInstanceRef.current)
            draggableMarkerRef.current = marker
        } else {
            draggableMarkerRef.current.setLatLng(point)
        }

        if (isAdjusting) {
            draggableMarkerRef.current.dragging.enable()
        } else {
            draggableMarkerRef.current.dragging.disable()
        }

        mapInstanceRef.current.setView(point, Math.max(mapInstanceRef.current.getZoom(), 16))
    }

    const handleCorrectionDragEnd = async () => {
        if (!draggableMarkerRef.current || !selectedPosition) return

        const { lat, lng } = draggableMarkerRef.current.getLatLng()

        await saveAnnotation(selectedPosition.id, {
            verified_status: 'incorrect',
            corrected_position: { lat, lng },
            annotation_notes: notes,
        })

        setIsAdjusting(false)
    }

    const saveAnnotation = async (positionId, payload, successMessage = 'Uppdaterat!') => {
        try {
            setLoading(true)
            setError(null)
            setMessage(null)

            await axios.put(`${API_BASE}/track-positions/${positionId}`, payload)
            await refreshCurrentTrack(positionId)
            setMessage(successMessage)
        } catch (err) {
            console.error('Kunde inte uppdatera positionen:', err)
            setError('Uppdatering misslyckades.')
        } finally {
            setLoading(false)
            setTimeout(() => setMessage(null), 2500)
        }
    }

    const handleMarkCorrect = () => {
        if (!selectedPosition) return
        saveAnnotation(selectedPosition.id, {
            verified_status: 'correct',
            clear_correction: true,
            annotation_notes: notes,
        }, 'Markerad som korrekt.')
    }

    const handleMarkIncorrect = () => {
        if (!selectedPosition) return
        saveAnnotation(selectedPosition.id, {
            verified_status: 'incorrect',
            annotation_notes: notes,
        }, 'Markerad som fel.')
    }

    const handleResetCorrection = () => {
        if (!selectedPosition) return
        saveAnnotation(selectedPosition.id, {
            verified_status: 'pending',
            clear_correction: true,
            annotation_notes: notes,
        }, 'Korrigering återställd.')
    }

    const handleSaveNotes = () => {
        if (!selectedPosition) return
        saveAnnotation(selectedPosition.id, {
            annotation_notes: notes,
        }, 'Anteckningar sparade.')
    }

    return (
        <div className="h-full flex">
            <div className="w-72 bg-slate-100 border-r border-slate-200 p-4 flex flex-col gap-4 overflow-y-auto">
                <div>
                    <h2 className="text-lg font-semibold mb-2">Testmiljö</h2>
                    <p className="text-sm text-slate-600">
                        Välj ett spår, inspektera varje position och markera om den stämmer eller justera den på kartan.
                    </p>
                </div>

                <div>
                    <label className="block text-sm font-medium mb-1">Välj spår</label>
                    <select
                        value={selectedTrackId}
                        onChange={(e) => setSelectedTrackId(e.target.value)}
                        className="w-full border border-slate-300 rounded px-2 py-2 text-sm"
                    >
                        <option value="">-- Välj --</option>
                        {tracks.map((track) => (
                            <option key={track.id} value={track.id}>
                                {track.track_type === 'human' ? '🚶' : '🐕'} {track.name} ({track.positions?.length || 0})
                            </option>
                        ))}
                    </select>
                </div>

                {selectedTrack && (
                    <div className="text-xs bg-white border border-slate-200 rounded p-2 space-y-1">
                        <div className="font-medium text-slate-700">{selectedTrack.name}</div>
                        <div>Typ: {selectedTrack.track_type === 'human' ? 'Människa' : 'Hund'}</div>
                        <div>Positioner: {positions.length}</div>
                        <div>Skapad: {new Date(selectedTrack.created_at).toLocaleString()}</div>
                    </div>
                )}

                <div className="flex-1">
                    <h3 className="font-semibold text-sm mb-2">Positioner</h3>
                    <div className="bg-white border border-slate-200 rounded max-h-64 overflow-y-auto divide-y divide-slate-100">
                        {positions.length === 0 && (
                            <div className="p-3 text-xs text-slate-500">
                                Inga positioner laddade.
                            </div>
                        )}
                        {positions.map((pos) => {
                            const status = pos.verified_status || 'pending'
                            const isSelected = pos.id === selectedPositionId
                            return (
                                <button
                                    key={pos.id}
                                    onClick={() => handleSelectPosition(pos.id)}
                                    className={`w-full text-left px-3 py-2 text-xs transition ${isSelected ? 'bg-blue-100' : 'bg-white hover:bg-slate-100'
                                        }`}
                                >
                                    <div className="flex justify-between items-center">
                                        <span className="font-medium text-slate-700 flex items-center gap-1">
                                            <span>{STATUS_ICONS[status]}</span>
                                            <span>#{pos.id}</span>
                                        </span>
                                        <span
                                            className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                                            style={{
                                                backgroundColor: STATUS_BG_COLORS[status] || STATUS_BG_COLORS.pending,
                                                color: STATUS_COLORS[status],
                                                border: `1px solid ${STATUS_COLORS[status]}`,
                                            }}
                                        >
                                            {STATUS_LABELS[status]}
                                        </span>
                                    </div>
                                    <div className="mt-1 text-[10px] text-slate-500">
                                        {new Date(pos.timestamp).toLocaleString()}
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                </div>

                {selectedPosition && (
                    <div className="bg-white border border-slate-200 rounded p-3 space-y-3 text-xs">
                        <div>
                            <div className="font-semibold text-slate-700 flex items-center gap-2">
                                <span className="text-lg">{STATUS_ICONS[selectedPosition.verified_status || 'pending']}</span>
                                <span>Position #{selectedPosition.id}</span>
                            </div>
                            <div className="mt-2 space-y-1">
                                <div className="text-slate-600 text-[11px]">
                                    <span className="font-medium">Status:</span>{' '}
                                    <span
                                        className="px-2 py-0.5 rounded text-[10px] font-semibold"
                                        style={{
                                            backgroundColor: STATUS_BG_COLORS[selectedPosition.verified_status || 'pending'],
                                            color: STATUS_COLORS[selectedPosition.verified_status || 'pending'],
                                        }}
                                    >
                                        {STATUS_LABELS[selectedPosition.verified_status || 'pending']}
                                    </span>
                                </div>
                                <div className="text-slate-500 text-[11px]">
                                    <span className="font-medium">Rå:</span> {selectedPosition.position.lat.toFixed(6)}, {selectedPosition.position.lng.toFixed(6)}
                                </div>
                                {selectedPosition.corrected_position && (
                                    <div className="text-slate-500 text-[11px]">
                                        <span className="font-medium">Korrigerad:</span> {selectedPosition.corrected_position.lat.toFixed(6)}, {selectedPosition.corrected_position.lng.toFixed(6)}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <button
                                onClick={handleMarkCorrect}
                                disabled={loading}
                                className="px-3 py-2 rounded bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:bg-green-300"
                            >
                                ✅ Markera som korrekt
                            </button>
                            <button
                                onClick={handleMarkIncorrect}
                                disabled={loading}
                                className="px-3 py-2 rounded bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:bg-red-300"
                            >
                                ❌ Markera som fel
                            </button>
                            <button
                                onClick={() => setIsAdjusting((prev) => !prev)}
                                disabled={loading}
                                className={`px-3 py-2 rounded text-xs font-semibold ${isAdjusting ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                    } disabled:bg-blue-200`}
                            >
                                {isAdjusting ? '✅ Klar med justering' : '🎯 Justera position på kartan'}
                            </button>
                            <button
                                onClick={handleResetCorrection}
                                disabled={loading}
                                className="px-3 py-2 rounded bg-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-300 disabled:bg-slate-100"
                            >
                                ↩️ Återställ korrigering
                            </button>
                        </div>

                        <div>
                            <label className="block text-[11px] text-slate-600 mb-1">Anteckningar</label>
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
                                rows={3}
                            />
                            <button
                                onClick={handleSaveNotes}
                                disabled={loading}
                                className="mt-2 px-3 py-2 rounded bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 disabled:bg-purple-300"
                            >
                                💾 Spara anteckningar
                            </button>
                        </div>
                    </div>
                )}

                {(message || error) && (
                    <div
                        className={`text-xs rounded px-3 py-2 ${error ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                            }`}
                    >
                        {error || message}
                    </div>
                )}
            </div>

            <div className="flex-1 relative">
                <div ref={mapRef} className="absolute inset-0" />
                {loading && (
                    <div className="absolute top-4 right-4 bg-white/90 border border-slate-200 rounded px-4 py-2 text-sm text-slate-600 shadow">
                        Laddar...
                    </div>
                )}
            </div>
        </div>
    )
}

export default TestLab


