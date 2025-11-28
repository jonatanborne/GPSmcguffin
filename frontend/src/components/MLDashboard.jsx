import React, { useState, useEffect } from 'react'
import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/$/, '') : '/api'

const MLDashboard = () => {
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [analysisResults, setAnalysisResults] = useState(null)
    const [modelInfo, setModelInfo] = useState(null)
    const [error, setError] = useState(null)
    const [selectedTrack, setSelectedTrack] = useState(null)
    const [tracks, setTracks] = useState([])
    const [isApplyingCorrection, setIsApplyingCorrection] = useState(false)

    // Ladda spår
    useEffect(() => {
        loadTracks()
        loadModelInfo()
    }, [])

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
            const response = await axios.post(`${API_BASE}/ml/analyze`)
            setAnalysisResults(response.data)
            // Ladda om modellinfo efter analys
            await loadModelInfo()
        } catch (err) {
            setError(err.response?.data?.detail || err.message || 'Fel vid analys')
            console.error('Fel vid analys:', err)
        } finally {
            setIsAnalyzing(false)
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
            // Ladda om spår
            await loadTracks()
        } catch (err) {
            setError(err.response?.data?.detail || err.message || 'Fel vid korrigering')
            console.error('Fel vid korrigering:', err)
        } finally {
            setIsApplyingCorrection(false)
        }
    }

    return (
        <div className="h-full flex flex-col bg-gray-50">
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

                {/* ML-korrigering */}
                <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                    <h3 className="text-xl font-semibold text-gray-800 mb-4">Automatisk GPS-korrigering</h3>
                    <p className="text-gray-600 mb-4">
                        Använd den tränade ML-modellen för att automatiskt korrigera GPS-positioner i ett spår.
                    </p>
                    <div className="flex gap-4 items-end">
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Välj spår att korrigera
                            </label>
                            <select
                                value={selectedTrack || ''}
                                onChange={(e) => setSelectedTrack(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            >
                                <option value="">-- Välj spår --</option>
                                {tracks.map((track) => (
                                    <option key={track.id} value={track.id}>
                                        {track.name} ({track.track_type})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <button
                            onClick={() => applyMLCorrection(selectedTrack)}
                            disabled={!selectedTrack || isApplyingCorrection || !modelInfo}
                            className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
                        >
                            {isApplyingCorrection ? 'Korrigerar...' : '✨ Tillämpa ML-korrigering'}
                        </button>
                    </div>
                    {!modelInfo && (
                        <p className="text-sm text-amber-600 mt-2">
                            ⚠️ Ingen modell tränad ännu. Kör ML-analys först.
                        </p>
                    )}
                </div>

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

