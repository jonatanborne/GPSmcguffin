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
    const draggableMarkerPositionIdRef = useRef(null) // Spåra vilken position markören tillhör
    const draggingPositionIdRef = useRef(null) // Spåra vilken position som justeras under drag-operationen
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
    const [batchAdjustMode, setBatchAdjustMode] = useState(false) // Batch-justeringsläge

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

        const map = L.map(mapRef.current, {
            maxZoom: 23, // Tillåt mycket närmare zoom (för detaljerad positionering)
            minZoom: 3,
            zoomControl: true,
        }).setView([59.334, 18.066], 14)

        // Skapa olika tile layers med olika zoom-stöd
        const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19,
        })

        // Esri World Imagery - stöder zoom upp till 23 med hög upplösning
        const esriImageryLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '© Esri',
            maxZoom: 23,
        })

        // Esri World Street Map - stöder zoom upp till 23
        const esriStreetLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
            attribution: '© Esri',
            maxZoom: 23,
        })

        // CartoDB Positron - stöder zoom upp till 20
        const cartoPositronLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '© OpenStreetMap contributors © CARTO',
            maxZoom: 20,
        })

        // Lägg till layer control för att växla mellan karttyper
        const baseMaps = {
            'OpenStreetMap': osmLayer,
            'Esri Satellit': esriImageryLayer,
            'Esri Gatukarta': esriStreetLayer,
            'CartoDB Ljus': cartoPositronLayer,
        }

        // Börja med Esri Street Map (hög zoom-stöd)
        esriStreetLayer.addTo(map)

        // Lägg till layer control
        L.control.layers(baseMaps).addTo(map)

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

            // Original point marker (smaller, grey) - alltid visa original om korrigerad finns
            if (pos.corrected_position) {
                // Original position - alltid visa som liten grå punkt
                L.circleMarker(originalLatLng, {
                    radius: 3,
                    color: '#64748b',
                    fillColor: '#94a3b8',
                    fillOpacity: 0.6,
                    weight: 1.5,
                }).bindTooltip(
                    `<div style="text-align: center; font-size: 11px;">🚶 Original #${positionNumber}</div>`,
                    { direction: 'top', offset: [0, -5] }
                ).addTo(markersLayerRef.current)

                // Line showing correction offset (streckad linje från original till korrigerad)
                L.polyline([originalLatLng, correctedLatLng], {
                    color: '#f59e0b', // Amber för att visa korrigering
                    dashArray: '5, 5',
                    weight: 2,
                    opacity: 0.7,
                }).addTo(markersLayerRef.current)
            }

            // Main marker: visa korrigerad position om den finns, annars original
            // Om korrigerad finns, visa den som huvudmarkör (större, tydligare)
            const radius = isSelected ? 5 : 4
            const marker = L.circleMarker(correctedLatLng, {
                radius,
                color: trackColor, // Röd border (spår-färg)
                fillColor: trackColor, // Röd fyllning för människaspår
                fillOpacity: isSelected ? 0.9 : 0.7,
                weight: isSelected ? 2.5 : 2,
            })

            marker.on('click', (e) => {
                // I batch-läge: tillåt att klicka på markörer för att byta position direkt
                // Annars: förhindra att klick på markörer ändrar vald position om användaren redan har valt en position
                if (!batchAdjustMode && selectedPositionId && !e.originalEvent.ctrlKey && !e.originalEvent.metaKey) {
                    // Om en position redan är vald, ignorera klicket (eller visa en notis)
                    return
                }
                handleSelectPosition(pos.id, 'human')
            })

            // Enhanced tooltip with icon (använd relativt nummer)
            const tooltipText = pos.corrected_position
                ? `<div style="text-align: center; font-weight: bold;">
                    🚶 ${icon} #${positionNumber} (Korrigerad)<br/>
                    <span style="font-size: 11px; font-weight: normal;">${STATUS_LABELS[status]}</span>
                </div>`
                : `<div style="text-align: center; font-weight: bold;">
                    🚶 ${icon} #${positionNumber}<br/>
                    <span style="font-size: 11px; font-weight: normal;">${STATUS_LABELS[status]}</span>
                </div>`
            marker.bindTooltip(tooltipText, {
                direction: 'top',
                offset: [0, -10],
                className: 'custom-tooltip',
            })

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

            // Original point marker (smaller, grey) - alltid visa original om korrigerad finns
            if (pos.corrected_position) {
                // Original position - alltid visa som liten grå punkt
                L.circleMarker(originalLatLng, {
                    radius: 3,
                    color: '#64748b',
                    fillColor: '#94a3b8',
                    fillOpacity: 0.6,
                    weight: 1.5,
                }).bindTooltip(
                    `<div style="text-align: center; font-size: 11px;">🐕 Original #${positionNumber}</div>`,
                    { direction: 'top', offset: [0, -5] }
                ).addTo(markersLayerRef.current)

                // Line showing correction offset (streckad linje från original till korrigerad)
                L.polyline([originalLatLng, correctedLatLng], {
                    color: '#f59e0b', // Amber för att visa korrigering
                    dashArray: '5, 5',
                    weight: 2,
                    opacity: 0.7,
                }).addTo(markersLayerRef.current)
            }

            // Main marker: visa korrigerad position om den finns, annars original
            // Om korrigerad finns, visa den som huvudmarkör (större, tydligare)
            const radius = isSelected ? 5 : 4
            const marker = L.circleMarker(correctedLatLng, {
                radius,
                color: trackColor, // Lila border (spår-färg)
                fillColor: trackColor, // Lila fyllning för hundspår
                fillOpacity: isSelected ? 0.9 : 0.7,
                weight: isSelected ? 2.5 : 2,
            })

            marker.on('click', (e) => {
                // I batch-läge: tillåt att klicka på markörer för att byta position direkt
                // Annars: förhindra att klick på markörer ändrar vald position om användaren redan har valt en position
                if (!batchAdjustMode && selectedPositionId && !e.originalEvent.ctrlKey && !e.originalEvent.metaKey) {
                    // Om en position redan är vald, ignorera klicket (eller visa en notis)
                    return
                }
                handleSelectPosition(pos.id, 'dog')
            })

            // Enhanced tooltip with icon (använd relativt nummer)
            const tooltipText = pos.corrected_position
                ? `<div style="text-align: center; font-weight: bold;">
                    🐕 ${icon} #${positionNumber} (Korrigerad)<br/>
                    <span style="font-size: 11px; font-weight: normal;">${STATUS_LABELS[status]}</span>
                </div>`
                : `<div style="text-align: center; font-weight: bold;">
                    🐕 ${icon} #${positionNumber}<br/>
                    <span style="font-size: 11px; font-weight: normal;">${STATUS_LABELS[status]}</span>
                </div>`
            marker.bindTooltip(tooltipText, {
                direction: 'top',
                offset: [0, -10],
                className: 'custom-tooltip',
            })

            marker.addTo(markersLayerRef.current)
        })
    }

    const handleSelectPosition = (positionId, trackType) => {
        // Konvertera till number om det är en sträng
        const numericPositionId = typeof positionId === 'string' ? Number(positionId) : positionId

        setSelectedPositionId(numericPositionId)
        setSelectedPositionTrackType(trackType)

        // I batch-läge: aktivera justering automatiskt, annars stäng av
        if (batchAdjustMode) {
            draggingPositionIdRef.current = numericPositionId
            setIsAdjusting(true)
        } else {
            setIsAdjusting(false)
        }

        const positions = trackType === 'human' ? humanPositions : dogPositions
        const position = positions.find((p) => p.id === numericPositionId)
        if (position) {
            setNotes(position.annotation_notes || '')
        } else {
            console.warn('Position inte hittad:', {
                searchedId: numericPositionId,
                trackType,
                availableIds: positions.map(p => p.id),
            })
        }
    }

    const updateDraggableMarker = () => {
        if (!mapInstanceRef.current) return

        if (!selectedPosition) {
            if (draggableMarkerRef.current) {
                draggableMarkerRef.current.remove()
                draggableMarkerRef.current = null
                draggableMarkerPositionIdRef.current = null
            }
            return
        }

        const latLng = selectedPosition.corrected_position || selectedPosition.position
        const point = [latLng.lat, latLng.lng]

        if (!draggableMarkerRef.current) {
            // Skapa ny markör för den valda positionen
            const marker = L.marker(point, { draggable: true })
            marker.on('drag', handleCorrectionDrag)
            marker.on('dragend', handleCorrectionDragEnd)
            marker.addTo(mapInstanceRef.current)
            draggableMarkerRef.current = marker
            draggableMarkerPositionIdRef.current = selectedPosition.id
        } else {
            // Om markören tillhör en annan position, flytta den alltid till den nya positionen
            if (draggableMarkerPositionIdRef.current !== selectedPosition.id) {
                // Markören tillhör en annan position, flytta den till den nya positionen
                draggableMarkerRef.current.setLatLng(point)
                draggableMarkerPositionIdRef.current = selectedPosition.id
            } else {
                // Om markören redan finns, kontrollera om den tillhör den nuvarande valda positionen
                const currentMarkerPos = draggableMarkerRef.current.getLatLng()
                const expectedPos = [latLng.lat, latLng.lng]
                const distanceToExpected = haversineDistance(
                    { lat: currentMarkerPos.lat, lng: currentMarkerPos.lng },
                    { lat: expectedPos[0], lng: expectedPos[1] }
                )

                // Om markören är nära den förväntade positionen (mindre än 1 meter),
                // betyder det att den redan är på rätt plats för denna position
                // I så fall, behåll den där den är om användaren justerar (isAdjusting)
                if (distanceToExpected < 1) {
                    // Markören är redan på rätt plats för denna position
                    if (isAdjusting) {
                        draggableMarkerRef.current.dragging.enable()
                    } else {
                        draggableMarkerRef.current.dragging.disable()
                    }
                    return
                }

                // Om markören är långt från den förväntade positionen (mer än 1 meter),
                // betyder det att den tillhör en annan position (t.ex. position #1 när vi valt #2)
                // I så fall, flytta markören till den nya positionen
                // MEN: om användaren justerar denna position OCH markören är nära denna positionens original,
                // betyder det att användaren just flyttat denna markör, så behåll den där den är
                if (distanceToExpected > 1) {
                    // Markören är inte på den valda positionen
                    // Kontrollera om användaren justerar denna position
                    if (isAdjusting) {
                        const originalPos = [selectedPosition.position.lat, selectedPosition.position.lng]
                        const distanceFromOriginal = haversineDistance(
                            { lat: currentMarkerPos.lat, lng: currentMarkerPos.lng },
                            { lat: originalPos[0], lng: originalPos[1] }
                        )

                        // Om markören är nära denna positionens original (mindre än 1 meter),
                        // betyder det att användaren just flyttat denna markör från original positionen
                        // Behåll den där användaren flyttat den
                        if (distanceFromOriginal < 1) {
                            draggableMarkerRef.current.dragging.enable()
                            return
                        }
                    }
                    // Annars, flytta markören till den nya positionen
                }

                // Uppdatera markörens position till korrigerad eller original för den valda positionen
                draggableMarkerRef.current.setLatLng(point)
            }
        }

        if (isAdjusting) {
            draggableMarkerRef.current.dragging.enable()
        } else {
            draggableMarkerRef.current.dragging.disable()
        }

        // Zooma in närmare när position väljs (minst zoom 18 för detaljerad vy)
        mapInstanceRef.current.setView(point, Math.max(mapInstanceRef.current.getZoom(), 18))
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
        if (!draggableMarkerRef.current) return

        // Använd den position som spårades när drag-operationen startade
        // Detta förhindrar att selectedPositionId ändras under drag-operationen
        const positionIdToSave = draggingPositionIdRef.current || selectedPositionId
        const trackTypeToSave = selectedPositionTrackType

        if (!positionIdToSave || !trackTypeToSave) {
            console.error('Ingen position att spara', { draggingPositionIdRef: draggingPositionIdRef.current, selectedPositionId })
            return
        }

        // Ta bort snap-indikator
        if (snapIndicatorRef.current) {
            snapIndicatorRef.current.remove()
            snapIndicatorRef.current = null
        }

        let { lat, lng } = draggableMarkerRef.current.getLatLng()

        // Om snapping är aktiverat, kontrollera om vi ska snappa (endast för hundspår)
        if (snappingEnabled && trackTypeToSave === 'dog' && humanTrack) {
            const nearest = findNearestHumanPosition(lat, lng)
            if (nearest) {
                lat = nearest.position.lat
                lng = nearest.position.lng
                // Uppdatera markörens position till den snappade positionen
                draggableMarkerRef.current.setLatLng([lat, lng])
            }
        }

        // I batch-läge: spara med "pending", annars spara med "incorrect" (som tidigare)
        const status = batchAdjustMode ? 'pending' : 'incorrect'
        const message = batchAdjustMode
            ? 'Position justerad. Fortsätt justera fler eller klicka "Godkänn alla justerade" när du är klar.'
            : 'Position justerad. Klicka "Korrekt" för att godkänna.'

        await saveAnnotation(positionIdToSave, {
            verified_status: status,
            corrected_position: { lat, lng },
            annotation_notes: notes,
        }, message)

        // Rensa ref efter drag-operationen
        draggingPositionIdRef.current = null

        // I batch-läge: behåll justering aktivt så användaren kan fortsätta justera nästa position direkt
        // Annars: stäng av justering som tidigare
        if (!batchAdjustMode) {
            setIsAdjusting(false)
        }
    }

    const saveAnnotation = async (positionId, payload, successMessage = 'Uppdaterat!') => {
        try {
            setLoading(true)
            setError(null)
            setMessage(null)

            // Spara korrigeringen till backend
            await axios.put(`${API_BASE}/track-positions/${positionId}`, payload)

            // Uppdatera spåret och behåll vald position
            // Detta kommer automatiskt trigga useEffect som renderar markörerna
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

    const handleMarkCorrect = async () => {
        if (!selectedPositionId || !selectedPositionTrackType || !selectedPosition) return

        const payload = {
            verified_status: 'correct',
            annotation_notes: notes,
        }

        // Om draggable marker finns och har flyttats från original positionen,
        // spara den korrigerade positionen
        let correctedPos = null
        if (draggableMarkerRef.current) {
            const markerLatLng = draggableMarkerRef.current.getLatLng()
            const originalLatLng = [selectedPosition.position.lat, selectedPosition.position.lng]
            const currentLatLng = [markerLatLng.lat, markerLatLng.lng]

            // Kontrollera om markören har flyttats (mer än 1 meter skillnad)
            const distance = haversineDistance(
                { lat: originalLatLng[0], lng: originalLatLng[1] },
                { lat: currentLatLng[0], lng: currentLatLng[1] }
            )

            if (distance > 1) {
                // Markören har flyttats, spara den korrigerade positionen
                correctedPos = { lat: currentLatLng[0], lng: currentLatLng[1] }
                payload.corrected_position = correctedPos
            } else if (selectedPosition.corrected_position) {
                // Markören är på original positionen men det finns en gammal korrigering,
                // behåll den gamla korrigeringen
                correctedPos = {
                    lat: selectedPosition.corrected_position.lat,
                    lng: selectedPosition.corrected_position.lng,
                }
                payload.corrected_position = correctedPos
            } else {
                // Ingen korrigering, säkerställ att ingen korrigering finns
                payload.clear_correction = true
            }
        } else if (selectedPosition.corrected_position) {
            // Ingen draggable marker men det finns en korrigerad position, behåll den
            correctedPos = {
                lat: selectedPosition.corrected_position.lat,
                lng: selectedPosition.corrected_position.lng,
            }
            payload.corrected_position = correctedPos
        } else {
            // Ingen korrigering, säkerställ att ingen korrigering finns
            payload.clear_correction = true
        }

        // Spara korrigeringen - använd selectedPositionId direkt för att säkerställa rätt position
        await saveAnnotation(selectedPositionId, payload, 'Markerad som korrekt.')

        // Stäng av justering EFTER att korrigeringen har sparats
        // Men behåll markören på sin korrigerade position om den har flyttats
        setIsAdjusting(false)

        // Om markören har flyttats, uppdatera den lokalt så den stannar på korrigerad position
        // även efter att selectedPosition har uppdaterats
        if (correctedPos && draggableMarkerRef.current) {
            // Vänta lite för att selectedPosition ska uppdateras
            setTimeout(() => {
                if (draggableMarkerRef.current) {
                    draggableMarkerRef.current.setLatLng([correctedPos.lat, correctedPos.lng])
                }
            }, 100)
        }
    }

    const handleMarkIncorrect = () => {
        if (!selectedPositionId) return
        saveAnnotation(selectedPositionId, {
            verified_status: 'incorrect',
            annotation_notes: notes,
        }, 'Markerad som fel.')
    }

    const handleResetCorrection = () => {
        if (!selectedPositionId) return
        saveAnnotation(selectedPositionId, {
            verified_status: 'pending',
            clear_correction: true,
            annotation_notes: notes,
        }, 'Korrigering återställd.')
    }

    const handleSaveNotes = () => {
        if (!selectedPositionId) return
        saveAnnotation(selectedPositionId, {
            annotation_notes: notes,
        }, 'Anteckningar sparade.')
    }

    // Hitta alla positioner som är justerade men inte godkända än (pending + corrected_position)
    const getPendingAdjustedPositions = () => {
        const allPositions = [...humanPositions, ...dogPositions]
        return allPositions.filter(pos =>
            pos.verified_status === 'pending' &&
            pos.corrected_position !== null &&
            pos.corrected_position !== undefined
        )
    }

    const handleApproveAllAdjusted = async () => {
        const pendingPositions = getPendingAdjustedPositions()

        if (pendingPositions.length === 0) {
            setMessage('Inga justerade positioner att godkänna.')
            setTimeout(() => setMessage(null), 2500)
            return
        }

        setLoading(true)
        setError(null)
        setMessage(null)

        try {
            let successCount = 0
            let failCount = 0

            for (const pos of pendingPositions) {
                try {
                    await axios.put(`${API_BASE}/track-positions/${pos.id}`, {
                        verified_status: 'correct',
                        corrected_position: pos.corrected_position,
                        annotation_notes: pos.annotation_notes || notes,
                    })
                    successCount++
                } catch (err) {
                    console.error(`Kunde inte uppdatera position ${pos.id}:`, err)
                    failCount++
                }
            }

            // Uppdatera spåren
            if (humanTrackId) {
                await fetchTrack(humanTrackId, 'human')
            }
            if (dogTrackId) {
                await fetchTrack(dogTrackId, 'dog')
            }

            if (failCount === 0) {
                setMessage(`✅ ${successCount} positioner godkända!`)
            } else {
                setMessage(`✅ ${successCount} positioner godkända, ${failCount} misslyckades.`)
            }
        } catch (err) {
            console.error('Fel vid godkännande av positioner:', err)
            setError('Kunde inte godkänna alla positioner.')
        } finally {
            setLoading(false)
            setTimeout(() => setMessage(null), 5000)
        }
    }

    return (
        <div className="h-full flex overflow-hidden">
            <div className="w-72 bg-slate-100 border-r border-slate-200 flex flex-col overflow-hidden">
                <div className="p-4 flex flex-col gap-4 overflow-y-auto flex-1 min-h-0">
                    <div>
                        <h2 className="text-lg font-semibold mb-2">Testmiljö</h2>
                        <p className="text-sm text-slate-600">
                            Välj människaspår och hundspår för jämförelse. Justera positioner på kartan.
                        </p>
                    </div>

                    {/* Godkänn alla justerade - synlig längst upp när batch-läge är aktivt */}
                    {batchAdjustMode && (() => {
                        const pendingCount = getPendingAdjustedPositions().length
                        return pendingCount > 0 && (
                            <div className="bg-green-50 border-2 border-green-500 rounded-lg p-3 shadow-md">
                                <div className="text-xs text-green-800 mb-2 font-semibold">
                                    {pendingCount} position{pendingCount !== 1 ? 'er' : ''} väntar på godkännande
                                </div>
                                <button
                                    onClick={handleApproveAllAdjusted}
                                    disabled={loading}
                                    className="w-full px-4 py-3 rounded-lg bg-green-600 text-white text-sm font-bold hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed transition shadow-md"
                                >
                                    ✅ Godkänn alla justerade ({pendingCount})
                                </button>
                            </div>
                        )
                    })()}

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

                    {/* Batch-justeringsläge */}
                    {(humanTrack || dogTrack) && (
                        <div className="bg-white border border-slate-200 rounded p-3 space-y-2 text-xs">
                            <div className="font-semibold text-slate-700">⚡ Justeringsläge</div>
                            <div className="flex items-center justify-between">
                                <label className="text-slate-600">Batch-justering (justera flera i rad)</label>
                                <button
                                    onClick={() => setBatchAdjustMode(!batchAdjustMode)}
                                    className={`px-3 py-1 rounded text-[10px] font-semibold transition ${batchAdjustMode
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-slate-200 text-slate-600'
                                        }`}
                                >
                                    {batchAdjustMode ? 'På' : 'Av'}
                                </button>
                            </div>
                            {batchAdjustMode && (
                                <div className="text-[10px] text-slate-500 mt-1">
                                    I batch-läge kan du justera flera positioner i rad. Använd "Nästa"-knappen för att automatiskt aktivera justering på nästa position.
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

                    <div className="space-y-3">
                        {humanPositions.length > 0 && (
                            <div>
                                <label className="block text-sm font-medium mb-1">🚶 Människaspår Position</label>
                                <select
                                    value={selectedPositionId && selectedPositionTrackType === 'human' ? selectedPositionId : ''}
                                    onChange={(e) => {
                                        if (e.target.value) {
                                            handleSelectPosition(Number(e.target.value), 'human')
                                        }
                                    }}
                                    className="w-full border border-slate-300 rounded px-2 py-2 text-sm"
                                >
                                    <option value="">-- Välj position --</option>
                                    {humanPositions.map((pos, index) => {
                                        const status = pos.verified_status || 'pending'
                                        const positionNumber = index + 1
                                        return (
                                            <option key={pos.id} value={pos.id}>
                                                #{positionNumber} - {STATUS_ICONS[status]} {STATUS_LABELS[status]} ({new Date(pos.timestamp).toLocaleString()})
                                            </option>
                                        )
                                    })}
                                </select>
                            </div>
                        )}

                        {dogPositions.length > 0 && (
                            <div>
                                <label className="block text-sm font-medium mb-1">🐕 Hundspår Position</label>
                                <select
                                    value={selectedPositionId && selectedPositionTrackType === 'dog' ? selectedPositionId : ''}
                                    onChange={(e) => {
                                        if (e.target.value) {
                                            handleSelectPosition(Number(e.target.value), 'dog')
                                        }
                                    }}
                                    className="w-full border border-slate-300 rounded px-2 py-2 text-sm"
                                >
                                    <option value="">-- Välj position --</option>
                                    {dogPositions.map((pos, index) => {
                                        const status = pos.verified_status || 'pending'
                                        const positionNumber = index + 1
                                        return (
                                            <option key={pos.id} value={pos.id}>
                                                #{positionNumber} - {STATUS_ICONS[status]} {STATUS_LABELS[status]} ({new Date(pos.timestamp).toLocaleString()})
                                            </option>
                                        )
                                    })}
                                </select>
                            </div>
                        )}

                        {humanPositions.length === 0 && dogPositions.length === 0 && (
                            <div className="text-xs text-slate-500">
                                Välj spår för att se positioner.
                            </div>
                        )}
                    </div>

                    {/* Navigation-knappar för att gå till nästa/föregående position */}
                    {selectedPosition && (() => {
                        const positions = selectedPositionTrackType === 'human' ? humanPositions : dogPositions
                        const currentIndex = positions.findIndex(p => p.id === selectedPosition.id)
                        const hasPrevious = currentIndex > 0
                        const hasNext = currentIndex < positions.length - 1

                        const handlePrevious = () => {
                            if (hasPrevious) {
                                const previousPosition = positions[currentIndex - 1]
                                handleSelectPosition(previousPosition.id, selectedPositionTrackType)
                                // I batch-läge: aktivera justering automatiskt
                                if (batchAdjustMode) {
                                    draggingPositionIdRef.current = previousPosition.id
                                    setIsAdjusting(true)
                                }
                            }
                        }

                        const handleNext = () => {
                            if (hasNext) {
                                const nextPosition = positions[currentIndex + 1]
                                handleSelectPosition(nextPosition.id, selectedPositionTrackType)
                                // I batch-läge: aktivera justering automatiskt
                                if (batchAdjustMode) {
                                    draggingPositionIdRef.current = nextPosition.id
                                    setIsAdjusting(true)
                                }
                            }
                        }

                        return (
                            <div className="flex gap-2 my-2">
                                <button
                                    onClick={handlePrevious}
                                    disabled={!hasPrevious || loading}
                                    className="flex-1 px-3 py-2 rounded bg-blue-200 text-blue-700 text-sm font-semibold hover:bg-blue-300 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed transition"
                                >
                                    ⬅️ Föregående
                                </button>
                                <button
                                    onClick={handleNext}
                                    disabled={!hasNext || loading}
                                    className="flex-1 px-3 py-2 rounded bg-blue-200 text-blue-700 text-sm font-semibold hover:bg-blue-300 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed transition"
                                >
                                    Nästa ➡️
                                </button>
                            </div>
                        )
                    })()}

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
                                        onClick={() => {
                                            if (!isAdjusting) {
                                                // När justering startar, spåra den valda positionen
                                                draggingPositionIdRef.current = selectedPositionId
                                            } else {
                                                // När justering avslutas, rensa ref
                                                draggingPositionIdRef.current = null
                                            }
                                            setIsAdjusting((prev) => !prev)
                                        }}
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


