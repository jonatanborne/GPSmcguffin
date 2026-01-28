import React, { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import L from 'leaflet'

// Säkerställ att Leaflet använder CDN-ikoner
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

const API_BASE = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/$/, '') : '/api'

// FAS 1: Truth levels (samma som TestLab)
const TRUTH_LEVEL_LABELS = { T0: 'Manuellt flyttad', T1: 'Verifierad', T2: 'ML-korrigerad', T3: 'Rå GPS' }
const TRUTH_LEVEL_COLORS = { T0: '#22c55e', T1: '#3b82f6', T2: '#a855f7', T3: '#6b7280' }

const MLDashboard = () => {
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [analysisResults, setAnalysisResults] = useState(null)
    const [modelInfo, setModelInfo] = useState(null)
    const [error, setError] = useState(null)
    const [selectedTrack, setSelectedTrack] = useState(null)
    const [selectedTrackDetails, setSelectedTrackDetails] = useState(null)
    const [tracks, setTracks] = useState([])
    const [isApplyingCorrection, setIsApplyingCorrection] = useState(false)
    const [selectedTrackForPrediction, setSelectedTrackForPrediction] = useState(null)
    // Två spår för prediction (som i TestLab)
    const [humanTrackIdForPrediction, setHumanTrackIdForPrediction] = useState('')
    const [dogTrackIdForPrediction, setDogTrackIdForPrediction] = useState('')
    const [isPredicting, setIsPredicting] = useState(false)
    const [predictionResults, setPredictionResults] = useState(null)
    const [savedPredictions, setSavedPredictions] = useState([])
    const [selectedPrediction, setSelectedPrediction] = useState(null)
    const [predictionDetails, setPredictionDetails] = useState(null)
    const mapRef = useRef(null)
    const mapInstanceRef = useRef(null)
    const predictionLayersRef = useRef([])

    // Filter för att visa/dölja olika spår
    const [showOriginalTrack, setShowOriginalTrack] = useState(true)
    const [showMLCorrectedTrack, setShowMLCorrectedTrack] = useState(true)
    const [showActualCorrectedTrack, setShowActualCorrectedTrack] = useState(true)

    // Feedback-läge på karta
    const [feedbackMode, setFeedbackMode] = useState(false)
    const [currentFeedbackIndex, setCurrentFeedbackIndex] = useState(0)
    const [highlightedMarker, setHighlightedMarker] = useState(null)

    // Batch-feedback state
    const [batchFeedbackMode, setBatchFeedbackMode] = useState(false)
    const [selectedPredictionsForFeedback, setSelectedPredictionsForFeedback] = useState(new Set())

    // Ladda spår
    useEffect(() => {
        loadTracks()
        loadModelInfo()
        loadSavedPredictions()
    }, [])

    // FAS 1: Hämta spårdetaljer (positions med truth_level) när valt spår ändras
    useEffect(() => {
        if (!selectedTrack) {
            setSelectedTrackDetails(null)
            return
        }
        const load = async () => {
            try {
                const res = await axios.get(`${API_BASE}/tracks/${selectedTrack}`)
                setSelectedTrackDetails(res.data)
            } catch (err) {
                console.error('Kunde inte hämta spårdetaljer:', err)
                setSelectedTrackDetails(null)
            }
        }
        load()
    }, [selectedTrack])

    const loadTracks = async () => {
        try {
            const response = await axios.get(`${API_BASE}/tracks`)
            setTracks(response.data)
        } catch (err) {
            console.error('Fel vid laddning av spår:', err)
        }
    }

    const loadModelInfo = async () => {
        try {
            const response = await axios.get(`${API_BASE}/ml/model-info`)
            setModelInfo(response.data)
        } catch (err) {
            // Modell kanske inte finns ännu
            console.log('Ingen modell hittades ännu')
        }
    }

    const runAnalysis = async () => {
        setIsAnalyzing(true)
        setError(null)
        try {
            const response = await axios.post(`${API_BASE}/ml/analyze`, null, {
                timeout: 11 * 60 * 1000, // 11 min – backend har 10 min
            })
            setAnalysisResults(response.data)
            await loadModelInfo()
        } catch (err) {
            const isNetwork = err.code === 'ERR_NETWORK' || (err.message && err.message.includes('Network Error'))
            const isReset = err.message && /ERR_CONNECTION_RESET|ECONNRESET/i.test(String(err.message))
            const isTimeout = err.code === 'ECONNABORTED' || (err.message && /timeout|timed out/i.test(String(err.message)))
            if (isNetwork || isReset || isTimeout) {
                setError(
                    'Analysen tog för lång tid och anslutningen avbröts (timeout). ' +
                    'Kör analysen lokalt istället: i terminalen, cd ml och sedan python analysis.py. ' +
                    'Modellen sparas i ml/output/ – pusha och redeploya om du vill använda den på Railway.'
                )
            } else {
                setError(err.response?.data?.detail || err.message || 'Fel vid analys')
            }
            console.error('Fel vid analys:', err)
        } finally {
            setIsAnalyzing(false)
        }
    }

    const loadSavedPredictions = async () => {
        try {
            const response = await axios.get(`${API_BASE}/ml/predictions`)
            setSavedPredictions(response.data.predictions || [])
        } catch (err) {
            console.error('Fel vid laddning av sparade förutsägelser:', err)
        }
    }

    const loadPredictionDetails = async (filename) => {
        try {
            const response = await axios.get(`${API_BASE}/ml/predictions/${filename}`)
            setPredictionDetails(response.data.data)
            setSelectedPrediction(filename)
            // Visa förutsägelserna på kartan
            visualizePredictionsOnMap(response.data.data)
        } catch (err) {
            setError(err.response?.data?.detail || err.message || 'Fel vid laddning av förutsägelse')
            console.error('Fel vid laddning av förutsägelse:', err)
        }
    }

    const updatePredictionFeedback = async (filename, positionId, verifiedStatus) => {
        try {
            await axios.put(`${API_BASE}/ml/predictions/${filename}/feedback/${positionId}`, {
                verified_status: verifiedStatus
            })

            // Uppdatera lokal state
            if (predictionDetails && predictionDetails.predictions) {
                const updatedPredictions = predictionDetails.predictions.map(p =>
                    p.position_id === positionId
                        ? { ...p, verified_status: verifiedStatus }
                        : p
                )
                setPredictionDetails({
                    ...predictionDetails,
                    predictions: updatedPredictions
                })
            }

            // Visa bekräftelse
            console.log(`Feedback uppdaterad: Position ${positionId} → ${verifiedStatus}`)
        } catch (err) {
            setError(err.response?.data?.detail || err.message || 'Fel vid uppdatering av feedback')
            console.error('Fel vid uppdatering av feedback:', err)
        }
    }

    const visualizePredictionsOnMap = (predictionData) => {
        if (!mapInstanceRef.current || !predictionData || !predictionData.predictions) return

        // Rensa tidigare lager
        predictionLayersRef.current.forEach(layer => {
            if (mapInstanceRef.current.hasLayer(layer)) {
                mapInstanceRef.current.removeLayer(layer)
            }
        })
        predictionLayersRef.current = []

        const predictions = predictionData.predictions
        if (predictions.length === 0) return

        // Skapa koordinater för original spår
        const originalCoords = predictions.map(p => [
            p.original_position.lat,
            p.original_position.lng
        ])

        // Skapa koordinater för ML-korrigerade spår
        const mlCorrectedCoords = predictions.map(p => [
            p.predicted_corrected_position.lat,
            p.predicted_corrected_position.lng
        ])

        // Skapa koordinater för faktiska korrigeringar (om de finns)
        const actualCorrectedCoords = predictions
            .filter(p => p.actual_corrected_position)
            .map(p => [
                p.actual_corrected_position.lat,
                p.actual_corrected_position.lng
            ])

        // Rita original spår (grå, streckad linje) - om filter är aktiverat
        if (showOriginalTrack) {
            const originalPolyline = L.polyline(originalCoords, {
                color: '#6b7280', // Grå
                weight: 3,
                opacity: 0.7,
                dashArray: '8, 4'
            }).addTo(mapInstanceRef.current)
            originalPolyline.bindTooltip('🔘 Original spår (GPS-positionsdata)', { sticky: true })
            predictionLayersRef.current.push(originalPolyline)
        }

        // Rita faktiska korrigeringar om de finns (grön, streckad) - om filter är aktiverat
        // Viktigt: Faktiskt korrigerat spår ritas FÖRE ML-korrigerat så det syns tydligare
        if (showActualCorrectedTrack && actualCorrectedCoords.length > 0) {
            const actualPolyline = L.polyline(actualCorrectedCoords, {
                color: '#10b981', // Grön
                weight: 5,
                opacity: 0.9,
                dashArray: '12, 6'
            }).addTo(mapInstanceRef.current)
            actualPolyline.bindTooltip('✅ Faktiskt korrigerat spår (manuellt korrigerat)', { sticky: true })
            predictionLayersRef.current.push(actualPolyline)
        }

        // Rita ML-korrigerade spår (blå, hel linje) - om filter är aktiverat
        if (showMLCorrectedTrack) {
            const mlPolyline = L.polyline(mlCorrectedCoords, {
                color: '#3b82f6', // Blå
                weight: 4,
                opacity: 0.9
            }).addTo(mapInstanceRef.current)
            mlPolyline.bindTooltip('🔮 ML-korrigerat spår (förutsägelse)', { sticky: true })
            predictionLayersRef.current.push(mlPolyline)
        }

        // Rita linjer som visar korrigeringarna (från original till korrigerat) - bara om både original och ML är synliga
        if (showOriginalTrack && showMLCorrectedTrack) {
            predictions.forEach((pred, idx) => {
                const correctionDistance = pred.predicted_correction_distance_meters

                // Visa korrigeringar större än 0.5 meter
                if (correctionDistance > 0.5) {
                    const from = [pred.original_position.lat, pred.original_position.lng]
                    const to = [pred.predicted_corrected_position.lat, pred.predicted_corrected_position.lng]

                    // Färg baserat på korrigeringsstorlek
                    let color = '#3b82f6' // Blå för små korrigeringar
                    if (correctionDistance > 3) {
                        color = '#ef4444' // Röd för stora korrigeringar
                    } else if (correctionDistance > 1.5) {
                        color = '#f59e0b' // Orange för medelstora korrigeringar
                    }

                    const correctionLine = L.polyline([from, to], {
                        color: color,
                        weight: 2,
                        opacity: 0.6,
                        dashArray: '3, 3'
                    }).addTo(mapInstanceRef.current)

                    correctionLine.bindTooltip(
                        `Korrigering ${idx + 1}: ${correctionDistance.toFixed(2)}m${pred.actual_correction_distance_meters
                            ? ` (faktisk: ${pred.actual_correction_distance_meters.toFixed(2)}m)`
                            : ''
                        }`,
                        { sticky: true }
                    )
                    predictionLayersRef.current.push(correctionLine)
                }
            })
        }

        // Lägg till markörer för original positioner (små grå cirklar) - om filter är aktiverat
        if (showOriginalTrack) {
            predictions.forEach((pred, idx) => {
                const marker = L.circleMarker([pred.original_position.lat, pred.original_position.lng], {
                    radius: 3,
                    color: '#6b7280',
                    fillColor: '#6b7280',
                    fillOpacity: 0.5,
                    weight: 1
                }).addTo(mapInstanceRef.current)
                predictionLayersRef.current.push(marker)
            })
        }

        // Lägg till markörer för ML-korrigerade positioner (blå cirklar, större för stora korrigeringar) - om filter är aktiverat
        if (showMLCorrectedTrack) {
            predictions.forEach((pred, idx) => {
                const correctionDistance = pred.predicted_correction_distance_meters
                if (correctionDistance > 0.5) {
                    const radius = Math.min(8, 3 + correctionDistance * 2) // Större markör för större korrigeringar
                    let color = '#3b82f6'
                    if (correctionDistance > 3) {
                        color = '#ef4444'
                    } else if (correctionDistance > 1.5) {
                        color = '#f59e0b'
                    }

                    const marker = L.circleMarker([pred.predicted_corrected_position.lat, pred.predicted_corrected_position.lng], {
                        radius: radius,
                        color: color,
                        fillColor: color,
                        fillOpacity: 0.8,
                        weight: 2
                    }).addTo(mapInstanceRef.current)

                    const tooltipText = `Korrigerad position ${idx + 1}: ${correctionDistance.toFixed(2)}m${pred.actual_correction_distance_meters
                        ? ` (faktisk: ${pred.actual_correction_distance_meters.toFixed(2)}m, fel: ${pred.prediction_error_meters?.toFixed(2) || 'N/A'}m)`
                        : ''
                        }`
                    marker.bindTooltip(tooltipText, { sticky: true })
                    predictionLayersRef.current.push(marker)
                }
            })
        }

        // Lägg till markörer för faktiska korrigerade positioner om de finns (gröna) - om filter är aktiverat
        if (showActualCorrectedTrack) {
            predictions.forEach((pred, idx) => {
                if (pred.actual_corrected_position) {
                    const marker = L.circleMarker([pred.actual_corrected_position.lat, pred.actual_corrected_position.lng], {
                        radius: 5,
                        color: '#10b981',
                        fillColor: '#10b981',
                        fillOpacity: 0.7,
                        weight: 2
                    }).addTo(mapInstanceRef.current)

                    if (pred.prediction_error_meters) {
                        marker.bindTooltip(
                            `Faktisk korrigering ${idx + 1}: ${pred.actual_correction_distance_meters?.toFixed(2) || 'N/A'}m (ML-fel: ${pred.prediction_error_meters.toFixed(2)}m)`,
                            { sticky: true }
                        )
                    }
                    predictionLayersRef.current.push(marker)
                }
            })
        }

        // Centrera kartan på spåret med padding
        if (originalCoords.length > 0) {
            // Inkludera alla koordinater (original, ML-korrigerade, faktiska)
            const allCoords = [...originalCoords, ...mlCorrectedCoords]
            if (actualCorrectedCoords.length > 0) {
                allCoords.push(...actualCorrectedCoords)
            }
            const bounds = L.latLngBounds(allCoords)
            mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50] })
        }

        // Om feedback-läge är aktivt, highlighta första positionen
        if (feedbackMode && predictions.length > 0) {
            highlightNextPositionForFeedback(predictions)
        }
    }

    const highlightNextPositionForFeedback = (predictions) => {
        if (!mapInstanceRef.current || !predictions) return

        // Hitta nästa position som inte har feedback (eller börja från början)
        let nextIndex = currentFeedbackIndex
        for (let i = 0; i < predictions.length; i++) {
            const idx = (currentFeedbackIndex + i) % predictions.length
            const pred = predictions[idx]
            if (!pred.verified_status || pred.verified_status === 'pending') {
                nextIndex = idx
                break
            }
        }

        setCurrentFeedbackIndex(nextIndex)
        const pred = predictions[nextIndex]

        // Ta bort tidigare highlight
        if (highlightedMarker) {
            if (Array.isArray(highlightedMarker)) {
                highlightedMarker.forEach(layer => {
                    if (mapInstanceRef.current && mapInstanceRef.current.hasLayer(layer)) {
                        mapInstanceRef.current.removeLayer(layer)
                    }
                })
            } else if (mapInstanceRef.current && mapInstanceRef.current.hasLayer(highlightedMarker)) {
                mapInstanceRef.current.removeLayer(highlightedMarker)
            }
        }

        // Skapa highlight-marker för original position (grå/orange)
        const originalMarker = L.circleMarker([pred.original_position.lat, pred.original_position.lng], {
            radius: 12,
            color: '#6b7280', // Grå för original
            fillColor: '#6b7280',
            fillOpacity: 0.9,
            weight: 4,
            className: 'feedback-highlight'
        }).addTo(mapInstanceRef.current)

        // Skapa highlight-marker för faktisk korrigerad position (om den finns) - GRÖN
        let actualMarker = null
        if (pred.actual_corrected_position) {
            actualMarker = L.circleMarker([pred.actual_corrected_position.lat, pred.actual_corrected_position.lng], {
                radius: 12,
                color: '#10b981', // Grön för faktiskt korrigerat
                fillColor: '#10b981',
                fillOpacity: 0.9,
                weight: 4,
                className: 'feedback-highlight'
            }).addTo(mapInstanceRef.current)
        }

        // Skapa highlight-marker för ML-korrigerad position - BLÅ
        const mlMarker = L.circleMarker([pred.predicted_corrected_position.lat, pred.predicted_corrected_position.lng], {
            radius: 12,
            color: '#3b82f6', // Blå för ML-korrigerat
            fillColor: '#3b82f6',
            fillOpacity: 0.9,
            weight: 4,
            className: 'feedback-highlight'
        }).addTo(mapInstanceRef.current)

        // Rita linjer mellan positionerna för tydlighet
        // Linje från original till ML-korrigerat (blå)
        const line1 = L.polyline([
            [pred.original_position.lat, pred.original_position.lng],
            [pred.predicted_corrected_position.lat, pred.predicted_corrected_position.lng]
        ], {
            color: '#3b82f6', // Blå för ML-korrigering
            weight: 3,
            opacity: 0.8,
            dashArray: '5, 5'
        }).addTo(mapInstanceRef.current)

        // Linje från original till faktiskt korrigerat (grön) - om den finns
        let line2 = null
        if (pred.actual_corrected_position) {
            line2 = L.polyline([
                [pred.original_position.lat, pred.original_position.lng],
                [pred.actual_corrected_position.lat, pred.actual_corrected_position.lng]
            ], {
                color: '#10b981', // Grön för faktisk korrigering
                weight: 3,
                opacity: 0.8,
                dashArray: '5, 5'
            }).addTo(mapInstanceRef.current)
        }

        // Spara alla highlight-lager
        const highlightLayers = [originalMarker, mlMarker, line1]
        if (actualMarker) highlightLayers.push(actualMarker)
        if (line2) highlightLayers.push(line2)
        setHighlightedMarker(highlightLayers)

        // Centrera kartan på denna position (men inte för nära så knapparna försvinner)
        const centerLat = (pred.original_position.lat + pred.predicted_corrected_position.lat) / 2
        const centerLng = (pred.original_position.lng + pred.predicted_corrected_position.lng) / 2
        // Använd zoom 17 istället för 18 för att se mer av kartan
        mapInstanceRef.current.setView([centerLat, centerLng], 17, { animate: true })

        // Scrolla tillbaka till toppen så feedback-kontrollerna är synliga
        setTimeout(() => {
            const feedbackPanel = document.querySelector('.sticky.top-4')
            if (feedbackPanel) {
                feedbackPanel.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
        }, 300)

        // Lägg till tooltip
        const tooltipText = `Position ${nextIndex + 1}/${predictions.length}: ${pred.predicted_correction_distance_meters.toFixed(2)}m förutsägelse`
        originalMarker.bindTooltip(tooltipText, { permanent: true, className: 'feedback-tooltip' }).openTooltip()
    }

    const handleFeedbackClick = async (status) => {
        if (!predictionDetails || !predictionDetails.predictions) return

        const pred = predictionDetails.predictions[currentFeedbackIndex]
        if (!pred) return

        await updatePredictionFeedback(selectedPrediction, pred.position_id, status)

        // Gå vidare till nästa position
        const nextIndex = (currentFeedbackIndex + 1) % predictionDetails.predictions.length
        setCurrentFeedbackIndex(nextIndex)

        // Uppdatera highlight
        setTimeout(() => {
            highlightNextPositionForFeedback(predictionDetails.predictions)
        }, 100)
    }

    // Initiera karta när predictionDetails visas
    useEffect(() => {
        if (predictionDetails && mapRef.current) {
            // Om kartan redan finns, rensa den först
            if (mapInstanceRef.current) {
                // Rensa alla lager
                predictionLayersRef.current.forEach(layer => {
                    if (mapInstanceRef.current.hasLayer(layer)) {
                        mapInstanceRef.current.removeLayer(layer)
                    }
                })
                predictionLayersRef.current = []
                mapInstanceRef.current.remove()
                mapInstanceRef.current = null
            }

            // Vänta lite för att säkerställa att DOM-elementet är redo
            const timer = setTimeout(() => {
                if (mapRef.current && !mapInstanceRef.current) {
                    try {
                        console.log('Initierar karta, mapRef.current:', mapRef.current)
                        console.log('Element höjd:', mapRef.current.offsetHeight, 'bredd:', mapRef.current.offsetWidth)

                        const map = L.map(mapRef.current, {
                            preferCanvas: false,
                            maxZoom: 23, // Tillåt mycket närmare zoom (samma som TestLab)
                            minZoom: 3,
                            zoomControl: true,
                        }).setView([59.334, 18.066], 14)

                        // Skapa olika tile layers med olika zoom-stöd (samma som TestLab)
                        const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                            attribution: '© OpenStreetMap contributors',
                            maxZoom: 23,
                            maxNativeZoom: 19, // OSM har tiles till zoom 19, men Leaflet kan zooma vidare
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

                        // CartoDB Positron - stöder zoom upp till 20 officiellt, men 23 fungerar ofta
                        const cartoPositronLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
                            attribution: '© OpenStreetMap contributors © CARTO',
                            maxZoom: 23,
                            maxNativeZoom: 20, // Server har tiles till zoom 20, men Leaflet kan zooma vidare
                        })

                        // Lokal högupplösning tile layer (om tiles finns)
                        const localHighResLayer = L.tileLayer(`${API_BASE}/static/tiles/{z}/{x}/{y}.png`, {
                            attribution: '© Lokal högupplösning',
                            maxZoom: 23,
                            minZoom: 10,
                            tileSize: 1024,
                            zoomOffset: 0,
                        })

                        // Lägg till layer control för att växla mellan karttyper
                        const baseMaps = {
                            'OpenStreetMap': osmLayer,
                            'Esri Satellit': esriImageryLayer,
                            'Esri Gatukarta': esriStreetLayer,
                            'CartoDB Ljus': cartoPositronLayer,
                            'Lokal Högupplösning': localHighResLayer,
                        }

                        // Börja med CartoDB Ljus (samma som TestLab använder)
                        cartoPositronLayer.addTo(map)

                        // Lägg till layer control
                        L.control.layers(baseMaps).addTo(map)

                        mapInstanceRef.current = map

                        // Tvinga kartan att uppdatera sin storlek
                        setTimeout(() => {
                            if (mapInstanceRef.current) {
                                mapInstanceRef.current.invalidateSize()
                            }
                        }, 100)

                        // Fördröjning för att säkerställa att kartan är helt initierad
                        setTimeout(() => {
                            if (mapInstanceRef.current && predictionDetails) {
                                visualizePredictionsOnMap(predictionDetails)
                            }
                        }, 300)
                    } catch (error) {
                        console.error('Fel vid initiering av karta:', error)
                        setError(`Kartfel: ${error.message}`)
                    }
                } else {
                    console.log('Kartan kan inte initieras:', {
                        mapRefExists: !!mapRef.current,
                        mapInstanceExists: !!mapInstanceRef.current
                    })
                }
            }, 150)

            return () => {
                clearTimeout(timer)
            }
        } else if (!predictionDetails && mapInstanceRef.current) {
            // Rensa kartan när predictionDetails försvinner
            predictionLayersRef.current.forEach(layer => {
                if (mapInstanceRef.current.hasLayer(layer)) {
                    mapInstanceRef.current.removeLayer(layer)
                }
            })
            predictionLayersRef.current = []
            mapInstanceRef.current.remove()
            mapInstanceRef.current = null
        }
    }, [predictionDetails])

    const predictMLCorrections = async (trackIds) => {
        // trackIds kan vara en array eller ett enskilt ID
        const ids = Array.isArray(trackIds) ? trackIds : [trackIds]
        if (ids.length === 0) {
            setError('Välj minst ett spår först')
            return
        }
        setIsPredicting(true)
        setError(null)
        try {
            // Om flera spår, använd ny endpoint med query params
            if (ids.length > 1) {
                const response = await axios.get(`${API_BASE}/ml/predict/multiple?track_ids=${ids.join(',')}`)
                setPredictionResults(response.data)
                // Ladda om sparade förutsägelser
                await loadSavedPredictions()
                // Ladda förutsägelsedetaljer och visa på karta
                if (response.data.filepath) {
                    const filename = response.data.filepath.split('/').pop()
                    await loadPredictionDetails(filename)
                }
            } else {
                // Enskilt spår, använd befintlig endpoint
                const response = await axios.post(`${API_BASE}/ml/predict/${ids[0]}`)
                setPredictionResults(response.data)
                // Ladda om sparade förutsägelser
                await loadSavedPredictions()
                // Ladda förutsägelsedetaljer och visa på karta
                if (response.data.filepath) {
                    const filename = response.data.filepath.split('/').pop()
                    await loadPredictionDetails(filename)
                }
            }
        } catch (err) {
            setError(err.response?.data?.detail || err.message || 'Fel vid förutsägelse')
            console.error('Fel vid förutsägelse:', err)
        } finally {
            setIsPredicting(false)
        }
    }

    const applyMLCorrection = async (trackId) => {
        if (!trackId) {
            setError('Välj ett spår först')
            return
        }
        setIsApplyingCorrection(true)
        setError(null)
        try {
            const response = await axios.post(`${API_BASE}/ml/apply-correction/${trackId}`)
            alert(`ML-korrigering tillämpad på ${response.data.corrected_count} positioner!`)
            await loadTracks()
            // FAS 1: Uppdatera truth summary för valt spår
            if (selectedTrack === trackId || selectedTrack === String(trackId)) {
                const res = await axios.get(`${API_BASE}/tracks/${trackId}`)
                setSelectedTrackDetails(res.data)
            }
        } catch (err) {
            setError(err.response?.data?.detail || err.message || 'Fel vid korrigering')
            console.error('Fel vid korrigering:', err)
        } finally {
            setIsApplyingCorrection(false)
        }
    }

    const mlBusy = isAnalyzing || isPredicting || isApplyingCorrection
    const mlBusyLabel = isAnalyzing
        ? 'Kör ML-analys'
        : isApplyingCorrection
            ? 'Tillämpar ML-korrigering'
            : isPredicting
                ? 'Testar förutsägelse'
                : 'Arbetar…'

    return (
        <div className="h-full flex flex-col bg-gray-50 relative">
            {/* Loading overlay under ML-operationer */}
            {mlBusy && (
                <div className="absolute inset-0 bg-black/60 z-[9999] flex items-center justify-center">
                    <div className="bg-white rounded-xl shadow-2xl p-8 max-w-sm mx-4 text-center">
                        <div className="mb-4 flex justify-center">
                            <div className="w-16 h-16 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-800 mb-2">{mlBusyLabel}</h3>
                        <p className="text-gray-600 text-sm">
                            {isAnalyzing && 'Tränar modell och genererar visualiseringar. Kan ta flera minuter.'}
                            {isPredicting && 'Beräknar förutsägelser för valda spår. Det kan ta 10–30 sekunder.'}
                            {isApplyingCorrection && 'Uppdaterar positioner i databasen. Nästan klart.'}
                        </p>
                        <p className="text-gray-500 text-xs mt-3 font-medium">Vänligen vänta…</p>
                    </div>
                </div>
            )}

            <div className="bg-white border-b shadow-sm px-6 py-4">
                <h2 className="text-2xl font-bold text-gray-800">ML Dashboard</h2>
                <p className="text-gray-600 mt-1">
                    Analysera GPS-data och använd ML-modellen för automatisk korrigering
                </p>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
                {/* Modellinfo */}
                {modelInfo && (
                    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                        <h3 className="text-xl font-semibold text-gray-800 mb-4">Tränad Modell</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-blue-50 rounded-lg p-4">
                                <div className="text-sm text-gray-600">Modelltyp</div>
                                <div className="text-2xl font-bold text-blue-600">{modelInfo.best_model}</div>
                            </div>
                            <div className="bg-green-50 rounded-lg p-4">
                                <div className="text-sm text-gray-600">Test MAE</div>
                                <div className="text-2xl font-bold text-green-600">
                                    {modelInfo.test_mae?.toFixed(3)} m
                                </div>
                            </div>
                            <div className="bg-purple-50 rounded-lg p-4">
                                <div className="text-sm text-gray-600">Test R²</div>
                                <div className="text-2xl font-bold text-purple-600">
                                    {(modelInfo.test_r2 * 100).toFixed(1)}%
                                </div>
                            </div>
                        </div>
                        <div className="mt-4 pt-4 border-t border-gray-200">
                            <div className="text-xs font-semibold text-gray-600 mb-2">Truth levels (FAS 1)</div>
                            <div className="flex flex-wrap gap-3 text-[11px] text-gray-600">
                                {Object.entries(TRUTH_LEVEL_LABELS).map(([tl, label]) => (
                                    <span key={tl} className="flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: TRUTH_LEVEL_COLORS[tl] }} />
                                        <span className="font-medium text-gray-700">{tl}</span>
                                        <span>{label}</span>
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Analys-knapp */}
                <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                    <h3 className="text-xl font-semibold text-gray-800 mb-4">Dataanalys</h3>
                    <p className="text-gray-600 mb-4">
                        Kör fullständig ML-analys på all annoterad data. Detta tränar modellen och genererar
                        visualiseringar.
                    </p>
                    <button
                        onClick={runAnalysis}
                        disabled={isAnalyzing}
                        className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
                    >
                        {isAnalyzing ? 'Analyserar...' : '🚀 Kör ML-analys'}
                    </button>
                    <p className="text-xs text-amber-700 mt-3">
                        ⏱️ Analysen kan ta flera minuter. På Railway kan anslutningen timeout:a – kör då lokalt: <code className="bg-amber-100 px-1 rounded">cd ml && python analysis.py</code>.
                    </p>
                </div>

                {/* Analysresultat */}
                {analysisResults && (
                    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                        <h3 className="text-xl font-semibold text-gray-800 mb-4">Analysresultat</h3>
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-gray-50 rounded-lg p-4">
                                    <div className="text-sm text-gray-600">Totalt antal positioner</div>
                                    <div className="text-2xl font-bold text-gray-800">
                                        {analysisResults.total_positions}
                                    </div>
                                </div>
                                <div className="bg-gray-50 rounded-lg p-4">
                                    <div className="text-sm text-gray-600">Antal unika spår</div>
                                    <div className="text-2xl font-bold text-gray-800">
                                        {analysisResults.unique_tracks}
                                    </div>
                                </div>
                            </div>
                            {analysisResults.best_model && (
                                <div className="mt-4 p-4 bg-green-50 rounded-lg">
                                    <div className="font-semibold text-green-800">Bästa modell: {analysisResults.best_model}</div>
                                    <div className="text-sm text-green-600 mt-1">
                                        Test MAE: {analysisResults.test_mae?.toFixed(3)} m | Test R²:{' '}
                                        {(analysisResults.test_r2 * 100).toFixed(1)}%
                                    </div>
                                </div>
                            )}
                            {analysisResults.graph_url && (
                                <div className="mt-4">
                                    <img
                                        src={analysisResults.graph_url}
                                        alt="Analysgrafer"
                                        className="w-full rounded-lg border"
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Testa förutsägelser (utan att ändra data) */}
                <div className="bg-white rounded-lg shadow-md p-6 mb-6 border-2 border-blue-200">
                    <h3 className="text-xl font-semibold text-gray-800 mb-2">🧪 Testa ML-förutsägelser</h3>
                    <p className="text-gray-600 mb-4 text-sm">
                        Testa hur modellen skulle korrigera spår <strong>utan att ändra något i databasen</strong>.
                        Välj 1 eller 2 spår som hör ihop (t.ex. människaspår + hundspår), precis som i TestLab.
                        Fungerar på både redan korrigerade spår (jämför förutsägelse vs faktisk) och nya spår.
                        Resultaten sparas i <code className="bg-gray-100 px-1 rounded">ml/predictions/</code>.
                    </p>
                    <div className="space-y-3 mb-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                🚶 Människaspår (valfritt)
                            </label>
                            <select
                                value={humanTrackIdForPrediction || ''}
                                onChange={(e) => setHumanTrackIdForPrediction(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            >
                                <option value="">-- Välj människaspår --</option>
                                {tracks.filter(t => t.track_type === 'human').map((track) => (
                                    <option key={track.id} value={track.id}>
                                        {track.name} - ID: {track.id}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                🐕 Hundspår (valfritt)
                            </label>
                            <select
                                value={dogTrackIdForPrediction || ''}
                                onChange={(e) => setDogTrackIdForPrediction(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            >
                                <option value="">-- Välj hundspår --</option>
                                {tracks.filter(t => t.track_type === 'dog').map((track) => (
                                    <option key={track.id} value={track.id}>
                                        {track.name} - ID: {track.id}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <button
                            onClick={() => {
                                const trackIds = []
                                if (humanTrackIdForPrediction) trackIds.push(humanTrackIdForPrediction)
                                if (dogTrackIdForPrediction) trackIds.push(dogTrackIdForPrediction)
                                if (trackIds.length === 0) {
                                    alert('Välj minst ett spår (människaspår eller hundspår)')
                                    return
                                }
                                predictMLCorrections(trackIds)
                            }}
                            disabled={(!humanTrackIdForPrediction && !dogTrackIdForPrediction) || isPredicting || !modelInfo}
                            className="w-full px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
                        >
                            {isPredicting ? 'Förutsäger...' : '🔮 Testa förutsägelse'}
                        </button>
                    </div>
                    {!modelInfo && (
                        <p className="text-sm text-amber-600 mt-2">
                            ⚠️ Ingen modell tränad ännu. Kör ML-analys först.
                        </p>
                    )}

                    {/* Förutsägelseresultat */}
                    {predictionResults && (
                        <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                            <h4 className="font-semibold text-blue-800 mb-3">Förutsägelseresultat</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                                <div className="bg-white rounded p-2">
                                    <div className="text-xs text-gray-600">Totalt positioner</div>
                                    <div className="text-lg font-bold text-gray-800">
                                        {predictionResults.statistics?.total_positions || 0}
                                    </div>
                                </div>
                                <div className="bg-white rounded p-2">
                                    <div className="text-xs text-gray-600">Med förutsägelse</div>
                                    <div className="text-lg font-bold text-blue-600">
                                        {predictionResults.statistics?.predicted_corrections?.mean_meters?.toFixed(2) || '0.00'} m
                                    </div>
                                </div>
                                {predictionResults.statistics?.actual_corrections && (
                                    <div className="bg-white rounded p-2">
                                        <div className="text-xs text-gray-600">Faktisk korrigering</div>
                                        <div className="text-lg font-bold text-green-600">
                                            {predictionResults.statistics.actual_corrections.mean_meters?.toFixed(2) || '0.00'} m
                                        </div>
                                    </div>
                                )}
                                {predictionResults.statistics?.prediction_accuracy && (
                                    <div className="bg-white rounded p-2">
                                        <div className="text-xs text-gray-600">Genomsnittligt fel</div>
                                        <div className="text-lg font-bold text-purple-600">
                                            {predictionResults.statistics.prediction_accuracy.mean_error_meters?.toFixed(2) || '0.00'} m
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="text-xs text-gray-600 mt-2">
                                📁 Sparad i: <code className="bg-gray-100 px-1 rounded">{predictionResults.filepath}</code>
                            </div>
                            {predictionResults.statistics?.positions_with_actual_corrections > 0 && (
                                <div className="text-xs text-green-700 mt-2">
                                    ✓ Jämförde {predictionResults.statistics.positions_with_actual_corrections} positioner med faktiska korrigeringar
                                </div>
                            )}
                            {predictionResults.statistics?.positions_without_corrections > 0 && (
                                <div className="text-xs text-blue-700 mt-1">
                                    ℹ️ {predictionResults.statistics.positions_without_corrections} positioner utan korrigeringar (nytt spår)
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ML-korrigering (riktig ändring) */}
                <div className="bg-white rounded-lg shadow-md p-6 mb-6 border-2 border-red-200">
                    <h3 className="text-xl font-semibold text-gray-800 mb-2">⚠️ Automatisk GPS-korrigering (ändrar databasen)</h3>
                    <p className="text-gray-600 mb-4 text-sm">
                        <strong>Varning:</strong> Detta kommer att <strong>ändra positionerna i databasen</strong>.
                        Använd först "Testa förutsägelser" ovan för att se vad modellen skulle göra.
                    </p>
                    <div className="flex gap-4 items-end flex-wrap">
                        <div className="flex-1 min-w-[200px]">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Välj spår att korrigera
                            </label>
                            <select
                                value={selectedTrack || ''}
                                onChange={(e) => setSelectedTrack(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                            >
                                <option value="">-- Välj spår --</option>
                                {tracks.map((track) => (
                                    <option key={track.id} value={track.id}>
                                        {track.name} ({track.track_type}) - ID: {track.id}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <button
                            onClick={() => applyMLCorrection(selectedTrack)}
                            disabled={!selectedTrack || isApplyingCorrection || !modelInfo}
                            className="px-6 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
                        >
                            {isApplyingCorrection ? 'Korrigerar...' : '✨ Tillämpa ML-korrigering'}
                        </button>
                    </div>
                    {selectedTrackDetails?.positions?.length > 0 && (
                        <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <div className="text-sm font-semibold text-gray-700 mb-2">Truth levels (valt spår)</div>
                            <div className="flex flex-wrap gap-3 text-xs">
                                {['T0', 'T1', 'T2', 'T3'].map((tl) => {
                                    const n = selectedTrackDetails.positions.filter((p) => (p.truth_level || 'T3') === tl).length
                                    return (
                                        <div key={tl} className="flex items-center gap-1.5" title={TRUTH_LEVEL_LABELS[tl]}>
                                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: TRUTH_LEVEL_COLORS[tl] }} />
                                            <span className="text-gray-600">{tl}</span>
                                            <span className="font-bold text-gray-800">{n}</span>
                                        </div>
                                    )
                                })}
                            </div>
                            <div className="text-[10px] text-gray-500 mt-1.5">
                                T0=manuellt flyttad · T1=verifierad · T2=ML · T3=rå GPS
                            </div>
                        </div>
                    )}
                    {!modelInfo && (
                        <p className="text-sm text-amber-600 mt-2">
                            ⚠️ Ingen modell tränad ännu. Kör ML-analys först.
                        </p>
                    )}
                </div>

                {/* Sparade förutsägelser */}
                {savedPredictions.length > 0 && (
                    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                        <h3 className="text-xl font-semibold text-gray-800 mb-4">📚 Sparade förutsägelser</h3>
                        <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
                            {savedPredictions.map((pred, idx) => (
                                <div
                                    key={idx}
                                    className={`flex items-center justify-between p-3 rounded border cursor-pointer transition ${selectedPrediction === pred.filename
                                        ? 'bg-blue-100 border-blue-300'
                                        : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                                        }`}
                                    onClick={() => loadPredictionDetails(pred.filename)}
                                >
                                    <div className="flex-1">
                                        <div className="font-medium text-sm text-gray-800">{pred.filename}</div>
                                        <div className="text-xs text-gray-500 mt-1">
                                            Skapad: {new Date(pred.created).toLocaleString('sv-SE')} •
                                            Storlek: {(pred.size_bytes / 1024).toFixed(1)} KB
                                        </div>
                                    </div>
                                    <button className="ml-2 px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
                                        Visa
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Feedback Export */}
                {predictionDetails && (
                    <div className="bg-white rounded-lg shadow-md p-6 mb-6 border-2 border-green-200">
                        <h3 className="text-xl font-semibold text-gray-800 mb-2">📤 Exportera feedback för träning</h3>
                        <p className="text-gray-600 mb-4 text-sm">
                            När du har gett feedback på förutsägelser kan du exportera all feedback-data för att träna om modellen.
                            Detta inkluderar både manuellt korrigerade spår och ML-förutsägelser du markerat som korrekta.
                        </p>
                        <button
                            onClick={async () => {
                                try {
                                    const response = await fetch(`${API_BASE}/ml/export-feedback`)
                                    if (!response.ok) throw new Error('Export misslyckades')
                                    const data = await response.json()
                                    alert(`✅ Feedback exporterad!\n\nFil: ${data.filename}\nPositioner: ${data.total_positions}\n\nFilen finns i: ml/data/${data.filename}\n\nNu kan du träna om modellen med:\ncd ml\npython analysis.py`)
                                } catch (error) {
                                    console.error('Export error:', error)
                                    alert(`❌ Fel vid export: ${error.message}`)
                                }
                            }}
                            className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition"
                        >
                            📥 Exportera feedback-data
                        </button>
                        <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
                            <strong>💡 Nästa steg efter export:</strong>
                            <ol className="list-decimal list-inside mt-2 space-y-1">
                                <li>Exportera feedback-data (klicka knappen ovan)</li>
                                <li>Träna om modellen: <code className="bg-blue-100 px-1 rounded">cd ml && python analysis.py</code></li>
                                <li>Modellen kommer nu använda din feedback för att bli bättre!</li>
                            </ol>
                        </div>
                    </div>
                )}

                {/* Detaljerad förutsägelse */}
                {predictionDetails && (
                    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-semibold text-gray-800">
                                📊 Förutsägelsedetaljer: {predictionDetails.track_name}
                            </h3>
                            <button
                                onClick={() => {
                                    setPredictionDetails(null)
                                    setSelectedPrediction(null)
                                    // Rensa kartan
                                    predictionLayersRef.current.forEach(layer => {
                                        if (mapInstanceRef.current && mapInstanceRef.current.hasLayer(layer)) {
                                            mapInstanceRef.current.removeLayer(layer)
                                        }
                                    })
                                    predictionLayersRef.current = []
                                }}
                                className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                            >
                                Stäng
                            </button>
                        </div>

                        {/* Karta för visualisering */}
                        <div className="mb-4">
                            <div className="flex items-center justify-between mb-2">
                                <h4 className="font-semibold text-gray-700">🗺️ Kartvisualisering</h4>
                                <button
                                    onClick={() => {
                                        setFeedbackMode(!feedbackMode)
                                        if (!feedbackMode && predictionDetails) {
                                            setCurrentFeedbackIndex(0)
                                            setTimeout(() => {
                                                highlightNextPositionForFeedback(predictionDetails.predictions)
                                            }, 200)
                                        } else if (highlightedMarker) {
                                            // Rensa highlight när feedback-läge stängs
                                            highlightedMarker.forEach(layer => {
                                                if (mapInstanceRef.current && mapInstanceRef.current.hasLayer(layer)) {
                                                    mapInstanceRef.current.removeLayer(layer)
                                                }
                                            })
                                            setHighlightedMarker(null)
                                        }
                                    }}
                                    className={`px-4 py-2 rounded-lg font-medium transition ${feedbackMode
                                        ? 'bg-green-600 text-white hover:bg-green-700'
                                        : 'bg-blue-600 text-white hover:bg-blue-700'
                                        }`}
                                >
                                    {feedbackMode ? '✅ Feedback-läge: PÅ' : '🎯 Starta Feedback-läge'}
                                </button>
                            </div>

                            {/* Feedback-kontroller - Sticky så den alltid är synlig */}
                            {feedbackMode && predictionDetails && predictionDetails.predictions && (
                                <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-4 mb-3 sticky top-4 z-50 shadow-lg">
                                    <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
                                        <div className="flex-1 min-w-[200px]">
                                            <div className="font-semibold text-gray-800 text-lg">
                                                Position {currentFeedbackIndex + 1} av {predictionDetails.predictions.length}
                                            </div>
                                            {predictionDetails.predictions[currentFeedbackIndex] && (
                                                <div className="text-sm text-gray-600 mt-1">
                                                    Förutsägelse: {predictionDetails.predictions[currentFeedbackIndex].predicted_correction_distance_meters.toFixed(2)}m
                                                    {predictionDetails.predictions[currentFeedbackIndex].actual_correction_distance_meters && (
                                                        <> • Faktisk: {predictionDetails.predictions[currentFeedbackIndex].actual_correction_distance_meters.toFixed(2)}m</>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex gap-2 flex-wrap">
                                            <button
                                                onClick={() => handleFeedbackClick('correct')}
                                                className="px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition shadow-lg text-base"
                                            >
                                                ✅ Korrekt
                                            </button>
                                            <button
                                                onClick={() => handleFeedbackClick('incorrect')}
                                                className="px-6 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition shadow-lg text-base"
                                            >
                                                ❌ Felaktig
                                            </button>
                                            <button
                                                onClick={() => handleFeedbackClick('pending')}
                                                className="px-4 py-3 bg-gray-400 text-white rounded-lg font-semibold hover:bg-gray-500 transition text-base"
                                            >
                                                ⏭️ Hoppa över
                                            </button>
                                        </div>
                                    </div>
                                    <div className="text-xs text-gray-600">
                                        💡 Titta på kartan: 🔘 Grå = Original, ✅ Grön = Faktiskt korrigerat, 🔮 Blå = ML-korrigerat
                                    </div>
                                </div>
                            )}

                            {/* Filter för att visa/dölja spår */}
                            <div className="bg-blue-50 rounded-lg p-3 mb-3 border border-blue-200">
                                <div className="text-sm font-semibold text-gray-700 mb-2">Filtrera spår:</div>
                                <div className="flex flex-wrap gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={showOriginalTrack}
                                            onChange={(e) => setShowOriginalTrack(e.target.checked)}
                                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                                        />
                                        <div className="flex items-center gap-1">
                                            <div className="w-4 h-0.5 bg-gray-500" style={{ borderTop: '2px dashed #6b7280' }}></div>
                                            <span className="text-sm">Original spår</span>
                                        </div>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={showMLCorrectedTrack}
                                            onChange={(e) => setShowMLCorrectedTrack(e.target.checked)}
                                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                                        />
                                        <div className="flex items-center gap-1">
                                            <div className="w-4 h-1 bg-blue-600"></div>
                                            <span className="text-sm">ML-korrigerat spår</span>
                                        </div>
                                    </label>
                                    {predictionDetails.predictions?.some(p => p.actual_corrected_position) && (
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={showActualCorrectedTrack}
                                                onChange={(e) => setShowActualCorrectedTrack(e.target.checked)}
                                                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                                            />
                                            <div className="flex items-center gap-1">
                                                <div className="w-4 h-0.5 bg-green-600" style={{ borderTop: '2px dashed #10b981' }}></div>
                                                <span className="text-sm">Faktiskt korrigerat</span>
                                            </div>
                                        </label>
                                    )}
                                </div>
                            </div>

                            {/* Förklaring av färger */}
                            <div className="bg-gray-100 rounded-lg p-2 mb-2 text-xs">
                                <div className="flex items-center gap-4 flex-wrap">
                                    <div className="flex items-center gap-1">
                                        <div className="w-2 h-2 rounded-full bg-red-500"></div>
                                        <span>Stor korrigering (&gt;3m)</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                                        <span>Medelstor (1.5-3m)</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                        <span>Liten (0.5-1.5m)</span>
                                    </div>
                                </div>
                            </div>
                            <div
                                ref={mapRef}
                                id="ml-prediction-map"
                                className="w-full rounded-lg border-2 border-gray-300"
                                style={{
                                    height: '800px',
                                    minHeight: '800px',
                                    zIndex: 0,
                                    position: 'relative'
                                }}
                            ></div>
                        </div>

                        {/* Statistik */}
                        {predictionDetails.statistics && (
                            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                                <h4 className="font-semibold text-gray-700 mb-2">Statistik</h4>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <div>
                                        <div className="text-xs text-gray-600">Totalt positioner</div>
                                        <div className="text-lg font-bold">{predictionDetails.statistics.total_positions}</div>
                                    </div>
                                    {predictionDetails.statistics.predicted_corrections && (
                                        <>
                                            <div>
                                                <div className="text-xs text-gray-600">Med förutsägelse</div>
                                                <div className="text-lg font-bold text-blue-600">
                                                    {predictionDetails.statistics.predicted_corrections.mean_meters?.toFixed(2)} m
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-gray-600">Max förutsägelse</div>
                                                <div className="text-lg font-bold text-blue-600">
                                                    {predictionDetails.statistics.predicted_corrections.max_meters?.toFixed(2)} m
                                                </div>
                                            </div>
                                        </>
                                    )}
                                    {predictionDetails.statistics.actual_corrections && (
                                        <>
                                            <div>
                                                <div className="text-xs text-gray-600">Faktisk korrigering</div>
                                                <div className="text-lg font-bold text-green-600">
                                                    {predictionDetails.statistics.actual_corrections.mean_meters?.toFixed(2)} m
                                                </div>
                                            </div>
                                        </>
                                    )}
                                    {predictionDetails.statistics.prediction_accuracy && (
                                        <div>
                                            <div className="text-xs text-gray-600">Genomsnittligt fel</div>
                                            <div className="text-lg font-bold text-purple-600">
                                                {predictionDetails.statistics.prediction_accuracy.mean_error_meters?.toFixed(2)} m
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Förutsägelser per position */}
                        {predictionDetails.predictions && (
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="font-semibold text-gray-700">
                                        Förutsägelser per position ({predictionDetails.predictions.length} positioner)
                                    </h4>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setBatchFeedbackMode(!batchFeedbackMode)}
                                            className={`px-3 py-1 rounded text-xs font-semibold transition ${batchFeedbackMode
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-gray-200 text-gray-700'
                                                }`}
                                        >
                                            {batchFeedbackMode ? '✓ Batch-läge' : '⚡ Batch-feedback'}
                                        </button>
                                        {batchFeedbackMode && selectedPredictionsForFeedback.size > 0 && (
                                            <div className="flex gap-1">
                                                <button
                                                    onClick={() => handleBatchFeedback('correct')}
                                                    disabled={loading}
                                                    className="px-2 py-1 rounded bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:bg-green-300"
                                                >
                                                    ✅ Korrekt ({selectedPredictionsForFeedback.size})
                                                </button>
                                                <button
                                                    onClick={() => handleBatchFeedback('incorrect')}
                                                    disabled={loading}
                                                    className="px-2 py-1 rounded bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:bg-red-300"
                                                >
                                                    ❌ Felaktig ({selectedPredictionsForFeedback.size})
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {batchFeedbackMode && (
                                    <div className="mb-2 p-2 bg-blue-50 rounded text-xs text-blue-700">
                                        💡 Batch-läge: Markera flera positioner med checkboxarna, sedan klicka "Korrekt" eller "Felaktig" för alla valda.
                                    </div>
                                )}
                                <div className="max-h-96 overflow-y-auto border rounded">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-100 sticky top-0">
                                            <tr>
                                                {batchFeedbackMode && (
                                                    <th className="px-3 py-2 text-left">
                                                        <input
                                                            type="checkbox"
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    const allIds = new Set(predictionDetails.predictions.map(p => p.position_id))
                                                                    setSelectedPredictionsForFeedback(allIds)
                                                                } else {
                                                                    setSelectedPredictionsForFeedback(new Set())
                                                                }
                                                            }}
                                                            checked={selectedPredictionsForFeedback.size === predictionDetails.predictions.length && predictionDetails.predictions.length > 0}
                                                            className="cursor-pointer"
                                                        />
                                                    </th>
                                                )}
                                                <th className="px-3 py-2 text-left">ID</th>
                                                <th className="px-3 py-2 text-left">Förutsägelse</th>
                                                <th className="px-3 py-2 text-left">Faktisk</th>
                                                <th className="px-3 py-2 text-left">Fel</th>
                                                <th className="px-3 py-2 text-left">Status</th>
                                                <th className="px-3 py-2 text-left">Feedback</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {predictionDetails.predictions.slice(0, 50).map((pred, idx) => (
                                                <tr
                                                    key={idx}
                                                    className={`border-t hover:bg-gray-50 ${batchFeedbackMode && selectedPredictionsForFeedback.has(pred.position_id) ? 'bg-blue-50' : ''}`}
                                                >
                                                    {batchFeedbackMode && (
                                                        <td className="px-3 py-2">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedPredictionsForFeedback.has(pred.position_id)}
                                                                onChange={() => togglePredictionSelection(pred.position_id)}
                                                                className="cursor-pointer"
                                                            />
                                                        </td>
                                                    )}
                                                    <td className="px-3 py-2">{pred.position_id}</td>
                                                    <td className="px-3 py-2">
                                                        {pred.predicted_correction_distance_meters?.toFixed(2)} m
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        {pred.actual_correction_distance_meters?.toFixed(2) || '-'} m
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        {pred.prediction_error_meters ? (
                                                            <span className={pred.prediction_error_meters > 1 ? 'text-red-600' : 'text-green-600'}>
                                                                {pred.prediction_error_meters.toFixed(2)} m
                                                            </span>
                                                        ) : '-'}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <span className={`px-2 py-1 rounded text-xs ${pred.verified_status === 'correct' ? 'bg-green-100 text-green-800' :
                                                            pred.verified_status === 'incorrect' ? 'bg-red-100 text-red-800' :
                                                                'bg-gray-100 text-gray-800'
                                                            }`}>
                                                            {pred.verified_status || 'pending'}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <div className="flex gap-1">
                                                            <button
                                                                onClick={() => updatePredictionFeedback(selectedPrediction, pred.position_id, 'correct')}
                                                                className={`px-2 py-1 text-xs rounded ${pred.verified_status === 'correct'
                                                                    ? 'bg-green-600 text-white'
                                                                    : 'bg-green-100 text-green-700 hover:bg-green-200'
                                                                    }`}
                                                                title="Markera som korrekt"
                                                            >
                                                                ✅
                                                            </button>
                                                            <button
                                                                onClick={() => updatePredictionFeedback(selectedPrediction, pred.position_id, 'incorrect')}
                                                                className={`px-2 py-1 text-xs rounded ${pred.verified_status === 'incorrect'
                                                                    ? 'bg-red-600 text-white'
                                                                    : 'bg-red-100 text-red-700 hover:bg-red-200'
                                                                    }`}
                                                                title="Markera som felaktig"
                                                            >
                                                                ❌
                                                            </button>
                                                            <button
                                                                onClick={() => updatePredictionFeedback(selectedPrediction, pred.position_id, 'pending')}
                                                                className={`px-2 py-1 text-xs rounded ${pred.verified_status === 'pending' || !pred.verified_status
                                                                    ? 'bg-gray-600 text-white'
                                                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                                                    }`}
                                                                title="Återställ till pending"
                                                            >
                                                                ⏳
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {predictionDetails.predictions.length > 50 && (
                                        <div className="p-3 bg-gray-50 text-sm text-gray-600 text-center">
                                            Visar första 50 av {predictionDetails.predictions.length} positioner.
                                            Öppna JSON-filen för att se alla.
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Felmeddelande */}
                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                        <div className="text-red-800 font-semibold">Fel</div>
                        <div className="text-red-600 text-sm mt-1">{error}</div>
                    </div>
                )}

                {/* Feature importance */}
                {modelInfo?.feature_importance && (
                    <div className="bg-white rounded-lg shadow-md p-6">
                        <h3 className="text-xl font-semibold text-gray-800 mb-4">Viktigaste Features</h3>
                        <div className="space-y-2">
                            {modelInfo.feature_importance.slice(0, 10).map((item, idx) => (
                                <div key={idx} className="flex items-center gap-4">
                                    <div className="w-48 text-sm text-gray-600">{item.name}</div>
                                    <div className="flex-1 bg-gray-200 rounded-full h-4 relative">
                                        <div
                                            className="bg-blue-600 h-4 rounded-full"
                                            style={{ width: `${item.importance * 100}%` }}
                                        />
                                    </div>
                                    <div className="w-16 text-sm font-medium text-gray-800">
                                        {(item.importance * 100).toFixed(1)}%
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

export default MLDashboard

