import React, { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import axios from 'axios'

// Fix för Leaflet ikoner
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

// Använd miljövariabel för production, annars lokalt /api
const API_BASE = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/$/, '') : '/api'
const OFFLINE_QUEUE_STORAGE_KEY = 'offline_queue'

const GeofenceEditor = () => {
    const mapRef = useRef(null)
    const mapInstanceRef = useRef(null)
    const [geofences, setGeofences] = useState([])
    const [isAddingCircle, setIsAddingCircle] = useState(false)
    const [isAddingPolygon, setIsAddingPolygon] = useState(false)
    const [polygonPoints, setPolygonPoints] = useState([])
    const [dogPosition, setDogPosition] = useState({ lat: 59.334, lng: 18.066 })
    const [dogInside, setDogInside] = useState(false)
    const [currentGeofences, setCurrentGeofences] = useState([])
    const [events, setEvents] = useState([])
    const [previousInside, setPreviousInside] = useState([])
    const [tracks, setTracks] = useState([])
    const [currentTrack, setCurrentTrack] = useState(null)
    const [isTracking, setIsTracking] = useState(false)
    const [trackType, setTrackType] = useState('human')
    const [trackLayers, setTrackLayers] = useState([])
    const gpsWatchIdRef = useRef(null)
    const [isOnline, setIsOnline] = useState(navigator.onLine)
    const offlineQueueRef = useRef([]) // Queue för positioner som ska skickas när online
    const [menuOpen, setMenuOpen] = useState(false) // För att visa/gömma meny
    const onlineCheckFailuresRef = useRef(0) // Räkna antal misslyckade kontroller innan vi markerar som offline
    const isSyncingRef = useRef(false) // Ref för att spåra om synkning pågår (för att undvika dubbeltriggning)
    const [hidingSpots, setHidingSpots] = useState([]) // Gömställen för aktuellt valt spår
    const [isAddingHidingSpot, setIsAddingHidingSpot] = useState(false)
    const [selectedTrackForHidingSpots, setSelectedTrackForHidingSpots] = useState(null)
    const [humanTrackForDog, setHumanTrackForDog] = useState(null) // Vilket människaspår hundens spår är baserat på
    const hidingSpotMarkersRef = useRef([]) // Referenser till hiding spot markörer på kartan
    const [nearestHidingSpot, setNearestHidingSpot] = useState(null) // Närmaste gömställe när hund spårar
    const [currentPosition, setCurrentPosition] = useState(null) // Nuvarande GPS-position
    const hasCenteredMapRef = useRef(false) // Om vi har centrerat kartan för första gången
    const [comparisonData, setComparisonData] = useState(null) // Jämförelsedata för ett hundspår
    const [comparisonMode, setComparisonMode] = useState('point') // 'point' | 'segment' | 'dtw'
    const [showManualCompare, setShowManualCompare] = useState(false) // Visa manuell jämförelse-vy
    const [selectedHumanTrack, setSelectedHumanTrack] = useState(null) // Valt människaspår för jämförelse
    const [selectedDogTrack, setSelectedDogTrack] = useState(null) // Valt hundspår för jämförelse
    const [pendingSyncItems, setPendingSyncItems] = useState(0) // Antal objekt som väntar på synk
    const [isSyncingOfflineData, setIsSyncingOfflineData] = useState(false) // Om synkning pågår
    const [forceSyncMessage, setForceSyncMessage] = useState(null) // Statusmeddelande för tvångssynk
    const [trackSourceFilter, setTrackSourceFilter] = useState('all') // 'all' | 'own' | 'imported'

    const filteredTracks = useMemo(() => {
        if (trackSourceFilter === 'all') return tracks
        if (trackSourceFilter === 'imported') {
            return tracks.filter(t => t.track_source === 'imported')
        }
        // 'own' – allt som inte är importerade (inkl. lokala/offline-spår)
        return tracks.filter(t => t.track_source !== 'imported')
    }, [tracks, trackSourceFilter])

    // Ladda geofences från API
    const loadGeofences = async () => {
        try {
            const response = await axios.get(`${API_BASE}/geofences`)
            setGeofences(response.data)
        } catch (error) {
            console.error('Fel vid laddning av geofences:', error)
        }
    }

    // Ladda tracks från API och localStorage (kombinera båda)
    const loadTracks = async () => {
        let apiTracks = []

        // Försök ladda från API om vi är online
        if (isOnline || navigator.onLine) {
            try {
                const response = await axios.get(`${API_BASE}/tracks`, { timeout: 10000 })
                // Backend returnerar redan fullständiga tracks med positioner
                apiTracks = Array.isArray(response.data) ? response.data : []
            } catch (error) {
                // Bara logga om det inte är timeout (för att undvika spam)
                if (error.code !== 'ECONNABORTED') {
                    console.error('Fel vid laddning av tracks från API:', error)
                }
                // Fortsätt med localStorage-tracks
            }
        }

        // Skapa en Set med server-track IDs för snabb lookup
        const serverTrackIds = new Set(apiTracks.map(t => t.id?.toString()).filter(Boolean))

        // Ladda även tracks från localStorage (fallback och för lokala tracks)
        const localTracks = []
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (key && key.startsWith('track_') && !key.includes('_positions')) {
                const trackId = key.replace('track_', '')
                const track = JSON.parse(localStorage.getItem(key) || '{}')

                // Hoppa över om track redan finns från API (via faktiskt track.id, inte localStorage-nyckeln)
                if (track.id && serverTrackIds.has(track.id.toString())) {
                    continue
                }

                // Hoppa över om track inte har nödvändig data
                if (!track || !track.track_type) {
                    continue
                }

                const positions = JSON.parse(localStorage.getItem(`track_${trackId}_positions`) || '[]')
                track.positions = positions.map(p => ({
                    position: p.position,
                    timestamp: p.timestamp,
                    accuracy: p.accuracy
                }))
                localTracks.push(track)
            }
        }

        // Kombinera tracks från API och localStorage
        const allTracks = [...apiTracks, ...localTracks]
        setTracks(allTracks)
        return allTracks
    }

    // Skapa nytt track (fungerar alltid - sparar lokalt om API misslyckas)
    // skipQueue: om true, lägg inte till i offline queue (används vid synkning)
    const createTrack = async (type, skipQueue = false, humanTrackId = null) => {
        // Skapa track lokalt först (fungerar alltid)
        const localId = Date.now()
        const tempTrack = {
            id: localId,
            track_type: type,
            name: `${type === 'human' ? 'Människa' : 'Hund'} - ${new Date().toLocaleTimeString()}`,
            created_at: new Date().toISOString(),
            positions: [],
            human_track_id: humanTrackId,
            needsServerSync: true
        }

        // Spara lokalt direkt
        localStorage.setItem(`track_${localId}`, JSON.stringify(tempTrack))
        localStorage.setItem(`track_${localId}_positions`, JSON.stringify([]))

        // Försök skapa på server (men fortsätt även om det misslyckas)
        if (isOnline || navigator.onLine) {
            try {
                const response = await axios.post(`${API_BASE}/tracks`, {
                    track_type: type,
                    name: tempTrack.name,
                    human_track_id: humanTrackId
                }, { timeout: 10000 })
                // Om det lyckades, uppdatera med serverns ID
                const serverTrack = response.data
                // Spara både lokalt och på server (använd serverns ID framåt)
                localStorage.setItem(`track_${serverTrack.id}`, JSON.stringify(serverTrack))

                // Ta bort lokal kopia om vi fick ett server-ID (bara för nya tracks)
                if (serverTrack.id !== localId) {
                    // Flytta positioner från gammalt ID till nytt ID om de finns
                    const oldPositions = JSON.parse(localStorage.getItem(`track_${localId}_positions`) || '[]')
                    const existingPositions = JSON.parse(localStorage.getItem(`track_${serverTrack.id}_positions`) || '[]')

                    // Bara sätt positioner om det inte redan finns några (skyddar befintliga spår)
                    if (oldPositions.length > 0 && existingPositions.length === 0) {
                        localStorage.setItem(`track_${serverTrack.id}_positions`, JSON.stringify(oldPositions))
                    } else if (existingPositions.length === 0) {
                        // Om inga positioner finns alls, sätt tom array (bara för nya tracks)
                        localStorage.setItem(`track_${serverTrack.id}_positions`, JSON.stringify([]))
                    }
                    // Om existingPositions.length > 0, behåll dem (befintligt spår)

                    localStorage.removeItem(`track_${localId}`)
                    localStorage.removeItem(`track_${localId}_positions`)
                    // Uppdatera offline queue med rätt ID
                    offlineQueueRef.current = offlineQueueRef.current.map(item =>
                        item.trackId === localId ? { ...item, trackId: serverTrack.id } : item
                    )
                } else {
                    // Samma ID - bara säkerställ att positions-arrayen finns om den inte gör det
                    const existingPositions = JSON.parse(localStorage.getItem(`track_${serverTrack.id}_positions`) || '[]')
                    if (existingPositions.length === 0 && !localStorage.getItem(`track_${serverTrack.id}_positions`)) {
                        localStorage.setItem(`track_${serverTrack.id}_positions`, JSON.stringify([]))
                    }
                }
                updateOfflineQueueState()
                return serverTrack
            } catch (error) {
                console.error('Kunde inte skapa track på server:', error)
                // Markera som offline om nätverksfel
                if (error.code === 'ERR_NETWORK' || error.code === 'ERR_INTERNET_DISCONNECTED' || !error.response) {
                    setIsOnline(false)
                }
                // Spara i queue för senare synkning (bara om inte skipQueue)
                if (!skipQueue) {
                    offlineQueueRef.current.push({ type: 'create_track', track: tempTrack })
                    updateOfflineQueueState()
                }
                // Men returnera track ändå så spårning kan fortsätta
                return tempTrack
            }
        } else {
            // Offline - spara i queue för senare (bara om inte skipQueue)
            if (!skipQueue) {
                offlineQueueRef.current.push({ type: 'create_track', track: tempTrack })
                updateOfflineQueueState()
            }
            return tempTrack
        }
    }

    // Lägg till position till track (med offline-stöd)
    const addPositionToTrack = async (trackId, position, accuracy) => {
        if (!trackId) {
            console.error('addPositionToTrack anropad utan trackId!', { trackId, position, accuracy })
            return
        }

        // Spara lokalt oavsett online/offline status
        const localTrackKey = `track_${trackId}_positions`
        const existing = JSON.parse(localStorage.getItem(localTrackKey) || '[]')
        existing.push({ position, accuracy, timestamp: new Date().toISOString() })
        localStorage.setItem(localTrackKey, JSON.stringify(existing))

        // Om offline, lägg i queue för senare synkning
        if (!isOnline) {
            offlineQueueRef.current.push({ trackId, position, accuracy })
            updateOfflineQueueState()
            // Uppdatera visuellt så användaren ser att spåret sparas lokalt
            if (currentTrack && currentTrack.id === trackId) {
                setCurrentTrack(prev => ({
                    ...prev,
                    positions: [...(prev.positions || []), {
                        position,
                        timestamp: new Date().toISOString(),
                        accuracy
                    }]
                }))
                // Rita spåret lokalt
                updateLocalTrackVisualization(trackId)
            }
            return
        }

        // Om online, skicka direkt
        try {
            const response = await axios.post(`${API_BASE}/tracks/${trackId}/positions`, {
                position: position,
                accuracy: accuracy
            }, { timeout: 10000 })
            // Uppdatera currentTrack lokalt för realtidsvisning
            if (currentTrack && currentTrack.id === trackId) {
                setCurrentTrack(response.data)
                // Uppdatera spåret på kartan i realtid
                if (response.data.positions.length >= 2) {
                    const coords = response.data.positions.map(p => [p.position.lat, p.position.lng])
                    const color = response.data.track_type === 'human' ? '#ef4444' : '#8b5cf6'
                    const weight = response.data.track_type === 'human' ? 4 : 3

                    // Hitta eller skapa polyline för detta track
                    let trackPolyline = null
                    mapInstanceRef.current.eachLayer((layer) => {
                        if (layer instanceof L.Polyline && layer.options.trackId === trackId) {
                            trackPolyline = layer
                        }
                    })

                    if (trackPolyline) {
                        // Uppdatera befintlig polyline
                        trackPolyline.setLatLngs(coords)
                    } else {
                        // Skapa ny polyline med streckad linje för hund
                        const dashArray = response.data.track_type === 'dog' ? '10, 5' : null
                        const newPolyline = L.polyline(coords, {
                            color: color,
                            weight: weight,
                            opacity: 0.8,
                            dashArray: dashArray,
                            trackId: trackId
                        }).addTo(mapInstanceRef.current)
                        setTrackLayers(prev => [...prev, newPolyline])
                    }
                }
            }
        } catch (error) {
            console.error('Fel vid läggning till position:', error)
            // Endast markera som offline om det verkligen är ett nätverksfel
            if (error.code === 'ERR_NETWORK' || error.code === 'ERR_INTERNET_DISCONNECTED' || !error.response) {
                offlineQueueRef.current.push({ trackId, position, accuracy })
                setIsOnline(false)
                updateOfflineQueueState()
            }
            // Annat fel - vi är fortfarande online, data är redan sparad lokalt
        }
    }

    // Uppdatera visuellt spår lokalt (när offline)
    const updateLocalTrackVisualization = (trackId) => {
        if (!mapInstanceRef.current || !currentTrack || currentTrack.id !== trackId) return

        const localTrackKey = `track_${trackId}_positions`
        const positions = JSON.parse(localStorage.getItem(localTrackKey) || '[]')

        if (positions.length >= 2) {
            const coords = positions.map(p => [p.position.lat, p.position.lng])
            const color = currentTrack.track_type === 'human' ? '#ef4444' : '#8b5cf6'
            const weight = currentTrack.track_type === 'human' ? 4 : 3
            const dashArray = currentTrack.track_type === 'dog' ? '10, 5' : null

            let trackPolyline = null
            mapInstanceRef.current.eachLayer((layer) => {
                if (layer instanceof L.Polyline && layer.options.trackId === trackId) {
                    trackPolyline = layer
                }
            })

            if (trackPolyline) {
                trackPolyline.setLatLngs(coords)
            } else {
                const newPolyline = L.polyline(coords, {
                    color: color,
                    weight: weight,
                    opacity: 0.8,
                    dashArray: dashArray,
                    trackId: trackId
                }).addTo(mapInstanceRef.current)
                setTrackLayers(prev => [...prev, newPolyline])
            }
        }
    }

    // Synka offline-queue när online igen
    const updateOfflineQueueState = () => {
        const queue = offlineQueueRef.current
        setPendingSyncItems(queue.length)
        try {
            if (queue.length > 0) {
                localStorage.setItem(OFFLINE_QUEUE_STORAGE_KEY, JSON.stringify(queue))
            } else {
                localStorage.removeItem(OFFLINE_QUEUE_STORAGE_KEY)
            }
        } catch (error) {
            console.error('Kunde inte spara offline-kön:', error)
        }
    }

    const syncOfflineQueue = async () => {
        if (isSyncingOfflineData || isSyncingRef.current) {
            console.log('Synkning pågår redan, hoppar över')
            return
        }
        if (offlineQueueRef.current.length === 0) {
            console.log('Inga objekt att synka')
            return
        }

        console.log(`Startar synkning av ${offlineQueueRef.current.length} objekt`)
        isSyncingRef.current = true
        setIsSyncingOfflineData(true)
        const queue = [...offlineQueueRef.current]
        offlineQueueRef.current = []
        updateOfflineQueueState()

        // Först, skapa tracks som skapades offline
        const trackCreations = queue.filter(item => item.type === 'create_track')
        const positionItems = queue.filter(item => !item.type || item.type !== 'create_track')

        for (const item of trackCreations) {
            try {
                // Använd skipQueue=true för att undvika rekursiv loop
                const created = await createTrack(item.track.track_type, true, item.track.human_track_id)
                if (created) {
                    // Uppdatera alla positioner med nytt track ID
                    const oldId = item.track.id
                    const positions = JSON.parse(localStorage.getItem(`track_${oldId}_positions`) || '[]')

                    for (const posData of positions) {
                        positionItems.push({
                            trackId: created.id,
                            position: posData.position,
                            accuracy: posData.accuracy
                        })
                    }

                    // Ta bort gamla lokala data
                    localStorage.removeItem(`track_${oldId}`)
                    localStorage.removeItem(`track_${oldId}_positions`)
                }
            } catch (error) {
                console.error('Kunde inte skapa track vid synkning:', error)
                // Lägg tillbaka i queue
                offlineQueueRef.current.push(item)
            }
        }

        // Skicka alla positioner
        for (const item of positionItems) {
            try {
                await axios.post(`${API_BASE}/tracks/${item.trackId}/positions`, {
                    position: item.position,
                    accuracy: item.accuracy
                }, { timeout: 10000 })
            } catch (error) {
                // Om det fortfarande misslyckas, lägg tillbaka i queue
                offlineQueueRef.current.push(item)
                if (error.code === 'ERR_NETWORK' || error.code === 'ERR_INTERNET_DISCONNECTED' || !error.response) {
                    setIsOnline(false)
                }
            }
        }

        if (offlineQueueRef.current.length === 0) {
            // Ladda om tracks
            loadTracks().then(refreshTrackLayers)
            console.log('Synkning klar - alla objekt uppladdade')
        } else {
            console.log(`Synkning klar - ${offlineQueueRef.current.length} objekt kvar i kön`)
        }
        isSyncingRef.current = false
        setIsSyncingOfflineData(false)
        updateOfflineQueueState()
    }

    const forceSyncAllLocalTracks = async () => {
        if (isSyncingOfflineData || isSyncingRef.current) {
            console.log('Synkning pågår redan, hoppar över forceSyncAllLocalTracks')
            return
        }

        console.log('Startar forceSyncAllLocalTracks')
        isSyncingRef.current = true
        setIsSyncingOfflineData(true)
        setForceSyncMessage('Synkar lokala spår…')

        try {
            const serverTracksResp = await axios.get(`${API_BASE}/tracks`, { timeout: 30000 })
            const serverTracks = Array.isArray(serverTracksResp.data) ? serverTracksResp.data : []
            const serverIds = new Set(serverTracks.map(track => track.id?.toString()).filter(Boolean))
            const serverTrackMap = new Map()
            const idMapping = new Map()
            serverTracks.forEach(track => {
                if (track?.id != null) {
                    const idStr = track.id.toString()
                    idMapping.set(idStr, idStr)
                    serverTrackMap.set(idStr, track)
                }
            })

            const localEntries = []

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i)
                if (!key || !key.startsWith('track_') || key.includes('_positions')) continue

                const track = JSON.parse(localStorage.getItem(key) || '{}')
                if (!track || !track.track_type) continue

                // Extrahera lokalt ID från nyckeln (t.ex. "track_123" -> "123")
                const localTrackId = key.replace('track_', '')
                const trackId = track.id != null ? track.id.toString() : null
                const isServerTrack = trackId && serverIds.has(trackId)

                // Använd lokalt ID för att hämta positioner (fungerar även om track.id är null)
                const positions = JSON.parse(localStorage.getItem(`track_${localTrackId}_positions`) || '[]')

                // Hämta server-spår om det finns
                const serverTrack = trackId ? serverTrackMap.get(trackId) : null
                const existingPositionCount = serverTrack?.positions?.length || 0
                const localPositionCount = positions.length

                // Hoppa över spår som redan är helt synkade (finns på server och har samma eller färre positioner lokalt)
                if (isServerTrack && localPositionCount <= existingPositionCount) {
                    console.log(`Hoppar över spår ${track.name || trackId} - redan synkat (${localPositionCount} <= ${existingPositionCount})`)
                    continue
                }

                localEntries.push({
                    key,
                    track,
                    positions,
                    isServerTrack,
                    serverTrack,
                    localTrackId, // Spara lokalt ID för senare användning
                })
            }

            if (localEntries.length === 0) {
                setForceSyncMessage('Inga lokala spår hittades – allt verkar redan uppladdat.')
                setIsSyncingOfflineData(false)
                return
            }

            // Se till att människaspår synkas före hundspår
            localEntries.sort((a, b) => {
                if (a.track.track_type === b.track.track_type) return 0
                return a.track.track_type === 'human' ? -1 : 1
            })

            const skippedTracks = []
            let processedCount = 0
            const totalToSync = localEntries.length

            for (const entry of localEntries) {
                processedCount++
                setForceSyncMessage(`Synkar spår ${processedCount}/${totalToSync}: ${entry.track.name || entry.track.id}…`)
                const originalIdStr = entry.track.id != null ? entry.track.id.toString() : null
                let humanTrackId = entry.track.human_track_id

                if (humanTrackId != null) {
                    const mapped = idMapping.get(humanTrackId.toString())
                    if (mapped) {
                        humanTrackId = Number(mapped)
                    } else if (entry.track.track_type === 'dog') {
                        skippedTracks.push({
                            track: entry.track,
                            reason: 'Hittade inget motsvarande människaspår – synka det först.',
                        })
                        continue
                    }
                }

                try {
                    let targetTrackId = null
                    let serverTrack = null

                    if (entry.isServerTrack && originalIdStr && serverTrackMap.has(originalIdStr)) {
                        serverTrack = serverTrackMap.get(originalIdStr)
                        targetTrackId = serverTrack.id
                    }

                    if (!targetTrackId) {
                        const createdTrackResp = await axios.post(`${API_BASE}/tracks`, {
                            track_type: entry.track.track_type,
                            name: entry.track.name || `${entry.track.track_type}-${originalIdStr || 'lokalt'}`,
                            human_track_id: humanTrackId ?? null,
                        }, { timeout: 30000 })

                        serverTrack = createdTrackResp.data
                        if (!serverTrack || serverTrack.id == null) {
                            throw new Error('Servern returnerade inget track-id')
                        }

                        targetTrackId = serverTrack.id

                        const serverIdStr = targetTrackId.toString()
                        serverIds.add(serverIdStr)
                        if (originalIdStr) {
                            idMapping.set(originalIdStr, serverIdStr)
                        }
                        idMapping.set(serverIdStr, serverIdStr)
                        serverTrackMap.set(serverIdStr, serverTrack)
                    }

                    // Kontrollera antal positioner på servern
                    const existingPositionCount = serverTrack?.positions?.length || 0
                    const localPositionCount = entry.positions.length
                    const shouldUploadPositions = localPositionCount > existingPositionCount

                    // Variabler för att spåra uppladdningsresultat (definieras utanför if för att vara tillgängliga senare)
                    let successfullyUploaded = 0
                    let failedUploads = 0
                    const invalidPositions = []

                    if (shouldUploadPositions) {
                        const positionsToUpload = entry.positions.slice(existingPositionCount)
                        const totalPositions = positionsToUpload.length

                        for (let i = 0; i < positionsToUpload.length; i++) {
                            const pos = positionsToUpload[i]

                            // Validera position-format
                            if (!pos || !pos.position) {
                                console.warn(`Position ${i} saknar position-objekt:`, pos)
                                invalidPositions.push({ index: i, reason: 'Saknar position-objekt', data: pos })
                                continue
                            }

                            if (typeof pos.position.lat !== 'number' || typeof pos.position.lng !== 'number') {
                                console.warn(`Position ${i} har ogiltiga koordinater:`, pos.position)
                                invalidPositions.push({ index: i, reason: 'Ogiltiga koordinater', data: pos })
                                continue
                            }

                            if (isNaN(pos.position.lat) || isNaN(pos.position.lng)) {
                                console.warn(`Position ${i} har NaN-koordinater:`, pos.position)
                                invalidPositions.push({ index: i, reason: 'NaN-koordinater', data: pos })
                                continue
                            }

                            // Validera att koordinater är rimliga (lat: -90 till 90, lng: -180 till 180)
                            if (pos.position.lat < -90 || pos.position.lat > 90 ||
                                pos.position.lng < -180 || pos.position.lng > 180) {
                                console.warn(`Position ${i} har koordinater utanför giltigt intervall:`, pos.position)
                                invalidPositions.push({ index: i, reason: 'Koordinater utanför giltigt intervall', data: pos })
                                continue
                            }

                            try {
                                const response = await axios.post(`${API_BASE}/tracks/${targetTrackId}/positions`, {
                                    position: pos.position,
                                    accuracy: pos.accuracy ?? null,
                                }, { timeout: 30000 })

                                if (response.status === 200 || response.status === 201) {
                                    successfullyUploaded++
                                } else {
                                    failedUploads++
                                    console.error(`Position ${i} returnerade status ${response.status}`)
                                }

                                // Uppdatera progress var 10:e position för att inte spamma UI
                                if ((i + 1) % 10 === 0 || i === totalPositions - 1) {
                                    setForceSyncMessage(
                                        `Synkar spår ${processedCount}/${totalToSync}: ${entry.track.name || entry.track.id}… (${i + 1}/${totalPositions} positioner, ${successfullyUploaded} uppladdade)`
                                    )
                                }
                            } catch (positionError) {
                                failedUploads++
                                console.error(`Kunde inte ladda upp position ${i}:`, positionError.response?.data || positionError.message)

                                // Om det är ett 400/500-fel, logga mer detaljer
                                if (positionError.response) {
                                    console.error(`Server svarade med status ${positionError.response.status}:`, positionError.response.data)
                                }
                            }
                        }

                        if (invalidPositions.length > 0) {
                            console.warn('Ogiltiga positioner:', invalidPositions)
                        }

                        // Varning om många positioner misslyckades
                        if (failedUploads > 0 || invalidPositions.length > 0) {
                            const errorMsg = `Varning: ${failedUploads} positioner misslyckades och ${invalidPositions.length} var ogiltiga för spår ${entry.track.name || entry.track.id}`
                            console.warn(errorMsg)
                            skippedTracks.push({
                                track: entry.track,
                                reason: `${failedUploads} positioner misslyckades, ${invalidPositions.length} ogiltiga`
                            })
                        }
                    }

                    let refreshedTrack = serverTrack

                    try {
                        const refreshedResp = await axios.get(`${API_BASE}/tracks/${targetTrackId}`, { timeout: 30000 })
                        refreshedTrack = refreshedResp.data
                        if (refreshedTrack?.id != null) {
                            serverTrackMap.set(refreshedTrack.id.toString(), refreshedTrack)
                        }
                    } catch (refreshError) {
                        console.error('Kunde inte hämta uppdaterat spår efter synk:', refreshError)
                    }

                    if (refreshedTrack) {
                        // Behåll lokala positioner om servern inte har dem eller om de lokala är fler
                        const serverPositions = refreshedTrack.positions || []
                        const localPositions = entry.positions || []

                        // Verifiera att positionerna faktiskt laddades upp
                        if (shouldUploadPositions && successfullyUploaded > 0) {
                            const expectedServerCount = existingPositionCount + successfullyUploaded
                            if (serverPositions.length < expectedServerCount) {
                                console.warn(`⚠️ VARNING: Förväntade ${expectedServerCount} positioner på servern, men hittade bara ${serverPositions.length} för track ${targetTrackId}`)
                                console.warn(`   - Laddade upp ${successfullyUploaded} positioner`)
                                console.warn(`   - Server hade ${existingPositionCount} positioner innan`)
                                console.warn(`   - Server har nu ${serverPositions.length} positioner`)

                                // Lägg till i skippedTracks om positionerna inte matchar
                                if (!skippedTracks.some(st => st.track.id === entry.track.id)) {
                                    skippedTracks.push({
                                        track: entry.track,
                                        reason: `Positioner laddades inte upp korrekt: förväntade ${expectedServerCount}, fick ${serverPositions.length}`
                                    })
                                }
                            }
                        }

                        const finalPositions = serverPositions.length >= localPositions.length
                            ? serverPositions
                            : localPositions

                        localStorage.setItem(
                            `track_${targetTrackId}`,
                            JSON.stringify({
                                ...refreshedTrack,
                                human_track_id: refreshedTrack.human_track_id,
                            })
                        )
                        localStorage.setItem(
                            `track_${targetTrackId}_positions`,
                            JSON.stringify(finalPositions)
                        )

                        // Ta bort gamla lokala spår endast om ID:et ändrades OCH positionerna laddades upp korrekt
                        // Använd localTrackId (från localStorage-nyckeln) istället för track.id
                        const oldLocalId = entry.localTrackId || entry.track.id?.toString()
                        if (oldLocalId && targetTrackId.toString() !== oldLocalId && serverPositions.length >= localPositions.length) {
                            localStorage.removeItem(`track_${oldLocalId}`)
                            localStorage.removeItem(`track_${oldLocalId}_positions`)
                        }
                    }
                } catch (error) {
                    console.error('Tvångssynk misslyckades för ett spår:', error)
                    skippedTracks.push({
                        track: entry.track,
                        reason: error?.message || 'Okänt fel',
                    })
                }
            }

            await refreshTrackLayers()

            if (skippedTracks.length > 0) {
                const skippedInfo = skippedTracks
                    .map(item => `${item.track.name || item.track.id}: ${item.reason}`)
                    .join('; ')
                setForceSyncMessage(`Synk klar delvis – vissa spår hoppades över: ${skippedInfo}`)
            } else {
                setForceSyncMessage('Synk klar! Alla lokala spår laddades upp.')
            }
        } catch (error) {
            console.error('Tvångssynk misslyckades:', error)
            setForceSyncMessage(`Synk misslyckades: ${error?.message || 'Okänt fel'}`)
        } finally {
            isSyncingRef.current = false
            setIsSyncingOfflineData(false)
            updateOfflineQueueState()
        }
    }

    // Ladda offline-kö från localStorage vid start
    useEffect(() => {
        try {
            const storedQueueRaw = localStorage.getItem(OFFLINE_QUEUE_STORAGE_KEY)
            const storedQueue = storedQueueRaw ? JSON.parse(storedQueueRaw) : []
            if (Array.isArray(storedQueue)) {
                offlineQueueRef.current = storedQueue
            }

            // Säkerställ att lokalt sparade spår som behöver synkas ligger i kön
            const queuedTrackIds = new Set(
                offlineQueueRef.current
                    .filter(item => item.type === 'create_track' && item.track?.id)
                    .map(item => item.track.id)
            )

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i)
                if (!key || !key.startsWith('track_') || key.includes('_positions')) continue
                const track = JSON.parse(localStorage.getItem(key) || '{}')
                if (track && track.needsServerSync && !queuedTrackIds.has(track.id)) {
                    offlineQueueRef.current.push({ type: 'create_track', track })
                    queuedTrackIds.add(track.id)
                }
            }

            updateOfflineQueueState()
        } catch (error) {
            console.error('Kunde inte läsa offline-kön:', error)
        }
    }, [])

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

    // Lägg till gömställe på nuvarande position (när man spårar som människa)
    const addHidingSpotAtCurrentPosition = async () => {
        if (!currentPosition || !currentTrack || currentTrack.track_type !== 'human') {
            alert('Du måste spåra som människa för att lägga till gömställen')
            return
        }

        try {
            const response = await axios.post(`${API_BASE}/tracks/${currentTrack.id}/hiding-spots`, {
                position: currentPosition,
                name: `Gömställe ${(hidingSpots.length || 0) + 1}`
            })
            // Ladda om gömställen för att få alla
            await loadHidingSpots(currentTrack.id)
            alert('Gömställe tillagt!')
        } catch (error) {
            console.error('Fel vid skapande av gömställe:', error)
            alert('Kunde inte skapa gömställe')
        }
    }

    // Stabil online-detektering med debounce för att undvika flippning
    const lastOnlineStatusRef = useRef(navigator.onLine)
    const onlineStatusTimeoutRef = useRef(null)

    const checkOnlineStatus = () => {
        const currentOnline = navigator.onLine

        // Bara ändra status om den faktiskt ändrats och vänta lite (debounce)
        if (currentOnline !== lastOnlineStatusRef.current) {
            // Rensa eventuell tidigare timeout
            if (onlineStatusTimeoutRef.current) {
                clearTimeout(onlineStatusTimeoutRef.current)
            }

            // Vänta 2 sekunder innan vi ändrar status (för att undvika flippning)
            onlineStatusTimeoutRef.current = setTimeout(() => {
                lastOnlineStatusRef.current = currentOnline
                setIsOnline(currentOnline)

                // Om vi blir online igen, synka queue (men bara om ingen synkning redan pågår)
                if (currentOnline && offlineQueueRef.current.length > 0 && !isSyncingOfflineData) {
                    // Vänta lite extra för att undvika dubbeltriggning med useEffect
                    setTimeout(() => {
                        if (!isSyncingOfflineData && offlineQueueRef.current.length > 0) {
                            syncOfflineQueue()
                        }
                    }, 1500)
                }
            }, 2000)
        }

        return currentOnline
    }

    // Nätverksdetektering - stabil med debounce
    useEffect(() => {
        // Kontrollera status vid start (utan debounce första gången)
        const initialOnline = navigator.onLine
        lastOnlineStatusRef.current = initialOnline
        setIsOnline(initialOnline)

        const handleOnline = () => {
            // Vänta lite innan vi ändrar status (debounce)
            if (onlineStatusTimeoutRef.current) {
                clearTimeout(onlineStatusTimeoutRef.current)
            }
            onlineStatusTimeoutRef.current = setTimeout(() => {
                lastOnlineStatusRef.current = true
                setIsOnline(true)
                // syncOfflineQueue kommer att triggas av useEffect när isOnline ändras
                // Så vi behöver inte anropa den här också
            }, 1000)
        }

        const handleOffline = () => {
            // Vänta lite innan vi ändrar status (debounce)
            if (onlineStatusTimeoutRef.current) {
                clearTimeout(onlineStatusTimeoutRef.current)
            }
            onlineStatusTimeoutRef.current = setTimeout(() => {
                lastOnlineStatusRef.current = false
                setIsOnline(false)
            }, 3000) // Vänta längre för offline (3 sek) för att undvika flippning
        }

        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)

        // Kontrollera status var 10:e sekund (minskad frekvens)
        const interval = setInterval(() => {
            checkOnlineStatus()
        }, 10000)

        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
            clearInterval(interval)
            if (onlineStatusTimeoutRef.current) {
                clearTimeout(onlineStatusTimeoutRef.current)
            }
        }
    }, [])

    // Synka automatiskt när man blir online (men bara en gång)
    useEffect(() => {
        if (isOnline && offlineQueueRef.current.length > 0 && !isSyncingOfflineData) {
            // Vänta lite för att undvika dubbeltriggning
            const timeoutId = setTimeout(() => {
                if (!isSyncingOfflineData && offlineQueueRef.current.length > 0) {
                    syncOfflineQueue()
                }
            }, 1000)
            return () => clearTimeout(timeoutId)
        }
    }, [isOnline])

    // Starta GPS-spårning
    const startTracking = async () => {
        if (!navigator.geolocation) {
            alert('GPS stöds inte av din webbläsare')
            return
        }

        // createTrack sparar alltid lokalt först, så vi kan alltid spåra
        // Om hundspår, skicka human_track_id
        const humanTrackId = trackType === 'dog' && humanTrackForDog ? humanTrackForDog.id : null
        let track = await createTrack(trackType, false, humanTrackId)

        // Om createTrack misslyckades helt (mycket ovanligt), skapa lokalt ändå
        if (!track) {
            console.warn('createTrack returnerade null, skapar lokalt track ändå')
            const localId = Date.now()
            track = {
                id: localId,
                name: `${trackType === 'human' ? 'Människa' : 'Hund'} - ${new Date().toLocaleTimeString()}`,
                track_type: trackType,
                created_at: new Date().toISOString(),
                positions: [],
                human_track_id: humanTrackId,
                needsServerSync: true
            }
            // Spara lokalt
            localStorage.setItem(`track_${localId}`, JSON.stringify(track))
            localStorage.setItem(`track_${localId}_positions`, JSON.stringify([]))
            offlineQueueRef.current.push({ type: 'create_track', track })
            updateOfflineQueueState()
        }

        // Viktigt: Uppdatera currentTrack med rätt ID (kan ha ändrats om track skapades på server)
        setCurrentTrack(track)
        setIsTracking(true)
        hasCenteredMapRef.current = false // Reset för nytt spår

        // Logga för debugging
        console.log('Startar spårning med track ID:', track.id, 'Type:', track.track_type)

        const options = {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
        }

        // Om hundspår, ladda gömställen från människans spår
        if (trackType === 'dog') {
            // Hitta människans spår om det inte redan är valt
            const allTracks = await loadTracks()
            const humanTracks = allTracks.filter(t => t.track_type === 'human')
            if (humanTracks.length > 0) {
                const selectedHumanTrack = humanTrackForDog || humanTracks[0]
                setHumanTrackForDog(selectedHumanTrack)
                await loadHidingSpots(selectedHumanTrack.id)
            }
        }

        gpsWatchIdRef.current = navigator.geolocation.watchPosition(
            (position) => {
                const pos = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                }

                setCurrentPosition(pos)

                // Lägg till position till track - använd currentTrack.id om det finns (kan ha ändrats)
                const trackIdToUse = currentTrack?.id || track.id
                console.log('Lägger till position till track ID:', trackIdToUse, 'Current track ID:', currentTrack?.id, 'Original track ID:', track.id)
                addPositionToTrack(trackIdToUse, pos, position.coords.accuracy)

                // Om hundspår, kontrollera avstånd till gömställen
                if (trackType === 'dog' && humanTrackForDog && hidingSpots.length > 0) {
                    const PROXIMITY_DISTANCE = 20 // 20 meter
                    let nearest = null
                    let nearestDistance = Infinity

                    hidingSpots.forEach(spot => {
                        // Hoppa över redan markerade spots
                        if (spot.found !== null) return

                        const distance = haversineDistance(pos, spot.position)
                        if (distance < nearestDistance && distance < PROXIMITY_DISTANCE) {
                            nearestDistance = distance
                            nearest = spot
                        }
                    })

                    setNearestHidingSpot(nearest)
                }

                // Uppdatera karta om vi spårar som hund (ersätt simulerad hund)
                if (trackType === 'dog' && mapInstanceRef.current) {
                    mapInstanceRef.current.eachLayer((layer) => {
                        if (layer.options.icon && layer.options.icon.className === 'dog-marker') {
                            layer.setLatLng([pos.lat, pos.lng])
                        }
                    })
                    setDogPosition(pos)
                    evaluatePosition(pos)
                }

                // Centrera karta på första positionen (första gången)
                if (!hasCenteredMapRef.current && mapInstanceRef.current) {
                    mapInstanceRef.current.setView([pos.lat, pos.lng], 17)
                    hasCenteredMapRef.current = true
                }
            },
            (error) => {
                console.error('GPS-fel:', error)
                alert(`GPS-fel: ${error.message}`)
                stopTracking()
            },
            options
        )
    }

    // Stoppa GPS-spårning
    const stopTracking = () => {
        if (gpsWatchIdRef.current !== null) {
            navigator.geolocation.clearWatch(gpsWatchIdRef.current)
            gpsWatchIdRef.current = null
        }
        setIsTracking(false)
        setNearestHidingSpot(null)
        setCurrentPosition(null)
        hasCenteredMapRef.current = false // Reset för nästa spår

        // Om offline, försök skapa track på server när online
        if (!isOnline && currentTrack) {
            // Track finns redan lokalt, kommer synkas när online
        }

        setCurrentTrack(null)

        // Ladda om alla tracks (alltid från både API och localStorage)
        loadTracks().then(refreshTrackLayers).catch(err => {
            console.error('Fel vid laddning av tracks:', err)
            // Fallback: ladda från localStorage
            loadLocalTracks()
        })
    }

    // Ladda lokala tracks (när offline)
    const loadLocalTracks = () => {
        const localTracks = []
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (key && key.startsWith('track_') && !key.includes('_positions')) {
                const trackId = key.replace('track_', '')
                const track = JSON.parse(localStorage.getItem(key) || '{}')
                const positions = JSON.parse(localStorage.getItem(`track_${trackId}_positions`) || '[]')
                track.positions = positions.map(p => ({
                    position: p.position,
                    timestamp: p.timestamp,
                    accuracy: p.accuracy
                }))
                localTracks.push(track)
            }
        }
        setTracks(localTracks)
        drawTracks(localTracks)
    }

    // Rita tracks på kartan
    const drawTracks = (tracksData) => {
        if (!mapInstanceRef.current) return

        // Rensa gamla track-lager (bara polyline och track-markörer)
        const layersToRemove = []
        mapInstanceRef.current.eachLayer((layer) => {
            if ((layer instanceof L.Polyline && layer.options.trackId) ||
                (layer instanceof L.Marker && layer.options.icon &&
                    (layer.options.icon.className === 'track-start-marker'))) {
                layersToRemove.push(layer)
            }
        })
        layersToRemove.forEach(layer => mapInstanceRef.current.removeLayer(layer))

        const newLayers = []

        tracksData.forEach(track => {
            if (!track.positions || track.positions.length < 2) return

            const coords = track.positions.map(p => [p.position.lat, p.position.lng])

            // Välj färg baserat på typ
            const color = track.track_type === 'human' ? '#ef4444' : '#8b5cf6' // Röd för människa, lila för hund
            const weight = track.track_type === 'human' ? 4 : 3

            // Streckad linje för hund, hel linje för människa
            const dashArray = track.track_type === 'dog' ? '10, 5' : null

            const polyline = L.polyline(coords, {
                color: color,
                weight: weight,
                opacity: 0.8,
                dashArray: dashArray,
                trackId: track.id
            }).addTo(mapInstanceRef.current)

            newLayers.push(polyline)

            // Lägg till startmarkör
            if (track.positions.length > 0) {
                const startPos = track.positions[0].position
                const startIcon = L.divIcon({
                    className: 'track-start-marker',
                    html: track.track_type === 'human' ? '🚶' : '🐕',
                    iconSize: [25, 25],
                    iconAnchor: [12, 12]
                })
                L.marker([startPos.lat, startPos.lng], {
                    icon: startIcon
                }).addTo(mapInstanceRef.current)
            }
        })

        setTrackLayers(newLayers)
    }

    // Ladda om och rita tracks
    const refreshTrackLayers = async () => {
        try {
            const tracksData = await loadTracks()
            // Bara uppdatera om vi fick data (skyddar mot att spåren försvinner)
            if (tracksData && tracksData.length >= 0) {
                drawTracks(tracksData)
            }
            // Ladda om hiding spots om vi har ett valt spår
            if (selectedTrackForHidingSpots) {
                loadHidingSpots(selectedTrackForHidingSpots.id)
            }
        } catch (error) {
            console.error('Fel vid refreshTrackLayers:', error)
            // Fortsätt med befintliga tracks - försök inte uppdatera om det misslyckas
        }
    }

    // Ladda hiding spots för ett spår
    const loadHidingSpots = async (trackId) => {
        try {
            const response = await axios.get(`${API_BASE}/tracks/${trackId}/hiding-spots`)
            setHidingSpots(response.data)
            drawHidingSpotsOnMap(response.data)
        } catch (error) {
            console.error('Fel vid laddning av gömställen:', error)
        }
    }

    // Skapa nytt gömställe
    const createHidingSpot = async (trackId, position) => {
        try {
            const response = await axios.post(`${API_BASE}/tracks/${trackId}/hiding-spots`, {
                position: position,
                name: `Gömställe ${hidingSpots.length + 1}`
            })
            setHidingSpots([...hidingSpots, response.data])
            drawHidingSpotsOnMap([...hidingSpots, response.data])
        } catch (error) {
            console.error('Fel vid skapande av gömställe:', error)
            alert('Kunde inte skapa gömställe')
        }
    }

    // Ladda jämförelsedata för ett hundspår (punkt, segment eller DTW)
    const loadComparisonData = async (dogTrackId, mode = 'point') => {
        if (!dogTrackId) return
        try {
            let url
            if (mode === 'segment') {
                url = `${API_BASE}/tracks/${dogTrackId}/compare-segments`
            } else if (mode === 'dtw') {
                url = `${API_BASE}/tracks/${dogTrackId}/compare-dtw`
            } else {
                url = `${API_BASE}/tracks/${dogTrackId}/compare`
            }
            const response = await axios.get(url)
            setComparisonData(response.data)
            setComparisonMode(mode)
        } catch (error) {
            console.error('Fel vid laddning av jämförelsedata:', error)
            alert('Kunde inte ladda jämförelsedata')
        }
    }

    const switchComparisonMode = (mode) => {
        setComparisonMode(mode)
        const dogId = comparisonData?.dog_track?.id ?? selectedDogTrack?.id
        if (dogId) {
            loadComparisonData(dogId, mode)
        }
    }

    // Ladda manuell jämförelsedata
    const loadManualComparison = async () => {
        if (!selectedHumanTrack || !selectedDogTrack) {
            alert('Välj både ett människaspår och ett hundspår')
            return
        }
        try {
            const response = await axios.get(`${API_BASE}/tracks/compare`, {
                params: {
                    human_track_id: selectedHumanTrack.id,
                    dog_track_id: selectedDogTrack.id
                }
            })
            setComparisonData(response.data)
            setComparisonMode('point') // manuell jämförelse returnerar punktformat
            setShowManualCompare(false)
        } catch (error) {
            console.error('Fel vid manuell jämförelse:', error)
            alert('Kunde inte jämföra spåren')
        }
    }

    // Uppdatera status för gömställe (hittade/ej hittade)
    const updateHidingSpotStatus = async (spotId, found) => {
        try {
            // Bestäm vilken track ID att använda för gömställena
            let trackId = null

            // Om vi spårar som hund, använd människaspårets ID (där gömställena tillhör)
            if (trackType === 'dog' && humanTrackForDog) {
                trackId = humanTrackForDog.id
            }
            // Om vi spårar som människa, använd aktuellt spår
            else if (trackType === 'human' && currentTrack) {
                trackId = currentTrack.id
            }
            // Annars använd selectedTrackForHidingSpots om det finns
            else if (selectedTrackForHidingSpots) {
                trackId = selectedTrackForHidingSpots.id
            }

            if (!trackId) return

            const response = await axios.put(`${API_BASE}/tracks/${trackId}/hiding-spots/${spotId}`, {
                found: found
            })
            // Uppdatera hiding spots
            setHidingSpots(hidingSpots.map(spot =>
                spot.id === spotId ? response.data : spot
            ))
            // Rita om på kartan
            const updatedSpots = hidingSpots.map(spot =>
                spot.id === spotId ? response.data : spot
            )
            drawHidingSpotsOnMap(updatedSpots)
        } catch (error) {
            console.error('Fel vid uppdatering av gömställe:', error)
            alert('Kunde inte uppdatera gömställe')
        }
    }

    // Rita hiding spots på kartan
    const drawHidingSpotsOnMap = (spots) => {
        if (!mapInstanceRef.current) return

        // Ta bort gamla hiding spot markörer
        hidingSpotMarkersRef.current.forEach(marker => {
            mapInstanceRef.current.removeLayer(marker)
        })
        hidingSpotMarkersRef.current = []

        // Lägg till nya markörer
        spots.forEach(spot => {
            // Välj ikon baserat på status
            let iconColor = '#FFA500' // Orange för omarkerat
            let iconText = '📦' // Default ikon
            if (spot.found === true) {
                iconColor = '#22c55e' // Grön för hittat
                iconText = '✅'
            } else if (spot.found === false) {
                iconColor = '#ef4444' // Röd för ej hittat
                iconText = '❌'
            }

            const icon = L.divIcon({
                className: 'hiding-spot-marker',
                html: `<div style="
                    background-color: ${iconColor};
                    width: 30px;
                    height: 30px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border: 2px solid white;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                    font-size: 16px;
                ">${iconText}</div>`,
                iconSize: [30, 30],
                iconAnchor: [15, 15]
            })

            const marker = L.marker([spot.position.lat, spot.position.lng], { icon })
                .addTo(mapInstanceRef.current)

            // Lägg till popup med info och knappar för att markera status
            let popupContent = `<div style="text-align: center;">
                <strong>${spot.name}</strong><br/>
                ${spot.description ? `<small>${spot.description}</small><br/>` : ''}
                Status: ${spot.found === null ? 'Inte markerat' : spot.found ? 'Hittade' : 'Hittade inte'}
            </div>`

            // Om det är ett hundspår med valt människaspår, visa knappar för att markera
            if (selectedTrackForHidingSpots && selectedTrackForHidingSpots.track_type === 'dog' && humanTrackForDog && spot.found === null) {
                popupContent += `
                    <div style="margin-top: 8px; display: flex; gap: 4px;">
                        <button onclick="window.markHidingSpotFound(${spot.id})" 
                                style="flex: 1; background: #22c55e; color: white; border: none; padding: 4px; border-radius: 4px; cursor: pointer;">
                            ✅ Hittade
                        </button>
                        <button onclick="window.markHidingSpotNotFound(${spot.id})" 
                                style="flex: 1; background: #ef4444; color: white; border: none; padding: 4px; border-radius: 4px; cursor: pointer;">
                            ❌ Hittade inte
                        </button>
                    </div>
                `
            }

            marker.bindPopup(popupContent)
            hidingSpotMarkersRef.current.push(marker)
        })

        // Sätt upp globala funktioner för popup-knappar (Leaflet popup-limitationer)
        if (typeof window !== 'undefined') {
            window.markHidingSpotFound = (spotId) => {
                updateHidingSpotStatus(spotId, true)
            }
            window.markHidingSpotNotFound = (spotId) => {
                updateHidingSpotStatus(spotId, false)
            }
        }
    }

    // Automatisk uppdatering av tracks var 10:e sekund (för att se tracks från andra enheter)
    // Bara om vi är online för att undvika onödiga timeout-fel
    useEffect(() => {
        if (!isOnline) return // Hoppa över om offline

        const interval = setInterval(() => {
            // Bara uppdatera om vi är online (för att undvika timeout-fel)
            if (isOnline || navigator.onLine) {
                refreshTrackLayers()
            }
        }, 10000) // Uppdatera var 10:e sekund (minskad frekvens)

        return () => clearInterval(interval)
    }, [isOnline])

    // Skapa ny cirkel-geofence
    const createCircleGeofence = async (center, radius) => {
        try {
            const response = await axios.post(`${API_BASE}/geofences`, {
                name: `Cirkel ${geofences.length + 1}`,
                geofence: {
                    type: 'circle',
                    center: center,
                    radius_m: radius
                }
            })
            setGeofences([...geofences, response.data])
        } catch (error) {
            console.error('Fel vid skapande av geofence:', error)
        }
    }

    // Skapa ny polygon-geofence
    const createPolygonGeofence = async (vertices) => {
        try {
            const response = await axios.post(`${API_BASE}/geofences`, {
                name: `Polygon ${geofences.length + 1}`,
                geofence: {
                    type: 'polygon',
                    vertices: vertices
                }
            })
            setGeofences([...geofences, response.data])
            setPolygonPoints([])
            setIsAddingPolygon(false)
        } catch (error) {
            console.error('Fel vid skapande av geofence:', error)
        }
    }

    // Utvärdera hundens position
    const evaluatePosition = async (position) => {
        try {
            const response = await axios.post(`${API_BASE}/evaluate`, {
                position: position
            })

            const currentInside = response.data.results.filter(r => r.inside)
            const currentInsideIds = currentInside.map(r => r.geofence_id)
            const previousInsideIds = Array.isArray(previousInside) ? previousInside.map(r => r.geofence_id) : []

            // Hitta ENTER events (nya geofences)
            const entered = currentInside.filter(r => !previousInsideIds.includes(r.geofence_id))
            // Hitta EXIT events (försvunna geofences)
            const exited = Array.isArray(previousInside) ? previousInside.filter(r => !currentInsideIds.includes(r.geofence_id)) : []

            // Lägg till events
            const newEvents = []
            entered.forEach(geofence => {
                newEvents.push({
                    type: 'ENTER',
                    geofence: geofence.name,
                    timestamp: new Date().toLocaleTimeString()
                })
            })
            exited.forEach(geofence => {
                newEvents.push({
                    type: 'EXIT',
                    geofence: geofence.name,
                    timestamp: new Date().toLocaleTimeString()
                })
            })

            if (newEvents.length > 0) {
                setEvents(prev => [...newEvents, ...prev].slice(0, 20)) // Behåll senaste 20
            }

            setCurrentGeofences(currentInside)
            setPreviousInside(currentInside)
            setDogInside(currentInside.length > 0)

            return response.data
        } catch (error) {
            console.error('Fel vid utvärdering:', error)
            return null
        }
    }

    // Initiera karta
    useEffect(() => {
        if (mapRef.current && !mapInstanceRef.current) {
            const map = L.map(mapRef.current).setView([59.334, 18.066], 15)

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors'
            }).addTo(map)

            mapInstanceRef.current = map

            // Lägg till hundens position
            const dogIcon = L.divIcon({
                className: 'dog-marker',
                html: '🐕',
                iconSize: [30, 30],
                iconAnchor: [15, 15]
            })

            const dogMarker = L.marker([dogPosition.lat, dogPosition.lng], { icon: dogIcon }).addTo(map)

            // Klick-händelse för att lägga till cirklar, polygoner och gömställen
            map.on('click', (e) => {
                if (isAddingCircle) {
                    const radius = 50 // 50 meter
                    createCircleGeofence({ lat: e.latlng.lat, lng: e.latlng.lng }, radius)
                    setIsAddingCircle(false)
                } else if (isAddingPolygon) {
                    const newPoint = { lat: e.latlng.lat, lng: e.latlng.lng }
                    const newPoints = [...polygonPoints, newPoint]
                    setPolygonPoints(newPoints)

                    // Lägg till temporär markör
                    L.marker([e.latlng.lat, e.latlng.lng]).addTo(map)
                } else if (isTracking && currentTrack && currentTrack.track_type === 'human') {
                    // Lägg till gömställe direkt när man spårar som människa
                    createHidingSpot(currentTrack.id, {
                        lat: e.latlng.lat,
                        lng: e.latlng.lng
                    })
                }
            })

            // Ladda befintliga geofences
            loadGeofences()

            // Ladda tracks och rita dem (både från API och localStorage)
            loadTracks().then(drawTracks).catch(err => {
                console.error('Fel vid initial laddning av tracks:', err)
                // Fallback: ladda från localStorage
                loadLocalTracks()
            })
        }

        return () => {
            // Stäng GPS om komponenten unmountas
            if (gpsWatchIdRef.current !== null) {
                navigator.geolocation?.clearWatch(gpsWatchIdRef.current)
            }
        }
    }, [])

    // Uppdatera karta när geofences ändras
    useEffect(() => {
        if (mapInstanceRef.current) {
            // Rensa befintliga lager
            mapInstanceRef.current.eachLayer((layer) => {
                if (layer instanceof L.Circle || layer instanceof L.Polygon) {
                    mapInstanceRef.current.removeLayer(layer)
                }
            })

            // Lägg till geofences
            geofences.forEach(geofence => {
                const shape = geofence.geofence
                if (shape.type === 'circle') {
                    L.circle([shape.center.lat, shape.center.lng], {
                        radius: shape.radius_m,
                        color: '#3b82f6',
                        fillColor: '#3b82f6',
                        fillOpacity: 0.2
                    }).addTo(mapInstanceRef.current)
                } else if (shape.type === 'polygon') {
                    const coords = shape.vertices.map(v => [v.lat, v.lng])
                    L.polygon(coords, {
                        color: '#10b981',
                        fillColor: '#10b981',
                        fillOpacity: 0.2
                    }).addTo(mapInstanceRef.current)
                }
            })

            // Visa polygon-under-uppbyggnad
            if (polygonPoints.length > 1) {
                const coords = polygonPoints.map(p => [p.lat, p.lng])
                L.polyline(coords, {
                    color: '#f59e0b',
                    weight: 3,
                    dashArray: '5, 5'
                }).addTo(mapInstanceRef.current)
            }
        }
    }, [geofences])

    // Simulera hundens rörelse med smoothing (bara om vi inte spårar med GPS)
    useEffect(() => {
        if (isTracking && trackType === 'dog') {
            // Stoppa simulering när vi spårar med GPS
            return
        }

        const interval = setInterval(() => {
            setDogPosition(prev => {
                // Smoothing: mindre steg och mer realistisk rörelse
                const step = 0.0002 // Mindre steg
                const newLat = prev.lat + (Math.random() - 0.5) * step
                const newLng = prev.lng + (Math.random() - 0.5) * step
                const newPos = { lat: newLat, lng: newLng }

                // Uppdatera hundmarkören
                if (mapInstanceRef.current) {
                    mapInstanceRef.current.eachLayer((layer) => {
                        if (layer.options.icon && layer.options.icon.className === 'dog-marker') {
                            layer.setLatLng([newLat, newLng])
                        }
                    })
                }

                // Utvärdera position
                evaluatePosition(newPos)

                return newPos
            })
        }, 1500) // Snabbare uppdatering

        return () => clearInterval(interval)
    }, [isTracking, trackType])

    return (
        <div className="h-full relative">
            {/* Fullskärmskarta */}
            <div className="absolute inset-0">
                <div ref={mapRef} className="h-full w-full" />

                {/* Meny-knapp (alltid synlig) */}
                <button
                    onClick={() => setMenuOpen(!menuOpen)}
                    className="absolute top-4 left-4 z-[1000] bg-white p-3 rounded-lg shadow-lg hover:bg-gray-50 flex items-center gap-2"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                    <span className="font-medium">Meny</span>
                </button>

                {/* Status för hundens position */}
                <div className="absolute top-4 right-4 bg-white p-3 rounded-lg shadow-lg max-w-sm z-[999]">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">🐕</span>
                        <span className={dogInside ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                            {dogInside ? 'Inne i område' : 'Ute ur område'}
                        </span>
                    </div>
                    {currentGeofences.length > 0 && (
                        <div className="text-sm text-gray-600">
                            I: {currentGeofences.map(g => g.name).join(', ')}
                        </div>
                    )}
                </div>

                {/* Snabbknapp för spårning när meny är stängd */}
                {!menuOpen && (
                    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-[999]">
                        <div className="bg-white p-3 rounded-lg shadow-lg flex items-center gap-3">
                            {!isTracking ? (
                                <button
                                    onClick={startTracking}
                                    className="px-6 py-3 bg-green-600 text-white rounded font-medium hover:bg-green-700 flex items-center gap-2"
                                >
                                    <span>▶</span>
                                    <span>Starta spårning</span>
                                </button>
                            ) : (
                                <div className="flex flex-col items-center gap-3">
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={stopTracking}
                                            className="px-6 py-3 bg-red-600 text-white rounded font-medium hover:bg-red-700 flex items-center gap-2"
                                        >
                                            <span>⏹</span>
                                            <span>Stoppa</span>
                                        </button>
                                        <div className="text-sm">
                                            <div className="font-medium">{trackType === 'human' ? '🚶 Människa' : '🐕 Hund'}</div>
                                            <div className="text-xs text-gray-500">
                                                {currentTrack?.positions?.length || 0} positioner
                                            </div>
                                        </div>
                                    </div>
                                    {/* Knapp för att lägga till gömställe (bara för människaspår) */}
                                    {trackType === 'human' && (
                                        <button
                                            onClick={addHidingSpotAtCurrentPosition}
                                            className="px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 flex items-center gap-2"
                                        >
                                            <span>📦</span>
                                            <span>Lägg till gömställe</span>
                                        </button>
                                    )}
                                    {/* Knappar för att markera gömställe när hund spårar */}
                                    {trackType === 'dog' && nearestHidingSpot && (
                                        <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-3">
                                            <p className="text-sm font-medium mb-2">Nära gömställe: {nearestHidingSpot.name}</p>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => {
                                                        updateHidingSpotStatus(nearestHidingSpot.id, true)
                                                        setNearestHidingSpot(null)
                                                    }}
                                                    className="flex-1 px-3 py-2 bg-green-600 text-white rounded font-medium hover:bg-green-700"
                                                >
                                                    ✅ Hittade
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        updateHidingSpotStatus(nearestHidingSpot.id, false)
                                                        setNearestHidingSpot(null)
                                                    }}
                                                    className="flex-1 px-3 py-2 bg-red-600 text-white rounded font-medium hover:bg-red-700"
                                                >
                                                    ❌ Hittade inte
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                            <div className={`text-xs px-2 py-1 rounded ${isOnline ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'
                                }`}>
                                {isOnline ? '🟢' : '🔴'}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Meny-panel (slide-in) */}
            <div className={`absolute top-0 left-0 h-full w-80 bg-gray-100 shadow-2xl z-[1000] transition-transform duration-300 ease-in-out overflow-y-auto ${menuOpen ? 'translate-x-0' : '-translate-x-full'
                }`}>
                <div className="p-4 flex flex-col gap-4">
                    <div className="flex items-center justify-between mb-2">
                        <h2 className="text-xl font-bold">Meny</h2>
                        <button
                            onClick={() => setMenuOpen(false)}
                            className="p-2 hover:bg-gray-200 rounded"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* GPS Spårning */}
                    <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="font-bold">GPS Spårning</h3>
                            <div className={`text-xs px-2 py-1 rounded ${isOnline ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'
                                }`}>
                                {isOnline ? '🟢 Online' : '🔴 Offline'}
                            </div>
                        </div>
                        {!isOnline && (
                            <p className="text-xs text-gray-600 mb-2">
                                Spåret sparas lokalt och synkas när du kommer tillbaka till WiFi
                            </p>
                        )}

                        {pendingSyncItems > 0 && (
                            <div className="mb-3 text-xs bg-yellow-100 border border-yellow-300 text-yellow-900 rounded p-2">
                                <p className="font-medium">
                                    {pendingSyncItems} objekt väntar på att synkas till servern.
                                </p>
                                <button
                                    onClick={syncOfflineQueue}
                                    disabled={!isOnline || isSyncingOfflineData}
                                    className={`mt-2 w-full px-3 py-1 rounded font-medium ${isOnline && !isSyncingOfflineData
                                        ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                                        : 'bg-gray-300 text-gray-600 cursor-not-allowed'
                                        }`}
                                >
                                    {isSyncingOfflineData ? 'Synkar...' : 'Synka nu'}
                                </button>
                            </div>
                        )}
                        <div className="mt-3">
                            <button
                                onClick={forceSyncAllLocalTracks}
                                disabled={isSyncingOfflineData}
                                className={`w-full px-3 py-2 rounded font-medium text-xs ${isSyncingOfflineData
                                    ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                                    : 'bg-indigo-500 text-white hover:bg-indigo-600'
                                    }`}
                            >
                                🔁 Tvångssynka lokala spår
                            </button>
                            {forceSyncMessage && (
                                <p className="mt-2 text-xs text-gray-600">
                                    {forceSyncMessage}
                                </p>
                            )}
                        </div>

                        <div className="mb-3">
                            <label className="block text-sm font-medium mb-1">Spåra som:</label>
                            <select
                                value={trackType}
                                onChange={(e) => setTrackType(e.target.value)}
                                disabled={isTracking}
                                className="w-full px-3 py-2 border rounded"
                            >
                                <option value="human">Människa 🚶</option>
                                <option value="dog">Hund 🐕</option>
                            </select>
                        </div>

                        {trackType === 'dog' && !isTracking && (
                            <div className="mb-3">
                                <label className="block text-sm font-medium mb-1">
                                    Välj människaspår att följa:
                                    <span className="text-xs text-gray-500 ml-2">Krävs för jämförelse</span>
                                </label>
                                <select
                                    value={humanTrackForDog?.id || ''}
                                    onChange={(e) => {
                                        const selectedTrack = tracks.find(t => t.id.toString() === e.target.value && t.track_type === 'human')
                                        setHumanTrackForDog(selectedTrack)
                                    }}
                                    className="w-full px-3 py-2 border rounded"
                                    required
                                >
                                    <option value="">-- Välj människaspår --</option>
                                    {tracks
                                        .filter(t => t.track_type === 'human')
                                        .map(track => (
                                            <option key={track.id} value={track.id}>
                                                🚶 {track.name} ({track.positions?.length || 0} pos)
                                            </option>
                                        ))
                                    }
                                </select>
                                {tracks.filter(t => t.track_type === 'human').length === 0 && (
                                    <p className="text-xs text-red-500 mt-1">
                                        Inga människaspår finns. Skapa ett människaspår först!
                                    </p>
                                )}
                            </div>
                        )}

                        {!isTracking ? (
                            <button
                                onClick={startTracking}
                                disabled={trackType === 'dog' && !humanTrackForDog}
                                className="w-full px-4 py-2 bg-green-600 text-white rounded font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                            >
                                ▶ Starta spårning
                            </button>
                        ) : (
                            <div>
                                <button
                                    onClick={stopTracking}
                                    className="w-full px-4 py-2 bg-red-600 text-white rounded font-medium hover:bg-red-700 mb-2"
                                >
                                    ⏹ Stoppa spårning
                                </button>
                                {trackType === 'human' && (
                                    <button
                                        onClick={addHidingSpotAtCurrentPosition}
                                        className="w-full px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 mb-2"
                                        disabled={!currentPosition}
                                    >
                                        📍 Lägg till gömställe här
                                    </button>
                                )}
                                {trackType === 'dog' && nearestHidingSpot && (
                                    <button
                                        onClick={() => updateHidingSpotStatus(nearestHidingSpot.id, true)}
                                        className="w-full px-4 py-2 bg-green-600 text-white rounded font-medium hover:bg-green-700 mb-2"
                                    >
                                        ✅ Markera gömställe som hittat
                                    </button>
                                )}
                                <p className="text-sm text-gray-600">
                                    Spårar: {trackType === 'human' ? 'Människa' : 'Hund'}
                                </p>
                                {currentTrack && (
                                    <p className="text-xs text-gray-500">
                                        Positioner: {currentTrack.positions?.length || 0}
                                    </p>
                                )}
                                {trackType === 'dog' && nearestHidingSpot && (
                                    <p className="text-xs text-green-600 font-medium">
                                        Nära gömställe: {nearestHidingSpot.name}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Befintliga spår */}
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <div className="flex items-center gap-2">
                                <h3 className="font-bold">Befintliga spår:</h3>
                                <div className="flex items-center gap-1 text-xs">
                                    <span className="text-gray-500">Filter:</span>
                                    <select
                                        className="border rounded px-1 py-0.5"
                                        value={trackSourceFilter}
                                        onChange={(e) => setTrackSourceFilter(e.target.value)}
                                    >
                                        <option value="all">Alla</option>
                                        <option value="own">Egna</option>
                                        <option value="imported">Kundspår</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex gap-1">
                                <button
                                    onClick={() => setShowManualCompare(true)}
                                    className="text-xs px-2 py-1 bg-purple-500 text-white rounded hover:bg-purple-600"
                                    title="Jämför spår manuellt"
                                >
                                    🔍
                                </button>
                                <button
                                    onClick={refreshTrackLayers}
                                    className="text-xs px-2 py-1 bg-gray-200 rounded hover:bg-gray-300"
                                >
                                    Uppdatera
                                </button>
                            </div>
                        </div>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                            {filteredTracks.length === 0 ? (
                                <p className="text-sm text-gray-500">Inga spår än</p>
                            ) : (
                                filteredTracks.map(track => {
                                    const isActiveTrack = currentTrack && currentTrack.id === track.id
                                    return (
                                        <div
                                            key={track.id}
                                            className={`p-2 rounded border text-sm ${isActiveTrack ? 'bg-blue-100 border-blue-300' : 'bg-white'
                                                }`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <span>{track.track_type === 'human' ? '🚶' : '🐕'}</span>
                                                <div className="flex-1">
                                                    <div className="font-medium flex items-center gap-1">
                                                        {track.name}
                                                        {isActiveTrack && (
                                                            <span className="text-xs bg-green-500 text-white px-1 rounded">Aktiv</span>
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-gray-500 flex items-center gap-2">
                                                        <span>{track.positions?.length || 0} positioner</span>
                                                        {track.track_source === 'imported' && (
                                                            <span className="px-1 py-0.5 rounded bg-yellow-100 text-yellow-700">
                                                                Kundspår
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex gap-1">
                                                    {track.track_type === 'dog' && track.human_track_id && (
                                                        <button
                                                            onClick={() => loadComparisonData(track.id)}
                                                            className="text-xs px-2 py-1 bg-purple-500 text-white rounded hover:bg-purple-600"
                                                            title="Visa statistik"
                                                        >
                                                            📊
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => {
                                                            const trackToDelete = tracks.find(t => t.id === track.id)
                                                            if (trackToDelete && window.confirm('Ta bort detta spår?')) {
                                                                axios.delete(`${API_BASE}/tracks/${track.id}`)
                                                                    .then(() => refreshTrackLayers())
                                                            }
                                                        }}
                                                        className="text-red-500 hover:text-red-700 text-lg leading-none"
                                                        disabled={isActiveTrack}
                                                    >
                                                        ×
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    </div>

                    {/* Jämförelsedata modal */}
                    {comparisonData && (
                        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
                                <div className="flex justify-between items-center mb-4">
                                    <h2 className="text-xl font-bold">📊 Jämförelse</h2>
                                    <button
                                        onClick={() => setComparisonData(null)}
                                        className="text-gray-500 hover:text-gray-700 text-2xl"
                                    >
                                        ×
                                    </button>
                                </div>

                                {/* Tabs: Punkt / Segment / DTW */}
                                <div className="flex gap-2 mb-4">
                                    {['point', 'segment', 'dtw'].map((mode) => (
                                        <button
                                            key={mode}
                                            onClick={() => switchComparisonMode(mode)}
                                            className={`px-4 py-2 rounded font-medium transition ${
                                                comparisonMode === mode
                                                    ? 'bg-purple-600 text-white'
                                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                            }`}
                                        >
                                            {mode === 'point' ? 'Punkt' : mode === 'segment' ? 'Segment' : 'DTW'}
                                        </button>
                                    ))}
                                </div>

                                <div className="space-y-4">
                                    {/* Punkt: Matchningsprocent + avstånd */}
                                    {comparisonMode === 'point' && comparisonData.match_percentage != null && (
                                        <>
                                            <div className="bg-purple-50 p-4 rounded">
                                                <div className="text-sm text-gray-600 mb-1">Matchning</div>
                                                <div className="text-3xl font-bold text-purple-600">
                                                    {comparisonData.match_percentage}%
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="bg-blue-50 p-3 rounded">
                                                    <div className="text-xs text-gray-600 mb-1">Genomsnitt</div>
                                                    <div className="text-lg font-bold text-blue-600">
                                                        {comparisonData.distance_stats?.average_meters ?? 0}m
                                                    </div>
                                                </div>
                                                <div className="bg-orange-50 p-3 rounded">
                                                    <div className="text-xs text-gray-600 mb-1">Max</div>
                                                    <div className="text-lg font-bold text-orange-600">
                                                        {comparisonData.distance_stats?.max_meters ?? 0}m
                                                    </div>
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {/* Segment: overall_similarity + segment_counts */}
                                    {comparisonMode === 'segment' && !comparisonData.segment_comparison && (
                                        <div className="bg-gray-50 p-4 rounded text-center text-gray-500">Laddar segmentjämförelse…</div>
                                    )}
                                    {comparisonMode === 'segment' && comparisonData.segment_comparison && (
                                        <>
                                            <div className="bg-purple-50 p-4 rounded">
                                                <div className="text-sm text-gray-600 mb-1">Segmentlikhet</div>
                                                <div className="text-3xl font-bold text-purple-600">
                                                    {Math.round(comparisonData.segment_comparison.overall_similarity)}%
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="bg-blue-50 p-3 rounded">
                                                    <div className="text-xs text-gray-600 mb-1">Human segment</div>
                                                    <div className="text-lg font-bold text-blue-600">
                                                        {comparisonData.segment_comparison.segment_counts?.human_segments ?? 0}
                                                    </div>
                                                </div>
                                                <div className="bg-orange-50 p-3 rounded">
                                                    <div className="text-xs text-gray-600 mb-1">Hund segment</div>
                                                    <div className="text-lg font-bold text-orange-600">
                                                        {comparisonData.segment_comparison.segment_counts?.dog_segments ?? 0}
                                                    </div>
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {/* DTW: similarity_score + dtw_distance */}
                                    {comparisonMode === 'dtw' && !comparisonData.dtw && (
                                        <div className="bg-gray-50 p-4 rounded text-center text-gray-500">Laddar DTW-jämförelse…</div>
                                    )}
                                    {comparisonMode === 'dtw' && comparisonData.dtw && (
                                        <>
                                            <div className="bg-purple-50 p-4 rounded">
                                                <div className="text-sm text-gray-600 mb-1">DTW-likhet</div>
                                                <div className="text-3xl font-bold text-purple-600">
                                                    {comparisonData.dtw.similarity_score}%
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="bg-blue-50 p-3 rounded">
                                                    <div className="text-xs text-gray-600 mb-1">DTW-avstånd</div>
                                                    <div className="text-lg font-bold text-blue-600">
                                                        {comparisonData.dtw.dtw_distance}m
                                                    </div>
                                                </div>
                                                <div className="bg-orange-50 p-3 rounded">
                                                    <div className="text-xs text-gray-600 mb-1">Norm. snitt</div>
                                                    <div className="text-lg font-bold text-orange-600">
                                                        {comparisonData.dtw.dtw_normalized_avg_m}m
                                                    </div>
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {/* Gömställen statistik */}
                                    <div className="grid grid-cols-4 gap-2">
                                        <div className="bg-green-50 p-2 rounded text-center">
                                            <div className="text-sm">✅</div>
                                            <div className="text-lg font-bold text-green-600">{comparisonData.hiding_spots.found}</div>
                                            <div className="text-xs text-gray-600">Hittade</div>
                                        </div>
                                        <div className="bg-red-50 p-2 rounded text-center">
                                            <div className="text-sm">❌</div>
                                            <div className="text-lg font-bold text-red-600">{comparisonData.hiding_spots.missed}</div>
                                            <div className="text-xs text-gray-600">Missade</div>
                                        </div>
                                        <div className="bg-yellow-50 p-2 rounded text-center">
                                            <div className="text-sm">⚠️</div>
                                            <div className="text-lg font-bold text-yellow-600">{comparisonData.hiding_spots.unchecked}</div>
                                            <div className="text-xs text-gray-600">Ej kontroll</div>
                                        </div>
                                        <div className="bg-gray-50 p-2 rounded text-center">
                                            <div className="text-sm">📦</div>
                                            <div className="text-lg font-bold text-gray-600">{comparisonData.hiding_spots.total}</div>
                                            <div className="text-xs text-gray-600">Totalt</div>
                                        </div>
                                    </div>

                                    {/* Track info */}
                                    <div className="border-t pt-4 space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-600">🚶 Människaspår:</span>
                                            <span className="font-medium">{comparisonData.human_track.name}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-600">Positioner:</span>
                                            <span>{comparisonData.human_track.position_count}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-600">🐕 Hundspår:</span>
                                            <span className="font-medium">{comparisonData.dog_track.name}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-600">Positioner:</span>
                                            <span>{comparisonData.dog_track.position_count}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Manuell jämförelse modal */}
                    {showManualCompare && (
                        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                                <div className="flex justify-between items-center mb-4">
                                    <h2 className="text-xl font-bold">🔍 Jämför spår</h2>
                                    <button
                                        onClick={() => setShowManualCompare(false)}
                                        className="text-gray-500 hover:text-gray-700 text-2xl"
                                    >
                                        ×
                                    </button>
                                </div>

                                <div className="space-y-4">
                                    {/* Välj människaspår */}
                                    <div>
                                        <label className="block text-sm font-medium mb-2">🚶 Välj människaspår:</label>
                                        <select
                                            value={selectedHumanTrack?.id || ''}
                                            onChange={(e) => {
                                                const track = filteredTracks.find(t => t.id.toString() === e.target.value && t.track_type === 'human')
                                                setSelectedHumanTrack(track)
                                            }}
                                            className="w-full px-3 py-2 border rounded"
                                        >
                                            <option value="">Välj...</option>
                                            {filteredTracks
                                                .filter(t => t.track_type === 'human')
                                                .map(track => (
                                                    <option key={track.id} value={track.id}>
                                                        {track.name} ({track.positions?.length || 0} pos)
                                                    </option>
                                                ))
                                            }
                                        </select>
                                    </div>

                                    {/* Välj hundspår */}
                                    <div>
                                        <label className="block text-sm font-medium mb-2">🐕 Välj hundspår:</label>
                                        <select
                                            value={selectedDogTrack?.id || ''}
                                            onChange={(e) => {
                                                const track = filteredTracks.find(t => t.id.toString() === e.target.value && t.track_type === 'dog')
                                                setSelectedDogTrack(track)
                                            }}
                                            className="w-full px-3 py-2 border rounded"
                                        >
                                            <option value="">Välj...</option>
                                            {filteredTracks
                                                .filter(t => t.track_type === 'dog')
                                                .map(track => (
                                                    <option key={track.id} value={track.id}>
                                                        {track.name} ({track.positions?.length || 0} pos)
                                                    </option>
                                                ))
                                            }
                                        </select>
                                    </div>

                                    {/* Jämför-knapp */}
                                    <button
                                        onClick={loadManualComparison}
                                        disabled={!selectedHumanTrack || !selectedDogTrack}
                                        className="w-full px-4 py-2 bg-purple-600 text-white rounded font-medium hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                                    >
                                        Jämför spåren
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex gap-2">
                        <button
                            onClick={() => {
                                setIsAddingCircle(!isAddingCircle)
                                setIsAddingPolygon(false)
                                setPolygonPoints([])
                            }}
                            className={`px-4 py-2 rounded font-medium ${isAddingCircle
                                ? 'bg-red-500 text-white'
                                : 'bg-blue-500 text-white hover:bg-blue-600'
                                }`}
                        >
                            {isAddingCircle ? 'Avbryt' : 'Cirkel'}
                        </button>

                        <button
                            onClick={() => {
                                setIsAddingPolygon(!isAddingPolygon)
                                setIsAddingCircle(false)
                                if (!isAddingPolygon) {
                                    setPolygonPoints([])
                                }
                            }}
                            className={`px-4 py-2 rounded font-medium ${isAddingPolygon
                                ? 'bg-red-500 text-white'
                                : 'bg-green-500 text-white hover:bg-green-600'
                                }`}
                        >
                            {isAddingPolygon ? 'Avbryt' : 'Polygon'}
                        </button>
                    </div>

                    {isAddingCircle && (
                        <p className="text-sm text-gray-600">
                            Klicka på kartan för att placera en cirkel (50m radie)
                        </p>
                    )}

                    {isAddingPolygon && (
                        <div>
                            <p className="text-sm text-gray-600 mb-2">
                                Klicka på kartan för att lägga till punkter. Klicka "Slutför" när du är klar.
                            </p>
                            <p className="text-xs text-gray-500">
                                Punkter: {polygonPoints.length} (minst 3 krävs)
                            </p>
                            {polygonPoints.length >= 3 && (
                                <button
                                    onClick={() => createPolygonGeofence(polygonPoints)}
                                    className="mt-2 px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                                >
                                    Slutför polygon
                                </button>
                            )}
                        </div>
                    )}

                    <div>
                        <h3 className="font-bold mb-2">Befintliga geofences:</h3>
                        <div className="space-y-2 max-h-32 overflow-y-auto">
                            {geofences.map(geofence => (
                                <div key={geofence.id} className="bg-white p-2 rounded border">
                                    <div className="font-medium">{geofence.name}</div>
                                    <div className="text-sm text-gray-600">
                                        {geofence.geofence.type === 'circle' ? 'Cirkel' : 'Polygon'}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div>
                        <h3 className="font-bold mb-2">Händelser:</h3>
                        <div className="space-y-1 max-h-32 overflow-y-auto text-sm">
                            {events.length === 0 ? (
                                <p className="text-gray-500">Inga händelser än</p>
                            ) : (
                                events.map((event, index) => (
                                    <div key={index} className={`p-2 rounded ${event.type === 'ENTER' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                        }`}>
                                        <div className="font-medium">
                                            {event.type === 'ENTER' ? '→' : '←'} {event.geofence}
                                        </div>
                                        <div className="text-xs">{event.timestamp}</div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default GeofenceEditor
