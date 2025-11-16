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
    const humanTrackLayerRef = useRef(null) // Layer för människaspåret

    const [tracks, setTracks] = useState([])
    // Två spår för jämförelse
    const [humanTrackId, setHumanTrackId] = useState('')
    const [dogTrackId, setDogTrackId] = useState('')
    const [humanTrack, setHumanTrack] = useState(null)
    const [dogTrack, setDogTrack] = useState(null)
    const [humanPositions, setHumanPositions] = useState([])
    const [dogPositions, setDogPositions] = useState([])

    // Vald position (kan vara från vilket spår som helst)
    const [selectedPositionId, setSelectedPositionId] = useState(null)
    const [selectedPositionTrackType, setSelectedPositionTrackType] = useState(null) // 'human' eller 'dog'
    const [isAdjusting, setIsAdjusting] = useState(false)
    const [notes, setNotes] = useState('')
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState(null)
    const [error, setError] = useState(null)
    const [snappingEnabled, setSnappingEnabled] = useState(true)
    const [snappingDistance, setSnappingDistance] = useState(10) // meter
    const snapIndicatorRef = useRef(null) // Visuell feedback för snapping

    const selectedPosition = useMemo(
        () => {
            if (!selectedPositionId || !selectedPositionTrackType) return null
            const positions = selectedPositionTrackType === 'human' ? humanPositions : dogPositions
            return positions.find((p) => p.id === selectedPositionId) || null
        },
        [selectedPositionId, selectedPositionTrackType, humanPositions, dogPositions],
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

    // Ladda människaspår
    useEffect(() => {
        if (!humanTrackId) {
            setHumanTrack(null)
            setHumanPositions([])
            return
        }
        fetchTrack(humanTrackId, 'human')
    }, [humanTrackId])

    // Ladda hundspår
    useEffect(() => {
        if (!dogTrackId) {
            setDogTrack(null)
            setDogPositions([])
            return
        }
        fetchTrack(dogTrackId, 'dog')
    }, [dogTrackId])

    // Rita spår på kartan när de laddas
    useEffect(() => {
        if (!humanTrackLayerRef.current) return

        humanTrackLayerRef.current.clearLayers()

        // Rita människaspår (röd, solid linje)
        if (humanTrack && humanPositions.length > 0) {
            const coords = humanPositions.map(p => {
                const pos = p.corrected_position || p.position
                return [pos.lat, pos.lng]
            })
            const polyline = L.polyline(coords, {
                color: '#ef4444', // Röd
                weight: 3,
                opacity: 0.8,
            }).addTo(humanTrackLayerRef.current)

            polyline.bindTooltip(`🚶 Människaspår: ${humanTrack.name}`, {
                sticky: true,
            })
        }

        // Rita hundspår (lila, streckad linje)
        if (dogTrack && dogPositions.length > 0) {
            const coords = dogPositions.map(p => {
                const pos = p.corrected_position || p.position
                return [pos.lat, pos.lng]
            })
            const polyline = L.polyline(coords, {
                color: '#8b5cf6', // Lila
                weight: 2.5,
                opacity: 0.7,
                dashArray: '8, 4', // Streckad
            }).addTo(humanTrackLayerRef.current)

            polyline.bindTooltip(`🐕 Hundspår: ${dogTrack.name}`, {
                sticky: true,
            })
        }
    }, [humanTrack, dogTrack, humanPositions, dogPositions])

    useEffect(() => {
        renderMarkers()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [humanPositions, dogPositions, selectedPositionId])

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
        humanTrackLayerRef.current = L.layerGroup().addTo(map)

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

    const fetchTrack = async (trackId, trackType) => {
        try {
            setLoading(true)
            const response = await axios.get(`${API_BASE}/tracks/${trackId}`)
            const track = response.data
            const withSortedPositions = Array.isArray(track.positions)
                ? [...track.positions].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
                : []

            if (trackType === 'human') {
                setHumanTrack(track)
                setHumanPositions(withSortedPositions)
            } else {
                setDogTrack(track)
                setDogPositions(withSortedPositions)
            }

            // Om ingen position är vald, välj första från det nya spåret
            if (!selectedPositionId && withSortedPositions.length > 0) {
                setSelectedPositionId(withSortedPositions[0].id)
                setSelectedPositionTrackType(trackType)
                setNotes(withSortedPositions[0].annotation_notes || '')
            }
        } catch (err) {
            console.error('Kunde inte hämta spåret:', err)
            setError('Kunde inte ladda valt spår.')
        } finally {
            setLoading(false)
        }
    }

    const refreshCurrentTrack = async (positionIdToKeep = null, trackType = null) => {
        if (!trackType) trackType = selectedPositionTrackType
        if (!trackType) return

        const trackId = trackType === 'human' ? humanTrackId : dogTrackId
        if (!trackId) return

        await fetchTrack(trackId, trackType)
        if (positionIdToKeep) {
            setSelectedPositionId(positionIdToKeep)
            setSelectedPositionTrackType(trackType)
        }
    }

    // Beräkna avstånd mellan två positioner (Haversine-formel)
    const haversineDistance = (pos1, pos2) => {
        const R = 6371000 // Jordens radie i meter
        const dLat = (pos2.lat - pos1.lat) * Math.PI / 180
        const dLon = (pos2.lng - pos1.lng) * Math.PI / 180
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(pos1.lat * Math.PI / 180) * Math.cos(pos2.lat * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2)
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
        return R * c
    }

    // Hitta närmaste punkt på människaspåret
    const findNearestHumanPosition = (lat, lng) => {
        if (!humanTrack || humanPositions.length === 0) {
            return null
        }

        const currentPos = { lat, lng }
        let nearest = null
        let nearestDistance = Infinity

        humanPositions.forEach((pos) => {
            const posToUse = pos.corrected_position || pos.position
            const distance = haversineDistance(currentPos, posToUse)
            if (distance < nearestDistance && distance <= snappingDistance) {
                nearestDistance = distance
                nearest = posToUse
            }
        })

        return nearest ? { position: nearest, distance: nearestDistance } : null
    }

    const renderMarkers = () => {
        if (!markersLayerRef.current) return

        markersLayerRef.current.clearLayers()

        // Rita människaspår-positioner
        humanPositions.forEach((pos, index) => {
            const positionNumber = index + 1
            const originalLatLng = [pos.position.lat, pos.position.lng]
            const correctedLatLng = pos.corrected_position
                ? [pos.corrected_position.lat, pos.corrected_position.lng]
                : originalLatLng

            const status = pos.verified_status || 'pending'
            const statusColor = STATUS_COLORS[status] || STATUS_COLORS.pending
            const icon = STATUS_ICONS[status] || STATUS_ICONS.pending
            const isSelected = selectedPositionId === pos.id && selectedPositionTrackType === 'human'
            const trackColor = '#ef4444' // Röd för människaspår

            // Original point marker (smaller, grey) - only show if corrected
            if (pos.corrected_position) {
                L.circleMarker(originalLatLng, {
                    radius: 3,
                    color: '#64748b',
                    fillColor: '#94a3b8',
                    fillOpacity: 0.4,
                    weight: 1,
                }).addTo(markersLayerRef.current)

                // Line showing correction offset
                L.polyline([originalLatLng, correctedLatLng], {
                    color: statusColor,
                    dashArray: '4, 4',
                    weight: 1.5,
                    opacity: 0.5,
                }).addTo(markersLayerRef.current)
            }

            // Main marker: röd bas för människaspår, status-färg som border
            const radius = isSelected ? 5 : 4
            const marker = L.circleMarker(correctedLatLng, {
                radius,
                color: statusColor, // Status-färg som border
                fillColor: trackColor, // Röd fyllning för människaspår
                fillOpacity: isSelected ? 0.9 : 0.7,
                weight: isSelected ? 2.5 : 2,
            })

            marker.on('click', () => {
                handleSelectPosition(pos.id, 'human')
            })

            // Enhanced tooltip with icon (använd relativt nummer)
            marker.bindTooltip(
                `<div style="text-align: center; font-weight: bold;">
                    🚶 ${icon} #${positionNumber}<br/>
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

        // Rita hundspår-positioner
        dogPositions.forEach((pos, index) => {
            const positionNumber = index + 1
            const originalLatLng = [pos.position.lat, pos.position.lng]
            const correctedLatLng = pos.corrected_position
                ? [pos.corrected_position.lat, pos.corrected_position.lng]
                : originalLatLng

            const status = pos.verified_status || 'pending'
            const statusColor = STATUS_COLORS[status] || STATUS_COLORS.pending
            const icon = STATUS_ICONS[status] || STATUS_ICONS.pending
            const isSelected = selectedPositionId === pos.id && selectedPositionTrackType === 'dog'
            const trackColor = '#8b5cf6' // Lila för hundspår

            // Original point marker (smaller, grey) - only show if corrected
            if (pos.corrected_position) {
                L.circleMarker(originalLatLng, {
                    radius: 3,
                    color: '#64748b',
                    fillColor: '#94a3b8',
                    fillOpacity: 0.4,
                    weight: 1,
                }).addTo(markersLayerRef.current)

                // Line showing correction offset
                L.polyline([originalLatLng, correctedLatLng], {
                    color: statusColor,
                    dashArray: '4, 4',
                    weight: 1.5,
                    opacity: 0.5,
                }).addTo(markersLayerRef.current)
            }

            // Main marker: lila bas för hundspår, status-färg som border
            const radius = isSelected ? 5 : 4
            const marker = L.circleMarker(correctedLatLng, {
                radius,
                color: statusColor, // Status-färg som border
                fillColor: trackColor, // Lila fyllning för hundspår
                fillOpacity: isSelected ? 0.9 : 0.7,
                weight: isSelected ? 2.5 : 2,
            })

            marker.on('click', () => {
                handleSelectPosition(pos.id, 'dog')
            })

            // Enhanced tooltip with icon (använd relativt nummer)
            marker.bindTooltip(
                `<div style="text-align: center; font-weight: bold;">
                    🐕 ${icon} #${positionNumber}<br/>
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

    const handleSelectPosition = (positionId, trackType) => {
        setSelectedPositionId(positionId)
        setSelectedPositionTrackType(trackType)
        setIsAdjusting(false)
        const positions = trackType === 'human' ? humanPositions : dogPositions
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
            marker.on('drag', handleCorrectionDrag)
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

    // Hantera drag med snapping
    const handleCorrectionDrag = () => {
        if (!draggableMarkerRef.current || !snappingEnabled) return
        // Snapping fungerar bara när vi justerar hundspår och människaspår finns
        if (selectedPositionTrackType !== 'dog' || !humanTrack) return

        const { lat, lng } = draggableMarkerRef.current.getLatLng()
        const nearest = findNearestHumanPosition(lat, lng)

        if (nearest) {
            // Snappa till närmaste punkt
            draggableMarkerRef.current.setLatLng([nearest.position.lat, nearest.position.lng])

            // Visa visuell feedback (linje från original till snapped position)
            if (snapIndicatorRef.current) {
                snapIndicatorRef.current.remove()
            }
            const indicator = L.polyline(
                [[lat, lng], [nearest.position.lat, nearest.position.lng]],
                {
                    color: '#3b82f6',
                    dashArray: '3, 3',
                    weight: 2,
                    opacity: 0.8,
                }
            ).addTo(mapInstanceRef.current)
            snapIndicatorRef.current = indicator
        } else {
            // Ta bort feedback om vi inte är nära någon punkt
            if (snapIndicatorRef.current) {
                snapIndicatorRef.current.remove()
                snapIndicatorRef.current = null
            }
        }
    }

    const handleCorrectionDragEnd = async () => {
        if (!draggableMarkerRef.current || !selectedPosition) return

        // Ta bort snap-indikator
        if (snapIndicatorRef.current) {
            snapIndicatorRef.current.remove()
            snapIndicatorRef.current = null
        }

        let { lat, lng } = draggableMarkerRef.current.getLatLng()

        // Om snapping är aktiverat, kontrollera om vi ska snappa (endast för hundspår)
        if (snappingEnabled && selectedPositionTrackType === 'dog' && humanTrack) {
            const nearest = findNearestHumanPosition(lat, lng)
            if (nearest) {
                lat = nearest.position.lat
                lng = nearest.position.lng
                // Uppdatera markörens position till den snappade positionen
                draggableMarkerRef.current.setLatLng([lat, lng])
            }
        }

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
            await refreshCurrentTrack(positionId, selectedPositionTrackType)
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
                        Välj människaspår och hundspår för jämförelse. Justera positioner på kartan.
                    </p>
                </div>

                <div className="space-y-3">
                    <div>
                        <label className="block text-sm font-medium mb-1">🚶 Människaspår</label>
                        <select
                            value={humanTrackId}
                            onChange={(e) => setHumanTrackId(e.target.value)}
                            className="w-full border border-slate-300 rounded px-2 py-2 text-sm"
                        >
                            <option value="">-- Välj människaspår --</option>
                            {tracks.filter(t => t.track_type === 'human').map((track) => (
                                <option key={track.id} value={track.id}>
                                    {track.name} ({track.positions?.length || 0} pos)
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">🐕 Hundspår</label>
                        <select
                            value={dogTrackId}
                            onChange={(e) => setDogTrackId(e.target.value)}
                            className="w-full border border-slate-300 rounded px-2 py-2 text-sm"
                        >
                            <option value="">-- Välj hundspår --</option>
                            {tracks.filter(t => t.track_type === 'dog').map((track) => (
                                <option key={track.id} value={track.id}>
                                    {track.name} ({track.positions?.length || 0} pos)
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Spår-info */}
                {(humanTrack || dogTrack) && (
                    <div className="text-xs bg-white border border-slate-200 rounded p-2 space-y-2">
                        {humanTrack && (
                            <div className="border-b border-slate-200 pb-2">
                                <div className="font-medium text-slate-700 flex items-center gap-1">
                                    <span>🚶</span>
                                    <span>{humanTrack.name}</span>
                                </div>
                                <div className="text-slate-500">Positioner: {humanPositions.length}</div>
                            </div>
                        )}
                        {dogTrack && (
                            <div>
                                <div className="font-medium text-slate-700 flex items-center gap-1">
                                    <span>🐕</span>
                                    <span>{dogTrack.name}</span>
                                </div>
                                <div className="text-slate-500">Positioner: {dogPositions.length}</div>
                            </div>
                        )}
                    </div>
                )}

                {/* Snapping-inställningar - endast när båda spår är valda */}
                {humanTrack && dogTrack && (
                    <div className="bg-white border border-slate-200 rounded p-3 space-y-2 text-xs">
                        <div className="font-semibold text-slate-700">🎯 Snapping-inställningar</div>
                        {humanTrack ? (
                            <>
                                <div className="flex items-center justify-between">
                                    <label className="text-slate-600">Aktivera snapping</label>
                                    <button
                                        onClick={() => setSnappingEnabled(!snappingEnabled)}
                                        className={`px-3 py-1 rounded text-[10px] font-semibold ${snappingEnabled
                                            ? 'bg-green-600 text-white'
                                            : 'bg-slate-200 text-slate-600'
                                            }`}
                                    >
                                        {snappingEnabled ? 'På' : 'Av'}
                                    </button>
                                </div>
                                <div>
                                    <label className="block text-slate-600 mb-1">
                                        Snapping-avstånd: {snappingDistance}m
                                    </label>
                                    <input
                                        type="range"
                                        min="5"
                                        max="20"
                                        step="1"
                                        value={snappingDistance}
                                        onChange={(e) => setSnappingDistance(Number(e.target.value))}
                                        className="w-full"
                                        disabled={!snappingEnabled}
                                    />
                                    <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                                        <span>5m</span>
                                        <span>20m</span>
                                    </div>
                                </div>
                                <div className="text-[10px] text-slate-500">
                                    Snappar till: <span className="font-medium">{humanTrack.name}</span>
                                </div>
                            </>
                        ) : (
                            <div className="text-[10px] text-slate-500">
                                Inget människaspår kopplat. Snapping inaktiverat.
                            </div>
                        )}
                    </div>
                )}

                <div className="flex-1">
                    <h3 className="font-semibold text-sm mb-2">Positioner</h3>
                    <div className="bg-white border border-slate-200 rounded max-h-64 overflow-y-auto divide-y divide-slate-100">
                        {humanPositions.length === 0 && dogPositions.length === 0 && (
                            <div className="p-3 text-xs text-slate-500">
                                Välj spår för att se positioner.
                            </div>
                        )}
                        {humanPositions.length > 0 && (
                            <>
                                <div className="px-3 py-2 bg-red-50 border-b border-red-200 text-[10px] font-semibold text-red-700">
                                    🚶 Människaspår ({humanPositions.length})
                                </div>
                                {humanPositions.map((pos, index) => {
                                    const status = pos.verified_status || 'pending'
                                    const isSelected = pos.id === selectedPositionId && selectedPositionTrackType === 'human'
                                    const positionNumber = index + 1
                                    return (
                                        <button
                                            key={pos.id}
                                            onClick={() => handleSelectPosition(pos.id, 'human')}
                                            className={`w-full text-left px-3 py-2 text-xs transition ${isSelected ? 'bg-blue-100' : 'bg-white hover:bg-slate-100'
                                                }`}
                                        >
                                            <div className="flex justify-between items-center">
                                                <span className="font-medium text-slate-700 flex items-center gap-1">
                                                    <span>🚶</span>
                                                    <span>{STATUS_ICONS[status]}</span>
                                                    <span>#{positionNumber}</span>
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
                            </>
                        )}
                        {dogPositions.length > 0 && (
                            <>
                                <div className="px-3 py-2 bg-purple-50 border-b border-purple-200 text-[10px] font-semibold text-purple-700">
                                    🐕 Hundspår ({dogPositions.length})
                                </div>
                                {dogPositions.map((pos, index) => {
                                    const status = pos.verified_status || 'pending'
                                    const isSelected = pos.id === selectedPositionId && selectedPositionTrackType === 'dog'
                                    const positionNumber = index + 1
                                    return (
                                        <button
                                            key={pos.id}
                                            onClick={() => handleSelectPosition(pos.id, 'dog')}
                                            className={`w-full text-left px-3 py-2 text-xs transition ${isSelected ? 'bg-blue-100' : 'bg-white hover:bg-slate-100'
                                                }`}
                                        >
                                            <div className="flex justify-between items-center">
                                                <span className="font-medium text-slate-700 flex items-center gap-1">
                                                    <span>🐕</span>
                                                    <span>{STATUS_ICONS[status]}</span>
                                                    <span>#{positionNumber}</span>
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
                            </>
                        )}
                    </div>
                </div>

                {selectedPosition && (() => {
                    const positions = selectedPositionTrackType === 'human' ? humanPositions : dogPositions
                    const positionIndex = positions.findIndex(p => p.id === selectedPosition.id)
                    const positionNumber = positionIndex >= 0 ? positionIndex + 1 : '?'
                    const trackIcon = selectedPositionTrackType === 'human' ? '🚶' : '🐕'
                    return (
                        <div className="bg-white border border-slate-200 rounded p-3 space-y-3 text-xs">
                            <div>
                                <div className="font-semibold text-slate-700 flex items-center gap-2">
                                    <span className="text-lg">{trackIcon}</span>
                                    <span className="text-lg">{STATUS_ICONS[selectedPosition.verified_status || 'pending']}</span>
                                    <span>Position #{positionNumber}</span>
                                    <span className="text-[10px] text-slate-500">
                                        ({selectedPositionTrackType === 'human' ? 'Människaspår' : 'Hundspår'})
                                    </span>
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
                    )
                })()}

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


