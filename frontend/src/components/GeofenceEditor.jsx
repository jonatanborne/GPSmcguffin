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
const API_BASE = import.meta.env.VITE_API_URL || '/api'

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
    const [hidingSpots, setHidingSpots] = useState([]) // Gömställen för aktuellt valt spår
    const [isAddingHidingSpot, setIsAddingHidingSpot] = useState(false)
    const [selectedTrackForHidingSpots, setSelectedTrackForHidingSpots] = useState(null)
    const [humanTrackForDog, setHumanTrackForDog] = useState(null) // Vilket människaspår hundens spår är baserat på
    const hidingSpotMarkersRef = useRef([]) // Referenser till hiding spot markörer på kartan
    const [nearestHidingSpot, setNearestHidingSpot] = useState(null) // Närmaste gömställe när hund spårar
    const [currentPosition, setCurrentPosition] = useState(null) // Nuvarande GPS-position

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
        try {
            const response = await axios.get(`${API_BASE}/tracks`, { timeout: 5000 })
            // Hämta fullständiga tracks med positioner för varje
            apiTracks = await Promise.all(
                response.data.map(async (track) => {
                    try {
                        const fullTrack = await axios.get(`${API_BASE}/tracks/${track.id}`)
                        return fullTrack.data
                    } catch (error) {
                        console.error(`Fel vid hämtning av track ${track.id}:`, error)
                        return track // Fallback till minimal track
                    }
                })
            )
        } catch (error) {
            console.error('Fel vid laddning av tracks från API:', error)
            // Fortsätt med localStorage-tracks
        }

        // Ladda även tracks från localStorage (fallback och för lokala tracks)
        const localTracks = []
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (key && key.startsWith('track_') && !key.includes('_positions')) {
                const trackId = key.replace('track_', '')
                // Hoppa över om track redan finns från API (via ID)
                if (apiTracks.some(t => t.id.toString() === trackId)) continue

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

        // Kombinera tracks från API och localStorage
        const allTracks = [...apiTracks, ...localTracks]
        setTracks(allTracks)
        return allTracks
    }

    // Skapa nytt track (fungerar alltid - sparar lokalt om API misslyckas)
    const createTrack = async (type) => {
        // Skapa track lokalt först (fungerar alltid)
        const localId = Date.now()
        const tempTrack = {
            id: localId,
            track_type: type,
            name: `${type === 'human' ? 'Människa' : 'Hund'} - ${new Date().toLocaleTimeString()}`,
            created_at: new Date().toISOString(),
            positions: []
        }
        
        // Spara lokalt direkt
        localStorage.setItem(`track_${localId}`, JSON.stringify(tempTrack))
        localStorage.setItem(`track_${localId}_positions`, JSON.stringify([]))
        
        // Försök skapa på server (men fortsätt även om det misslyckas)
        if (navigator.onLine) {
            try {
                const response = await axios.post(`${API_BASE}/tracks`, {
                    track_type: type,
                    name: tempTrack.name
                })
                // Om det lyckades, uppdatera med serverns ID
                const serverTrack = response.data
                // Spara både lokalt och på server (använd serverns ID framåt)
                localStorage.setItem(`track_${serverTrack.id}`, JSON.stringify(serverTrack))
                localStorage.setItem(`track_${serverTrack.id}_positions`, JSON.stringify([]))
                // Ta bort lokal kopia om vi fick ett server-ID
                if (serverTrack.id !== localId) {
                    localStorage.removeItem(`track_${localId}`)
                    localStorage.removeItem(`track_${localId}_positions`)
                    // Uppdatera offline queue med rätt ID
                    offlineQueueRef.current = offlineQueueRef.current.map(item => 
                        item.trackId === localId ? { ...item, trackId: serverTrack.id } : item
                    )
                }
                return serverTrack
            } catch (error) {
                console.error('Kunde inte skapa track på server:', error)
                // Spara i queue för senare synkning
                offlineQueueRef.current.push({ type: 'create_track', track: tempTrack })
                // Men returnera track ändå så spårning kan fortsätta
                return tempTrack
            }
        } else {
            // Offline - spara i queue för senare
            offlineQueueRef.current.push({ type: 'create_track', track: tempTrack })
            return tempTrack
        }
    }

    // Lägg till position till track (med offline-stöd)
    const addPositionToTrack = async (trackId, position, accuracy) => {
        // Spara lokalt oavsett online/offline status
        const localTrackKey = `track_${trackId}_positions`
        const existing = JSON.parse(localStorage.getItem(localTrackKey) || '[]')
        existing.push({ position, accuracy, timestamp: new Date().toISOString() })
        localStorage.setItem(localTrackKey, JSON.stringify(existing))

        // Om offline, lägg i queue för senare synkning
        if (!isOnline) {
            offlineQueueRef.current.push({ trackId, position, accuracy })
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
            })
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
    const syncOfflineQueue = async () => {
        if (offlineQueueRef.current.length === 0) return

        console.log(`Synkar ${offlineQueueRef.current.length} positioner...`)
        const queue = [...offlineQueueRef.current]
        offlineQueueRef.current = []

        // Först, skapa tracks som skapades offline
        const trackCreations = queue.filter(item => item.type === 'create_track')
        const positionItems = queue.filter(item => !item.type || item.type !== 'create_track')

        for (const item of trackCreations) {
            try {
                const created = await createTrack(item.track.track_type)
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
                console.error('Kunde inte skapa track:', error)
            }
        }

        // Skicka alla positioner
        for (const item of positionItems) {
            try {
                await axios.post(`${API_BASE}/tracks/${item.trackId}/positions`, {
                    position: item.position,
                    accuracy: item.accuracy
                })
            } catch (error) {
                // Om det fortfarande misslyckas, lägg tillbaka i queue
                offlineQueueRef.current.push(item)
                if (!error.response || error.code === 'ERR_NETWORK') {
                    setIsOnline(false)
                }
            }
        }

        if (offlineQueueRef.current.length === 0) {
            console.log('Alla positioner synkade!')
            // Ladda om tracks
            loadTracks().then(refreshTrackLayers)
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

    // Enkel online-detektering - bara navigator.onLine (bästa indikatorn)
    const checkOnlineStatus = () => {
        // Använd bara navigator.onLine - den är tillförlitlig för internet-anslutning
        const online = navigator.onLine
        setIsOnline(online)
        
        // Om vi blir online igen, synka queue
        if (online && offlineQueueRef.current.length > 0) {
            syncOfflineQueue()
        }
        
        return online
    }

    // Nätverksdetektering - enkel och tillförlitlig
    useEffect(() => {
        // Kontrollera status vid start
        checkOnlineStatus()

        const handleOnline = () => {
            setIsOnline(true)
            syncOfflineQueue()
        }

        const handleOffline = () => {
            setIsOnline(false)
        }

        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)

        // Kontrollera status var 5:e sekund (för att fånga upp ändringar)
        const interval = setInterval(() => {
            checkOnlineStatus()
        }, 5000)

        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
            clearInterval(interval)
        }
    }, [])

    // Synka automatiskt när man blir online
    useEffect(() => {
        if (isOnline && offlineQueueRef.current.length > 0) {
            syncOfflineQueue()
        }
    }, [isOnline])

    // Starta GPS-spårning
    const startTracking = async () => {
        if (!navigator.geolocation) {
            alert('GPS stöds inte av din webbläsare')
            return
        }

        let track
        if (isOnline) {
            track = await createTrack(trackType)
            if (!track) {
                alert('Kunde inte skapa track')
                return
            }
        } else {
            // Om offline, skapa track lokalt
            const localId = Date.now()
            track = {
                id: localId,
                name: `${trackType === 'human' ? 'Människa' : 'Hund'} - ${new Date().toLocaleTimeString()}`,
                track_type: trackType,
                created_at: new Date().toISOString(),
                positions: []
            }
            // Spara lokalt
            localStorage.setItem(`track_${localId}`, JSON.stringify(track))
            localStorage.setItem(`track_${localId}_positions`, JSON.stringify([]))

            // Försök skapa på server senare när online
            offlineQueueRef.current.push({ type: 'create_track', track })
        }

        setCurrentTrack(track)
        setIsTracking(true)

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

                // Lägg till position till track
                addPositionToTrack(track.id, pos, position.coords.accuracy)

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
                if (currentTrack && currentTrack.positions.length === 0 && mapInstanceRef.current) {
                    mapInstanceRef.current.setView([pos.lat, pos.lng], 17)
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

        // Om offline, försök skapa track på server när online
        if (!isOnline && currentTrack) {
            // Track finns redan lokalt, kommer synkas när online
            console.log('Spår sparat lokalt, synkar när online igen')
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
        const tracksData = await loadTracks()
        drawTracks(tracksData)
        // Ladda om hiding spots om vi har ett valt spår
        if (selectedTrackForHidingSpots) {
            loadHidingSpots(selectedTrackForHidingSpots.id)
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

    // Uppdatera status för gömställe (hittade/ej hittade)
    const updateHidingSpotStatus = async (spotId, found) => {
        try {
            // För hundspår, använd människaspårets ID (där gömställena tillhör)
            // För människaspår, använd det valda spåret
            const trackId = selectedTrackForHidingSpots?.track_type === 'dog' && humanTrackForDog
                ? humanTrackForDog.id
                : selectedTrackForHidingSpots?.id

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

    // Automatisk uppdatering av tracks var 3:e sekund (för att se tracks från andra enheter)
    useEffect(() => {
        const interval = setInterval(() => {
            // Uppdatera tracks (men rita inte om vårt egna aktiva spår)
            refreshTrackLayers()
        }, 3000) // Uppdatera var 3:e sekund

        return () => clearInterval(interval)
    }, [])

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
            const previousInsideIds = previousInside.map(r => r.geofence_id)

            // Hitta ENTER events (nya geofences)
            const entered = currentInside.filter(r => !previousInsideIds.includes(r.geofence_id))
            // Hitta EXIT events (försvunna geofences)
            const exited = previousInside.filter(r => !currentInsideIds.includes(r.geofence_id))

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
                } else if (isAddingHidingSpot && selectedTrackForHidingSpots) {
                    // Lägg till gömställe vid klickad position
                    createHidingSpot(selectedTrackForHidingSpots.id, {
                        lat: e.latlng.lat,
                        lng: e.latlng.lng
                    })
                    setIsAddingHidingSpot(false)
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

                        {!isTracking ? (
                            <button
                                onClick={startTracking}
                                className="w-full px-4 py-2 bg-green-600 text-white rounded font-medium hover:bg-green-700"
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
                                <p className="text-sm text-gray-600">
                                    Spårar: {trackType === 'human' ? 'Människa' : 'Hund'}
                                </p>
                                {currentTrack && (
                                    <p className="text-xs text-gray-500">
                                        Positioner: {currentTrack.positions?.length || 0}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Befintliga spår */}
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="font-bold">Befintliga spår:</h3>
                            <button
                                onClick={refreshTrackLayers}
                                className="text-xs px-2 py-1 bg-gray-200 rounded hover:bg-gray-300"
                            >
                                Uppdatera
                            </button>
                        </div>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                            {tracks.length === 0 ? (
                                <p className="text-sm text-gray-500">Inga spår än</p>
                            ) : (
                                tracks.map(track => {
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
                                                    <div className="text-xs text-gray-500">
                                                        {track.positions?.length || 0} positioner
                                                    </div>
                                                </div>
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
                                    )
                                })
                            )}
                        </div>
                    </div>

                    {/* Gömställen */}
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="font-bold">Gömställen:</h3>
                            {selectedTrackForHidingSpots && (
                                <button
                                    onClick={() => {
                                        setSelectedTrackForHidingSpots(null)
                                        setHidingSpots([])
                                        setIsAddingHidingSpot(false)
                                        setHumanTrackForDog(null)
                                        // Ta bort hiding spot markörer från kartan
                                        hidingSpotMarkersRef.current.forEach(marker => {
                                            if (mapInstanceRef.current) {
                                                mapInstanceRef.current.removeLayer(marker)
                                            }
                                        })
                                        hidingSpotMarkersRef.current = []
                                    }}
                                    className="text-xs px-2 py-1 bg-gray-200 rounded hover:bg-gray-300"
                                >
                                    Avbryt
                                </button>
                            )}
                        </div>

                        {!selectedTrackForHidingSpots ? (
                            <div>
                                <p className="text-sm text-gray-600 mb-2">
                                    Välj ett spår för att hantera gömställen
                                </p>
                                <div className="space-y-1 max-h-32 overflow-y-auto">
                                    {tracks.map(track => (
                                        <button
                                            key={track.id}
                                            onClick={() => {
                                                setSelectedTrackForHidingSpots(track)
                                                if (track.track_type === 'human') {
                                                    loadHidingSpots(track.id)
                                                } else {
                                                    // För hundspår, behöver vi välja vilket människaspår det är baserat på
                                                    setHumanTrackForDog(null)
                                                }
                                            }}
                                            className="w-full text-left p-2 rounded border bg-white hover:bg-gray-50 text-sm"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span>{track.track_type === 'human' ? '🚶' : '🐕'}</span>
                                                <span className="font-medium">{track.name}</span>
                                            </div>
                                            <div className="text-xs text-gray-500">
                                                {track.positions?.length || 0} positioner
                                            </div>
                                        </button>
                                    ))}
                                    {tracks.length === 0 && (
                                        <p className="text-sm text-gray-500">Inga spår än</p>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div>
                                <div className="mb-2 p-2 bg-white rounded border">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span>{selectedTrackForHidingSpots.track_type === 'human' ? '🚶' : '🐕'}</span>
                                        <span className="font-medium text-sm">{selectedTrackForHidingSpots.name}</span>
                                    </div>
                                </div>

                                {selectedTrackForHidingSpots.track_type === 'dog' && !humanTrackForDog && (
                                    <div className="mb-3 p-2 bg-yellow-50 rounded border border-yellow-200">
                                        <p className="text-xs text-gray-700 mb-2">
                                            Välj vilket människaspår detta hundspår är baserat på:
                                        </p>
                                        <div className="space-y-1 max-h-24 overflow-y-auto">
                                            {tracks.filter(t => t.track_type === 'human').map(track => (
                                                <button
                                                    key={track.id}
                                                    onClick={() => {
                                                        setHumanTrackForDog(track)
                                                        loadHidingSpots(track.id)
                                                    }}
                                                    className="w-full text-left p-2 rounded border bg-white hover:bg-gray-50 text-xs"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <span>🚶</span>
                                                        <span className="font-medium">{track.name}</span>
                                                    </div>
                                                </button>
                                            ))}
                                            {tracks.filter(t => t.track_type === 'human').length === 0 && (
                                                <p className="text-xs text-gray-500">Inga människospår tillgängliga</p>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {selectedTrackForHidingSpots.track_type === 'human' && (
                                    <div className="mb-3">
                                        <button
                                            onClick={() => setIsAddingHidingSpot(!isAddingHidingSpot)}
                                            className={`w-full px-3 py-2 rounded font-medium text-sm ${isAddingHidingSpot
                                                ? 'bg-red-500 text-white'
                                                : 'bg-blue-500 text-white hover:bg-blue-600'
                                                }`}
                                        >
                                            {isAddingHidingSpot ? 'Avbryt' : '➕ Lägg till gömställe'}
                                        </button>
                                        {isAddingHidingSpot && (
                                            <p className="text-xs text-gray-600 mt-1">
                                                Klicka på kartan för att placera ett gömställe
                                            </p>
                                        )}
                                    </div>
                                )}

                                {selectedTrackForHidingSpots.track_type === 'dog' && humanTrackForDog && (
                                    <div className="mb-2 p-2 bg-blue-50 rounded border border-blue-200">
                                        <p className="text-xs text-gray-700">
                                            <strong>Människaspår:</strong> {humanTrackForDog.name}
                                        </p>
                                        <button
                                            onClick={() => setHumanTrackForDog(null)}
                                            className="text-xs text-blue-600 hover:text-blue-800 mt-1"
                                        >
                                            Välj annat spår
                                        </button>
                                    </div>
                                )}

                                {/* Lista över gömställen */}
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                    {hidingSpots.length === 0 ? (
                                        <p className="text-sm text-gray-500">Inga gömställen än</p>
                                    ) : (
                                        hidingSpots.map(spot => (
                                            <div
                                                key={spot.id}
                                                className={`p-2 rounded border text-sm ${spot.found === true
                                                    ? 'bg-green-50 border-green-200'
                                                    : spot.found === false
                                                        ? 'bg-red-50 border-red-200'
                                                        : 'bg-white'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span>
                                                        {spot.found === true
                                                            ? '✅'
                                                            : spot.found === false
                                                                ? '❌'
                                                                : '📦'}
                                                    </span>
                                                    <span className="font-medium flex-1">{spot.name}</span>
                                                </div>
                                                {spot.found !== null && (
                                                    <div className="text-xs text-gray-600">
                                                        {spot.found ? 'Hittade' : 'Hittade inte'}
                                                    </div>
                                                )}
                                                {selectedTrackForHidingSpots.track_type === 'dog' && humanTrackForDog && spot.found === null && (
                                                    <div className="flex gap-1 mt-2">
                                                        <button
                                                            onClick={() => updateHidingSpotStatus(spot.id, true)}
                                                            className="flex-1 px-2 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600"
                                                        >
                                                            ✅ Hittade
                                                        </button>
                                                        <button
                                                            onClick={() => updateHidingSpotStatus(spot.id, false)}
                                                            className="flex-1 px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                                                        >
                                                            ❌ Hittade inte
                                                        </button>
                                                    </div>
                                                )}
                                                {selectedTrackForHidingSpots.track_type === 'human' && (
                                                    <button
                                                        onClick={() => {
                                                            if (window.confirm('Ta bort detta gömställe?')) {
                                                                axios.delete(`${API_BASE}/tracks/${selectedTrackForHidingSpots.id}/hiding-spots/${spot.id}`)
                                                                    .then(() => {
                                                                        setHidingSpots(hidingSpots.filter(s => s.id !== spot.id))
                                                                        loadHidingSpots(selectedTrackForHidingSpots.id)
                                                                    })
                                                            }
                                                        }}
                                                        className="mt-1 text-xs text-red-500 hover:text-red-700"
                                                    >
                                                        Ta bort
                                                    </button>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>

                                {/* För hundspår: instruktioner */}
                                {selectedTrackForHidingSpots.track_type === 'dog' && humanTrackForDog && hidingSpots.length > 0 && (
                                    <div className="mt-3 p-2 bg-blue-50 rounded border border-blue-200">
                                        <p className="text-xs text-gray-600 mb-2">
                                            Klicka på gömställen på kartan eller i listan för att markera om hunden hittade dem
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

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
