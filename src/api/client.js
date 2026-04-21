async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(error.error || 'Request failed')
  }
  return response.json()
}

export function getBootstrap(uicId) {
  return request(`/api/bootstrap?uicId=${encodeURIComponent(uicId)}`)
}

export function runPrediction(payload) {
  return request('/api/predictions/run', { method: 'POST', body: JSON.stringify(payload) })
}

export function saveHumanAdjustment(predictionId, payload) {
  return request(`/api/predictions/${predictionId}/adjust`, { method: 'POST', body: JSON.stringify(payload) })
}

export function updateReorderPoints(predictionId) {
  return request(`/api/predictions/${predictionId}/update-reorder`, { method: 'POST', body: JSON.stringify({}) })
}

export function saveActualResults(payload) {
  return request('/api/results', { method: 'POST', body: JSON.stringify(payload) })
}

export function getMetricSummary(uicId) {
  return request(`/api/metrics/summary?uicId=${encodeURIComponent(uicId)}`)
}

export async function uploadImport(type, file, uicId) {
  const form = new FormData()
  form.append('file', file)
  form.append('uicId', uicId)
  const response = await fetch(`/api/imports/${type}`, { method: 'POST', body: form })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Upload failed' }))
    throw new Error(error.error || 'Upload failed')
  }
  return response.json()
}
