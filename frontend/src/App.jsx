import React, { useState } from 'react'
import GeofenceEditor from './components/GeofenceEditor'
import TestLab from './components/TestLab'

function App() {
    const [activeView, setActiveView] = useState('app')

    const isAppView = activeView === 'app'

    return (
        <div className="h-screen flex flex-col">
            <header className="bg-blue-600 text-white px-4 py-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-bold">Dogtracks Geofence Kit</h1>
                        <p className="text-blue-100">
                            Hantera spår och testmiljö för GPS-annotering
                        </p>
                    </div>
                    <nav className="flex items-center gap-2 bg-blue-500/40 rounded-full px-2 py-1">
                        <button
                            onClick={() => setActiveView('app')}
                            className={`px-4 py-1.5 text-sm font-medium rounded-full transition ${isAppView ? 'bg-white text-blue-600 shadow' : 'text-white hover:bg-blue-500/60'
                                }`}
                        >
                            App-läge
                        </button>
                        <button
                            onClick={() => setActiveView('test')}
                            className={`px-4 py-1.5 text-sm font-medium rounded-full transition ${!isAppView ? 'bg-white text-blue-600 shadow' : 'text-white hover:bg-blue-500/60'
                                }`}
                        >
                            Testmiljö
                        </button>
                    </nav>
                </div>
            </header>
            <main className="flex-1">
                {isAppView ? <GeofenceEditor /> : <TestLab />}
            </main>
        </div>
    )
}

export default App


