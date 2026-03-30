/**
 * GET /tracks ska returnera en JSON-array. Om VITE_API_URL saknas vid frontend-build
 * kan anropet träffa statisk host och få index.html tillbaka — då blir listan tom utan throw.
 */
export function normalizeTracksListResponse(data, response) {
    if (Array.isArray(data)) {
        return { tracks: data, invalid: false, message: null }
    }

    const ct =
        (response?.headers &&
            (response.headers['content-type'] || response.headers['Content-Type'])) ||
        ''
    const ctLower = String(ct).toLowerCase()
    const looksHtml =
        typeof data === 'string' &&
        (data.trimStart().startsWith('<!') || data.trimStart().toLowerCase().startsWith('<html'))
    const message =
        looksHtml || ctLower.includes('text/html')
            ? 'Spårlistan kunde inte laddas: servern svarade med HTML istället för JSON (kontrollera att VITE_API_URL pekar på backend när frontend byggs).'
            : 'Spårlistan kunde inte laddas: oväntat svar (förväntade JSON-array från /tracks).'

    console.warn('[GET /tracks]', message, {
        contentType: ct || '(saknas)',
        dataType: typeof data,
        preview:
            typeof data === 'string' ? data.slice(0, 160).replace(/\s+/g, ' ') : data,
    })

    return { tracks: [], invalid: true, message }
}
