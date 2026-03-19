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

// FAS 1: Truth levels (T0–T3)
const TRUTH_LEVEL_LABELS = {
    T0: 'Manuellt flyttad',
    T1: 'Verifierad',
    T2: 'ML-korrigerad',
    T3: 'Rå GPS',
}
const TRUTH_LEVEL_COLORS = {
    T0: '#22c55e',  // green
    T1: '#3b82f6',  // blue
    T2: '#a855f7',  // purple
    T3: '#6b7280',  // gray
}
const TRUTH_LEVEL_BG_COLORS = {
    T0: '#dcfce7',
    T1: '#dbeafe',
    T2: '#f3e8ff',
    T3: '#f3f4f6',
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
    const [environment, setEnvironment] = useState('')
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState(null)
    const [error, setError] = useState(null)
    const [snappingEnabled, setSnappingEnabled] = useState(false) // Standard: avstängt så användaren har full kontroll
    const [snappingDistance, setSnappingDistance] = useState(10) // meter
    const snapIndicatorRef = useRef(null) // Visuell feedback för snapping
    const [batchAdjustMode, setBatchAdjustMode] = useState(false) // Batch-justeringsläge
    const [convertingTiles, setConvertingTiles] = useState(false) // Tile conversion status
    const [renamingTracks, setRenamingTracks] = useState(false) // Track renaming status
    const [localTilesAvailable, setLocalTilesAvailable] = useState(false) // Om lokala tiles finns
    const [tileSize, setTileSize] = useState(512) // Standard tile-storlek (förstoringsfaktor 2)
    const [tileSource, setTileSource] = useState(() => {
        try {
            return localStorage.getItem('testlab_tile_source') || 'esri_satellite'
        } catch {
            return 'esri_satellite'
        }
    })

    // Spara tileSource till localStorage när den ändras
    useEffect(() => {
        try {
            localStorage.setItem('testlab_tile_source', tileSource)
        } catch { /* ignorerar */ }
    }, [tileSource])
    const [statusFilter, setStatusFilter] = useState('all') // Filter för status: 'all', 'pending', 'correct', 'incorrect'
    const [trackSourceFilter, setTrackSourceFilter] = useState('all') // 'all' | 'own' | 'imported'

    // ML-integration state
    const [mlPredictions, setMlPredictions] = useState(null) // ML-förutsägelser för valda spår
    const [isLoadingMLPredictions, setIsLoadingMLPredictions] = useState(false)
    const [mlComparisonMode, setMlComparisonMode] = useState(false) // Visa både manuell och ML-korrigering
    const mlPredictionLayerRef = useRef(null) // Layer för ML-förutsägelser på kartan

    // Audit trail (FAS 1: TestLab ML vs manuell + audit)
    const [auditLogOpen, setAuditLogOpen] = useState(false)
    const [auditLogEntries, setAuditLogEntries] = useState([])
    const [auditActionFilter, setAuditActionFilter] = useState('all') // 'all' | action-typer
    const [loadingAudit, setLoadingAudit] = useState(false)

    // Tröskel för "liten korrigering" (meter) – batch godkänn som ML
    const SMALL_CORRECTION_THRESHOLD_M = 5

    const selectedPosition = useMemo(
        () => {
            if (!selectedPositionId || !selectedPositionTrackType) return null
            const positions = selectedPositionTrackType === 'human' ? humanPositions : dogPositions
            return positions.find((p) => p.id === selectedPositionId) || null
        },
        [selectedPositionId, selectedPositionTrackType, humanPositions, dogPositions],
    )

    // Uppdatera environment när selectedPosition ändras
    useEffect(() => {
        if (selectedPosition) {
            setEnvironment(selectedPosition.environment || '')
        } else {
            setEnvironment('')
        }
    }, [selectedPosition])

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

    const filteredTracks = useMemo(() => {
        if (trackSourceFilter === 'all') return tracks
        if (trackSourceFilter === 'imported') {
            return tracks.filter(t => t.track_source === 'imported')
        }
        // 'own' – allt som inte är importerade
        return tracks.filter(t => t.track_source !== 'imported')
    }, [tracks, trackSourceFilter])

    // Filtrera positioner baserat på status-filter
    const filteredHumanPositions = useMemo(() => {
        if (statusFilter === 'all') return humanPositions
        return humanPositions.filter(p => (p.verified_status || 'pending') === statusFilter)
    }, [humanPositions, statusFilter])

    const filteredDogPositions = useMemo(() => {
        if (statusFilter === 'all') return dogPositions
        return dogPositions.filter(p => (p.verified_status || 'pending') === statusFilter)
    }, [dogPositions, statusFilter])

    // Beräkna statistik för dashboard
    const statistics = useMemo(() => {
        const allPositions = [...humanPositions, ...dogPositions]

        const pending = allPositions.filter(p => (p.verified_status || 'pending') === 'pending').length
        const correct = allPositions.filter(p => p.verified_status === 'correct').length
        const incorrect = allPositions.filter(p => p.verified_status === 'incorrect').length
        const total = allPositions.length

        // Beräkna genomsnittligt korrigeringsavstånd (endast för korrigerade positioner)
        const correctedPositions = allPositions.filter(p => p.corrected_position)
        let avgCorrectionDistance = 0
        if (correctedPositions.length > 0) {
            const totalDistance = correctedPositions.reduce((sum, pos) => {
                const distance = haversineDistance(
                    { lat: pos.position.lat, lng: pos.position.lng },
                    { lat: pos.corrected_position.lat, lng: pos.corrected_position.lng }
                )
                return sum + distance
            }, 0)
            avgCorrectionDistance = totalDistance / correctedPositions.length
        }

        const annotatedCount = correct + incorrect
        const progressPercentage = total > 0 ? Math.round((annotatedCount / total) * 100) : 0

        // FAS 1: Truth level counts
        const truthLevelCounts = {
            T0: allPositions.filter(p => (p.truth_level || 'T3') === 'T0').length,
            T1: allPositions.filter(p => (p.truth_level || 'T3') === 'T1').length,
            T2: allPositions.filter(p => (p.truth_level || 'T3') === 'T2').length,
            T3: allPositions.filter(p => (p.truth_level || 'T3') === 'T3').length,
        }

        return {
            pending,
            correct,
            incorrect,
            total,
            correctedCount: correctedPositions.length,
            avgCorrectionDistance,
            annotatedCount,
            progressPercentage,
            truthLevelCounts,
        }
    }, [humanPositions, dogPositions])

    useEffect(() => {
        initializeMap()
        loadTracks()
        checkTilesAvailability()

        return () => {
            // Cleanup map instance
            if (mapInstanceRef.current) {
                try {
                    mapInstanceRef.current.remove()
                } catch (e) {
                    console.log('Error removing map:', e)
                }
                mapInstanceRef.current = null
            }
            // Reset layer refs
            markersLayerRef.current = null
            humanTrackLayerRef.current = null
            draggableMarkerRef.current = null

            // Rensa Leaflet-data från DOM-elementet
            if (mapRef.current) {
                delete mapRef.current._leaflet_id
                mapRef.current.innerHTML = ''
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Piltangenter + snabbkommandon C/F för annotering
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (!selectedPositionId || !selectedPositionTrackType) return
            // Ignorera om användaren skriver i input/textarea
            const tag = (e.target?.tagName || '').toUpperCase()
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

            const positions = selectedPositionTrackType === 'human' ? humanPositions : dogPositions
            const currentIndex = positions.findIndex(p => p.id === selectedPositionId)

            if (e.key === 'ArrowLeft' && currentIndex > 0) {
                e.preventDefault()
                const previousPosition = positions[currentIndex - 1]
                handleSelectPosition(previousPosition.id, selectedPositionTrackType, batchAdjustMode)
            } else if (e.key === 'ArrowRight' && currentIndex < positions.length - 1) {
                e.preventDefault()
                const nextPosition = positions[currentIndex + 1]
                handleSelectPosition(nextPosition.id, selectedPositionTrackType, batchAdjustMode)
            } else if ((e.key === 'c' || e.key === 'C' || e.key === '1') && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault()
                handleMarkCorrect()
            } else if ((e.key === 'f' || e.key === 'F' || e.key === '2') && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault()
                handleMarkIncorrect(true)
            } else if ((e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault()
                // Hoppa till nästa ej märkt
                const nextPendingIndex = positions.findIndex((p, idx) =>
                    idx > currentIndex && (p.verified_status || 'pending') === 'pending'
                )
                if (nextPendingIndex !== -1) {
                    const nextPendingPosition = positions[nextPendingIndex]
                    handleSelectPosition(nextPendingPosition.id, selectedPositionTrackType, batchAdjustMode)
                } else {
                    const firstPendingIndex = positions.findIndex(p => (p.verified_status || 'pending') === 'pending')
                    if (firstPendingIndex !== -1 && firstPendingIndex !== currentIndex) {
                        const firstPendingPosition = positions[firstPendingIndex]
                        handleSelectPosition(firstPendingPosition.id, selectedPositionTrackType, batchAdjustMode)
                    } else {
                        setMessage('Inga fler ej märkta positioner.')
                        setTimeout(() => setMessage(null), 2000)
                    }
                }
            }
        }

        window.addEventListener('keydown', handleKeyDown)

        return () => {
            window.removeEventListener('keydown', handleKeyDown)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedPositionId, selectedPositionTrackType, humanPositions, dogPositions, batchAdjustMode])

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

    // Centrera kartan på spåren när människaspår eller hundspår laddas
    useEffect(() => {
        if (!mapInstanceRef.current || loading) return
        const valid = []
        const addPoint = (lat, lng) => {
            if (lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) valid.push([lat, lng])
        }
        humanPositions.forEach(p => {
            if (p.position) addPoint(p.position.lat, p.position.lng)
            if (p.corrected_position) addPoint(p.corrected_position.lat, p.corrected_position.lng)
        })
        dogPositions.forEach(p => {
            if (p.position) addPoint(p.position.lat, p.position.lng)
            if (p.corrected_position) addPoint(p.corrected_position.lat, p.corrected_position.lng)
        })
        if (valid.length === 0) return
        try {
            if (valid.length === 1) {
                mapInstanceRef.current.setView(valid[0], 16, { animate: true })
            } else {
                const bounds = L.latLngBounds(valid)
                mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 18, animate: true })
            }
        } catch { /* ignorerar */ }
    }, [humanPositions, dogPositions, loading])

    // Visualisera ML-förutsägelser på kartan - Jämför med ML-läge (INGA ändringar sparas)
    useEffect(() => {
        if (!mapInstanceRef.current) return

        // Om ML-jämförelse är avstängd, ta bort lagret
        if (!mlComparisonMode || !mlPredictions) {
            if (mlPredictionLayerRef.current) {
                mlPredictionLayerRef.current.clearLayers()
                if (mapInstanceRef.current.hasLayer(mlPredictionLayerRef.current)) {
                    mapInstanceRef.current.removeLayer(mlPredictionLayerRef.current)
                }
                mlPredictionLayerRef.current = null
            }
            return
        }

        // Skapa eller återanvänd ML-lager
        if (!mlPredictionLayerRef.current) {
            mlPredictionLayerRef.current = L.layerGroup().addTo(mapInstanceRef.current)
        } else {
            mlPredictionLayerRef.current.clearLayers()
            if (!mapInstanceRef.current.hasLayer(mlPredictionLayerRef.current)) {
                mlPredictionLayerRef.current.addTo(mapInstanceRef.current)
            }
        }

        if (!mlPredictions.predictions || mlPredictions.predictions.length === 0) return

        // Hämta alla positioner för att jämföra med ML-förutsägelser
        const allPositions = [...humanPositions, ...dogPositions]

        // Rita ML-korrigerade spår (blå, streckad linje)
        const mlCoords = mlPredictions.predictions
            .filter(p => p.predicted_corrected_position)
            .map(p => [p.predicted_corrected_position.lat, p.predicted_corrected_position.lng])

        if (mlCoords.length > 0) {
            const mlPolyline = L.polyline(mlCoords, {
                color: '#3b82f6', // Blå för ML
                weight: 4,
                opacity: 0.8,
                dashArray: '10, 5',
            }).addTo(mlPredictionLayerRef.current)

            mlPolyline.bindTooltip('🔮 ML-korrigerat spår (blå, streckad)', { sticky: true })
        }

        // För varje position: visa original, manuell korrigering (om finns) och ML-korrigering
        mlPredictions.predictions.forEach((pred) => {
            const position = allPositions.find(p => p.id === pred.position_id)
            if (!position || !pred.predicted_corrected_position) return

            const originalPos = [pred.original_position.lat, pred.original_position.lng]
            const mlPos = [pred.predicted_corrected_position.lat, pred.predicted_corrected_position.lng]
            const hasManualCorrection = position.corrected_position !== null && position.corrected_position !== undefined
            const manualPos = hasManualCorrection 
                ? [position.corrected_position.lat, position.corrected_position.lng]
                : null

            // Beräkna avstånd
            const mlDistance = pred.predicted_correction_distance_meters || 0
            const manualDistance = hasManualCorrection 
                ? haversineDistance(position.position, position.corrected_position)
                : null
            const difference = manualDistance !== null 
                ? Math.abs(mlDistance - manualDistance)
                : null

            // Markör för original position (grå)
            const originalMarker = L.circleMarker(originalPos, {
                radius: 6,
                fillColor: '#6b7280', // Grå
                color: '#374151',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.8,
            }).addTo(mlPredictionLayerRef.current)
            originalMarker.bindTooltip(
                `📍 Original GPS\nLat: ${pred.original_position.lat.toFixed(6)}\nLng: ${pred.original_position.lng.toFixed(6)}`,
                { sticky: true }
            )

            // Markör för ML-korrigering (blå)
            const mlMarker = L.circleMarker(mlPos, {
                radius: 8,
                fillColor: '#3b82f6', // Blå
                color: '#1e40af',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.9,
            }).addTo(mlPredictionLayerRef.current)
            
            let mlTooltip = `🔮 ML-korrigering\nAvstånd: ${mlDistance.toFixed(2)}m\nLat: ${pred.predicted_corrected_position.lat.toFixed(6)}\nLng: ${pred.predicted_corrected_position.lng.toFixed(6)}`
            if (difference !== null) {
                const quality = difference < 0.5 ? '✅ Mycket bra' : difference < 1.0 ? '⚠️ Bra' : '❌ Stor skillnad'
                mlTooltip += `\n\nJämfört med manuell:\nSkillnad: ${difference.toFixed(2)}m\n${quality}`
            }
            mlMarker.bindTooltip(mlTooltip, { sticky: true })

            // Markör för manuell korrigering (grön) - om den finns
            if (hasManualCorrection && manualPos) {
                const manualMarker = L.circleMarker(manualPos, {
                    radius: 8,
                    fillColor: '#22c55e', // Grön
                    color: '#15803d',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.9,
                }).addTo(mlPredictionLayerRef.current)
                manualMarker.bindTooltip(
                    `✅ Manuell korrigering\nAvstånd: ${manualDistance.toFixed(2)}m\nLat: ${position.corrected_position.lat.toFixed(6)}\nLng: ${position.corrected_position.lng.toFixed(6)}`,
                    { sticky: true }
                )

                // Linje från original till manuell korrigering (grön, solid)
                const manualLine = L.polyline([originalPos, manualPos], {
                    color: '#22c55e', // Grön
                    weight: 2,
                    opacity: 0.6,
                }).addTo(mlPredictionLayerRef.current)
                manualLine.bindTooltip(
                    `✅ Manuell: ${manualDistance.toFixed(2)}m`,
                    { sticky: true }
                )
            }

            // Linje från original till ML-korrigering (blå, streckad)
            const mlLine = L.polyline([originalPos, mlPos], {
                color: '#3b82f6', // Blå
                weight: 2,
                opacity: 0.6,
                dashArray: '5, 5',
            }).addTo(mlPredictionLayerRef.current)
            mlLine.bindTooltip(
                `🔮 ML: ${mlDistance.toFixed(2)}m`,
                { sticky: true }
            )

            // Om både manuell och ML finns: rita linje mellan dem för att visa skillnaden
            if (hasManualCorrection && manualPos) {
                const comparisonLine = L.polyline([manualPos, mlPos], {
                    color: difference !== null && difference < 1.0 ? '#f59e0b' : '#ef4444', // Gul om nära, röd om långt ifrån
                    weight: 1.5,
                    opacity: 0.4,
                    dashArray: '3, 3',
                }).addTo(mlPredictionLayerRef.current)
                
                if (difference !== null) {
                    const quality = difference < 0.5 ? '✅ Mycket bra matchning' : difference < 1.0 ? '⚠️ Bra matchning' : '❌ Stor skillnad'
                    comparisonLine.bindTooltip(
                        `Jämförelse: ${difference.toFixed(2)}m\n${quality}`,
                        { sticky: true }
                    )
                }
            }
        })
    }, [mlPredictions, mlComparisonMode, humanPositions, dogPositions])

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
    }, [humanPositions, dogPositions, selectedPositionId, statusFilter])

    useEffect(() => {
        updateDraggableMarker()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedPosition, isAdjusting])

    const initializeMap = () => {
        // Kontrollera om kartan redan är initierad
        if (mapInstanceRef.current) {
            console.log('Map already exists in mapInstanceRef')
            return
        }

        // Kontrollera om mapRef är redo
        if (!mapRef.current) {
            console.log('mapRef not ready yet')
            return
        }

        // Kontrollera om Leaflet redan har initierat på detta DOM-element
        if (mapRef.current._leaflet_id) {
            console.log('Leaflet already initialized on this DOM element')
            return
        }

        console.log('Initializing map...', mapRef.current)
        const map = L.map(mapRef.current, {
            maxZoom: 26, // Tillåt extrem zoom – vid 24–26 skalas tiles upp (upplösning blir sämre)
            minZoom: 3,
            zoomControl: true,
        }).setView([59.334, 18.066], 14)

        console.log('Map created, center:', map.getCenter(), 'zoom:', map.getZoom())

        // Skapa olika tile layers med olika zoom-stöd
        const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 26,
            maxNativeZoom: 19, // OSM har tiles till zoom 19 – Leaflet skalar upp vid zoom 20–26
        })

        // Esri World Imagery – satellit. Officiellt till zoom 23, skalar upp till 26
        const esriImageryLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '© Esri',
            maxZoom: 26,
            maxNativeZoom: 23, // Esri max – vid zoom 24–26 skalas bilden upp (lite pixeligare)
        })

        // Esri World Street Map
        const esriStreetLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
            attribution: '© Esri',
            maxZoom: 26,
            maxNativeZoom: 23,
        })

        // CartoDB Positron
        const cartoPositronLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '© OpenStreetMap contributors © CARTO',
            maxZoom: 26,
            maxNativeZoom: 20, // CartoDB till 20 – Leaflet skalar upp vid 21–26
        })

        // Lokal högupplösning tile layer (om tiles finns)
        const localHighResLayer = L.tileLayer(`${API_BASE}/static/tiles/{z}/{x}/{y}.png`, {
            attribution: '© Lokal högupplösning',
            maxZoom: 26,
            minZoom: 10, // Minsta zoom för lokala tiles
            tileSize: 1024, // 4x förstoring (256x256 → 1024x1024), uppdateras när tiles kontrolleras
            zoomOffset: 0,
            // Ta bort errorTileUrl så Leaflet visar standard fel-tile (grå ruta)
            // Detta gör det tydligt när tiles saknas
        })

        // Lägg till layer control för att växla mellan karttyper
        const baseMaps = {
            'OpenStreetMap': osmLayer,
            'Esri Satellit': esriImageryLayer,
            'Esri Gatukarta': esriStreetLayer,
            'CartoDB Ljus': cartoPositronLayer,
        }

        // Lägg till lokal högupplösning om tiles finns (testa genom att försöka ladda en tile)
        // För enkelhetens skull, lägg alltid till den men den kommer bara fungera om tiles finns
        baseMaps['Lokal Högupplösning'] = localHighResLayer

        // Börja med Esri Street Map (hög zoom-stöd)
        esriStreetLayer.addTo(map)

        // Debug: Kontrollera att tile layer faktiskt laddas
        esriStreetLayer.on('tileload', () => {
            console.log('Tile loaded successfully')
        })
        esriStreetLayer.on('tileerror', (error, tile) => {
            console.error('Tile load error:', error, tile)
        })

        // Lägg till layer control
        L.control.layers(baseMaps).addTo(map)

        // Debug: Kontrollera att kartan är korrekt initierad
        console.log('Map initialized:', {
            center: map.getCenter(),
            zoom: map.getZoom(),
            activeLayers: map.eachLayer((layer) => {
                if (layer instanceof L.TileLayer) {
                    console.log('Active tile layer:', layer.options.attribution)
                }
            })
        })

        markersLayerRef.current = L.layerGroup().addTo(map)
        humanTrackLayerRef.current = L.layerGroup().addTo(map)

        // Snabbjustering: hantera klick på kartan för att flytta position direkt
        // Fungerar när justering är aktiv (både i batch-läge och normalt läge)
        map.on('click', (e) => {
            if (selectedPositionId && isAdjusting) {
                // Använd exakt klickad position - snapping ska bara gälla om det är explicit aktiverat
                let targetLatLng = e.latlng

                // Snapping ska BARA gälla om:
                // 1. Snapping är explicit aktiverat (snappingEnabled === true)
                // 2. Det är ett hundspår som justeras
                // 3. Det finns ett människaspår att snappa till
                if (snappingEnabled === true && selectedPositionTrackType === 'dog' && humanTrack) {
                    const nearest = findNearestHumanPosition(e.latlng.lat, e.latlng.lng)
                    if (nearest) {
                        targetLatLng = L.latLng(nearest.position.lat, nearest.position.lng)
                    }
                }
                // Om snapping är avstängt, använd exakt klickad position utan någon modifiering

                // Om markören inte finns ännu, skapa den först genom att anropa updateDraggableMarker
                if (!draggableMarkerRef.current && selectedPosition) {
                    // updateDraggableMarker kommer att skapa markören korrekt med alla event handlers
                    updateDraggableMarker()
                }

                // Flytta markören till klickad position (samma som att dra den)
                if (draggableMarkerRef.current) {
                    draggableMarkerRef.current.setLatLng(targetLatLng)
                }

                // Spara ändringen direkt
                // I batch-läge: spara med "pending", annars med "incorrect"
                const status = batchAdjustMode ? 'pending' : 'incorrect'
                const message = batchAdjustMode
                    ? 'Position justerad. Klicka "Korrekt" för att godkänna eller fortsätt justera fler.'
                    : 'Position justerad. Klicka "Korrekt" för att godkänna.'

                const positionIdToSave = draggingPositionIdRef.current || selectedPositionId
                if (positionIdToSave) {
                    saveAnnotation(positionIdToSave, {
                        verified_status: status,
                        corrected_position: { lat: targetLatLng.lat, lng: targetLatLng.lng },
                        annotation_notes: notes,
                    }, message)
                }
            }
        })

        mapInstanceRef.current = map
    }

    const checkTilesAvailability = async () => {
        try {
            const response = await axios.get(`${API_BASE}/tiles/status`)
            if (response.data.available) {
                setLocalTilesAvailable(true)
                if (response.data.tile_size) {
                    setTileSize(response.data.tile_size)
                    // Uppdatera tile layer med rätt storlek och zoom-nivåer
                    if (mapInstanceRef.current) {
                        mapInstanceRef.current.eachLayer((layer) => {
                            if (layer.options && layer.options.attribution === '© Lokal högupplösning') {
                                const zoomLevels = response.data.zoom_levels || []
                                const minZoom = zoomLevels.length > 0 ? Math.min(...zoomLevels) : 10
                                const maxZoom = zoomLevels.length > 0 ? Math.max(...zoomLevels) : 26
                                layer.setOptions({
                                    tileSize: response.data.tile_size,
                                    minZoom: minZoom,
                                    maxZoom: maxZoom
                                })
                                console.log('Updated local tile layer:', { tileSize: response.data.tile_size, minZoom, maxZoom, zoomLevels })
                            }
                        })
                    }
                }
            } else {
                setLocalTilesAvailable(false)
            }
        } catch (err) {
            console.log('Inga lokala tiles tillgängliga:', err.message)
            setLocalTilesAvailable(false)
        }
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

    // Beräkna progress för ett specifikt spår
    const calculateTrackProgress = (track) => {
        if (!track.positions || track.positions.length === 0) return 0

        const annotated = track.positions.filter(p =>
            p.verified_status === 'correct' || p.verified_status === 'incorrect'
        ).length

        return Math.round((annotated / track.positions.length) * 100)
    }

    // Få färg baserat på progress
    const getProgressColor = (progress) => {
        if (progress === 100) return { backgroundColor: '#d1fae5', color: '#065f46' } // Grön
        if (progress >= 50) return { backgroundColor: '#fef3c7', color: '#92400e' } // Gul/Amber
        if (progress > 0) return { backgroundColor: '#fee2e2', color: '#991b1b' } // Ljusröd
        return {} // Standard (vit)
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

        // Rita människaspår-positioner (använd filtrerade positioner)
        filteredHumanPositions.forEach((pos) => {
            // Hitta rätt index i det ofiltrerade spåret för korrekt numrering
            const index = humanPositions.findIndex(p => p.id === pos.id)
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
                // Beräkna korrigeringsavstånd
                const correctionDistance = haversineDistance(
                    { lat: originalLatLng[0], lng: originalLatLng[1] },
                    { lat: correctedLatLng[0], lng: correctedLatLng[1] }
                )

                // Färgkodning baserat på korrigeringsavstånd
                let correctionColor = '#22c55e' // Grön: < 5m
                if (correctionDistance > 15) {
                    correctionColor = '#ef4444' // Röd: > 15m
                } else if (correctionDistance > 5) {
                    correctionColor = '#f59e0b' // Gul/Amber: 5-15m
                }

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
                const correctionLine = L.polyline([originalLatLng, correctedLatLng], {
                    color: correctionColor,
                    dashArray: '5, 5',
                    weight: 2,
                    opacity: 0.8,
                })

                // Tooltip med avstånd på linjen
                correctionLine.bindTooltip(
                    `<div style="text-align: center; font-size: 11px; font-weight: bold;">
                        📏 ${correctionDistance.toFixed(1)}m
                    </div>`,
                    {
                        permanent: false,
                        direction: 'center',
                        className: 'correction-distance-tooltip'
                    }
                )

                correctionLine.addTo(markersLayerRef.current)
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

            // Enhanced tooltip with icon (använd relativt nummer) + FAS 1 truth level
            const tl = pos.truth_level || 'T3'
            const tooltipText = pos.corrected_position
                ? `<div style="text-align: center; font-weight: bold;">
                    🚶 ${icon} #${positionNumber} (Korrigerad)<br/>
                    <span style="font-size: 11px; font-weight: normal;">${STATUS_LABELS[status]}</span>
                    <span style="font-size: 10px; margin-left: 4px; color: ${TRUTH_LEVEL_COLORS[tl]};">${tl}</span>
                </div>`
                : `<div style="text-align: center; font-weight: bold;">
                    🚶 ${icon} #${positionNumber}<br/>
                    <span style="font-size: 11px; font-weight: normal;">${STATUS_LABELS[status]}</span>
                    <span style="font-size: 10px; margin-left: 4px; color: ${TRUTH_LEVEL_COLORS[tl]};">${tl}</span>
                </div>`
            marker.bindTooltip(tooltipText, {
                direction: 'top',
                offset: [0, -10],
                className: 'custom-tooltip',
            })

            marker.addTo(markersLayerRef.current)
        })

        // Rita hundspår-positioner (använd filtrerade positioner)
        filteredDogPositions.forEach((pos) => {
            // Hitta rätt index i det ofiltrerade spåret för korrekt numrering
            const index = dogPositions.findIndex(p => p.id === pos.id)
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
                // Beräkna korrigeringsavstånd
                const correctionDistance = haversineDistance(
                    { lat: originalLatLng[0], lng: originalLatLng[1] },
                    { lat: correctedLatLng[0], lng: correctedLatLng[1] }
                )

                // Färgkodning baserat på korrigeringsavstånd
                let correctionColor = '#22c55e' // Grön: < 5m
                if (correctionDistance > 15) {
                    correctionColor = '#ef4444' // Röd: > 15m
                } else if (correctionDistance > 5) {
                    correctionColor = '#f59e0b' // Gul/Amber: 5-15m
                }

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
                const correctionLine = L.polyline([originalLatLng, correctedLatLng], {
                    color: correctionColor,
                    dashArray: '5, 5',
                    weight: 2,
                    opacity: 0.8,
                })

                // Tooltip med avstånd på linjen
                correctionLine.bindTooltip(
                    `<div style="text-align: center; font-size: 11px; font-weight: bold;">
                        📏 ${correctionDistance.toFixed(1)}m
                    </div>`,
                    {
                        permanent: false,
                        direction: 'center',
                        className: 'correction-distance-tooltip'
                    }
                )

                correctionLine.addTo(markersLayerRef.current)
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
            // FAS 1: truth level i tooltip
            const tl = pos.truth_level || 'T3'
            const tooltipText = pos.corrected_position
                ? `<div style="text-align: center; font-weight: bold;">
                    🐕 ${icon} #${positionNumber} (Korrigerad)<br/>
                    <span style="font-size: 11px; font-weight: normal;">${STATUS_LABELS[status]}</span>
                    <span style="font-size: 10px; margin-left: 4px; color: ${TRUTH_LEVEL_COLORS[tl]};">${tl}</span>
                </div>`
                : `<div style="text-align: center; font-weight: bold;">
                    🐕 ${icon} #${positionNumber}<br/>
                    <span style="font-size: 11px; font-weight: normal;">${STATUS_LABELS[status]}</span>
                    <span style="font-size: 10px; margin-left: 4px; color: ${TRUTH_LEVEL_COLORS[tl]};">${tl}</span>
                </div>`
            marker.bindTooltip(tooltipText, {
                direction: 'top',
                offset: [0, -10],
                className: 'custom-tooltip',
            })

            marker.addTo(markersLayerRef.current)
        })
    }

    const handleSelectPosition = (positionId, trackType, keepAdjusting = false) => {
        // Konvertera till number om det är en sträng
        const numericPositionId = typeof positionId === 'string' ? Number(positionId) : positionId

        setSelectedPositionId(numericPositionId)
        setSelectedPositionTrackType(trackType)

        // I batch-läge: aktivera justering automatiskt
        // Om keepAdjusting är true: behåll justering aktivt (används när vi går till nästa position)
        // Annars: stäng av justering om inte batch-läge är på
        if (batchAdjustMode || keepAdjusting) {
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
        // Snapping ska BARA gälla om det är explicit aktiverat
        if (!draggableMarkerRef.current || snappingEnabled !== true) return
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

        // Snapping ska BARA gälla om det är explicit aktiverat
        // Om snapping är aktiverat, kontrollera om vi ska snappa (endast för hundspår)
        if (snappingEnabled === true && trackTypeToSave === 'dog' && humanTrack) {
            const nearest = findNearestHumanPosition(lat, lng)
            if (nearest) {
                lat = nearest.position.lat
                lng = nearest.position.lng
                // Uppdatera markörens position till den snappade positionen
                draggableMarkerRef.current.setLatLng([lat, lng])
            }
        }
        // Om snapping är avstängt, använd exakt position där markören släpptes

        // I batch-läge: spara med "pending", annars spara med "incorrect" (som tidigare)
        const status = batchAdjustMode ? 'pending' : 'incorrect'
        const message = batchAdjustMode
            ? 'Position justerad. Fortsätt justera fler eller klicka "Godkänn alla justerade" när du är klar.'
            : 'Position justerad. Klicka "Korrekt" för att godkänna.'

        await saveAnnotation(positionIdToSave, {
            verified_status: status,
            corrected_position: { lat, lng },
            annotation_notes: notes,
            environment: environment || null,
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
            environment: environment || null,
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

        // Gå automatiskt till nästa position efter godkännande (fungerar både i batch-läge och normalt läge)
        const positions = selectedPositionTrackType === 'human' ? humanPositions : dogPositions
        const currentIndex = positions.findIndex(p => p.id === selectedPosition.id)
        const hasNext = currentIndex < positions.length - 1

        if (hasNext) {
            const nextPosition = positions[currentIndex + 1]
            // Gå till nästa position och behåll justering aktivt (keepAdjusting = true)
            handleSelectPosition(nextPosition.id, selectedPositionTrackType, true)
        } else {
            // Inga fler positioner, stäng av justering
            setIsAdjusting(false)
        }

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

    const handleMarkIncorrect = async (goToNext = false) => {
        if (!selectedPositionId || !selectedPosition || !selectedPositionTrackType) return
        await saveAnnotation(selectedPositionId, {
            verified_status: 'incorrect',
            annotation_notes: notes,
            environment: environment || null,
        }, 'Markerad som fel.')

        if (goToNext) {
            const positions = selectedPositionTrackType === 'human' ? humanPositions : dogPositions
            const currentIndex = positions.findIndex(p => p.id === selectedPosition.id)
            const hasNext = currentIndex < positions.length - 1
            if (hasNext) {
                const nextPosition = positions[currentIndex + 1]
                handleSelectPosition(nextPosition.id, selectedPositionTrackType, true)
            } else {
                setIsAdjusting(false)
            }
        }
    }

    const handleResetCorrection = () => {
        if (!selectedPositionId) return
        saveAnnotation(selectedPositionId, {
            verified_status: 'pending',
            clear_correction: true,
            annotation_notes: notes,
            environment: environment || null,
        }, 'Korrigering återställd.')
    }

    const handleSaveNotes = () => {
        if (!selectedPositionId) return
        saveAnnotation(selectedPositionId, {
            annotation_notes: notes,
            environment: environment || null,
        }, 'Anteckningar sparade.')
    }

    // ML-integration: Hämta ML-förutsägelser för valda spår
    const fetchMLPredictions = async () => {
        const trackIds = []
        if (humanTrackId) trackIds.push(humanTrackId)
        if (dogTrackId) trackIds.push(dogTrackId)

        if (trackIds.length === 0) {
            setError('Välj minst ett spår först')
            setTimeout(() => setError(null), 3000)
            return
        }

        setIsLoadingMLPredictions(true)
        setError(null)
        setMessage(null)

        try {
            let response
            if (trackIds.length > 1) {
                // Flera spår
                response = await axios.get(`${API_BASE}/ml/predict/multiple?track_ids=${trackIds.join(',')}`)
            } else {
                // Ett spår
                response = await axios.post(`${API_BASE}/ml/predict/${trackIds[0]}`)
            }

            setMlPredictions(response.data.data || response.data)
            setMessage(`✅ ML-förutsägelser laddade för ${trackIds.length} spår`)
            setTimeout(() => setMessage(null), 3000)
        } catch (err) {
            console.error('Fel vid hämtning av ML-förutsägelser:', err)
            setError(err.response?.data?.detail || 'Kunde inte hämta ML-förutsägelser. Kontrollera att en modell är tränad.')
            setTimeout(() => setError(null), 5000)
        } finally {
            setIsLoadingMLPredictions(false)
        }
    }

    // ML-integration: Hämta ML-förutsägelse för en specifik position
    const getMLPredictionForPosition = (positionId) => {
        if (!mlPredictions || !mlPredictions.predictions) return null
        return mlPredictions.predictions.find(p => p.position_id === positionId)
    }

    // ML-integration: Godkänn ML (approve-ml endpoint – sätter correction_source='ml', T2)
    const handleAcceptMLPrediction = async () => {
        if (!selectedPositionId || !selectedPosition) return

        const mlPred = getMLPredictionForPosition(selectedPositionId)
        if (!mlPred || !mlPred.predicted_corrected_position) {
            setError('Ingen ML-förutsägelse tillgänglig för denna position')
            setTimeout(() => setError(null), 3000)
            return
        }

        setLoading(true)
        setError(null)
        try {
            const { lat: predicted_lat, lng: predicted_lng } = mlPred.predicted_corrected_position
            await axios.post(`${API_BASE}/track-positions/${selectedPositionId}/approve-ml`, {
                predicted_lat,
                predicted_lng,
                ml_confidence: mlPred.ml_confidence ?? null,
                ml_model_version: null,
            })
            setMessage('Godkänd ML-korrigering sparad (T2).')
            setTimeout(() => setMessage(null), 3000)
            if (humanTrackId) await fetchTrack(humanTrackId, 'human')
            if (dogTrackId) await fetchTrack(dogTrackId, 'dog')
            const positions = selectedPositionTrackType === 'human' ? humanPositions : dogPositions
            const currentIndex = positions.findIndex(p => p.id === selectedPosition.id)
            if (currentIndex < positions.length - 1) {
                const nextPosition = positions[currentIndex + 1]
                handleSelectPosition(nextPosition.id, selectedPositionTrackType, batchAdjustMode)
            }
        } catch (err) {
            setError(err.response?.data?.detail || 'Kunde inte godkänna ML-korrigering.')
            setTimeout(() => setError(null), 5000)
        } finally {
            setLoading(false)
        }
    }

    // ML-integration: Underkänn ML (reject-ml – återställ till rå GPS, T3)
    const handleRejectMLCorrection = async () => {
        if (!selectedPositionId) return
        setLoading(true)
        setError(null)
        try {
            await axios.post(`${API_BASE}/track-positions/${selectedPositionId}/reject-ml`)
            setMessage('ML-korrigering borttagen (position återställd till rå GPS).')
            setTimeout(() => setMessage(null), 3000)
            if (humanTrackId) await fetchTrack(humanTrackId, 'human')
            if (dogTrackId) await fetchTrack(dogTrackId, 'dog')
        } catch (err) {
            setError(err.response?.data?.detail || 'Kunde inte underkänna ML-korrigering.')
            setTimeout(() => setError(null), 5000)
        } finally {
            setLoading(false)
        }
    }

    // Filtrerade audit-loggar (klient-side)
    const filteredAuditEntries = useMemo(() => {
        if (auditActionFilter === 'all') return auditLogEntries
        return auditLogEntries.filter(e => e.action === auditActionFilter)
    }, [auditLogEntries, auditActionFilter])

    // Exportera audit trail (JSON)
    const handleExportAuditLog = () => {
        if (filteredAuditEntries.length === 0) {
            setMessage('Inga audit-poster att exportera.')
            setTimeout(() => setMessage(null), 2500)
            return
        }
        const blob = new Blob([JSON.stringify(filteredAuditEntries, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `audit-log-${humanTrackId || dogTrackId}-${new Date().toISOString().slice(0, 10)}.json`
        a.click()
        URL.revokeObjectURL(url)
        setMessage('Audit-log exportad.')
        setTimeout(() => setMessage(null), 2000)
    }

    // Hämta audit trail för valda spår (körs när användaren öppnar panelen)
    const fetchAuditLog = async () => {
        const ids = [humanTrackId, dogTrackId].filter(Boolean).map(Number)
        if (ids.length === 0) {
            setAuditLogEntries([])
            return
        }
        setLoadingAudit(true)
        try {
            const results = await Promise.all(
                ids.map(id => axios.get(`${API_BASE}/tracks/${id}/audit-log`, { params: { limit: 100 } }).then(r => r.data))
            )
            const merged = results.flat()
            merged.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            setAuditLogEntries(merged)
        } catch (err) {
            console.error('Audit log fetch failed:', err)
            setAuditLogEntries([])
        } finally {
            setLoadingAudit(false)
        }
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

    // Hitta positioner med liten korrigering (avstånd < tröskel) – för batch godkänn som ML
    const getPendingAdjustedWithSmallCorrection = () => {
        return getPendingAdjustedPositions().filter(pos => {
            const dist = haversineDistance(
                { lat: pos.position.lat, lng: pos.position.lng },
                { lat: pos.corrected_position.lat, lng: pos.corrected_position.lng }
            )
            return dist < SMALL_CORRECTION_THRESHOLD_M && dist > 0
        })
    }

    // Batch godkänn som ML: anropa approve-ml för positioner med liten korrigering (< 5m)
    const handleBatchApproveSmallCorrectionsAsMl = async () => {
        const toApprove = getPendingAdjustedWithSmallCorrection()
        if (toApprove.length === 0) {
            setMessage(`Inga justerade positioner med korrigering < ${SMALL_CORRECTION_THRESHOLD_M}m att godkänna som ML.`)
            setTimeout(() => setMessage(null), 3000)
            return
        }
        setLoading(true)
        setError(null)
        setMessage(null)
        try {
            let successCount = 0
            let failCount = 0
            for (const pos of toApprove) {
                try {
                    await axios.post(`${API_BASE}/track-positions/${pos.id}/approve-ml`, {
                        predicted_lat: pos.corrected_position.lat,
                        predicted_lng: pos.corrected_position.lng,
                        ml_confidence: null,
                        ml_model_version: null,
                    })
                    successCount++
                } catch (err) {
                    console.error(`Kunde inte godkänna position ${pos.id}:`, err)
                    failCount++
                }
            }
            if (humanTrackId) await fetchTrack(humanTrackId, 'human')
            if (dogTrackId) await fetchTrack(dogTrackId, 'dog')
            setMessage(`✅ ${successCount} positioner godkända som ML (T2)${failCount > 0 ? ` (${failCount} misslyckades)` : ''}`)
            setTimeout(() => setMessage(null), 5000)
        } catch (err) {
            setError('Kunde inte godkänna positioner.')
            setTimeout(() => setError(null), 3000)
        } finally {
            setLoading(false)
        }
    }

    // ML-integration: Batch-acceptera ML-förutsägelser
    const handleBatchAcceptMLPredictions = async () => {
        if (!mlPredictions || !mlPredictions.predictions) {
            setError('Inga ML-förutsägelser tillgängliga. Hämta förutsägelser först.')
            setTimeout(() => setError(null), 3000)
            return
        }

        // Filtrera positioner där ML-förutsägelsen är "bra nog" (< 1m fel jämfört med faktisk korrigering, eller < 2m om ingen faktisk korrigering finns)
        const acceptablePredictions = mlPredictions.predictions.filter(pred => {
            if (!pred.predicted_corrected_position) return false

            // Om det finns en faktisk korrigering, jämför skillnaden
            const position = [...humanPositions, ...dogPositions].find(pos => pos.id === pred.position_id)
            if (position && position.corrected_position) {
                const actualDistance = haversineDistance(
                    position.position,
                    position.corrected_position
                )
                const difference = Math.abs(pred.predicted_correction_distance_meters - actualDistance)
                return difference < 1.0 // Acceptera om skillnaden är < 1m
            }

            // Om ingen faktisk korrigering finns, acceptera om förutsägelsen är < 2m
            return pred.predicted_correction_distance_meters < 2.0
        })

        if (acceptablePredictions.length === 0) {
            setMessage('Inga ML-förutsägelser som är "bra nog" att acceptera automatiskt.')
            setTimeout(() => setMessage(null), 3000)
            return
        }

        setLoading(true)
        setError(null)
        setMessage(null)

        try {
            let successCount = 0
            let failCount = 0

            for (const pred of acceptablePredictions) {
                try {
                    await axios.put(`${API_BASE}/track-positions/${pred.position_id}`, {
                        verified_status: 'correct',
                        corrected_position: pred.predicted_corrected_position,
                        annotation_notes: 'ML-förutsägelse accepterad automatiskt',
                        environment: null,
                    })
                    successCount++
                } catch (err) {
                    console.error(`Kunde inte uppdatera position ${pred.position_id}:`, err)
                    failCount++
                }
            }

            setMessage(`✅ ${successCount} ML-förutsägelser accepterade automatiskt${failCount > 0 ? ` (${failCount} misslyckades)` : ''}`)
            setTimeout(() => setMessage(null), 5000)

            // Uppdatera spåren
            if (humanTrackId) await fetchTrack(humanTrackId, 'human')
            if (dogTrackId) await fetchTrack(dogTrackId, 'dog')
        } catch (err) {
            console.error('Fel vid batch-acceptering av ML-förutsägelser:', err)
            setError('Kunde inte acceptera ML-förutsägelser.')
            setTimeout(() => setError(null), 3000)
        } finally {
            setLoading(false)
        }
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
                        environment: pos.environment || environment || null,
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

    const handleExportAnnotations = (format = 'json') => {
        const allPositions = [...humanPositions, ...dogPositions]

        // Filtrera endast annoterade positioner (har corrected_position eller verified_status !== 'pending')
        const annotatedPositions = allPositions.filter(p =>
            p.corrected_position || p.verified_status !== 'pending'
        )

        if (annotatedPositions.length === 0) {
            setMessage('Inga annoterade positioner att exportera.')
            setTimeout(() => setMessage(null), 2500)
            return
        }

        // Förbered data för export
        const exportData = annotatedPositions.map(pos => {
            const correctionDistance = pos.corrected_position
                ? haversineDistance(
                    { lat: pos.position.lat, lng: pos.position.lng },
                    { lat: pos.corrected_position.lat, lng: pos.corrected_position.lng }
                )
                : 0

            return {
                id: pos.id,
                track_type: humanPositions.includes(pos) ? 'human' : 'dog',
                timestamp: pos.timestamp,
                verified_status: pos.verified_status || 'pending',
                original_position: {
                    lat: pos.position.lat,
                    lng: pos.position.lng
                },
                corrected_position: pos.corrected_position ? {
                    lat: pos.corrected_position.lat,
                    lng: pos.corrected_position.lng
                } : null,
                correction_distance_meters: correctionDistance,
                accuracy: pos.accuracy || null,
                annotation_notes: pos.annotation_notes || ''
            }
        })

        if (format === 'json') {
            // Export som JSON
            const jsonStr = JSON.stringify(exportData, null, 2)
            const blob = new Blob([jsonStr], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `annotations_${new Date().toISOString().split('T')[0]}.json`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
        } else if (format === 'csv') {
            // Export som CSV
            const headers = [
                'id',
                'track_type',
                'timestamp',
                'verified_status',
                'original_lat',
                'original_lng',
                'corrected_lat',
                'corrected_lng',
                'correction_distance_m',
                'accuracy',
                'notes'
            ]

            const rows = exportData.map(pos => [
                pos.id,
                pos.track_type,
                pos.timestamp,
                pos.verified_status,
                pos.original_position.lat,
                pos.original_position.lng,
                pos.corrected_position?.lat || '',
                pos.corrected_position?.lng || '',
                pos.correction_distance_meters.toFixed(2),
                pos.accuracy || '',
                `"${(pos.annotation_notes || '').replace(/"/g, '""')}"`
            ])

            const csvContent = [
                headers.join(','),
                ...rows.map(row => row.join(','))
            ].join('\n')

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `annotations_${new Date().toISOString().split('T')[0]}.csv`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
        }

        setMessage(`✅ ${annotatedPositions.length} positioner exporterade som ${format.toUpperCase()}!`)
        setTimeout(() => setMessage(null), 3000)
    }

    return (
        <div className="h-full flex overflow-hidden relative">
            {/* Loading overlay för tile-konvertering */}
            {convertingTiles && (
                <div className="absolute inset-0 bg-black bg-opacity-60 z-[9999] flex items-center justify-center">
                    <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md mx-4 text-center">
                        <div className="mb-4">
                            <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600"></div>
                        </div>
                        <h3 className="text-xl font-bold text-gray-800 mb-2">Arbetar med tiles</h3>
                        <p className="text-gray-600 mb-4">
                            Laddar ner och förstorar kartbilder för högupplöst zoom...
                        </p>
                        <div className="text-sm text-gray-500">
                            <p>Detta kan ta 1-5 minuter beroende på områdets storlek.</p>
                            <p className="mt-2 font-semibold">Vänligen vänta...</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Loading overlay för ML-förutsägelser */}
            {isLoadingMLPredictions && (
                <div className="absolute inset-0 bg-black bg-opacity-60 z-[9999] flex items-center justify-center">
                    <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md mx-4 text-center">
                        <div className="mb-4">
                            <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600"></div>
                        </div>
                        <h3 className="text-xl font-bold text-gray-800 mb-2">🔮 Hämtar ML-förutsägelser</h3>
                        <p className="text-gray-600 mb-4">
                            Modellen analyserar dina spår och genererar förutsägelser...
                        </p>
                        <div className="text-sm text-gray-500">
                            <p>Detta kan ta 10-30 sekunder beroende på antal positioner.</p>
                            <p className="mt-2 font-semibold">Vänligen vänta...</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Loading overlay för spåromdöpning */}
            {renamingTracks && (
                <div className="absolute inset-0 bg-black bg-opacity-60 z-[9999] flex items-center justify-center">
                    <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md mx-4 text-center">
                        <div className="mb-4">
                            <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-4 border-indigo-600"></div>
                        </div>
                        <h3 className="text-xl font-bold text-gray-800 mb-2">Döper om spår</h3>
                        <p className="text-gray-600 mb-4">
                            Uppdaterar spårnamn från generiska namn till unika namn...
                        </p>
                        <div className="text-sm text-gray-500">
                            <p>Detta tar bara några sekunder.</p>
                            <p className="mt-2 font-semibold">Vänligen vänta...</p>
                        </div>
                    </div>
                </div>
            )}
            <div className="w-72 bg-slate-100 border-r border-slate-200 flex flex-col overflow-hidden">
                <div className="p-4 flex flex-col gap-4 overflow-y-auto flex-1 min-h-0">
                    <div>
                        <h2 className="text-lg font-semibold mb-2">Testmiljö</h2>
                        <p className="text-sm text-slate-600">
                            Välj människaspår och hundspår för jämförelse. Justera positioner på kartan.
                        </p>
                    </div>

                    {/* Statistik-dashboard */}
                    {statistics.total > 0 && (
                        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-3 space-y-3 text-xs shadow-sm">
                            <div className="font-semibold text-blue-900 flex items-center gap-2 text-sm">
                                📊 Statistik
                            </div>

                            {/* Progress bar */}
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-blue-800 font-medium">Framsteg</span>
                                    <span className="text-blue-900 font-bold">{statistics.progressPercentage}%</span>
                                </div>
                                <div className="w-full bg-blue-200 rounded-full h-2 overflow-hidden">
                                    <div
                                        className="bg-gradient-to-r from-blue-500 to-indigo-600 h-2 rounded-full transition-all duration-500"
                                        style={{ width: `${statistics.progressPercentage}%` }}
                                    />
                                </div>
                                <div className="text-[10px] text-blue-600 mt-1">
                                    {statistics.annotatedCount} av {statistics.total} positioner märkta
                                </div>
                            </div>

                            {/* Status-översikt */}
                            <div className="grid grid-cols-3 gap-2">
                                <div className="bg-white rounded p-2 text-center border border-amber-200">
                                    <div className="text-lg font-bold text-amber-600">{statistics.pending}</div>
                                    <div className="text-[10px] text-amber-700">⏳ Ej märkt</div>
                                </div>
                                <div className="bg-white rounded p-2 text-center border border-green-200">
                                    <div className="text-lg font-bold text-green-600">{statistics.correct}</div>
                                    <div className="text-[10px] text-green-700">✅ Korrekt</div>
                                </div>
                                <div className="bg-white rounded p-2 text-center border border-red-200">
                                    <div className="text-lg font-bold text-red-600">{statistics.incorrect}</div>
                                    <div className="text-[10px] text-red-700">❌ Fel</div>
                                </div>
                            </div>

                            {/* Truth levels (FAS 1) */}
                            <div className="bg-white rounded p-2 border border-slate-200">
                                <div className="text-[10px] font-semibold text-slate-700 mb-1.5">Truth levels</div>
                                <div className="grid grid-cols-4 gap-1 text-[9px]">
                                    <div className="flex items-center gap-1" title={TRUTH_LEVEL_LABELS.T0}>
                                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: TRUTH_LEVEL_COLORS.T0 }}></span>
                                        <span className="text-slate-600 truncate">T0</span>
                                        <span className="font-bold text-slate-800">{statistics.truthLevelCounts.T0}</span>
                                    </div>
                                    <div className="flex items-center gap-1" title={TRUTH_LEVEL_LABELS.T1}>
                                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: TRUTH_LEVEL_COLORS.T1 }}></span>
                                        <span className="text-slate-600 truncate">T1</span>
                                        <span className="font-bold text-slate-800">{statistics.truthLevelCounts.T1}</span>
                                    </div>
                                    <div className="flex items-center gap-1" title={TRUTH_LEVEL_LABELS.T2}>
                                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: TRUTH_LEVEL_COLORS.T2 }}></span>
                                        <span className="text-slate-600 truncate">T2</span>
                                        <span className="font-bold text-slate-800">{statistics.truthLevelCounts.T2}</span>
                                    </div>
                                    <div className="flex items-center gap-1" title={TRUTH_LEVEL_LABELS.T3}>
                                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: TRUTH_LEVEL_COLORS.T3 }}></span>
                                        <span className="text-slate-600 truncate">T3</span>
                                        <span className="font-bold text-slate-800">{statistics.truthLevelCounts.T3}</span>
                                    </div>
                                </div>
                                <div className="text-[8px] text-slate-500 mt-1">
                                    T0=flyttad · T1=verifierad · T2=ML · T3=rå
                                </div>
                            </div>

                            {/* Korrigeringsstatistik */}
                            {statistics.correctedCount > 0 && (
                                <div className="bg-white rounded p-2 border border-blue-200">
                                    <div className="flex justify-between items-center">
                                        <span className="text-blue-700 font-medium">📏 Genomsnittlig korrigering</span>
                                        <span className="text-blue-900 font-bold">{statistics.avgCorrectionDistance.toFixed(1)}m</span>
                                    </div>
                                    <div className="text-[10px] text-blue-600 mt-1">
                                        {statistics.correctedCount} position{statistics.correctedCount !== 1 ? 'er' : ''} korrigerad{statistics.correctedCount !== 1 ? 'e' : ''}
                                    </div>
                                </div>
                            )}

                            {/* Export-knappar */}
                            {statistics.annotatedCount > 0 && (
                                <>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleExportAnnotations('json')}
                                            disabled={loading}
                                            className="flex-1 px-3 py-2 rounded bg-purple-600 text-white text-[10px] font-semibold hover:bg-purple-700 disabled:bg-purple-300 transition"
                                        >
                                            📥 JSON
                                        </button>
                                        <button
                                            onClick={() => handleExportAnnotations('csv')}
                                            disabled={loading}
                                            className="flex-1 px-3 py-2 rounded bg-purple-600 text-white text-[10px] font-semibold hover:bg-purple-700 disabled:bg-purple-300 transition"
                                        >
                                            📥 CSV
                                        </button>
                                    </div>

                                    {/* Exportera för ML */}
                                    <div className="border-t border-blue-300 pt-2 mt-2 space-y-2">
                                        <div className="text-[10px] text-blue-800 font-semibold">💾 Exportera för ML-träning</div>
                                        <div className="text-[9px] text-blue-600">Filen laddas ner - flytta den till ml/data/ i projektet</div>
                                        <input
                                            type="text"
                                            placeholder="Filnamn (t.ex. nightcrawler_batch1)"
                                            defaultValue={(() => {
                                                const tracks = []
                                                if (humanTrack) tracks.push(humanTrack.name.toLowerCase().replace(/\s+/g, '_'))
                                                if (dogTrack) tracks.push(dogTrack.name.toLowerCase().replace(/\s+/g, '_'))
                                                const date = new Date().toISOString().split('T')[0]
                                                return tracks.length > 0 ? `${tracks.join('_')}_${date}` : `annotations_${date}`
                                            })()}
                                            id="ml-filename-input"
                                            className="w-full border border-blue-300 rounded px-2 py-1 text-[10px]"
                                        />
                                        <button
                                            onClick={async () => {
                                                try {
                                                    setLoading(true)
                                                    setError(null)
                                                    setMessage(null)

                                                    const filenameInput = document.getElementById('ml-filename-input')
                                                    let filename = filenameInput.value || 'annotations'

                                                    // Säkerställ .json extension
                                                    if (!filename.endsWith('.json')) {
                                                        filename = `${filename}.json`
                                                    }

                                                    // Samla track_ids för de valda spåren
                                                    const trackIds = []
                                                    if (humanTrack) trackIds.push(humanTrack.id)
                                                    if (dogTrack) trackIds.push(dogTrack.id)

                                                    const response = await axios.post(`${API_BASE}/export/annotations-to-ml`, null, {
                                                        params: {
                                                            filename,
                                                            track_ids: trackIds.join(',') // Skicka som komma-separerad sträng
                                                        }
                                                    })

                                                    // Ladda ner JSON-filen lokalt
                                                    const jsonStr = JSON.stringify(response.data.data, null, 2)
                                                    const blob = new Blob([jsonStr], { type: 'application/json' })
                                                    const url = URL.createObjectURL(blob)
                                                    const a = document.createElement('a')
                                                    a.href = url
                                                    a.download = filename
                                                    document.body.appendChild(a)
                                                    a.click()
                                                    document.body.removeChild(a)
                                                    URL.revokeObjectURL(url)

                                                    setMessage(`✅ ${response.data.annotation_count} positioner exporterade!
                                                               Filen "${filename}" laddades ner.
                                                               Flytta den till ml/data/ mappen i projektet.
                                                               Spår: ${response.data.tracks.join(', ')}`)
                                                    setTimeout(() => setMessage(null), 8000)
                                                } catch (err) {
                                                    console.error('Fel vid ML-export:', err)
                                                    setError(err.response?.data?.detail || 'Kunde inte exportera data.')
                                                    setTimeout(() => setError(null), 3000)
                                                } finally {
                                                    setLoading(false)
                                                }
                                            }}
                                            disabled={loading}
                                            className="w-full px-3 py-2 rounded bg-green-600 text-white text-[10px] font-semibold hover:bg-green-700 disabled:bg-green-300 transition"
                                        >
                                            💾 Exportera för ML (ladda ner)
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* Godkänn alla justerade - synlig längst upp när batch-läge är aktivt */}
                    {batchAdjustMode && (() => {
                        const pendingCount = getPendingAdjustedPositions().length
                        const smallCorrectionCount = getPendingAdjustedWithSmallCorrection().length
                        return pendingCount > 0 && (
                            <div className="bg-green-50 border-2 border-green-500 rounded-lg p-3 shadow-md space-y-2">
                                <div className="text-xs text-green-800 font-semibold">
                                    {pendingCount} position{pendingCount !== 1 ? 'er' : ''} väntar på godkännande
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleApproveAllAdjusted}
                                        disabled={loading}
                                        className="flex-1 px-4 py-3 rounded-lg bg-green-600 text-white text-sm font-bold hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed transition shadow-md"
                                    >
                                        ✅ Godkänn alla ({pendingCount})
                                    </button>
                                    {smallCorrectionCount > 0 && (
                                        <button
                                            onClick={handleBatchApproveSmallCorrectionsAsMl}
                                            disabled={loading}
                                            title={`Godkänn som ML (T2) de ${smallCorrectionCount} positioner med korrigering < ${SMALL_CORRECTION_THRESHOLD_M}m`}
                                            className="flex-1 px-4 py-3 rounded-lg bg-purple-600 text-white text-sm font-bold hover:bg-purple-700 disabled:bg-purple-300 disabled:cursor-not-allowed transition shadow-md"
                                        >
                                            🤖 Godkänn små (&lt;5m) som ML ({smallCorrectionCount})
                                        </button>
                                    )}
                                </div>
                            </div>
                        )
                    })()}

                    {/* Konvertera aktuellt kartområde till förstorade tiles */}
                    {mapInstanceRef.current && (
                        <div className="bg-blue-50 border border-blue-300 rounded p-3 space-y-2 text-xs">
                            <div className="font-semibold text-blue-700">🗺️ Förstora Kartbilder</div>
                            <div className="text-[10px] text-blue-600">
                                Ladda ner och förstora tiles för hela området som täcks av de valda spåren (inklusive alla positioner).
                            </div>
                            <div>
                                <label className="block text-[10px] text-blue-700 mb-1">Kartkälla (satellit har bäst upplösning):</label>
                                <select
                                    value={tileSource}
                                    onChange={(e) => setTileSource(e.target.value)}
                                    className="w-full border border-blue-300 rounded px-2 py-1.5 text-xs"
                                >
                                    <option value="esri_satellite">🛰️ Esri Satellit (bäst upplösning)</option>
                                    <option value="esri_street">🛣️ Esri Gatukarta</option>
                                    <option value="cartodb_light">🗺️ CartoDB Ljus</option>
                                </select>
                            </div>
                            <button
                                onClick={async () => {
                                    if (!mapInstanceRef.current) return

                                    // Kontrollera att spår är valda
                                    if (!humanTrack && !dogTrack) {
                                        setError('Välj minst ett spår (människaspår eller hundspår) först.')
                                        setTimeout(() => setError(null), 3000)
                                        return
                                    }

                                    setConvertingTiles(true)
                                    setError(null)
                                    setMessage(null)

                                    try {
                                        // Samla alla positioner från båda spåren (både original och korrigerade)
                                        const allPositions = []

                                        // Lägg till alla människaspår-positioner
                                        humanPositions.forEach(pos => {
                                            // Lägg till original position
                                            allPositions.push({
                                                lat: pos.position.lat,
                                                lng: pos.position.lng
                                            })
                                            // Lägg till korrigerad position om den finns
                                            if (pos.corrected_position) {
                                                allPositions.push({
                                                    lat: pos.corrected_position.lat,
                                                    lng: pos.corrected_position.lng
                                                })
                                            }
                                        })

                                        // Lägg till alla hundspår-positioner
                                        dogPositions.forEach(pos => {
                                            // Lägg till original position
                                            allPositions.push({
                                                lat: pos.position.lat,
                                                lng: pos.position.lng
                                            })
                                            // Lägg till korrigerad position om den finns
                                            if (pos.corrected_position) {
                                                allPositions.push({
                                                    lat: pos.corrected_position.lat,
                                                    lng: pos.corrected_position.lng
                                                })
                                            }
                                        })

                                        if (allPositions.length === 0) {
                                            setError('Inga positioner hittades i de valda spåren.')
                                            setTimeout(() => setError(null), 3000)
                                            return
                                        }

                                        // Beräkna bounding box för alla positioner
                                        const lats = allPositions.map(p => p.lat)
                                        const lngs = allPositions.map(p => p.lng)
                                        const minLat = Math.min(...lats)
                                        const maxLat = Math.max(...lats)
                                        const minLng = Math.min(...lngs)
                                        const maxLng = Math.max(...lngs)

                                        // Lägg till padding (5% på alla sidor) för säkerhet
                                        const latPadding = (maxLat - minLat) * 0.05
                                        const lngPadding = (maxLng - minLng) * 0.05

                                        const bounds = {
                                            south: Math.max(-90, minLat - latPadding),
                                            west: Math.max(-180, minLng - lngPadding),
                                            north: Math.min(90, maxLat + latPadding),
                                            east: Math.min(180, maxLng + lngPadding)
                                        }

                                        // Beräkna zoom levels baserat på områdets storlek
                                        // För större områden, använd lägre zoom levels
                                        const latRange = bounds.north - bounds.south
                                        const lngRange = bounds.east - bounds.west
                                        const maxRange = Math.max(latRange, lngRange)

                                        let minZoom, maxZoom
                                        if (maxRange > 0.1) {
                                            // Stort område (>10km)
                                            minZoom = 10
                                            maxZoom = 18  // Öka för bättre detaljer
                                        } else if (maxRange > 0.01) {
                                            // Medelstort område (1-10km)
                                            minZoom = 12
                                            maxZoom = 22  // Mycket högre zoom för detaljerad justering
                                        } else {
                                            // Litet område (<1km)
                                            minZoom = 14
                                            maxZoom = 26  // Max zoom – satellit skalar upp vid 24–26
                                        }

                                        const zoomLevels = []
                                        for (let z = minZoom; z <= maxZoom; z++) {
                                            zoomLevels.push(z)
                                        }

                                        setMessage(`Laddar ner tiles för ${allPositions.length} positioner...`)

                                        const response = await axios.post(`${API_BASE}/tiles/convert`, {
                                            bounds: [
                                                bounds.south,
                                                bounds.west,
                                                bounds.north,
                                                bounds.east,
                                            ],
                                            zoom_levels: zoomLevels,
                                            server: tileSource,
                                            scale_factor: 4, // Ökad från 2 till 4 för 4x bättre zoom (256x256 → 1024x1024)
                                        })

                                        setMessage(`✅ ${response.data.message}. Tiles sparade för hela spårområdet (${allPositions.length} positioner). Växla till "Lokal Högupplösning" i kartväljaren.`)
                                        setLocalTilesAvailable(true)
                                        // Uppdatera tile-storlek baserat på response
                                        if (response.data.tile_size) {
                                            setTileSize(response.data.tile_size)
                                            // Uppdatera tile layer med rätt storlek
                                            if (mapInstanceRef.current) {
                                                mapInstanceRef.current.eachLayer((layer) => {
                                                    if (layer.options && layer.options.attribution === '© Lokal högupplösning') {
                                                        layer.setOptions({ tileSize: response.data.tile_size })
                                                    }
                                                })
                                            }
                                        }
                                        // Kontrollera tiles igen för att få fullständig info
                                        await checkTilesAvailability()

                                    } catch (err) {
                                        console.error('Fel vid konvertering av tiles:', err)
                                        setError(err.response?.data?.detail || 'Kunde inte konvertera tiles')
                                    } finally {
                                        setConvertingTiles(false)
                                        setTimeout(() => setMessage(null), 8000)
                                    }
                                }}
                                disabled={convertingTiles || loading}
                                className="w-full px-3 py-2 rounded bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition"
                            >
                                {convertingTiles ? '🔄 Arbetar...' : '📥 Ladda ner högupplösta kartor (4x zoom)'}
                            </button>
                            {localTilesAvailable && (
                                <div className="text-[10px] text-green-600 font-semibold">
                                    ✓ Lokala tiles tillgängliga
                                </div>
                            )}
                        </div>
                    )}

                    <div className="space-y-3">
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="block text-sm font-medium">🚶 Människaspår</label>
                                <div className="flex items-center gap-1 text-[10px] text-slate-500">
                                    <span>Filter:</span>
                                    <select
                                        value={trackSourceFilter}
                                        onChange={(e) => setTrackSourceFilter(e.target.value)}
                                        className="border border-slate-300 rounded px-1 py-0.5"
                                    >
                                        <option value="all">Alla</option>
                                        <option value="own">Egna</option>
                                        <option value="imported">Kundspår</option>
                                    </select>
                                </div>
                            </div>
                            <select
                                value={humanTrackId}
                                onChange={(e) => setHumanTrackId(e.target.value)}
                                className="w-full border border-slate-300 rounded px-2 py-2 text-sm"
                            >
                                <option value="">-- Välj människaspår --</option>
                                {filteredTracks.filter(t => t.track_type === 'human').map((track) => {
                                    const progress = calculateTrackProgress(track)
                                    const progressStyle = getProgressColor(progress)
                                    return (
                                        <option
                                            key={track.id}
                                            value={track.id}
                                            style={{ ...progressStyle, fontWeight: progress >= 50 ? 'bold' : 'normal' }}
                                        >
                                            {track.name} ({track.positions?.length || 0} pos) ({progress}%)
                                            {track.track_source === 'imported' ? ' [Kundspår]' : ''}
                                        </option>
                                    )
                                })}
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
                                {filteredTracks.filter(t => t.track_type === 'dog').map((track) => {
                                    const progress = calculateTrackProgress(track)
                                    const progressStyle = getProgressColor(progress)
                                    return (
                                        <option
                                            key={track.id}
                                            value={track.id}
                                            style={{ ...progressStyle, fontWeight: progress >= 50 ? 'bold' : 'normal' }}
                                        >
                                            {track.name} ({track.positions?.length || 0} pos) ({progress}%)
                                            {track.track_source === 'imported' ? ' [Kundspår]' : ''}
                                        </option>
                                    )
                                })}
                            </select>
                        </div>

                        {/* Knapp för att döpa om generiska spår */}
                        {tracks.length > 0 && (
                            <button
                                onClick={async () => {
                                    try {
                                        setRenamingTracks(true)
                                        setError(null)
                                        setMessage(null)

                                        const response = await axios.post(`${API_BASE}/tracks/rename-generic`)

                                        if (response.data.updated > 0) {
                                            setMessage(`✨ ${response.data.updated} spår omdöpta! Uppdaterar listan...`)
                                            // Ladda om tracks för att visa nya namn
                                            await loadTracks()
                                            setTimeout(() => setMessage(null), 4000)
                                        } else {
                                            setMessage(response.data.message)
                                            setTimeout(() => setMessage(null), 3000)
                                        }
                                    } catch (err) {
                                        console.error('Fel vid omdöpning av spår:', err)
                                        setError('Kunde inte döpa om spår.')
                                        setTimeout(() => setError(null), 3000)
                                    } finally {
                                        setRenamingTracks(false)
                                    }
                                }}
                                disabled={renamingTracks || loading}
                                className="w-full px-3 py-2 rounded bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition shadow-sm"
                            >
                                ✨ Döp om generiska spår
                            </button>
                        )}
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

                    {/* GPS Smoothing - Experimentell */}
                    {(humanTrack || dogTrack) && (
                        <div className="bg-amber-50 border border-amber-300 rounded p-3 space-y-2 text-xs">
                            <div className="font-semibold text-amber-800">🔬 GPS Smoothing (Experimentell)</div>
                            <div className="text-[10px] text-amber-700">
                                Applicera moving average för att jämna ut GPS-noise. Detta är för visualisering/jämförelse, inte ML-träning.
                            </div>
                            {humanTrack && (
                                <button
                                    onClick={async () => {
                                        try {
                                            setLoading(true)
                                            setError(null)
                                            setMessage(null)

                                            const response = await axios.post(`${API_BASE}/tracks/${humanTrackId}/smooth`, {
                                                window_size: 3,
                                                apply_filters: true
                                            })

                                            console.log('Smoothing results:', response.data)
                                            setMessage(`✨ Smoothing tillämpat på ${humanTrack.name}! 
                                                       Behöll ${response.data.improvement_stats.after_filtering}/${response.data.original_count} positioner.
                                                       Borttagna: ${response.data.improvement_stats.total_removed}`)
                                            setTimeout(() => setMessage(null), 5000)
                                        } catch (err) {
                                            console.error('Fel vid smoothing:', err)
                                            setError('Kunde inte applicera smoothing.')
                                            setTimeout(() => setError(null), 3000)
                                        } finally {
                                            setLoading(false)
                                        }
                                    }}
                                    disabled={loading}
                                    className="w-full px-3 py-2 rounded bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 disabled:bg-amber-300 transition"
                                >
                                    🔬 Tillämpa smoothing på människaspår
                                </button>
                            )}
                            {dogTrack && (
                                <button
                                    onClick={async () => {
                                        try {
                                            setLoading(true)
                                            setError(null)
                                            setMessage(null)

                                            const response = await axios.post(`${API_BASE}/tracks/${dogTrackId}/smooth`, {
                                                window_size: 3,
                                                apply_filters: true
                                            })

                                            console.log('Smoothing results:', response.data)
                                            setMessage(`✨ Smoothing tillämpat på ${dogTrack.name}! 
                                                       Behöll ${response.data.improvement_stats.after_filtering}/${response.data.original_count} positioner.
                                                       Borttagna: ${response.data.improvement_stats.total_removed}`)
                                            setTimeout(() => setMessage(null), 5000)
                                        } catch (err) {
                                            console.error('Fel vid smoothing:', err)
                                            setError('Kunde inte applicera smoothing.')
                                            setTimeout(() => setError(null), 3000)
                                        } finally {
                                            setLoading(false)
                                        }
                                    }}
                                    disabled={loading}
                                    className="w-full px-3 py-2 rounded bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 disabled:bg-amber-300 transition"
                                >
                                    🔬 Tillämpa smoothing på hundspår
                                </button>
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
                                <div className="text-[10px] text-blue-600 font-semibold mt-1">
                                    I batch-läge kan du justera flera positioner i rad. Klicka på kartan för att flytta positioner snabbt.
                                </div>
                            )}
                            {!batchAdjustMode && isAdjusting && (
                                <div className="text-[10px] text-blue-600 font-semibold mt-1">
                                    💡 Snabbjustering aktivt: Klicka direkt på kartan för att flytta positionen. Efter "Korrekt" går du automatiskt till nästa position.
                                </div>
                            )}
                        </div>
                    )}

                    {/* Status-filter */}
                    {(humanTrack || dogTrack) && (
                        <div className="bg-white border border-slate-200 rounded p-3 space-y-2 text-xs">
                            <div className="font-semibold text-slate-700">🔍 Filter</div>
                            <div>
                                <label className="block text-slate-600 mb-1">Visa positioner:</label>
                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs"
                                >
                                    <option value="all">Alla positioner</option>
                                    <option value="pending">⏳ Ej märkta</option>
                                    <option value="correct">✅ Korrekta</option>
                                    <option value="incorrect">❌ Felaktiga</option>
                                </select>
                            </div>
                            {statusFilter !== 'all' && (
                                <div className="text-[10px] text-blue-600 font-semibold">
                                    Visar endast {statusFilter === 'pending' ? 'ej märkta' : statusFilter === 'correct' ? 'korrekta' : 'felaktiga'} positioner på kartan.
                                </div>
                            )}
                        </div>
                    )}

                    {/* ML-integration */}
                    {(humanTrack || dogTrack) && (
                        <div className="bg-white border border-blue-200 rounded p-3 space-y-2 text-xs">
                            <div className="font-semibold text-blue-700">🔮 ML-förutsägelser</div>
                            <div className="space-y-2">
                                <button
                                    onClick={fetchMLPredictions}
                                    disabled={isLoadingMLPredictions || loading}
                                    className="w-full px-3 py-2 rounded bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition"
                                >
                                    {isLoadingMLPredictions ? '🔄 Hämtar ML-förutsägelser...' : '🔮 Hämta ML-förutsägelser'}
                                </button>

                                {mlPredictions && (
                                    <div className="text-[10px] text-blue-600">
                                        ✅ {mlPredictions.predictions?.length || 0} förutsägelser laddade
                                    </div>
                                )}

                                {mlPredictions && (
                                    <>
                                        <div className="flex items-center justify-between pt-2 border-t border-blue-200">
                                            <div className="flex-1">
                                                <label className="text-blue-600 font-semibold block mb-1">🔍 Jämför med ML på karta</label>
                                                <div className="text-[9px] text-blue-500">
                                                    Visuell jämförelse - INGA ändringar sparas
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => setMlComparisonMode(!mlComparisonMode)}
                                                className={`px-3 py-1 rounded text-[10px] font-semibold transition ml-2 ${mlComparisonMode
                                                    ? 'bg-blue-600 text-white'
                                                    : 'bg-blue-100 text-blue-600'
                                                    }`}
                                            >
                                                {mlComparisonMode ? 'På' : 'Av'}
                                            </button>
                                        </div>

                                        {mlComparisonMode && (
                                            <div className="bg-blue-50 border border-blue-300 rounded p-2 mt-2">
                                                <div className="text-[10px] text-blue-800 font-semibold mb-1">📊 Visuell jämförelse:</div>
                                                <div className="text-[9px] text-blue-700 space-y-0.5">
                                                    <div>📍 <span className="font-semibold">Grå</span> = Original GPS-position</div>
                                                    <div>✅ <span className="font-semibold">Grön</span> = Manuell korrigering</div>
                                                    <div>🔮 <span className="font-semibold">Blå</span> = ML-korrigering</div>
                                                    <div className="text-[8px] text-blue-600 mt-1 italic">
                                                        Linjer visar korrigeringsavstånd. Ingen data ändras!
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        <div className="pt-2 border-t border-blue-200 mt-2">
                                            <button
                                                onClick={handleBatchAcceptMLPredictions}
                                                disabled={loading}
                                                className="w-full px-3 py-2 rounded bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed transition"
                                            >
                                                ⚡ Batch-acceptera ML-förutsägelser
                                            </button>
                                            <div className="text-[9px] text-green-600 mt-1">
                                                ⚠️ Detta SPARAR ändringar i databasen
                                            </div>
                                            <div className="text-[9px] text-blue-500 mt-1">
                                                Accepterar automatiskt ML-förutsägelser som är "bra nog" (&lt; 1m fel)
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Audit trail (FAS 1) */}
                    {(humanTrackId || dogTrackId) && (
                        <div className="bg-white border border-slate-200 rounded p-3 text-xs">
                            <button
                                type="button"
                                onClick={() => {
                                    const willOpen = !auditLogOpen
                                    setAuditLogOpen(willOpen)
                                    if (willOpen) fetchAuditLog()
                                }}
                                className="w-full flex items-center justify-between font-semibold text-slate-700 hover:bg-slate-50 rounded py-1"
                            >
                                📋 Audit trail
                                <span className="text-slate-400">{auditLogOpen ? '▼' : '▶'}</span>
                            </button>
                            {auditLogOpen && (
                                <div className="mt-2 pt-2 border-t border-slate-200 space-y-2">
                                    {loadingAudit ? (
                                        <div className="text-slate-500 text-[10px]">Laddar...</div>
                                    ) : auditLogEntries.length === 0 ? (
                                        <div className="text-slate-500 text-[10px]">Inga loggade ändringar för valda spår.</div>
                                    ) : (
                                        <>
                                            <div className="flex flex-wrap gap-2 items-center">
                                                <label className="text-[10px] text-slate-600">Filter:</label>
                                                <select
                                                    value={auditActionFilter}
                                                    onChange={(e) => setAuditActionFilter(e.target.value)}
                                                    className="border border-slate-300 rounded px-2 py-1 text-[10px]"
                                                >
                                                    <option value="all">Alla</option>
                                                    <option value="manual_correction">Manuell korrigering</option>
                                                    <option value="approve_ml">Godkänn ML</option>
                                                    <option value="reject_ml">Underkänn ML</option>
                                                    <option value="ml_correction">ML-korrigering</option>
                                                    <option value="position_update">Uppdatering</option>
                                                    <option value="clear_correction">Rensa korrigering</option>
                                                </select>
                                                <button
                                                    type="button"
                                                    onClick={handleExportAuditLog}
                                                    className="text-[10px] text-blue-600 hover:underline font-medium"
                                                >
                                                    📥 Exportera
                                                </button>
                                            </div>
                                            <ul className="space-y-1.5 max-h-48 overflow-y-auto text-[10px]">
                                                {filteredAuditEntries.map((entry) => (
                                                    <li key={entry.id} className="bg-slate-50 rounded px-2 py-1.5 border border-slate-100">
                                                        <span className="font-semibold text-slate-700">{entry.action}</span>
                                                        {entry.position_id != null && <span className="text-slate-500"> pos {entry.position_id}</span>}
                                                        <div className="text-slate-500">{new Date(entry.timestamp).toLocaleString()}</div>
                                                    </li>
                                                ))}
                                            </ul>
                                            {filteredAuditEntries.length === 0 && auditActionFilter !== 'all' && (
                                                <div className="text-slate-500 text-[10px]">Inga poster med valt filter.</div>
                                            )}
                                        </>
                                    )}
                                    {auditLogOpen && auditLogEntries.length > 0 && !loadingAudit && (
                                        <button
                                            type="button"
                                            onClick={fetchAuditLog}
                                            className="text-[10px] text-blue-600 hover:underline"
                                        >
                                            Uppdatera
                                        </button>
                                    )}
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
                                        const tl = pos.truth_level || 'T3'
                                        return (
                                            <option key={pos.id} value={pos.id}>
                                                #{positionNumber} - {STATUS_ICONS[status]} {STATUS_LABELS[status]} {tl} ({new Date(pos.timestamp).toLocaleString()})
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
                                        const tl = pos.truth_level || 'T3'
                                        return (
                                            <option key={pos.id} value={pos.id}>
                                                #{positionNumber} - {STATUS_ICONS[status]} {STATUS_LABELS[status]} {tl} ({new Date(pos.timestamp).toLocaleString()})
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

                        const handleJumpToNextPending = () => {
                            // Hitta nästa position med status "pending"
                            const nextPendingIndex = positions.findIndex((p, idx) =>
                                idx > currentIndex && p.verified_status === 'pending'
                            )

                            if (nextPendingIndex !== -1) {
                                const nextPendingPosition = positions[nextPendingIndex]
                                handleSelectPosition(nextPendingPosition.id, selectedPositionTrackType, batchAdjustMode)
                            } else {
                                // Om ingen finns efter nuvarande, leta från början
                                const firstPendingIndex = positions.findIndex(p => p.verified_status === 'pending')
                                if (firstPendingIndex !== -1 && firstPendingIndex !== currentIndex) {
                                    const firstPendingPosition = positions[firstPendingIndex]
                                    handleSelectPosition(firstPendingPosition.id, selectedPositionTrackType, batchAdjustMode)
                                } else {
                                    setMessage('Inga fler ej märkta positioner.')
                                    setTimeout(() => setMessage(null), 2000)
                                }
                            }
                        }

                        const hasPending = positions.some(p => p.verified_status === 'pending')

                        return (
                            <>
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
                                {hasPending && (
                                    <button
                                        onClick={handleJumpToNextPending}
                                        disabled={loading}
                                        className="w-full px-3 py-2 rounded bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:bg-amber-200 disabled:cursor-not-allowed transition"
                                    >
                                        ⏩ Hoppa till nästa ej märkt
                                    </button>
                                )}
                            </>
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
                                    <div className="text-[10px] text-slate-500 mt-1">
                                        ⌨️ C=Korrekt · F=Fel · N=nästa ej märkt · ←→ navigera
                                    </div>
                                    <div className="mt-2 space-y-1">
                                        <div className="text-slate-600 text-[11px] flex flex-wrap items-center gap-2">
                                            <span><span className="font-medium">Status:</span>{' '}
                                            <span
                                                className="px-2 py-0.5 rounded text-[10px] font-semibold"
                                                style={{
                                                    backgroundColor: STATUS_BG_COLORS[selectedPosition.verified_status || 'pending'],
                                                    color: STATUS_COLORS[selectedPosition.verified_status || 'pending'],
                                                }}
                                            >
                                                {STATUS_LABELS[selectedPosition.verified_status || 'pending']}
                                            </span></span>
                                            <span><span className="font-medium">Truth:</span>{' '}
                                            <span
                                                className="px-2 py-0.5 rounded text-[10px] font-semibold"
                                                style={{
                                                    backgroundColor: TRUTH_LEVEL_BG_COLORS[selectedPosition.truth_level || 'T3'],
                                                    color: TRUTH_LEVEL_COLORS[selectedPosition.truth_level || 'T3'],
                                                }}
                                                title={TRUTH_LEVEL_LABELS[selectedPosition.truth_level || 'T3']}
                                            >
                                                {selectedPosition.truth_level || 'T3'}
                                            </span></span>
                                        </div>
                                        {(selectedPosition.truth_level === 'T2' && (selectedPosition.ml_confidence != null || selectedPosition.ml_model_version)) && (
                                            <div className="text-slate-500 text-[10px] flex flex-wrap gap-2">
                                                {selectedPosition.ml_confidence != null && (
                                                    <span>Confidence: {(selectedPosition.ml_confidence * 100).toFixed(0)}%</span>
                                                )}
                                                {selectedPosition.ml_model_version && (
                                                    <span>Modell: {selectedPosition.ml_model_version}</span>
                                                )}
                                            </div>
                                        )}
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

                                {/* ML-förutsägelse för denna position - Jämförelse */}
                                {(() => {
                                    const mlPred = getMLPredictionForPosition(selectedPosition.id)
                                    if (mlPred && mlPred.predicted_corrected_position) {
                                        const correctionDistance = mlPred.predicted_correction_distance_meters || 0
                                        const hasActualCorrection = selectedPosition.corrected_position !== null && selectedPosition.corrected_position !== undefined
                                        const actualDistance = hasActualCorrection ? haversineDistance(
                                            selectedPosition.position,
                                            selectedPosition.corrected_position
                                        ) : null
                                        const difference = actualDistance !== null ? Math.abs(correctionDistance - actualDistance) : null
                                        const quality = difference !== null 
                                            ? (difference < 0.5 ? '✅ Mycket bra matchning' : difference < 1.0 ? '⚠️ Bra matchning' : '❌ Stor skillnad')
                                            : null

                                        return (
                                            <div className="bg-blue-50 border border-blue-200 rounded p-2 mb-2">
                                                <div className="text-[10px] font-semibold text-blue-800 mb-2 flex items-center gap-1">
                                                    🔮 ML-förutsägelse
                                                    {mlComparisonMode && (
                                                        <span className="text-[8px] text-blue-500 font-normal">(visas på karta)</span>
                                                    )}
                                                </div>
                                                
                                                <div className="text-[10px] space-y-1.5">
                                                    {/* Original position */}
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-3 h-3 rounded-full bg-gray-500 border border-gray-700"></span>
                                                        <span className="text-slate-600">
                                                            <span className="font-medium">Original:</span> {correctionDistance.toFixed(2)}m från ML
                                                        </span>
                                                    </div>

                                                    {/* ML-korrigering */}
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-3 h-3 rounded-full bg-blue-500 border border-blue-700"></span>
                                                        <span className="text-blue-600">
                                                            <span className="font-medium">ML-korrigering:</span> {correctionDistance.toFixed(2)}m
                                                        </span>
                                                    </div>

                                                    {/* Manuell korrigering (om finns) */}
                                                    {hasActualCorrection && actualDistance !== null && (
                                                        <>
                                                            <div className="flex items-center gap-2">
                                                                <span className="w-3 h-3 rounded-full bg-green-500 border border-green-700"></span>
                                                                <span className="text-green-600">
                                                                    <span className="font-medium">Manuell korrigering:</span> {actualDistance.toFixed(2)}m
                                                                </span>
                                                            </div>
                                                            {difference !== null && (
                                                                <div className={`pt-1 border-t border-blue-200 ${difference < 0.5 ? 'text-green-600' : difference < 1.0 ? 'text-amber-600' : 'text-red-600'}`}>
                                                                    <div className="font-semibold">{quality}</div>
                                                                    <div className="text-[9px]">
                                                                        Skillnad mellan ML och manuell: <span className="font-medium">{difference.toFixed(2)}m</span>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </>
                                                    )}

                                                    {!hasActualCorrection && (
                                                        <div className="text-[9px] text-slate-500 italic pt-1 border-t border-blue-200">
                                                            Ingen manuell korrigering ännu. ML-förutsäger {correctionDistance.toFixed(2)}m korrigering.
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="mt-2 pt-2 border-t border-blue-200 flex flex-col gap-1.5">
                                                    <button
                                                        onClick={handleAcceptMLPrediction}
                                                        disabled={loading}
                                                        className="w-full px-2 py-1 rounded bg-blue-600 text-white text-[10px] font-semibold hover:bg-blue-700 disabled:bg-blue-300 transition"
                                                    >
                                                        ✅ Godkänn ML
                                                    </button>
                                                    {selectedPosition?.correction_source === 'ml' && (
                                                        <button
                                                            onClick={handleRejectMLCorrection}
                                                            disabled={loading}
                                                            className="w-full px-2 py-1 rounded bg-slate-500 text-white text-[10px] font-semibold hover:bg-slate-600 disabled:bg-slate-300 transition"
                                                        >
                                                            ❌ Underkänn ML
                                                        </button>
                                                    )}
                                                    <div className="text-[8px] text-blue-500 text-center">
                                                        Godkänn ML sparar som T2; Underkänn återställer till rå GPS.
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    }
                                    return null
                                })()}

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
                                            if (!isAdjusting) {
                                                setIsAdjusting(true)
                                                setMessage('Justering aktivt: Klicka på kartan för att flytta positionen, eller dra markören.')
                                            } else {
                                                setIsAdjusting(false)
                                                setMessage(null)
                                            }
                                        }}
                                        disabled={loading}
                                        className={`px-3 py-2 rounded text-xs font-semibold ${isAdjusting ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                            } disabled:bg-blue-200`}
                                    >
                                        {isAdjusting ? '✅ Klar med justering' : '🎯 Justera position (klicka på kartan)'}
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
                                    <label className="block text-[11px] text-slate-600 mb-1">Miljö (valfritt)</label>
                                    <select
                                        value={environment}
                                        onChange={(e) => setEnvironment(e.target.value)}
                                        className="w-full border border-slate-300 rounded px-2 py-1 text-xs mb-2"
                                    >
                                        <option value="">Ingen miljö</option>
                                        <option value="urban">Stad/Bebyggelse</option>
                                        <option value="suburban">Förort</option>
                                        <option value="forest">Skog</option>
                                        <option value="open">Öppet landskap</option>
                                        <option value="park">Park</option>
                                        <option value="water">Vatten/Nära vatten</option>
                                        <option value="mountain">Berg/Terräng</option>
                                        <option value="mixed">Blandad miljö</option>
                                    </select>
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


