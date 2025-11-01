import React from 'react'
import GeofenceEditor from './components/GeofenceEditor'

function App() {
    return (
        <div className="h-screen flex flex-col">
            <header className="bg-blue-600 text-white p-4">
                <h1 className="text-2xl font-bold">Dogtracks Geofence Kit</h1>
                <p className="text-blue-100">Hantera geofences för hundspårning</p>
            </header>
            <main className="flex-1">
                <GeofenceEditor />
            </main>
        </div>
    )
}

export default App


